const Database = require('better-sqlite3');
const db = new Database('eturista.db');
try {
  const info = db.prepare("PRAGMA table_info(Opstina)").all();
  console.log('Opstina Columns:', info.map(i => i.name));
  const sample = db.prepare("SELECT * FROM Opstina LIMIT 1").get();
  console.log('Opstina Sample:', sample);
} catch (e) {
  console.error('Error:', e.message);
}
