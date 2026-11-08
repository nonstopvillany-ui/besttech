// Közös nyilvántartások: ügyfelek és projektek. Ugyanezeket a táblákat használja
// az ütemező is, így egy módosítás minden modulban azonnal érvényes.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError, requirePerm } from '../lib/http.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const opt = (max: number) => z.string().trim().max(max).default('');
const dateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum.').nullish().transform((v) => v || null);

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Adj meg nevet.').max(200),
  kind: z.enum(['person', 'company']).default('person'),
  status: z.enum(['lead', 'customer', 'inactive']).default('customer'),
  email: z.union([z.literal(''), z.string().trim().email('Érvénytelen e-mail-cím.').max(200)]).default(''),
  phone: opt(60), address: opt(300), taxNumber: opt(40), notes: opt(5000),
});
const projectSchema = z.object({
  name: z.string().trim().min(1, 'Adj meg projektnevet.').max(200),
  customerId: z.number().int().positive().nullish().transform((v) => v ?? null),
  status: z.enum(['lead', 'active', 'finished', 'archived']).default('active'),
  hrsz: opt(60), address: opt(300), notes: opt(5000),
  startDate: dateOrNull, dueDate: dateOrNull,
});

const mapCustomer = (r: Record<string, any>) => ({
  id: Number(r.id), code: r.code, name: r.name, kind: r.kind, status: r.status, email: r.email, phone: r.phone,
  address: r.address, taxNumber: r.tax_number, notes: r.notes, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
  projectCount: r.project_count != null ? Number(r.project_count) : undefined,
});
const PROJECT_SELECT = `
  SELECT p.*, c.name AS customer_name, c.code AS customer_code,
         (SELECT count(*) FROM project_tasks t WHERE t.project_id = p.id) AS task_count,
         (SELECT count(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status <> 'unscheduled') AS scheduled_count,
         (SELECT count(*) FROM task_days d JOIN project_tasks t ON t.id = d.task_id WHERE t.project_id = p.id) AS planned_days,
         (SELECT count(*) FROM task_days d JOIN project_tasks t ON t.id = d.task_id WHERE t.project_id = p.id AND d.is_done) AS done_days,
         (SELECT min(d.work_date) FROM task_days d JOIN project_tasks t ON t.id = d.task_id WHERE t.project_id = p.id) AS first_day,
         (SELECT max(d.work_date) FROM task_days d JOIN project_tasks t ON t.id = d.task_id WHERE t.project_id = p.id) AS last_day
    FROM projects p LEFT JOIN customers c ON c.id = p.customer_id`;
const mapProject = (r: Record<string, any>) => ({
  id: Number(r.id), code: r.code, name: r.name, status: r.status, hrsz: r.hrsz ?? '', address: r.address, notes: r.notes,
  startDate: r.start_date, dueDate: r.due_date, customerId: r.customer_id != null ? Number(r.customer_id) : null,
  customerName: r.customer_name, customerCode: r.customer_code, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
  schedule: { initialized: r.scheduler_initialized, tasks: Number(r.task_count), scheduled: Number(r.scheduled_count), plannedDays: Number(r.planned_days), doneDays: Number(r.done_days), firstDay: r.first_day, lastDay: r.last_day },
});

export const registryRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  // ------------------------------------------------------------ Ügyfelek
  app.get('/api/customers', async (req) => {
    requirePerm(req, 'customers.view');
    const { q, status } = z.object({ q: z.string().max(100).optional(), status: z.string().optional() }).parse(req.query);
    const { rows } = await db.query(
      `SELECT c.*, (SELECT count(*) FROM projects p WHERE p.customer_id = c.id AND p.status <> 'archived') AS project_count
         FROM customers c
        WHERE ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%' OR c.code ILIKE '%' || $1 || '%' OR c.email ILIKE '%' || $1 || '%' OR c.phone ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR c.status = $2)
        ORDER BY lower(c.name) LIMIT 1000`,
      [q?.trim() || null, status || null],
    );
    return { customers: rows.map(mapCustomer) };
  });

  app.get('/api/customers/:id', async (req) => {
    requirePerm(req, 'customers.view');
    const { id } = idParam.parse(req.params);
    const { rows } = await db.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Az ügyfél nem található.', 'NOT_FOUND');
    const projects = await db.query(`${PROJECT_SELECT} WHERE p.customer_id = $1 ORDER BY p.created_at DESC`, [id]);
    return { customer: mapCustomer(rows[0]), projects: projects.rows.map(mapProject) };
  });

  app.post('/api/customers', async (req) => {
    const user = requirePerm(req, 'customers.edit');
    const c = customerSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO customers (name, kind, status, email, phone, address, tax_number, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING *`,
      [c.name, c.kind, c.status, c.email, c.phone, c.address, c.taxNumber, c.notes, user.id],
    );
    await audit(db, user.id, 'customer_created', 'customer', rows[0].id, { code: rows[0].code }, req.ip);
    return { customer: mapCustomer(rows[0]) };
  });

  app.put('/api/customers/:id', async (req) => {
    const user = requirePerm(req, 'customers.edit');
    const { id } = idParam.parse(req.params);
    const c = customerSchema.extend({ version: z.number().int() }).parse(req.body);
    const { rows } = await db.query(
      `UPDATE customers SET name = $2, kind = $3, status = $4, email = $5, phone = $6, address = $7, tax_number = $8, notes = $9,
              version = version + 1, updated_at = now(), updated_by = $10
        WHERE id = $1 AND version = $11 RETURNING *`,
      [id, c.name, c.kind, c.status, c.email, c.phone, c.address, c.taxNumber, c.notes, user.id, c.version],
    );
    if (!rows[0]) {
      const exists = await db.query('SELECT 1 FROM customers WHERE id = $1', [id]);
      throw exists.rowCount ? new HttpError(409, 'Közben valaki más módosította ezt az ügyfelet. Frissítsd az oldalt.', 'CONFLICT') : new HttpError(404, 'Az ügyfél nem található.', 'NOT_FOUND');
    }
    await audit(db, user.id, 'customer_updated', 'customer', id, {}, req.ip);
    return { customer: mapCustomer(rows[0]) };
  });

  // ------------------------------------------------------------ Projektek
  app.get('/api/projects', async (req) => {
    requirePerm(req, 'projects.view');
    const f = z.object({ q: z.string().max(100).optional(), status: z.string().optional(), customerId: z.coerce.number().int().optional() }).parse(req.query);
    const { rows } = await db.query(
      `${PROJECT_SELECT}
        WHERE ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.code ILIKE '%' || $1 || '%' OR p.hrsz ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR p.status = $2)
          AND ($3::bigint IS NULL OR p.customer_id = $3)
        ORDER BY p.sort_order, p.id LIMIT 2000`,
      [f.q?.trim() || null, f.status || null, f.customerId ?? null],
    );
    return { projects: rows.map(mapProject) };
  });

  app.get('/api/projects/:id', async (req) => {
    requirePerm(req, 'projects.view');
    const { id } = idParam.parse(req.params);
    const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'A projekt nem található.', 'NOT_FOUND');
    return { project: mapProject(rows[0]) };
  });

  const checkCustomer = async (cid: number | null) => {
    if (cid != null && !(await db.query('SELECT 1 FROM customers WHERE id = $1', [cid])).rowCount)
      throw new HttpError(400, 'A kiválasztott ügyfél nem létezik.', 'VALIDATION');
  };

  app.post('/api/projects', async (req) => {
    const user = requirePerm(req, 'projects.edit');
    const p = projectSchema.parse(req.body);
    await checkCustomer(p.customerId);
    const { rows } = await db.query(
      `INSERT INTO projects (name, customer_id, status, hrsz, address, notes, start_date, due_date, sort_order, created_by, updated_by)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, (SELECT COALESCE(max(sort_order), 0) + 10 FROM projects), $9, $9) RETURNING id`,
      [p.name, p.customerId, p.status, p.hrsz, p.address, p.notes, p.startDate, p.dueDate, user.id],
    );
    await audit(db, user.id, 'project_created', 'project', rows[0].id, { customerId: p.customerId }, req.ip);
    const res = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [rows[0].id]);
    return { project: mapProject(res.rows[0]) };
  });

  // A projekt törzsadatainak módosítása. A név és az állapot az ütemezőben is látszik,
  // ezért ilyenkor az ütemezési verzió is nő (a nyitott ütemezők frissülnek).
  app.put('/api/projects/:id', async (req) => {
    const user = requirePerm(req, 'projects.edit');
    const { id } = idParam.parse(req.params);
    const p = projectSchema.extend({ version: z.number().int() }).parse(req.body);
    await checkCustomer(p.customerId);
    const { rows } = await db.query(
      `UPDATE projects SET name = $2, customer_id = $3, status = $4, hrsz = NULLIF($5, ''), address = $6, notes = $7,
              start_date = $8, due_date = $9, version = version + 1,
              sched_version = CASE WHEN name <> $2 OR status <> $4 THEN sched_version + 1 ELSE sched_version END,
              updated_at = now(), updated_by = $10
        WHERE id = $1 AND version = $11 RETURNING id`,
      [id, p.name, p.customerId, p.status, p.hrsz, p.address, p.notes, p.startDate, p.dueDate, user.id, p.version],
    );
    if (!rows[0]) {
      const exists = await db.query('SELECT 1 FROM projects WHERE id = $1', [id]);
      throw exists.rowCount ? new HttpError(409, 'Közben valaki más módosította ezt a projektet. Frissítsd az oldalt.', 'CONFLICT') : new HttpError(404, 'A projekt nem található.', 'NOT_FOUND');
    }
    await audit(db, user.id, 'project_updated', 'project', id, { status: p.status }, req.ip);
    const res = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
    return { project: mapProject(res.rows[0]) };
  });
};
