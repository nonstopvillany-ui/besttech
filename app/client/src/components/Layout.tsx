import { LogOut, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Brand } from './Brand';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__home" aria-label="Főoldal"><Brand light /></Link>
        <div className="topbar__right">
          {user?.isAdmin && (
            <Link to="/admin" className="iconbtn" title="Adminisztráció" aria-label="Adminisztráció"><Settings size={20} /></Link>
          )}
          <div className="topbar__user">
            <b>{user?.name || user?.email}</b>
            <small>{user?.roleName}</small>
          </div>
          <button
            className="iconbtn"
            title="Kijelentkezés"
            aria-label="Kijelentkezés"
            onClick={async () => { await logout(); navigate('/belepes'); }}
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
      <footer className="footer">© {new Date().getFullYear()} Besttech Kft. · Belső vállalatirányítási rendszer</footer>
    </div>
  );
}
