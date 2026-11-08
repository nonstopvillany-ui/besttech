import { Eye, EyeOff, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Brand } from '../components/Brand';

/** Belépés utáni visszairányítás: ?vissza=/utemezo vagy a védett oldal, ahonnan jött. */
export function returnPath(location: { state: unknown; search: string }): string {
  const from = (location.state as { from?: string } | null)?.from ?? new URLSearchParams(location.search).get('vissza') ?? '/';
  return from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\') ? from : '/';
}
export function goBack(navigate: (to: string, o?: { replace?: boolean }) => void, location: { state: unknown; search: string }) {
  const to = returnPath(location);
  if (to.startsWith('/utemezo')) window.location.assign(to); // nem a React-alkalmazás része
  else navigate(to, { replace: true });
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__panel">
        <div className="auth__hero">
          <Brand light size="lg" />
          <h1>Vállalatirányítási rendszer</h1>
          <p>Építési ütemezés, projektek, ügyfelek és dokumentumok egy helyen.</p>
        </div>
        <div className="auth__card">
          <h2>{title}</h2>
          {children}
        </div>
      </div>
      <p className="auth__foot">© {new Date().getFullYear()} Besttech Kft.</p>
    </div>
  );
}

export function LoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
      const { user } = await api<{ user: { mustChangePassword: boolean } }>('/api/auth/me');
      await refresh();
      // Ideiglenes jelszónál előbb jelszócsere, utána vissza oda, ahonnan jött
      if (user.mustChangePassword) navigate('/jelszo-csere' + location.search, { replace: true, state: location.state });
      else goBack(navigate, location);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'A szerver nem érhető el.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Bejelentkezés">
      <form onSubmit={submit} noValidate>
        <label className="field">
          <span>E-mail-cím</span>
          <input type="email" autoComplete="username" inputMode="email" required autoFocus
                 value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nev@besttech.hu" />
        </label>
        <label className="field">
          <span>Jelszó</span>
          <span className="pw">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" required
                   value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="pw__toggle" onClick={() => setShow(!show)}
                    aria-label={show ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy || !email || !password}>
          <Lock size={18} /> {busy ? 'Bejelentkezés…' : 'Bejelentkezés'}
        </button>
        <p className="auth__link"><Link to="/elfelejtett-jelszo">Elfelejtetted a jelszavad?</Link></p>
      </form>
    </AuthCard>
  );
}
