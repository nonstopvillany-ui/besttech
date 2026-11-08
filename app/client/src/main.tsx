import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/admin/AdminPage';
import { ChangePasswordPage } from './pages/ChangePassword';
import { DashboardPage } from './pages/Dashboard';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { LoginPage, returnPath } from './pages/Login';
import { ModulePage } from './pages/ModulePage';
import { CustomersPage } from './pages/Customers';
import { ProjectsPage } from './pages/Projects';
import './styles.css';

function Loading() {
  return <div className="loading" aria-live="polite">Betöltés…</div>;
}

/** Védett oldal: bejelentkezés, kötelező jelszócsere és (ha kell) admin jog ellenőrzése. */
function Protected({ children, admin = false, perm }: { children: ReactNode; admin?: boolean; perm?: string }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/belepes" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword) return <Navigate to="/jelszo-csere" replace />;
  if (admin && !user.isAdmin) return <Navigate to="/" replace />;
  if (perm && !user.permissions.includes(perm))
    return <Layout><div className="placeholder"><h1>Nincs jogosultságod</h1><p className="muted">Ehhez a modulhoz kérj hozzáférést az adminisztrátortól.</p><Link to="/" className="btn btn--primary">Vissza a főoldalra</Link></div></Layout>;
  return <Layout>{children}</Layout>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (user && !user.mustChangePassword && returnPath(location).startsWith('/utemezo')) { window.location.assign(returnPath(location)); return <Loading />; }
  if (user) return <Navigate to={user.mustChangePassword ? '/jelszo-csere' + location.search : returnPath(location)} replace state={location.state} />;
  return <>{children}</>;
}

function PasswordRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/belepes" replace />;
  return <ChangePasswordPage />;
}

function NotFound() {
  return (
    <div className="placeholder">
      <h1>Az oldal nem található</h1>
      <Link to="/" className="btn btn--primary">Vissza a főoldalra</Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/belepes" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/elfelejtett-jelszo" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
          <Route path="/jelszo-csere" element={<PasswordRoute />} />
          <Route path="/" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/modul/:id" element={<Protected><ModulePage /></Protected>} />
          <Route path="/ugyfelek" element={<Protected perm="customers.view"><CustomersPage /></Protected>} />
          <Route path="/projektek" element={<Protected perm="projects.view"><ProjectsPage /></Protected>} />
          <Route path="/admin" element={<Protected admin><AdminPage /></Protected>} />
          <Route path="*" element={<Protected><NotFound /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
