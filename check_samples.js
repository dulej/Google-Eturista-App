import Database from 'better-sqlite3';
const db = new Database('eturista.db');

console.log('--- Drzava (first 5) ---');
console.log(db.prepare('SELECT * FROM Drzava LIMIT 5').all());

console.log('--- Opstine (first 5) ---');
console.log(db.prepare('SELECT * FROM Opstine LIMIT 5').all());

console.log('--- Mesta (first 5) ---');
console.log(db.prepare('SELECT * FROM Mesta LIMIT 5').all());

db.close();
