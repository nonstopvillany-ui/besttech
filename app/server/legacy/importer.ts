// Az átalakított v25-adatok beírása az adatbázisba – EGYETLEN tranzakcióban.
// Hiba esetén semmi nem marad félkész állapotban. Az eredeti JSON változatlanul
// a legacy_imports táblába kerül. Csak egyszer futtatható (második importot elutasít),
// hogy ne keletkezzenek duplikált projektek.
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { withTransaction, type Db } from '../db.js';
import { HttpError } from '../lib/http.js';
import { transformLegacy, type ImportReport } from './transform.js';

export const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

export async function commitLegacyImport(db: Db, rawText: string, fileName: string, userId: number | null): Promise<{ importId: number; report: ImportReport }> {
  let parsed: unknown;
  try { parsed = JSON.parse(rawText); } catch { throw new HttpError(400, 'A fájl nem érvényes JSON.', 'INVALID_JSON'); }
  const { data, report } = transformLegacy(parsed);
  const hash = sha256(rawText);

  const importId = await withTransaction(db, async (c: pg.PoolClient) => {
    // Párhuzamos importok kizárása
    await c.query('LOCK TABLE legacy_imports IN EXCLUSIVE MODE');
    const prev = await c.query('SELECT id, sha256 FROM legacy_imports LIMIT 1');
    if (prev.rows[0]) throw new HttpError(409, prev.rows[0].sha256 === hash
      ? 'Ezt a fájlt már importálták.'
      : 'Már történt import. Újabb importhoz előbb egyeztetni kell (összefésülés még nincs).', 'ALREADY_IMPORTED');

    const imp = await c.query(
      `INSERT INTO legacy_imports (file_name, sha256, status, summary, raw, imported_by) VALUES ($1, $2, 'committed', $3, $4, $5) RETURNING id`,
      [fileName.slice(0, 200), hash, JSON.stringify(report), rawText, userId],
    );
    const iid = Number(imp.rows[0].id);

    // kategóriák (meglévő név esetén a meglévőt használjuk)
    const catId = new Map<string, number>();
    for (const k of data.categories) {
      const r = await c.query(
        `INSERT INTO categories (name, color, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [k.name, k.color, k.sortOrder],
      );
      catId.set(k.name, Number(r.rows[0].id));
    }
    // dolgozók
    const wId = new Map<string, number>();
    for (const w of data.workers) {
      const r = await c.query(
        `INSERT INTO workers (name, role, email, hourly_wage, is_active, legacy_name) VALUES ($1, $2, $3, $4, $5, $1) RETURNING id`,
        [w.name, w.role, w.email, w.hourlyWage, w.inRoster],
      );
      wId.set(w.key, Number(r.rows[0].id));
    }
    const W = (k: string | null) => (k ? wId.get(k) ?? null : null);
    // sablonok
    const tplId = new Map<string, number>();
    for (const t of data.templates) {
      const r = await c.query(
        `INSERT INTO task_templates (name, category_id, default_days, sort_order, source) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [t.name, catId.get(t.category), t.days, t.sortOrder, t.source],
      );
      tplId.set(t.name, Number(r.rows[0].id));
    }
    // projektek, munkák, szakaszok, napok
    const projId = new Map<number, number>();
    for (const p of data.projects) {
      const r = await c.query(
        `INSERT INTO projects (name, hrsz, legacy_import_id, legacy_index, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [p.name, p.hrsz, iid, p.legacyIndex, (p.legacyIndex + 1) * 10],
      );
      const pid = Number(r.rows[0].id);
      projId.set(p.legacyIndex, pid);
      for (const t of p.tasks) {
        const tr = await c.query(
          `INSERT INTO project_tasks (project_id, template_id, name, category_id, lead_worker_id, notes, status, planned_days, sort_order, legacy_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [pid, t.templateName ? tplId.get(t.templateName) ?? null : null, t.name, catId.get(t.category), W(t.leadKey), t.notes, t.status, t.plannedDays, t.sortOrder, t.legacyId],
        );
        const tid = Number(tr.rows[0].id);
        if (t.workerKeys.length)
          await c.query('INSERT INTO task_workers (task_id, worker_id) SELECT $1, unnest($2::bigint[])', [tid, t.workerKeys.map(W)]);
        for (const s of t.segments)
          await c.query('INSERT INTO task_segments (task_id, seq, start_date, workdays) VALUES ($1, $2, $3, $4)', [tid, s.seq, s.start, s.workdays]);
        for (const d of t.days) {
          const dr = await c.query(
            `INSERT INTO task_days (task_id, work_date, is_done, note, has_worker_override) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [tid, d.date, d.done, d.note, d.overrideWorkers !== null],
          );
          if (d.overrideWorkers?.length)
            await c.query('INSERT INTO task_day_workers (task_day_id, worker_id) SELECT $1, unnest($2::bigint[])', [dr.rows[0].id, d.overrideWorkers.map(W)]);
        }
      }
    }
    for (const h of data.hours)
      await c.query(
        `INSERT INTO worker_day_hours (worker_id, work_date, time_from, time_to) VALUES ($1, $2, $3, $4)
         ON CONFLICT (worker_id, work_date) DO UPDATE SET time_from = EXCLUDED.time_from, time_to = EXCLUDED.time_to`,
        [W(h.workerKey), h.date, h.from, h.to],
      );
    for (const a of data.conflictAcks)
      await c.query('INSERT INTO conflict_acks (worker_id, work_date, acked_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [W(a.workerKey), a.date, userId]);
    for (const x of data.payAdjustments)
      await c.query(
        `INSERT INTO pay_adjustments (worker_id, start_ym, end_ym, recurring, amount, note, legacy_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [W(x.workerKey), x.startYm, x.endYm, x.recurring, x.amount, x.note, x.legacyId],
      );
    for (const x of data.subPayments)
      await c.query(
        `INSERT INTO subcontractor_payments (worker_id, project_id, project_name, pay_date, work_desc, amount, note, legacy_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [W(x.workerKey), x.projectLegacyIndex != null ? projId.get(x.projectLegacyIndex) : null, x.projectName, x.date, x.work, x.amount, x.note, x.legacyId],
      );
    if (data.settings.mailTime)
      await c.query(
        `INSERT INTO app_settings (key, value, updated_by) VALUES ('scheduler', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = app_settings.value || EXCLUDED.value, updated_at = now()`,
        [JSON.stringify({ mailTime: data.settings.mailTime }), userId],
      );
    return iid;
  });
  return { importId, report };
}
