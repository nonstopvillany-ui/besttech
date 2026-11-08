// Első adminisztrátor létrehozása vagy jelszavának visszaállítása.
//
//   npm run create-admin -- --email info@besttech.hu
//   npm run create-admin -- --email info@besttech.hu --reset
//
// A jelszót rejtett bevitellel kéri be (nem jelenik meg a képernyőn, nem kerül
// a parancselőzménybe). Nem interaktív futtatásnál az ADMIN_PASSWORD
// környezeti változóból olvassa. A jelszó a forráskódba sosem kerül.
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { upsertAdmin } from '../lib/bootstrap.js';
import { runMigrations } from '../lib/migrate.js';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Nem interaktív terminál: add meg a jelszót az ADMIN_PASSWORD változóban.'));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, reset: { type: 'boolean', default: false } } });
if (!values.email) {
  console.error('Használat: npm run create-admin -- --email info@besttech.hu [--name "Név"] [--reset]');
  process.exit(1);
}

const db = createPool(loadConfig().databaseUrl);
try {
  await runMigrations(db, () => {});
  let password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    password = await askHidden('Ideiglenes jelszó (min. 10 karakter, betű és szám): ');
    const again = await askHidden('Jelszó újra: ');
    if (password !== again) throw new Error('A két jelszó nem egyezik.');
  }
  const result = await upsertAdmin(db, values.email, password, { resetIfExists: values.reset ?? false, name: values.name });
  if (result === 'skipped') console.log(`Már létezik felhasználó ezzel a címmel: ${values.email}. Jelszó-visszaállításhoz add meg a --reset kapcsolót.`);
  else console.log(`Adminisztrátor ${result === 'created' ? 'létrehozva' : 'frissítve'}: ${values.email}. Első belépéskor jelszócsere szükséges.`);
} catch (err) {
  console.error('Hiba:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
