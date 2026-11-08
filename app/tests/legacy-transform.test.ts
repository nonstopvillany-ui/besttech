import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { taskDays, workdays } from '../server/legacy/calc.js';
import { extractHrsz, transformLegacy } from '../server/legacy/transform.js';

// Kitalált tesztadat – valódi ügyfél- vagy béradatot NEM tartalmaz.
const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(path.join(here, 'fixtures/legacy-v25-sample.json'), 'utf8'));

describe('v25 dátumszámítás', () => {
  it('csak a vasárnap szabadnap', () => {
    expect(workdays('2026-03-07', 2)).toEqual(['2026-03-07', '2026-03-09']); // szombat munkanap, vasárnap kimarad
    expect(workdays('', 3)).toEqual([]);
  });

  // A régi forras/app.js függvényeivel összevetve, sok véletlen bemenetre
  it('egyezik a régi v25 kód eredményével', () => {
    const src = readFileSync(path.join(here, '../../forras/app.js'), 'utf8');
    const pick = (re: RegExp) => { const m = src.match(re); if (!m) throw new Error('nem található: ' + re); return m[0]; };
    const legacy = new Function(
      [
        pick(/const iso=d=>[^\n]*/), pick(/const D=s=>[^\n]*/), pick(/function workdays\([^\n]*/),
        pick(/const tDays=t=>[^\n]*/), 'return {workdays, tDays};',
      ].join('\n'),
    )() as { workdays: (s: string, n: number) => string[]; tDays: (t: unknown) => string[] };
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const date = () => `2026-${String(1 + rnd(12)).padStart(2, '0')}-${String(1 + rnd(28)).padStart(2, '0')}`;
    for (let i = 0; i < 300; i++) {
      const t = { start: date(), days: 1 + rnd(20), extra: Array.from({ length: rnd(3) }, () => ({ start: date(), days: 1 + rnd(6) })) };
      expect(workdays(t.start, t.days)).toEqual(legacy.workdays(t.start, t.days));
      expect(taskDays(t)).toEqual(legacy.tDays(t));
    }
  });
});

describe('átalakítás (mintafájl)', () => {
  const { data, report } = transformLegacy(sample);
  const codes = report.warnings.map((w) => w.code);
  const p1 = data.projects[0];
  const t = (id: number) => p1.tasks.find((x) => x.legacyId === id)!;

  it('darabszámok és ellenőrző összegek', () => {
    expect(report.counts).toMatchObject({ projects: 2, tasks: 6, scheduledTasks: 3, pastDoneTasks: 1, taskDays: 6, workers: 4, workersNotInRoster: 1, payAdjustments: 2, subPayments: 2, hourOverrides: 1, conflictAcks: 1 });
    expect(report.checksums).toEqual({ plannedWorkdays: 6, doneWorkdays: 4, pastDoneTasks: 1, payAdjustmentSum: 40000, subPaymentSum: 251000 });
  });
  it('az elvégzett napok sorszámból DÁTUMRA fordulnak', () => {
    expect(t(2).days.map((d) => [d.date, d.done])).toEqual([['2026-03-10', true], ['2026-03-11', false], ['2026-03-20', true]]);
    expect(t(2).segments).toEqual([{ seq: 1, start: '2026-03-10', workdays: 2 }, { seq: 2, start: '2026-03-20', workdays: 1 }]);
  });
  it('állapotok', () => {
    expect(t(1).status).toBe('done');
    expect(t(2).status).toBe('scheduled');
    expect(t(3).status).toBe('past_done');
    expect(t(4).status).toBe('unscheduled');
    expect(t(5).status).toBe('unscheduled');
  });
  it('napi eltérések és megjegyzések', () => {
    const d11 = t(2).days.find((d) => d.date === '2026-03-11')!;
    expect(d11.overrideWorkers).toEqual(['teszt elek', 'ismeretlen ivó']);
    expect(t(2).days.find((d) => d.date === '2026-03-20')!.note).toBe('Zsalut hozni');
  });
  it('figyelmeztetések a régi adathibákra', () => {
    for (const c of ['DONE_OUT_OF_RANGE', 'UNKNOWN_WORKER', 'ORPHAN_DAY_NOTE', 'PLACED_WITHOUT_DATE', 'INVALID_HOURS', 'SUB_PAY_UNKNOWN_PROJECT', 'DUPLICATE_HRSZ'])
      expect(codes).toContain(c);
  });
  it('sablonok: 23 beépített + egyéni; kategóriák', () => {
    expect(data.templates.filter((x) => x.source === 'seed')).toHaveLength(23);
    expect(data.templates.find((x) => x.name === 'Saját munka')?.source).toBe('custom');
    expect(data.categories.find((c) => c.name === 'Egyéni kat')?.color).toBe('#123456');
    expect(t(1).templateName).toBe('Humusz leszedés');
  });
  it('a bemenetet nem módosítja', () => {
    const copy = structuredClone(sample);
    transformLegacy(copy);
    expect(copy).toEqual(sample);
  });
  it('régebbi mentés (hiányzó payItems, subPays, hours stb.) is beolvasható', () => {
    const old = { houses: sample.houses, roster: sample.roster };
    expect(() => transformLegacy(old)).not.toThrow();
  });
  it('nem v25 fájl elutasítva', () => {
    expect(() => transformLegacy({ foo: 1 })).toThrow();
    expect(() => transformLegacy({ houses: [], roster: [] })).toThrow();
  });
  it('helyrajzi szám kinyerése', () => {
    expect(extractHrsz('Minta HRSZ_1234_5')).toBe('1234_5');
    expect(extractHrsz('Valaki Hrsz 98')).toBe('98');
    expect(extractHrsz('Csak név')).toBeNull();
  });
});
