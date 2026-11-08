import { ArrowLeft, Building2, Pencil, Plus, Save, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

export interface Customer {
  id: number; code: string; name: string; kind: 'person' | 'company'; status: 'lead' | 'customer' | 'inactive';
  email: string; phone: string; address: string; taxNumber: string; notes: string; version: number; projectCount?: number;
}
export const CUSTOMER_STATUS: Record<string, string> = { lead: 'Érdeklődő', customer: 'Ügyfél', inactive: 'Inaktív' };
const empty = (): Omit<Customer, 'id' | 'code' | 'version'> => ({ name: '', kind: 'person', status: 'customer', email: '', phone: '', address: '', taxNumber: '', notes: '' });

export function CustomersPage() {
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('customers.edit');
  const canProjects = !!user?.permissions.includes('projects.view');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<(Partial<Customer> & ReturnType<typeof empty>) | null>(null);
  const [detail, setDetail] = useState<{ customer: Customer; projects: Array<{ id: number; code: string; name: string; status: string }> } | null>(null);
  const [formError, setFormError] = useState('');

  const load = () => api<{ customers: Customer[] }>('/api/customers' + (q ? '?q=' + encodeURIComponent(q) : '')).then((r) => setList(r.customers)).catch((e) => setError(e instanceof ApiError ? e.message : 'Hiba.'));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const id = params.get('id');
    if (id) api<NonNullable<typeof detail>>(`/api/customers/${id}`).then(setDetail).catch(() => setDetail(null));
    else setDetail(null);
  }, [params]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setFormError('');
    try {
      const r = edit.id
        ? await api<{ customer: Customer }>(`/api/customers/${edit.id}`, { method: 'PUT', body: edit })
        : await api<{ customer: Customer }>('/api/customers', { method: 'POST', body: edit });
      setEdit(null);
      await load();
      setParams({ id: String(r.customer.id) });
    } catch (err) { setFormError(err instanceof ApiError ? err.message : 'Hiba.'); }
  };
  const set = (k: string, v: string) => edit && setEdit({ ...edit, [k]: v });

  return (
    <div>
      <div className="dashboard__head">
        <div><h1>Ügyfelek</h1><p className="muted">Közös ügyfélnyilvántartás – minden modul ezt használja.</p></div>
        <div className="dashboard__actions">
          <Link to="/" className="btn btn--ghost"><ArrowLeft size={18} /> Főoldal</Link>
          {canEdit && <button className="btn btn--primary" onClick={() => { setFormError(''); setEdit(empty()); }}><Plus size={18} /> Új ügyfél</button>}
        </div>
      </div>
      {error && <p className="alert alert--error">{error}</p>}
      <div className={detail ? 'split' : ''}>
        <div className="panel">
          <label className="search"><Search size={18} /><input placeholder="Keresés név, kód, e-mail, telefon szerint…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="tablewrap"><table className="table">
            <thead><tr><th>Kód</th><th>Név</th><th>Állapot</th><th>Elérhetőség</th><th>Projektek</th></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id} className={`clickable ${detail?.customer.id === c.id ? 'is-sel' : ''}`} onClick={() => setParams({ id: String(c.id) })}>
                <td data-label="Kód"><code>{c.code}</code></td>
                <td data-label="Név"><b>{c.name}</b>{c.kind === 'company' && <small className="muted"> · cég</small>}</td>
                <td data-label="Állapot"><span className={`badge ${c.status === 'customer' ? 'badge--ok' : c.status === 'lead' ? 'badge--dev' : ''}`}>{CUSTOMER_STATUS[c.status]}</span></td>
                <td data-label="Elérhetőség" className="small">{[c.phone, c.email].filter(Boolean).join(' · ') || '–'}</td>
                <td data-label="Projektek">{c.projectCount ?? 0}</td>
              </tr>))}
              {!list.length && <tr><td colSpan={5} className="muted">Nincs találat.</td></tr>}
            </tbody>
          </table></div>
        </div>
        {detail && (
          <div className="panel">
            <div className="section-head">
              <div><small className="muted">{detail.customer.code}</small><h2>{detail.customer.name}</h2></div>
              <div className="row">
                {canEdit && <button className="iconbtn" title="Szerkesztés" aria-label="Szerkesztés" onClick={() => { setFormError(''); setEdit({ ...detail.customer }); }}><Pencil size={18} /></button>}
                <button className="iconbtn" aria-label="Bezárás" onClick={() => setParams({})}><X size={18} /></button>
              </div>
            </div>
            <dl className="dl">
              <dt>Típus</dt><dd>{detail.customer.kind === 'company' ? 'Cég' : 'Magánszemély'}</dd>
              <dt>Állapot</dt><dd>{CUSTOMER_STATUS[detail.customer.status]}</dd>
              <dt>Telefon</dt><dd>{detail.customer.phone || '–'}</dd>
              <dt>E-mail</dt><dd>{detail.customer.email || '–'}</dd>
              <dt>Cím</dt><dd>{detail.customer.address || '–'}</dd>
              {detail.customer.taxNumber && <><dt>Adószám</dt><dd>{detail.customer.taxNumber}</dd></>}
              {detail.customer.notes && <><dt>Megjegyzés</dt><dd className="pre">{detail.customer.notes}</dd></>}
            </dl>
            <h3><Building2 size={18} /> Projektek ({detail.projects.length})</h3>
            <ul className="plist">{detail.projects.map((p) => (
              <li key={p.id}>{canProjects ? <Link to={`/projektek?id=${p.id}`}><code>{p.code}</code> {p.name}</Link> : <span><code>{p.code}</code> {p.name}</span>}</li>))}
              {!detail.projects.length && <li className="muted">Még nincs projektje.</li>}
            </ul>
            {user?.permissions.includes('projects.edit') && (
              <button className="btn" onClick={() => navigate(`/projektek?uj=1&ugyfel=${detail.customer.id}`)}><Plus size={18} /> Új projekt ehhez az ügyfélhez</button>
            )}
          </div>
        )}
      </div>

      {edit && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <form className="modal__card" onSubmit={save}>
            <div className="modal__head"><h3>{edit.id ? 'Ügyfél szerkesztése' : 'Új ügyfél'}</h3><button type="button" className="iconbtn" aria-label="Bezárás" onClick={() => setEdit(null)}><X size={20} /></button></div>
            <label className="field"><span>Név</span><input required maxLength={200} value={edit.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
            <div className="grid2">
              <label className="field"><span>Típus</span><select value={edit.kind} onChange={(e) => set('kind', e.target.value)}><option value="person">Magánszemély</option><option value="company">Cég</option></select></label>
              <label className="field"><span>Állapot</span><select value={edit.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(CUSTOMER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="field"><span>Telefon</span><input value={edit.phone} onChange={(e) => set('phone', e.target.value)} /></label>
              <label className="field"><span>E-mail</span><input type="email" value={edit.email} onChange={(e) => set('email', e.target.value)} /></label>
            </div>
            <label className="field"><span>Cím</span><input value={edit.address} onChange={(e) => set('address', e.target.value)} /></label>
            {edit.kind === 'company' && <label className="field"><span>Adószám</span><input value={edit.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></label>}
            <label className="field"><span>Megjegyzés</span><textarea rows={3} value={edit.notes} onChange={(e) => set('notes', e.target.value)} /></label>
            {formError && <p className="alert alert--error">{formError}</p>}
            <div className="modal__foot"><button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Mégse</button><button className="btn btn--primary"><Save size={18} /> Mentés</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
