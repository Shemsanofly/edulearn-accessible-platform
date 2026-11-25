import { Router } from 'express';
import { z } from 'zod';
import type { ClassDetail, ClassListItem, Course, StudentListItem, Subject, Term, TimetableSlot } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanTakeAttendance, assertCanViewCourse } from '../lib/access.js';
import { badRequest, conflict, forbidden, intParam, notFound, parse, provided } from '../lib/http.js';
import { COURSE_SELECT, SLOT_SELECT, STUDENT_SELECT } from '../lib/sql.js';
import { id, isoDate, optionalText, time } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const academicsRouter = Router();
const adminOnly = requireRole('admin');

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------
const CLASS_SELECT = `
  SELECT c.id, c.name, c.grade_level, c.section, c.room, c.capacity, c.homeroom_teacher_id,
         CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS homeroom_teacher_name,
         (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id) AS student_count,
         (SELECT COUNT(*)::int FROM class_subjects cs WHERE cs.class_id = c.id) AS subject_count
    FROM classes c LEFT JOIN users t ON t.id = c.homeroom_teacher_id`;

const classSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(40),
  gradeLevel: z.coerce.number().int().min(1).max(13),
  section: z.string().trim().min(1).max(10).default('A'),
  room: optionalText(40),
  capacity: z.coerce.number().int().min(1).max(200).default(35),
  homeroomTeacherId: id.nullish(),
});

academicsRouter.get('/classes', async (req, res) => {
  const user = me(req);
  const params: unknown[] = [];
  let where = '';
  if (user.role === 'teacher' && req.query.mine === 'true') {
    params.push(user.id);
    where = `WHERE c.homeroom_teacher_id = $1 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1)`;
  } else if (user.role === 'student') {
    params.push(user.id);
    where = 'WHERE c.id = (SELECT class_id FROM students WHERE user_id = $1)';
  } else if (user.role === 'parent') {
    params.push(user.id);
    where = 'WHERE c.id IN (SELECT s.class_id FROM guardians g JOIN students s ON s.user_id = g.student_id WHERE g.parent_id = $1)';
  }
  res.json(await query<ClassListItem>(`${CLASS_SELECT} ${where} ORDER BY c.grade_level, c.name`, params));
});

academicsRouter.get('/classes/:id', requireRole('admin', 'teacher'), async (req, res) => {
  const classId = intParam(req.params.id);
  // Teachers can open the classes they teach (same rule as taking the register).
  if (me(req).role === 'teacher') await assertCanTakeAttendance(me(req), classId);
  const cls = await queryOne<ClassDetail>(`${CLASS_SELECT} WHERE c.id = $1`, [classId]);
  if (!cls) throw notFound('Class');
  [cls.students, cls.courses] = await Promise.all([
    query<StudentListItem>(`${STUDENT_SELECT} WHERE s.class_id = $1 ORDER BY u.last_name, u.first_name`, [classId]),
    query<Course>(`${COURSE_SELECT} WHERE cs.class_id = $1 ORDER BY sub.name`, [classId]),
  ]);
  res.json(cls);
});

academicsRouter.post('/classes', adminOnly, async (req, res) => {
  const b = parse(classSchema, req.body);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO classes (name, grade_level, section, room, capacity, homeroom_teacher_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [b.name, b.gradeLevel, b.section, b.room, b.capacity, b.homeroomTeacherId ?? null],
  );
  res.status(201).json(await queryOne<ClassListItem>(`${CLASS_SELECT} WHERE c.id = $1`, [row!.id]));
});

academicsRouter.patch('/classes/:id', adminOnly, async (req, res) => {
  const classId = intParam(req.params.id);
  const b = provided(parse(classSchema.partial(), req.body), req.body);
  const row = await queryOne(
    `UPDATE classes SET
       name = COALESCE($2, name), grade_level = COALESCE($3, grade_level), section = COALESCE($4, section),
       room = CASE WHEN $5::boolean THEN $6 ELSE room END, capacity = COALESCE($7, capacity),
       homeroom_teacher_id = CASE WHEN $8::boolean THEN $9 ELSE homeroom_teacher_id END
     WHERE id = $1 RETURNING id`,
    [classId, b.name ?? null, b.gradeLevel ?? null, b.section ?? null, 'room' in b, b.room ?? null,
      b.capacity ?? null, 'homeroomTeacherId' in b, b.homeroomTeacherId ?? null],
  );
  if (!row) throw notFound('Class');
  res.json(await queryOne<ClassListItem>(`${CLASS_SELECT} WHERE c.id = $1`, [classId]));
});

academicsRouter.delete('/classes/:id', adminOnly, async (req, res) => {
  const classId = intParam(req.params.id);
  const occupied = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1', [classId]);
  if (occupied && occupied.n > 0) {
    throw conflict(`This class still has ${occupied.n} student${occupied.n === 1 ? '' : 's'}. Move them to another class first.`);
  }
  const row = await queryOne('DELETE FROM classes WHERE id = $1 RETURNING id', [classId]);
  if (!row) throw notFound('Class');
  res.status(204).end();
});

/** Move several students into a class at once. */
academicsRouter.post('/classes/:id/students', adminOnly, async (req, res) => {
  const classId = intParam(req.params.id);
  const { studentIds } = parse(z.object({ studentIds: z.array(id).min(1).max(500) }), req.body);
  const cls = await queryOne<{ capacity: number; n: number }>(
    'SELECT capacity, (SELECT COUNT(*)::int FROM students WHERE class_id = $1 AND NOT (user_id = ANY($2))) AS n FROM classes WHERE id = $1',
    [classId, studentIds],
  );
  if (!cls) throw notFound('Class');
  if (cls.n + studentIds.length > cls.capacity) {
    throw conflict(`That would put ${cls.n + studentIds.length} students in a class with room for ${cls.capacity}`);
  }
  await query('UPDATE students SET class_id = $1 WHERE user_id = ANY($2)', [classId, studentIds]);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Courses (subject × class × teacher)
// ---------------------------------------------------------------------------
academicsRouter.get('/courses', async (req, res) => {
  const user = me(req);
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.query.classId) {
    params.push(intParam(req.query.classId, 'classId'));
    where.push(`cs.class_id = $${params.length}`);
  }
  if (user.role === 'teacher') {
    params.push(user.id);
    where.push(req.query.all === 'true'
      ? `(cs.teacher_id = $${params.length} OR c.homeroom_teacher_id = $${params.length})`
      : `cs.teacher_id = $${params.length}`);
  } else if (user.role === 'student') {
    params.push(user.id);
    where.push(`cs.class_id = (SELECT class_id FROM students WHERE user_id = $${params.length})`);
  } else if (user.role === 'parent') {
    params.push(user.id);
    where.push(`cs.class_id IN (SELECT s.class_id FROM guardians g JOIN students s ON s.user_id = g.student_id WHERE g.parent_id = $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(await query<Course>(`${COURSE_SELECT} ${whereSql} ORDER BY c.grade_level, c.name, sub.name`, params));
});

academicsRouter.get('/courses/:id', async (req, res) => {
  const courseId = intParam(req.params.id);
  await assertCanViewCourse(me(req), courseId);
  res.json(await queryOne<Course>(`${COURSE_SELECT} WHERE cs.id = $1`, [courseId]));
});

academicsRouter.post('/courses', adminOnly, async (req, res) => {
  const b = parse(z.object({ classId: id, subjectId: id, teacherId: id.nullish() }), req.body);
  const row = await queryOne<{ id: number }>(
    'INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ($1, $2, $3) RETURNING id',
    [b.classId, b.subjectId, b.teacherId ?? null],
  );
  res.status(201).json(await queryOne<Course>(`${COURSE_SELECT} WHERE cs.id = $1`, [row!.id]));
});

academicsRouter.patch('/courses/:id', adminOnly, async (req, res) => {
  const courseId = intParam(req.params.id);
  const b = parse(z.object({ teacherId: id.nullable() }), req.body);
  const row = await queryOne('UPDATE class_subjects SET teacher_id = $2 WHERE id = $1 RETURNING id', [courseId, b.teacherId]);
  if (!row) throw notFound('Course');
  res.json(await queryOne<Course>(`${COURSE_SELECT} WHERE cs.id = $1`, [courseId]));
});

academicsRouter.delete('/courses/:id', adminOnly, async (req, res) => {
  const row = await queryOne('DELETE FROM class_subjects WHERE id = $1 RETURNING id', [intParam(req.params.id)]);
  if (!row) throw notFound('Course');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------
const subjectSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(60),
  code: z.string().trim().toUpperCase().min(1, 'Required').max(12),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4361ee').default('#4361ee'),
  description: optionalText(300),
});

academicsRouter.get('/subjects', async (_req, res) => {
  res.json(await query<Subject>('SELECT id, name, code, color, description FROM subjects ORDER BY name'));
});

academicsRouter.post('/subjects', adminOnly, async (req, res) => {
  const b = parse(subjectSchema, req.body);
  res.status(201).json(await queryOne<Subject>(
    'INSERT INTO subjects (name, code, color, description) VALUES ($1, $2, $3, $4) RETURNING id, name, code, color, description',
    [b.name, b.code, b.color, b.description],
  ));
});

academicsRouter.patch('/subjects/:id', adminOnly, async (req, res) => {
  const b = provided(parse(subjectSchema.partial(), req.body), req.body);
  const row = await queryOne<Subject>(
    `UPDATE subjects SET name = COALESCE($2, name), code = COALESCE($3, code), color = COALESCE($4, color),
       description = CASE WHEN $5::boolean THEN $6 ELSE description END
     WHERE id = $1 RETURNING id, name, code, color, description`,
    [intParam(req.params.id), b.name ?? null, b.code ?? null, b.color ?? null, 'description' in b, b.description ?? null],
  );
  if (!row) throw notFound('Subject');
  res.json(row);
});

academicsRouter.delete('/subjects/:id', adminOnly, async (req, res) => {
  const subjectId = intParam(req.params.id);
  const used = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM class_subjects WHERE subject_id = $1', [subjectId]);
  if (used && used.n > 0) throw conflict(`This subject is taught in ${used.n} class${used.n === 1 ? '' : 'es'}. Remove it from those classes first.`);
  const row = await queryOne('DELETE FROM subjects WHERE id = $1 RETURNING id', [subjectId]);
  if (!row) throw notFound('Subject');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------
const termSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(60),
  startsOn: isoDate,
  endsOn: isoDate,
  isCurrent: z.boolean().default(false),
});
const TERM_COLS = 'id, name, starts_on, ends_on, is_current';

academicsRouter.get('/terms', async (_req, res) => {
  res.json(await query<Term>(`SELECT ${TERM_COLS} FROM terms ORDER BY starts_on DESC`));
});

academicsRouter.post('/terms', adminOnly, async (req, res) => {
  const b = parse(termSchema, req.body);
  if (b.endsOn <= b.startsOn) throw badRequest('The term must end after it starts', { endsOn: 'Must be after the start date' });
  const term = await transaction(async (db) => {
    if (b.isCurrent) await query('UPDATE terms SET is_current = false WHERE is_current', [], db);
    return queryOne<Term>(
      `INSERT INTO terms (name, starts_on, ends_on, is_current) VALUES ($1, $2, $3, $4) RETURNING ${TERM_COLS}`,
      [b.name, b.startsOn, b.endsOn, b.isCurrent],
      db,
    );
  });
  res.status(201).json(term);
});

academicsRouter.patch('/terms/:id', adminOnly, async (req, res) => {
  const termId = intParam(req.params.id);
  const b = provided(parse(termSchema.partial(), req.body), req.body);
  const term = await transaction(async (db) => {
    if (b.isCurrent) await query('UPDATE terms SET is_current = false WHERE is_current AND id <> $1', [termId], db);
    return queryOne<Term>(
      `UPDATE terms SET name = COALESCE($2, name), starts_on = COALESCE($3, starts_on), ends_on = COALESCE($4, ends_on),
         is_current = COALESCE($5, is_current) WHERE id = $1 RETURNING ${TERM_COLS}`,
      [termId, b.name ?? null, b.startsOn ?? null, b.endsOn ?? null, b.isCurrent ?? null],
      db,
    );
  });
  if (!term) throw notFound('Term');
  res.json(term);
});

academicsRouter.delete('/terms/:id', adminOnly, async (req, res) => {
  const row = await queryOne('DELETE FROM terms WHERE id = $1 RETURNING id', [intParam(req.params.id)]);
  if (!row) throw notFound('Term');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------
academicsRouter.get('/timetable', async (req, res) => {
  const user = me(req);
  const params: unknown[] = [];
  let where: string;
  if (req.query.classId) {
    const classId = intParam(req.query.classId, 'classId');
    if (user.role === 'student') {
      const own = await queryOne('SELECT 1 FROM students WHERE user_id = $1 AND class_id = $2', [user.id, classId]);
      if (!own) throw forbidden();
    } else if (user.role === 'parent') {
      const own = await queryOne(
        'SELECT 1 FROM guardians g JOIN students s ON s.user_id = g.student_id WHERE g.parent_id = $1 AND s.class_id = $2',
        [user.id, classId],
      );
      if (!own) throw forbidden();
    }
    params.push(classId);
    where = 'c.id = $1';
  } else if (req.query.teacherId && (user.role === 'admin' || user.role === 'teacher')) {
    params.push(intParam(req.query.teacherId, 'teacherId'));
    where = 'cs.teacher_id = $1';
  } else if (user.role === 'teacher') {
    params.push(user.id);
    where = 'cs.teacher_id = $1';
  } else if (user.role === 'student') {
    params.push(user.id);
    where = 'c.id = (SELECT class_id FROM students WHERE user_id = $1)';
  } else {
    throw badRequest('Choose a class or teacher to view a timetable');
  }
  res.json(await query<TimetableSlot>(`${SLOT_SELECT} WHERE ${where} ORDER BY ts.day_of_week, ts.starts_at`, params));
});

const slotSchema = z.object({
  courseId: id,
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  startsAt: time,
  endsAt: time,
  room: optionalText(40),
});

/** Reject a slot if the class, the teacher or the room is already busy at that time. */
async function assertNoClash(slot: z.infer<typeof slotSchema>, ignoreId: number | null) {
  if (slot.endsAt <= slot.startsAt) throw badRequest('The lesson must end after it starts', { endsAt: 'Must be after the start time' });
  const course = await queryOne<{ classId: number; teacherId: number | null; room: string | null }>(
    'SELECT cs.class_id, cs.teacher_id, c.room FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE cs.id = $1',
    [slot.courseId],
  );
  if (!course) throw notFound('Course');
  const room = slot.room ?? course.room;
  const clash = await queryOne<{ className: string; subjectName: string; teacherName: string | null; startsAt: string; endsAt: string; reason: string }>(
    `SELECT x.class_name, x.subject_name, x.teacher_name, x.starts_at, x.ends_at,
            CASE WHEN x.class_id = $4 THEN 'class' WHEN x.teacher_id = $5 THEN 'teacher' ELSE 'room' END AS reason
       FROM (${SLOT_SELECT}) x
      WHERE x.day_of_week = $1 AND x.starts_at < $3 AND x.ends_at > $2
        AND ($6::int IS NULL OR x.id <> $6)
        AND (x.class_id = $4 OR (x.teacher_id IS NOT NULL AND x.teacher_id = $5) OR ($7::text IS NOT NULL AND x.room = $7))
      LIMIT 1`,
    [slot.dayOfWeek, slot.startsAt.slice(0, 5), slot.endsAt.slice(0, 5), course.classId, course.teacherId, ignoreId, room],
  );
  if (clash) {
    const who = clash.reason === 'class' ? `${clash.className} already has ${clash.subjectName}`
      : clash.reason === 'teacher' ? `${clash.teacherName} is already teaching ${clash.className}`
      : `Room ${room} is already used by ${clash.className}`;
    throw conflict(`Time clash: ${who} from ${clash.startsAt} to ${clash.endsAt}`);
  }
}

academicsRouter.post('/timetable', adminOnly, async (req, res) => {
  const b = parse(slotSchema, req.body);
  await assertNoClash(b, null);
  const row = await queryOne<{ id: number }>(
    'INSERT INTO timetable_slots (class_subject_id, day_of_week, starts_at, ends_at, room) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [b.courseId, b.dayOfWeek, b.startsAt, b.endsAt, b.room],
  );
  res.status(201).json(await queryOne<TimetableSlot>(`${SLOT_SELECT} WHERE ts.id = $1`, [row!.id]));
});

academicsRouter.put('/timetable/:id', adminOnly, async (req, res) => {
  const slotId = intParam(req.params.id);
  const b = parse(slotSchema, req.body);
  await assertNoClash(b, slotId);
  const row = await queryOne(
    'UPDATE timetable_slots SET class_subject_id = $2, day_of_week = $3, starts_at = $4, ends_at = $5, room = $6 WHERE id = $1 RETURNING id',
    [slotId, b.courseId, b.dayOfWeek, b.startsAt, b.endsAt, b.room],
  );
  if (!row) throw notFound('Lesson');
  res.json(await queryOne<TimetableSlot>(`${SLOT_SELECT} WHERE ts.id = $1`, [slotId]));
});

academicsRouter.delete('/timetable/:id', adminOnly, async (req, res) => {
  const row = await queryOne('DELETE FROM timetable_slots WHERE id = $1 RETURNING id', [intParam(req.params.id)]);
  if (!row) throw notFound('Lesson');
  res.status(204).end();
});
