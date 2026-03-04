
import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import Database from "better-sqlite3";
import path from "path";

// Initialize Database
const db = new Database("eturista.db");

// Create Tables
db.exec(`
  DROP TABLE IF EXISTS guests;

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
`);

// Cleanup Function: Remove logs older than 30 days
function cleanupOldLogs() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const isoString = thirtyDaysAgo.toISOString();
  
  db.prepare("DELETE FROM audit_logs WHERE timestamp < ?").run(isoString);
  db.prepare("DELETE FROM error_logs WHERE timestamp < ?").run(isoString);
  db.prepare("DELETE FROM entry_logs WHERE timestamp < ?").run(isoString);
  console.log(`Cleanup: Removed log records older than 30 days.`);
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
        logger.audit('LOGIN_SUCCESS', id, `User ${username} logged in successfully`);
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

      const formatPayloadDate = (dateStr: string) => {
        if (!dateStr) return null;
        return `${dateStr}T00:00:00Z`;
      };

      // Map our model to eTurista model
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
        RazlogBoravkaId: 1 
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
