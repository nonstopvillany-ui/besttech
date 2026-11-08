import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db.js';

// A migrations/ mappa az app gyökerében van (forrásból és a dist/ alól is ugyanoda mutat).
const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, here.includes(`${path.sep}dist${path.sep}`) ? '../../../migrations' : '../../migrations');

/**
 * Lefuttatja a még nem alkalmazott .sql migrációkat névsorrendben.
 * Minden fájl külön tranzakcióban fut; tanácsadó zár védi a párhuzamos futtatástól.
 */
export async function runMigrations(db: Db, log: (msg: string) => void = console.log): Promise<string[]> {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`A(z) ${file} migráció sikertelen: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`Migráció alkalmazva: ${file}`);
    }
    if (!applied.length) log('Nincs új migráció.');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}
