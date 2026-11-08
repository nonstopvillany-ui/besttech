import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { bootstrapAdminFromEnv } from './lib/bootstrap.js';
import { runMigrations } from './lib/migrate.js';
import { purgeExpiredSessions } from './security/session.js';

const config = loadConfig();
const db = createPool(config.databaseUrl, config.dbSchema);
const app = await buildApp({ config, db });

// A migráció a preDeployCommand-ban is lefut; itt biztonsági okból újra ellenőrizzük
// (zár védi, a már alkalmazott fájlokat kihagyja).
await runMigrations(db, (m) => app.log.info(m));
await bootstrapAdminFromEnv(db, config.initialAdminEmail, config.initialAdminPassword, (m) => app.log.warn(m));

// Lejárt munkamenetek takarítása óránként
const timer = setInterval(() => purgeExpiredSessions(db).catch((e) => app.log.error(e)), 3600_000);
timer.unref();

const shutdown = async () => {
  app.log.info('Leállás...');
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
