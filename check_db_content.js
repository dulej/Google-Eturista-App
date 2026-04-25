import Database from 'better-sqlite3';
const db = new Database('eturista.db');

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in database:', tables.map(t => t.name));

  for (const table of tables) {
    if (table.name === 'sqlite_sequence') continue;
    const count = db.prepare(`SELECT count(*) as count FROM "${table.name}"`).get();
    console.log(`Table ${table.name}: ${count.count} rows`);
  }
} catch (error) {
  console.error('Database error:', error.message);
} finally {
  db.close();
}
