import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db.js';
import { audit } from '../lib/audit.js';
import { can, requirePerm } from '../lib/http.js';
import { buildState, getVersions } from '../scheduler/state.js';
import { applySync, syncSchema } from '../scheduler/sync.js';

export const schedulerRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  // Teljes állapot a v26 ütemezőfelületnek (pénzügyi adatok csak pénzügyi joggal)
  app.get('/api/scheduler/state', async (req) => {
    const user = requirePerm(req, 'scheduler.view');
    const perms = { edit: can(user, 'scheduler.edit'), finance: can(user, 'scheduler.finance') };
    const state = await buildState(db, perms);
    return { ...state, me: { name: user.name || user.email, roleName: user.roleName, isAdmin: user.isAdmin } };
  });

  // Könnyű lekérdezés: változott-e valami (más felhasználó mentése, új projekt stb.)
  app.get('/api/scheduler/versions', async (req) => {
    requirePerm(req, 'scheduler.view');
    return getVersions(db);
  });

  // Módosítások mentése (csak a megváltozott projektek / szakaszok)
  app.put('/api/scheduler/sync', { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const user = requirePerm(req, 'scheduler.edit');
    const input = syncSchema.parse(req.body);
    const result = await applySync(db, input, { id: user.id, finance: can(user, 'scheduler.finance') });
    await audit(db, user.id, 'scheduler_saved', 'scheduler', undefined, {
      houses: input.houses.map((h) => h.id ?? 'új'), archived: input.archived.map((a) => a.id), sections: Object.keys(input.sections),
    }, req.ip);
    return result;
  });
};
