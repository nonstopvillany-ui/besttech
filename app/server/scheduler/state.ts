// Az ütemező állapotának felépítése a KÖZPONTI adatbázisból, a v25 felület által
// várt szerkezetben (S objektum). Az ütemező nem tart külön projekt- vagy
// ügyféladatbázist: a "houses" a projects táblából jön, így az Projektek modulban
// létrehozott projekt automatikusan megjelenik itt is.
import type pg from 'pg';
import type { Db } from '../db.js';
import { taskDays } from '../legacy/calc.js';

type Q = Db | pg.PoolClient;

export interface LegacyTask {
  id: number; name: string; category: string; days: number; start: string; extra: Array<{ start: string; days: number }>;
  lead: string; workers: string[]; notes: string; placed: boolean; past?: boolean; order: number; done: boolean[];
  dayWorkers?: Record<string, string[]>; dayNotes?: Record<string, string>;
}
export interface LegacyHouse { id: number; name: string; code: string; customer: string | null; tasks: LegacyTask[] }
export interface SchedulerVersions { houses: Record<string, number>; sections: Record<string, number> }
export interface SchedulerState {
  houses: LegacyHouse[];
  roster: Array<{ name: string; role: string; email: string; wage?: number }>;
  custom: Array<{ name: string; category: string; days: number; lead: string; workers: string[]; notes: string }>;
  seed: Array<[string, number, string, string[]]>;
  ignored: Record<string, true>;
  hours: Record<string, { from: string; to: string }>;
  payItems: Array<Record<string, unknown>>;
  subPays: Array<Record<string, unknown>>;
  cats: Record<string, string>;
  mailTime: string;
  v14: true;
  versions: SchedulerVersions;
  perms: { edit: boolean; finance: boolean };
}

const iso = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
const hm = (t: string) => t.slice(0, 5);

/** Ütemezésből kihagyott (archivált) projekteken kívül minden projekt látszik az ütemezőben. */
export const SCHEDULER_PROJECT_FILTER = `status <> 'archived'`;

export async function getVersions(q: Q): Promise<SchedulerVersions> {
  const h = await q.query(`SELECT id, sched_version FROM projects WHERE ${SCHEDULER_PROJECT_FILTER}`);
  const s = await q.query('SELECT key, version FROM scheduler_sections');
  return {
    houses: Object.fromEntries(h.rows.map((r) => [String(r.id), r.sched_version])),
    sections: Object.fromEntries(s.rows.map((r) => [r.key, r.version])),
  };
}

/** Egy projekt munkafázisai v25-formában. Ha az ütemező még nem nyitotta meg, a sablonokból. */
export async function buildHouseTasks(q: Q, projectId: number, initialized: boolean, templates?: TemplateData): Promise<LegacyTask[]> {
  if (!initialized) {
    const tpl = templates ?? (await loadTemplates(q));
    // v25 newTasks(): beépített sablonok, majd az egyéniek, 1-től számozva
    const base = [
      ...tpl.seed.map(([name, days, category, w]) => ({ name, days, category, lead: w[0] ?? '', workers: [...w], notes: '' })),
      ...tpl.custom.map((c) => ({ name: c.name, days: c.days, category: c.category, lead: c.lead, workers: [...c.workers], notes: c.notes })),
    ];
    return base.map((x, i) => ({ ...x, id: i + 1, start: '', extra: [], placed: false, order: 0, done: [] }));
  }
  const { rows } = await q.query(
    `SELECT t.id, t.legacy_id, t.name, c.name AS category, t.base_days, t.status, t.sort_order, t.notes,
            lw.name AS lead,
            ARRAY(SELECT w.name FROM task_workers tw JOIN workers w ON w.id = tw.worker_id WHERE tw.task_id = t.id ORDER BY w.id) AS workers,
            COALESCE((SELECT json_agg(json_build_object('seq', s.seq, 'start', s.start_date, 'days', s.workdays) ORDER BY s.seq)
                        FROM task_segments s WHERE s.task_id = t.id), '[]') AS segments,
            COALESCE((SELECT json_agg(json_build_object('date', d.work_date, 'done', d.is_done, 'note', d.note, 'ov', d.has_worker_override,
                        'workers', ARRAY(SELECT w.name FROM task_day_workers x JOIN workers w ON w.id = x.worker_id WHERE x.task_day_id = d.id ORDER BY w.id)))
                        FROM task_days d WHERE d.task_id = t.id), '[]') AS days
       FROM project_tasks t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN workers lw ON lw.id = t.lead_worker_id
      WHERE t.project_id = $1
      ORDER BY t.position, t.id`,
    [projectId],
  );
  return rows.map((r) => {
    const segs = (r.segments as Array<{ seq: number; start: string; days: number }>).map((s) => ({ ...s, start: iso(s.start) }));
    const main = segs.find((s) => s.seq === 1);
    const t: LegacyTask = {
      id: r.legacy_id ?? Number(r.id), name: r.name, category: r.category, days: r.base_days,
      start: main?.start ?? '', extra: segs.filter((s) => s.seq > 1).map((s) => ({ start: s.start, days: s.days })),
      lead: r.lead ?? '', workers: r.workers, notes: r.notes,
      placed: r.status !== 'unscheduled', order: r.sort_order, done: [],
    };
    if (r.status === 'past_done') t.past = true;
    const byDate = new Map((r.days as Array<{ date: string; done: boolean; note: string; ov: boolean; workers: string[] }>).map((d) => [iso(d.date), d]));
    // Dátum szerinti tárolásból vissza a v25 sorszám szerinti done[] tömbjébe
    const list = taskDays(t);
    t.done = list.map((d) => !!byDate.get(d)?.done);
    for (const d of list) {
      const x = byDate.get(d);
      if (x?.ov) (t.dayWorkers ??= {})[d] = x.workers;
      if (x?.note) (t.dayNotes ??= {})[d] = x.note;
    }
    return t;
  });
}

export interface TemplateData { seed: SchedulerState['seed']; custom: SchedulerState['custom'] }

export async function loadTemplates(q: Q): Promise<TemplateData> {
  const { rows } = await q.query(
    `SELECT t.name, t.default_days, c.name AS category, t.source, t.notes, lw.name AS lead,
            ARRAY(SELECT w.name FROM task_template_workers tw JOIN workers w ON w.id = tw.worker_id
                   WHERE tw.template_id = t.id ORDER BY (w.id = t.default_lead_id) DESC, w.id) AS workers
       FROM task_templates t JOIN categories c ON c.id = t.category_id LEFT JOIN workers lw ON lw.id = t.default_lead_id
      WHERE t.is_active ORDER BY t.sort_order, t.id`,
  );
  const seed: TemplateData['seed'] = [];
  const custom: TemplateData['custom'] = [];
  for (const r of rows) {
    // v25: a sablon felelőse a csapatlista első eleme
    const workers: string[] = r.lead && !r.workers.includes(r.lead) ? [r.lead, ...r.workers] : r.workers;
    if (r.source === 'seed') seed.push([r.name, r.default_days, r.category, workers]);
    else custom.push({ name: r.name, category: r.category, days: r.default_days, lead: r.lead ?? '', workers, notes: r.notes });
  }
  return { seed, custom };
}

export async function buildState(q: Q, perms: { edit: boolean; finance: boolean }): Promise<SchedulerState> {
  const templates = await loadTemplates(q);
  const projects = await q.query(
    `SELECT p.id, p.name, p.code, p.scheduler_initialized, c.name AS customer
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.${SCHEDULER_PROJECT_FILTER} ORDER BY p.sort_order, p.id`,
  );
  const houses: LegacyHouse[] = [];
  for (const p of projects.rows)
    houses.push({ id: Number(p.id), name: p.name, code: p.code, customer: p.customer, tasks: await buildHouseTasks(q, Number(p.id), p.scheduler_initialized, templates) });

  const roster = (await q.query(`SELECT name, role, email, hourly_wage FROM workers WHERE is_active ORDER BY id`)).rows.map((w) => {
    const r: SchedulerState['roster'][number] = { name: w.name, role: w.role, email: w.email };
    if (perms.finance && w.hourly_wage != null) r.wage = Number(w.hourly_wage);
    return r;
  });
  const ignored: SchedulerState['ignored'] = {};
  for (const r of (await q.query('SELECT w.name, a.work_date FROM conflict_acks a JOIN workers w ON w.id = a.worker_id')).rows) ignored[`${r.name}|${iso(r.work_date)}`] = true;
  const hours: SchedulerState['hours'] = {};
  for (const r of (await q.query('SELECT w.name, h.work_date, h.time_from, h.time_to FROM worker_day_hours h JOIN workers w ON w.id = h.worker_id')).rows)
    hours[`${r.name}|${iso(r.work_date)}`] = { from: hm(r.time_from), to: hm(r.time_to) };

  let payItems: SchedulerState['payItems'] = [];
  let subPays: SchedulerState['subPays'] = [];
  if (perms.finance) {
    payItems = (await q.query(`SELECT p.id, p.legacy_id, w.name, p.start_ym, p.end_ym, p.recurring, p.amount, p.note FROM pay_adjustments p JOIN workers w ON w.id = p.worker_id ORDER BY p.id`)).rows.map((r) => {
      const x: Record<string, unknown> = { id: r.legacy_id && /^\d+$/.test(r.legacy_id) ? Number(r.legacy_id) : Number(r.id), w: r.name, ym: r.start_ym, amount: Number(r.amount), note: r.note, recurring: r.recurring };
      if (r.end_ym) x.end = r.end_ym;
      return x;
    });
    subPays = (await q.query(`SELECT s.id, s.legacy_id, w.name, s.pay_date, s.project_name, s.work_desc, s.amount, s.note FROM subcontractor_payments s JOIN workers w ON w.id = s.worker_id ORDER BY s.id`)).rows.map((r) => ({
      id: r.legacy_id && /^\d+$/.test(r.legacy_id) ? Number(r.legacy_id) : Number(r.id), w: r.name, date: iso(r.pay_date), project: r.project_name, work: r.work_desc, amount: Number(r.amount), note: r.note,
    }));
  }
  const cats = Object.fromEntries((await q.query('SELECT name, color FROM categories ORDER BY sort_order, id')).rows.map((r) => [r.name, r.color]));
  const settings = (await q.query(`SELECT value FROM app_settings WHERE key = 'scheduler'`)).rows[0]?.value ?? {};

  return {
    houses, roster, custom: templates.custom, seed: templates.seed, ignored, hours, payItems, subPays, cats,
    mailTime: typeof settings.mailTime === 'string' ? settings.mailTime : '19:00', v14: true,
    versions: await getVersions(q), perms,
  };
}
