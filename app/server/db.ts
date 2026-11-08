import pg from 'pg';

export type Db = pg.Pool;

export function createPool(databaseUrl: string): Db {
  // A Railway belső hálózatán nincs TLS; nyilvános proxyn keresztül a
  // kapcsolati karakterlánc ?sslmode=require paramétere kapcsolja be.
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

/** Tranzakció: hiba esetén minden változtatás visszavonódik. */
export async function withTransaction<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
