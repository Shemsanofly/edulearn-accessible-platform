import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import type { CreatedAccount, ParentListItem } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { createUser, updateUser } from '../lib/accounts.js';
import { intParam, notFound, pageParams, parse, provided } from '../lib/http.js';
import { email, id, name, optionalText, password } from '../lib/validators.js';
import { requireRole } from '../middleware/auth.js';

export const parentsRouter = Router();
parentsRouter.use(requireRole('admin'));

const PARENT_SELECT = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active,
         COALESCE((SELECT json_agg(json_build_object(
                    'id', su.id, 'firstName', su.first_name, 'lastName', su.last_name,
                    'relationship', g.relationship, 'className', c.name) ORDER BY su.first_name)
                     FROM guardians g
                     JOIN users su ON su.id = g.student_id
                     JOIN students s ON s.user_id = g.student_id
                     LEFT JOIN classes c ON c.id = s.class_id
                    WHERE g.parent_id = u.id), '[]'::json) AS children
    FROM users u`;

const childSchema = z.object({ studentId: id, relationship: z.string().trim().min(1).max(40).default('guardian') });

const parentSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password: password.optional(),
  phone: optionalText(40),
  isActive: z.boolean().optional(),
  children: z.array(childSchema).max(20).optional(),
});

async function setChildren(db: pg.PoolClient, parentId: number, children: { studentId: number; relationship: string }[]) {
  await query('DELETE FROM guardians WHERE parent_id = $1', [parentId], db);
  for (const child of children) {
    await query(
      'INSERT INTO guardians (parent_id, student_id, relationship) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [parentId, child.studentId, child.relationship],
      db,
    );
  }
}

const loadParent = (parentId: number) =>
  queryOne<ParentListItem>(`${PARENT_SELECT} WHERE u.id = $1 AND u.role = 'parent'`, [parentId]);

parentsRouter.get('/', async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const search = String(req.query.search ?? '').trim();
  const params: unknown[] = [];
  let where = "WHERE u.role = 'parent'";
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.first_name || ' ' || u.last_name ILIKE $1 OR u.email ILIKE $1 OR EXISTS (
      SELECT 1 FROM guardians g JOIN users su ON su.id = g.student_id
       WHERE g.parent_id = u.id AND su.first_name || ' ' || su.last_name ILIKE $1))`;
  }
  const [items, count] = await Promise.all([
    query<ParentListItem>(`${PARENT_SELECT} ${where} ORDER BY u.last_name, u.first_name LIMIT ${pageSize} OFFSET ${offset}`, params),
    queryOne<{ total: number }>(`SELECT COUNT(*)::int AS total FROM users u ${where}`, params),
  ]);
  res.json({ items, total: count?.total ?? 0, page, pageSize });
});

parentsRouter.get('/:id', async (req, res) => {
  const parent = await loadParent(intParam(req.params.id));
  if (!parent) throw notFound('Parent');
  res.json(parent);
});

parentsRouter.post('/', async (req, res) => {
  const body = parse(parentSchema, req.body);
  const account = await transaction(async (db) => {
    const acc = await createUser(db, { ...body, role: 'parent' });
    if (body.children) await setChildren(db, acc.id, body.children);
    return acc;
  });
  const payload: CreatedAccount<ParentListItem> = { record: (await loadParent(account.id))!, temporaryPassword: account.temporaryPassword };
  res.status(201).json(payload);
});

parentsRouter.patch('/:id', async (req, res) => {
  const parentId = intParam(req.params.id);
  const body = provided(parse(parentSchema.partial(), req.body), req.body);
  if (!(await loadParent(parentId))) throw notFound('Parent');
  await transaction(async (db) => {
    await updateUser(db, parentId, body);
    if (body.children) await setChildren(db, parentId, body.children);
  });
  res.json(await loadParent(parentId));
});

parentsRouter.delete('/:id', async (req, res) => {
  const row = await queryOne("DELETE FROM users WHERE id = $1 AND role = 'parent' RETURNING id", [intParam(req.params.id)]);
  if (!row) throw notFound('Parent');
  res.status(204).end();
});
