// Környezeti változók beolvasása és ellenőrzése egy helyen.
export interface AppConfig {
  databaseUrl: string;
  port: number;
  host: string;
  isProduction: boolean;
  appUrl: string;
  sessionTtlHours: number;
  /** Bejelentkezési kísérletek száma IP-címenként 15 percen belül */
  loginRateLimit: number;
  /** A régi v25 adatok tényleges importja engedélyezett-e (alapból NEM) */
  legacyImportEnabled: boolean;
  initialAdminEmail?: string;
  initialAdminPassword?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Hiányzik a DATABASE_URL környezeti változó.');
  const ttl = Number(env.SESSION_TTL_HOURS ?? 168);
  return {
    databaseUrl,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    isProduction: env.NODE_ENV === 'production',
    appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    sessionTtlHours: Number.isFinite(ttl) && ttl > 0 ? ttl : 168,
    legacyImportEnabled: env.LEGACY_IMPORT_ENABLED === 'true',
    loginRateLimit: Math.max(1, Number(env.LOGIN_RATE_LIMIT ?? 10) || 10),
    initialAdminEmail: env.INITIAL_ADMIN_EMAIL?.trim() || undefined,
    initialAdminPassword: env.INITIAL_ADMIN_PASSWORD || undefined,
  };
}
