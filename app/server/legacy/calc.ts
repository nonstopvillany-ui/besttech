// A v25 ütemező dátumszámításának pontos átirata (forras/app.js: workdays, tDays, tot).
// Fontos: a v25 csak a VASÁRNAPOT tekinti szabadnapnak, a szombat munkanap,
// ünnepnapok nincsenek. Az importnál ezt KELL használni, különben a régi
// "done[i]" sorszámok rossz dátumra kerülnének.

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isSunday = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay() === 0;

/** n munkanap a kezdőnaptól (vasárnapokat kihagyva). Érvénytelen dátumnál üres lista. */
export function workdays(start: string | undefined | null, n: number): string[] {
  const out: string[] = [];
  if (!isIsoDate(start)) return out;
  let d = start;
  while (out.length < n) {
    if (!isSunday(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export const segDays = (days: unknown) => Math.max(1, Number(days) || 1);

export interface LegacySegmentLike { start?: string | null; days?: unknown }
export interface LegacyTaskLike extends LegacySegmentLike { extra?: LegacySegmentLike[] }

/** Összes munkanap (v25 tot): fő szakasz + további szakaszok. */
export const totalDays = (t: LegacyTaskLike) => segDays(t.days) + (t.extra ?? []).reduce((s, x) => s + segDays(x.days), 0);

/** A munka napjai rendezve, ismétlés nélkül (v25 tDays). A done[i] ehhez a listához tartozik. */
export function taskDays(t: LegacyTaskLike): string[] {
  const a = workdays(t.start, segDays(t.days));
  for (const x of t.extra ?? []) for (const d of workdays(x.start, segDays(x.days))) if (!a.includes(d)) a.push(d);
  return a.sort();
}
