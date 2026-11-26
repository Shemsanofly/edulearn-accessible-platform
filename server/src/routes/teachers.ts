import { Router } from 'express';
import { z } from 'zod';
import type { Course, CreatedAccount, TeacherDetail, TeacherListItem } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { createUser, nextCode, updateUser } from '../lib/accounts.js';
import { audit } from '../lib/audit.js';
import { phone } from '../lib/phone.js';
import { PHOTO_URL } from '../lib/sql.js';
import { intParam, notFound, parse, provided } from '../lib/http.js';
import { COURSE_SELECT } from '../lib/sql.js';
import { email, isoDate, name, optionalText, password } from '../lib/validators.js';
import { requireRole } from '../middleware/auth.js';

export const teachersRouter = Router();

const TEACHER_SELECT = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active,
         t.employee_no, t.qualification, t.specialization, t.hired_on,
         (SELECT COUNT(*)::int FROM class_subjects cs WHERE cs.teacher_id = u.id) AS course_count,
         (SELECT string_agg(c.name, ', ' ORDER BY c.name) FROM classes c WHERE c.homeroom_teacher_id = u.id) AS homeroom_class,
         ${PHOTO_URL} AS photo_url
    FROM teachers t JOIN users u ON u.id = t.user_id`;

const teacherSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password: password.optional(),
  phone,
  employeeNo: z.string().trim().max(40).optional(),
  qualification: optionalText(120),
  specialization: optionalText(120),
  hiredOn: isoDate.optional(),
  isActive: z.boolean().optional(),
});

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
  const account = await transaction(async (db) => {
    const acc = await createUser(db, { ...body, role: 'teacher' });
    const employeeNo = body.employeeNo || (await nextCode(db, 'teachers', 'employee_no', 'TCH'));
    await query(
      `INSERT INTO teachers (user_id, employee_no, qualification, specialization, hired_on)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))`,
      [acc.id, employeeNo, body.qualification, body.specialization, body.hiredOn ?? null],
      db,
    );
    return acc;
  });
  await audit(req, { action: 'create', entity: 'teacher', entityId: account.id, summary: `Added teacher ${body.firstName} ${body.lastName}` });
  const payload: CreatedAccount<TeacherDetail> = { record: (await loadTeacher(account.id))!, temporaryPassword: account.temporaryPassword };
  res.status(201).json(payload);
});

teachersRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const body = provided(parse(teacherSchema.partial(), req.body), req.body);
  if (!(await queryOne('SELECT 1 FROM teachers WHERE user_id = $1', [id]))) throw notFound('Teacher');
  await transaction(async (db) => {
    await updateUser(db, id, body);
    await query(
      `UPDATE teachers SET
         employee_no = COALESCE($2, employee_no),
         qualification = CASE WHEN $3::boolean THEN $4 ELSE qualification END,
         specialization = CASE WHEN $5::boolean THEN $6 ELSE specialization END,
         hired_on = COALESCE($7::date, hired_on)
       WHERE user_id = $1`,
      [id, body.employeeNo || null, 'qualification' in body, body.qualification ?? null, 'specialization' in body,
        body.specialization ?? null, body.hiredOn ?? null],
      db,
    );
  });
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
