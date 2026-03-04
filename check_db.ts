
import Database from "better-sqlite3";
try {
  const db = new Database("eturista.db");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  console.log("Tables:", tables);
  for (const table of tables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get();
    console.log(`Table ${table.name}: ${count.count} rows`);
  }
} catch (e) {
  console.error("Database error:", e);
}
