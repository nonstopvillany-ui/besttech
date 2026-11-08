import { ArrowLeft, Construction } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { TileIcon } from '../icons';

interface TileInfo { id: number; title: string; description: string; icon: string; color: string; ready: boolean }

export function ModulePage() {
  const { id } = useParams();
  const [tile, setTile] = useState<TileInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ tile: TileInfo }>(`/api/dashboard/tiles/${encodeURIComponent(id ?? '')}`)
      .then((r) => setTile(r.tile))
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Ez a modul nem található, vagy nincs hozzá jogosultságod.' : 'Hiba történt.'));
  }, [id]);

  return (
    <div className="placeholder">
      <Link to="/" className="btn btn--ghost"><ArrowLeft size={18} /> Vissza a főoldalra</Link>
      {error && <p className="alert alert--error">{error}</p>}
      {tile && (
        <div className="placeholder__card" style={{ '--tile-color': tile.color } as React.CSSProperties}>
          <span className="tile__icon tile__icon--lg"><TileIcon name={tile.icon} size={56} /></span>
          <h1>{tile.title}</h1>
          {tile.description && <p className="muted">{tile.description}</p>}
          <p className="badge badge--dev badge--lg"><Construction size={18} /> Fejlesztés alatt</p>
          <p className="muted">Ez a modul a következő fejlesztési szakaszokban készül el.</p>
        </div>
      )}
    </div>
  );
}
