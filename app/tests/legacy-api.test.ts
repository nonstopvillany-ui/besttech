import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../server/db.js';
import { upsertAdmin } from '../server/lib/bootstrap.js';
import { H, login, setup } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const content = readFileSync(path.join(here, 'fixtures/legacy-v25-sample.json'), 'utf8');
const count = async (db: Db, table: string) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;

async function adminSession(app: FastifyInstance, db: Db) {
  await upsertAdmin(db, 'admin@example.invalid', 'Ideiglenes2026', { resetIfExists: true });
  const s = await login(app, 'admin@example.invalid', 'Ideiglenes2026');
  await app.inject({ method: 'POST', url: '/api/auth/change-password', headers: s.headers, payload: { currentPassword: 'Ideiglenes2026', newPassword: 'AdminTeszt2026' } });
  return s.headers;
}

describe('import – alapállapot (tiltott)', () => {
  let app: FastifyInstance; let db: Db; let h: Record<string, string>;
  beforeAll(async () => { ({ app, db } = await setup()); h = await adminSession(app, db); });
  afterAll(async () => { await app?.close(); await db?.end(); });

  it('az előnézet működik, de az adatbázisba nem ír', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/legacy-import/preview', headers: h, payload: { fileName: 'minta.json', content } });
    expect(res.statusCode).toBe(200);
    expect(res.json().report.counts.projects).toBe(2);
    for (const t of ['projects', 'project_tasks', 'workers', 'legacy_imports', 'task_days']) expect(await count(db, t)).toBe(0);
  });
  it('a tényleges import alapból tiltva', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/legacy-import/commit', headers: h, payload: { fileName: 'minta.json', content, confirm: 'IMPORTÁLÁS' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('IMPORT_DISABLED');
    expect(await count(db, 'projects')).toBe(0);
  });
  it('státusz', async () => {
    const res = await app.inject({ url: '/api/admin/legacy-import/status', headers: h });
    expect(res.json()).toEqual({ commitEnabled: false, imports: [] });
  });
  it('hibás fájl: érthető hibaüzenet', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/admin/legacy-import/preview', headers: h, payload: { content: '{nem json' } });
    expect(bad.statusCode).toBe(400);
    const wrong = await app.inject({ method: 'POST', url: '/api/admin/legacy-import/preview', headers: h, payload: { content: '{"a":1}' } });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toMatch(/nem a v25/);
  });
  it('nem admin nem érheti el', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/admin/legacy-import/preview', headers: H, payload: { content } })).statusCode).toBe(401);
  });
});

describe('import – engedélyezve (csak teszt-adatbázison, kitalált adattal)', () => {
  let app: FastifyInstance; let db: Db; let h: Record<string, string>;
  beforeAll(async () => { ({ app, db } = await setup({ LOGIN_RATE_LIMIT: '1000', LEGACY_IMPORT_ENABLED: 'true' })); h = await adminSession(app, db); });
  afterAll(async () => { await app?.close(); await db?.end(); });

  it('megerősítés nélkül nem fut', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/legacy-import/commit', headers: h, payload: { fileName: 'minta.json', content } });
    expect(res.statusCode).toBe(400);
    expect(await count(db, 'projects')).toBe(0);
  });
  it('import után az adatbázis egyezik az előnézet összegeivel', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/legacy-import/commit', headers: h, payload: { fileName: 'minta.json', content, confirm: 'IMPORTÁLÁS' } });
    expect(res.statusCode).toBe(200);
    expect(await count(db, 'projects')).toBe(2);
    expect(await count(db, 'project_tasks')).toBe(6);
    expect(await count(db, 'task_days')).toBe(6);
    expect((await db.query('SELECT count(*)::int AS n FROM task_days WHERE is_done')).rows[0].n).toBe(4);
    expect(await count(db, 'task_segments')).toBe(4);
    expect(await count(db, 'workers')).toBe(4);
    expect((await db.query('SELECT sum(amount)::float AS s FROM pay_adjustments')).rows[0].s).toBe(40000);
    expect((await db.query('SELECT sum(amount)::float AS s FROM subcontractor_payments')).rows[0].s).toBe(251000);
    const d = await db.query(`SELECT d.work_date::text, d.is_done, d.has_worker_override,
                                     array(SELECT w.name FROM task_day_workers x JOIN workers w ON w.id = x.worker_id WHERE x.task_day_id = d.id ORDER BY w.name) AS ws
                                FROM task_days d JOIN project_tasks t ON t.id = d.task_id WHERE t.name = 'Főfalazás' ORDER BY d.work_date`);
    expect(d.rows).toEqual([
      { work_date: '2026-03-10', is_done: true, has_worker_override: false, ws: [] },
      { work_date: '2026-03-11', is_done: false, has_worker_override: true, ws: ['Ismeretlen Ivó', 'Teszt Elek'] },
      { work_date: '2026-03-20', is_done: true, has_worker_override: false, ws: [] },
    ]);
    const inactive = await db.query(`SELECT is_active FROM workers WHERE name = 'Ismeretlen Ivó'`);
    expect(inactive.rows[0].is_active).toBe(false);
    const sp = await db.query(`SELECT project_id, project_name FROM subcontractor_payments ORDER BY pay_date`);
    expect(sp.rows[0].project_id).not.toBeNull();
    expect(sp.rows[1]).toEqual({ project_id: null, project_name: 'Nem létező projekt' });
  });
  it('az eredeti JSON változatlanul megmarad', async () => {
    const { rows } = await db.query('SELECT raw FROM legacy_imports');
    expect(rows[0].raw).toEqual(JSON.parse(content));
  });
  it('második import elutasítva (nincs duplikáció)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/legacy-import/commit', headers: h, payload: { fileName: 'minta.json', content, confirm: 'IMPORTÁLÁS' } });
    expect(res.statusCode).toBe(409);
    expect(await count(db, 'projects')).toBe(2);
  });
});
