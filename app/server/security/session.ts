import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.js';

export const SESSION_COOKIE = 'bt_session';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Új munkamenet: a böngésző a véletlen tokent kapja, az adatbázis csak a lenyomatát tárolja. */
export async function createSession(db: Db, userId: number, ttlHours: number, ip?: string, userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.query(
    'INSERT INTO sessions (id_hash, user_id, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5)',
    [hashToken(token), userId, expiresAt, ip ?? null, userAgent?.slice(0, 300) ?? null],
  );
  return { token, expiresAt };
}

export async function getSessionUser(db: Db, token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const { rows } = await db.query(
    `UPDATE sessions s SET last_seen_at = now()
       FROM users u JOIN roles r ON r.key = u.role_key
      WHERE s.id_hash = $1 AND s.user_id = u.id AND s.expires_at > now() AND u.is_active
      RETURNING u.id, u.email, u.name, u.role_key, r.name AS role_name, r.is_admin, u.must_change_password`,
    [hashToken(token)],
  );
  const u = rows[0];
  if (!u) return null;
  return {
    id: Number(u.id), email: u.email, name: u.name, roleKey: u.role_key, roleName: u.role_name,
    isAdmin: u.is_admin, mustChangePassword: u.must_change_password,
  };
}

export async function deleteSession(db: Db, token: string | undefined) {
  if (token) await db.query('DELETE FROM sessions WHERE id_hash = $1', [hashToken(token)]);
}

export async function deleteUserSessions(db: Db, userId: number, exceptToken?: string) {
  if (exceptToken) await db.query('DELETE FROM sessions WHERE user_id = $1 AND id_hash <> $2', [userId, hashToken(exceptToken)]);
  else await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function purgeExpiredSessions(db: Db) {
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
}
