import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { Db } from '../db.js';
import { HttpError, requireUser } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { emailSchema } from '../lib/validate.js';
import { hashPassword, passwordProblem, verifyDummy, verifyPassword } from '../security/password.js';
import { createSession, deleteSession, deleteUserSessions, SESSION_COOKIE } from '../security/session.js';

const MAX_FAILED = 5;          // ennyi hibás próbálkozás után...
const LOCK_MINUTES = 15;       // ...ennyi percre zárolódik a fiók

export const authRoutes: FastifyPluginAsync<{ db: Db; config: AppConfig }> = async (app, { db, config }) => {
  // IP-címenkénti korlát a jelszópróbálgatás ellen (a fiókzárolás mellett)
  const loginLimit = { config: { rateLimit: { max: config.loginRateLimit, timeWindow: '15 minutes' } } };

  const cookieOpts = (expires: Date) => ({
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    expires,
  });

  app.post('/api/auth/login', loginLimit, async (req, reply) => {
    const body = z.object({ email: z.string().max(200), password: z.string().max(200) }).parse(req.body);
    const email = body.email.trim().toLowerCase();
    const fail = () => new HttpError(401, 'Hibás e-mail-cím vagy jelszó.', 'INVALID_CREDENTIALS');

    const { rows } = await db.query(
      'SELECT id, password_hash, is_active, locked_until, failed_login_count FROM users WHERE lower(email) = $1',
      [email],
    );
    const u = rows[0];
    if (!u) {
      await verifyDummy(body.password);
      await audit(db, null, 'login_failed', 'user', undefined, { reason: 'unknown_email' }, req.ip);
      throw fail();
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      await verifyDummy(body.password);
      throw new HttpError(423, `A fiók a sok hibás próbálkozás miatt átmenetileg zárolva van. Próbáld újra ${LOCK_MINUTES} perc múlva.`, 'LOCKED');
    }
    const ok = await verifyPassword(body.password, u.password_hash);
    if (!ok || !u.is_active) {
      const failed = (u.failed_login_count ?? 0) + 1;
      // Az 5. hibás próbálkozás után zárolás, és a számláló újraindul
      const lock = failed >= MAX_FAILED;
      await db.query(
        `UPDATE users SET failed_login_count = $2,
           locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
         WHERE id = $1`,
        [u.id, lock ? 0 : failed, lock, LOCK_MINUTES],
      );
      await audit(db, Number(u.id), 'login_failed', 'user', u.id, { reason: ok ? 'inactive' : 'bad_password' }, req.ip);
      throw fail();
    }

    await db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]);
    const { token, expiresAt } = await createSession(db, Number(u.id), config.sessionTtlHours, req.ip, req.headers['user-agent']);
    await audit(db, Number(u.id), 'login', 'user', u.id, {}, req.ip);
    reply.setCookie(SESSION_COOKIE, token, cookieOpts(expiresAt));
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (req.user) await audit(db, req.user.id, 'logout', 'user', req.user.id, {}, req.ip);
    await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    const user = requireUser(req, true);
    return { user };
  });

  app.post('/api/auth/change-password', loginLimit, async (req) => {
    const user = requireUser(req, true);
    const body = z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }).parse(req.body);
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!rows[0] || !(await verifyPassword(body.currentPassword, rows[0].password_hash)))
      throw new HttpError(400, 'A jelenlegi jelszó hibás.', 'INVALID_PASSWORD');
    const problem = passwordProblem(body.newPassword);
    if (problem) throw new HttpError(400, problem, 'WEAK_PASSWORD');
    if (body.newPassword === body.currentPassword) throw new HttpError(400, 'Az új jelszó nem egyezhet a régivel.', 'SAME_PASSWORD');
    await db.query(
      'UPDATE users SET password_hash = $2, must_change_password = false, password_changed_at = now(), updated_at = now() WHERE id = $1',
      [user.id, await hashPassword(body.newPassword)],
    );
    // A többi eszközön lévő munkamenet érvénytelenné válik
    await deleteUserSessions(db, user.id, req.cookies[SESSION_COOKIE]);
    await audit(db, user.id, 'password_changed', 'user', user.id, {}, req.ip);
    return { ok: true };
  });

  // Elfelejtett jelszó – előkészített végpont. E-mail-küldés még nincs; a kérés
  // az eseménynaplóba kerül, és az adminisztrátor állít be ideiglenes jelszót.
  // A válasz mindig ugyanaz, így nem árulja el, létezik-e a cím.
  app.post('/api/auth/forgot-password', loginLimit, async (req) => {
    const parsed = emailSchema.safeParse((req.body as { email?: unknown })?.email);
    if (parsed.success) {
      const { rows } = await db.query('SELECT id FROM users WHERE lower(email) = $1 AND is_active', [parsed.data]);
      if (rows[0]) await audit(db, Number(rows[0].id), 'password_reset_requested', 'user', rows[0].id, {}, req.ip);
    }
    return {
      ok: true,
      message: 'Ha a cím szerepel a rendszerben, az adminisztrátor értesítést kap, és felveszi veled a kapcsolatot.',
    };
  });
};
