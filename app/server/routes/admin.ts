import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { withTransaction, type Db } from '../db.js';
import { HttpError, requireAdmin } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { emailSchema, ICONS, targetProblem, tileSchema } from '../lib/validate.js';
import { hashPassword, passwordProblem } from '../security/password.js';
import { deleteUserSessions } from '../security/session.js';
import { mapTile, TILE_SELECT } from './dashboard.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

async function validRoleKeys(q: Db | pg.PoolClient, keys: string[]) {
  const { rows } = await q.query<{ key: string }>('SELECT key FROM roles WHERE key = ANY($1)', [keys]);
  if (rows.length !== new Set(keys).size) throw new HttpError(400, 'Ismeretlen szerepkör.', 'VALIDATION');
}

/** Hány aktív adminisztrátor marad, ha a megadott felhasználót nem számoljuk? */
async function otherActiveAdmins(db: Db, userId: number) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM users u JOIN roles r ON r.key = u.role_key
      WHERE r.is_admin AND u.is_active AND u.id <> $1`,
    [userId],
  );
  return rows[0].n as number;
}

export const adminRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  // Minden /api/admin végponthoz adminisztrátori jog kell
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/admin/')) requireAdmin(req);
  });

  // ---------------------------------------------------------------- Csempék
  app.get('/api/admin/tiles', async () => {
    const { rows } = await db.query(`${TILE_SELECT} GROUP BY t.id ORDER BY t.sort_order, t.id`);
    return { tiles: rows.map(mapTile), icons: ICONS };
  });

  const saveTileRoles = async (c: pg.PoolClient, tileId: number, roles: string[]) => {
    await validRoleKeys(c, roles);
    await c.query('DELETE FROM dashboard_tile_roles WHERE tile_id = $1', [tileId]);
    if (roles.length)
      await c.query('INSERT INTO dashboard_tile_roles (tile_id, role_key) SELECT $1, unnest($2::text[])', [tileId, roles]);
  };

  const parseTile = (body: unknown) => {
    const t = tileSchema.parse(body);
    const problem = targetProblem(t.targetType, t.target);
    if (problem) throw new HttpError(400, problem, 'VALIDATION');
    if (t.targetType === 'none') t.target = '';
    return t;
  };

  app.post('/api/admin/tiles', async (req) => {
    const admin = requireAdmin(req);
    const t = parseTile(req.body);
    const id = await withTransaction(db, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO dashboard_tiles (title, description, icon, color, target_type, target, status, is_visible, sort_order, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(max(sort_order), 0) + 10 FROM dashboard_tiles), $9)
         RETURNING id`,
        [t.title, t.description, t.icon, t.color, t.targetType, t.target, t.status, t.isVisible, admin.id],
      );
      await saveTileRoles(c, Number(rows[0].id), t.roles);
      return Number(rows[0].id);
    });
    await audit(db, admin.id, 'tile_created', 'tile', id, { title: t.title }, req.ip);
    return { id };
  });

  app.put('/api/admin/tiles/:id', async (req) => {
    const admin = requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const t = parseTile(req.body);
    await withTransaction(db, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE dashboard_tiles SET title = $2, description = $3, icon = $4, color = $5, target_type = $6, target = $7,
                status = $8, is_visible = $9, updated_at = now(), updated_by = $10
          WHERE id = $1`,
        [id, t.title, t.description, t.icon, t.color, t.targetType, t.target, t.status, t.isVisible, admin.id],
      );
      if (!rowCount) throw new HttpError(404, 'A csempe nem található.', 'NOT_FOUND');
      await saveTileRoles(c, id, t.roles);
    });
    await audit(db, admin.id, 'tile_updated', 'tile', id, { title: t.title, status: t.status, visible: t.isVisible }, req.ip);
    return { ok: true };
  });

  // Sorrend mentése: a kapott azonosítók sorrendjében 10-esével számozva
  app.put('/api/admin/tiles-order', async (req) => {
    const admin = requireAdmin(req);
    const { ids } = z.object({ ids: z.array(z.number().int().positive()).max(500) }).parse(req.body);
    await withTransaction(db, async (c) => {
      const { rows } = await c.query<{ id: string }>('SELECT id FROM dashboard_tiles');
      const all = new Set(rows.map((r) => Number(r.id)));
      if (ids.length !== all.size || !ids.every((x) => all.has(x)) || new Set(ids).size !== ids.length)
        throw new HttpError(400, 'A sorrendnek minden csempét pontosan egyszer kell tartalmaznia. Frissítsd az oldalt.', 'VALIDATION');
      await c.query(
        `UPDATE dashboard_tiles t SET sort_order = o.ord * 10, updated_at = now(), updated_by = $2
           FROM unnest($1::bigint[]) WITH ORDINALITY AS o(id, ord) WHERE t.id = o.id`,
        [ids, admin.id],
      );
    });
    await audit(db, admin.id, 'tiles_reordered', 'tile', undefined, { ids }, req.ip);
    return { ok: true };
  });

  // Csak saját (nem beépített) csempe törölhető; a beépítettek elrejthetők
  app.delete('/api/admin/tiles/:id', async (req) => {
    const admin = requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const { rows } = await db.query('SELECT title, is_system FROM dashboard_tiles WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'A csempe nem található.', 'NOT_FOUND');
    if (rows[0].is_system) throw new HttpError(400, 'Beépített csempe nem törölhető, csak elrejthető.', 'SYSTEM_TILE');
    await db.query('DELETE FROM dashboard_tiles WHERE id = $1', [id]);
    await audit(db, admin.id, 'tile_deleted', 'tile', id, { title: rows[0].title }, req.ip);
    return { ok: true };
  });

  // --------------------------------------------------------- Beállítások
  app.put('/api/admin/settings/dashboard', async (req) => {
    const admin = requireAdmin(req);
    const value = z.object({ title: z.string().trim().min(1).max(80), welcome: z.string().trim().max(200) }).parse(req.body);
    await db.query(
      `INSERT INTO app_settings (key, value, updated_by) VALUES ('dashboard', $1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(value), admin.id],
    );
    await audit(db, admin.id, 'settings_updated', 'app_settings', 'dashboard', value, req.ip);
    return { ok: true };
  });

  // ---------------------------------------------------------- Szerepkörök
  app.get('/api/admin/roles', async () => {
    const { rows } = await db.query('SELECT key, name, description, is_admin, is_system FROM roles ORDER BY sort_order, key');
    return { roles: rows.map((r) => ({ key: r.key, name: r.name, description: r.description, isAdmin: r.is_admin, isSystem: r.is_system })) };
  });

  // --------------------------------------------------------- Felhasználók
  app.get('/api/admin/users', async () => {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, u.role_key, r.name AS role_name, u.is_active, u.must_change_password,
              u.last_login_at, u.created_at, (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked,
              EXISTS (SELECT 1 FROM audit_log a WHERE a.entity = 'user' AND a.entity_id = u.id::text
                        AND a.action = 'password_reset_requested'
                        AND a.created_at > u.password_changed_at) AS reset_requested
         FROM users u JOIN roles r ON r.key = u.role_key
        ORDER BY u.is_active DESC, lower(u.name), lower(u.email)`,
    );
    return {
      users: rows.map((u) => ({
        id: Number(u.id), email: u.email, name: u.name, roleKey: u.role_key, roleName: u.role_name, isActive: u.is_active,
        mustChangePassword: u.must_change_password, lastLoginAt: u.last_login_at, createdAt: u.created_at,
        locked: u.locked, resetRequested: u.reset_requested,
      })),
    };
  });

  app.post('/api/admin/users', async (req) => {
    const admin = requireAdmin(req);
    const body = z.object({
      email: emailSchema,
      name: z.string().trim().min(1, 'Adj meg nevet.').max(100),
      roleKey: z.string(),
      password: z.string().max(200),
    }).parse(req.body);
    await validRoleKeys(db, [body.roleKey]);
    const problem = passwordProblem(body.password);
    if (problem) throw new HttpError(400, problem, 'WEAK_PASSWORD');
    const exists = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [body.email]);
    if (exists.rowCount) throw new HttpError(409, 'Ezzel az e-mail-címmel már van felhasználó.', 'DUPLICATE');
    // Az adminisztrátor által megadott jelszó ideiglenes: első belépéskor cserélni kell
    const { rows } = await db.query(
      `INSERT INTO users (email, name, password_hash, role_key, must_change_password)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [body.email, body.name, await hashPassword(body.password), body.roleKey],
    );
    await audit(db, admin.id, 'user_created', 'user', rows[0].id, { email: body.email, role: body.roleKey }, req.ip);
    return { id: Number(rows[0].id) };
  });

  app.put('/api/admin/users/:id', async (req) => {
    const admin = requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const body = z.object({ name: z.string().trim().min(1).max(100), roleKey: z.string(), isActive: z.boolean() }).parse(req.body);
    await validRoleKeys(db, [body.roleKey]);
    const cur = await db.query('SELECT u.is_active, r.is_admin FROM users u JOIN roles r ON r.key = u.role_key WHERE u.id = $1', [id]);
    if (!cur.rows[0]) throw new HttpError(404, 'A felhasználó nem található.', 'NOT_FOUND');
    const newRole = await db.query('SELECT is_admin FROM roles WHERE key = $1', [body.roleKey]);
    const staysAdmin = newRole.rows[0].is_admin && body.isActive;
    if (cur.rows[0].is_admin && cur.rows[0].is_active && !staysAdmin && (await otherActiveAdmins(db, id)) === 0)
      throw new HttpError(400, 'Legalább egy aktív adminisztrátornak maradnia kell.', 'LAST_ADMIN');
    if (id === admin.id && !body.isActive) throw new HttpError(400, 'Saját magadat nem tilthatod le.', 'SELF');
    await db.query('UPDATE users SET name = $2, role_key = $3, is_active = $4, updated_at = now() WHERE id = $1', [id, body.name, body.roleKey, body.isActive]);
    if (!body.isActive) await deleteUserSessions(db, id);
    await audit(db, admin.id, 'user_updated', 'user', id, { role: body.roleKey, active: body.isActive }, req.ip);
    return { ok: true };
  });

  // Ideiglenes jelszó beállítása (pl. elfelejtett jelszó esetén). Zárolást is feloldja.
  app.post('/api/admin/users/:id/reset-password', async (req) => {
    const admin = requireAdmin(req);
    const { id } = idParam.parse(req.params);
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem, 'WEAK_PASSWORD');
    const { rowCount } = await db.query(
      `UPDATE users SET password_hash = $2, must_change_password = true, failed_login_count = 0, locked_until = NULL,
              password_changed_at = now(), updated_at = now() WHERE id = $1`,
      [id, await hashPassword(password)],
    );
    if (!rowCount) throw new HttpError(404, 'A felhasználó nem található.', 'NOT_FOUND');
    await deleteUserSessions(db, id);
    await audit(db, admin.id, 'password_reset_by_admin', 'user', id, {}, req.ip);
    return { ok: true };
  });

  // ---------------------------------------------------------- Eseménynapló
  app.get('/api/admin/audit', async () => {
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip, a.created_at, u.email
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
    );
    return {
      entries: rows.map((r) => ({
        id: Number(r.id), action: r.action, entity: r.entity, entityId: r.entity_id, details: r.details,
        ip: r.ip, createdAt: r.created_at, email: r.email,
      })),
    };
  });
};
