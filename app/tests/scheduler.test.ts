import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../server/db.js';
import { upsertAdmin } from '../server/lib/bootstrap.js';
import { H, login, setup } from './helpers.js';

// Kizárólag kitalált tesztadat.
type Headers = Record<string, string>;
const here = path.dirname(fileURLToPath(import.meta.url));

async function session(app: FastifyInstance, email: string, temp: string, final: string) {
  const s = await login(app, email, temp);
  await app.inject({ method: 'POST', url: '/api/auth/change-password', headers: s.headers, payload: { currentPassword: temp, newPassword: final } });
  return s.headers as Headers;
}
async function makeUser(app: FastifyInstance, admin: Headers, email: string, roleKey: string) {
  await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin, payload: { email, name: email.split('@')[0], roleKey, password: 'Kezdo123456' } });
  return session(app, email, 'Kezdo123456', 'Vegleges2026x');
}
const state = async (app: FastifyInstance, h: Headers) => (await app.inject({ url: '/api/scheduler/state', headers: h })).json();
const sync = (app: FastifyInstance, h: Headers, payload: unknown) => app.inject({ method: 'PUT', url: '/api/scheduler/sync', headers: h, payload });

let app: FastifyInstance;
let db: Db;
let admin: Headers, iroda: Headers, felelos: Headers, user: Headers;

beforeAll(async () => {
  ({ app, db } = await setup());
  await upsertAdmin(db, 'admin@example.invalid', 'Ideiglenes2026', { resetIfExists: true });
  admin = await session(app, 'admin@example.invalid', 'Ideiglenes2026', 'AdminTeszt2026');
  iroda = await makeUser(app, admin, 'iroda@example.invalid', 'iroda');
  felelos = await makeUser(app, admin, 'felelos@example.invalid', 'munkafelelos');
  user = await makeUser(app, admin, 'user@example.invalid', 'felhasznalo');
});
afterAll(async () => { await app?.close(); await db?.end(); });

let customerId: number;
let projectId: number;

describe('ügyfelek és projektek', () => {
  it('ügyfél létrehozása egyedi kóddal', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/customers', headers: iroda, payload: { name: 'Minta Ügyfél', email: 'minta@example.invalid', phone: '+36 1 000 0000' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().customer.code).toMatch(/^U-\d{5}$/);
    customerId = res.json().customer.id;
  });
  it('projekt hozzárendelése az ügyfélhez, egyedi projektkóddal', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', headers: iroda, payload: { name: 'Minta családi ház', customerId, hrsz: '0000/1', address: 'Mintaváros, Teszt utca 1.' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().project).toMatchObject({ customerId, customerName: 'Minta Ügyfél', status: 'active' });
    expect(res.json().project.code).toMatch(/^P-\d{5}$/);
    projectId = res.json().project.id;
    const second = await app.inject({ method: 'POST', url: '/api/projects', headers: iroda, payload: { name: 'Minta garázs', customerId } });
    expect(second.json().project.code).not.toBe(res.json().project.code);
    const c = await app.inject({ url: `/api/customers/${customerId}`, headers: iroda });
    expect(c.json().projects).toHaveLength(2); // egy ügyfélhez több projekt
  });
  it('nem létező ügyfélhez nem rendelhető projekt', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', headers: iroda, payload: { name: 'X', customerId: 999999 } });
    expect(res.statusCode).toBe(400);
  });
  it('ügyfél módosítása: elavult verzióval 409', async () => {
    const cur = (await app.inject({ url: `/api/customers/${customerId}`, headers: iroda })).json().customer;
    const ok = await app.inject({ method: 'PUT', url: `/api/customers/${customerId}`, headers: iroda, payload: { ...cur, phone: '+36 1 111 1111' } });
    expect(ok.statusCode).toBe(200);
    const stale = await app.inject({ method: 'PUT', url: `/api/customers/${customerId}`, headers: iroda, payload: { ...cur, phone: '+36 1 222 2222' } });
    expect(stale.statusCode).toBe(409);
  });
});

describe('ütemező – központi adatbázisból', () => {
  it('az új projekt megjelenik az ütemező projektválasztójában, a sablon munkafázisaival', async () => {
    const s = await state(app, iroda);
    const h = s.houses.find((x: { id: number }) => x.id === projectId);
    expect(h).toMatchObject({ name: 'Minta családi ház', customer: 'Minta Ügyfél' });
    expect(h.tasks).toHaveLength(23);
    expect(h.tasks[0]).toMatchObject({ id: 1, name: 'Humusz leszedés', placed: false, done: [] });
    expect(s.seed).toHaveLength(23);
    expect(s.perms).toEqual({ edit: true, finance: false });
  });

  it('munkafázisok módosítása, mentése és visszatöltése', async () => {
    const s = await state(app, iroda);
    const h = s.houses.find((x: { id: number }) => x.id === projectId);
    const t = h.tasks[1];
    Object.assign(t, {
      start: '2026-03-07', days: 2, placed: true, order: 1, lead: 'Teszt Elek', workers: ['Teszt Elek', 'Minta Mária'],
      extra: [{ start: '2026-03-20', days: 1 }], done: [true, false, true], notes: 'Megjegyzés',
      dayWorkers: { '2026-03-09': ['Minta Mária'] }, dayNotes: { '2026-03-20': 'Napi jegyzet' },
    });
    h.tasks[2].past = true; h.tasks[2].placed = true;
    const res = await sync(app, iroda, { houses: [{ id: projectId, base: s.versions.houses[projectId], name: h.name, tasks: h.tasks }] });
    expect(res.statusCode).toBe(200);
    expect(res.json().versions.houses[projectId]).toBe(s.versions.houses[projectId] + 1);

    const again = (await state(app, iroda)).houses.find((x: { id: number }) => x.id === projectId);
    expect(again.tasks[1]).toEqual({
      id: t.id, name: t.name, category: t.category, days: 2, start: '2026-03-07', extra: [{ start: '2026-03-20', days: 1 }],
      lead: 'Teszt Elek', workers: ['Teszt Elek', 'Minta Mária'], notes: 'Megjegyzés', placed: true, order: 1,
      done: [true, false, true], dayWorkers: { '2026-03-09': ['Minta Mária'] }, dayNotes: { '2026-03-20': 'Napi jegyzet' },
    });
    expect(again.tasks[2].past).toBe(true);
    expect(again.tasks.map((x: { name: string }) => x.name)).toEqual(h.tasks.map((x: { name: string }) => x.name)); // sorrend megmarad
    // Az ismeretlen dolgozók automatikusan bekerültek (inaktívként)
    const w = await db.query(`SELECT name, is_active FROM workers ORDER BY name`);
    expect(w.rows.map((r) => r.name)).toEqual(['Minta Mária', 'Teszt Elek']);
    // A projektek listája is látja az ütemezést
    const p = (await app.inject({ url: `/api/projects/${projectId}`, headers: iroda })).json().project;
    expect(p.schedule).toMatchObject({ initialized: true, plannedDays: 3, doneDays: 2, firstDay: '2026-03-07', lastDay: '2026-03-20' });
  });

  it('a projekt átnevezése a Projektek modulban az ütemezőben is látszik; elavult ütemezőmentés 409', async () => {
    const s = await state(app, iroda);
    const base = s.versions.houses[projectId];
    const h = s.houses.find((x: { id: number }) => x.id === projectId);
    const p = (await app.inject({ url: `/api/projects/${projectId}`, headers: iroda })).json().project;
    const upd = await app.inject({ method: 'PUT', url: `/api/projects/${projectId}`, headers: iroda, payload: { ...p, name: 'Minta családi ház (átnevezve)' } });
    expect(upd.statusCode).toBe(200);
    expect((await state(app, iroda)).houses.find((x: { id: number }) => x.id === projectId).name).toBe('Minta családi ház (átnevezve)');
    const stale = await sync(app, iroda, { houses: [{ id: projectId, base, name: h.name, tasks: h.tasks }] });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().conflicts).toEqual([`house:${projectId}`]);
    // Semmi nem íródott felül
    expect((await state(app, iroda)).houses.find((x: { id: number }) => x.id === projectId).name).toBe('Minta családi ház (átnevezve)');
  });

  it('több projekt egyidejű kezelése: különböző projektek mentése nem ütközik', async () => {
    const s1 = await state(app, iroda);
    const s2 = await state(app, admin);
    const [a, b] = s1.houses;
    const b2 = s2.houses.find((x: { id: number }) => x.id === b.id);
    a.tasks[0].notes = 'A felhasználó'; b2.tasks[0].notes = 'B felhasználó';
    expect((await sync(app, iroda, { houses: [{ id: a.id, base: s1.versions.houses[a.id], name: a.name, tasks: a.tasks }] })).statusCode).toBe(200);
    expect((await sync(app, admin, { houses: [{ id: b2.id, base: s2.versions.houses[b2.id], name: b2.name, tasks: b2.tasks }] })).statusCode).toBe(200);
    const after = await state(app, iroda);
    expect(after.houses.find((x: { id: number }) => x.id === a.id).tasks[0].notes).toBe('A felhasználó');
    expect(after.houses.find((x: { id: number }) => x.id === b.id).tasks[0].notes).toBe('B felhasználó');
    // Ugyanazt a projektet a régi verzióról mentve: 409
    const again = await sync(app, admin, { houses: [{ id: a.id, base: s2.versions.houses[a.id], name: a.name, tasks: a.tasks }] });
    expect(again.statusCode).toBe(409);
  });

  it('új projekt az ütemezőből: a központi projektek közé kerül', async () => {
    const s = await state(app, iroda);
    const tasks = s.houses[0].tasks.map((t: Record<string, unknown>) => ({ ...t, start: '', placed: false, done: [], extra: [] }));
    const res = await sync(app, iroda, { houses: [{ tmp: 'uj1', name: 'Ütemezőben felvett projekt', tasks }] });
    expect(res.statusCode).toBe(200);
    const id = res.json().idMap.uj1;
    const p = (await app.inject({ url: `/api/projects/${id}`, headers: iroda })).json().project;
    expect(p).toMatchObject({ name: 'Ütemezőben felvett projekt', status: 'active', customerId: null });
    expect(p.code).toMatch(/^P-\d{5}$/);
  });

  it('projekt "törlése" az ütemezőben csak archivál, az adatok megmaradnak', async () => {
    const s = await state(app, iroda);
    const h = s.houses.find((x: { name: string }) => x.name === 'Ütemezőben felvett projekt');
    expect((await sync(app, iroda, { archived: [{ id: h.id, base: s.versions.houses[h.id] }] })).statusCode).toBe(200);
    expect((await state(app, iroda)).houses.some((x: { id: number }) => x.id === h.id)).toBe(false);
    const p = (await app.inject({ url: `/api/projects/${h.id}`, headers: iroda })).json().project;
    expect(p.status).toBe('archived');
    expect(p.schedule.tasks).toBe(23);
  });

  it('dolgozók szakasz: névsorból kikerült dolgozó inaktív lesz (nem törlődik); verzióütközés', async () => {
    const s = await state(app, iroda);
    const base = s.versions.sections.roster;
    const roster = [{ name: 'Teszt Elek', role: 'lead', email: 'teszt@example.invalid' }, { name: 'Új Dolgozó', role: 'helper', email: '' }];
    expect((await sync(app, iroda, { sections: { roster: { base, data: roster } } })).statusCode).toBe(200);
    const s2 = await state(app, iroda);
    expect(s2.roster.map((r: { name: string }) => r.name)).toEqual(['Teszt Elek', 'Új Dolgozó']);
    expect((await db.query(`SELECT is_active FROM workers WHERE name = 'Minta Mária'`)).rows[0].is_active).toBe(false);
    expect((await sync(app, iroda, { sections: { roster: { base, data: roster } } })).statusCode).toBe(409);
  });

  it('a módosítás előtti állapot az előzményekbe kerül', async () => {
    const n = (await db.query(`SELECT count(*)::int AS n FROM scheduler_history WHERE section = 'house'`)).rows[0].n;
    expect(n).toBeGreaterThan(0);
  });
});

describe('ütemező – jogosultságok', () => {
  it('munkafelelős: megtekintheti, de nem mentheti', async () => {
    const s = await state(app, felelos);
    expect(s.perms).toEqual({ edit: false, finance: false });
    const h = s.houses[0];
    expect((await sync(app, felelos, { houses: [{ id: h.id, base: s.versions.houses[h.id], name: h.name, tasks: h.tasks }] })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/projects', headers: felelos, payload: { name: 'X' } })).statusCode).toBe(403);
  });
  it('a főoldalon csak azok a modulcsempék látszanak, amelyekhez jog van', async () => {
    const tiles = (await app.inject({ url: '/api/dashboard', headers: user })).json().tiles.map((t: { moduleKey: string }) => t.moduleKey);
    expect(tiles).toContain('utemezo');
    expect(tiles).not.toContain('ugyfelek');
    expect(tiles).not.toContain('projektek');
  });
  it('alap felhasználó: ügyfelekhez és projektekhez nem fér hozzá', async () => {
    expect((await app.inject({ url: '/api/customers', headers: user })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/projects', headers: user })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/scheduler/state', headers: user })).statusCode).toBe(200);
  });
  it('bejelentkezés nélkül semmi', async () => {
    for (const url of ['/api/scheduler/state', '/api/scheduler/versions', '/api/customers', '/api/projects'])
      expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PUT', url: '/api/scheduler/sync', headers: H, payload: {} })).statusCode).toBe(401);
  });
  it('pénzügyi adatok: pénzügyi jog nélkül nem láthatók és nem módosíthatók', async () => {
    // admin bértételt rögzít és órabért ad
    const s = await state(app, admin);
    expect(s.perms.finance).toBe(true);
    const roster = s.roster.map((r: { name: string }) => (r.name === 'Teszt Elek' ? { ...r, wage: 3000 } : r));
    expect((await sync(app, admin, { sections: {
      roster: { base: s.versions.sections.roster, data: roster },
      payItems: { base: s.versions.sections.payItems, data: [{ id: 1, w: 'Teszt Elek', ym: '2026-03', amount: 50000, note: 'prémium', recurring: false }] },
    } })).statusCode).toBe(200);
    const si = await state(app, iroda);
    expect(si.payItems).toEqual([]);
    expect(si.roster.find((r: { name: string }) => r.name === 'Teszt Elek').wage).toBeUndefined();
    // az irodai mentés nem írhatja felül a béreket és a bértételeket
    expect((await sync(app, iroda, { sections: {
      roster: { base: si.versions.sections.roster, data: si.roster },
      payItems: { base: si.versions.sections.payItems, data: [] },
    } })).statusCode).toBe(200);
    const sa = await state(app, admin);
    expect(sa.payItems).toHaveLength(1);
    expect(sa.roster.find((r: { name: string }) => r.name === 'Teszt Elek').wage).toBe(3000);
  });
  it('szerepkör jogainak módosítása az adminisztrációban', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/admin/roles/munkafelelos/permissions', headers: admin, payload: { permissions: ['scheduler.edit', 'projects.view'] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().permissions).toEqual(['projects.view', 'scheduler.edit', 'scheduler.view']);
    const s = await state(app, felelos); // a munkamenet a következő kéréstől az új jogokkal fut
    expect(s.perms.edit).toBe(true);
    expect((await app.inject({ method: 'PUT', url: '/api/admin/roles/admin/permissions', headers: admin, payload: { permissions: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/admin/roles/iroda/permissions', headers: iroda, payload: { permissions: [] } })).statusCode).toBe(403);
  });
});

describe('régi v25 adatok: import után az ütemező ugyanazt mutatja', () => {
  let app2: FastifyInstance; let db2: Db; let a2: Headers;
  const content = readFileSync(path.join(here, 'fixtures/legacy-v25-sample.json'), 'utf8');
  const legacy = JSON.parse(content);
  beforeAll(async () => {
    await app.close(); await db.end(); // ugyanazt a teszt-adatbázist használja
    ({ app: app2, db: db2 } = await setup({ LOGIN_RATE_LIMIT: '1000', LEGACY_IMPORT_ENABLED: 'true' }));
    await upsertAdmin(db2, 'admin@example.invalid', 'Ideiglenes2026', { resetIfExists: true });
    a2 = await session(app2, 'admin@example.invalid', 'Ideiglenes2026', 'AdminTeszt2026');
    const r = await app2.inject({ method: 'POST', url: '/api/admin/legacy-import/commit', headers: a2, payload: { fileName: 'minta.json', content, confirm: 'IMPORTÁLÁS', backupConfirmed: true } });
    expect(r.statusCode).toBe(200);
  });
  afterAll(async () => { await app2?.close(); await db2?.end(); app = undefined as never; db = undefined as never; });

  it('munkafázisok, dátumok, pipák, napi eltérések visszaállnak', async () => {
    const s = await state(app2, a2);
    expect(s.houses.map((h: { name: string }) => h.name)).toEqual(legacy.houses.map((h: { name: string }) => h.name));
    const t = (hi: number, id: number) => s.houses[hi].tasks.find((x: { id: number }) => x.id === id);
    expect(t(0, 2)).toMatchObject({ start: '2026-03-10', days: 2, extra: [{ start: '2026-03-20', days: 1 }], done: [true, false, true], dayWorkers: { '2026-03-11': ['Teszt Elek', 'Ismeretlen Ivó'] }, dayNotes: { '2026-03-20': 'Zsalut hozni' }, notes: 'Figyelni a koszorúra' });
    expect(t(0, 1)).toMatchObject({ start: '2026-03-07', days: 2, done: [true, true] });
    expect(t(0, 3)).toMatchObject({ past: true, placed: true });
    expect(t(1, 1)).toMatchObject({ start: '2026-03-09', workers: ['Minta Mária'], lead: 'Teszt Elek' });
    expect(s.payItems.reduce((a: number, x: { amount: number }) => a + x.amount, 0)).toBe(40000);
    expect(s.ignored).toEqual({ 'Teszt Elek|2026-03-09': true });
    expect(s.hours).toEqual({ 'Teszt Elek|2026-03-10': { from: '07:00', to: '15:00' } });
    expect(s.custom.map((c: { name: string }) => c.name)).toEqual(['Saját munka']);
    expect(s.mailTime).toBe('19:00');
    // A sablonok alapértelmezett csapata a régi adatokból állt vissza
    expect(s.seed.find((x: [string]) => x[0] === 'Humusz leszedés')[3]).toEqual(['Teszt Elek', 'Minta Mária']);
  });
});
