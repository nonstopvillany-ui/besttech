import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../server/db.js';
import { bootstrapAdminFromEnv, upsertAdmin } from '../server/lib/bootstrap.js';
import { H, login, setup } from './helpers.js';

const ADMIN = 'info@besttech.hu';
const TEMP = 'Ideiglenes2026';
const NEWPW = 'UjBiztosJelszo99';

let app: FastifyInstance;
let db: Db;
let admin: Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  ({ app, db } = await setup());
  expect(await upsertAdmin(db, ADMIN, TEMP, { resetIfExists: false })).toBe('created');
});
afterAll(async () => {
  await app?.close();
  await db?.end();
});

describe('alapok', () => {
  it('health végpont', async () => {
    const res = await app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
  it('bejelentkezés nélkül nincs adat', async () => {
    expect((await app.inject({ url: '/api/dashboard' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/admin/users' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/auth/me' })).statusCode).toBe(401);
  });
  it('biztonsági fejlécek', async () => {
    const res = await app.inject({ url: '/api/health' });
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('a migrációk újrafuttatása nem változtat semmit', async () => {
    const { runMigrations } = await import('../server/lib/migrate.js');
    expect(await runMigrations(db, () => {})).toEqual([]);
  });
});

describe('bejelentkezés', () => {
  it('hibás jelszó: általános hibaüzenet', async () => {
    const { res } = await login(app, ADMIN, 'rosszjelszo1');
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Hibás e-mail-cím vagy jelszó.');
  });
  it('nem létező cím: ugyanaz az üzenet (nem árulja el, létezik-e)', async () => {
    const { res } = await login(app, 'nincs@besttech.hu', 'rosszjelszo1');
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Hibás e-mail-cím vagy jelszó.');
  });
  it('SQL-befecskendezési kísérlet hatástalan', async () => {
    const { res } = await login(app, "' OR 1=1 --", "' OR '1'='1");
    expect(res.statusCode).toBe(401);
  });
  it('CSRF: X-Requested-With fejléc nélkül elutasítva', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN, password: TEMP } });
    expect(res.statusCode).toBe(403);
  });
  it('CSRF: idegen Origin elutasítva', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login', headers: { ...H, origin: 'https://gonosz.example' }, payload: { email: ADMIN, password: TEMP },
    });
    expect(res.statusCode).toBe(403);
  });
  it('sikeres belépés: httpOnly, SameSite süti; az adatbázisban csak a token lenyomata', async () => {
    admin = await login(app, ADMIN.toUpperCase(), TEMP); // kis-/nagybetű független
    expect(admin.res.statusCode).toBe(200);
    const raw = String(admin.res.headers['set-cookie']);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    const token = admin.cookie.split('=')[1];
    const { rows } = await db.query('SELECT id_hash FROM sessions');
    expect(rows.some((r) => r.id_hash === token)).toBe(false);
    expect(rows[0].id_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('ideiglenes jelszóval csak jelszócsere érhető el', async () => {
    const me = await app.inject({ url: '/api/auth/me', headers: admin.headers });
    expect(me.json().user.mustChangePassword).toBe(true);
    const dash = await app.inject({ url: '/api/dashboard', headers: admin.headers });
    expect(dash.statusCode).toBe(403);
    expect(dash.json().code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
  it('gyenge új jelszó elutasítva', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/change-password', headers: admin.headers, payload: { currentPassword: TEMP, newPassword: 'gyenge' } });
    expect(res.statusCode).toBe(400);
  });
  it('jelszócsere után elérhető a főoldal', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/change-password', headers: admin.headers, payload: { currentPassword: TEMP, newPassword: NEWPW } });
    expect(res.statusCode).toBe(200);
    const dash = await app.inject({ url: '/api/dashboard', headers: admin.headers });
    expect(dash.statusCode).toBe(200);
    const titles = dash.json().tiles.map((t: { title: string }) => t.title);
    expect(titles).toEqual(['Építési ütemező', 'Projektek', 'Ügyfelek', 'Dokumentumok', 'Hírlevél', 'Állítsd össze a házad!', 'Raktárkészlet', 'Adminisztráció']);
    const ready = dash.json().tiles.filter((t: { ready: boolean }) => t.ready).map((t: { title: string }) => t.title);
    expect(ready).toEqual(['Adminisztráció']);
  });
  it('a régi jelszó már nem működik', async () => {
    expect((await login(app, ADMIN, TEMP)).res.statusCode).toBe(401);
  });
  it('elfelejtett jelszó: ugyanaz a válasz létező és nem létező címre', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', headers: H, payload: { email: ADMIN } });
    const b = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', headers: H, payload: { email: 'nincs@besttech.hu' } });
    expect(a.statusCode).toBe(200);
    expect(a.json()).toEqual(b.json());
  });
});

describe('felhasználók és jogosultságok', () => {
  let userId: number;
  let user: Awaited<ReturnType<typeof login>>;

  it('admin új felhasználót hoz létre', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/admin/users', headers: admin.headers,
      payload: { email: 'Iroda@Besttech.hu', name: 'Teszt Irodai', roleKey: 'iroda', password: 'Kezdo123456' },
    });
    expect(res.statusCode).toBe(200);
    userId = res.json().id;
  });
  it('azonos e-mail-cím nem vehető fel kétszer', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/admin/users', headers: admin.headers,
      payload: { email: 'iroda@besttech.hu', name: 'Másik', roleKey: 'iroda', password: 'Kezdo123456' },
    });
    expect(res.statusCode).toBe(409);
  });
  it('a felhasználó nem éri el az admin felületet, és nem látja az Adminisztráció csempét', async () => {
    user = await login(app, 'iroda@besttech.hu', 'Kezdo123456');
    await app.inject({ method: 'POST', url: '/api/auth/change-password', headers: user.headers, payload: { currentPassword: 'Kezdo123456', newPassword: 'IrodaJelszo2026' } });
    const dash = await app.inject({ url: '/api/dashboard', headers: user.headers });
    expect(dash.json().tiles.map((t: { moduleKey: string }) => t.moduleKey)).not.toContain('admin');
    for (const url of ['/api/admin/users', '/api/admin/tiles', '/api/admin/roles', '/api/admin/audit'])
      expect((await app.inject({ url, headers: user.headers })).statusCode).toBe(403);
    const put = await app.inject({ method: 'PUT', url: '/api/admin/users/1', headers: user.headers, payload: { name: 'x', roleKey: 'iroda', isActive: false } });
    expect(put.statusCode).toBe(403);
  });
  it('az utolsó aktív admin nem fokozható le és nem tiltható le', async () => {
    const me = await app.inject({ url: '/api/auth/me', headers: admin.headers });
    const res = await app.inject({ method: 'PUT', url: `/api/admin/users/${me.json().user.id}`, headers: admin.headers, payload: { name: 'Admin', roleKey: 'iroda', isActive: true } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('LAST_ADMIN');
  });
  it('letiltáskor a felhasználó munkamenete megszűnik', async () => {
    const res = await app.inject({ method: 'PUT', url: `/api/admin/users/${userId}`, headers: admin.headers, payload: { name: 'Teszt Irodai', roleKey: 'iroda', isActive: false } });
    expect(res.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/dashboard', headers: user.headers })).statusCode).toBe(401);
    expect((await login(app, 'iroda@besttech.hu', 'IrodaJelszo2026')).res.statusCode).toBe(401);
  });
  it('ideiglenes jelszó és újraengedélyezés', async () => {
    await app.inject({ method: 'PUT', url: `/api/admin/users/${userId}`, headers: admin.headers, payload: { name: 'Teszt Irodai', roleKey: 'iroda', isActive: true } });
    const r = await app.inject({ method: 'POST', url: `/api/admin/users/${userId}/reset-password`, headers: admin.headers, payload: { password: 'Vissza123456' } });
    expect(r.statusCode).toBe(200);
    user = await login(app, 'iroda@besttech.hu', 'Vissza123456');
    expect(user.res.statusCode).toBe(200);
    const me = await app.inject({ url: '/api/auth/me', headers: user.headers });
    expect(me.json().user.mustChangePassword).toBe(true);
  });
  it('fiókzárolás 5 hibás próbálkozás után', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin.headers, payload: { email: 'zar@besttech.hu', name: 'Zár Teszt', roleKey: 'felhasznalo', password: 'Kezdo123456' } });
    for (let i = 0; i < 5; i++) await login(app, 'zar@besttech.hu', 'rosszjelszo1');
    const { res } = await login(app, 'zar@besttech.hu', 'Kezdo123456');
    expect(res.statusCode).toBe(423);
  });
  it('kijelentkezés után a munkamenet érvénytelen', async () => {
    const s = await login(app, ADMIN, NEWPW);
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: s.headers })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: s.headers })).statusCode).toBe(401);
  });
});

describe('csempeszerkesztés', () => {
  const tiles = async () => (await app.inject({ url: '/api/admin/tiles', headers: admin.headers })).json().tiles as Array<Record<string, any>>;
  const body = (t: Record<string, any>, patch: Record<string, unknown> = {}) => ({
    title: t.title, description: t.description, icon: t.icon, color: t.color, targetType: t.targetType, target: t.target,
    status: t.status, isVisible: t.isVisible, roles: t.roles, ...patch,
  });

  it('sorrend módosítása', async () => {
    const ids = (await tiles()).map((t) => t.id).reverse();
    expect((await app.inject({ method: 'PUT', url: '/api/admin/tiles-order', headers: admin.headers, payload: { ids } })).statusCode).toBe(200);
    expect((await tiles()).map((t) => t.id)).toEqual(ids);
  });
  it('hiányos sorrend elutasítva', async () => {
    const ids = (await tiles()).map((t) => t.id).slice(1);
    expect((await app.inject({ method: 'PUT', url: '/api/admin/tiles-order', headers: admin.headers, payload: { ids } })).statusCode).toBe(400);
  });
  it('csempe elrejtése: a főoldalon nem jelenik meg', async () => {
    const t = (await tiles()).find((x) => x.moduleKey === 'hirlevel')!;
    await app.inject({ method: 'PUT', url: `/api/admin/tiles/${t.id}`, headers: admin.headers, payload: body(t, { isVisible: false }) });
    const dash = await app.inject({ url: '/api/dashboard', headers: admin.headers });
    expect(dash.json().tiles.map((x: { moduleKey: string }) => x.moduleKey)).not.toContain('hirlevel');
  });
  it('raktár csempe külső hivatkozással: kész állapotban kattintható', async () => {
    const t = (await tiles()).find((x) => x.moduleKey === 'raktar')!;
    const res = await app.inject({ method: 'PUT', url: `/api/admin/tiles/${t.id}`, headers: admin.headers, payload: body(t, { status: 'active', target: 'https://raktar.example.hu/' }) });
    expect(res.statusCode).toBe(200);
    const dash = await app.inject({ url: '/api/dashboard', headers: admin.headers });
    const raktar = dash.json().tiles.find((x: { moduleKey: string }) => x.moduleKey === 'raktar');
    expect(raktar).toMatchObject({ ready: true, targetType: 'external', target: 'https://raktar.example.hu/' });
  });
  it('veszélyes céloldal elutasítva', async () => {
    const t = (await tiles()).find((x) => x.moduleKey === 'raktar')!;
    for (const target of ['javascript:alert(1)', 'http://raktar.example.hu', 'data:text/html,x']) {
      const res = await app.inject({ method: 'PUT', url: `/api/admin/tiles/${t.id}`, headers: admin.headers, payload: body(t, { target }) });
      expect(res.statusCode).toBe(400);
    }
  });
  it('új csempe létrehozása és törlése; beépített csempe nem törölhető', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/admin/tiles', headers: admin.headers,
      payload: { title: 'Teszt csempe', description: '', icon: 'truck', color: '#123456', targetType: 'none', target: '', status: 'development', isVisible: true, roles: ['iroda'] },
    });
    expect(res.statusCode).toBe(200);
    const id = res.json().id;
    expect((await tiles()).at(-1)!.title).toBe('Teszt csempe');
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/tiles/${id}`, headers: admin.headers })).statusCode).toBe(200);
    const sys = (await tiles()).find((x) => x.moduleKey === 'utemezo')!;
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/tiles/${sys.id}`, headers: admin.headers })).statusCode).toBe(400);
  });
  it('ismeretlen ikon és szerepkör elutasítva', async () => {
    const t = (await tiles())[0];
    expect((await app.inject({ method: 'PUT', url: `/api/admin/tiles/${t.id}`, headers: admin.headers, payload: body(t, { icon: '<script>' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: `/api/admin/tiles/${t.id}`, headers: admin.headers, payload: body(t, { roles: ['nincsilyen'] }) })).statusCode).toBe(400);
  });
  it('szerepkör szerinti láthatóság', async () => {
    const t = (await tiles()).find((x) => x.moduleKey === 'projektek')!;
    await app.inject({ method: 'PUT', url: `/api/admin/tiles/${t.id}`, headers: admin.headers, payload: body(t, { roles: ['admin'] }) });
    const u = await login(app, 'iroda@besttech.hu', 'Vissza123456');
    await app.inject({ method: 'POST', url: '/api/auth/change-password', headers: u.headers, payload: { currentPassword: 'Vissza123456', newPassword: 'IrodaJelszo2027' } });
    const dash = await app.inject({ url: '/api/dashboard', headers: u.headers });
    expect(dash.json().tiles.map((x: { moduleKey: string }) => x.moduleKey)).not.toContain('projektek');
    expect((await app.inject({ url: `/api/dashboard/tiles/${t.id}`, headers: u.headers })).statusCode).toBe(404);
  });
  it('a műveletek bekerülnek az eseménynaplóba', async () => {
    const res = await app.inject({ url: '/api/admin/audit', headers: admin.headers });
    const actions = res.json().entries.map((e: { action: string }) => e.action);
    for (const a of ['login', 'login_failed', 'password_changed', 'user_created', 'tile_updated', 'tiles_reordered']) expect(actions).toContain(a);
  });
});

describe('első admin indításkor', () => {
  it('ha már van admin, a környezeti változó nem hoz létre újat', async () => {
    const before = (await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
    await bootstrapAdminFromEnv(db, 'masik@besttech.hu', 'Valami123456', () => {});
    expect((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(before);
  });
});
