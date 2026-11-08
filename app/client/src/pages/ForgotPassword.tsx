import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { AuthCard } from './Login';

// Előkészített funkció: e-mailes jelszó-visszaállítás később kerül be.
// Most a kérés az adminisztrátor felhasználólistájában jelenik meg.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'A szerver nem érhető el.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Elfelejtett jelszó">
      {message ? (
        <>
          <p className="alert alert--info">{message}</p>
          <p className="auth__link"><Link to="/belepes">Vissza a bejelentkezéshez</Link></p>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="muted">Add meg az e-mail-címed. Az adminisztrátor ideiglenes jelszót állít be neked. Az automatikus e-mailes visszaállítás fejlesztés alatt áll.</p>
          <label className="field">
            <span>E-mail-cím</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="alert alert--error" role="alert">{error}</p>}
          <button className="btn btn--primary btn--block" disabled={busy || !email}>Kérés elküldése</button>
          <p className="auth__link"><Link to="/belepes">Vissza a bejelentkezéshez</Link></p>
        </form>
      )}
    </AuthCard>
  );
}
