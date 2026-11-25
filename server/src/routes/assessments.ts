import { Router } from 'express';
import { z } from 'zod';
import type { Assessment, Course, Gradebook, GradebookRow } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanManageCourse, assertCanViewCourse } from '../lib/access.js';
import { badRequest, intParam, notFound, parse, provided } from '../lib/http.js';
import { ASSESSMENT_SELECT, COURSE_SELECT } from '../lib/sql.js';
import { id, isoDate, optionalText } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const assessmentsRouter = Router();
assessmentsRouter.use(requireRole('admin', 'teacher'));

const assessmentSchema = z.object({
  courseId: id,
  termId: id.nullish(),
  title: z.string().trim().min(1, 'Required').max(120),
  description: optionalText(2000),
  type: z.enum(['assignment', 'quiz', 'test', 'exam', 'project']),
  maxScore: z.coerce.number().positive('Must be more than 0').max(10000),
  dueDate: isoDate.nullish(),
});

assessmentsRouter.get('/', async (req, res) => {
  const user = me(req);
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.query.courseId) {
    const courseId = intParam(req.query.courseId, 'courseId');
    await assertCanViewCourse(user, courseId);
    params.push(courseId);
    where.push(`a.class_subject_id = $${params.length}`);
  } else if (user.role === 'teacher') {
    params.push(user.id);
    where.push(`cs.teacher_id = $${params.length}`);
  }
  if (req.query.pending === 'true') {
    where.push(`(SELECT COUNT(*) FROM grades g WHERE g.assessment_id = a.id) < (SELECT COUNT(*) FROM students st WHERE st.class_id = cs.class_id)`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(await query<Assessment>(`${ASSESSMENT_SELECT} ${whereSql} ORDER BY a.due_date DESC NULLS LAST, a.id DESC LIMIT 200`, params));
});

const loadAssessment = (assessmentId: number) => queryOne<Assessment>(`${ASSESSMENT_SELECT} WHERE a.id = $1`, [assessmentId]);

assessmentsRouter.post('/', async (req, res) => {
  const b = parse(assessmentSchema, req.body);
  const user = me(req);
  await assertCanManageCourse(user, b.courseId);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO assessments (class_subject_id, term_id, title, description, type, max_score, due_date, created_by)
     VALUES ($1, COALESCE($2, (SELECT id FROM terms WHERE is_current)), $3, $4, $5, $6, $7, $8) RETURNING id`,
    [b.courseId, b.termId ?? null, b.title, b.description, b.type, b.maxScore, b.dueDate ?? null, user.id],
  );
  res.status(201).json(await loadAssessment(row!.id));
});

async function courseOf(assessmentId: number) {
  const row = await queryOne<{ courseId: number; maxScore: number }>(
    'SELECT class_subject_id AS course_id, max_score FROM assessments WHERE id = $1',
    [assessmentId],
  );
  if (!row) throw notFound('Assessment');
  return row;
}

assessmentsRouter.patch('/:id', async (req, res) => {
  const assessmentId = intParam(req.params.id);
  const { courseId } = await courseOf(assessmentId);
  await assertCanManageCourse(me(req), courseId);
  const b = provided(parse(assessmentSchema.omit({ courseId: true }).partial(), req.body), req.body);
  if (b.maxScore !== undefined) {
    const top = await queryOne<{ max: number | null }>('SELECT MAX(score) AS max FROM grades WHERE assessment_id = $1', [assessmentId]);
    if (top?.max != null && top.max > b.maxScore) {
      throw badRequest(`A student already scored ${top.max}, so the maximum can't be lower than that`, { maxScore: `At least ${top.max}` });
    }
  }
  await query(
    `UPDATE assessments SET
       title = COALESCE($2, title), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
       type = COALESCE($5, type), max_score = COALESCE($6, max_score),
       due_date = CASE WHEN $7::boolean THEN $8::date ELSE due_date END,
       term_id = CASE WHEN $9::boolean THEN $10 ELSE term_id END
     WHERE id = $1`,
    [assessmentId, b.title ?? null, 'description' in b, b.description ?? null, b.type ?? null, b.maxScore ?? null,
      'dueDate' in b, b.dueDate ?? null, 'termId' in b, b.termId ?? null],
  );
  res.json(await loadAssessment(assessmentId));
});

assessmentsRouter.delete('/:id', async (req, res) => {
  const assessmentId = intParam(req.params.id);
  const { courseId } = await courseOf(assessmentId);
  await assertCanManageCourse(me(req), courseId);
  await query('DELETE FROM assessments WHERE id = $1', [assessmentId]);
  res.status(204).end();
});

/** Save many scores at once. A null score clears that student's grade. */
assessmentsRouter.put('/:id/grades', async (req, res) => {
  const assessmentId = intParam(req.params.id);
  const { courseId, maxScore } = await courseOf(assessmentId);
  const user = me(req);
  await assertCanManageCourse(user, courseId);
  const { grades } = parse(
    z.object({
      grades: z.array(z.object({
        studentId: id,
        score: z.number().min(0, "Scores can't be negative").nullable(),
        feedback: z.string().trim().max(1000).nullish(),
      })).max(300),
    }),
    req.body,
  );
  const over = grades.find((g) => g.score !== null && g.score > maxScore);
  if (over) throw badRequest(`Scores can't be higher than the maximum of ${maxScore}`);

  await transaction(async (db) => {
    const members = await query<{ userId: number }>(
      'SELECT s.user_id FROM students s JOIN class_subjects cs ON cs.class_id = s.class_id WHERE cs.id = $1',
      [courseId],
      db,
    );
    const allowed = new Set(members.map((m) => m.userId));
    if (grades.some((g) => !allowed.has(g.studentId))) throw badRequest('One of the students is not in this class');
    for (const g of grades) {
      if (g.score === null) {
        await query('DELETE FROM grades WHERE assessment_id = $1 AND student_id = $2', [assessmentId, g.studentId], db);
      } else {
        await query(
          `INSERT INTO grades (assessment_id, student_id, score, feedback, graded_by) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (assessment_id, student_id) DO UPDATE
             SET score = EXCLUDED.score, feedback = EXCLUDED.feedback, graded_by = EXCLUDED.graded_by, graded_at = now()`,
          [assessmentId, g.studentId, g.score, g.feedback || null, user.id],
          db,
        );
      }
    }
  });
  res.json(await loadAssessment(assessmentId));
});

export const gradebookRouter = Router();
gradebookRouter.use(requireRole('admin', 'teacher'));

gradebookRouter.get('/:courseId', async (req, res) => {
  const courseId = intParam(req.params.courseId, 'courseId');
  await assertCanViewCourse(me(req), courseId);
  const course = (await queryOne<Course>(`${COURSE_SELECT} WHERE cs.id = $1`, [courseId]))!;
  const [assessments, students, grades] = await Promise.all([
    query<Assessment>(`${ASSESSMENT_SELECT} WHERE a.class_subject_id = $1 ORDER BY a.due_date NULLS LAST, a.id`, [courseId]),
    query<{ id: number; firstName: string; lastName: string; admissionNo: string }>(
      `SELECT u.id, u.first_name, u.last_name, s.admission_no FROM students s JOIN users u ON u.id = s.user_id
        WHERE s.class_id = $1 ORDER BY u.last_name, u.first_name`,
      [course.classId],
    ),
    query<{ assessmentId: number; studentId: number; score: number }>(
      'SELECT g.assessment_id, g.student_id, g.score FROM grades g JOIN assessments a ON a.id = g.assessment_id WHERE a.class_subject_id = $1',
      [courseId],
    ),
  ]);
  const maxById = new Map(assessments.map((a) => [a.id, a.maxScore]));
  const byStudent = new Map<number, Map<number, number>>();
  for (const g of grades) {
    if (!byStudent.has(g.studentId)) byStudent.set(g.studentId, new Map());
    byStudent.get(g.studentId)!.set(g.assessmentId, g.score);
  }
  const rows: GradebookRow[] = students.map((s) => {
    const mine = byStudent.get(s.id) ?? new Map<number, number>();
    const scores: Record<number, number | null> = {};
    const percents: number[] = [];
    for (const a of assessments) {
      const score = mine.get(a.id) ?? null;
      scores[a.id] = score;
      if (score !== null) percents.push((score / maxById.get(a.id)!) * 100);
    }
    const averagePercent = percents.length ? Math.round((percents.reduce((x, y) => x + y, 0) / percents.length) * 10) / 10 : null;
    return { ...s, scores, averagePercent };
  });
  const gradebook: Gradebook = { course, assessments, rows };
  res.json(gradebook);
});
