
import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import Database from "better-sqlite3";
import path from "path";

// Initialize Database
const db = new Database("eturista.db");

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    action TEXT,
    userId TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message TEXT,
    stack TEXT,
    context TEXT
  );

  CREATE TABLE IF NOT EXISTS entry_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    guestName TEXT,
    documentNumber TEXT,
    accommodationId INTEGER,
    accommodationName TEXT
  );

  CREATE TABLE IF NOT EXISTS Gost (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ExternalId TEXT NOT NULL,
    Izmena INTEGER NOT NULL CHECK (Izmena IN (0,1)),
    DaLiJeLiceDomace INTEGER NOT NULL CHECK (DaLiJeLiceDomace IN (0,1)),
    Ime TEXT NOT NULL,
    Prezime TEXT NOT NULL,
    DatumRodjenja TEXT NOT NULL,
    PolSifra TEXT NOT NULL CHECK (PolSifra IN ('M','Z')),
    Jmbg TEXT CHECK (length(Jmbg) = 13 OR Jmbg IS NULL),
    DrzavaRodjenjaAlfa3 TEXT NOT NULL DEFAULT 'SRB',
    DrzavljanstvoAlfa3 TEXT NOT NULL DEFAULT '',
    OpstinaPrebivalistaMaticniBroj INTEGER,
    OpstinaPrebivalistaNaziv TEXT,
    MestoPrebivalistaMaticniBroj INTEGER,
    MestoPrebivalistaNaziv TEXT,
    DrzavaPrebivalistaAlfa3 TEXT NOT NULL DEFAULT 'SRB',
    MestoRodjenjaNaziv TEXT,
    VrstaPutneIspraveSifra TEXT,
    BrojPutneIsprave TEXT,
    DatumVazenjaPutneIsprave TEXT,
    DatumIzdavanjaPutneIsprave TEXT,
    DatumUlaskaURepublikuSrbiju TEXT,
    MestoUlaskaURepublikuSrbijuSifra TEXT,
    VrstaPruzenihUslugaSifra TEXT,
    NacinDolaskaSifra TEXT,
    RazlogBoravkaSifra TEXT,
    DatumICasDolaska TEXT,
    PlaniraniDatumOdlaska TEXT,
    UgostiteljskiObjekatJedinstveniIdentifikator INTEGER,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Cleanup Function: Remove logs older than 30 days and guests older than 31 days
function cleanupOldLogs() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const iso30 = thirtyDaysAgo.toISOString();

  const thirtyOneDaysAgo = new Date();
  thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
  const iso31 = thirtyOneDaysAgo.toISOString();
  
  db.prepare("DELETE FROM audit_logs WHERE timestamp < ?").run(iso30);
  db.prepare("DELETE FROM error_logs WHERE timestamp < ?").run(iso30);
  db.prepare("DELETE FROM entry_logs WHERE timestamp < ?").run(iso30);
  
  try {
    const result = db.prepare("DELETE FROM Gost WHERE CreatedAt < ?").run(iso31);
    if (result.changes > 0) {
      console.log(`Cleanup: Removed ${result.changes} guest records older than 31 days.`);
    }
  } catch (e) {
    console.error("Failed to cleanup Gost table:", e);
  }

  console.log(`Cleanup: Processed logs and guest records.`);
}

// Run cleanup on startup and every 24 hours
cleanupOldLogs();
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// Helper functions for logging
const logger = {
  audit: (action: string, userId: string | number | null, details: string) => {
    try {
      db.prepare("INSERT INTO audit_logs (action, userId, details) VALUES (?, ?, ?)").run(action, String(userId || 'system'), details);
    } catch (e) {
      console.error("Failed to log audit:", e);
    }
  },
  error: (message: string, stack?: string, context?: string) => {
    try {
      db.prepare("INSERT INTO error_logs (message, stack, context) VALUES (?, ?, ?)").run(message, stack || '', context || '');
    } catch (e) {
      console.error("Failed to log error:", e);
    }
  },
  entry: (guestName: string, documentNumber: string, accommodationId: number, accommodationName: string) => {
    try {
      db.prepare("INSERT INTO entry_logs (guestName, documentNumber, accommodationId, accommodationName) VALUES (?, ?, ?, ?)").run(guestName, documentNumber, accommodationId, accommodationName);
    } catch (e) {
      console.error("Failed to log entry:", e);
    }
  }
};

const ETURISTA_BASE_URL = 'https://portal.eturista.gov.rs/eturistwebapi/api';

// Robust JSON parsing utility
function robustParse(data: any): any {
  if (typeof data !== 'string') return data;
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === 'string') return robustParse(parsed);
    return parsed;
  } catch (e) {
    return data;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Professional eTurista Integration Endpoints
  app.post("/api/eturista/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const response = await fetch(`${ETURISTA_BASE_URL}/Autentifikacija/PrijavaKorisnickoImeLozinka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ korisnickoIme: username, lozinka: password })
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Invalid credentials or eTurista error" });
      }

      const rawData = await response.json();
      const data = robustParse(rawData);

      // Map to our own model
      const token = data.token || data.Token || data.access_token || data.result?.token || data.result?.Token || data.data?.token;
      const id = data.id || data.Id || data.result?.id || data.result?.Id || (data.korisnik ? (data.korisnik.id || data.korisnik.Id) : null) || data.data?.id;

      if (token && id) {
        return res.json({ 
          sessionToken: String(token), 
          userId: Number(id) 
        });
      }
      logger.error('LOGIN_FAILED', undefined, `Unexpected response format for user ${username}`);
      res.status(500).json({ error: "Unexpected response format from eTurista" });
    } catch (error: any) {
      logger.error('LOGIN_EXCEPTION', error.stack, `User ${req.body.username} failed to login: ${error.message}`);
      res.status(500).json({ error: "Login failed", details: error.message });
    }
  });

  app.get("/api/eturista/accommodations", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const userId = req.query.userId;

      if (!token || !userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const response = await fetch(`${ETURISTA_BASE_URL}/UgostiteljskiObjekat/vratiUgostiteljskeObjektePremaUgostiteljId?ugostiteljId=${userId}`, {
        headers: { 'Authorization': token, 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`eTurista error: ${response.status}`);

      const rawData = await response.json();
      const data = robustParse(rawData);
      const items = Array.isArray(data) ? data : (data.result || data.Data || data.data || []);

      // Map to our own model
      const accommodations = items.map((item: any) => ({
        id: item.id || item.Id,
        name: item.naziv || item.Naziv,
        address: item.adresa || item.Adresa,
        type: item.vrstaObjekta || item.VrstaObjekta
      }));

      res.json(accommodations);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch accommodations", details: error.message });
    }
  });

  app.post("/api/eturista/register", async (req, res) => {
    try {
      const token = req.headers.authorization;
      const { guest, accommodationId } = req.body;

      if (!token || !guest || !accommodationId) {
        return res.status(400).json({ error: "Missing required data" });
      }

      // 1. Insert into local Gost table
      try {
        const now = new Date().toISOString();
        const insertGost = db.prepare(`
          INSERT INTO Gost (
            ExternalId, Izmena, DaLiJeLiceDomace, Ime, Prezime, DatumRodjenja, PolSifra, Jmbg,
            DrzavaRodjenjaAlfa3, DrzavljanstvoAlfa3, OpstinaPrebivalistaMaticniBroj, OpstinaPrebivalistaNaziv,
            MestoPrebivalistaMaticniBroj, MestoPrebivalistaNaziv, DrzavaPrebivalistaAlfa3,
            MestoRodjenjaNaziv, VrstaPutneIspraveSifra, BrojPutneIsprave, DatumVazenjaPutneIsprave,
            DatumIzdavanjaPutneIsprave, DatumUlaskaURepublikuSrbiju, MestoUlaskaURepublikuSrbijuSifra,
            VrstaPruzenihUslugaSifra, NacinDolaskaSifra, RazlogBoravkaSifra,
            DatumICasDolaska, PlaniraniDatumOdlaska, UgostiteljskiObjekatJedinstveniIdentifikator, CreatedAt, UpdatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Get names for municipality and place if IDs are provided
        let opstinaNaziv = null;
        if (guest.municipalityOfResidence) {
          const row = db.prepare("SELECT Naziv FROM Opstine WHERE \"Maticni Broj\" = ?").get(guest.municipalityOfResidence) as any;
          if (row) opstinaNaziv = row.Naziv;
        }

        let mestoNaziv = null;
        if (guest.placeOfResidence) {
          const row = db.prepare("SELECT \"Naziv Mesta\" FROM Mesta WHERE \"Maticni Broj Mesta\" = ?").get(guest.placeOfResidence) as any;
          if (row) mestoNaziv = row["Naziv Mesta"];
        }

        const arrivalDateTime = `${guest.arrivalDate} ${guest.arrivalTime || '12:00'}`;

        insertGost.run(
          `EXT_${Date.now()}`, // ExternalId
          0, // Izmena
          guest.isDomestic ? 1 : 0, // DaLiJeLiceDomace
          guest.firstName,
          guest.lastName,
          guest.dateOfBirth,
          guest.gender === 'Female' ? 'Z' : 'M',
          guest.jmbg || null,
          guest.countryOfBirth || 'SRB',
          guest.nationality || '',
          guest.municipalityOfResidence || null,
          opstinaNaziv,
          guest.placeOfResidence || null,
          mestoNaziv,
          guest.residenceCountry || 'SRB',
          guest.placeOfBirth || '',
          guest.documentType === 'Passport' ? 'P' : 'L', // Sifra
          guest.documentNumber,
          guest.expiryDate || null,
          guest.documentIssueDate || null,
          guest.entryDateToSerbia || null,
          guest.entryPlaceToSerbia || null,
          guest.serviceType || '1',
          guest.arrivalMode || '1',
          guest.stayReason || '4',
          arrivalDateTime,
          guest.plannedDepartureDate || null,
          accommodationId,
          now,
          now
        );
      } catch (dbError: any) {
        console.error("Failed to insert into Gost table:", dbError);
        // We continue with eTurista registration even if local DB fails
      }

      const formatPayloadDate = (dateStr: string) => {
        if (!dateStr) return null;
        return `${dateStr}T00:00:00Z`;
      };

      // Map our model to eTurista model for the API call
      const payload = {
        ObjekatId: accommodationId,
        Ime: guest.firstName,
        Prezime: guest.lastName,
        DatumRodjenja: formatPayloadDate(guest.dateOfBirth),
        MestoRodjenja: guest.placeOfBirth || "Nepoznato",
        PolId: guest.gender === 'Female' ? 2 : 1,
        VrstaIspraveId: guest.documentType === 'Passport' ? 1 : 2,
        BrojIsprave: guest.documentNumber,
        DatumVazenjaIsprave: formatPayloadDate(guest.expiryDate),
        DatumDolaska: formatPayloadDate(guest.arrivalDate),
        VrstaTuristeId: 2, 
        RazlogBoravkaId: guest.stayReason || 1 
      };

      const response = await fetch(`${ETURISTA_BASE_URL}/Turista/Create`, {
        method: 'POST',
        headers: { 
          'Authorization': token, 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error('REGISTRATION_FAILED', undefined, `Registration failed for ${guest.firstName} ${guest.lastName}: ${text}`);
        return res.status(response.status).json({ error: text });
      }

      logger.audit('REGISTRATION_SUCCESS', null, `Guest ${guest.firstName} ${guest.lastName} registered to object ${accommodationId}`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('REGISTRATION_EXCEPTION', error.stack, `Registration exception: ${error.message}`);
      res.status(500).json({ error: "Registration failed", details: error.message });
    }
  });

  app.get("/api/eturista/cities", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Unauthorized" });

      const response = await fetch(`${ETURISTA_BASE_URL}/RGZ/gradovi`, {
        headers: { 'Authorization': token, 'Accept': 'application/json' }
      });

      if (!response.ok) return res.json([]);

      const rawData = await response.json();
      const data = robustParse(rawData);
      const items = Array.isArray(data) ? data : (data.result || data.Data || data.data || []);

      // Map to our own model
      const cities = items.map((item: any) => ({
        id: item.id || item.Id,
        name: item.naziv || item.Naziv
      }));

      res.json(cities);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch cities", details: error.message });
    }
  });

  // Database Explorer Endpoints
  app.get("/api/db/countries", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM Drzava ORDER BY Cirlica ASC").all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch countries", details: error.message });
    }
  });

  app.get("/api/db/municipalities", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM Opstine ORDER BY Naziv ASC").all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch municipalities", details: error.message });
    }
  });

  app.get("/api/db/places/:municipalityId", (req, res) => {
    try {
      const { municipalityId } = req.params;
      const data = db.prepare("SELECT * FROM Mesta WHERE \"Maticni Broj Opstine\" = ? ORDER BY \"Naziv Mesta\" ASC").all(municipalityId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch places", details: error.message });
    }
  });

  app.get("/api/db/service-types", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM \"Vrsta Pruzenih Usluga\" ORDER BY Naziv ASC").all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch service types", details: error.message });
    }
  });

  app.get("/api/db/arrival-modes", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM \"Nacin Dolaska\" ORDER BY Naziv ASC").all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch arrival modes", details: error.message });
    }
  });

  app.get("/api/db/stay-reasons", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM \"Razlog Boravka\" ORDER BY Naziv ASC").all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch stay reasons", details: error.message });
    }
  });

  app.get("/api/db/entry-places", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM \"Mesto Ulaska U Republiku Srbiju\" ORDER BY Naziv ASC").all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch entry places", details: error.message });
    }
  });

  app.get("/api/db/tables", (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      const tablesWithCounts = tables.map((t: any) => {
        const count = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
        return { name: t.name, count: count.count };
      });
      res.json(tablesWithCounts);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch tables", details: error.message });
    }
  });

  app.get("/api/db/data/:table", (req, res) => {
    try {
      const table = req.params.table;
      // Basic protection against SQL injection (only allow alphanumeric and spaces/underscores for table names)
      if (!/^[a-zA-Z0-9_ ]+$/.test(table)) {
        return res.status(400).json({ error: "Invalid table name" });
      }
      const data = db.prepare(`SELECT * FROM "${table}"`).all();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch table data", details: error.message });
    }
  });

  // Log Endpoints
  app.get("/api/logs/entries", (req, res) => {
    try {
      const entries = db.prepare("SELECT * FROM entry_logs ORDER BY timestamp DESC").all();
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch entries", details: error.message });
    }
  });

  app.post("/api/logs/entry", (req, res) => {
    try {
      const { guestName, documentNumber, accommodationId, accommodationName } = req.body;
      logger.entry(guestName, documentNumber, accommodationId, accommodationName);
      res.status(201).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to save entry log", details: error.message });
    }
  });

  app.post("/api/logs/audit", (req, res) => {
    try {
      const { action, userId, details } = req.body;
      logger.audit(action, userId, details);
      res.status(201).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to save audit log", details: error.message });
    }
  });

  app.post("/api/logs/error", (req, res) => {
    try {
      const { message, stack, context } = req.body;
      logger.error(message, stack, context);
      res.status(201).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to save error log", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
