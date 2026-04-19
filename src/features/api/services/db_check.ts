import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('public/data/cards.sqlite');

try {
  const db = new Database(dbPath);
  
  console.log('--- Distinct Rarities ---');
  const rarities = db.prepare('SELECT DISTINCT rarity FROM cards').all();
  rarities.forEach((row: any) => console.log(row.rarity));
  
  console.log('\n--- Table Schema ---');
  const info = db.prepare("PRAGMA table_info(cards)").all();
  info.forEach((col: any) => console.log(`${col.name}: ${col.type}`));

  db.close();
} catch (err) {
  console.error('Error querying database:', err);
}
