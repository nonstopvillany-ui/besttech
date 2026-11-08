import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/admin/AdminPage';
import { ChangePasswordPage } from './pages/ChangePassword';
import { DashboardPage } from './pages/Dashboard';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { LoginPage } from './pages/Login';
import { ModulePage } from './pages/ModulePage';
import './styles.css';

function Loading() {
  return <div className="loading" aria-live="polite">Betöltés…</div>;
}

/** Védett oldal: bejelentkezés, kötelező jelszócsere és (ha kell) admin jog ellenőrzése. */
function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/belepes" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword) return <Navigate to="/jelszo-csere" replace />;
  if (admin && !user.isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={user.mustChangePassword ? '/jelszo-csere' : '/'} replace />;
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
          <Route path="/admin" element={<Protected admin><AdminPage /></Protected>} />
          <Route path="*" element={<Protected><NotFound /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
