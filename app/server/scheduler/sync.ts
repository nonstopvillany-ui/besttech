// Az ütemező módosításainak mentése a központi adatbázisba.
//
// Többfelhasználós működés: az adatok "szakaszokra" bontva verziózottak
// (projektenként egy-egy, valamint a dolgozók, sablonok, kategóriák, ütközések,
// munkaidő, bértételek, kifizetések, beállítások). A kliens csak a megváltozott
// szakaszokat küldi, a kiinduló verzióval együtt. Ha közben valaki más ugyanazt a
// szakaszt módosította, a mentés 409-cel elutasításra kerül (semmi nem íródik felül
// észrevétlenül); a különböző projekteken dolgozók nem zavarják egymást.
// Minden módosítás előtti állapot a scheduler_history táblába kerül.
import type pg from 'pg';
import { z } from 'zod';
import { withTransaction, type Db } from '../db.js';
import { HttpError } from '../lib/http.js';
import { isIsoDate, segDays, taskDays } from '../legacy/calc.js';
import { buildHouseTasks, getVersions, SCHEDULER_PROJECT_FILTER } from './state.js';

const str = (max = 500) => z.string().max(max);
const task = z.object({
  id: z.number().int().nonnegative(),
  name: str(200).min(1),
  category: str(100).default('Egyéb'),
  days: z.unknown().optional(),
  start: z.string().nullish(),
  extra: z.array(z.object({ start: z.string().nullish(), days: z.unknown().optional() }).passthrough()).max(50).default([]),
  lead: z.string().max(120).nullish(),
  workers: z.array(str(120)).max(100).default([]),
  notes: z.string().max(5000).nullish(),
  placed: z.boolean().default(false),
  past: z.boolean().optional(),
  order: z.number().default(0),
  done: z.array(z.unknown()).max(2000).default([]),
  dayWorkers: z.record(z.string(), z.array(str(120)).max(100)).optional(),
  dayNotes: z.record(z.string(), z.string().max(2000)).optional(),
}).passthrough();

const house = z.object({
  id: z.number().int().positive().optional(),
  tmp: z.string().max(40).optional(),
  base: z.number().int().optional(),
  name: str(200).min(1),
  tasks: z.array(task).max(1000),
});

export const syncSchema = z.object({
  houses: z.array(house).max(500).default([]),
  archived: z.array(z.object({ id: z.number().int().positive(), base: z.number().int() })).max(500).default([]),
  sections: z.object({
    roster: z.object({ base: z.number().int(), data: z.array(z.object({ name: str(120).min(1), role: z.string().optional(), email: z.string().max(200).nullish(), wage: z.unknown().optional() }).passthrough()).max(1000) }).optional(),
    custom: z.object({ base: z.number().int(), data: z.array(z.object({ name: str(200).min(1), category: z.string().max(100).optional(), days: z.unknown().optional(), lead: z.string().nullish(), workers: z.array(z.string()).optional(), notes: z.string().nullish() }).passthrough()).max(1000) }).optional(),
    cats: z.object({ base: z.number().int(), data: z.record(z.string().max(100), z.string()) }).optional(),
    ignored: z.object({ base: z.number().int(), data: z.record(z.string().max(200), z.unknown()) }).optional(),
    hours: z.object({ base: z.number().int(), data: z.record(z.string().max(200), z.object({ from: z.string(), to: z.string() }).passthrough()) }).optional(),
    payItems: z.object({ base: z.number().int(), data: z.array(z.object({ id: z.unknown().optional(), w: str(120), ym: z.string(), amount: z.number(), note: z.string().max(1000).nullish(), recurring: z.boolean().optional(), end: z.string().nullish() }).passthrough()).max(10000) }).optional(),
    subPays: z.object({ base: z.number().int(), data: z.array(z.object({ id: z.unknown().optional(), w: str(120), date: z.string(), project: z.string().max(200).nullish(), work: z.string().max(1000).nullish(), amount: z.number(), note: z.string().max(1000).nullish() }).passthrough()).max(10000) }).optional(),
    settings: z.object({ base: z.number().int(), data: z.object({ mailTime: z.string().regex(/^\d{2}:\d{2}$/) }) }).optional(),
  }).default({}),
});
export type SyncInput = z.infer<typeof syncSchema>;

const FINANCE_SECTIONS = new Set(['payItems', 'subPays']);
const HM = /^\d{2}:\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

function splitKey(k: string) {
  const i = k.lastIndexOf('|');
  if (i < 1) return null;
  const date = k.slice(i + 1);
  return isIsoDate(date) ? { name: k.slice(0, i), date } : null;
}

/** Név → dolgozó-azonosító; ismeretlen név esetén inaktív dolgozót hoz létre (a v25 név szerint hivatkozott). */
class Lookups {
  workers = new Map<string, number>();
  cats = new Map<string, number>();
  templates = new Map<string, number>();
  constructor(private c: pg.PoolClient) {}
  async load() {
    for (const r of (await this.c.query('SELECT id, name FROM workers')).rows) this.workers.set(r.name.toLocaleLowerCase('hu-HU'), Number(r.id));
    for (const r of (await this.c.query('SELECT id, name FROM categories')).rows) this.cats.set(r.name, Number(r.id));
    for (const r of (await this.c.query('SELECT id, name FROM task_templates')).rows) this.templates.set(r.name, Number(r.id));
  }
  async worker(name: string | null | undefined): Promise<number | null> {
    const n = (name ?? '').trim();
    if (!n) return null;
    const k = n.toLocaleLowerCase('hu-HU');
    let id = this.workers.get(k);
    if (id == null) {
      const r = await this.c.query(
        `INSERT INTO workers (name, is_active) VALUES ($1, false)
         ON CONFLICT ((lower(name))) DO UPDATE SET updated_at = workers.updated_at RETURNING id`, [n]);
      id = Number(r.rows[0].id);
      this.workers.set(k, id);
    }
    return id;
  }
  async category(name: string): Promise<number> {
    const n = name.trim() || 'Egyéb';
    let id = this.cats.get(n);
    if (id == null) {
      const r = await this.c.query(
        `INSERT INTO categories (name, sort_order) VALUES ($1, (SELECT COALESCE(max(sort_order), 0) + 10 FROM categories))
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [n]);
      id = Number(r.rows[0].id);
      this.cats.set(n, id);
    }
    return id;
  }
}

async function bumpSection(c: pg.PoolClient, key: string, base: number, userId: number, conflicts: string[]) {
  const r = await c.query('SELECT version FROM scheduler_sections WHERE key = $1 FOR UPDATE', [key]);
  if (!r.rows[0] || r.rows[0].version !== base) { conflicts.push(key); return false; }
  await c.query('UPDATE scheduler_sections SET version = version + 1, updated_at = now(), updated_by = $2 WHERE key = $1', [key, userId]);
  return true;
}

async function history(c: pg.PoolClient, section: string, projectId: number | null, oldData: unknown, userId: number) {
  await c.query('INSERT INTO scheduler_history (section, project_id, old_data, user_id) VALUES ($1, $2, $3, $4)', [section, projectId, JSON.stringify(oldData), userId]);
}

/** Egy projekt munkafázisainak teljes cseréje a kapott v25-formátumú listára. */
async function writeTasks(c: pg.PoolClient, L: Lookups, projectId: number, tasks: SyncInput['houses'][number]['tasks']) {
  await c.query('DELETE FROM project_tasks WHERE project_id = $1', [projectId]);
  const seen = new Set<number>();
  for (const [pos, t] of tasks.entries()) {
    if (seen.has(t.id)) throw new HttpError(400, `Ismétlődő munkaazonosító (${t.id}) a projektben.`, 'VALIDATION');
    seen.add(t.id);
    const segs = isIsoDate(t.start) && t.placed && !t.past
      ? [{ start: t.start, days: segDays(t.days) }, ...t.extra.filter((x) => isIsoDate(x.start)).map((x) => ({ start: x.start as string, days: segDays(x.days) }))]
      : [];
    const days = segs.length ? taskDays({ start: t.start, days: t.days, extra: t.extra.filter((x) => isIsoDate(x.start)) }) : [];
    const doneCount = days.filter((_, i) => !!t.done[i]).length;
    const status = t.past ? 'past_done' : segs.length ? (days.length && doneCount === days.length ? 'done' : 'scheduled') : 'unscheduled';
    const r = await c.query(
      `INSERT INTO project_tasks (project_id, template_id, name, category_id, lead_worker_id, notes, status, planned_days, base_days, position, sort_order, legacy_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [projectId, L.templates.get(t.name) ?? null, t.name, await L.category(t.category), await L.worker(t.lead), (t.notes ?? '').slice(0, 5000), status,
        segs.length ? segs.reduce((s, x) => s + x.days, 0) : segDays(t.days), segDays(t.days), pos, Math.round(t.order) || 0, t.id],
    );
    const tid = Number(r.rows[0].id);
    const wids = [...new Set((await Promise.all(t.workers.map((w) => L.worker(w)))).filter((x): x is number => x != null))];
    if (wids.length) await c.query('INSERT INTO task_workers (task_id, worker_id) SELECT $1, unnest($2::bigint[])', [tid, wids]);
    for (const [i, s] of segs.entries()) await c.query('INSERT INTO task_segments (task_id, seq, start_date, workdays) VALUES ($1, $2, $3, $4)', [tid, i + 1, s.start, s.days]);
    for (const [i, d] of days.entries()) {
      const ov = t.dayWorkers?.[d];
      const dr = await c.query(
        'INSERT INTO task_days (task_id, work_date, is_done, note, has_worker_override) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [tid, d, !!t.done[i], (t.dayNotes?.[d] ?? '').trim(), !!ov],
      );
      if (ov?.length) {
        const ids = [...new Set((await Promise.all(ov.map((w) => L.worker(w)))).filter((x): x is number => x != null))];
        if (ids.length) await c.query('INSERT INTO task_day_workers (task_day_id, worker_id) SELECT $1, unnest($2::bigint[])', [dr.rows[0].id, ids]);
      }
    }
  }
}

export interface SyncResult { versions: Awaited<ReturnType<typeof getVersions>>; idMap: Record<string, number> }

export async function applySync(db: Db, input: SyncInput, user: { id: number; finance: boolean }): Promise<SyncResult> {
  return withTransaction(db, async (c) => {
    const conflicts: string[] = [];
    const L = new Lookups(c);
    await L.load();
    const S = input.sections;
    const sectionsWanted = Object.keys(S).filter((k) => !FINANCE_SECTIONS.has(k) || user.finance);
    // Rögzített sorrend a holtpontok elkerülésére
    for (const k of [...sectionsWanted].sort()) await bumpSection(c, k, (S as Record<string, { base: number }>)[k].base, user.id, conflicts);
    const houseIds = [...input.houses.filter((h) => h.id).map((h) => h.id!), ...input.archived.map((a) => a.id)].sort((a, b) => a - b);
    const cur = new Map<number, { v: number; init: boolean }>();
    if (houseIds.length)
      for (const r of (await c.query(`SELECT id, sched_version, scheduler_initialized FROM projects WHERE id = ANY($1) AND ${SCHEDULER_PROJECT_FILTER} ORDER BY id FOR UPDATE`, [houseIds])).rows)
        cur.set(Number(r.id), { v: r.sched_version, init: r.scheduler_initialized });
    for (const h of input.houses) if (h.id && cur.get(h.id)?.v !== h.base) conflicts.push(`house:${h.id}`);
    for (const a of input.archived) if (cur.get(a.id)?.v !== a.base) conflicts.push(`house:${a.id}`);
    if (conflicts.length) throw new HttpError(409, 'Közben más is módosította ugyanezeket az adatokat.', 'CONFLICT', { conflicts });

    // --- dolgozók (név szerint egyeztetve; a névsorból kikerült dolgozó inaktív lesz, nem törlődik)
    if (S.roster) {
      await history(c, 'roster', null, (await c.query('SELECT name, role, email, hourly_wage, is_active FROM workers ORDER BY id')).rows, user.id);
      const keep: number[] = [];
      for (const r of S.roster.data) {
        const role = ['lead', 'helper', 'sub'].includes(r.role ?? '') ? r.role : 'helper';
        const wage = Number(r.wage);
        const res = await c.query(
          `INSERT INTO workers (name, role, email, hourly_wage, is_active) VALUES ($1, $2, $3, $4, true)
           ON CONFLICT ((lower(name))) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email, is_active = true,
             hourly_wage = CASE WHEN $5 THEN EXCLUDED.hourly_wage ELSE workers.hourly_wage END, updated_at = now()
           RETURNING id`,
          [r.name.trim(), role, (r.email ?? '').trim(), user.finance && Number.isFinite(wage) && wage > 0 ? wage : null, user.finance],
        );
        keep.push(Number(res.rows[0].id));
        L.workers.set(r.name.trim().toLocaleLowerCase('hu-HU'), Number(res.rows[0].id));
      }
      await c.query('UPDATE workers SET is_active = false, updated_at = now() WHERE is_active AND NOT (id = ANY($1::bigint[]))', [keep]);
    }
    // --- kategóriák (csak hozzáadás / színmódosítás)
    if (S.cats) {
      for (const [name, color] of Object.entries(S.cats.data)) {
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) continue;
        const r = await c.query(
          `INSERT INTO categories (name, color, sort_order) VALUES ($1, $2, (SELECT COALESCE(max(sort_order), 0) + 10 FROM categories))
           ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color RETURNING id`, [name, color]);
        L.cats.set(name, Number(r.rows[0].id));
      }
    }
    // --- egyéni sablonok (a listából kikerült inaktív lesz)
    if (S.custom) {
      await history(c, 'custom', null, (await c.query(`SELECT name, default_days, notes, is_active FROM task_templates WHERE source = 'custom'`)).rows, user.id);
      const keep: number[] = [];
      for (const [i, t] of S.custom.data.entries()) {
        const r = await c.query(
          `INSERT INTO task_templates (name, category_id, default_days, default_lead_id, notes, source, sort_order, is_active)
           VALUES ($1, $2, $3, $4, $5, 'custom', $6, true)
           ON CONFLICT (name) DO UPDATE SET category_id = EXCLUDED.category_id, default_days = EXCLUDED.default_days,
             default_lead_id = EXCLUDED.default_lead_id, notes = EXCLUDED.notes, is_active = true
           WHERE task_templates.source = 'custom'
           RETURNING id`,
          [t.name, await L.category(t.category ?? 'Egyéb'), segDays(t.days), await L.worker(t.lead), (t.notes ?? '').slice(0, 5000), 1000 + i * 10],
        );
        if (!r.rows[0]) continue; // beépített sablonnal azonos név: a beépített marad
        const id = Number(r.rows[0].id);
        keep.push(id);
        L.templates.set(t.name, id);
        await c.query('DELETE FROM task_template_workers WHERE template_id = $1', [id]);
        const wids = [...new Set((await Promise.all((t.workers ?? []).map((w) => L.worker(w)))).filter((x): x is number => x != null))];
        if (wids.length) await c.query('INSERT INTO task_template_workers (template_id, worker_id) SELECT $1, unnest($2::bigint[])', [id, wids]);
      }
      await c.query(`UPDATE task_templates SET is_active = false WHERE source = 'custom' AND is_active AND NOT (id = ANY($1::bigint[]))`, [keep]);
    }

    // --- projektek (ütemezési adatok); új projekt az ütemezőből is felvehető
    const idMap: Record<string, number> = {};
    for (const h of input.houses) {
      let pid = h.id;
      if (pid) {
        const old = cur.get(pid)!;
        await history(c, 'house', pid, { name: (await c.query('SELECT name FROM projects WHERE id = $1', [pid])).rows[0]?.name, tasks: await buildHouseTasks(c, pid, old.init) }, user.id);
        await c.query(
          `UPDATE projects SET name = $2, scheduler_initialized = true, sched_version = sched_version + 1,
             version = CASE WHEN name <> $2 THEN version + 1 ELSE version END, updated_at = now(), updated_by = $3 WHERE id = $1`,
          [pid, h.name.trim(), user.id]);
      } else {
        const r = await c.query(
          `INSERT INTO projects (name, status, scheduler_initialized, sort_order, created_by, updated_by)
           VALUES ($1, 'active', true, (SELECT COALESCE(max(sort_order), 0) + 10 FROM projects), $2, $2) RETURNING id`,
          [h.name.trim(), user.id]);
        pid = Number(r.rows[0].id);
        if (h.tmp) idMap[h.tmp] = pid;
      }
      await writeTasks(c, L, pid, h.tasks);
    }
    // Az ütemezőben "törölt" projekt csak archiválódik – minden adata megmarad
    for (const a of input.archived) {
      await history(c, 'archive', a.id, null, user.id);
      await c.query(`UPDATE projects SET status = 'archived', sched_version = sched_version + 1, version = version + 1, updated_at = now(), updated_by = $2 WHERE id = $1`, [a.id, user.id]);
    }

    // --- tudomásul vett ütközések, munkaidő
    if (S.ignored) {
      await history(c, 'ignored', null, (await c.query('SELECT worker_id, work_date FROM conflict_acks')).rows, user.id);
      await c.query('DELETE FROM conflict_acks');
      for (const [k, v] of Object.entries(S.ignored.data)) {
        const p = v ? splitKey(k) : null;
        if (p) await c.query('INSERT INTO conflict_acks (worker_id, work_date, acked_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [await L.worker(p.name), p.date, user.id]);
      }
    }
    if (S.hours) {
      await history(c, 'hours', null, (await c.query('SELECT worker_id, work_date, time_from, time_to FROM worker_day_hours')).rows, user.id);
      await c.query('DELETE FROM worker_day_hours');
      for (const [k, v] of Object.entries(S.hours.data)) {
        const p = splitKey(k);
        if (p && HM.test(v.from) && HM.test(v.to))
          await c.query('INSERT INTO worker_day_hours (worker_id, work_date, time_from, time_to) VALUES ($1, $2, $3, $4) ON CONFLICT (worker_id, work_date) DO UPDATE SET time_from = EXCLUDED.time_from, time_to = EXCLUDED.time_to', [await L.worker(p.name), p.date, v.from, v.to]);
      }
    }
    // --- pénzügyi szakaszok (csak pénzügyi joggal)
    if (S.payItems && user.finance) {
      await history(c, 'payItems', null, (await c.query('SELECT * FROM pay_adjustments ORDER BY id')).rows, user.id);
      await c.query('DELETE FROM pay_adjustments');
      for (const x of S.payItems.data) {
        if (!YM.test(x.ym) || (x.end && !YM.test(x.end))) throw new HttpError(400, `Érvénytelen hónap a bértételnél: ${x.ym}`, 'VALIDATION');
        await c.query('INSERT INTO pay_adjustments (worker_id, start_ym, end_ym, recurring, amount, note, legacy_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [await L.worker(x.w), x.ym, x.end || null, !!x.recurring, x.amount, (x.note ?? '').trim(), x.id != null ? String(x.id) : null]);
      }
    }
    if (S.subPays && user.finance) {
      await history(c, 'subPays', null, (await c.query('SELECT * FROM subcontractor_payments ORDER BY id')).rows, user.id);
      await c.query('DELETE FROM subcontractor_payments');
      const byName = new Map((await c.query('SELECT id, name FROM projects')).rows.map((r) => [r.name, Number(r.id)]));
      for (const x of S.subPays.data) {
        if (!isIsoDate(x.date)) throw new HttpError(400, `Érvénytelen dátum a kifizetésnél: ${x.date}`, 'VALIDATION');
        const pn = (x.project ?? '').trim();
        await c.query('INSERT INTO subcontractor_payments (worker_id, project_id, project_name, pay_date, work_desc, amount, note, legacy_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [await L.worker(x.w), byName.get(pn) ?? null, pn, x.date, (x.work ?? '').trim(), x.amount, (x.note ?? '').trim(), x.id != null ? String(x.id) : null]);
      }
    }
    if (S.settings) {
      await c.query(
        `INSERT INTO app_settings (key, value, updated_by) VALUES ('scheduler', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = app_settings.value || EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [JSON.stringify({ mailTime: S.settings.data.mailTime }), user.id]);
    }
    // Régi előzmények takarítása (90 napnál régebbiek)
    await c.query(`DELETE FROM scheduler_history WHERE created_at < now() - interval '90 days'`);
    return { versions: await getVersions(c), idMap };
  });
}
