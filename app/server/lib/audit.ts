import type { Db } from '../db.js';

export async function audit(
  db: Db, userId: number | null, action: string,
  entity?: string, entityId?: string | number, details: Record<string, unknown> = {}, ip?: string,
) {
  await db.query(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, action, entity ?? null, entityId != null ? String(entityId) : null, JSON.stringify(details), ip ?? null],
  );
}
