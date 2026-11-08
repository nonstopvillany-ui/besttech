import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Db } from '../server/db.js';
import { login, setup } from './helpers.js';

let app: FastifyInstance;
let db: Db;
beforeAll(async () => { ({ app, db } = await setup({ LOGIN_RATE_LIMIT: '3' })); });
afterAll(async () => { await app?.close(); await db?.end(); });

it('IP-alapú korlát: a limit felett 429 és magyar hibaüzenet', async () => {
  for (let i = 0; i < 3; i++) expect((await login(app, 'x@besttech.hu', 'rosszjelszo1')).res.statusCode).toBe(401);
  const { res } = await login(app, 'x@besttech.hu', 'rosszjelszo1');
  expect(res.statusCode).toBe(429);
  expect(res.json().error).toMatch(/Túl sok próbálkozás/);
});
