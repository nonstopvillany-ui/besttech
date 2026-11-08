import type { Db } from '../db.js';
import { emailSchema } from './validate.js';
import { hashPassword, passwordProblem } from '../security/password.js';
import { audit } from './audit.js';

export type AdminResult = 'created' | 'updated' | 'skipped';

/**
 * Adminisztrátor létrehozása vagy jelszavának beállítása.
 * - Ha a cím még nem létezik: új admin, kötelező jelszócserével.
 * - Ha létezik és `resetIfExists`: admin szerepkör + új ideiglenes jelszó, zárolás feloldva.
 */
export async function upsertAdmin(db: Db, emailRaw: string, password: string, opts: { resetIfExists: boolean; name?: string }): Promise<AdminResult> {
  const email = emailSchema.parse(emailRaw);
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const hash = await hashPassword(password);
  const existing = await db.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing.rows[0]) {
    if (!opts.resetIfExists) return 'skipped';
    await db.query(
      `UPDATE users SET password_hash = $2, role_key = 'admin', is_active = true, must_change_password = true,
              failed_login_count = 0, locked_until = NULL, password_changed_at = now(), updated_at = now()
        WHERE id = $1`,
      [existing.rows[0].id, hash],
    );
    await db.query('DELETE FROM sessions WHERE user_id = $1', [existing.rows[0].id]);
    await audit(db, null, 'admin_password_reset_cli', 'user', existing.rows[0].id);
    return 'updated';
  }
  const { rows } = await db.query(
    `INSERT INTO users (email, name, password_hash, role_key, must_change_password)
     VALUES ($1, $2, $3, 'admin', true) RETURNING id`,
    [email, opts.name ?? 'Adminisztrátor', hash],
  );
  await audit(db, null, 'admin_created', 'user', rows[0].id, { email });
  return 'created';
}

/** Indításkori létrehozás környezeti változóból – csak ha még nincs aktív admin. */
export async function bootstrapAdminFromEnv(db: Db, email: string | undefined, password: string | undefined, log: (m: string) => void) {
  if (!email || !password) return;
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM users u JOIN roles r ON r.key = u.role_key WHERE r.is_admin AND u.is_active`,
  );
  if (rows[0].n > 0) {
    log('INITIAL_ADMIN_* változók be vannak állítva, de már van adminisztrátor – kihagyva. Töröld ezeket a változókat!');
    return;
  }
  const result = await upsertAdmin(db, email, password, { resetIfExists: true });
  log(`Első adminisztrátor ${result === 'created' ? 'létrehozva' : 'visszaállítva'}: ${email}. Töröld az INITIAL_ADMIN_* változókat!`);
}
