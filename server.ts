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

// eTurista Environments
const ETURISTA_TEST_URL = 'https://test.portal.eturista.gov.rs/eturistwebapi/api';
const ETURISTA_PROD_URL = 'https://www.portal.eturista.gov.rs/eturistwebapi/api';

function getEturistaUrl(req: Request): string {
  const env = req.header('X-Environment');
  return env === 'prod' ? ETURISTA_PROD_URL : ETURISTA_TEST_URL;
}

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database('eturista.db');

// Basic tables that should always exist
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
`);

// Migration and schema enforcement
try {
  // Ensure entry_logs has the correct columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS entry_logs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp         DATETIME DEFAULT CURRENT_TIMESTAMP,
      guestName         TEXT,
      documentNumber    TEXT,
      accommodationId   INTEGER,
      accommodationName TEXT
    );
  `);

  // Check if guestName exists, add it if not
  const columns = db.prepare("PRAGMA table_info(entry_logs)").all() as any[];
  if (!columns.some(c => c.name === 'guestName')) {
    db.exec("ALTER TABLE entry_logs ADD COLUMN guestName TEXT");
  }
} catch (e) {
  console.error('[DB Migration] entry_logs error:', e);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Opstine (
      Id INTEGER PRIMARY KEY, "Maticni Broj" INTEGER UNIQUE, Naziv TEXT
    );
    CREATE TABLE IF NOT EXISTS Mesta (
      Id INTEGER PRIMARY KEY, "Maticni Broj Mesta" INTEGER UNIQUE, "Naziv Mesta" TEXT, "Maticni Broj Opstine" INTEGER
    );
    CREATE TABLE IF NOT EXISTS Drzava (
      Id INTEGER PRIMARY KEY, Naziv TEXT, Cirlica TEXT, Alfa2 TEXT, Alfa3 TEXT
    );
    CREATE TABLE IF NOT EXISTS "Vrsta Putne Isprave" (Id INTEGER PRIMARY KEY, Naziv TEXT);
    CREATE TABLE IF NOT EXISTS "Mesto Ulaska U Republiku Srbiju" (Id INTEGER PRIMARY KEY, Naziv TEXT);
    CREATE TABLE IF NOT EXISTS "Nacin Dolaska" (Id INTEGER PRIMARY KEY, Naziv TEXT);
    CREATE TABLE IF NOT EXISTS "Vrsta Pruzenih Usluga" (Id INTEGER PRIMARY KEY, Naziv TEXT);
    CREATE TABLE IF NOT EXISTS "Razlog Boravka" (Id INTEGER PRIMARY KEY, Naziv TEXT);

    -- Using Gost_v4 to avoid foreign key mismatch issues
    CREATE TABLE IF NOT EXISTS Gost_v4 (
      Id                                           INTEGER PRIMARY KEY AUTOINCREMENT,
      ExternalId                                   TEXT NOT NULL UNIQUE,
      InternalId                                   TEXT,
      Izmena                                       INTEGER NOT NULL DEFAULT 0,
      DaLiJeLiceDomace                             INTEGER NOT NULL DEFAULT 1,
      Ime                                          TEXT NOT NULL,
      Prezime                                      TEXT NOT NULL,
      DatumRodjenja                                TEXT NOT NULL,
      PolSifra                                     TEXT NOT NULL,
      Jmbg                                         TEXT,
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
      DatumIzdavanjaPutneIsprave                   TEXT,
      DatumUlaskaURepublikuSrbiju                  TEXT,
      MestoUlaskaURepublikuSrbijuSifra             TEXT,
      MestoUlaskaURepublikuSrbiju                  TEXT,
      VrstaPruzenihUslugaSifra                     TEXT,
      NacinDolaskaSifra                            TEXT,
      NazivAgencije                                TEXT,
      RazlogBoravkaSifra                           TEXT,
      DatumICasDolaska                             TEXT,
      PlaniraniDatumOdlaska                        TEXT,
      UgostiteljskiObjekatJedinstveniIdentifikator TEXT,
      CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch (e) {
  console.error('[DB Migration] Core tables error:', e);
}


// ─── Seed Data (if empty) ─────────────────────────────────────────────────────

function seedData() {
  try {
    const opstineCount = db.prepare('SELECT count(*) as count FROM Opstine').get() as any;
    if (opstineCount && opstineCount.count === 0) {
      console.log('Seeding small sample of Opstine and Drzava (recreate your backup for more)...');
      db.prepare('INSERT INTO Drzava (Naziv, Cirlica, Alfa2, Alfa3) VALUES (?,?,?,?)').run('Srbija', 'Србија', 'RS', 'SRB');
      db.prepare('INSERT INTO Drzava (Naziv, Cirlica, Alfa2, Alfa3) VALUES (?,?,?,?)').run('Nemačka', 'Немачка', 'DE', 'DEU');
      db.prepare('INSERT INTO Drzava (Naziv, Cirlica, Alfa2, Alfa3) VALUES (?,?,?,?)').run('Austrija', 'Аустрија', 'AT', 'AUT');
      
      db.prepare('INSERT INTO Opstine ("Maticni Broj", Naziv) VALUES (?,?)').run(70041, 'Vračar');
      db.prepare('INSERT INTO Opstine ("Maticni Broj", Naziv) VALUES (?,?)').run(70017, 'Stari Grad');
      db.prepare('INSERT INTO Opstine ("Maticni Broj", Naziv) VALUES (?,?)').run(70122, 'Novi Beograd');

      db.prepare('INSERT INTO Mesta ("Maticni Broj Mesta", "Naziv Mesta", "Maticni Broj Opstine") VALUES (?,?,?)').run(70041, 'Beograd-Vračar', 70041);
      db.prepare('INSERT INTO Mesta ("Maticni Broj Mesta", "Naziv Mesta", "Maticni Broj Opstine") VALUES (?,?,?)').run(70017, 'Beograd-Stari Grad', 70017);
      
      db.prepare('INSERT INTO "Razlog Boravka" (Id, Naziv) VALUES (?,?)').run(4, 'TURIZAM');
      db.prepare('INSERT INTO "Razlog Boravka" (Id, Naziv) VALUES (?,?)').run(1, 'ODMOR');
      db.prepare('INSERT INTO "Razlog Boravka" (Id, Naziv) VALUES (?,?)').run(5, 'POSLOVNO');

      db.prepare('INSERT INTO "Nacin Dolaska" (Id, Naziv) VALUES (?,?)').run(1, 'Individualno');
      db.prepare('INSERT INTO "Nacin Dolaska" (Id, Naziv) VALUES (?,?)').run(2, 'Agencija');

      db.prepare('INSERT INTO "Vrsta Pruzenih Usluga" (Id, Naziv) VALUES (?,?)').run(1, 'Smeštaj');
      
      db.prepare('INSERT INTO "Vrsta Putne Isprave" (Id, Naziv) VALUES (?,?)').run(72, 'Pasoš');
      db.prepare('INSERT INTO "Vrsta Putne Isprave" (Id, Naziv) VALUES (?,?)').run(10, 'Lična karta');
    }
  } catch (e) {
    console.error('[DB Seed] Seed failed:', e);
  }
}
seedData();

// ─── Cleanup (deferred, non-blocking) ────────────────────────────────────────

function cleanupOldRecords() {
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d31 = new Date(); d31.setDate(d31.getDate() - 31);
  db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(d30.toISOString());
  db.prepare('DELETE FROM error_logs WHERE timestamp < ?').run(d30.toISOString());
  db.prepare('DELETE FROM entry_logs WHERE timestamp < ?').run(d30.toISOString());
  try {
    const r = db.prepare('DELETE FROM Gost_v4 WHERE CreatedAt < ?').run(d31.toISOString());
    if (r.changes > 0) console.log(`Cleanup: removed ${r.changes} guest records.`);
  } catch (e) {
    try { db.prepare('DELETE FROM Gost WHERE CreatedAt < ?').run(d31.toISOString()); } catch(e2) {}
  }
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
    const c = d.result ?? d.Data ?? d.data ?? d.stavke ?? d.Stavke ?? d.items ?? d.Items;
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
    if (guest.documentIssueDate && guest.entryDateToSerbia && new Date(guest.documentIssueDate) > new Date(guest.entryDateToSerbia))
      errors.push('Datum izdavanja putne isprave mora biti pre datuma ulaska u Srbiju.');
  }

  if ((guest.arrivalMode === '2' || guest.arrivalMode === '4') && !guest.agencyName?.trim())
    errors.push('Naziv agencije je obavezan kada je način dolaska putem turističke agencije (2 ili 4).');

  return errors;
}

// ─── eTurista payload builder ─────────────────────────────────────────────────

function buildPayload(guest: any, accommodationId: string | number): object {
  const isDomestic = guest.isDomestic === true || guest.isDomestic === 'true';
  const isBornAbroad = !isDomestic;
  const polSifra   = ['Ženski', 'Z', 'Female', 'female'].includes(guest.gender) ? 'Z' : 'M';
  const depDate    = guest.plannedDepartureDate || guest.departureDate || '';

  const osnovniPodaci: Record<string, any> = {
    ExternalId:                    `EXT-${randomUUID()}`,
    Izmena:                        "false",
    DaLiJeLiceDomace:              isDomestic ? "true" : "false",
    DaLiJeLiceRodjenoUInostranstvu: isBornAbroad ? "true" : "false",
    Ime:                           guest.firstName,
    Prezime:                       guest.lastName,
    DatumRodjenja:                 guest.dateOfBirth,
    PolSifra:                      polSifra,
    DrzavaRodjenjaAlfa2:           '',
    DrzavaRodjenjaAlfa3:           guest.countryOfBirth || 'SRB',
    DrzavljanstvoAlfa2:            '',
    DrzavljanstvoAlfa3:            '',
    DrzavaPrebivalistaAlfa2:       '',
    DrzavaPrebivalistaAlfa3:       guest.residenceCountry || 'SRB'
  };

  if (isDomestic) {
    if (guest.jmbg) osnovniPodaci.Jmbg = guest.jmbg;
    osnovniPodaci.DrzavljanstvoAlfa3 = ''; 
    const residesInSerbia = !guest.residenceCountry || guest.residenceCountry === 'SRB';
    if (residesInSerbia) {
      if (guest.municipalityOfResidence) {
        osnovniPodaci.OpstinaPrebivalistaMaticniBroj = String(guest.municipalityOfResidence);
        const row = db.prepare('SELECT Naziv FROM Opstine WHERE "Maticni Broj" = ?').get(guest.municipalityOfResidence) as any;
        osnovniPodaci.OpstinaPrebivalistaNaziv = guest.municipalityOfResidenceName || row?.Naziv || '';
      }
      if (guest.placeOfResidence) {
        osnovniPodaci.MestoPrebivalistaMaticniBroj = String(guest.placeOfResidence);
        const row = db.prepare('SELECT "Naziv Mesta" FROM Mesta WHERE "Maticni Broj Mesta" = ?').get(guest.placeOfResidence) as any;
        osnovniPodaci.MestoPrebivalistaNaziv = guest.placeOfResidenceName || row?.["Naziv Mesta"] || '';
      }
    }
  } else {
    if (guest.nationality)       osnovniPodaci.DrzavljanstvoAlfa3   = guest.nationality;
    if (guest.placeOfBirth)      osnovniPodaci.MestoRodjenjaNaziv   = guest.placeOfBirth;
  }

  let identDoc: Record<string, any> | undefined;
  if (!isDomestic) {
    identDoc = {
      VrstaPutneIspraveSifra:                       guest.documentTypeCode || '72',
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

  const nacinDolaska = String(guest.arrivalMode || '1');
  const podaciOBoravku: Record<string, any> = {
    UgostiteljskiObjekatJedinstveniIdentifikator: String(accommodationId),
    VrstaPruzenihUslugaSifra:                     String(guest.serviceType || '1'),
    NacinDolaskaSifra:                            nacinDolaska,
    DatumICasDolaska:                             `${guest.arrivalDate} ${guest.arrivalTime || '12:00'}`,
    UslovZaUmanjenjeBoravisneTakseSifra:          '',
    RazlogBoravkaSifra:                           String(guest.stayReason ?? '0'),
    PlaniraniDatumOdlaska:                        depDate
  };

  if (nacinDolaska === '2' || nacinDolaska === '4') {
    podaciOBoravku.NazivAgencije = guest.agencyName || '';
  }

  const payload: Record<string, any> = { 
    OsnovniPodaci: osnovniPodaci,
    PodaciOBoravku: podaciOBoravku
  };
  
  if (identDoc) {
    payload.IdentifikacioniDokumentStranogLica = identDoc;
  }
  
  return payload;
}

// ─── Server ───────────────────────────────────────────────────────────────────

// Cache for debugging
let lastRawAccommodations: any = null;

async function startServer() {
  const app  = express();
  app.set('trust proxy', 1);
  const PORT = 3000;

  app.use(cors({ origin: isProd ? process.env.ALLOWED_ORIGIN ?? false : true, credentials: true }));
  app.use(express.json({ limit: '50mb' }));

  // Debug endpoint
  app.get('/api/eturista/debug-raw-objects', (req, res) => {
    res.json(lastRawAccommodations || { message: "No data fetched yet. Please use the app first." });
  });

  // Health check
  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', env: isProd ? 'production' : 'test', api: getEturistaUrl(req), time: new Date().toISOString() })
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
      const etBase = getEturistaUrl(req);
      const r = await fetch(`${etBase}/Autentifikacija/PrijavaKorisnickoImeLozinka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ korisnickoIme: username, lozinka: password }),
      });

      const responseBody = await r.json();
      console.log(`[eTurista] Login response status: ${r.status}`);
      
      const data = parseResponse(responseBody) as Record<string, any>;
      console.log(`[eTurista] Login response data keys:`, Object.keys(data));

      if (!r.ok) {
        console.error(`[eTurista] Login error details:`, data);
        return res.status(r.status).json({ error: 'Neispravni podaci za prijavu.' });
      }

      const token = data.token ?? data.Token ?? data.access_token ?? data.result?.token ?? data.data?.token ?? data.SessionToken;
      const id    = data.korisnikId ?? data.KorisnikId ?? data.id ?? data.Id ?? data.result?.id ?? data.korisnik?.id ?? data.data?.id;

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
      const authHeader = req.headers.authorization!;
      // Ensure Bearer prefix is present
      const bearerHeader = authHeader.toLowerCase().startsWith('bearer ') 
        ? authHeader 
        : `Bearer ${authHeader}`;

      console.log(`[eTurista] → Fetching accommodations for user ${userId}...`);
      
      const etBase = getEturistaUrl(req);
      const endpoint = `UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId?ugostiteljId=${userId}`;
      const r = await fetch(`${etBase}/${endpoint}`, { 
        headers: { Authorization: bearerHeader, Accept: 'application/json' } 
      });

      const responseText = await r.text();
      console.log(`[eTurista] ← Status: ${r.status}`);

      if (!r.ok) {
        console.error(`[eTurista] Error response: ${responseText}`);
        throw new Error(`eTurista status ${r.status}: ${responseText}`);
      }

      const rawData = JSON.parse(responseText);
      lastRawAccommodations = rawData;
      const items = toArray(parseResponse(rawData));

      const requestMetadata = {
        url: `${etBase}/${endpoint}`,
        method: 'GET',
        headers: { Authorization: 'Bearer [REDACTED]', Accept: 'application/json' }
      };

      console.log(`[eTurista] → Found ${items.length} objects. Mapping identifiers...`);
      
      const fullAccommodations = await Promise.all(items.map(async (item: any) => {
        const id = item.id ?? item.id_objekta ?? item.Id;
        
        let detailedItem = item;
        let jidValue: any = null;

        // Fetch details to find the correct JID (Registry ID)
        if (id) {
          try {
            console.log(`[eTurista] → Fetching full details for Object ${id} to find JID...`);
            
            // Primary detail endpoint (provides jedinstveniIdentifikatorObjekta)
            const vratiRes = await fetch(`${etBase}/UgostiteljskiObjekat/VratiUgostiteljskiObjekat/${id}`, {
              headers: { 'Authorization': bearerHeader }
            });
            
            if (vratiRes.ok) {
              const dJson = await vratiRes.json() as any;
              detailedItem = dJson.stavka || dJson.Stavka || dJson.data || dJson.Data || dJson;
            } else {
              // Fallback to Preuzmi
              const dRes = await fetch(`${etBase}/UgostiteljskiObjekat/Preuzmi?id=${id}`, {
                headers: { 'Authorization': bearerHeader }
              });
              if (dRes.ok) {
                const dJson = await dRes.json() as any;
                detailedItem = dJson.stavka || dJson.Stavka || dJson.data || dJson.Data || dJson;
              }
            }
          } catch (e) {
            console.warn(`[eTurista] → Detail fetch failed for ${id}:`, e);
          }
        }

        // Map JID (usually 8 digits)
        const possibleJidPaths = [
          detailedItem.jedinstveniIdentifikatorObjekta,
          detailedItem.JedinstveniIdentifikatorObjekta,
          detailedItem.ugostiteljskiObjekatJedinstveniIdentifikator,
          detailedItem.jedinstveniIdentifikator,
          detailedItem.identifikator,
          detailedItem.Identifikator,
          detailedItem.jid,
          detailedItem.Jid
        ];

        jidValue = possibleJidPaths.find(v => v !== undefined && v !== null && v !== '' && v !== 0);

        console.log(`[eTurista] → Mapping: "${detailedItem.naziv ?? detailedItem.Naziv}" | ID: ${id} | JID: ${jidValue || 'NOT FOUND'}`);
        
        const finalJid = (jidValue !== undefined && jidValue !== null && String(jidValue).toLowerCase() !== 'undefined' && jidValue !== 0 && String(jidValue).trim() !== '') 
          ? String(jidValue) 
          : String(id);

        const formatAddress = (addr: any): string => {
          if (!addr) return '';
          if (typeof addr === 'string') return addr;
          if (typeof addr === 'object') {
            const ulica = addr.ulicaNaziv || addr.ulicaIme || '';
            const broj = addr.brojIme || addr.broj || '';
            const mesto = addr.mestoIme || '';
            const bits = [];
            if (ulica) bits.push(ulica);
            if (broj) bits.push(broj);
            if (mesto) bits.push(mesto);
            return bits.join(' ');
          }
          return String(addr);
        };

        return {
          id:      id,
          jid:     finalJid,
          name:    detailedItem.naziv ?? detailedItem.Naziv ?? 'Nepoznat objekat',
          address: formatAddress(detailedItem.adresa ?? detailedItem.Adresa),
          type:    detailedItem.vrstaObjektaNaziv ?? detailedItem.VrstaObjektaNaziv ?? '',
          _raw:    detailedItem
        };
      }));

      res.json({ objects: fullAccommodations, request_metadata: requestMetadata });
    } catch (err: any) {
      console.error('Accommodations fetch error:', err);
      res.status(500).json({ 
        error: 'Nije moguće dohvatiti smeštajne objekte.', 
        details: err.stack || err.message || 'Nepoznata greška' 
      });
    }
  });

  // ── Accommodation Units ───────────────────────────────────────────────────
  app.get('/api/eturista/accommodation-units', requireToken, async (req, res) => {
    let objId = req.query.accommodationId as string;
    let jid = req.query.jid as string;
    
    // Clean up "undefined" or "null" strings coming from frontend
    if (objId === 'undefined' || objId === 'null') objId = '';
    if (jid === 'undefined' || jid === 'null') jid = '';

    if (!objId && !jid) return res.status(400).json({ error: 'accommodationId ili jid je obavezan.' });
    
    try {
      const authHeader = req.headers.authorization!;
      const bearerHeader = authHeader.toLowerCase().startsWith('bearer ') ? authHeader : `Bearer ${authHeader}`;

      console.log(`[eTurista] → Fetching units for Object ID:${objId} | JID:${jid}`);
      
      const endpoints: string[] = [];
      
      // Collect valid non-empty IDs to try
      const idsToTry = [objId, jid].filter(id => id && id.length > 0);
      
      const pathPatterns = [
        'v1/SmestajnaJedinica/VratiSmestajneJediniceUgostiteljskogObjekta',
        'v1/SmestajnaJedinica/VratiSmestajneJedinicePoUgostiteljskomObjektuId',
        'v1/SmestajnaJedinica/VratiSveSmestajneJediniceUgostiteljskogObjekta',
        'v1/UgostiteljskiObjekat/VratiSmestajneJedinice',
        'v1/UgostiteljskiObjekat/VratiSmestajneJediniceZaObjekat',
        'v1/SmestajnaJedinica/vratiSmestajneJediniceZaObjekat',
        'v1/SmestajnaJedinica/VratiSmestajneJedinicePoObjektu',
        'v1/SmeštajnaJedinica/VratiSmeštajneJediniceObjekta',
        'v1/SmestajnaJedinica/VratiSmestajneJediniceObjekta',
        'v1/SmeštajnaJedinica/VratiSmeštajneJedinice',
        'v1/SmestajnaJedinica/VratiSmestajneJedinice',
        'v1/SmestajnaJedinica/Sve',
        'v1/SmeštajnaJedinica/Sve',
        'v1/SmeštajnaJedinica/VratiPodatke',
        'v1/SmestajnaJedinica/VratiPodatke',
        'HoteliImport/VratiSmestajneJedinice',
        'SmestajnaJedinica/VratiSmestajneJedinice',
        'UgostiteljskiObjekat/VratiSveSmestajneJedinice',
        'UgostiteljskiObjekat/PreuzmiSmestajneJedinice',
        'UgostiteljskiObjekat/PopisSmestajnihJedinica',
      ];

      idsToTry.forEach(val => {
        pathPatterns.forEach(path => {
          endpoints.push(`${path}?id=${val}`);
          endpoints.push(`${path}?ugostiteljskiObjekatId=${val}`);
          endpoints.push(`${path}?jedinstveniIdentifikatorObjekta=${val}`);
          endpoints.push(`${path}?jedinstveniIdentifikator=${val}`); 
          endpoints.push(`${path}?ugostiteljskiObjekatJedinstveniIdentifikator=${val}`);
          endpoints.push(`${path}?objekatId=${val}`);
        });
      });

      let successR: any = null;
      console.log(`[eTurista] → Attempting units fetch for ID:${objId} | JID:${jid} (${endpoints.length} variations)`);

      const etBase = getEturistaUrl(req);

      for (const ep of endpoints) {
        try {
          const url = `${etBase}/${ep}`;
          const r = await fetch(url, { headers: { Authorization: bearerHeader, Accept: 'application/json' } });
          const text = await r.text();
          
          if (r.ok && text && text.trim().startsWith('{')) {
            const data = JSON.parse(text);
            const rawItems = toArray(parseResponse(data));
            
            let items = rawItems;
            if (items.length === 0 && data && typeof data === 'object') {
               const d = data as any;
               const nested = d.podaci || d.Podaci || d.stavka || d.Stavka || d.smestajneJedinice || d.SmestajneJedinice || d.rezultat || d.Rezultat;
               if (nested && Array.isArray(nested)) items = nested;
               else if (nested && typeof nested === 'object') {
                 const sub = nested.smestajneJedinice || nested.SmestajneJedinice || nested.stavke || nested.Stavke || nested.podaci || nested.Podaci;
                 if (Array.isArray(sub)) items = sub;
               }
            }

            if (items.length > 0) {
              console.log(`[eTurista] → SUCCESS via ${ep.split('?')[0]} | Found ${items.length} units`);
              successR = { data: items };
              break;
            }
          }
        } catch(e) {}
      }

      if (!successR) {
        console.log('[eTurista] → Special unit endpoints failed. Trying deep object fallbacks...');
        for (const val of idsToTry) {
           const fallbacks = [
             `v1/UgostiteljskiObjekat/VratiUgostiteljskiObjekat?id=${val}`,
             `v1/UgostiteljskiObjekat/VratiUgostiteljskiObjekat?jedinstveniIdentifikator=${val}`,
             `v1/UgostiteljskiObjekat/Preuzmi?id=${val}`,
             `v1/UgostiteljskiObjekat/Preuzmi?jedinstveniIdentifikator=${val}`,
             `UgostiteljskiObjekat/VratiUgostiteljskiObjekat/${val}`,
             `UgostiteljskiObjekat/Preuzmi?id=${val}`,
             `UgostiteljskiObjekat/VratiSvePodatke?id=${val}`
           ];
           for (const fb of fallbacks) {
             try {
               const r = await fetch(`${etBase}/${fb}`, { headers: { Authorization: bearerHeader, Accept: 'application/json' } });
               const text = await r.text();
               if (r.ok && text && text.trim().startsWith('{')) {
                 const data = JSON.parse(text);
                 const parsed = parseResponse(data) as any;
                 
                 const units = parsed?.SmestajneJedinice || parsed?.smestajneJedinice || parsed?.stavke || parsed?.Stavke || 
                               (data.podaci && (data.podaci.smestajneJedinice || data.podaci.SmestajneJedinice)) || [];
                 if (Array.isArray(units) && units.length > 0) {
                   console.log(`[eTurista] → Found ${units.length} units embedded in Object via ${fb}`);
                   successR = { data: units };
                   break;
                 }
               }
             } catch(e) {}
           }
           if (successR) break;
        }
      }

      if (!successR) {
        console.warn(`[eTurista] → All unit endpoints failed for ID:${objId} | JID:${jid}. Using default unit.`);
        return res.json([{ id: -1, jid: "-1", name: "Podrazumevana jedinica", number: "1" }]);
      }


      const items = toArray(parseResponse(successR));
      console.log(`[eTurista] → Found ${items.length} units.`);
      if (items.length > 0) {
        console.log(`[eTurista] → Unit 1 keys: ${Object.keys(items[0]).join(', ')}`);
      }

      res.json(items.map((it: any) => {
        const id = it.id ?? it.Id ?? it.smestajnaJedinicaId ?? it.SmestajnaJedinicaId;
        const jid = it.jedinstveniIdentifikator ?? it.JedinstveniIdentifikator ?? it.identifikator ?? it.Identifikator;
        
        return {
          id:      id,
          jid:     jid ?? id, // Fallback for units too
          number:  it.brojSmestajneJedinice ?? it.BrojSmestajneJedinice ?? it.broj ?? it.Broj,
          floor:   it.spratSmestajneJedinice ?? it.SpratSmestajneJedinice ?? it.sprat ?? it.Sprat,
          name:    it.naziv ?? it.Naziv,
          accommodationJid: it.ugostiteljskiObjekatJedinstveniIdentifikator ?? it.UgostiteljskiObjekatJedinstveniIdentifikator
        };
      }));
    } catch (err: any) {
      console.error('Units fetch error:', err);
      // Return empty array on error so UI can show fallback unit
      res.json([]);
    }
  });

  // ── Register guest ────────────────────────────────────────────────────────
  app.post('/api/eturista/register', requireToken, async (req, res) => {
    const { guest, accommodationId, jid } = req.body;
    if (!guest || !accommodationId)
      return res.status(400).json({ error: 'Podaci gosta i ID objekta su obavezni.' });

    // Validate
    const errors = validateGuest(guest);
    if (errors.length > 0)
      return res.status(422).json({ error: 'Validacija nije prošla.', details: errors });

    const effectiveAccId = jid || accommodationId;
    // eTurista production often requires exactly 8 digits for the JID
    const formattedAccId = String(effectiveAccId).padStart(8, '0');
    console.log(`[eTurista] → Registration: Using ID ${effectiveAccId} (Padded: ${formattedAccId})`);
    
    const payload: any = buildPayload(guest, formattedAccId);
    
    // Attempt registration via multiple endpoints for maximum compatibility
    const endpoints = [
      'UgostiteljskiObjekat/Dodaj',
      'Npzrs/Dodaj',
      'hoteliimport/checkin' // v4.9 legacy/bulk import
    ];

    let lastError = null;
    let result: any = null;
    let success = false;

    const authHeader = req.headers.authorization!;
    const bearerHeader = authHeader.toLowerCase().startsWith('bearer ') ? authHeader : `Bearer ${authHeader}`;
    const etBase = getEturistaUrl(req);

    for (const ep of endpoints) {
      try {
        console.log(`[eTurista] → Attempt: ${ep}`);
        const r = await fetch(`${etBase}/${ep}`, {
          method: 'POST',
          headers: {
            'Authorization': bearerHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const text = await r.text();
        console.log(`[eTurista] ← ${ep} (${r.status}): ${text.slice(0, 200)}...`);

        if (r.ok) {
          success = true;
          try { result = JSON.parse(text); } catch(e) { result = { message: text }; }
          break;
        } else {
          lastError = text;
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!success) {
      console.error(`[eTurista] Registration fully failed: ${lastError}`);
      return res.status(400).json({ 
        error: `eTurista: ${lastError}`,
        details: { last_error: lastError, payload }
      });
    }

    // SUCCESS: Save to local DB
    try {
      const op = payload.OsnovniPodaci;
      const pb = payload.PodaciOBoravku;
      const idoc = payload.IdentifikacioniDokumentStranogLica || {};
      const now = new Date().toISOString();
      const internalId = result?.identifikator ?? result?.Identifikator ?? result?.id ?? result?.Id;

      db.prepare(`
        INSERT INTO Gost_v4 (
          ExternalId, InternalId, Izmena, DaLiJeLiceDomace, Ime, Prezime, DatumRodjenja, PolSifra, Jmbg,
          DrzavaRodjenjaAlfa3, DrzavljanstvoAlfa3,
          OpstinaPrebivalistaMaticniBroj, OpstinaPrebivalistaNaziv, 
          MestoPrebivalistaMaticniBroj, MestoPrebivalistaNaziv,
          DrzavaPrebivalistaAlfa3, MestoRodjenjaNaziv,
          VrstaPutneIspraveSifra, BrojPutneIsprave, DatumIzdavanjaPutneIsprave,
          DatumUlaskaURepublikuSrbiju, MestoUlaskaURepublikuSrbijuSifra, MestoUlaskaURepublikuSrbiju,
          VrstaPruzenihUslugaSifra, NacinDolaskaSifra, NazivAgencije, RazlogBoravkaSifra,
          DatumICasDolaska, PlaniraniDatumOdlaska,
          UgostiteljskiObjekatJedinstveniIdentifikator, CreatedAt, UpdatedAt
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,
          ?,?,
          ?,?,
          ?,?,
          ?,?,
          ?,?,?,
          ?,?,?,
          ?,?,?,?,
          ?,?,
          ?,?,?
        )
      `).run(
        op.ExternalId, internalId || null, 0, op.DaLiJeLiceDomace === "true" ? 1 : 0,
        op.Ime, op.Prezime, op.DatumRodjenja, op.PolSifra, op.Jmbg || null,
        op.DrzavaRodjenjaAlfa3, op.DrzavljanstvoAlfa3 || null,
        op.OpstinaPrebivalistaMaticniBroj || null, op.OpstinaPrebivalistaNaziv || null,
        op.MestoPrebivalistaMaticniBroj || null, op.MestoPrebivalistaNaziv || null,
        op.DrzavaPrebivalistaAlfa3, op.MestoRodjenjaNaziv || null,
        idoc.VrstaPutneIspraveSifra || null, idoc.BrojPutneIsprave || null, idoc.DatumIzdavanjaPutneIsprave || null,
        idoc.DatumUlaskaURepublikuSrbiju || null, idoc.MestoUlaskaURepublikuSrbijuSifra || null, idoc.MestoUlaskaURepublikuSrbiju || null,
        pb.VrstaPruzenihUslugaSifra, pb.NacinDolaskaSifra, pb.NazivAgencije || null, pb.RazlogBoravkaSifra,
        pb.DatumICasDolaska, pb.PlaniraniDatumOdlaska,
        pb.UgostiteljskiObjekatJedinstveniIdentifikator, now, now
      );

      // Also log success to entry_logs for simple auditing
      logger.entry(`${op.Ime} ${op.Prezime}`, idoc.BrojPutneIsprave || op.Jmbg || 'N/A', Number(accommodationId), 'eTurista Registry');
    } catch (dbErr: any) {
      console.error('Local DB insert failed after success:', dbErr.message);
    }

    res.json({ success: true, message: 'Gost je uspešno registrovan.', response: result });
  });

  // ── eTurista Checkout Proxy ───────────────────────────────────────────────
  app.post('/api/eturista/checkout', requireToken, async (req, res) => {
    const payload = req.body;
    console.log('[eTurista] → Checkout endpoints start:', JSON.stringify(payload));
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Nedostaje Authorization header.' });
    
    const bearerHeader = authHeader.toLowerCase().startsWith('bearer ') 
      ? authHeader 
      : `Bearer ${authHeader}`;

    const etBase = getEturistaUrl(req);

    // Try multiple checkout endpoints for maximum compatibility 
    // (some systems use Npzrs, some use Ugostitelj, some use HoteliImport)
    const endpoints = [
      'Npzrs/Odjavi',
      'UgostiteljskiObjekat/Odjavi',
      'Turista/Odjavi',
      'HoteliImport/CheckOut'
    ];

    let lastError = null;
    let result = null;
    let success = false;

    for (const ep of endpoints) {
      try {
        console.log(`[eTurista] → Attempt: ${ep}`);
        const response = await fetch(`${etBase}/${ep}`, {
          method: 'POST',
          headers: {
            'Authorization': bearerHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log(`[eTurista] ← ${ep} (${response.status}): ${text.substring(0, 500)}`);
        
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }

        if (response.ok) {
          success = true;
          result = data;
          break;
        } else {
          lastError = data.error || data.message || text || response.statusText;
        }
      } catch (error: any) {
        lastError = error.message;
      }
    }

    if (!success) {
      console.error('[eTurista Checkout] All endpoints failed. Last error:', lastError);
      return res.status(500).json({ error: lastError });
    }

    res.json(result);
  });

  // ── eTurista Search Proxy ──────────────────────────────────────────────────
  app.post('/api/eturista/guests', requireToken, async (req, res) => {
    const filters = req.body;
    
    if (!filters.ugostiteljskiObjekatIds || filters.ugostiteljskiObjekatIds.length === 0) {
      return res.status(400).json({ error: 'ugostiteljskiObjekatIds su obavezni.' });
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Nedostaje Authorization header.' });
    
    // Standardize Bearer prefix
    const bearerHeader = authHeader.toLowerCase().startsWith('bearer ') 
      ? authHeader 
      : `Bearer ${authHeader}`;

    const etBase = getEturistaUrl(req);

    try {
      const response = await fetch(`${etBase}/Turista/vratituristepokriterijumu`, {
        method: 'POST',
        headers: {
          'Authorization': bearerHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(filters)
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ 
          error: `eTurista API greška (${response.status})`,
          details: errText 
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('[eTurista Search] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Logs & History ────────────────────────────────────────────────────────
  app.get('/api/logs/entries', requireToken, (req, res) => {
    try {
      const logs = db.prepare('SELECT * FROM entry_logs ORDER BY timestamp DESC').all();
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/logs/entry', requireToken, (req, res) => {
    const { guestName, documentNumber, accommodationId, accommodationName } = req.body;
    logger.entry(guestName, documentNumber, accommodationId, accommodationName);
    res.json({ success: true });
  });

  app.post('/api/logs/error', (req, res) => {
    const { message, stack, context } = req.body;
    logger.error(message, stack, context);
    res.json({ success: true });
  });

  // ── Database Explorer ─────────────────────────────────────────────────────
  app.get('/api/db/tables', requireToken, (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t: any) => {
        const count = db.prepare(`SELECT count(*) as cnt FROM "${t.name}"`).get() as any;
        return { name: t.name, count: count.cnt };
      });
      res.json(tables);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/db/data/:table', requireToken, (req, res) => {
    try {
      const { table } = req.params;
      const data = db.prepare(`SELECT * FROM "${table}" LIMIT 100`).all();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Static database data ──────────────────────────────────────────────────
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
  app.use('/api/db', dbRouter);

  // ── Vite / static ─────────────────────────────────────────────────────────
  if (!isProd) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_r, res) => res.sendFile('dist/index.html', { root: '.' }));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀  Server → http://0.0.0.0:${PORT} [${isProd ? 'PROD' : 'DEV'}]`);
    console.log(`📡  eTurista → ${ETURISTA_PROD_URL} | ${ETURISTA_TEST_URL}\n`);
  });
}

function safeQuery(res: Response, sql: string) {
  try { res.json(db.prepare(sql).all()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

startServer().catch(err => { console.error('Server failed to start:', err); process.exit(1); });
