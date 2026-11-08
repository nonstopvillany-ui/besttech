import { AlertTriangle, FileUp, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';

interface Warning { code: string; message: string }
interface Preview {
  report: { counts: Record<string, number>; checksums: Record<string, number>; warnings: Warning[] };
  projects: Array<{ name: string; hrsz: string | null; tasks: number; scheduled: number }>;
  workers: Array<{ name: string; role: string; inRoster: boolean }>;
}
interface Status { commitEnabled: boolean; imports: Array<{ id: number; fileName: string; createdAt: string }> }

const LABELS: Record<string, string> = {
  projects: 'Projektek', tasks: 'Munkafázisok', scheduledTasks: 'Ütemezett munkák', pastDoneTasks: 'Korábban kész munkák',
  segments: 'Szakaszok', taskDays: 'Munkanapok', dayWorkerOverrides: 'Napi csapateltérések', dayNotes: 'Napi megjegyzések',
  workers: 'Dolgozók', workersNotInRoster: 'Névsorban nem szereplő dolgozók', categories: 'Kategóriák', templates: 'Sablonok',
  customTemplates: 'Egyéni sablonok', hourOverrides: 'Munkaidő-eltérések', conflictAcks: 'Tudomásul vett ütközések',
  payAdjustments: 'Bértételek', subPayments: 'Alvállalkozói kifizetések',
  plannedWorkdays: 'Tervezett munkanapok', doneWorkdays: 'Elvégzett munkanapok', payAdjustmentSum: 'Bértételek összege (Ft)', subPaymentSum: 'Kifizetések összege (Ft)',
};
const ROLE: Record<string, string> = { lead: 'Munkafelelős', helper: 'Segéd', sub: 'Alvállalkozó' };

export function LegacyImport() {
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [backup, setBackup] = useState(false);
  const [done, setDone] = useState('');

  const loadStatus = () => api<Status>('/api/admin/legacy-import/status').then(setStatus).catch(() => {});
  useEffect(() => { loadStatus(); }, []);

  const pick = async (f: File | undefined) => {
    setPreview(null); setError(''); setDone('');
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return setError('A fájl túl nagy (max. 15 MB).');
    const content = await f.text();
    setFile({ name: f.name, content });
    setBusy(true);
    try {
      setPreview(await api<Preview>('/api/admin/legacy-import/preview', { method: 'POST', body: { fileName: f.name, content } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Hiba történt.');
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const r = await api<{ importId: number }>('/api/admin/legacy-import/commit', { method: 'POST', body: { fileName: file.name, content: file.content, confirm, backupConfirmed: backup } });
      setDone(`Az import sikeres (azonosító: ${r.importId}).`);
      setConfirm('');
      loadStatus();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Hiba történt.');
    } finally { setBusy(false); }
  };

  return (
    <section>
      <h2>Régi ütemező (v25) adatainak importja</h2>
      <p className="muted">
        Válaszd ki a régi ütemező „💾 Mentés fájlba” gombjával készült JSON-fájlt. Az <b>előnézet nem ír az adatbázisba</b>:
        csak ellenőrzi a fájlt, és megmutatja, mi kerülne át, illetve milyen adathibák vannak benne.
      </p>
      <label className="btn"><FileUp size={18} /> Mentésfájl kiválasztása
        <input type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {busy && <p className="muted">Feldolgozás…</p>}
      {error && <p className="alert alert--error">{error}</p>}
      {done && <p className="alert alert--ok">{done}</p>}

      {preview && (
        <>
          <h3>Összesítés – {file?.name}</h3>
          <div className="cards">
            {Object.entries({ ...preview.report.counts, ...preview.report.checksums }).map(([k, v]) => (
              <div className="card" key={k}><small className="muted">{LABELS[k] ?? k}</small><br /><b>{v.toLocaleString('hu-HU')}</b></div>
            ))}
          </div>

          <h3><AlertTriangle size={18} /> Figyelmeztetések ({preview.report.warnings.length})</h3>
          {preview.report.warnings.length
            ? <ul className="warnlist">{preview.report.warnings.map((w, i) => <li key={i}><code>{w.code}</code> {w.message}</li>)}</ul>
            : <p className="muted">Nincs.</p>}

          <h3>Projektek</h3>
          <div className="tablewrap"><table className="table">
            <thead><tr><th>Név</th><th>HRSZ</th><th>Munkák</th><th>Ütemezett</th></tr></thead>
            <tbody>{preview.projects.map((p, i) => <tr key={i}><td data-label="Név">{p.name}</td><td data-label="HRSZ">{p.hrsz ?? '–'}</td><td data-label="Munkák">{p.tasks}</td><td data-label="Ütemezett">{p.scheduled}</td></tr>)}</tbody>
          </table></div>

          <h3>Dolgozók</h3>
          <div className="chips">{preview.workers.map((w, i) => <span className="chip" key={i}>{w.name} <small className="muted">{ROLE[w.role]}{w.inRoster ? '' : ' · névsorban nincs'}</small></span>)}</div>

          <h3>Tényleges import</h3>
          {status?.imports.length ? (
            <p className="alert alert--info">Már történt import: {status.imports.map((x) => `${x.fileName} (${new Date(x.createdAt).toLocaleString('hu-HU')})`).join(', ')}.</p>
          ) : status?.commitEnabled ? (
            <div className="narrow">
              <p className="alert alert--error">Az import az adatbázisba írja a fenti adatokat. Csak egyszer futtatható. Előtte készíts adatbázis-mentést!</p>
              <p><a className="btn" href="/api/admin/backup">⬇ Adatbázis-mentés letöltése</a></p>
              <label className="chip"><input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> Elkészült az adatbázis-mentés (letöltés és/vagy Railway-mentés)</label>
              <label className="field"><span>Megerősítéshez írd be: IMPORTÁLÁS</span><input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
              <button className="btn btn--primary" disabled={busy || confirm !== 'IMPORTÁLÁS' || !backup} onClick={commit}>Importálás indítása</button>
            </div>
          ) : (
            <p className="alert alert--info"><Lock size={16} /> A tényleges import jelenleg <b>ki van kapcsolva</b> (LEGACY_IMPORT_ENABLED). A tulajdonos jóváhagyása után kapcsolható be.</p>
          )}
        </>
      )}
    </section>
  );
}
