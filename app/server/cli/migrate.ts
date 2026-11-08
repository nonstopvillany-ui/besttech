// Használat: npm run migrate   (Railway-en a preDeployCommand futtatja)
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { runMigrations } from '../lib/migrate.js';

const db = createPool(loadConfig().databaseUrl);
try {
  await runMigrations(db);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
