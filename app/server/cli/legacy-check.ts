// Régi (v25) mentésfájl ellenőrzése adatbázis NÉLKÜL – semmit nem ír sehova.
//   npm run legacy:check -- ./besttech-utemezo-mentes.json
import { readFile } from 'node:fs/promises';
import { transformLegacy } from '../legacy/transform.js';

const file = process.argv[2];
if (!file) { console.error('Használat: npm run legacy:check -- <mentésfájl.json>'); process.exit(1); }
try {
  const { report } = transformLegacy(JSON.parse(await readFile(file, 'utf8')));
  console.log('Darabszámok:');
  for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k.padEnd(20)} ${v}`);
  console.log('Ellenőrző összegek:');
  for (const [k, v] of Object.entries(report.checksums)) console.log(`  ${k.padEnd(20)} ${v}`);
  console.log(`Figyelmeztetések (${report.warnings.length}):`);
  for (const w of report.warnings) console.log(`  [${w.code}] ${w.message}`);
} catch (e) {
  console.error('A fájl nem dolgozható fel:', (e as Error).message);
  process.exitCode = 1;
}
