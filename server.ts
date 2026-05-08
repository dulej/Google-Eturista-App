import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import Database from "better-sqlite3";

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database("eturista.db");

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
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp         DATETIME DEFAULT CURRENT_TIMESTAMP,
  guestName         TEXT,
  documentNumber    TEXT,
  accommodationId   INTEGER,
  accommodationName TEXT
);
CREATE TABLE IF NOT EXISTS Gost (
  Id                                         INTEGER PRIMARY KEY AUTOINCREMENT,
  ExternalId                                 TEXT NOT NULL UNIQUE,
  Izmena                                     INTEGER NOT NULL DEFAULT 0 CHECK (Izmena IN (0,1)),
  DaLiJeLiceDomace                           INTEGER NOT NULL CHECK (DaLiJeLiceDomace IN (0,1)),
  Ime                                        TEXT NOT NULL,
  Prezime                                    TEXT NOT NULL,
  DatumRodjenja                              TEXT NOT NULL,
  PolSifra                                   TEXT NOT NULL CHECK (PolSifra IN ('M','Z')),
  Jmbg                                       TEXT CHECK (length(Jmbg) = 13 OR Jmbg IS NULL),
  DrzavaRodjenjaAlfa3                        TEXT NOT NULL DEFAULT 'SRB',
  DrzavljanstvoAlfa3                         TEXT NOT NULL DEFAULT '',
  OpstinaPrebivalistaMaticniBroj             TEXT,
  OpstinaPrebivalistaNaziv                   TEXT,
  MestoPrebivalistaMaticniBroj               TEXT,
  MestoPrebivalistaNaziv                     TEXT,
  DrzavaPrebivalistaAlfa3                    TEXT DEFAULT 'SRB',
  MestoRodjenjaNaziv                         TEXT,
  VrstaPutneIspraveSifra                     TEXT,
  BrojPutneIsprave                           TEXT,
  DatumIzdavanjaPutneIsprave                 TEXT,
  DatumUlaskaURepublikuSrbiju                TEXT,
  MestoUlaskaURepublikuSrbijuSifra           TEXT,
  VrstaPruzenihUslugaSifra                   TEXT,
  NacinDolaskaSifra                          TEXT,
  RazlogBoravkaSifra                         TEXT,
  DatumICasDolaska                           TEXT,
  PlaniraniDatumOdlaska                      TEXT,
  UgostiteljskiObjekatJedinstveniIdentifikator TEXT,
  EturistaIdentifikator                      TEXT,
  CheckedOut                                 INTEGER DEFAULT 0,
  CreatedAt                                  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt                                  DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// ─── Cleanup ──────────────────────────────────────────────────────────────────

function cleanupOldRecords() {
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const d31 = new Date(Date.now() - 31 * 86_400_000).toISOString();
  db.prepare("DELETE FROM audit_logs WHERE timestamp < ?").run(d30);
  db.prepare("DELETE FROM error_logs WHERE timestamp < ?").run(d30);
  db.prepare("DELETE FROM entry_logs WHERE timestamp < ?").run(d30);
  try {
    const r = db.prepare("DELETE FROM Gost WHERE CreatedAt < ?").run(d31);
    if (r.changes > 0) console.log(`Cleanup: removed ${r.changes} guest record(s).`);
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}
cleanupOldRecords();
setInterval(cleanupOldRecords, 86_400_000);

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = {
  audit(action: string, userId: string | number | null, details: string) {
    try { db.prepare("INSERT INTO audit_logs (action,userId,details) VALUES (?,?,?)").run(action, String(userId ?? "system"), details); }
    catch (e) { console.error("audit log error:", e); }
  },
  error(message: string, stack?: string, context?: string) {
    try { db.prepare("INSERT INTO error_logs (message,stack,context) VALUES (?,?,?)").run(message, stack ?? "", context ?? ""); }
    catch (e) { console.error("error log error:", e); }
  },
  entry(guestName: string, documentNumber: string, accommodationId: number, accommodationName: string) {
    try { db.prepare("INSERT INTO entry_logs (guestName,documentNumber,accommodationId,accommodationName) VALUES (?,?,?,?)").run(guestName, documentNumber, accommodationId, accommodationName); }
    catch (e) { console.error("entry log error:", e); }
  },
};

// ─── eTurista config ──────────────────────────────────────────────────────────
// For local testing swap to the test URL:
//   https://www.test.portal.eturista.gov.rs/eturistwebapi/api
const ETURISTA_BASE_URL = "https://www.portal.eturista.gov.rs/eturistwebapi/api";

/**
 * Format a date-only value for the eTurista API → "YYYY-MM-DD"
 * Strips any ISO T/Z suffix that the API rejects.
 */
function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  return v.split("T")[0];
}

/**
 * Format a datetime for the eTurista API → "YYYY-MM-DD HH:mm"
 * date: "YYYY-MM-DD", time: "HH:mm"  (defaults to "12:00")
 */
function fmtDateTime(date: string | null | undefined, time?: string | null): string {
  if (!date) return "";
  return `${date.split("T")[0]} ${(time ?? "12:00").substring(0, 5)}`;
}

/** Map a document-type string to the eTurista VrstaPutneIspraveSifra code */
function docTypeSifra(docType: string): string {
  const map: Record<string, string> = {
    "Pasoš": "73",
    "PASSPORT": "73",
    "Passport": "73",
    "Lična karta": "74",
    "ID_CARD": "74",
    "IdCard": "74",
    "Vozačka dozvola": "75",
    "DRIVERS_LICENSE": "75",
  };
  return map[docType] ?? "73"; // default to passport
}

/** Gender string → eTurista PolSifra "M" | "Z" */
function polSifra(gender: string): "M" | "Z" {
  return (gender === "Ženski" || gender === "Female" || gender === "Z") ? "Z" : "M";
}

// ─── Express ──────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: "50mb" }));

  // Health check
  app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  // POST /Autentifikacija/PrijavaKorisnickoImeLozinka
  // Returns sessionToken, refreshToken, userId to the client.
  app.post("/api/eturista/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password)
        return res.status(400).json({ error: "Username and password are required" });

      const response = await fetch(
        `${ETURISTA_BASE_URL}/Autentifikacija/PrijavaKorisnickoImeLozinka`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ korisnickoIme: username, lozinka: password }),
        }
      );

      if (!response.ok) {
        const txt = await response.text();
        logger.error("LOGIN_HTTP_ERROR", undefined, `${response.status}: ${txt}`);
        return res.status(response.status).json({ error: "Pogrešni kredencijali ili greška eTuriste" });
      }

      const data: any = await response.json();
      const token: string | undefined = data.token || data.Token;
      const refreshToken: string | undefined = data.refreshToken || data.RefreshToken;
      const id: number | undefined = data.id || data.Id;

      if (!token || !id) {
        logger.error("LOGIN_BAD_RESPONSE", undefined, JSON.stringify(data));
        return res.status(500).json({ error: "Neočekivani format odgovora od eTuriste" });
      }

      logger.audit("LOGIN_SUCCESS", id, `User ${username} logged in`);
      res.json({ sessionToken: token, refreshToken: refreshToken ?? null, userId: id });
    } catch (err: any) {
      logger.error("LOGIN_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Prijava nije uspela", details: err.message });
    }
  });

  // ── REFRESH TOKEN ──────────────────────────────────────────────────────────
  // GET /Autentifikacija/OsveziToken
  // Headers: Authorization (Bearer token), RefreshToken
  app.get("/api/eturista/refresh-token", async (req, res) => {
    try {
      const authorization = req.headers.authorization;
      const refreshToken = req.headers["refreshtoken"] as string;
      if (!authorization || !refreshToken)
        return res.status(400).json({ error: "Authorization and RefreshToken headers required" });

      const response = await fetch(`${ETURISTA_BASE_URL}/Autentifikacija/OsveziToken`, {
        method: "GET",
        headers: { Authorization: authorization, RefreshToken: refreshToken, Accept: "application/json" },
      });

      if (!response.ok) {
        const txt = await response.text();
        return res.status(response.status).json({ error: "Token refresh failed", details: txt });
      }

      const data: any = await response.json();
      res.json({
        sessionToken: data.token || data.Token,
        refreshToken: data.refreshToken || data.RefreshToken,
        userId: data.id || data.Id,
      });
    } catch (err: any) {
      logger.error("REFRESH_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Token refresh failed", details: err.message });
    }
  });

  // ── ACCOMMODATIONS ─────────────────────────────────────────────────────────
  // GET /UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId
  app.get("/api/eturista/accommodations", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const userId = req.query.userId;
      if (!token || !userId)
        return res.status(401).json({ error: "Unauthorized" });

      const response = await fetch(
        `${ETURISTA_BASE_URL}/UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId?ugostiteljId=${userId}`,
        { headers: { Authorization: token, Accept: "application/json" } }
      );

      if (!response.ok) throw new Error(`eTurista error: ${response.status}`);

      const raw: any = await response.json();
      const items: any[] = Array.isArray(raw) ? raw : (raw.result || raw.Data || raw.data || []);

      res.json(items.map((item: any) => ({
        id: item.id ?? item.Id,
        name: item.naziv ?? item.Naziv ?? `Objekat #${item.id ?? item.Id}`,
        address: item.adresa ?? item.Adresa ?? "",
        type: item.vrstaObjekta ?? item.VrstaObjekta ?? "",
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Greška pri učitavanju objekata", details: err.message });
    }
  });

  // ── CHECK-IN ───────────────────────────────────────────────────────────────
  // POST /hoteliimport/checkin
  // Builds the correct nested payload (OsnovniPodaci + PodaciOBoravku +
  // optionally IdentifikacioniDokumentStranogLica) from the frontend guest model.
  app.post("/api/eturista/checkin", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const { guest, accommodationId } = req.body;

      if (!token)
        return res.status(401).json({ error: "Authorization header required" });
      if (!guest || !accommodationId)
        return res.status(400).json({ error: "Missing required fields: guest, accommodationId" });

      const isDomestic: boolean = guest.isDomestic !== false;
      const externalId = `EXT_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const arrivalDateTime = fmtDateTime(guest.arrivalDate, guest.arrivalTime);

      // ── OsnovniPodaci ──
      const osnovniPodaci: Record<string, any> = {
        ExternalId: externalId,
        Izmena: "false",
        DaLiJeLiceDomace: isDomestic ? "true" : "false",
        DaLiJeLiceRodjenoUInostranstvu: isDomestic ? "false" : "true",
        Ime: guest.firstName,
        Prezime: guest.lastName,
        DatumRodjenja: fmtDate(guest.dateOfBirth),
        PolSifra: polSifra(guest.gender),
        DrzavaRodjenjaAlfa3: guest.countryOfBirth || "SRB",
        DrzavljanstvoAlfa3: isDomestic ? "" : (guest.nationality || ""),
      };

      if (isDomestic) {
        if (guest.jmbg) osnovniPodaci.Jmbg = guest.jmbg;
        // Look up names from local DB if only IDs were provided
        if (guest.municipalityOfResidence) {
          const row: any = db.prepare(`SELECT Naziv FROM Opstine WHERE "Maticni Broj" = ?`).get(guest.municipalityOfResidence);
          osnovniPodaci.OpstinaPrebivalistaMaticniBroj = String(guest.municipalityOfResidence);
          osnovniPodaci.OpstinaPrebivalistaNaziv = row?.Naziv ?? guest.municipalityOfResidenceName ?? "";
        }
        if (guest.placeOfResidence) {
          const row: any = db.prepare(`SELECT "Naziv Mesta" FROM Mesta WHERE "Maticni Broj Mesta" = ?`).get(guest.placeOfResidence);
          osnovniPodaci.MestoPrebivalistaMaticniBroj = String(guest.placeOfResidence);
          osnovniPodaci.MestoPrebivalistaNaziv = row?.["Naziv Mesta"] ?? guest.placeOfResidenceName ?? "";
        }
        osnovniPodaci.DrzavaPrebivalistaAlfa3 = guest.residenceCountry || "SRB";
      } else {
        osnovniPodaci.MestoRodjenjaNaziv = guest.placeOfBirth ?? "";
      }

      // ── PodaciOBoravku ──
      const podaciOBoravku: Record<string, any> = {
        UgostiteljskiObjekatJedinstveniIdentifikator: String(accommodationId),
        VrstaPruzenihUslugaSifra: guest.serviceType ?? "1",
        NacinDolaskaSifra: guest.arrivalMode ?? "1",
        DatumICasDolaska: arrivalDateTime,
        UslovZaUmanjenjeBoravisneTakseSifra: guest.taxReductionCondition ?? "",
        RazlogBoravkaSifra: guest.stayReason ?? "0",
        PlaniraniDatumOdlaska: fmtDate(guest.plannedDepartureDate ?? guest.departureDate),
      };
      if (guest.agencyName) podaciOBoravku.NazivAgencije = guest.agencyName;

      // ── Full payload ──
      const payload: Record<string, any> = { OsnovniPodaci: osnovniPodaci, PodaciOBoravku: podaciOBoravku };

      // Foreign guests need identity document section
      if (!isDomestic) {
        payload.IdentifikacioniDokumentStranogLica = {
          VrstaPutneIspraveSifra: guest.documentTypeSifra ?? docTypeSifra(guest.documentType ?? ""),
          BrojPutneIsprave: guest.documentNumber ?? "",
          DatumIzdavanjaPutneIsprave: fmtDate(guest.documentIssueDate) ?? "",
          VrstaVizeSifra: guest.visaType ?? "",
          BrojVize: guest.visaNumber ?? "",
          MestoIzdavanjaVize: guest.visaIssuingPlace ?? "",
          DatumUlaskaURepublikuSrbiju: fmtDate(guest.entryDateToSerbia) ?? "",
          MestoUlaskaURepublikuSrbijuSifra: guest.entryPlaceToSerbia ?? "",
          MestoUlaskaURepublikuSrbiju: guest.entryPlaceToSerbiaName ?? "",
          DatumDoKadaJeOdobrenBoravakURepubliciSrbiji: fmtDate(guest.stayApprovedUntil) ?? "",
          Napomena: guest.note ?? "",
          OrganIzdavanjaPutneIsprave: guest.issuingAuthority ?? "",
        };
      }

      // ── Call eTurista ──
      const response = await fetch(`${ETURISTA_BASE_URL}/hoteliimport/checkin`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let responseData: any;
      try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

      if (!response.ok) {
        logger.error("CHECKIN_HTTP_ERROR", undefined, `HTTP ${response.status}: ${responseText}`);
        return res.status(response.status).json({
          error: "eTurista check-in nije uspeo",
          details: responseData?.errors || responseData?.message || responseText,
        });
      }

      // eTurista returns HTTP 200 even for validation errors — check the body
      if (responseData?.errors && responseData.errors !== "") {
        logger.error("CHECKIN_VALIDATION_ERROR", undefined, responseData.errors);
        return res.status(422).json({
          error: "Greška validacije eTuriste",
          details: responseData.errors,
          warnings: responseData.warnings,
        });
      }

      const eturistaId: string = responseData?.identifikator ?? "";

      // ── Persist locally ──
      try {
        db.prepare(`
          INSERT INTO Gost (
            ExternalId, Izmena, DaLiJeLiceDomace, Ime, Prezime, DatumRodjenja, PolSifra, Jmbg,
            DrzavaRodjenjaAlfa3, DrzavljanstvoAlfa3, OpstinaPrebivalistaMaticniBroj,
            OpstinaPrebivalistaNaziv, MestoPrebivalistaMaticniBroj, MestoPrebivalistaNaziv,
            DrzavaPrebivalistaAlfa3, MestoRodjenjaNaziv, VrstaPutneIspraveSifra, BrojPutneIsprave,
            DatumIzdavanjaPutneIsprave, DatumUlaskaURepublikuSrbiju, MestoUlaskaURepublikuSrbijuSifra,
            VrstaPruzenihUslugaSifra, NacinDolaskaSifra, RazlogBoravkaSifra,
            DatumICasDolaska, PlaniraniDatumOdlaska, UgostiteljskiObjekatJedinstveniIdentifikator,
            EturistaIdentifikator, CreatedAt, UpdatedAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          externalId, 0, isDomestic ? 1 : 0,
          guest.firstName, guest.lastName,
          fmtDate(guest.dateOfBirth), polSifra(guest.gender),
          guest.jmbg ?? null,
          guest.countryOfBirth ?? "SRB",
          guest.nationality ?? "",
          guest.municipalityOfResidence ?? null,
          osnovniPodaci.OpstinaPrebivalistaNaziv ?? null,
          guest.placeOfResidence ?? null,
          osnovniPodaci.MestoPrebivalistaNaziv ?? null,
          guest.residenceCountry ?? "SRB",
          guest.placeOfBirth ?? null,
          payload.IdentifikacioniDokumentStranogLica?.VrstaPutneIspraveSifra ?? null,
          guest.documentNumber ?? null,
          fmtDate(guest.documentIssueDate) ?? null,
          fmtDate(guest.entryDateToSerbia) ?? null,
          guest.entryPlaceToSerbia ?? null,
          guest.serviceType ?? "1",
          guest.arrivalMode ?? "1",
          guest.stayReason ?? "0",
          arrivalDateTime,
          fmtDate(guest.plannedDepartureDate ?? guest.departureDate) ?? null,
          String(accommodationId),
          eturistaId,
          new Date().toISOString(), new Date().toISOString()
        );
      } catch (dbErr: any) {
        console.error("DB insert error (non-fatal):", dbErr.message);
      }

      logger.audit("CHECKIN_SUCCESS", null,
        `Guest ${guest.firstName} ${guest.lastName} checked in to object ${accommodationId}. eTurista ID: ${eturistaId}`);

      res.json({
        success: true,
        externalId,
        eturistaIdentifikator: eturistaId,
        message: responseData?.message,
        warnings: responseData?.warnings ?? "",
        smestajneJedinice: responseData?.smestajneJedinice ?? [],
      });
    } catch (err: any) {
      logger.error("CHECKIN_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Check-in nije uspeo", details: err.message });
    }
  });

  // ── CHECK-OUT ──────────────────────────────────────────────────────────────
  // POST /hoteliimport/checkout
  app.post("/api/eturista/checkout", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const { externalId, accommodationId, checkoutDateTime, numberOfNights, isAmendment } = req.body;

      if (!token)
        return res.status(401).json({ error: "Authorization header required" });
      if (!externalId || !accommodationId || !checkoutDateTime)
        return res.status(400).json({ error: "Missing required fields: externalId, accommodationId, checkoutDateTime" });

      // numberOfNights: integer ≥ 1, required for legal entities; null for physical persons
      let brojPruzenihUsluga: number | null = null;
      if (numberOfNights != null) {
        brojPruzenihUsluga = parseInt(String(numberOfNights), 10);
        if (isNaN(brojPruzenihUsluga) || brojPruzenihUsluga < 1)
          return res.status(400).json({ error: "numberOfNights must be an integer ≥ 1" });
      }

      const payload: Record<string, any> = {
        Izmena: isAmendment ? "true" : "false",
        ExternalId: externalId,
        UgostiteljskiObjekatJedinstveniIdentifikator: String(accommodationId),
        DatumICasOdjave: checkoutDateTime, // expected "YYYY-MM-DD HH:mm" from client
      };
      if (brojPruzenihUsluga !== null) payload.BrojPruzenihUslugaSmestaja = brojPruzenihUsluga;

      const response = await fetch(`${ETURISTA_BASE_URL}/hoteliimport/checkout`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let responseData: any;
      try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

      if (!response.ok) {
        logger.error("CHECKOUT_HTTP_ERROR", undefined, `HTTP ${response.status}: ${responseText}`);
        return res.status(response.status).json({
          error: "eTurista check-out nije uspeo",
          details: responseData?.errors || responseData?.message || responseText,
        });
      }

      if (responseData?.errors && responseData.errors !== "") {
        logger.error("CHECKOUT_VALIDATION_ERROR", undefined, responseData.errors);
        return res.status(422).json({
          error: "Greška validacije eTuriste",
          details: responseData.errors,
          warnings: responseData.warnings,
        });
      }

      // Mark checked-out in local DB
      try {
        db.prepare("UPDATE Gost SET CheckedOut = 1, UpdatedAt = ? WHERE ExternalId = ?")
          .run(new Date().toISOString(), externalId);
      } catch (dbErr: any) { console.error("DB checkout update (non-fatal):", dbErr.message); }

      logger.audit("CHECKOUT_SUCCESS", null,
        `ExternalId ${externalId} checked out from object ${accommodationId}`);

      res.json({ success: true, message: responseData?.message, warnings: responseData?.warnings ?? "" });
    } catch (err: any) {
      logger.error("CHECKOUT_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Check-out nije uspeo", details: err.message });
    }
  });

  // ─── Local DB lookup endpoints ────────────────────────────────────────────

  app.get("/api/db/countries", (_req, res) => {
    try { res.json(db.prepare("SELECT * FROM Drzava ORDER BY Cirlica ASC").all()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/municipalities", (_req, res) => {
    try { res.json(db.prepare("SELECT * FROM Opstine ORDER BY Naziv ASC").all()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/places/:municipalityId", (req, res) => {
    try {
      res.json(db.prepare(`SELECT * FROM Mesta WHERE "Maticni Broj Opstine" = ? ORDER BY "Naziv Mesta" ASC`).all(req.params.municipalityId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/service-types", (_req, res) => {
    try { res.json(db.prepare(`SELECT * FROM "Vrsta Pruzenih Usluga" ORDER BY Naziv ASC`).all()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/arrival-modes", (_req, res) => {
    try { res.json(db.prepare(`SELECT * FROM "Nacin Dolaska" ORDER BY Naziv ASC`).all()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/stay-reasons", (_req, res) => {
    try { res.json(db.prepare(`SELECT * FROM "Razlog Boravka" ORDER BY Naziv ASC`).all()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/entry-places", (_req, res) => {
    try { res.json(db.prepare(`SELECT * FROM "Mesto Ulaska U Republiku Srbiju" ORDER BY Naziv ASC`).all()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/tables", (_req, res) => {
    try {
      const tables: any[] = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
      res.json(tables.map(t => ({
        name: t.name,
        count: (db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any).count,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/data/:table", (req, res) => {
    try {
      const { table } = req.params;
      if (!/^[a-zA-Z0-9_ ]+$/.test(table))
        return res.status(400).json({ error: "Invalid table name" });
      res.json(db.prepare(`SELECT * FROM "${table}"`).all());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── Log endpoints ────────────────────────────────────────────────────────

  app.get("/api/logs/entries", (_req, res) => {
    try { res.json(db.prepare("SELECT * FROM entry_logs ORDER BY timestamp DESC").all()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/logs/entry", (req, res) => {
    try {
      const { guestName, documentNumber, accommodationId, accommodationName } = req.body;
      logger.entry(guestName, documentNumber, accommodationId, accommodationName);
      res.status(201).json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/logs/audit", (req, res) => {
    try {
      const { action, userId, details } = req.body;
      logger.audit(action, userId, details);
      res.status(201).json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/logs/error", (req, res) => {
    try {
      const { message, stack, context } = req.body;
      logger.error(message, stack, context);
      res.status(201).json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── Vite / static ────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => res.sendFile("dist/index.html", { root: "." }));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://0.0.0.0:${PORT}`));
}

startServer().catch(err => { console.error("Failed to start server:", err); process.exit(1); });
