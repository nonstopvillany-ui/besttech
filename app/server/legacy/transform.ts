// A v25 ütemező "Mentés fájlba" JSON-jának ellenőrzése és átalakítása az új adatmodellre.
// TISZTA függvény: nem ír adatbázisba, nem módosítja a bemenetet. Az eredményt az
// előnézet megjeleníti, és jóváhagyás után az importer.ts írja az adatbázisba.
import { z } from 'zod';
import { isIsoDate, segDays, taskDays, totalDays } from './calc.js';
import { LEGACY_CATEGORIES, LEGACY_SEED_TEMPLATES } from './seed.js';

// ------------------------------------------------------------ bemeneti séma
// Engedékeny: a v25 különböző verzióinak mentései is legyenek beolvashatók.
const seg = z.object({ start: z.string().nullish(), days: z.unknown().optional() }).passthrough();
const task = z.object({
  id: z.number(),
  name: z.string(),
  category: z.string().optional().default('Egyéb'),
  days: z.unknown().optional(),
  start: z.string().nullish(),
  extra: z.array(seg).optional().default([]),
  lead: z.string().nullish(),
  workers: z.array(z.string()).optional().default([]),
  notes: z.string().nullish(),
  placed: z.boolean().optional().default(false),
  past: z.boolean().optional(),
  order: z.number().optional().default(0),
  done: z.array(z.unknown()).optional().default([]),
  dayWorkers: z.record(z.string(), z.array(z.string())).optional(),
  dayNotes: z.record(z.string(), z.string()).optional(),
}).passthrough();

export const legacyStateSchema = z.object({
  houses: z.array(z.object({ name: z.string(), tasks: z.array(task) }).passthrough()).min(1, 'Nincs projekt a fájlban.'),
  roster: z.array(z.object({ name: z.string(), role: z.string().optional(), email: z.string().nullish(), wage: z.unknown().optional() }).passthrough()),
  custom: z.array(z.object({ name: z.string(), category: z.string().optional(), days: z.unknown().optional() }).passthrough()).optional().default([]),
  ignored: z.record(z.string(), z.unknown()).optional().default({}),
  hours: z.record(z.string(), z.object({ from: z.string(), to: z.string() }).passthrough()).optional().default({}),
  payItems: z.array(z.object({
    id: z.unknown().optional(), w: z.string(), ym: z.string(), amount: z.number(),
    note: z.string().nullish(), recurring: z.boolean().optional(), end: z.string().nullish(),
  }).passthrough()).optional().default([]),
  subPays: z.array(z.object({
    id: z.unknown().optional(), w: z.string(), date: z.string(), project: z.string().nullish(),
    work: z.string().nullish(), amount: z.number(), note: z.string().nullish(),
  }).passthrough()).optional().default([]),
  cats: z.record(z.string(), z.string()).optional().default({}),
  mailTime: z.string().optional(),
}).passthrough();

export type LegacyState = z.infer<typeof legacyStateSchema>;

// ------------------------------------------------------------ kimenet
export interface NWorker { key: string; name: string; role: 'lead' | 'helper' | 'sub'; email: string; hourlyWage: number | null; inRoster: boolean }
export interface NDay { date: string; done: boolean; note: string; overrideWorkers: string[] | null }
export interface NTask {
  legacyId: number; name: string; category: string; leadKey: string | null; workerKeys: string[]; notes: string;
  status: 'unscheduled' | 'scheduled' | 'done' | 'past_done'; plannedDays: number; baseDays: number; position: number; sortOrder: number;
  templateName: string | null; segments: Array<{ seq: number; start: string; workdays: number }>; days: NDay[];
}
export interface NProject { legacyIndex: number; name: string; hrsz: string | null; tasks: NTask[] }
export interface NormalizedImport {
  categories: Array<{ name: string; color: string; sortOrder: number }>;
  workers: NWorker[];
  templates: Array<{ name: string; category: string; days: number; source: 'seed' | 'custom'; sortOrder: number; notes?: string; leadKey?: string | null; workerKeys?: string[] }>;
  projects: NProject[];
  hours: Array<{ workerKey: string; date: string; from: string; to: string }>;
  conflictAcks: Array<{ workerKey: string; date: string }>;
  payAdjustments: Array<{ workerKey: string; startYm: string; endYm: string | null; recurring: boolean; amount: number; note: string; legacyId: string | null }>;
  subPayments: Array<{ workerKey: string; projectLegacyIndex: number | null; projectName: string; date: string; work: string; amount: number; note: string; legacyId: string | null }>;
  settings: { mailTime: string | null };
}
export interface ImportWarning { code: string; message: string; context?: Record<string, unknown> }
export interface ImportReport {
  counts: Record<string, number>;
  checksums: { plannedWorkdays: number; doneWorkdays: number; pastDoneTasks: number; payAdjustmentSum: number; subPaymentSum: number };
  warnings: ImportWarning[];
}

const ROLE: Record<string, NWorker['role']> = { lead: 'lead', helper: 'helper', sub: 'sub' };
const YM = /^\d{4}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;
export const workerKey = (name: string) => name.trim().toLocaleLowerCase('hu-HU');

/** Helyrajzi szám kinyerése a projektnévből (csak tájékoztató mező, nem azonosító). */
export function extractHrsz(name: string): string | null {
  const m = name.match(/hrsz[\s_.:-]*([0-9][0-9_\-/]*[0-9])/i) ?? name.match(/hrsz[\s_.:-]*([0-9])/i);
  return m ? m[1] : null;
}

/** "Név|ÉÉÉÉ-HH-NN" kulcs szétbontása (v25 hours/ignored). */
function splitKey(k: string): { name: string; date: string } | null {
  const i = k.lastIndexOf('|');
  if (i < 1) return null;
  const date = k.slice(i + 1);
  return isIsoDate(date) ? { name: k.slice(0, i), date } : null;
}

export function transformLegacy(input: unknown): { data: NormalizedImport; report: ImportReport } {
  const S = legacyStateSchema.parse(input);
  const warnings: ImportWarning[] = [];
  const warn = (code: string, message: string, context?: Record<string, unknown>) => warnings.push({ code, message, context });

  // ---- dolgozók: a névsor + a munkákban hivatkozott, de névsorban nem szereplő nevek
  const workers = new Map<string, NWorker>();
  for (const r of S.roster) {
    const key = workerKey(r.name);
    if (!key) continue;
    if (workers.has(key)) { warn('DUPLICATE_WORKER', `Kétszer szerepel a névsorban: ${r.name}`); continue; }
    const wage = Number(r.wage);
    workers.set(key, {
      key, name: r.name.trim(), role: ROLE[r.role ?? ''] ?? 'helper', email: (r.email ?? '').trim(),
      hourlyWage: Number.isFinite(wage) && wage > 0 ? wage : null, inRoster: true,
    });
  }
  const ref = (name: string | null | undefined, where: string): string | null => {
    if (!name || !name.trim()) return null;
    const key = workerKey(name);
    if (!workers.has(key)) {
      workers.set(key, { key, name: name.trim(), role: 'helper', email: '', hourlyWage: null, inRoster: false });
      warn('UNKNOWN_WORKER', `Nem szereplő dolgozó hivatkozva (${where}): ${name}. Inaktív dolgozóként kerül be.`, { name, where });
    }
    return key;
  };

  // ---- kategóriák: v25 alapok + egyéniek + a munkákban előforduló ismeretlenek
  const categories = new Map<string, string>(LEGACY_CATEGORIES);
  for (const [n, c] of Object.entries(S.cats)) categories.set(n, /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#637c90');
  const cat = (n: string) => {
    if (!categories.has(n)) { categories.set(n, '#637c90'); warn('UNKNOWN_CATEGORY', `Ismeretlen kategória: ${n}`, { name: n }); }
    return n;
  };

  // ---- sablonok
  const templates: NormalizedImport['templates'] = LEGACY_SEED_TEMPLATES.map(([name, days, category], i) => ({ name, days, category, source: 'seed', sortOrder: (i + 1) * 10 }));
  const tplNames = new Set(templates.map((t) => t.name));
  S.custom.forEach((c, i) => {
    if (tplNames.has(c.name)) return;
    tplNames.add(c.name);
    const cc = c as { lead?: string | null; workers?: string[]; notes?: string | null };
    templates.push({
      name: c.name, days: segDays(c.days), category: cat(c.category ?? 'Egyéb'), source: 'custom', sortOrder: 1000 + i * 10,
      notes: (cc.notes ?? '').trim(), leadKey: ref(cc.lead, `sablon: ${c.name}`),
      workerKeys: [...new Set((cc.workers ?? []).map((w) => ref(w, `sablon: ${c.name}`)).filter((x): x is string => !!x))],
    });
  });

  // ---- projektek és munkák
  let planned = 0, doneDays = 0, pastDone = 0, taskCount = 0, scheduled = 0, segCount = 0, overrideDays = 0, noteDays = 0;
  const projects: NProject[] = S.houses.map((h, hi) => {
    const seenIds = new Set<number>();
    const tasks: NTask[] = [];
    h.tasks.forEach((t, ti) => {
      const where = `${h.name} / ${t.name}`;
      if (seenIds.has(t.id)) { warn('DUPLICATE_TASK_ID', `Ismétlődő munkaazonosító (${t.id}) – a második kimarad: ${where}`); return; }
      seenIds.add(t.id);
      taskCount++;
      const leadKey = ref(t.lead, where);
      const workerKeys = [...new Set(t.workers.map((w) => ref(w, where)).filter((x): x is string => !!x))];
      const segments: NTask['segments'] = [];
      let status: NTask['status'] = 'unscheduled';
      let days: NDay[] = [];

      if (t.past) {
        status = 'past_done';
        pastDone++;
      } else if (t.placed && isIsoDate(t.start)) {
        segments.push({ seq: 1, start: t.start, workdays: segDays(t.days) });
        t.extra.forEach((x, i) => {
          if (isIsoDate(x.start)) segments.push({ seq: i + 2, start: x.start, workdays: segDays(x.days) });
          else warn('INVALID_SEGMENT', `Érvénytelen dátumú szakasz kimarad: ${where}`, { start: x.start });
        });
        segCount += segments.length;
        const list = taskDays({ start: t.start, days: t.days, extra: t.extra.filter((x) => isIsoDate(x.start)) });
        // done[i] a v25-ben a napok SORSZÁMÁHOZ tartozik – itt dátumra fordítjuk
        t.done.forEach((v, i) => { if (v && i >= list.length) warn('DONE_OUT_OF_RANGE', `Elvégzettnek jelölt nap a munka napjain kívül (${i + 1}. nap) – kimarad: ${where}`); });
        const dayKeys = new Set(list);
        for (const [d, ws] of Object.entries(t.dayWorkers ?? {}))
          if (!dayKeys.has(d)) warn('ORPHAN_DAY_WORKERS', `Napi beosztás a munka napjain kívüli dátumra (${d}) – kimarad: ${where}`, { date: d, workers: ws.length });
        for (const d of Object.keys(t.dayNotes ?? {}))
          if (!dayKeys.has(d)) warn('ORPHAN_DAY_NOTE', `Napi megjegyzés a munka napjain kívüli dátumra (${d}) – kimarad: ${where}`, { date: d });
        days = list.map((date, i) => {
          const ov = t.dayWorkers?.[date];
          const overrideWorkers = ov ? [...new Set(ov.map((w) => ref(w, `${where} (${date})`)).filter((x): x is string => !!x))] : null;
          if (overrideWorkers) overrideDays++;
          const note = (t.dayNotes?.[date] ?? '').trim();
          if (note) noteDays++;
          return { date, done: !!t.done[i], note, overrideWorkers };
        });
        planned += list.length;
        const nDone = days.filter((d) => d.done).length;
        doneDays += nDone;
        status = nDone === days.length ? 'done' : 'scheduled';
        scheduled++;
      } else if (t.placed) {
        warn('PLACED_WITHOUT_DATE', `Toronyba tett, de dátum nélküli munka – ütemezetlenként kerül be: ${where}`);
      }

      tasks.push({
        legacyId: t.id, name: t.name, category: cat(t.category), leadKey, workerKeys, notes: (t.notes ?? '').trim(),
        status, plannedDays: status === 'past_done' || status === 'unscheduled' ? segDays(t.days) : totalDays(t),
        baseDays: segDays(t.days), position: ti, sortOrder: t.order ?? 0,
        templateName: tplNames.has(t.name) ? t.name : null, segments, days,
      });
    });
    return { legacyIndex: hi, name: h.name.trim(), hrsz: extractHrsz(h.name), tasks };
  });
  // A beépített sablonok alapértelmezett csapata: a projektekben leggyakoribb felelős + csapat
  // (a v25 kódjában lévő alapértelmezés nincs benne a mentésfájlban, így az adatokból állítjuk vissza)
  for (const tpl of templates) {
    if (tpl.source !== 'seed') continue;
    const freq = new Map<string, { n: number; lead: string | null; workers: string[] }>();
    for (const p of projects) for (const t of p.tasks) if (t.name === tpl.name) {
      const k = JSON.stringify([t.leadKey, t.workerKeys]);
      const e = freq.get(k) ?? { n: 0, lead: t.leadKey, workers: t.workerKeys };
      e.n++; freq.set(k, e);
    }
    const best = [...freq.values()].sort((a, b) => b.n - a.n)[0];
    if (best) { tpl.leadKey = best.lead; tpl.workerKeys = best.workers; }
  }

  const names = new Map<string, number>();
  projects.forEach((p) => names.set(p.name, (names.get(p.name) ?? 0) + 1));
  for (const [n, c] of names) if (c > 1) warn('DUPLICATE_PROJECT_NAME', `Azonos nevű projektek (${c} db): ${n}`);
  const hrszs = new Map<string, string[]>();
  projects.forEach((p) => p.hrsz && hrszs.set(p.hrsz.replace(/[_-]/g, '/'), [...(hrszs.get(p.hrsz.replace(/[_-]/g, '/')) ?? []), p.name]));
  for (const [h, ps] of hrszs) if (ps.length > 1) warn('DUPLICATE_HRSZ', `Azonos helyrajzi szám több projektnél (${h}): ${ps.join('; ')} – ellenőrizendő.`);

  // ---- munkaidő-eltérések és tudomásul vett ütközések
  const hours: NormalizedImport['hours'] = [];
  for (const [k, v] of Object.entries(S.hours)) {
    const p = splitKey(k);
    if (!p || !HM.test(v.from) || !HM.test(v.to)) { warn('INVALID_HOURS', `Érvénytelen munkaidő-bejegyzés kimarad: ${k}`); continue; }
    hours.push({ workerKey: ref(p.name, 'munkaidő')!, date: p.date, from: v.from, to: v.to });
  }
  const conflictAcks: NormalizedImport['conflictAcks'] = [];
  for (const [k, v] of Object.entries(S.ignored)) {
    if (!v) continue;
    const p = splitKey(k);
    if (!p) { warn('INVALID_ACK', `Érvénytelen ütközés-tudomásulvétel kimarad: ${k}`); continue; }
    conflictAcks.push({ workerKey: ref(p.name, 'ütközés')!, date: p.date });
  }

  // ---- bértételek és alvállalkozói kifizetések
  const payAdjustments: NormalizedImport['payAdjustments'] = [];
  for (const x of S.payItems) {
    if (!YM.test(x.ym) || (x.end && !YM.test(x.end))) { warn('INVALID_PAY_ITEM', `Érvénytelen hónapú bértétel kimarad (${x.w}, ${x.ym})`); continue; }
    payAdjustments.push({ workerKey: ref(x.w, 'bértétel')!, startYm: x.ym, endYm: x.end || null, recurring: !!x.recurring, amount: x.amount, note: (x.note ?? '').trim(), legacyId: x.id != null ? String(x.id) : null });
  }
  const byName = new Map(projects.map((p) => [p.name, p.legacyIndex]));
  const subPayments: NormalizedImport['subPayments'] = [];
  for (const x of S.subPays) {
    if (!isIsoDate(x.date)) { warn('INVALID_SUB_PAY', `Érvénytelen dátumú kifizetés kimarad (${x.w}, ${x.date})`); continue; }
    const pn = (x.project ?? '').trim();
    const idx = pn ? byName.get(pn) ?? null : null;
    if (pn && idx == null) warn('SUB_PAY_UNKNOWN_PROJECT', `Kifizetés nem létező projekthez: „${pn}” – a név szövegként megmarad.`);
    subPayments.push({ workerKey: ref(x.w, 'alvállalkozói kifizetés')!, projectLegacyIndex: idx, projectName: pn, date: x.date, work: (x.work ?? '').trim(), amount: x.amount, note: (x.note ?? '').trim(), legacyId: x.id != null ? String(x.id) : null });
  }

  const data: NormalizedImport = {
    categories: [...categories].map(([name, color], i) => ({ name, color, sortOrder: (i + 1) * 10 })),
    workers: [...workers.values()],
    templates,
    projects,
    hours,
    conflictAcks,
    payAdjustments,
    subPayments,
    settings: { mailTime: S.mailTime && HM.test(S.mailTime) ? S.mailTime : null },
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  const report: ImportReport = {
    counts: {
      projects: projects.length, tasks: taskCount, scheduledTasks: scheduled, pastDoneTasks: pastDone,
      segments: segCount, taskDays: planned, dayWorkerOverrides: overrideDays, dayNotes: noteDays,
      workers: data.workers.length, workersNotInRoster: data.workers.filter((w) => !w.inRoster).length,
      categories: data.categories.length, templates: templates.length, customTemplates: templates.filter((t) => t.source === 'custom').length,
      hourOverrides: hours.length, conflictAcks: conflictAcks.length, payAdjustments: payAdjustments.length, subPayments: subPayments.length,
    },
    checksums: {
      plannedWorkdays: planned, doneWorkdays: doneDays, pastDoneTasks: pastDone,
      payAdjustmentSum: round(payAdjustments.reduce((s, x) => s + x.amount, 0)),
      subPaymentSum: round(subPayments.reduce((s, x) => s + x.amount, 0)),
    },
    warnings,
  };
  return { data, report };
}
