import { Router } from 'express';
import type { CreatedAccount, ParentListItem } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { insertParent, parentSchema, patchParent } from '../lib/people.js';
import { audit } from '../lib/audit.js';
import { intParam, notFound, orderBy, pageParams, parse, provided } from '../lib/http.js';
import { PHOTO_URL } from '../lib/sql.js';
import { requireRole } from '../middleware/auth.js';

export const parentsRouter = Router();
parentsRouter.use(requireRole('admin'));

const PARENT_SELECT = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, ${PHOTO_URL} AS photo_url,
         COALESCE((SELECT json_agg(json_build_object(
                    'id', su.id, 'firstName', su.first_name, 'lastName', su.last_name,
                    'relationship', g.relationship, 'className', c.name) ORDER BY su.first_name)
                     FROM guardians g
                     JOIN users su ON su.id = g.student_id
                     JOIN students s ON s.user_id = g.student_id
                     LEFT JOIN classes c ON c.id = s.class_id
                    WHERE g.parent_id = u.id), '[]'::json) AS children
    FROM users u`;

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
    query<ParentListItem>(`${PARENT_SELECT} ${where} ${orderBy(req.query, {
      name: 'u.last_name', email: 'u.email', children: '(SELECT COUNT(*) FROM guardians g WHERE g.parent_id = u.id)', status: 'u.is_active',
    }, 'u.last_name, u.first_name', 'u.last_name, u.first_name')} LIMIT ${pageSize} OFFSET ${offset}`, params),
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
  const account = await transaction((db) => insertParent(db, body));
  await audit(req, { action: 'create', entity: 'parent', entityId: account.id, summary: `Registered parent ${body.firstName} ${body.lastName}`, details: { children: body.children?.length ?? 0 } });
  const payload: CreatedAccount<ParentListItem> = { record: (await loadParent(account.id))!, temporaryPassword: account.temporaryPassword };
  res.status(201).json(payload);
});

parentsRouter.patch('/:id', async (req, res) => {
  const parentId = intParam(req.params.id);
  const body = provided(parse(parentSchema.partial(), req.body), req.body);
  if (!(await loadParent(parentId))) throw notFound('Parent');
  await transaction((db) => patchParent(db, parentId, body));
  const updated = await loadParent(parentId);
  await audit(req, { action: 'update', entity: 'parent', entityId: parentId, summary: `Updated ${updated!.firstName} ${updated!.lastName}`, details: { fields: Object.keys(body) } });
  res.json(updated);
});

parentsRouter.delete('/:id', async (req, res) => {
  const row = await queryOne<{ name: string }>("DELETE FROM users WHERE id = $1 AND role = 'parent' RETURNING first_name || ' ' || last_name AS name", [intParam(req.params.id)]);
  if (!row) throw notFound('Parent');
  await audit(req, { action: 'delete', entity: 'parent', entityId: intParam(req.params.id), summary: `Deleted parent ${row.name}` });
  res.status(204).end();
});
