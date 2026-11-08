import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { getSessionUser, SESSION_COOKIE } from './security/session.js';
import { HttpError } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { adminRoutes } from './routes/admin.js';

export interface BuildOptions {
  config: AppConfig;
  db: Db;
  /** Tesztekben kikapcsolható a kérésnaplózás. */
  logger?: boolean;
}

export async function buildApp({ config, db, logger = true }: BuildOptions) {
  const app = Fastify({
    logger: logger ? { level: config.isProduction ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers.authorization'] } : false,
    trustProxy: true, // a Railway proxy mögött a valódi kliens IP és a https protokoll
    bodyLimit: 100 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    strictTransportSecurity: config.isProduction ? { maxAge: 15552000, includeSubDomains: false } : false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.decorateRequest('user', null);

  // CSRF-védelem: módosító API-kérés csak saját oldalról jöhet.
  // A böngésző idegen oldalról nem tud egyedi fejlécet küldeni CORS-engedély nélkül,
  // és CORS-t nem engedélyezünk; ezen felül az Origin fejlécet is ellenőrizzük.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (req.headers['x-requested-with'] !== 'besttech')
      throw new HttpError(403, 'Érvénytelen kérés.', 'CSRF');
    const origin = req.headers.origin;
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch { /* érvénytelen */ }
      if (host !== req.host) throw new HttpError(403, 'Érvénytelen kérés (Origin).', 'CSRF');
    }
  });

  // Bejelentkezett felhasználó betöltése a munkamenet-sütiből
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/')) req.user = await getSessionUser(db, req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message, code: err.code });
    if (err instanceof ZodError) return reply.code(400).send({ error: err.issues[0]?.message ?? 'Hibás adat.', code: 'VALIDATION' });
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (e.statusCode === 429) return reply.code(429).send({ error: 'Túl sok próbálkozás. Próbáld újra néhány perc múlva.', code: 'RATE_LIMIT' });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'Hibás kérés.', code: e.code });
    req.log.error(err);
    return reply.code(500).send({ error: 'Váratlan szerverhiba.', code: 'SERVER_ERROR' });
  });

  app.get('/api/health', async (_req, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'db_unavailable' });
    }
  });

  await app.register(authRoutes, { db, config });
  await app.register(dashboardRoutes, { db });
  await app.register(adminRoutes, { db });

  // A lefordított React-felület kiszolgálása (production build esetén)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(here, '../client');
  const hasClient = existsSync(path.join(clientDir, 'index.html'));
  if (hasClient) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false, index: false });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET' || !hasClient)
      return reply.code(404).send({ error: 'Nem található.', code: 'NOT_FOUND' });
    // Egyoldalas alkalmazás: minden ismeretlen útvonal az index.html-t kapja
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });

  return app;
}
