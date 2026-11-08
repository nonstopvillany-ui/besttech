import type { FastifyRequest } from 'fastify';
import type { SessionUser } from '../security/session.js';
import type { Permission } from './permissions.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

/** Kötelező bejelentkezés. Jelszócsere-kötelezettség esetén csak a jelszócsere érhető el. */
export function requireUser(req: FastifyRequest, allowWhilePasswordChange = false): SessionUser {
  if (!req.user) throw new HttpError(401, 'Bejelentkezés szükséges.', 'UNAUTHENTICATED');
  if (req.user.mustChangePassword && !allowWhilePasswordChange)
    throw new HttpError(403, 'Először változtasd meg a jelszavad.', 'PASSWORD_CHANGE_REQUIRED');
  return req.user;
}

export function requireAdmin(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (!user.isAdmin) throw new HttpError(403, 'Ehhez adminisztrátori jogosultság kell.', 'FORBIDDEN');
  return user;
}

export const can = (user: SessionUser | null, perm: Permission) => !!user && (user.isAdmin || user.permissions.includes(perm));

/** Bejelentkezés + a megadott jogosultság kötelező. */
export function requirePerm(req: FastifyRequest, perm: Permission): SessionUser {
  const user = requireUser(req);
  if (!can(user, perm)) throw new HttpError(403, 'Ehhez nincs jogosultságod.', 'FORBIDDEN');
  return user;
}
