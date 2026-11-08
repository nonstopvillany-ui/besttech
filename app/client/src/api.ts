// Egyszerű API-kliens. A munkamenet httpOnly sütiben van, a JavaScript nem fér hozzá.
// Az X-Requested-With fejléc a szerveroldali CSRF-védelem része.
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'besttech',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, data.error ?? 'Hiba történt.', data.code);
    // Lejárt munkamenet vagy kötelező jelszócsere egy modul hívásakor: az állapot újraolvasása.
    // Az /api/auth/* végpontok saját hibáit (pl. hibás jelszó, nincs belépve) nem jelezzük,
    // különben a /api/auth/me 401-es válasza végtelen ciklust okozna.
    if (!path.startsWith('/api/auth/') && (res.status === 401 || data.code === 'PASSWORD_CHANGE_REQUIRED'))
      window.dispatchEvent(new CustomEvent('bt:auth', { detail: err }));
    throw err;
  }
  return data as T;
}

export interface User {
  id: number;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  permissions: string[];
}

export interface DashboardTile {
  id: number;
  moduleKey: string | null;
  title: string;
  description: string;
  icon: string;
  color: string;
  targetType: 'internal' | 'external' | 'none';
  target: string;
  ready: boolean;
}

export interface AdminTile {
  id: number;
  moduleKey: string | null;
  title: string;
  description: string;
  icon: string;
  color: string;
  targetType: 'internal' | 'external' | 'none';
  target: string;
  status: 'active' | 'development';
  sortOrder: number;
  isVisible: boolean;
  isSystem: boolean;
  roles: string[];
}

export interface Role {
  key: string;
  name: string;
  description: string;
  isAdmin: boolean;
  isSystem: boolean;
  permissions: string[];
}
