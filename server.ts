import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import Database from "better-sqlite3";

// ─── Database Setup ───────────────────────────────────────────────────────────
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
  Id                                      INTEGER PRIMARY KEY AUTOINCREMENT,
  ExternalId                              TEXT NOT NULL,
  Izmena                                  INTEGER NOT NULL CHECK (Izmena IN (0,1)),
  DaLiJeLiceDomace                        INTEGER NOT NULL CHECK (DaLiJeLiceDomace IN (0,1)),
  Ime                                     TEXT NOT NULL,
  Prezime                                 TEXT NOT NULL,
  DatumRodjenja                           TEXT NOT NULL,
  PolSifra                                TEXT NOT NULL CHECK (PolSifra IN ('M','Z')),
  Jmbg                                    TEXT CHECK (length(Jmbg) = 13 OR Jmbg IS NULL),
  DrzavaRodjenjaAlfa3                     TEXT NOT NULL DEFAULT 'SRB',
  DrzavljanstvoAlfa3                      TEXT NOT NULL DEFAULT '',
  OpstinaPrebivalistaMaticniBroj          INTEGER,
  OpstinaPrebivalistaNaziv                TEXT,
  MestoPrebivalistaMaticniBroj            INTEGER,
  MestoPrebivalistaNaziv                  TEXT,
  DrzavaPrebivalistaAlfa3                 TEXT NOT NULL DEFAULT 'SRB',
  MestoRodjenjaNaziv                      TEXT,
  VrstaPutneIspraveSifra                  TEXT,
  BrojPutneIsprave                        TEXT,
  DatumIzdavanjaPutneIsprave              TEXT,
  DatumUlaskaURepublikuSrbiju             TEXT,
  MestoUlaskaURepublikuSrbijuSifra        TEXT,
  VrstaPruzenihUslugaSifra                TEXT,
  NacinDolaskaSifra                       TEXT,
  RazlogBoravkaSifra                      TEXT,
  DatumICasDolaska                        TEXT,
  PlaniraniDatumOdlaska                   TEXT,
  UgostiteljskiObjekatJedinstveniIdentifikator INTEGER,
  EturistaIdentifikator                   TEXT,
  CheckedOut                              INTEGER DEFAULT 0,
  CreatedAt                               DATETIME DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt                               DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// ─── Cleanup (logs > 30 days, guests > 31 days) ───────────────────────────────
function cleanupOldRecords() {
  const ago30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const ago31 = new Date(Date.now() - 31 * 86400_000).toISOString();
  db.prepare("DELETE FROM audit_logs WHERE timestamp < ?").run(ago30);
  db.prepare("DELETE FROM error_logs WHERE timestamp < ?").run(ago30);
  db.prepare("DELETE FROM entry_logs WHERE timestamp < ?").run(ago30);
  try {
    const r = db.prepare("DELETE FROM Gost WHERE CreatedAt < ?").run(ago31);
    if (r.changes > 0) console.log(`Cleanup: removed ${r.changes} guest record(s).`);
  } catch (e) {
    console.error("Cleanup error (Gost):", e);
  }
}
cleanupOldRecords();
setInterval(cleanupOldRecords, 86400_000);

// ─── Logger helpers ───────────────────────────────────────────────────────────
const logger = {
  audit(action: string, userId: string | number | null, details: string) {
    try {
      db.prepare("INSERT INTO audit_logs (action,userId,details) VALUES (?,?,?)")
        .run(action, String(userId ?? "system"), details);
    } catch (e) { console.error("audit log error:", e); }
  },
  error(message: string, stack?: string, context?: string) {
    try {
      db.prepare("INSERT INTO error_logs (message,stack,context) VALUES (?,?,?)")
        .run(message, stack ?? "", context ?? "");
    } catch (e) { console.error("error log error:", e); }
  },
  entry(guestName: string, documentNumber: string, accommodationId: number, accommodationName: string) {
    try {
      db.prepare("INSERT INTO entry_logs (guestName,documentNumber,accommodationId,accommodationName) VALUES (?,?,?,?)")
        .run(guestName, documentNumber, accommodationId, accommodationName);
    } catch (e) { console.error("entry log error:", e); }
  },
};

// ─── eTurista API config ──────────────────────────────────────────────────────
// NOTE: swap to test URL during development:
//   https://www.test.portal.eturista.gov.rs/eturistwebapi/api
const ETURISTA_BASE_URL = "https://portal.eturista.gov.rs/eturistwebapi/api";

function getEturistaUrl(req?: express.Request): string {
  const env = req?.header('x-environment') || req?.header('X-Environment');
  if (env === 'prod' || env === 'production') {
    return "https://portal.eturista.gov.rs/eturistwebapi/api";
  } else if (env === 'test') {
    return "https://test.portal.eturista.gov.rs/eturistwebapi/api";
  }
  return ETURISTA_BASE_URL;
}

function getAuthHeader(token?: string): string {
  if (!token) return "";
  if (token.toLowerCase().startsWith("bearer ")) return token;
  return `Bearer ${token}`;
}

// Format a date string "YYYY-MM-DD" → "YYYY-MM-DD" (pass through, validate)
// Format a datetime "YYYY-MM-DD HH:mm" → "YYYY-MM-DD HH:mm" (pass through)
// The eTurista API does NOT accept ISO-8601 with T/Z suffixes.
function formatDate(val: string | null | undefined): string {
  if (!val) return "";
  // Strip any T+time or timezone suffix, keep only date
  return val.split("T")[0];
}

function formatDateTime(date: string | null | undefined, time?: string | null): string {
  if (!date) return "";
  const d = date.split("T")[0];
  const t = (time ?? "12:00").substring(0, 5);
  return `${d} ${t}`;
}

// ─── Express app ─────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Health
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), api: getEturistaUrl(req) });
  });

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  // Spec: POST /Autentifikacija/PrijavaKorisnickoImeLozinka
  // Body: { korisnickoIme, lozinka }
  // Returns: { token, refreshToken, id, ... }
  app.post("/api/eturista/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password)
        return res.status(400).json({ error: "Username and password are required" });

      const response = await fetch(
        `${getEturistaUrl(req)}/Autentifikacija/PrijavaKorisnickoImeLozinka`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ korisnickoIme: username, lozinka: password }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        logger.error("LOGIN_HTTP_ERROR", undefined, `${response.status}: ${text}`);
        return res.status(response.status).json({ error: "eTurista login failed", details: text });
      }

      let data: any = await response.json();
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }

      const token: string | undefined = data.token || data.Token;
      const refreshToken: string | undefined = data.refreshToken || data.RefreshToken;
      const id: number | undefined = data.id || data.Id;

      if (!token || !id) {
        logger.error("LOGIN_BAD_RESPONSE", undefined, JSON.stringify(data));
        return res.status(500).json({ error: "Unexpected response from eTurista" });
      }

      logger.audit("LOGIN_SUCCESS", id, `User ${username} logged in`);
      res.json({ sessionToken: token, refreshToken, userId: id });
    } catch (err: any) {
      logger.error("LOGIN_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Login failed", details: err.message });
    }
  });

  // ── TOKEN REFRESH ──────────────────────────────────────────────────────────
  // Spec: GET /Autentifikacija/OsveziToken
  // Headers: Authorization (Bearer token), RefreshToken
  app.get("/api/eturista/refresh-token", async (req, res) => {
    try {
      const authorization = req.headers.authorization;
      const refreshToken = req.headers["refreshtoken"] as string;

      if (!authorization || !refreshToken)
        return res.status(400).json({ error: "Authorization and RefreshToken headers required" });

      const response = await fetch(
        `${getEturistaUrl(req)}/Autentifikacija/OsveziToken`,
        {
          method: "GET",
          headers: { Authorization: getAuthHeader(authorization), RefreshToken: refreshToken, Accept: "application/json" },
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: "Token refresh failed", details: text });
      }

      let data: any = await response.json();
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) {}
      }
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
  app.get("/api/eturista/accommodations", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const userId = req.query.userId;
      if (!token || !userId)
        return res.status(401).json({ error: "Unauthorized" });

      const response = await fetch(
        `${getEturistaUrl(req)}/UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId?ugostiteljId=${userId}`,
        { headers: { Authorization: getAuthHeader(token), Accept: "application/json" } }
      );

      if (!response.ok) throw new Error(`eTurista error: ${response.status}`);

      let raw: any = await response.json();
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch(e) {}
      }
      const items: any[] = Array.isArray(raw) ? raw : (raw.result || raw.Data || raw.data || []);

      const accommodations = items.map((item: any) => ({
        id: item.id || item.Id,
        name: item.naziv || item.Naziv,
        address: item.adresa || item.Adresa,
        type: item.vrstaObjekta || item.VrstaObjekta,
      }));

      res.json(accommodations);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch accommodations", details: err.message });
    }
  });

  // ── CHECK-IN ───────────────────────────────────────────────────────────────
  // Spec: POST /hoteliimport/checkin
  // Body must use the OsnovniPodaci + PodaciOBoravku structure from spec.
  // For foreign nationals, IdentifikacioniDokumentStranogLica is also required.
  app.post("/api/eturista/checkin", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const { guest, accommodationId } = req.body;

      if (!token)
        return res.status(401).json({ error: "Unauthorized — missing Authorization header" });
      if (!guest || !accommodationId)
        return res.status(400).json({ error: "Missing required fields: guest, accommodationId" });

      // Generate a stable ExternalId (returned to client for later checkout)
      const externalId = `EXT_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const isDomestic: boolean = guest.isDomestic !== false; // default domestic

      // ── Build OsnovniPodaci ──
      const osnovniPodaci: Record<string, any> = {
        ExternalId: externalId,
        Izmena: "false",
        DaLiJeLiceDomace: isDomestic ? "true" : "false",
        DaLiJeLiceRodjenoUInostranstvu: isDomestic ? "false" : "true",
        Ime: guest.firstName,
        Prezime: guest.lastName,
        DatumRodjenja: formatDate(guest.dateOfBirth),
        PolSifra: guest.gender === "Female" || guest.gender === "Ženski" || guest.gender === "Z" ? "Z" : "M",
        DrzavaRodjenjaAlfa3: guest.countryOfBirth || "SRB",
      };

      if (isDomestic) {
        // Domestic-specific fields
        if (guest.jmbg) osnovniPodaci.Jmbg = guest.jmbg;
        osnovniPodaci.DrzavljanstvoAlfa3 = "";
        osnovniPodaci.OpstinaPrebivalistaMaticniBroj = guest.municipalityOfResidence || "";
        osnovniPodaci.OpstinaPrebivalistaNaziv = guest.municipalityOfResidenceName || "";
        osnovniPodaci.MestoPrebivalistaMaticniBroj = guest.placeOfResidence || "";
        osnovniPodaci.MestoPrebivalistaNaziv = guest.placeOfResidenceName || "";
        osnovniPodaci.DrzavaPrebivalistaAlfa3 = guest.residenceCountry || "SRB";
      } else {
        // Foreign-specific fields
        osnovniPodaci.Jmbg = "";
        osnovniPodaci.MestoRodjenjaNaziv = guest.placeOfBirth || "";
        osnovniPodaci.DrzavljanstvoAlfa3 = guest.nationality || "";
      }

      // ── Build PodaciOBoravku ──
      const podaciOBoravku: Record<string, any> = {
        UgostiteljskiObjekatJedinstveniIdentifikator: String(accommodationId),
        VrstaPruzenihUslugaSifra: guest.serviceType || "1",
        NacinDolaskaSifra: guest.arrivalMode || "1",
        DatumICasDolaska: formatDateTime(guest.arrivalDate, guest.arrivalTime),
        UslovZaUmanjenjeBoravisneTakseSifra: guest.taxReductionCondition || "",
        RazlogBoravkaSifra: guest.stayReason || "0",
        PlaniraniDatumOdlaska: formatDate(guest.plannedDepartureDate || guest.departureDate),
      };

      // Agency name only for specific arrival modes (e.g., via agency = code 3)
      if (guest.agencyName) podaciOBoravku.NazivAgencije = guest.agencyName;

      // ── Build full payload ──
      const payload: Record<string, any> = {
        OsnovniPodaci: osnovniPodaci,
        PodaciOBoravku: podaciOBoravku,
      };

      // Foreign guests need identity document section
      if (!isDomestic) {
        payload.IdentifikacioniDokumentStranogLica = {
          VrstaPutneIspraveSifra: guest.documentTypeSifra || "73",
          BrojPutneIsprave: guest.documentNumber || "",
          DatumIzdavanjaPutneIsprave: formatDate(guest.documentIssueDate) || "",
          VrstaVizeSifra: guest.visaType || "",
          BrojVize: guest.visaNumber || "",
          MestoIzdavanjaVize: guest.visaIssuingPlace || "",
          DatumUlaskaURepublikuSrbiju: formatDate(guest.entryDateToSerbia) || "",
          MestoUlaskaURepublikuSrbijuSifra: guest.entryPlaceToSerbia || "",
          MestoUlaskaURepublikuSrbiju: guest.entryPlaceToSerbiaName || "",
          DatumDoKadaJeOdobrenBoravakURepubliciSrbiji: formatDate(guest.stayApprovedUntil) || "",
          Napomena: guest.note || "",
          OrganIzdavanjaPutneIsprave: guest.issuingAuthority || "",
        };
      }

      // ── Call eTurista checkin ──
      const response = await fetch(`${getEturistaUrl(req)}/hoteliimport/checkin`, {
        method: "POST",
        headers: {
          Authorization: getAuthHeader(token),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let responseData: any;
      try { 
        responseData = JSON.parse(responseText); 
        if (typeof responseData === 'string') {
          responseData = JSON.parse(responseData);
        }
      } catch { responseData = { raw: responseText }; }

      if (!response.ok) {
        logger.error(
          "CHECKIN_HTTP_ERROR",
          undefined,
          `HTTP ${response.status}: ${responseText}`
        );
        return res.status(response.status).json({
          error: "eTurista check-in failed",
          details: responseData?.errors || responseData?.message || responseText,
        });
      }

      // eTurista returns errors even on HTTP 200 — check for them
      if (responseData?.errors) {
        logger.error("CHECKIN_VALIDATION_ERROR", undefined, responseData.errors);
        return res.status(422).json({
          error: "eTurista validation error",
          details: responseData.errors,
          warnings: responseData.warnings,
        });
      }

      const eturistaId: string = responseData?.identifikator || "";

      // ── Persist to local DB ──
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
          externalId,
          0,
          isDomestic ? 1 : 0,
          guest.firstName,
          guest.lastName,
          formatDate(guest.dateOfBirth),
          (guest.gender === "Female" || guest.gender === "Ženski" || guest.gender === "Z") ? "Z" : "M",
          guest.jmbg || null,
          guest.countryOfBirth || "SRB",
          guest.nationality || "",
          guest.municipalityOfResidence || null,
          guest.municipalityOfResidenceName || null,
          guest.placeOfResidence || null,
          guest.placeOfResidenceName || null,
          guest.residenceCountry || "SRB",
          guest.placeOfBirth || null,
          guest.documentTypeSifra || null,
          guest.documentNumber || null,
          formatDate(guest.documentIssueDate) || null,
          formatDate(guest.entryDateToSerbia) || null,
          guest.entryPlaceToSerbia || null,
          guest.serviceType || "1",
          guest.arrivalMode || "1",
          guest.stayReason || "0",
          formatDateTime(guest.arrivalDate, guest.arrivalTime),
          formatDate(guest.plannedDepartureDate || guest.departureDate) || null,
          accommodationId,
          eturistaId,
          new Date().toISOString(),
          new Date().toISOString()
        );
      } catch (dbErr: any) {
        console.error("DB insert error (non-fatal):", dbErr.message);
      }

      logger.audit(
        "CHECKIN_SUCCESS",
        null,
        `Guest ${guest.firstName} ${guest.lastName} checked in to object ${accommodationId}. eTurista ID: ${eturistaId}`
      );

      res.json({
        success: true,
        externalId,
        eturistaIdentifikator: eturistaId,
        message: responseData?.message,
        warnings: responseData?.warnings,
        smestajneJedinice: responseData?.smestajneJedinice || [],
      });
    } catch (err: any) {
      logger.error("CHECKIN_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Check-in failed", details: err.message });
    }
  });

  // ── CHECK-OUT ──────────────────────────────────────────────────────────────
  // Spec: POST /hoteliimport/checkout
  // Body: { Izmena, ExternalId, BrojPruzenihUslugaSmestaja, UgostiteljskiObjekatJedinstveniIdentifikator, DatumICasOdjave }
  app.post("/api/eturista/checkout", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const {
        externalId,
        accommodationId,
        checkoutDateTime,
        numberOfNights,
        isAmendment,
      } = req.body;

      if (!token)
        return res.status(401).json({ error: "Unauthorized — missing Authorization header" });
      if (!externalId || !accommodationId || !checkoutDateTime)
        return res.status(400).json({ error: "Missing required fields: externalId, accommodationId, checkoutDateTime" });

      // numberOfNights must be a positive integer (required for legal entities, null for physical persons)
      const brujenihUsluga = numberOfNights != null ? parseInt(numberOfNights, 10) : null;

      const payload: Record<string, any> = {
        Izmena: isAmendment ? "true" : "false",
        ExternalId: externalId,
        UgostiteljskiObjekatJedinstveniIdentifikator: String(accommodationId),
        DatumICasOdjave: formatDateTime(checkoutDateTime.split(" ")[0], checkoutDateTime.split(" ")[1]),
      };

      // BrojPruzenihUslugaSmestaja: mandatory for legal entities, null for physical persons
      if (brujenihUsluga !== null) {
        payload.BrojPruzenihUslugaSmestaja = brujenihUsluga;
      }

      const response = await fetch(`${getEturistaUrl(req)}/hoteliimport/checkout`, {
        method: "POST",
        headers: {
          Authorization: getAuthHeader(token),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let responseData: any;
      try { 
        responseData = JSON.parse(responseText); 
        if (typeof responseData === 'string') {
          responseData = JSON.parse(responseData);
        }
      } catch { responseData = { raw: responseText }; }

      if (!response.ok) {
        logger.error("CHECKOUT_HTTP_ERROR", undefined, `HTTP ${response.status}: ${responseText}`);
        return res.status(response.status).json({
          error: "eTurista check-out failed",
          details: responseData?.errors || responseData?.message || responseText,
        });
      }

      if (responseData?.errors) {
        logger.error("CHECKOUT_VALIDATION_ERROR", undefined, responseData.errors);
        return res.status(422).json({
          error: "eTurista validation error",
          details: responseData.errors,
          warnings: responseData.warnings,
        });
      }

      // Mark as checked out in local DB
      try {
        db.prepare(
          "UPDATE Gost SET CheckedOut = 1, UpdatedAt = ? WHERE ExternalId = ?"
        ).run(new Date().toISOString(), externalId);
      } catch (dbErr: any) {
        console.error("DB checkout update error (non-fatal):", dbErr.message);
      }

      logger.audit("CHECKOUT_SUCCESS", null, `ExternalId ${externalId} checked out from object ${accommodationId}`);

      res.json({
        success: true,
        message: responseData?.message,
        warnings: responseData?.warnings,
      });
    } catch (err: any) {
      logger.error("CHECKOUT_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Check-out failed", details: err.message });
    }
  });

  // ── GET GUESTS ─────────────────────────────────────────────────────────────
  // Spec: POST /Turista/PretragaTurista
  app.post("/api/eturista/guests", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Unauthorized" });

      const response = await fetch(`${getEturistaUrl(req)}/Turista/PretragaTurista`, {
        method: "POST",
        headers: {
          Authorization: getAuthHeader(token),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(req.body),
      });

      const responseText = await response.text();
      let responseData: any;
      try { 
        responseData = JSON.parse(responseText); 
        if (typeof responseData === 'string') {
          responseData = JSON.parse(responseData);
        }
      } catch { responseData = { raw: responseText }; }

      if (!response.ok) {
        logger.error("GUESTS_HTTP_ERROR", undefined, `HTTP ${response.status}: ${responseText}`);
        return res.status(response.status).json({
          error: "eTurista pretraga gostiju failed",
          details: responseData?.errors || responseData?.message || responseData?.error || responseText.substring(0, 255),
          status: response.status,
          url: `${getEturistaUrl(req)}/Turista/PretragaTurista`,
          debug: {
            status: response.status,
            requestBody: req.body,
            responsePreview: responseText.substring(0, 500) || "No response body"
          }
        });
      }

      res.json(responseData);
    } catch (err: any) {
      logger.error("GUESTS_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Pretraga gostiju failed", details: err.message });
    }
  });

  // ─── Local DB endpoints ─────────────────────────────────────────────────────

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
      res.json(
        db.prepare(`SELECT * FROM Mesta WHERE "Maticni Broj Opstine" = ? ORDER BY "Naziv Mesta" ASC`)
          .all(req.params.municipalityId)
      );
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
      res.json(tables.map((t) => ({
        name: t.name,
        count: (db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any).count,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/db/data/:table", (req, res) => {
    try {
      const table = req.params.table;
      if (!/^[a-zA-Z0-9_ ]+$/.test(table))
        return res.status(400).json({ error: "Invalid table name" });
      res.json(db.prepare(`SELECT * FROM "${table}"`).all());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── Log endpoints ──────────────────────────────────────────────────────────

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

  // ─── Vite / static ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => res.sendFile("dist/index.html", { root: "." }));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
