const Database = require('better-sqlite3');
const db = new Database('eturista.db');
try {
  const info = db.prepare("PRAGMA table_info(Gost)").all();
  console.log('Columns:', info.map(i => i.name));
} catch (e) {
  console.error('Error:', e.message);
}
