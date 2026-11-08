import { ArrowLeft, CalendarRange, Pencil, Plus, Save, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { Customer } from './Customers';

interface Project {
  id: number; code: string; name: string; status: string; hrsz: string; address: string; notes: string;
  startDate: string | null; dueDate: string | null; customerId: number | null; customerName: string | null; version: number;
  schedule: { initialized: boolean; tasks: number; scheduled: number; plannedDays: number; doneDays: number; firstDay: string | null; lastDay: string | null };
}
type Draft = { id?: number; version?: number; name: string; customerId: number | null; status: string; hrsz: string; address: string; notes: string; startDate: string; dueDate: string };
export const PROJECT_STATUS: Record<string, string> = { lead: 'Előkészítés', active: 'Folyamatban', finished: 'Befejezett', archived: 'Archivált' };
const fmt = (d: string | null) => (d ? d.slice(0, 10).replace(/-/g, '.') + '.' : '–');

export function ProjectsPage() {
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('projects.edit');
  const canScheduler = !!user?.permissions.includes('scheduler.view');
  const canCustomers = !!user?.permissions.includes('customers.view');
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const load = () => api<{ projects: Project[] }>(`/api/projects?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`)
    .then((r) => setList(r.projects)).catch((e) => setError(e instanceof ApiError ? e.message : 'Hiba.'));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, status]);
  useEffect(() => { if (canCustomers) api<{ customers: Customer[] }>('/api/customers').then((r) => setCustomers(r.customers)).catch(() => {}); }, [canCustomers]);
  // Mélylinkek: ?id=… (szerkesztés), ?uj=1&ugyfel=… (új projekt az ügyfélhez)
  useEffect(() => {
    if (params.get('uj') && canEdit) {
      const cid = Number(params.get('ugyfel')) || null;
      setFormError('');
      setEdit({ name: '', customerId: cid, status: 'active', hrsz: '', address: '', notes: '', startDate: '', dueDate: '' });
    } else if (params.get('id')) {
      api<{ project: Project }>(`/api/projects/${params.get('id')}`).then(({ project: p }) => { setFormError(''); setEdit(toDraft(p)); }).catch(() => {});
    }
  }, [params, canEdit]);

  const toDraft = (p: Project): Draft => ({ id: p.id, version: p.version, name: p.name, customerId: p.customerId, status: p.status, hrsz: p.hrsz, address: p.address, notes: p.notes, startDate: p.startDate ?? '', dueDate: p.dueDate ?? '' });
  const close = () => { setEdit(null); if (params.toString()) setParams({}); };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setFormError('');
    try {
      const body = { ...edit, startDate: edit.startDate || null, dueDate: edit.dueDate || null };
      if (edit.id) await api(`/api/projects/${edit.id}`, { method: 'PUT', body });
      else await api('/api/projects', { method: 'POST', body });
      close();
      await load();
    } catch (err) { setFormError(err instanceof ApiError ? err.message : 'Hiba.'); }
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => edit && setEdit({ ...edit, [k]: v });
  const current = edit?.id ? list.find((p) => p.id === edit.id) : undefined;

  return (
    <div>
      <div className="dashboard__head">
        <div><h1>Projektek</h1><p className="muted">Minden projekt egyedi kóddal; ugyanezek jelennek meg az építési ütemezőben.</p></div>
        <div className="dashboard__actions">
          <Link to="/" className="btn btn--ghost"><ArrowLeft size={18} /> Főoldal</Link>
          {canScheduler && <a className="btn" href="/utemezo"><CalendarRange size={18} /> Ütemező</a>}
          {canEdit && <button className="btn btn--primary" onClick={() => setParams({ uj: '1' })}><Plus size={18} /> Új projekt</button>}
        </div>
      </div>
      {error && <p className="alert alert--error">{error}</p>}
      <div className="panel">
        <div className="row">
          <label className="search" style={{ flex: 1 }}><Search size={18} /><input placeholder="Keresés név, kód, HRSZ, ügyfél szerint…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Állapot szűrő">
            <option value="">Minden állapot</option>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Kód</th><th>Projekt</th><th>Ügyfél</th><th>Állapot</th><th>Ütemezés</th><th></th></tr></thead>
          <tbody>{list.map((p) => {
            const pct = p.schedule.plannedDays ? Math.round((p.schedule.doneDays / p.schedule.plannedDays) * 100) : 0;
            return (
              <tr key={p.id}>
                <td data-label="Kód"><code>{p.code}</code></td>
                <td data-label="Projekt"><b>{p.name}</b>{p.hrsz && <small className="muted"> · HRSZ {p.hrsz}</small>}</td>
                <td data-label="Ügyfél">{p.customerName ? (canCustomers ? <Link to={`/ugyfelek?id=${p.customerId}`}>{p.customerName}</Link> : p.customerName) : <span className="muted">–</span>}</td>
                <td data-label="Állapot"><span className={`badge ${p.status === 'active' ? 'badge--ok' : p.status === 'lead' ? 'badge--dev' : ''}`}>{PROJECT_STATUS[p.status]}</span></td>
                <td data-label="Ütemezés" className="small">
                  {p.schedule.plannedDays ? <>{fmt(p.schedule.firstDay)} – {fmt(p.schedule.lastDay)}<div className="mini"><div style={{ width: pct + '%' }} /></div>{p.schedule.doneDays}/{p.schedule.plannedDays} nap kész</> : <span className="muted">még nincs ütemezve</span>}
                </td>
                <td className="nowrap">
                  {canScheduler && p.status !== 'archived' && <a className="iconbtn" title="Megnyitás az ütemezőben" aria-label="Megnyitás az ütemezőben" href={`/utemezo?projekt=${p.id}`}><CalendarRange size={18} /></a>}
                  <button className="iconbtn" title={canEdit ? 'Szerkesztés' : 'Adatok'} aria-label="Szerkesztés" onClick={() => setParams({ id: String(p.id) })}><Pencil size={18} /></button>
                </td>
              </tr>);
          })}
            {!list.length && <tr><td colSpan={6} className="muted">Nincs találat.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {edit && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && close()}>
          <form className="modal__card" onSubmit={save}>
            <div className="modal__head">
              <h3>{edit.id ? <><code>{current?.code}</code> {canEdit ? 'Projekt szerkesztése' : 'Projekt adatai'}</> : 'Új projekt'}</h3>
              <button type="button" className="iconbtn" aria-label="Bezárás" onClick={close}><X size={20} /></button>
            </div>
            <fieldset disabled={!canEdit} className="plain">
              <label className="field"><span>Projekt megnevezése</span><input required maxLength={200} value={edit.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
              <div className="grid2">
                <label className="field"><span>Ügyfél</span>
                  <select value={edit.customerId ?? ''} onChange={(e) => set('customerId', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— nincs megadva —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                  </select></label>
                <label className="field"><span>Állapot</span>
                  <select value={edit.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="field"><span>Helyrajzi szám</span><input value={edit.hrsz} onChange={(e) => set('hrsz', e.target.value)} /></label>
                <label className="field"><span>Cím</span><input value={edit.address} onChange={(e) => set('address', e.target.value)} /></label>
                <label className="field"><span>Kezdés</span><input type="date" value={edit.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
                <label className="field"><span>Határidő</span><input type="date" value={edit.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></label>
              </div>
              <label className="field"><span>Megjegyzés</span><textarea rows={3} value={edit.notes} onChange={(e) => set('notes', e.target.value)} /></label>
            </fieldset>
            {edit.status === 'archived' && <p className="muted small">Az archivált projekt nem jelenik meg az ütemezőben; minden adata megmarad. Visszaállításhoz válassz más állapotot.</p>}
            {formError && <p className="alert alert--error">{formError}</p>}
            <div className="modal__foot">
              {edit.id && canScheduler && edit.status !== 'archived' && <a className="btn" href={`/utemezo?projekt=${edit.id}`}><CalendarRange size={18} /> Ütemező</a>}
              <button type="button" className="btn btn--ghost" onClick={close}>Bezárás</button>
              {canEdit && <button className="btn btn--primary"><Save size={18} /> Mentés</button>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
