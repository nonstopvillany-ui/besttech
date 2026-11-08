import { ArrowLeft, History, LayoutGrid, Settings, Shield, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Role } from '../../api';
import { TilesAdmin } from './TilesAdmin';
import { UsersAdmin } from './UsersAdmin';

type Tab = 'tiles' | 'users' | 'roles' | 'settings' | 'audit';

const ACTIONS: Record<string, string> = {
  login: 'Bejelentkezés', logout: 'Kijelentkezés', login_failed: 'Sikertelen belépés', password_changed: 'Jelszócsere',
  password_reset_requested: 'Új jelszót kért', password_reset_by_admin: 'Ideiglenes jelszó (admin)',
  admin_created: 'Admin létrehozva', admin_password_reset_cli: 'Admin jelszó visszaállítva', user_created: 'Felhasználó létrehozva',
  user_updated: 'Felhasználó módosítva', tile_created: 'Csempe létrehozva', tile_updated: 'Csempe módosítva',
  tile_deleted: 'Csempe törölve', tiles_reordered: 'Csempesorrend módosítva', settings_updated: 'Beállítás módosítva',
};

function RolesView({ roles }: { roles: Role[] }) {
  return (
    <section>
      <h2>Szerepkörök</h2>
      <p className="muted">
        A szerepkör határozza meg, mely főoldali csempéket látja a felhasználó (a csempe szerkesztésekor állítható).
        Az Adminisztrátor teljes jogosultságú. A modulonkénti részletes jogosultságok az egyes modulokkal együtt készülnek el.
      </p>
      <div className="cards">
        {roles.map((r) => (
          <div key={r.key} className="card">
            <b>{r.name} {r.isAdmin && <span className="badge badge--ok"><Shield size={12} /> teljes jog</span>}</b>
            <p className="muted small">{r.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsView() {
  const [title, setTitle] = useState('');
  const [welcome, setWelcome] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api<{ settings: { title?: string; welcome?: string } }>('/api/dashboard').then((r) => {
      setTitle(r.settings.title ?? '');
      setWelcome(r.settings.welcome ?? '');
    }).catch(() => {});
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/admin/settings/dashboard', { method: 'PUT', body: { title, welcome } });
      setMsg('Mentve.');
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Hiba történt.');
    }
  };
  return (
    <section>
      <h2>Főoldal beállításai</h2>
      <form onSubmit={submit} className="narrow">
        <label className="field"><span>Főoldal címe</span><input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Üdvözlő szöveg</span><input maxLength={200} value={welcome} onChange={(e) => setWelcome(e.target.value)} /></label>
        {msg && <p className="alert alert--info">{msg}</p>}
        <button className="btn btn--primary">Mentés</button>
      </form>
    </section>
  );
}

interface AuditEntry { id: number; action: string; entity: string | null; entityId: string | null; details: Record<string, unknown>; ip: string | null; createdAt: string; email: string | null }

function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => { api<{ entries: AuditEntry[] }>('/api/admin/audit').then((r) => setEntries(r.entries)).catch(() => {}); }, []);
  return (
    <section>
      <h2>Eseménynapló</h2>
      <p className="muted">Az utolsó 200 esemény (belépések, jogosultság- és csempemódosítások).</p>
      <div className="tablewrap">
        <table className="table">
          <thead><tr><th>Időpont</th><th>Felhasználó</th><th>Esemény</th><th>Részletek</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td data-label="Időpont" className="nowrap">{new Date(e.createdAt).toLocaleString('hu-HU')}</td>
                <td data-label="Felhasználó">{e.email ?? '–'}</td>
                <td data-label="Esemény">{ACTIONS[e.action] ?? e.action}</td>
                <td data-label="Részletek" className="small muted">{Object.keys(e.details ?? {}).length ? JSON.stringify(e.details) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('tiles');
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => { api<{ roles: Role[] }>('/api/admin/roles').then((r) => setRoles(r.roles)).catch(() => {}); }, []);

  const tabs: [Tab, string, React.ReactNode][] = [
    ['tiles', 'Csempék', <LayoutGrid size={18} />],
    ['users', 'Felhasználók', <Users size={18} />],
    ['roles', 'Szerepkörök', <Shield size={18} />],
    ['settings', 'Beállítások', <Settings size={18} />],
    ['audit', 'Eseménynapló', <History size={18} />],
  ];

  return (
    <div className="admin">
      <div className="admin__head">
        <Link to="/" className="btn btn--ghost"><ArrowLeft size={18} /> Főoldal</Link>
        <h1>Adminisztráció</h1>
      </div>
      <nav className="tabs" role="tablist">
        {tabs.map(([key, label, icon]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
            {icon} <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="panel">
        {tab === 'tiles' && roles.length > 0 && <TilesAdmin roles={roles} />}
        {tab === 'users' && roles.length > 0 && <UsersAdmin roles={roles} />}
        {tab === 'roles' && <RolesView roles={roles} />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'audit' && <AuditView />}
      </div>
    </div>
  );
}
