import { Router } from 'express';
import type { Course, CreatedAccount, TeacherDetail, TeacherListItem } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { insertTeacher, patchTeacher, teacherSchema } from '../lib/people.js';
import { audit } from '../lib/audit.js';
import { PHOTO_URL } from '../lib/sql.js';
import { intParam, notFound, parse, provided } from '../lib/http.js';
import { COURSE_SELECT } from '../lib/sql.js';
import { requireRole } from '../middleware/auth.js';

export const teachersRouter = Router();

const TEACHER_SELECT = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active,
         t.employee_no, t.qualification, t.specialization, t.hired_on,
         (SELECT COUNT(*)::int FROM class_subjects cs WHERE cs.teacher_id = u.id) AS course_count,
         (SELECT string_agg(c.name, ', ' ORDER BY c.name) FROM classes c WHERE c.homeroom_teacher_id = u.id) AS homeroom_class,
         ${PHOTO_URL} AS photo_url
    FROM teachers t JOIN users u ON u.id = t.user_id`;


// Any signed-in staff member can see the staff list (used in pickers); only admins change it.
teachersRouter.get('/', requireRole('admin', 'teacher'), async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const params: unknown[] = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE u.first_name || ' ' || u.last_name ILIKE $1 OR u.email ILIKE $1 OR t.employee_no ILIKE $1 OR t.specialization ILIKE $1`;
  }
  res.json(await query<TeacherListItem>(`${TEACHER_SELECT} ${where} ORDER BY u.last_name, u.first_name`, params));
});

async function loadTeacher(id: number): Promise<TeacherDetail | null> {
  const teacher = await queryOne<TeacherDetail>(`${TEACHER_SELECT} WHERE t.user_id = $1`, [id]);
  if (!teacher) return null;
  teacher.courses = await query<Course>(`${COURSE_SELECT} WHERE cs.teacher_id = $1 ORDER BY c.grade_level, c.name, sub.name`, [id]);
  return teacher;
}

teachersRouter.get('/:id', requireRole('admin', 'teacher'), async (req, res) => {
  const teacher = await loadTeacher(intParam(req.params.id));
  if (!teacher) throw notFound('Teacher');
  res.json(teacher);
});

teachersRouter.post('/', requireRole('admin'), async (req, res) => {
  const body = parse(teacherSchema, req.body);
  const account = await transaction((db) => insertTeacher(db, body));
  await audit(req, { action: 'create', entity: 'teacher', entityId: account.id, summary: `Added teacher ${body.firstName} ${body.lastName}` });
  const payload: CreatedAccount<TeacherDetail> = { record: (await loadTeacher(account.id))!, temporaryPassword: account.temporaryPassword };
  res.status(201).json(payload);
});

teachersRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const body = provided(parse(teacherSchema.partial(), req.body), req.body);
  if (!(await queryOne('SELECT 1 FROM teachers WHERE user_id = $1', [id]))) throw notFound('Teacher');
  await transaction((db) => patchTeacher(db, id, body));
  const updated = await loadTeacher(id);
  await audit(req, { action: 'update', entity: 'teacher', entityId: id, summary: `Updated ${updated!.firstName} ${updated!.lastName}`, details: { fields: Object.keys(body) } });
  res.json(updated);
});

teachersRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const row = await queryOne<{ name: string }>("DELETE FROM users WHERE id = $1 AND role = 'teacher' RETURNING first_name || ' ' || last_name AS name", [intParam(req.params.id)]);
  if (!row) throw notFound('Teacher');
  await audit(req, { action: 'delete', entity: 'teacher', entityId: intParam(req.params.id), summary: `Deleted teacher ${row.name}` });
  res.status(204).end();
});
