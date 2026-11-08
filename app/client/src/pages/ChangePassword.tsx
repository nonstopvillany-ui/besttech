import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { AuthCard } from './Login';

export function ChangePasswordPage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== again) return setError('A két új jelszó nem egyezik.');
    setBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'A szerver nem érhető el.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Jelszócsere">
      <form onSubmit={submit}>
        {user?.mustChangePassword && (
          <p className="alert alert--info">Ideiglenes jelszóval léptél be. A folytatáshoz adj meg egy új, csak általad ismert jelszót.</p>
        )}
        <label className="field">
          <span>Jelenlegi jelszó</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>Új jelszó</span>
          <input type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          <small className="muted">Legalább 10 karakter, betű és szám is legyen benne.</small>
        </label>
        <label className="field">
          <span>Új jelszó még egyszer</span>
          <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy || !current || !next || !again}>Jelszó mentése</button>
        <p className="auth__link">
          {user?.mustChangePassword
            ? <button type="button" className="linkbtn" onClick={async () => { await logout(); navigate('/belepes'); }}>Kijelentkezés</button>
            : <button type="button" className="linkbtn" onClick={() => navigate('/')}>Mégse</button>}
        </p>
      </form>
    </AuthCard>
  );
}
