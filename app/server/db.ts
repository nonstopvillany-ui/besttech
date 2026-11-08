import pg from 'pg';

// A DATE típus szövegként ('ÉÉÉÉ-HH-NN') jön vissza, így az időzóna nem tolhatja el a napot.
pg.types.setTypeParser(1082, (v: string) => v);

export type Db = pg.Pool;

export const DEFAULT_SCHEMA = 'besttech_app';

/**
 * Kapcsolatkészlet. Minden kapcsolat a saját sémát használja (search_path),
 * így az alkalmazás táblái nem ütközhetnek egy közös adatbázis más tábláival
 * (pl. a public sémában lévő raktárkezelő-táblákkal).
 */
export function createPool(databaseUrl: string, schema = DEFAULT_SCHEMA): Db {
  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(schema)) throw new Error('Érvénytelen sémanév.');
  // A Railway belső hálózatán nincs TLS; nyilvános proxyn keresztül a
  // kapcsolati karakterlánc ?sslmode=require paramétere kapcsolja be.
  return new pg.Pool({ connectionString: databaseUrl, max: 10, options: `-c search_path=${schema}` });
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
