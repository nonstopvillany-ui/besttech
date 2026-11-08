import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodError } from 'zod';
import type { AppConfig } from '../config.js';
import type { Db } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError, requireAdmin } from '../lib/http.js';
import { commitLegacyImport, sha256 } from '../legacy/importer.js';
import { transformLegacy } from '../legacy/transform.js';

// A v25 mentésfájl mérete néhány MB is lehet
const bodyLimit = 15 * 1024 * 1024;
const body = z.object({ fileName: z.string().max(200).default('mentes.json'), content: z.string().min(2).max(bodyLimit) });

export const legacyRoutes: FastifyPluginAsync<{ db: Db; config: AppConfig }> = async (app, { db, config }) => {
  app.get('/api/admin/legacy-import/status', async (req) => {
    requireAdmin(req);
    const { rows } = await db.query('SELECT id, file_name, created_at, summary FROM legacy_imports ORDER BY id');
    return {
      commitEnabled: config.legacyImportEnabled,
      imports: rows.map((r) => ({ id: Number(r.id), fileName: r.file_name, createdAt: r.created_at, counts: r.summary?.counts })),
    };
  });

  // Előnézet: csak ellenőriz és összesít, az adatbázisba NEM ír
  app.post('/api/admin/legacy-import/preview', { bodyLimit }, async (req) => {
    const admin = requireAdmin(req);
    const { fileName, content } = body.parse(req.body);
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new HttpError(400, 'A fájl nem érvényes JSON.', 'INVALID_JSON'); }
    try {
      const { data, report } = transformLegacy(parsed);
      await audit(db, admin.id, 'legacy_import_preview', 'legacy_import', undefined, { fileName, sha256: sha256(content), counts: report.counts }, req.ip);
      return {
        report,
        projects: data.projects.map((p) => ({ name: p.name, hrsz: p.hrsz, tasks: p.tasks.length, scheduled: p.tasks.filter((t) => t.status === 'scheduled' || t.status === 'done').length })),
        workers: data.workers.map((w) => ({ name: w.name, role: w.role, inRoster: w.inRoster })),
      };
    } catch (e) {
      if (e instanceof ZodError) {
        const i = e.issues[0];
        throw new HttpError(400, `A fájl nem a v25 ütemező mentése, vagy sérült (${i?.path.join('.') || 'gyökér'}: ${i?.message}).`, 'INVALID_LEGACY');
      }
      throw e;
    }
  });

  // Tényleges import: alapértelmezésben TILTVA (LEGACY_IMPORT_ENABLED=true kapcsolja be)
  app.post('/api/admin/legacy-import/commit', { bodyLimit }, async (req) => {
    const admin = requireAdmin(req);
    if (!config.legacyImportEnabled)
      throw new HttpError(403, 'Az éles adatimport még nincs engedélyezve (LEGACY_IMPORT_ENABLED). Előbb jóváhagyás szükséges.', 'IMPORT_DISABLED');
    const { fileName, content } = body.parse(req.body);
    const confirm = z.object({ confirm: z.literal('IMPORTÁLÁS') }).safeParse(req.body);
    if (!confirm.success) throw new HttpError(400, 'A megerősítéshez írd be: IMPORTÁLÁS', 'CONFIRM_REQUIRED');
    try {
      const { importId, report } = await commitLegacyImport(db, content, fileName, admin.id);
      await audit(db, admin.id, 'legacy_import_committed', 'legacy_import', importId, { fileName, counts: report.counts }, req.ip);
      return { importId, report };
    } catch (e) {
      if (e instanceof ZodError) throw new HttpError(400, 'A fájl nem a v25 ütemező mentése, vagy sérült.', 'INVALID_LEGACY');
      throw e;
    }
  });
};
