// Adatbázis-ellenőrzés CSAK OLVASÁSSAL – semmit nem módosít.
// Élesítés előtt futtasd, hogy lásd, mi van már a (közös) adatbázisban.
//   npm run db:inspect
import pg from 'pg';
import { loadConfig } from '../config.js';

const cfg = loadConfig();
const client = new pg.Client({ connectionString: cfg.databaseUrl });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const v = await client.query('SELECT version() AS v, current_database() AS db, current_user AS u');
  console.log(`Adatbázis: ${v.rows[0].db} · felhasználó: ${v.rows[0].u}\n${v.rows[0].v}\n`);
  const t = await client.query(`
    SELECT n.nspname AS schema, c.relname AS name, c.reltuples::bigint AS rows_est
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
     ORDER BY 1, 2`);
  const bySchema = new Map<string, string[]>();
  for (const r of t.rows) bySchema.set(r.schema, [...(bySchema.get(r.schema) ?? []), `${r.name} (~${Math.max(0, Number(r.rows_est))} sor)`]);
  if (!bySchema.size) console.log('Az adatbázis üres (nincs tábla).');
  for (const [s, names] of bySchema) console.log(`Séma: ${s}\n  ${names.join('\n  ')}\n`);
  if (bySchema.has(cfg.dbSchema)) {
    const m = await client.query(`SELECT name, applied_at FROM ${cfg.dbSchema}.schema_migrations ORDER BY name`).catch(() => ({ rows: [] as any[] }));
    console.log(`A(z) "${cfg.dbSchema}" séma létezik. Lefutott migrációk: ${m.rows.map((r) => r.name).join(', ') || 'nincs'}`);
  } else {
    console.log(`A(z) "${cfg.dbSchema}" séma még NEM létezik – a migráció létrehozza, más sémához nem nyúl.`);
  }
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
