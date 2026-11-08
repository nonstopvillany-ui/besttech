import { KeyRound, Pencil, Save, UserPlus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Role } from '../../api';
import { useAuth } from '../../auth';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  locked: boolean;
  resetRequested: boolean;
}

type Mode =
  | { kind: 'create'; email: string; name: string; roleKey: string; password: string }
  | { kind: 'edit'; user: AdminUser; name: string; roleKey: string; isActive: boolean }
  | { kind: 'reset'; user: AdminUser; password: string };

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' }) : '–');

export function UsersAdmin({ roles }: { roles: Role[] }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mode, setMode] = useState<Mode | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [formError, setFormError] = useState('');

  const load = async () => setUsers((await api<{ users: AdminUser[] }>('/api/admin/users')).users);
  useEffect(() => { load().catch(() => setMsg({ type: 'error', text: 'Betöltési hiba.' })); }, []);
  const open = (m: Mode) => { setFormError(''); setMode(m); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    setFormError('');
    try {
      if (mode.kind === 'create')
        await api('/api/admin/users', { method: 'POST', body: { email: mode.email, name: mode.name, roleKey: mode.roleKey, password: mode.password } });
      if (mode.kind === 'edit')
        await api(`/api/admin/users/${mode.user.id}`, { method: 'PUT', body: { name: mode.name, roleKey: mode.roleKey, isActive: mode.isActive } });
      if (mode.kind === 'reset')
        await api(`/api/admin/users/${mode.user.id}/reset-password`, { method: 'POST', body: { password: mode.password } });
      setMsg({ type: 'ok', text: mode.kind === 'reset' ? 'Ideiglenes jelszó beállítva. Közöld a felhasználóval biztonságos módon (személyesen vagy telefonon).' : 'Mentve.' });
      setMode(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Hiba történt.');
    }
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Felhasználók</h2>
          <p className="muted">Az új felhasználó és a visszaállított jelszó ideiglenes: első belépéskor cserélni kell. Felhasználó nem törölhető, csak letiltható.</p>
        </div>
        <button className="btn" onClick={() => open({ kind: 'create', email: '', name: '', roleKey: roles.find((r) => !r.isAdmin)?.key ?? '', password: '' })}>
          <UserPlus size={18} /> Új felhasználó
        </button>
      </div>
      {msg && <p className={`alert alert--${msg.type === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>}
      <div className="tablewrap">
        <table className="table">
          <thead><tr><th>Név</th><th>E-mail</th><th>Szerepkör</th><th>Állapot</th><th>Utolsó belépés</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? '' : 'is-off'}>
                <td data-label="Név"><b>{u.name}</b>{u.id === me?.id && <small className="muted"> (te)</small>}</td>
                <td data-label="E-mail">{u.email}</td>
                <td data-label="Szerepkör">{u.roleName}</td>
                <td data-label="Állapot">
                  {u.isActive ? <span className="badge badge--ok">Aktív</span> : <span className="badge">Letiltva</span>}
                  {u.mustChangePassword && <span className="badge badge--dev">Jelszócsere szükséges</span>}
                  {u.locked && <span className="badge badge--error">Zárolva</span>}
                  {u.resetRequested && <span className="badge badge--error">Új jelszót kért</span>}
                </td>
                <td data-label="Utolsó belépés">{fmt(u.lastLoginAt)}</td>
                <td className="nowrap">
                  <button className="iconbtn" title="Szerkesztés" aria-label="Szerkesztés" onClick={() => open({ kind: 'edit', user: u, name: u.name, roleKey: u.roleKey, isActive: u.isActive })}><Pencil size={18} /></button>
                  <button className="iconbtn" title="Ideiglenes jelszó" aria-label="Ideiglenes jelszó" onClick={() => open({ kind: 'reset', user: u, password: '' })}><KeyRound size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setMode(null)}>
          <form className="modal__card" onSubmit={submit}>
            <div className="modal__head">
              <h3>{mode.kind === 'create' ? 'Új felhasználó' : mode.kind === 'edit' ? 'Felhasználó szerkesztése' : 'Ideiglenes jelszó beállítása'}</h3>
              <button type="button" className="iconbtn" aria-label="Bezárás" onClick={() => setMode(null)}><X size={20} /></button>
            </div>
            {mode.kind === 'create' && (
              <>
                <label className="field"><span>E-mail-cím</span>
                  <input type="email" required value={mode.email} onChange={(e) => setMode({ ...mode, email: e.target.value })} /></label>
                <label className="field"><span>Név</span>
                  <input required value={mode.name} onChange={(e) => setMode({ ...mode, name: e.target.value })} /></label>
                <label className="field"><span>Szerepkör</span>
                  <select value={mode.roleKey} onChange={(e) => setMode({ ...mode, roleKey: e.target.value })}>
                    {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select></label>
                <label className="field"><span>Ideiglenes jelszó</span>
                  <input type="text" autoComplete="off" required value={mode.password} onChange={(e) => setMode({ ...mode, password: e.target.value })} />
                  <small className="muted">Legalább 10 karakter, betű és szám. Első belépéskor cserélni kell.</small></label>
              </>
            )}
            {mode.kind === 'edit' && (
              <>
                <p className="muted">{mode.user.email}</p>
                <label className="field"><span>Név</span>
                  <input required value={mode.name} onChange={(e) => setMode({ ...mode, name: e.target.value })} /></label>
                <label className="field"><span>Szerepkör</span>
                  <select value={mode.roleKey} onChange={(e) => setMode({ ...mode, roleKey: e.target.value })}>
                    {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select></label>
                <label className="chip"><input type="checkbox" checked={mode.isActive} onChange={(e) => setMode({ ...mode, isActive: e.target.checked })} /> Aktív (beléphet)</label>
              </>
            )}
            {mode.kind === 'reset' && (
              <>
                <p className="muted">{mode.user.name} ({mode.user.email}) minden eszközről kijelentkeztetésre kerül, és a zárolás is feloldódik.</p>
                <label className="field"><span>Új ideiglenes jelszó</span>
                  <input type="text" autoComplete="off" required value={mode.password} onChange={(e) => setMode({ ...mode, password: e.target.value })} /></label>
              </>
            )}
            {formError && <p className="alert alert--error">{formError}</p>}
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>Mégse</button>
              <button className="btn btn--primary"><Save size={18} /> Mentés</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
