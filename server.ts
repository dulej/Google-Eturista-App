import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Gender, DocumentType } from './types';

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database('eturista.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    action    TEXT,
    userId    TEXT,
    details   TEXT
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message   TEXT,
    stack     TEXT,
    context   TEXT
  );

  CREATE TABLE IF NOT EXISTS entry_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp        DATETIME DEFAULT CURRENT_TIMESTAMP,
    guestName        TEXT,
    documentNumber   TEXT,
    accommodationId  INTEGER,
    accommodationName TEXT
  );

  CREATE TABLE IF NOT EXISTS Gost (
    Id                                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ExternalId                           TEXT    NOT NULL UNIQUE,
    Izmena                               INTEGER NOT NULL CHECK (Izmena IN (0,1)),
    DaLiJeLiceDomace                     INTEGER NOT NULL CHECK (DaLiJeLiceDomace IN (0,1)),
    Ime                                  TEXT    NOT NULL,
    Prezime                              TEXT    NOT NULL,
    DatumRodjenja                        TEXT    NOT NULL,
    PolSifra                             TEXT    NOT NULL CHECK (PolSifra IN ('M','Z')),
    Jmbg                                 TEXT    CHECK (length(Jmbg) = 13 OR Jmbg IS NULL),
    DrzavaRodjenjaAlfa3                  TEXT    NOT NULL DEFAULT 'SRB',
    DrzavljanstvoAlfa3                   TEXT    NOT NULL DEFAULT '',
    OpstinaPrebivalistaMaticniBroj       INTEGER,
    OpstinaPrebivalistaNaziv             TEXT,
    MestoPrebivalistaMaticniBroj         INTEGER,
    MestoPrebivalistaNaziv               TEXT,
    DrzavaPrebivalistaAlfa3              TEXT    NOT NULL DEFAULT 'SRB',
    MestoRodjenjaNaziv                   TEXT,
    VrstaPutneIspraveSifra               TEXT,
    BrojPutneIsprave                     TEXT,
    DatumVazenjaPutneIsprave             TEXT,
    DatumIzdavanjaPutneIsprave           TEXT,
    DatumUlaskaURepublikuSrbiju          TEXT,
    MestoUlaskaURepublikuSrbijuSifra     TEXT,
    VrstaPruzenihUslugaSifra             TEXT,
    NacinDolaskaSifra                    TEXT,
    RazlogBoravkaSifra                   TEXT,
    DatumICasDolaska                     TEXT,
    PlaniraniDatumOdlaska               TEXT,
    UgostiteljskiObjekatJedinstveniIdentifikator INTEGER,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Cleanup (deferred — does not block startup) ──────────────────────────────

function cleanupOldRecords() {
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const iso30 = cutoff30.toISOString();

  const cutoff31 = new Date();
  cutoff31.setDate(cutoff31.getDate() - 31);
  const iso31 = cutoff31.toISOString();

  db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(iso30);
  db.prepare('DELETE FROM error_logs WHERE timestamp < ?').run(iso30);
  db.prepare('DELETE FROM entry_logs WHERE timestamp < ?').run(iso30);

  try {
    const result = db.prepare('DELETE FROM Gost WHERE CreatedAt < ?').run(iso31);
    if (result.changes > 0) {
      console.log(`Cleanup: removed ${result.changes} guest records older than 31 days.`);
    }
  } catch (e) {
    console.error('Cleanup: failed to delete old Gost records:', e);
  }
}

// Run after startup, then every 24 h
setImmediate(cleanupOldRecords);
setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000);

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = {
  audit(action: string, userId: string | number | null, details: string) {
    try {
      db.prepare('INSERT INTO audit_logs (action, userId, details) VALUES (?, ?, ?)')
        .run(action, String(userId ?? 'system'), details);
    } catch (e) { console.error('logger.audit failed:', e); }
  },
  error(message: string, stack = '', context = '') {
    try {
      db.prepare('INSERT INTO error_logs (message, stack, context) VALUES (?, ?, ?)')
        .run(message, stack, context);
    } catch (e) { console.error('logger.error failed:', e); }
  },
  entry(guestName: string, documentNumber: string, accommodationId: number, accommodationName: string) {
    try {
      db.prepare('INSERT INTO entry_logs (guestName, documentNumber, accommodationId, accommodationName) VALUES (?, ?, ?, ?)')
        .run(guestName, documentNumber, accommodationId, accommodationName);
    } catch (e) { console.error('logger.entry failed:', e); }
  },
};

// ─── Middleware: server-side auth guard ───────────────────────────────────────
// Checks that the request carries the eTurista session token we forwarded
// back to the client on login. This is a lightweight "known token" check;
// it is NOT a replacement for a full session store in a multi-user server.

const requireToken = (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// ─── eTurista base URL ────────────────────────────────────────────────────────

const ETURISTA_BASE_URL = 'https://portal.eturista.gov.rs/eturistwebapi/api';

// ─── JSON parsing utility ─────────────────────────────────────────────────────
// eTurista occasionally returns a JSON string that is itself JSON-encoded.
// We unwrap one extra layer when that happens, but no more.

function parseEturistaResponse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    const once = JSON.parse(raw);
    // Only go one level deeper
    if (typeof once === 'string') {
      try { return JSON.parse(once); } catch { return once; }
    }
    return once;
  } catch {
    return raw;
  }
}

function toArray(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const candidate = d.result ?? d.Data ?? d.data;
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const RegisterBody = z.object({
  accommodationId: z.number().int().positive(),
  guest: z.object({
    firstName:              z.string().min(1),
    lastName:               z.string().min(1),
    dateOfBirth:            z.string(),
    gender:                 z.nativeEnum(Gender),
    documentType:           z.nativeEnum(DocumentType),
    documentNumber:         z.string().optional(),
    expiryDate:             z.string().optional(),
    countryOfBirth:         z.string().optional(),
    nationality:            z.string().optional(),
    arrivalDate:            z.string(),
    arrivalTime:            z.string().optional(),
    placeOfBirth:           z.string().optional(),
    isDomestic:             z.boolean(),
    jmbg:                   z.string().optional(),
    residenceCountry:       z.string().optional(),
    municipalityOfResidence:z.string().optional(),
    placeOfResidence:       z.string().optional(),
    serviceType:            z.string().optional(),
    arrivalMode:            z.string().optional(),
    stayReason:             z.string().optional(),
    plannedDepartureDate:   z.string().optional(),
    documentIssueDate:      z.string().optional(),
    entryDateToSerbia:      z.string().optional(),
    entryPlaceToSerbia:     z.string().optional(),
  }),
});

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use(cors({
    origin: isProd ? process.env.ALLOWED_ORIGIN ?? false : true,
    credentials: true,
  }));
  app.use(express.json({ limit: '50mb' }));

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // ── Login (rate-limited: 10 attempts per 15 min per IP) ───────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.' },
  });

  app.post('/api/eturista/login', loginLimiter, async (req, res) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Korisničko ime i lozinka su obavezni.' });
    }
    const { username, password } = parsed.data;

    try {
      const response = await fetch(
        `${ETURISTA_BASE_URL}/Autentifikacija/PrijavaKorisnickoImeLozinka`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ korisnickoIme: username, lozinka: password }),
        },
      );

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Neispravni podaci ili greška eTurista servisa.' });
      }

      const raw = await response.json();
      const data = parseEturistaResponse(raw) as Record<string, any>;

      const token =
        data.token ?? data.Token ?? data.access_token ??
        data.result?.token ?? data.result?.Token ?? data.data?.token;
      const id =
        data.id ?? data.Id ??
        data.result?.id ?? data.result?.Id ??
        (data.korisnik ? (data.korisnik.id ?? data.korisnik.Id) : undefined) ??
        data.data?.id;

      if (token && id != null) {
        return res.json({ sessionToken: String(token), userId: Number(id) });
      }

      logger.error('LOGIN_FAILED', undefined, `Unexpected response format for user ${username}`);
      res.status(500).json({ error: 'Neočekivan format odgovora eTurista servisa.' });
    } catch (err: any) {
      logger.error('LOGIN_EXCEPTION', err.stack, `User ${username}: ${err.message}`);
      res.status(500).json({ error: 'Prijava nije uspela.', details: err.message });
    }
  });

  // ── Accommodations ────────────────────────────────────────────────────────
  app.get('/api/eturista/accommodations', requireToken, async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
      const response = await fetch(
        `${ETURISTA_BASE_URL}/UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId?ugostiteljId=${userId}`,
        { headers: { Authorization: req.headers.authorization!, Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(`eTurista error: ${response.status}`);

      const raw = await response.json();
      const items = toArray(parseEturistaResponse(raw));

      const accommodations = items.map((item: any) => ({
        id:      item.id      ?? item.Id,
        name:    item.naziv   ?? item.Naziv,    // normalised to "name"
        address: item.adresa  ?? item.Adresa,
        type:    item.vrstaObjekta ?? item.VrstaObjekta,
      }));

      res.json(accommodations);
    } catch (err: any) {
      res.status(500).json({ error: 'Nije moguće dohvatiti smeštajne objekte.', details: err.message });
    }
  });

  // ── Register guest ────────────────────────────────────────────────────────
  app.post('/api/eturista/register', requireToken, async (req, res) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Neispravni podaci gosta.', details: parsed.error.flatten() });
    }
    const { guest, accommodationId } = parsed.data;

    // Map enum values to eTurista codes
    const polSifra     = guest.gender === Gender.FEMALE ? 'Z' : 'M';
    const vrstaIsprave = guest.documentType === DocumentType.PASSPORT ? 'P' : 'L';
    const eturistaVrsta = guest.documentType === DocumentType.PASSPORT ? 1 : 2;
    const eturistaPol   = guest.gender === Gender.FEMALE ? 2 : 1;

    // 1. Persist to local Gost table (fire-and-forget; does not block API call)
    try {
      const now = new Date().toISOString();

      let opstinaNaziv: string | null = null;
      if (guest.municipalityOfResidence) {
        const row = db.prepare('SELECT Naziv FROM Opstine WHERE "Maticni Broj" = ?')
          .get(guest.municipalityOfResidence) as any;
        if (row) opstinaNaziv = row.Naziv;
      }

      let mestoNaziv: string | null = null;
      if (guest.placeOfResidence) {
        const row = db.prepare('SELECT "Naziv Mesta" FROM Mesta WHERE "Maticni Broj Mesta" = ?')
          .get(guest.placeOfResidence) as any;
        if (row) mestoNaziv = row['Naziv Mesta'];
      }

      const arrivalDateTime = `${guest.arrivalDate} ${guest.arrivalTime ?? '12:00'}`;

      db.prepare(`
        INSERT INTO Gost (
          ExternalId, Izmena, DaLiJeLiceDomace, Ime, Prezime, DatumRodjenja, PolSifra, Jmbg,
          DrzavaRodjenjaAlfa3, DrzavljanstvoAlfa3,
          OpstinaPrebivalistaMaticniBroj, OpstinaPrebivalistaNaziv,
          MestoPrebivalistaMaticniBroj, MestoPrebivalistaNaziv, DrzavaPrebivalistaAlfa3,
          MestoRodjenjaNaziv, VrstaPutneIspraveSifra, BrojPutneIsprave,
          DatumVazenjaPutneIsprave, DatumIzdavanjaPutneIsprave,
          DatumUlaskaURepublikuSrbiju, MestoUlaskaURepublikuSrbijuSifra,
          VrstaPruzenihUslugaSifra, NacinDolaskaSifra, RazlogBoravkaSifra,
          DatumICasDolaska, PlaniraniDatumOdlaska,
          UgostiteljskiObjekatJedinstveniIdentifikator, CreatedAt, UpdatedAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        `EXT_${randomUUID()}`,
        0,
        guest.isDomestic ? 1 : 0,
        guest.firstName,
        guest.lastName,
        guest.dateOfBirth,
        polSifra,
        guest.jmbg ?? null,
        guest.countryOfBirth ?? 'SRB',
        guest.nationality ?? '',
        guest.municipalityOfResidence ?? null,
        opstinaNaziv,
        guest.placeOfResidence ?? null,
        mestoNaziv,
        guest.residenceCountry ?? 'SRB',
        guest.placeOfBirth ?? '',
        vrstaIsprave,
        guest.documentNumber ?? null,
        guest.expiryDate ?? null,
        guest.documentIssueDate ?? null,
        guest.entryDateToSerbia ?? null,
        guest.entryPlaceToSerbia ?? null,
        guest.serviceType ?? '1',
        guest.arrivalMode ?? '1',
        guest.stayReason ?? '4',
        arrivalDateTime,
        guest.plannedDepartureDate ?? null,
        accommodationId,
        now,
        now,
      );
    } catch (dbErr: any) {
      // Log but don't abort — local DB failure should not block eTurista registration
      console.error('Failed to insert into Gost table:', dbErr);
    }

    // 2. Forward to eTurista API
    const formatDate = (d?: string) => d ? `${d}T00:00:00Z` : null;

    const payload = {
      ObjekatId:             accommodationId,
      Ime:                   guest.firstName,
      Prezime:               guest.lastName,
      DatumRodjenja:         formatDate(guest.dateOfBirth),
      MestoRodjenja:         guest.placeOfBirth ?? 'Nepoznato',
      PolId:                 eturistaPol,
      VrstaIspraveId:        eturistaVrsta,
      BrojIsprave:           guest.documentNumber,
      DatumVazenjaIsprave:   formatDate(guest.expiryDate),
      DatumDolaska:          formatDate(guest.arrivalDate),
      VrstaTuristeId:        2,
      RazlogBoravkaId:       guest.stayReason ?? 1,
    };

    try {
      const response = await fetch(`${ETURISTA_BASE_URL}/Turista/Create`, {
        method: 'POST',
        headers: {
          Authorization:   req.headers.authorization!,
          'Content-Type':  'application/json',
          Accept:          'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error('REGISTRATION_FAILED', undefined,
          `${guest.firstName} ${guest.lastName}: ${text}`);
        return res.status(response.status).json({ error: text });
      }

      // Single authoritative audit log — server-side only
      logger.audit('REGISTRATION_SUCCESS', null,
        `Gost ${guest.firstName} ${guest.lastName} registrovan u objekt ${accommodationId}`);
      logger.entry(
        `${guest.firstName} ${guest.lastName}`,
        guest.documentNumber ?? '',
        accommodationId,
        '',
      );

      res.json({ success: true });
    } catch (err: any) {
      logger.error('REGISTRATION_EXCEPTION', err.stack, err.message);
      res.status(500).json({ error: 'Registracija nije uspela.', details: err.message });
    }
  });

  // ── Cities (reference data) ───────────────────────────────────────────────
  app.get('/api/eturista/cities', requireToken, async (req, res) => {
    try {
      const response = await fetch(`${ETURISTA_BASE_URL}/RGZ/gradovi`, {
        headers: { Authorization: req.headers.authorization!, Accept: 'application/json' },
      });
      if (!response.ok) return res.json([]);

      const raw = await response.json();
      const items = toArray(parseEturistaResponse(raw));

      res.json(items.map((item: any) => ({
        id:   item.id   ?? item.Id,
        name: item.naziv ?? item.Naziv,
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Nije moguće dohvatiti gradove.', details: err.message });
    }
  });

  // ── Static reference DB endpoints ────────────────────────────────────────
  const dbRouter = express.Router();
  dbRouter.use(requireToken);

  dbRouter.get('/countries',    (_req, res) => safeQuery(res, 'SELECT * FROM Drzava ORDER BY Cirlica ASC'));
  dbRouter.get('/municipalities',(_req, res) => safeQuery(res, 'SELECT * FROM Opstine ORDER BY Naziv ASC'));
  dbRouter.get('/places/:municipalityId', (req, res) => {
    try {
      const data = db.prepare(
        'SELECT * FROM Mesta WHERE "Maticni Broj Opstine" = ? ORDER BY "Naziv Mesta" ASC'
      ).all(req.params.municipalityId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  dbRouter.get('/service-types', (_req, res) => safeQuery(res, 'SELECT * FROM "Vrsta Pruzenih Usluga" ORDER BY Naziv ASC'));
  dbRouter.get('/arrival-modes', (_req, res) => safeQuery(res, 'SELECT * FROM "Nacin Dolaska" ORDER BY Naziv ASC'));
  dbRouter.get('/stay-reasons',  (_req, res) => safeQuery(res, 'SELECT * FROM "Razlog Boravka" ORDER BY Naziv ASC'));
  dbRouter.get('/entry-places',  (_req, res) => safeQuery(res, 'SELECT * FROM "Mesto Ulaska U Republiku Srbiju" ORDER BY Naziv ASC'));

  // ⚠ DB explorer — DEVELOPMENT ONLY (never exposed in production)
  if (!isProd) {
    dbRouter.get('/tables', (_req, res) => {
      try {
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).all() as { name: string }[];

        const withCounts = tables.map(t => {
          const row = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any;
          return { name: t.name, count: row.count };
        });
        res.json(withCounts);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    dbRouter.get('/data/:table', (req, res) => {
      const { table } = req.params;
      if (!/^[a-zA-Z0-9_ ]+$/.test(table)) {
        return res.status(400).json({ error: 'Invalid table name' });
      }
      try {
        res.json(db.prepare(`SELECT * FROM "${table}"`).all());
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  app.use('/api/db', dbRouter);

  // ── Log endpoints (require auth) ──────────────────────────────────────────
  const logRouter = express.Router();
  logRouter.use(requireToken);

  logRouter.get('/entries', (_req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM entry_logs ORDER BY timestamp DESC').all());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  logRouter.post('/entry', (req, res) => {
    const { guestName, documentNumber, accommodationId, accommodationName } = req.body;
    logger.entry(guestName, documentNumber, accommodationId, accommodationName);
    res.status(201).json({ success: true });
  });

  logRouter.post('/audit', (req, res) => {
    const { action, userId, details } = req.body;
    logger.audit(action, userId, details);
    res.status(201).json({ success: true });
  });

  logRouter.post('/error', (req, res) => {
    const { message, stack, context } = req.body;
    logger.error(message, stack, context);
    res.status(201).json({ success: true });
  });

  app.use('/api/logs', logRouter);

  // ── Vite dev / static prod ────────────────────────────────────────────────
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeQuery(res: Response, sql: string) {
  try {
    res.json(db.prepare(sql).all());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
