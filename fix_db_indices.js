import Database from 'better-sqlite3';
const db = new Database('eturista.db');

try {
  console.log('Adding unique indices to fix foreign key mismatch...');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_opstine_mb ON Opstine("Maticni Broj")');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_mesta_mbm ON Mesta("Maticni Broj Mesta")');
  console.log('Unique indices added successfully.');
} catch (error) {
  console.error('Error adding indices:', error.message);
} finally {
  db.close();
}
