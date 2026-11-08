import { ArrowDown, ArrowUp, Construction, Eye, EyeOff, GripVertical, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type AdminTile, type Role } from '../../api';
import { TileIcon } from '../../icons';

type Draft = Omit<AdminTile, 'id' | 'moduleKey' | 'sortOrder' | 'isSystem'>;

const emptyDraft = (roles: Role[]): Draft => ({
  title: '', description: '', icon: 'layout-grid', color: '#1761b4', targetType: 'none', target: '',
  status: 'development', isVisible: true, roles: roles.map((r) => r.key),
});

const toDraft = (t: AdminTile): Draft => ({
  title: t.title, description: t.description, icon: t.icon, color: t.color, targetType: t.targetType,
  target: t.target, status: t.status, isVisible: t.isVisible, roles: t.roles,
});

export function TilesAdmin({ roles }: { roles: Role[] }) {
  const [tiles, setTiles] = useState<AdminTile[]>([]);
  const [icons, setIcons] = useState<string[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft; isSystem: boolean } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    const r = await api<{ tiles: AdminTile[]; icons: string[] }>('/api/admin/tiles');
    setTiles(r.tiles);
    setIcons(r.icons);
    setOrderDirty(false);
  };
  useEffect(() => { load().catch(() => setMsg({ type: 'error', text: 'Betöltési hiba.' })); }, []);

  const flash = (type: 'ok' | 'error', text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };
  const fail = (e: unknown) => flash('error', e instanceof ApiError ? e.message : 'Hiba történt.');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= tiles.length || from === to) return;
    const next = [...tiles];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setTiles(next);
    setOrderDirty(true);
  };

  const saveOrder = async () => {
    try {
      await api('/api/admin/tiles-order', { method: 'PUT', body: { ids: tiles.map((t) => t.id) } });
      await load();
      flash('ok', 'A sorrend elmentve.');
    } catch (e) { fail(e); }
  };

  const toggleVisible = async (t: AdminTile) => {
    try {
      await api(`/api/admin/tiles/${t.id}`, { method: 'PUT', body: { ...toDraft(t), isVisible: !t.isVisible } });
      await load();
    } catch (e) { fail(e); }
  };

  const remove = async (t: AdminTile) => {
    if (!confirm(`Biztosan törlöd a(z) „${t.title}” csempét?`)) return;
    try {
      await api(`/api/admin/tiles/${t.id}`, { method: 'DELETE' });
      await load();
      flash('ok', 'Csempe törölve.');
    } catch (e) { fail(e); }
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    try {
      if (editing.id == null) await api('/api/admin/tiles', { method: 'POST', body: editing.draft });
      else await api(`/api/admin/tiles/${editing.id}`, { method: 'PUT', body: editing.draft });
      setEditing(null);
      await load();
      flash('ok', 'Csempe elmentve.');
    } catch (e) { fail(e); }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => editing && setEditing({ ...editing, draft: { ...editing.draft, [k]: v } });
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Főoldali csempék</h2>
          <p className="muted">Húzd a csempéket a fogantyúnál fogva, vagy használd a nyilakat. A sorrend a „Sorrend mentése” gombbal lép életbe.</p>
        </div>
        <div className="row">
          {orderDirty && <button className="btn btn--primary" onClick={saveOrder}><Save size={18} /> Sorrend mentése</button>}
          {orderDirty && <button className="btn btn--ghost" onClick={() => load()}>Elvetés</button>}
          <button className="btn" onClick={() => setEditing({ id: null, draft: emptyDraft(roles), isSystem: false })}><Plus size={18} /> Új csempe</button>
        </div>
      </div>
      {msg && <p className={`alert alert--${msg.type === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>}

      <ul className="tilelist">
        {tiles.map((t, i) => (
          <li
            key={t.id}
            className={`tilelist__item ${!t.isVisible ? 'is-hidden' : ''} ${dragId === t.id ? 'is-drag' : ''}`}
            draggable
            onDragStart={() => setDragId(t.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => { e.preventDefault(); if (dragId != null && dragId !== t.id) move(tiles.findIndex((x) => x.id === dragId), i); }}
            style={{ '--tile-color': t.color } as React.CSSProperties}
          >
            <span className="tilelist__grip" aria-hidden="true"><GripVertical size={18} /></span>
            <span className="tilelist__icon"><TileIcon name={t.icon} size={24} /></span>
            <span className="tilelist__main">
              <b>{t.title}</b>
              <small className="muted">
                {t.status === 'development' || t.targetType === 'none' || !t.target
                  ? <span className="badge badge--dev"><Construction size={12} /> Fejlesztés alatt</span>
                  : <span className="badge badge--ok">Kész · {t.targetType === 'external' ? 'külső' : 'belső'}: {t.target}</span>}
                {' '}· {t.roles.length ? t.roles.map(roleName).join(', ') : 'csak admin'}
                {!t.isVisible && ' · rejtett'}
              </small>
            </span>
            <span className="tilelist__actions">
              <button className="iconbtn" title="Feljebb" aria-label="Feljebb" onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowUp size={18} /></button>
              <button className="iconbtn" title="Lejjebb" aria-label="Lejjebb" onClick={() => move(i, i + 1)} disabled={i === tiles.length - 1}><ArrowDown size={18} /></button>
              <button className="iconbtn" title={t.isVisible ? 'Elrejtés' : 'Megjelenítés'} aria-label={t.isVisible ? 'Elrejtés' : 'Megjelenítés'} onClick={() => toggleVisible(t)} disabled={orderDirty}>
                {t.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
              <button className="iconbtn" title="Szerkesztés" aria-label="Szerkesztés" onClick={() => setEditing({ id: t.id, draft: toDraft(t), isSystem: t.isSystem })} disabled={orderDirty}><Pencil size={18} /></button>
              {!t.isSystem && <button className="iconbtn iconbtn--danger" title="Törlés" aria-label="Törlés" onClick={() => remove(t)} disabled={orderDirty}><Trash2 size={18} /></button>}
            </span>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Csempe szerkesztése" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal__card" onSubmit={submit}>
            <div className="modal__head">
              <h3>{editing.id == null ? 'Új csempe' : 'Csempe szerkesztése'}</h3>
              <button type="button" className="iconbtn" aria-label="Bezárás" onClick={() => setEditing(null)}><X size={20} /></button>
            </div>
            <div className="grid2">
              <label className="field"><span>Megnevezés</span>
                <input required maxLength={60} value={editing.draft.title} onChange={(e) => set('title', e.target.value)} /></label>
              <label className="field"><span>Szín</span>
                <input type="color" value={editing.draft.color} onChange={(e) => set('color', e.target.value)} /></label>
            </div>
            <label className="field"><span>Rövid leírás</span>
              <input maxLength={200} value={editing.draft.description} onChange={(e) => set('description', e.target.value)} /></label>
            <div className="field"><span>Ikon</span>
              <div className="iconpick">
                {icons.map((name) => (
                  <button type="button" key={name} title={name} aria-label={name} aria-pressed={editing.draft.icon === name}
                          className={editing.draft.icon === name ? 'is-on' : ''} onClick={() => set('icon', name)}>
                    <TileIcon name={name} size={22} />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid2">
              <label className="field"><span>Állapot</span>
                <select value={editing.draft.status} onChange={(e) => set('status', e.target.value as Draft['status'])}>
                  <option value="development">Fejlesztés alatt</option>
                  <option value="active">Kész (kattintható)</option>
                </select></label>
              <label className="field"><span>Céloldal típusa</span>
                <select value={editing.draft.targetType} onChange={(e) => set('targetType', e.target.value as Draft['targetType'])}>
                  <option value="none">Nincs még</option>
                  <option value="internal">Belső oldal (pl. /admin)</option>
                  <option value="external">Külső webcím (https://…)</option>
                </select></label>
            </div>
            {editing.draft.targetType !== 'none' && (
              <label className="field"><span>Céloldal</span>
                <input value={editing.draft.target} placeholder={editing.draft.targetType === 'external' ? 'https://…' : '/…'}
                       onChange={(e) => set('target', e.target.value)} />
                {editing.draft.targetType === 'external' && <small className="muted">Új böngészőlapon nyílik meg.</small>}</label>
            )}
            <div className="field"><span>Kik látják? (az adminisztrátor mindig látja)</span>
              <div className="chips">
                {roles.map((r) => (
                  <label key={r.key} className="chip">
                    <input type="checkbox" checked={editing.draft.roles.includes(r.key)}
                           onChange={(e) => set('roles', e.target.checked ? [...editing.draft.roles, r.key] : editing.draft.roles.filter((x) => x !== r.key))} />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="chip"><input type="checkbox" checked={editing.draft.isVisible} onChange={(e) => set('isVisible', e.target.checked)} /> Megjelenik a főoldalon</label>
            {editing.isSystem && <p className="muted small">Beépített csempe: nem törölhető, de elrejthető és szerkeszthető.</p>}
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Mégse</button>
              <button className="btn btn--primary"><Save size={18} /> Mentés</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
