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

  // Teljes adatmentés (JSON) az alkalmazás sémájából – jelszó-hash és munkamenetek nélkül.
  // Az import (és minden nagyobb művelet) előtt letöltendő; a Railway saját mentése mellett.
  app.get('/api/admin/backup', async (req, reply) => {
    const admin = requireAdmin(req);
    const { rows: tables } = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name NOT IN ('sessions') ORDER BY 1`);
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), schema: (await db.query('SELECT current_schema() AS s')).rows[0].s, tables: {} };
    for (const { table_name: t } of tables) {
      if (!/^[a-z_][a-z0-9_]*$/.test(t)) continue;
      const { rows } = await db.query(`SELECT * FROM "${t}"`);
      (out.tables as Record<string, unknown>)[t] = t === 'users' ? rows.map(({ password_hash: _p, ...u }) => u) : rows;
    }
    await audit(db, admin.id, 'backup_downloaded', 'backup', undefined, { tables: tables.length }, req.ip);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return reply.header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="besttech-app-mentes-${stamp}.json"`)
      .header('cache-control', 'no-store').send(JSON.stringify(out));
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
    // Import előtt kötelező az adatbázis-mentés (Admin → Régi adatok → mentés letöltése, vagy Railway-mentés)
    if ((req.body as { backupConfirmed?: unknown })?.backupConfirmed !== true)
      throw new HttpError(400, 'Import előtt készíts adatbázis-mentést, és erősítsd meg.', 'BACKUP_REQUIRED');
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
