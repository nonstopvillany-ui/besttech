import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db.js';
import { requireUser } from '../lib/http.js';

export interface TileRow {
  id: number;
  moduleKey: string | null;
  title: string;
  description: string;
  icon: string;
  color: string;
  targetType: 'internal' | 'external' | 'none';
  target: string;
  status: 'active' | 'development';
  sortOrder: number;
  isVisible: boolean;
  isSystem: boolean;
  roles: string[];
}

export const TILE_SELECT = `
  SELECT t.id, t.module_key, t.title, t.description, t.icon, t.color, t.target_type, t.target,
         t.status, t.sort_order, t.is_visible, t.is_system,
         COALESCE(array_agg(tr.role_key ORDER BY tr.role_key) FILTER (WHERE tr.role_key IS NOT NULL), '{}') AS roles
    FROM dashboard_tiles t
    LEFT JOIN dashboard_tile_roles tr ON tr.tile_id = t.id`;

export function mapTile(r: Record<string, any>): TileRow {
  return {
    id: Number(r.id), moduleKey: r.module_key, title: r.title, description: r.description, icon: r.icon,
    color: r.color, targetType: r.target_type, target: r.target, status: r.status, sortOrder: r.sort_order,
    isVisible: r.is_visible, isSystem: r.is_system, roles: r.roles,
  };
}

/**
 * Egy csempe akkor kattintható, ha "kész" állapotú ÉS van célja.
 * Minden más esetben a felület "Fejlesztés alatt" jelzést mutat.
 */
export const isTileReady = (t: TileRow) => t.status === 'active' && t.targetType !== 'none' && t.target !== '';

export const dashboardRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  // A bejelentkezett felhasználó főoldala: csak a látható és számára engedélyezett csempék.
  // Az adminisztrátor minden látható csempét lát.
  app.get('/api/dashboard', async (req) => {
    const user = requireUser(req);
    const { rows } = await db.query(
      `${TILE_SELECT}
        WHERE t.is_visible
          AND ($1::boolean OR EXISTS (SELECT 1 FROM dashboard_tile_roles x WHERE x.tile_id = t.id AND x.role_key = $2))
        GROUP BY t.id
        ORDER BY t.sort_order, t.id`,
      [user.isAdmin, user.roleKey],
    );
    const settings = await db.query(`SELECT value FROM app_settings WHERE key = 'dashboard'`);
    return {
      settings: settings.rows[0]?.value ?? {},
      tiles: rows.map(mapTile).map((t) => ({
        id: t.id, moduleKey: t.moduleKey, title: t.title, description: t.description, icon: t.icon, color: t.color,
        targetType: t.targetType, target: isTileReady(t) ? t.target : '', ready: isTileReady(t),
      })),
    };
  });

  // Egy csempe adatai a "Fejlesztés alatt" oldalhoz (jogosultság-ellenőrzéssel)
  app.get<{ Params: { id: string } }>('/api/dashboard/tiles/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(404).send({ error: 'Nem található.' });
    const { rows } = await db.query(
      `${TILE_SELECT}
        WHERE t.id = $1 AND t.is_visible
          AND ($2::boolean OR EXISTS (SELECT 1 FROM dashboard_tile_roles x WHERE x.tile_id = t.id AND x.role_key = $3))
        GROUP BY t.id`,
      [id, user.isAdmin, user.roleKey],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Nem található.' });
    const t = mapTile(rows[0]);
    return { tile: { id: t.id, title: t.title, description: t.description, icon: t.icon, color: t.color, ready: isTileReady(t) } };
  });
};
