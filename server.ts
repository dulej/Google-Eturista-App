import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

// ─── Config ───────────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production';

// Test portal — change to production URL when going live
const ETURISTA_BASE_URL = isProd
  ? 'https://portal.eturista.gov.rs/eturistwebapi/api'
  : 'https://test.portal.eturista.gov.rs/eturistwebapi/api';

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database('eturista.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    action    TEXT, userId TEXT, details TEXT
  );
  CREATE TABLE IF NOT EXISTS error_logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message TEXT, stack TEXT, context TEXT
  );
  CREATE TABLE IF NOT EXISTS entry_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp         DATETIME DEFAULT CURRENT_TIMESTAMP,
    guestName         TEXT,
    documentNumber    TEXT,
    accommodationId   INTEGER,
    accommodationName TEXT
  );
  CREATE TABLE IF NOT EXISTS Gost (
    Id                                           INTEGER PRIMARY KEY AUTOINCREMENT,
    ExternalId                                   TEXT NOT NULL UNIQUE,
    Izmena                                       INTEGER NOT NULL CHECK (Izmena IN (0,1)),
    DaLiJeLiceDomace                             INTEGER NOT NULL CHECK (DaLiJeLiceDomace IN (0,1)),
    Ime                                          TEXT NOT NULL,
    Prezime                                      TEXT NOT NULL,
    DatumRodjenja                                TEXT NOT NULL,
    PolSifra                                     TEXT NOT NULL CHECK (PolSifra IN ('M','Z')),
    Jmbg                                         TEXT CHECK (length(Jmbg) = 13 OR Jmbg IS NULL),
    DrzavaRodjenjaAlfa3                          TEXT,
    DrzavljanstvoAlfa3                           TEXT,
    OpstinaPrebivalistaMaticniBroj               INTEGER,
    OpstinaPrebivalistaNaziv                     TEXT,
    MestoPrebivalistaMaticniBroj                 INTEGER,
    MestoPrebivalistaNaziv                       TEXT,
    DrzavaPrebivalistaAlfa3                      TEXT,
    MestoRodjenjaNaziv                           TEXT,
    VrstaPutneIspraveSifra                       TEXT,
    BrojPutneIsprave                             TEXT,
    DatumUlaskaURepublikuSrbiju                  TEXT,
    MestoUlaskaURepublikuSrbijuSifra             TEXT,
    VrstaPruzenihUslugaSifra                     TEXT,
    NacinDolaskaSifra                            TEXT,
    RazlogBoravkaSifra                           TEXT,
    DatumICasDolaska                             TEXT,
    PlaniraniDatumOdlaska                        TEXT,
    UgostiteljskiObjekatJedinstveniIdentifikator INTEGER,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Cleanup (deferred, non-blocking) ────────────────────────────────────────

function cleanupOldRecords() {
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d31 = new Date(); d31.setDate(d31.getDate() - 31);
  db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(d30.toISOString());
  db.prepare('DELETE FROM error_logs WHERE timestamp < ?').run(d30.toISOString());
  db.prepare('DELETE FROM entry_logs WHERE timestamp < ?').run(d30.toISOString());
  try {
    const r = db.prepare('DELETE FROM Gost WHERE CreatedAt < ?').run(d31.toISOString());
    if (r.changes > 0) console.log(`Cleanup: removed ${r.changes} guest records.`);
  } catch (e) { console.error('Cleanup Gost error:', e); }
}
setImmediate(cleanupOldRecords);
setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000);

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = {
  audit(action: string, userId: string | number | null, details: string) {
    try { db.prepare('INSERT INTO audit_logs (action, userId, details) VALUES (?,?,?)').run(action, String(userId ?? 'system'), details); }
    catch (e) { console.error('audit:', e); }
  },
  error(message: string, stack = '', context = '') {
    try { db.prepare('INSERT INTO error_logs (message, stack, context) VALUES (?,?,?)').run(message, stack, context); }
    catch (e) { console.error('error log:', e); }
  },
  entry(guestName: string, documentNumber: string, accommodationId: number, accommodationName: string) {
    try { db.prepare('INSERT INTO entry_logs (guestName, documentNumber, accommodationId, accommodationName) VALUES (?,?,?,?)').run(guestName, documentNumber, accommodationId, accommodationName); }
    catch (e) { console.error('entry log:', e); }
  },
};

// ─── Auth guard ───────────────────────────────────────────────────────────────

const requireToken = (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// ─── eTurista response parser ─────────────────────────────────────────────────
// Their API sometimes double-encodes JSON — we unwrap one extra layer only.

function parseResponse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    const once = JSON.parse(raw);
    if (typeof once === 'string') { try { return JSON.parse(once); } catch { return once; } }
    return once;
  } catch { return raw; }
}

function toArray(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const c = d.result ?? d.Data ?? d.data;
    if (Array.isArray(c)) return c;
  }
  return [];
}

// ─── JMBG mod-11 check ───────────────────────────────────────────────────────

function validateJmbgMod11(jmbg: string): boolean {
  const d = jmbg.split('').map(Number);
  const sum = 7*(d[0]+d[6]) + 6*(d[1]+d[7]) + 5*(d[2]+d[8]) + 4*(d[3]+d[9]) + 3*(d[4]+d[10]) + 2*(d[5]+d[11]);
  const k = 11 - (sum % 11);
  const ctrl = k > 9 ? 0 : k;
  return ctrl === d[12];
}

// ─── Field validation (spec v4.9) ─────────────────────────────────────────────

function validateGuest(guest: any): string[] {
  const errors: string[] = [];
  const isDomestic = guest.isDomestic === true || guest.isDomestic === 'true';
  const nameRegex  = /^[\p{L}\-\s]+$/u;  // letters + hyphen only

  if (!guest.firstName?.trim())  errors.push('Ime je obavezno.');
  else if (!nameRegex.test(guest.firstName.trim())) errors.push('Ime može sadržati samo slova i karakter "-".');
  if (!guest.lastName?.trim())   errors.push('Prezime je obavezno.');
  else if (!nameRegex.test(guest.lastName.trim()))  errors.push('Prezime može sadržati samo slova i karakter "-".');
  if (!guest.dateOfBirth)        errors.push('Datum rođenja je obavezan.');
  if (!guest.gender)             errors.push('Pol je obavezan.');
  if (!guest.arrivalDate)        errors.push('Datum i čas dolaska su obavezni.');
  if (!guest.plannedDepartureDate && !guest.departureDate) errors.push('Planirani datum odlaska je obavezan.');
  if (guest.stayReason === undefined || guest.stayReason === null || guest.stayReason === '') errors.push('Razlog boravka je obavezan.');
  if (!guest.serviceType)        errors.push('Vrsta pruženih usluga je obavezna.');
  if (!guest.arrivalMode)        errors.push('Način dolaska je obavezan.');
  if (!guest.countryOfBirth)     errors.push('Država rođenja je obavezna.');

  if (guest.dateOfBirth && new Date(guest.dateOfBirth) > new Date())
    errors.push('Datum rođenja ne može biti u budućnosti.');

  if (guest.arrivalDate) {
    const arr = new Date(`${guest.arrivalDate}T${guest.arrivalTime || '12:00'}`);
    if (arr > new Date()) errors.push('Datum dolaska ne može biti u budućnosti.');
  }

  const depDate = guest.plannedDepartureDate || guest.departureDate;
  if (guest.arrivalDate && depDate && new Date(depDate) < new Date(guest.arrivalDate))
    errors.push('Planirani datum odlaska ne može biti pre datuma dolaska.');

  if (isDomestic) {
    if (guest.jmbg) {
      if (!/^\d{13}$/.test(guest.jmbg)) errors.push('JMBG mora sadržati tačno 13 cifara bez slova.');
      else if (!validateJmbgMod11(guest.jmbg)) errors.push('JMBG nije u ispravnom formatu (greška u kontrolnoj cifri).');
    }
  } else {
    // Foreign guest
    if (!guest.nationality)       errors.push('Državljanstvo je obavezno za stranog državljanina.');
    if (!guest.documentNumber)    errors.push('Broj putne isprave je obavezan za stranog državljanina.');
    if (!guest.documentIssueDate) errors.push('Datum izdavanja putne isprave je obavezan.');
    if (!guest.entryDateToSerbia) errors.push('Datum ulaska u Srbiju je obavezan.');
    if (!guest.entryPlaceToSerbia)errors.push('Mesto ulaska u Srbiju je obavezno (šifra).');
    if (guest.arrivalMode === '5') errors.push('Vrednost 5 za način dolaska nije dozvoljena za strane državljane.');
    // Issue date must be before entry date
    if (guest.documentIssueDate && guest.entryDateToSerbia && new Date(guest.documentIssueDate) > new Date(guest.entryDateToSerbia))
      errors.push('Datum izdavanja putne isprave mora biti pre datuma ulaska u Srbiju.');
  }

  // Agency name required for arrival mode 2 or 4
  if ((guest.arrivalMode === '2' || guest.arrivalMode === '4') && !guest.agencyName?.trim())
    errors.push('Naziv agencije je obavezan kada je način dolaska putem turističke agencije (2 ili 4).');

  return errors;
}

// ─── eTurista payload builder ─────────────────────────────────────────────────
// Builds the exact JSON structure required by the API per spec v4.9

function buildPayload(guest: any, accommodationId: number): object {
  const isDomestic = guest.isDomestic === true || guest.isDomestic === 'true';
  const isBornAbroad = !isDomestic;
  const polSifra   = ['Ženski', 'Z', 'Female', 'female'].includes(guest.gender) ? 'Z' : 'M';
  const depDate    = guest.plannedDepartureDate || guest.departureDate || '';

  // ── OsnovniPodaci ──────────────────────────────────────────────────────────
  const osnovniPodaci: Record<string, any> = {
    ExternalId:                    `EXT-${randomUUID()}`,
    Izmena:                        'false',
    DaLiJeLiceDomace:              isDomestic  ? 'true' : 'false',
    DaLiJeLiceRodjenoUInostranstvu: isBornAbroad ? 'true' : 'false',
    Ime:                           guest.firstName,
    Prezime:                       guest.lastName,
    DatumRodjenja:                 guest.dateOfBirth,   // yyyy-MM-dd
    PolSifra:                      polSifra,
  };

  if (isDomestic) {
    if (guest.jmbg) osnovniPodaci.Jmbg = guest.jmbg;
    // Use only Alfa3 — never send both Alfa2 and Alfa3
    osnovniPodaci.DrzavaRodjenjaAlfa3  = guest.countryOfBirth || 'SRB';
    // Residence data (only when residing in Serbia)
    const residesInSerbia = !guest.residenceCountry || guest.residenceCountry === 'SRB';
    if (residesInSerbia) {
      if (guest.municipalityOfResidence) {
        osnovniPodaci.OpstinaPrebivalistaMaticniBroj = guest.municipalityOfResidence;
        const row = db.prepare('SELECT Naziv FROM Opstine WHERE "Maticni Broj" = ?').get(guest.municipalityOfResidence) as any;
        osnovniPodaci.OpstinaPrebivalistaNaziv = guest.municipalityOfResidenceName || row?.Naziv || '';
      }
      if (guest.placeOfResidence) {
        osnovniPodaci.MestoPrebivalistaMaticniBroj = guest.placeOfResidence;
        const row = db.prepare('SELECT "Naziv Mesta" FROM Mesta WHERE "Maticni Broj Mesta" = ?').get(guest.placeOfResidence) as any;
        osnovniPodaci.MestoPrebivalistaNaziv = guest.placeOfResidenceName || row?.['Naziv Mesta'] || '';
      }
    } else {
      if (guest.placeOfResidenceName) osnovniPodaci.MestoPrebivalistaNaziv = guest.placeOfResidenceName;
    }
    osnovniPodaci.DrzavaPrebivalistaAlfa3 = guest.residenceCountry || 'SRB';
  } else {
    // Foreign — use Alfa3 only (not both)
    if (guest.countryOfBirth)    osnovniPodaci.DrzavaRodjenjaAlfa3  = guest.countryOfBirth;
    if (guest.nationality)       osnovniPodaci.DrzavljanstvoAlfa3   = guest.nationality;
    if (guest.placeOfBirth)      osnovniPodaci.MestoRodjenjaNaziv   = guest.placeOfBirth;
  }

  // ── IdentifikacioniDokumentStranogLica (foreign only) ─────────────────────
  let identDoc: Record<string, any> | undefined;
  if (!isDomestic) {
    identDoc = {
      VrstaPutneIspraveSifra:                       guest.documentTypeCode || '72', // 72 = pasoš
      BrojPutneIsprave:                             guest.documentNumber   || '',
      DatumIzdavanjaPutneIsprave:                   guest.documentIssueDate || '',
      VrstaVizeSifra:                               '',
      BrojVize:                                     '',
      MestoIzdavanjaVize:                           '',
      DatumUlaskaURepublikuSrbiju:                  guest.entryDateToSerbia || '',
      MestoUlaskaURepublikuSrbijuSifra:             String(guest.entryPlaceToSerbia || ''),
      MestoUlaskaURepublikuSrbiju:                  guest.entryPlaceToSerbiaName || '',
      DatumDoKadaJeOdobrenBoravakURepubliciSrbiji:  '',
      Napomena:                                     '',
      OrganIzdavanjaPutneIsprave:                   '',
    };
  }

  // ── PodaciOBoravku ─────────────────────────────────────────────────────────
  const nacinDolaska = String(guest.arrivalMode || '1');
  const podaciOBoravku: Record<string, any> = {
    UgostiteljskiObjekatJedinstveniIdentifikator: Number(accommodationId),
    VrstaPruzenihUslugaSifra:                     String(guest.serviceType || '1'),
    NacinDolaskaSifra:                            nacinDolaska,
    DatumICasDolaska:                             `${guest.arrivalDate} ${guest.arrivalTime || '12:00'}`,
    UslovZaUmanjenjeBoravisneTakseSifra:          '',
    RazlogBoravkaSifra:                           String(guest.stayReason ?? '0'),
    PlaniraniDatumOdlaska:                        depDate,
  };

  if (nacinDolaska === '2' || nacinDolaska === '4') {
    podaciOBoravku.NazivAgencije = guest.agencyName || '';
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
  const payload: Record<string, any> = { OsnovniPodaci: osnovniPodaci };
  if (identDoc) payload.IdentifikacioniDokumentStranogLica = identDoc;
  payload.PodaciOBoravku = podaciOBoravku;

  return payload;
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app  = express();
  const PORT = 3000;

  app.use(cors({ origin: isProd ? process.env.ALLOWED_ORIGIN ?? false : true, credentials: true }));
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', env: isProd ? 'production' : 'test', api: ETURISTA_BASE_URL, time: new Date().toISOString() })
  );

  // ── Login (rate limited: 10 attempts / 15 min / IP) ───────────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.' },
  });

  app.post('/api/eturista/login', loginLimiter, async (req, res) => {
    const parsed = z.object({ username: z.string().min(1), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Korisničko ime i lozinka su obavezni.' });
    const { username, password } = parsed.data;

    try {
      const r = await fetch(`${ETURISTA_BASE_URL}/Autentifikacija/PrijavaKorisnickoImeLozinka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ korisnickoIme: username, lozinka: password }),
      });

      if (!r.ok) return res.status(r.status).json({ error: 'Neispravni podaci za prijavu.' });

      const data = parseResponse(await r.json()) as Record<string, any>;
      const token = data.token ?? data.Token ?? data.access_token ?? data.result?.token ?? data.data?.token;
      const id    = data.id ?? data.Id ?? data.result?.id ?? data.korisnik?.id ?? data.data?.id;

      if (token && id != null) return res.json({ sessionToken: String(token), userId: Number(id) });

      logger.error('LOGIN_BAD_FORMAT', '', `User ${username}`);
      res.status(500).json({ error: 'Neočekivan format odgovora eTurista servisa.' });
    } catch (err: any) {
      logger.error('LOGIN_EXCEPTION', err.stack, err.message);
      res.status(500).json({ error: 'Prijava nije uspela.', details: err.message });
    }
  });

  // ── Accommodations ────────────────────────────────────────────────────────
  app.get('/api/eturista/accommodations', requireToken, async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId je obavezan.' });
    try {
      const r = await fetch(
        `${ETURISTA_BASE_URL}/UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId?ugostiteljId=${userId}`,
        { headers: { Authorization: req.headers.authorization!, Accept: 'application/json' } },
      );
      if (!r.ok) throw new Error(`eTurista ${r.status}`);
      const items = toArray(parseResponse(await r.json()));
      res.json(items.map((item: any) => ({
        id:      item.id      ?? item.Id,
        name:    item.naziv   ?? item.Naziv,
        address: item.adresa  ?? item.Adresa,
        type:    item.vrstaObjekta ?? item.VrstaObjekta,
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Nije moguće dohvatiti smeštajne objekte.', details: err.message });
    }
  });

  // ── Register guest ────────────────────────────────────────────────────────
  app.post('/api/eturista/register', requireToken, async (req, res) => {
    const { guest, accommodationId } = req.body;
    if (!guest || !accommodationId)
      return res.status(400).json({ error: 'Podaci gosta i ID objekta su obavezni.' });

    // Validate before sending
    const errors = validateGuest(guest);
    if (errors.length > 0)
      return res.status(422).json({ error: 'Validacija nije prošla.', details: errors });

    // Build correct payload
    const payload = buildPayload(guest, Number(accommodationId));
    console.log('\n[eTurista] → Payload:\n', JSON.stringify(payload, null, 2));

    // Save to local DB (non-blocking — does not block the API call)
    try {
      const isDomestic = guest.isDomestic === true || guest.isDomestic === 'true';
      const polSifra   = ['Ženski','Z','Female','female'].includes(guest.gender) ? 'Z' : 'M';
      const now        = new Date().toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO Gost (
          ExternalId, Izmena, DaLiJeLiceDomace, Ime, Prezime, DatumRodjenja, PolSifra, Jmbg,
          DrzavaRodjenjaAlfa3, DrzavljanstvoAlfa3,
          OpstinaPrebivalistaMaticniBroj, MestoPrebivalistaMaticniBroj, DrzavaPrebivalistaAlfa3,
          MestoRodjenjaNaziv, VrstaPutneIspraveSifra, BrojPutneIsprave,
          DatumUlaskaURepublikuSrbiju, MestoUlaskaURepublikuSrbijuSifra,
          VrstaPruzenihUslugaSifra, NacinDolaskaSifra, RazlogBoravkaSifra,
          DatumICasDolaska, PlaniraniDatumOdlaska,
          UgostiteljskiObjekatJedinstveniIdentifikator, CreatedAt, UpdatedAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        `EXT-${randomUUID()}`, 0, isDomestic ? 1 : 0,
        guest.firstName, guest.lastName, guest.dateOfBirth, polSifra,
        guest.jmbg || null,
        guest.countryOfBirth  || 'SRB', guest.nationality  || null,
        guest.municipalityOfResidence || null, guest.placeOfResidence || null,
        guest.residenceCountry || 'SRB', guest.placeOfBirth || null,
        guest.documentTypeCode || null, guest.documentNumber || null,
        guest.entryDateToSerbia || null, guest.entryPlaceToSerbia || null,
        guest.serviceType || '1', guest.arrivalMode || '1', guest.stayReason ?? '0',
        `${guest.arrivalDate} ${guest.arrivalTime || '12:00'}`,
        guest.plannedDepartureDate || guest.departureDate || null,
        Number(accommodationId), now, now,
      );
    } catch (dbErr: any) {
      console.error('Local DB insert failed (non-fatal):', dbErr.message);
    }

    // POST to eTurista
    try {
      const r = await fetch(`${ETURISTA_BASE_URL}/Prijava/PrijaviKorisnikaUslugaSmestaja`, {
        method: 'POST',
        headers: {
          Authorization:  req.headers.authorization!,
          'Content-Type': 'application/json',
          Accept:         'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await r.text();
      console.log(`[eTurista] ← Status: ${r.status}`);
      console.log(`[eTurista] ← Body: ${responseText}\n`);

      if (!r.ok) {
        logger.error('REGISTRATION_FAILED', '', `${guest.firstName} ${guest.lastName}: ${responseText}`);
        return res.status(r.status).json({ error: responseText });
      }

      logger.audit('REGISTRATION_SUCCESS', null,
        `Gost ${guest.firstName} ${guest.lastName} registrovan u objekat ${accommodationId}`);
      logger.entry(`${guest.firstName} ${guest.lastName}`, guest.documentNumber ?? '', Number(accommodationId), '');

      res.json({ success: true, response: responseText });
    } catch (err: any) {
      logger.error('REGISTRATION_EXCEPTION', err.stack, err.message);
      res.status(500).json({ error: 'Registracija nije uspela.', details: err.message });
    }
  });

  // ── Static reference data from local DB ──────────────────────────────────
  const dbRouter = express.Router();
  dbRouter.use(requireToken);
  dbRouter.get('/countries',      (_r, s) => safeQuery(s, 'SELECT * FROM Drzava ORDER BY Cirlica ASC'));
  dbRouter.get('/municipalities', (_r, s) => safeQuery(s, 'SELECT * FROM Opstine ORDER BY Naziv ASC'));
  dbRouter.get('/places/:id',     (req, res) => {
    try { res.json(db.prepare('SELECT * FROM Mesta WHERE "Maticni Broj Opstine" = ? ORDER BY "Naziv Mesta" ASC').all(req.params.id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  dbRouter.get('/service-types',  (_r, s) => safeQuery(s, 'SELECT * FROM "Vrsta Pruzenih Usluga" ORDER BY Naziv ASC'));
  dbRouter.get('/arrival-modes',  (_r, s) => safeQuery(s, 'SELECT * FROM "Nacin Dolaska" ORDER BY Naziv ASC'));
  dbRouter.get('/stay-reasons',   (_r, s) => safeQuery(s, 'SELECT * FROM "Razlog Boravka" ORDER BY Naziv ASC'));
  dbRouter.get('/entry-places',   (_r, s) => safeQuery(s, 'SELECT * FROM "Mesto Ulaska U Republiku Srbiju" ORDER BY Naziv ASC'));
  dbRouter.get('/doc-types',      (_r, s) => safeQuery(s, 'SELECT * FROM "Vrsta Putne Isprave" ORDER BY Naziv ASC'));

  // DB explorer — dev only
  if (!isProd) {
    dbRouter.get('/tables', (_r, res) => {
      try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
        res.json(tables.map(t => { const row = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any; return { name: t.name, count: row.count }; }));
      } catch (e: any) { res.status(500).json({ error: e.message }); }
    });
    dbRouter.get('/data/:table', (req, res) => {
      const { table } = req.params;
      if (!/^[a-zA-Z0-9_ ]+$/.test(table)) return res.status(400).json({ error: 'Invalid table name' });
      try { res.json(db.prepare(`SELECT * FROM "${table}"`).all()); }
      catch (e: any) { res.status(500).json({ error: e.message }); }
    });
  }

  app.use('/api/db', dbRouter);

  // ── Log endpoints ─────────────────────────────────────────────────────────
  const logRouter = express.Router();
  logRouter.use(requireToken);
  logRouter.get('/entries',  (_r, res) => { try { res.json(db.prepare('SELECT * FROM entry_logs ORDER BY timestamp DESC').all()); } catch (e: any) { res.status(500).json({ error: e.message }); } });
  logRouter.post('/entry',   (req, res) => { const { guestName, documentNumber, accommodationId, accommodationName } = req.body; logger.entry(guestName, documentNumber, accommodationId, accommodationName); res.status(201).json({ success: true }); });
  logRouter.post('/audit',   (req, res) => { const { action, userId, details } = req.body; logger.audit(action, userId, details); res.status(201).json({ success: true }); });
  logRouter.post('/error',   (req, res) => { const { message, stack, context } = req.body; logger.error(message, stack, context); res.status(201).json({ success: true }); });
  app.use('/api/logs', logRouter);

  // ── Vite / static ─────────────────────────────────────────────────────────
  if (!isProd) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_r, res) => res.sendFile('dist/index.html', { root: '.' }));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀  Server → http://0.0.0.0:${PORT}  [${isProd ? 'PRODUCTION' : 'TEST'}]`);
    console.log(`📡  eTurista API → ${ETURISTA_BASE_URL}\n`);
  });
}

function safeQuery(res: Response, sql: string) {
  try { res.json(db.prepare(sql).all()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

startServer().catch(err => { console.error('Server failed to start:', err); process.exit(1); });
