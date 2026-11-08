import { Construction, ExternalLink, KeyRound, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type DashboardTile } from '../api';
import { useAuth } from '../auth';
import { TileIcon } from '../icons';

interface DashboardData {
  settings: { title?: string; welcome?: string };
  tiles: DashboardTile[];
}

// A React-alkalmazás saját oldalai; minden más belső cél (pl. /utemezo) külön oldal
const SPA_ROUTE = /^\/($|admin|ugyfelek|projektek|modul|jelszo-csere)(\/|\?|$)/;

function TileCard({ tile }: { tile: DashboardTile }) {
  const style = { '--tile-color': tile.color } as React.CSSProperties;
  const body = (
    <>
      <span className="tile__icon"><TileIcon name={tile.icon} /></span>
      <span className="tile__title">{tile.title}</span>
      {tile.description && <span className="tile__desc">{tile.description}</span>}
      {!tile.ready && <span className="badge badge--dev"><Construction size={14} /> Fejlesztés alatt</span>}
      {tile.ready && tile.targetType === 'external' && <span className="tile__ext" title="Új lapon nyílik"><ExternalLink size={16} /></span>}
    </>
  );
  if (tile.ready && tile.targetType === 'external')
    return <a className="tile" style={style} href={tile.target} target="_blank" rel="noopener noreferrer">{body}</a>;
  if (tile.ready && tile.targetType === 'internal')
    return SPA_ROUTE.test(tile.target)
      ? <Link className="tile" style={style} to={tile.target}>{body}</Link>
      : <a className="tile" style={style} href={tile.target}>{body}</a>;
  return <Link className="tile tile--dev" style={style} to={`/modul/${tile.id}`}>{body}</Link>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('/api/dashboard').then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'A szerver nem érhető el.'));
  }, []);

  const firstName = (user?.name || '').split(' ').at(-1);
  return (
    <div className="dashboard">
      <div className="dashboard__head">
        <div>
          <h1>{data?.settings.title ?? 'Besttech Kft.'}</h1>
          <p className="muted">{firstName ? `Szia, ${firstName}! ` : ''}{data?.settings.welcome}</p>
        </div>
        <div className="dashboard__actions">
          <Link to="/jelszo-csere" className="btn btn--ghost"><KeyRound size={18} /> Jelszócsere</Link>
          {user?.isAdmin && <Link to="/admin" className="btn btn--ghost"><Settings size={18} /> Csempék szerkesztése</Link>}
        </div>
      </div>
      {error && <p className="alert alert--error">{error}</p>}
      {!data && !error && <p className="muted">Betöltés…</p>}
      {data && (
        <div className="tiles">
          {data.tiles.map((t) => <TileCard key={t.id} tile={t} />)}
          {!data.tiles.length && <p className="muted">Nincs számodra elérhető modul. Fordulj az adminisztrátorhoz.</p>}
        </div>
      )}
    </div>
  );
}
