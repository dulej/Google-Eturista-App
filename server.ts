import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === "production";

// Official API base URLs (from documentation v4.9)
const API_BASE = IS_PROD
  ? "https://www.portal.eturista.gov.rs/eturistwebapi/api"
  : "https://www.test.portal.eturista.gov.rs/eturistwebapi/api";

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database("eturista.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS Gost (
    Id                                           INTEGER PRIMARY KEY AUTOINCREMENT,
    ExternalId                                   TEXT NOT NULL UNIQUE,
    EturistaIdentifikator                        TEXT,
    Izmena                                       INTEGER NOT NULL DEFAULT 0,
    DaLiJeLiceDomace                             INTEGER NOT NULL,
    DaLiJeLiceRodjenoUInostranstvu               INTEGER NOT NULL DEFAULT 0,
    Ime                                          TEXT NOT NULL,
    Prezime                                      TEXT NOT NULL,
    DatumRodjenja                                TEXT NOT NULL,
    PolSifra                                     TEXT NOT NULL,
    Jmbg                                         TEXT,
    DrzavaRodjenjaAlfa3                          TEXT,
    DrzavljanstvoAlfa3                           TEXT,
    OpstinaPrebivalistaMaticniBroj               TEXT,
    OpstinaPrebivalistaNaziv                     TEXT,
    MestoPrebivalistaMaticniBroj                 TEXT,
    MestoPrebivalistaNaziv                       TEXT,
    DrzavaPrebivalistaAlfa3                      TEXT,
    MestoRodjenjaNaziv                           TEXT,
    VrstaPutneIspraveSifra                       TEXT,
    BrojPutneIsprave                             TEXT,
    DatumIzdavanjaPutneIsprave                   TEXT,
    DatumUlaskaURepublikuSrbiju                  TEXT,
    MestoUlaskaURepublikuSrbijuSifra             TEXT,
    MestoUlaskaURepublikuSrbijuNaziv             TEXT,
    UgostiteljskiObjekatJedinstveniIdentifikator TEXT NOT NULL,
    VrstaPruzenihUslugaSifra                     TEXT,
    NacinDolaskaSifra                            TEXT,
    NazivAgencije                                TEXT,
    DatumICasDolaska                             TEXT NOT NULL,
    UslovZaUmanjenjeBoravisneTakseSifra          TEXT,
    RazlogBoravkaSifra                           TEXT,
    PlaniraniDatumOdlaska                        TEXT,
    DatumICasOdjave                              TEXT,
    BrojPruzenihUslugaSmestaja                   TEXT,
    Warnings                                     TEXT,
    CreatedAt                                    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt                                    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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
`);

// ─── Cleanup (deferred — does not block startup) ──────────────────────────────

function cleanup() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 31);
  const iso = cutoff.toISOString();
  db.prepare("DELETE FROM audit_logs WHERE timestamp < ?").run(iso);
  db.prepare("DELETE FROM error_logs WHERE timestamp < ?").run(iso);
  const r = db.prepare("DELETE FROM Gost WHERE CreatedAt < ?").run(iso);
  if (r.changes > 0) console.log(`Cleanup: removed ${r.changes} guest records.`);
}
setImmediate(cleanup);
setInterval(cleanup, 24 * 60 * 60 * 1000);

// ─── Logger ───────────────────────────────────────────────────────────────────

const log = {
  audit(action: string, userId: string | null, details: string) {
    try { db.prepare("INSERT INTO audit_logs (action, userId, details) VALUES (?,?,?)").run(action, userId ?? "system", details); }
    catch (e) { console.error("audit log:", e); }
  },
  error(message: string, stack = "", context = "") {
    try { db.prepare("INSERT INTO error_logs (message, stack, context) VALUES (?,?,?)").run(message, stack, context); }
    catch (e) { console.error("error log:", e); }
  },
};

// ─── Auth guard ───────────────────────────────────────────────────────────────

function getToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  return auth ? auth : null;
}

// ─── eTurista payload builder (spec v4.9) ────────────────────────────────────
// Maps our internal GuestData to the exact JSON the API requires.
// Endpoint: POST /hoteliimport/checkin

function buildCheckinPayload(guest: any, accommodationId: string | number, externalId: string): object {
  const isDomestic = guest.isDomestic === true || guest.isDomestic === "true";
  const polSifra = ["Ženski", "Z", "Female"].includes(guest.gender) ? "Z" : "M";

  // ── OsnovniPodaci ──────────────────────────────────────────────────────────
  const osnovniPodaci: Record<string, any> = {
    ExternalId:                    externalId,
    Izmena:                        "false",
    DaLiJeLiceDomace:              isDomestic ? "true" : "false",
    DaLiJeLiceRodjenoUInostranstvu: isDomestic ? "false" : "true",
    Ime:                           guest.firstName,
    Prezime:                       guest.lastName,
    DatumRodjenja:                 guest.dateOfBirth,
    PolSifra:                      polSifra,
    Jmbg:                          guest.jmbg || "",
    DrzavaRodjenjaAlfa3:           guest.countryOfBirth || (isDomestic ? "SRB" : ""),
    DrzavljanstvoAlfa3:            isDomestic ? "" : (guest.nationality || ""),
  };

  if (isDomestic) {
    // Residence data — only for domestic guests
    if (guest.municipalityOfResidence) {
      osnovniPodaci.OpstinaPrebivalistaMaticniBroj = String(guest.municipalityOfResidence);
      // Look up name from local DB if not provided
      if (guest.municipalityOfResidenceName) {
        osnovniPodaci.OpstinaPrebivalistaNaziv = guest.municipalityOfResidenceName;
      } else {
        const row = db.prepare('SELECT Naziv FROM Opstine WHERE "Maticni Broj" = ?').get(guest.municipalityOfResidence) as any;
        if (row) osnovniPodaci.OpstinaPrebivalistaNaziv = row.Naziv;
      }
    }
    if (guest.placeOfResidence) {
      osnovniPodaci.MestoPrebivalistaMaticniBroj = String(guest.placeOfResidence);
      if (guest.placeOfResidenceName) {
        osnovniPodaci.MestoPrebivalistaNaziv = guest.placeOfResidenceName;
      } else {
        const row = db.prepare('SELECT "Naziv Mesta" FROM Mesta WHERE "Maticni Broj Mesta" = ?').get(guest.placeOfResidence) as any;
        if (row) osnovniPodaci.MestoPrebivalistaNaziv = row["Naziv Mesta"];
      }
    }
    osnovniPodaci.DrzavaPrebivalistaAlfa3 = guest.residenceCountry || "SRB";
  } else {
    // Place of birth — only for foreign guests
    if (guest.placeOfBirth) osnovniPodaci.MestoRodjenjaNaziv = guest.placeOfBirth;
  }

  // ── IdentifikacioniDokumentStranogLica (foreign only) ─────────────────────
  let identDoc: Record<string, any> | undefined;
  if (!isDomestic) {
    identDoc = {
      VrstaPutneIspraveSifra:                      guest.documentTypeCode || "72",
      BrojPutneIsprave:                            guest.documentNumber || "",
      DatumIzdavanjaPutneIsprave:                  guest.documentIssueDate || "",
      VrstaVizeSifra:                              "",
      BrojVize:                                    "",
      MestoIzdavanjaVize:                          "",
      DatumUlaskaURepublikuSrbiju:                 guest.entryDateToSerbia || "",
      MestoUlaskaURepublikuSrbijuSifra:            String(guest.entryPlaceToSerbia || ""),
      MestoUlaskaURepublikuSrbiju:                 guest.entryPlaceToSerbiaName || "",
      DatumDoKadaJeOdobrenBoravakURepubliciSrbiji: "",
      Napomena:                                    "",
      OrganIzdavanjaPutneIsprave:                  "",
    };
  }

  // ── PodaciOBoravku ─────────────────────────────────────────────────────────
  const nacinDolaska = String(guest.arrivalMode || "1");
  const podaciOBoravku: Record<string, any> = {
    UgostiteljskiObjekatJedinstveniIdentifikator: String(accommodationId),
    VrstaPruzenihUslugaSifra:                     String(guest.serviceType || "1"),
    NacinDolaskaSifra:                            nacinDolaska,
    DatumICasDolaska:                             `${guest.arrivalDate} ${guest.arrivalTime || "12:00"}`,
    UslovZaUmanjenjeBoravisneTakseSifra:          "",
    RazlogBoravkaSifra:                           String(guest.stayReason ?? "0"),
    PlaniraniDatumOdlaska:                        guest.plannedDepartureDate || guest.departureDate || "",
  };

  // Agency name required when arrival mode is 2 or 4
  if (nacinDolaska === "2" || nacinDolaska === "4") {
    podaciOBoravku.NazivAgencije = guest.agencyName || "";
  }

  const payload: Record<string, any> = { OsnovniPodaci: osnovniPodaci };
  if (identDoc) payload.IdentifikacioniDokumentStranogLica = identDoc;
  payload.PodaciOBoravku = podaciOBoravku;

  return payload;
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", env: IS_PROD ? "production" : "test", api: API_BASE })
  );

  // ── Login ─────────────────────────────────────────────────────────────────
  app.post("/api/eturista/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Korisničko ime i lozinka su obavezni." });

    try {
      const r = await fetch(`${API_BASE}/Autentifikacija/PrijavaKorisnickoImeLozinka`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ korisnickoIme: username, lozinka: password }),
      });

      if (!r.ok) return res.status(r.status).json({ error: "Neispravni podaci za prijavu." });

      const data = await r.json() as any;
      const token = data.token;
      const id    = data.id;

      if (!token || id == null) {
        log.error("LOGIN_BAD_FORMAT", "", `User: ${username}`);
        return res.status(500).json({ error: "Neočekivan format odgovora eTurista servisa." });
      }

      res.json({ sessionToken: String(token), userId: Number(id) });
    } catch (err: any) {
      log.error("LOGIN_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Prijava nije uspela.", details: err.message });
    }
  });

  // ── Accommodations ────────────────────────────────────────────────────────
  app.get("/api/eturista/accommodations", async (req, res) => {
    const token  = getToken(req);
    const userId = req.query.userId;
    if (!token || !userId) return res.status(401).json({ error: "Token i userId su obavezni." });

    try {
      const r = await fetch(
        `${API_BASE}/UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId?ugostiteljId=${userId}`,
        { headers: { Authorization: token, Accept: "application/json" } }
      );
      if (!r.ok) throw new Error(`eTurista ${r.status}`);

      const data = await r.json() as any;
      const items: any[] = Array.isArray(data) ? data : (data.result || data.Data || data.data || []);

      res.json(items.map((item: any) => ({
        id:      item.id    ?? item.Id,
        name:    item.naziv ?? item.Naziv,
        address: item.adresa ?? item.Adresa,
        type:    item.vrstaObjekta ?? item.VrstaObjekta,
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Nije moguće dohvatiti smeštajne objekte.", details: err.message });
    }
  });

  // ── Checkin (prijava gosta) ───────────────────────────────────────────────
  // Endpoint: POST /hoteliimport/checkin
  // Saves all request data + identifikator from response to local DB.

  app.post("/api/eturista/register", async (req, res) => {
    const token = getToken(req);
    const { guest, accommodationId } = req.body;

    if (!token || !guest || !accommodationId) {
      return res.status(400).json({ error: "Token, podaci gosta i ID objekta su obavezni." });
    }

    const externalId = `EXT-${randomUUID()}`;
    const payload    = buildCheckinPayload(guest, accommodationId, externalId);

    console.log("\n[checkin] →", JSON.stringify(payload, null, 2));

    try {
      const r = await fetch(`${API_BASE}/hoteliimport/checkin`, {
        method: "POST",
        headers: {
          Authorization:  token,
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await r.text();
      console.log(`[checkin] ← ${r.status}: ${responseText}`);

      // Parse response
      let responseData: any = {};
      try { responseData = JSON.parse(responseText); } catch { /* non-JSON */ }

      if (!r.ok || responseData.errors) {
        const errMsg = responseData.errors || responseData.message || responseText;
        log.error("CHECKIN_FAILED", "", `${guest.firstName} ${guest.lastName}: ${errMsg}`);
        return res.status(r.ok ? 422 : r.status).json({
          error: errMsg,
          warnings: responseData.warnings || [],
        });
      }

      const identifikator  = responseData.identifikator || null;
      const warnings       = responseData.warnings ? JSON.stringify(responseData.warnings) : null;
      const isDomestic     = guest.isDomestic === true || guest.isDomestic === "true";
      const polSifra       = ["Ženski", "Z", "Female"].includes(guest.gender) ? "Z" : "M";
      const nacinDolaska   = String(guest.arrivalMode || "1");
      const arrivalDateTime = `${guest.arrivalDate} ${guest.arrivalTime || "12:00"}`;

      // Resolve municipality and place names from local DB if only IDs were provided
      let opstinaNaziv = guest.municipalityOfResidenceName || null;
      if (!opstinaNaziv && guest.municipalityOfResidence) {
        const row = db.prepare('SELECT Naziv FROM Opstine WHERE "Maticni Broj" = ?').get(guest.municipalityOfResidence) as any;
        if (row) opstinaNaziv = row.Naziv;
      }
      let mestoNaziv = guest.placeOfResidenceName || null;
      if (!mestoNaziv && guest.placeOfResidence) {
        const row = db.prepare('SELECT "Naziv Mesta" FROM Mesta WHERE "Maticni Broj Mesta" = ?').get(guest.placeOfResidence) as any;
        if (row) mestoNaziv = row["Naziv Mesta"];
      }

      // Save full registration data + identifikator to local DB
      db.prepare(`
        INSERT INTO Gost (
          ExternalId, EturistaIdentifikator, Izmena, DaLiJeLiceDomace, DaLiJeLiceRodjenoUInostranstvu,
          Ime, Prezime, DatumRodjenja, PolSifra, Jmbg,
          DrzavaRodjenjaAlfa3, DrzavljanstvoAlfa3,
          OpstinaPrebivalistaMaticniBroj, OpstinaPrebivalistaNaziv,
          MestoPrebivalistaMaticniBroj,   MestoPrebivalistaNaziv,
          DrzavaPrebivalistaAlfa3, MestoRodjenjaNaziv,
          VrstaPutneIspraveSifra, BrojPutneIsprave, DatumIzdavanjaPutneIsprave,
          DatumUlaskaURepublikuSrbiju, MestoUlaskaURepublikuSrbijuSifra, MestoUlaskaURepublikuSrbijuNaziv,
          UgostiteljskiObjekatJedinstveniIdentifikator,
          VrstaPruzenihUslugaSifra, NacinDolaskaSifra, NazivAgencije,
          DatumICasDolaska, UslovZaUmanjenjeBoravisneTakseSifra,
          RazlogBoravkaSifra, PlaniraniDatumOdlaska, Warnings
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        externalId,
        identifikator,
        0,
        isDomestic ? 1 : 0,
        isDomestic ? 0 : 1,
        guest.firstName,
        guest.lastName,
        guest.dateOfBirth,
        polSifra,
        guest.jmbg || null,
        guest.countryOfBirth || (isDomestic ? "SRB" : null),
        isDomestic ? null : (guest.nationality || null),
        isDomestic ? (guest.municipalityOfResidence ? String(guest.municipalityOfResidence) : null) : null,
        isDomestic ? opstinaNaziv : null,
        isDomestic ? (guest.placeOfResidence ? String(guest.placeOfResidence) : null) : null,
        isDomestic ? mestoNaziv : null,
        isDomestic ? (guest.residenceCountry || "SRB") : null,
        !isDomestic ? (guest.placeOfBirth || null) : null,
        !isDomestic ? (guest.documentTypeCode || "72") : null,
        !isDomestic ? (guest.documentNumber || null) : null,
        !isDomestic ? (guest.documentIssueDate || null) : null,
        !isDomestic ? (guest.entryDateToSerbia || null) : null,
        !isDomestic ? (guest.entryPlaceToSerbia ? String(guest.entryPlaceToSerbia) : null) : null,
        !isDomestic ? (guest.entryPlaceToSerbiaName || null) : null,
        String(accommodationId),
        guest.serviceType || "1",
        nacinDolaska,
        (nacinDolaska === "2" || nacinDolaska === "4") ? (guest.agencyName || null) : null,
        arrivalDateTime,
        "",
        String(guest.stayReason ?? "0"),
        guest.plannedDepartureDate || guest.departureDate || null,
        warnings,
      );

      log.audit("CHECKIN_SUCCESS", null,
        `${guest.firstName} ${guest.lastName} → objekat ${accommodationId} (ID: ${identifikator}, ExtID: ${externalId})`);

      res.json({
        success:       true,
        message:       responseData.message,
        identifikator: identifikator,
        externalId:    externalId,
        warnings:      responseData.warnings || [],
      });
    } catch (err: any) {
      log.error("CHECKIN_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Registracija nije uspela.", details: err.message });
    }
  });

  // ── Checkout (odjava gosta) ───────────────────────────────────────────────
  // Endpoint: POST /hoteliimport/checkout
  // Requires: ExternalId (from checkin response), accommodationId, checkoutDateTime, serviceCount

  app.post("/api/eturista/checkout", async (req, res) => {
    const token = getToken(req);
    const { externalId, accommodationId, checkoutDateTime, serviceCount } = req.body;

    if (!token || !externalId || !accommodationId || !checkoutDateTime) {
      return res.status(400).json({ error: "Token, externalId, accommodationId i checkoutDateTime su obavezni." });
    }

    const payload = {
      Izmena:                                      "false",
      ExternalId:                                  externalId,
      BrojPruzenihUslugaSmestaja:                  serviceCount != null ? String(serviceCount) : null,
      UgostiteljskiObjekatJedinstveniIdentifikator: String(accommodationId),
      DatumICasOdjave:                             checkoutDateTime, // format: "yyyy-MM-dd HH:mm"
    };

    console.log("\n[checkout] →", JSON.stringify(payload, null, 2));

    try {
      const r = await fetch(`${API_BASE}/hoteliimport/checkout`, {
        method: "POST",
        headers: {
          Authorization:  token,
          "Content-Type": "application/json",
          Accept:         "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await r.text();
      console.log(`[checkout] ← ${r.status}: ${responseText}`);

      let responseData: any = {};
      try { responseData = JSON.parse(responseText); } catch { /* non-JSON */ }

      if (!r.ok || responseData.errors) {
        const errMsg = responseData.errors || responseData.message || responseText;
        log.error("CHECKOUT_FAILED", "", `ExternalId ${externalId}: ${errMsg}`);
        return res.status(r.ok ? 422 : r.status).json({ error: errMsg });
      }

      // Update local DB record with checkout time and service count
      db.prepare(`
        UPDATE Gost SET DatumICasOdjave = ?, BrojPruzenihUslugaSmestaja = ?, UpdatedAt = CURRENT_TIMESTAMP
        WHERE ExternalId = ?
      `).run(checkoutDateTime, serviceCount != null ? String(serviceCount) : null, externalId);

      log.audit("CHECKOUT_SUCCESS", null,
        `ExternalId ${externalId} → objekat ${accommodationId} odjava ${checkoutDateTime}`);

      res.json({
        success:  true,
        message:  responseData.message,
        warnings: responseData.warnings || [],
      });
    } catch (err: any) {
      log.error("CHECKOUT_EXCEPTION", err.stack, err.message);
      res.status(500).json({ error: "Odjava nije uspela.", details: err.message });
    }
  });

  // ── Guest history (from local DB) ─────────────────────────────────────────
  app.get("/api/guests", (_req, res) => {
    try {
      const guests = db.prepare(`
        SELECT Id, ExternalId, EturistaIdentifikator, Ime, Prezime, DatumRodjenja, PolSifra,
               DaLiJeLiceDomace, DrzavaRodjenjaAlfa3, BrojPutneIsprave,
               UgostiteljskiObjekatJedinstveniIdentifikator,
               DatumICasDolaska, PlaniraniDatumOdlaska, DatumICasOdjave,
               Warnings, CreatedAt
        FROM Gost ORDER BY CreatedAt DESC LIMIT 500
      `).all();
      res.json(guests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Reference data from local DB ──────────────────────────────────────────
  const dbq = (sql: string) => (_req: express.Request, res: express.Response) => {
    try { res.json(db.prepare(sql).all()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  };

  app.get("/api/db/countries",      dbq('SELECT * FROM Drzava ORDER BY Cirlica ASC'));
  app.get("/api/db/municipalities", dbq('SELECT * FROM Opstine ORDER BY Naziv ASC'));
  app.get("/api/db/service-types",  dbq('SELECT * FROM "Vrsta Pruzenih Usluga" ORDER BY Naziv ASC'));
  app.get("/api/db/arrival-modes",  dbq('SELECT * FROM "Nacin Dolaska" ORDER BY Naziv ASC'));
  app.get("/api/db/stay-reasons",   dbq('SELECT * FROM "Razlog Boravka" ORDER BY Naziv ASC'));
  app.get("/api/db/entry-places",   dbq('SELECT * FROM "Mesto Ulaska U Republiku Srbiju" ORDER BY Naziv ASC'));
  app.get("/api/db/doc-types",      dbq('SELECT * FROM "Vrsta Putne Isprave" ORDER BY Naziv ASC'));

  app.get("/api/db/places/:municipalityId", (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM Mesta WHERE "Maticni Broj Opstine" = ? ORDER BY "Naziv Mesta" ASC').all(req.params.municipalityId));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Error logging from frontend ───────────────────────────────────────────
  app.post("/api/logs/error", (req, res) => {
    const { message, stack, context } = req.body;
    log.error(message || "unknown", stack, context);
    res.status(201).json({ success: true });
  });

  // ── Vite dev / static prod ────────────────────────────────────────────────
  if (!IS_PROD) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => res.sendFile("dist/index.html", { root: "." }));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀  http://0.0.0.0:${PORT}  [${IS_PROD ? "PRODUCTION" : "TEST"}]`);
    console.log(`📡  ${API_BASE}\n`);
  });
}

startServer().catch(err => { console.error("Server failed:", err); process.exit(1); });
