import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createPool, DEFAULT_SCHEMA, type Db } from '../server/db.js';
import { runMigrations } from '../server/lib/migrate.js';

// Az integrációs tesztek valódi PostgreSQL-t használnak. A TEST_DATABASE_URL
// adatbázist a tesztek TÖRLIK és újraépítik – soha ne mutasson éles adatbázisra!
export const TEST_DB = process.env.TEST_DATABASE_URL;

export async function setup(env: Record<string, string> = { LOGIN_RATE_LIMIT: '1000' }): Promise<{ app: FastifyInstance; db: Db }> {
  if (!TEST_DB) throw new Error('Állítsd be a TEST_DATABASE_URL változót (pl. postgres://postgres@localhost:5433/besttech_test).');
  if (!/test/i.test(TEST_DB)) throw new Error('Biztonsági okból a teszt-adatbázis nevének tartalmaznia kell a "test" szót.');
  const db = createPool(TEST_DB, DEFAULT_SCHEMA);
  await db.query(`DROP SCHEMA IF EXISTS ${DEFAULT_SCHEMA} CASCADE`);
  await runMigrations(db, () => {});
  const config = loadConfig({ DATABASE_URL: TEST_DB, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);
  const app = await buildApp({ config, db, logger: false });
  await app.ready();
  return { app, db };
}

export const H = { 'x-requested-with': 'besttech' };

export async function login(app: FastifyInstance, email: string, password: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email, password } });
  const raw = res.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw[0] : raw ?? '').split(';')[0];
  return { res, cookie, headers: { ...H, cookie } };
}
