import { Router } from 'express';
import { z } from 'zod';
import type {
  AcademicYear, AttendanceSummary, ClassPerformance, Exam, ExamDetail, ExamPaper, GradeBand, GradingScale,
  ReportCard, ReportCardSubject, ReportCardSummary, StudentListItem,
} from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanViewStudent } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { bandFor, checkBands, loadScale } from '../lib/grading.js';
import { badRequest, conflict, forbidden, intParam, notFound, parse, provided } from '../lib/http.js';
import { notifyWhere } from '../lib/notify.js';
import { loadSettings } from '../lib/settings.js';
import { STUDENT_SELECT } from '../lib/sql.js';
import { id, isoDate, optionalText } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const examsRouter = Router();
const adminOnly = requireRole('admin');

// ---------------------------------------------------------------------------
// Academic years
// ---------------------------------------------------------------------------
const yearSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(40),
  startsOn: isoDate,
  endsOn: isoDate,
  isCurrent: z.boolean().default(false),
});
const YEAR_SELECT = `SELECT ay.id, ay.name, ay.starts_on, ay.ends_on, ay.is_current,
  (SELECT COUNT(*)::int FROM terms t WHERE t.academic_year_id = ay.id) AS term_count FROM academic_years ay`;

examsRouter.get('/academic-years', async (_req, res) => {
  res.json(await query<AcademicYear>(`${YEAR_SELECT} ORDER BY ay.starts_on DESC`));
});

examsRouter.post('/academic-years', adminOnly, async (req, res) => {
  const b = parse(yearSchema, req.body);
  if (b.endsOn <= b.startsOn) throw badRequest('The year must end after it starts', { endsOn: 'Must be after the start date' });
  const row = await transaction(async (db) => {
    if (b.isCurrent) await query('UPDATE academic_years SET is_current = false WHERE is_current', [], db);
    return queryOne<{ id: number }>(
      'INSERT INTO academic_years (name, starts_on, ends_on, is_current) VALUES ($1, $2, $3, $4) RETURNING id',
      [b.name, b.startsOn, b.endsOn, b.isCurrent],
      db,
    );
  });
  await audit(req, { action: 'create', entity: 'academic_year', entityId: row!.id, summary: `Created academic year ${b.name}` });
  res.status(201).json(await queryOne<AcademicYear>(`${YEAR_SELECT} WHERE ay.id = $1`, [row!.id]));
});

examsRouter.patch('/academic-years/:id', adminOnly, async (req, res) => {
  const yearId = intParam(req.params.id);
  const b = provided(parse(yearSchema.partial(), req.body), req.body);
  await transaction(async (db) => {
    if (b.isCurrent) await query('UPDATE academic_years SET is_current = false WHERE is_current AND id <> $1', [yearId], db);
    const row = await queryOne(
      `UPDATE academic_years SET name = COALESCE($2, name), starts_on = COALESCE($3, starts_on), ends_on = COALESCE($4, ends_on),
         is_current = COALESCE($5, is_current) WHERE id = $1 RETURNING id`,
      [yearId, b.name ?? null, b.startsOn ?? null, b.endsOn ?? null, b.isCurrent ?? null],
      db,
    );
    if (!row) throw notFound('Academic year');
  });
  await audit(req, { action: 'update', entity: 'academic_year', entityId: yearId, summary: `Updated academic year`, details: b });
  res.json(await queryOne<AcademicYear>(`${YEAR_SELECT} WHERE ay.id = $1`, [yearId]));
});

examsRouter.delete('/academic-years/:id', adminOnly, async (req, res) => {
  const row = await queryOne<{ name: string }>('DELETE FROM academic_years WHERE id = $1 RETURNING name', [intParam(req.params.id)]);
  if (!row) throw notFound('Academic year');
  await audit(req, { action: 'delete', entity: 'academic_year', entityId: intParam(req.params.id), summary: `Deleted academic year ${row.name}` });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Grading scales
// ---------------------------------------------------------------------------
const bandSchema = z.object({
  grade: z.string().trim().min(1).max(4),
  minPercent: z.coerce.number().min(0).max(100),
  maxPercent: z.coerce.number().min(0).max(100),
  points: z.coerce.number().min(0).max(100).nullish().transform((v) => v ?? null),
  remark: optionalText(60),
});
const scaleSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(60),
  description: optionalText(300),
  isDefault: z.boolean().default(false),
  bands: z.array(bandSchema).min(1).max(15),
});

async function allScales(): Promise<GradingScale[]> {
  const scales = await query<Omit<GradingScale, 'bands'>>('SELECT id, name, description, is_default FROM grading_scales ORDER BY is_default DESC, name');
  const bands = await query<GradeBand & { scaleId: number }>(
    'SELECT scale_id, grade, min_percent, max_percent, points, remark FROM grade_bands ORDER BY min_percent DESC',
  );
  return scales.map((s) => ({ ...s, bands: bands.filter((b) => b.scaleId === s.id).map(({ scaleId: _s, ...b }) => b) }));
}

examsRouter.get('/grading-scales', async (_req, res) => {
  res.json(await allScales());
});

async function saveScale(scaleId: number | null, b: z.infer<typeof scaleSchema>) {
  const problem = checkBands(b.bands);
  if (problem) throw badRequest(problem, { bands: problem });
  return transaction(async (db) => {
    if (b.isDefault) await query('UPDATE grading_scales SET is_default = false WHERE is_default', [], db);
    let idOut = scaleId;
    if (scaleId) {
      const row = await queryOne('UPDATE grading_scales SET name = $2, description = $3, is_default = $4 OR is_default WHERE id = $1 RETURNING id', [scaleId, b.name, b.description, b.isDefault], db);
      if (!row) throw notFound('Grading scale');
      await query('DELETE FROM grade_bands WHERE scale_id = $1', [scaleId], db);
    } else {
      const anyDefault = await queryOne('SELECT 1 FROM grading_scales WHERE is_default', [], db);
      const row = await queryOne<{ id: number }>(
        'INSERT INTO grading_scales (name, description, is_default) VALUES ($1, $2, $3) RETURNING id',
        [b.name, b.description, b.isDefault || !anyDefault],
        db,
      );
      idOut = row!.id;
    }
    for (const band of b.bands) {
      await query(
        'INSERT INTO grade_bands (scale_id, grade, min_percent, max_percent, points, remark) VALUES ($1, $2, $3, $4, $5, $6)',
        [idOut, band.grade.toUpperCase(), band.minPercent, band.maxPercent, band.points, band.remark],
        db,
      );
    }
    return idOut!;
  });
}

examsRouter.post('/grading-scales', adminOnly, async (req, res) => {
  const b = parse(scaleSchema, req.body);
  const scaleId = await saveScale(null, b);
  await audit(req, { action: 'create', entity: 'grading_scale', entityId: scaleId, summary: `Created grading scale ${b.name}` });
  res.status(201).json(await loadScale(scaleId));
});

examsRouter.put('/grading-scales/:id', adminOnly, async (req, res) => {
  const b = parse(scaleSchema, req.body);
  const scaleId = await saveScale(intParam(req.params.id), b);
  await audit(req, { action: 'update', entity: 'grading_scale', entityId: scaleId, summary: `Updated grading scale ${b.name}` });
  res.json(await loadScale(scaleId));
});

examsRouter.delete('/grading-scales/:id', adminOnly, async (req, res) => {
  const scaleId = intParam(req.params.id);
  const scale = await queryOne<{ name: string; isDefault: boolean }>('SELECT name, is_default FROM grading_scales WHERE id = $1', [scaleId]);
  if (!scale) throw notFound('Grading scale');
  if (scale.isDefault) throw conflict('Make another scale the default before deleting this one');
  await query('DELETE FROM grading_scales WHERE id = $1', [scaleId]);
  await audit(req, { action: 'delete', entity: 'grading_scale', entityId: scaleId, summary: `Deleted grading scale ${scale.name}` });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------
const EXAM_SELECT = `
  SELECT e.id, e.name, e.term_id, t.name AS term_name, e.grading_scale_id, gs.name AS grading_scale_name,
         e.starts_on, e.ends_on, e.max_marks, e.published_at,
         COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.grade_level, c.name)
                     FROM exam_classes ec JOIN classes c ON c.id = ec.class_id WHERE ec.exam_id = e.id), '[]'::json) AS classes,
         (SELECT COUNT(*)::int FROM grades g JOIN assessments a ON a.id = g.assessment_id WHERE a.exam_id = e.id) AS marks_entered,
         (SELECT COALESCE(SUM((SELECT COUNT(*) FROM students st WHERE st.class_id = cs.class_id)), 0)::int
            FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id WHERE a.exam_id = e.id) AS marks_expected
    FROM exams e
    LEFT JOIN terms t ON t.id = e.term_id
    LEFT JOIN grading_scales gs ON gs.id = e.grading_scale_id`;

const examSchema = z.object({
  name: z.string().trim().min(2, 'Required').max(120),
  termId: id.nullish(),
  gradingScaleId: id.nullish(),
  startsOn: isoDate,
  endsOn: isoDate,
  maxMarks: z.coerce.number().positive().max(1000).default(100),
  classIds: z.array(id).min(1, 'Choose at least one class').max(100),
});

/** Teachers see exams for classes they teach; students and parents only published ones for their classes. */
function examScope(role: string): string {
  switch (role) {
    case 'admin':
      return 'true';
    case 'teacher':
      return `EXISTS (SELECT 1 FROM exam_classes ec JOIN class_subjects cs ON cs.class_id = ec.class_id
                       LEFT JOIN classes c ON c.id = ec.class_id
                      WHERE ec.exam_id = e.id AND (cs.teacher_id = $1 OR c.homeroom_teacher_id = $1))`;
    case 'student':
      return `e.published_at IS NOT NULL AND EXISTS (SELECT 1 FROM exam_classes ec JOIN students s ON s.class_id = ec.class_id WHERE ec.exam_id = e.id AND s.user_id = $1)`;
    default:
      return `e.published_at IS NOT NULL AND EXISTS (SELECT 1 FROM exam_classes ec JOIN students s ON s.class_id = ec.class_id
                JOIN guardians g ON g.student_id = s.user_id WHERE ec.exam_id = e.id AND g.parent_id = $1)`;
  }
}

examsRouter.get('/exams', async (req, res) => {
  const user = me(req);
  res.json(await query<Exam>(`${EXAM_SELECT} WHERE ($1::int IS NOT NULL) AND ${examScope(user.role)} ORDER BY e.starts_on DESC, e.id DESC`, [user.id]));
});

async function loadExam(examId: number) {
  const exam = await queryOne<Exam>(`${EXAM_SELECT} WHERE e.id = $1`, [examId]);
  if (!exam) throw notFound('Exam');
  return exam;
}

/** Make sure every course in the exam's classes has an exam paper (assessment). */
async function syncPapers(db: Parameters<Parameters<typeof transaction>[0]>[0], examId: number, userId: number) {
  await query(
    `INSERT INTO assessments (class_subject_id, term_id, title, description, type, max_score, due_date, created_by, exam_id)
     SELECT cs.id, e.term_id, sub.name || ': ' || e.name, 'Examination paper', 'exam', e.max_marks, e.ends_on, $2, e.id
       FROM exams e
       JOIN exam_classes ec ON ec.exam_id = e.id
       JOIN class_subjects cs ON cs.class_id = ec.class_id
       JOIN subjects sub ON sub.id = cs.subject_id
      WHERE e.id = $1
     ON CONFLICT (exam_id, class_subject_id) WHERE exam_id IS NOT NULL DO NOTHING`,
    [examId, userId],
    db,
  );
  // Papers for classes removed from the exam go — but only if nothing has been marked yet.
  await query(
    `DELETE FROM assessments a USING class_subjects cs
      WHERE a.class_subject_id = cs.id AND a.exam_id = $1
        AND NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id = $1 AND ec.class_id = cs.class_id)
        AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.assessment_id = a.id)`,
    [examId],
    db,
  );
}

examsRouter.post('/exams', adminOnly, async (req, res) => {
  const b = parse(examSchema, req.body);
  if (b.endsOn < b.startsOn) throw badRequest('The exam must end on or after its start date', { endsOn: 'Must be on or after the start date' });
  const examId = await transaction(async (db) => {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO exams (name, term_id, grading_scale_id, starts_on, ends_on, max_marks, created_by)
       VALUES ($1, COALESCE($2, (SELECT id FROM terms WHERE is_current)), COALESCE($3, (SELECT id FROM grading_scales WHERE is_default)), $4, $5, $6, $7)
       RETURNING id`,
      [b.name, b.termId ?? null, b.gradingScaleId ?? null, b.startsOn, b.endsOn, b.maxMarks, me(req).id],
      db,
    );
    for (const classId of b.classIds) {
      await query('INSERT INTO exam_classes (exam_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row!.id, classId], db);
    }
    await syncPapers(db, row!.id, me(req).id);
    return row!.id;
  });
  await audit(req, { action: 'create', entity: 'exam', entityId: examId, summary: `Created exam ${b.name}` });
  res.status(201).json(await loadExam(examId));
});

examsRouter.patch('/exams/:id', adminOnly, async (req, res) => {
  const examId = intParam(req.params.id);
  const b = provided(parse(examSchema.partial(), req.body), req.body);
  await loadExam(examId);
  await transaction(async (db) => {
    await query(
      `UPDATE exams SET name = COALESCE($2, name), term_id = CASE WHEN $3::boolean THEN $4 ELSE term_id END,
         grading_scale_id = CASE WHEN $5::boolean THEN $6 ELSE grading_scale_id END,
         starts_on = COALESCE($7, starts_on), ends_on = COALESCE($8, ends_on), max_marks = COALESCE($9, max_marks)
       WHERE id = $1`,
      [examId, b.name ?? null, 'termId' in b, b.termId ?? null, 'gradingScaleId' in b, b.gradingScaleId ?? null,
        b.startsOn ?? null, b.endsOn ?? null, b.maxMarks ?? null],
      db,
    );
    if (b.maxMarks !== undefined) {
      const top = await queryOne<{ max: number | null }>(
        'SELECT MAX(g.score) AS max FROM grades g JOIN assessments a ON a.id = g.assessment_id WHERE a.exam_id = $1',
        [examId],
        db,
      );
      if (top?.max != null && top.max > b.maxMarks) throw badRequest(`A student already scored ${top.max}, so the maximum can't be lower`);
      await query('UPDATE assessments SET max_score = $2 WHERE exam_id = $1', [examId, b.maxMarks], db);
    }
    if (b.classIds) {
      await query('DELETE FROM exam_classes WHERE exam_id = $1 AND NOT (class_id = ANY($2))', [examId, b.classIds], db);
      for (const classId of b.classIds) {
        await query('INSERT INTO exam_classes (exam_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [examId, classId], db);
      }
      await syncPapers(db, examId, me(req).id);
    }
  });
  await audit(req, { action: 'update', entity: 'exam', entityId: examId, summary: `Updated exam`, details: { fields: Object.keys(b) } });
  res.json(await loadExam(examId));
});

examsRouter.delete('/exams/:id', adminOnly, async (req, res) => {
  const examId = intParam(req.params.id);
  const exam = await loadExam(examId);
  if (exam.marksEntered > 0 && req.query.force !== 'true') {
    throw conflict(`${exam.marksEntered} marks have been entered for this exam. Deleting it removes them too.`);
  }
  await query('DELETE FROM exams WHERE id = $1', [examId]);
  await audit(req, { action: 'delete', entity: 'exam', entityId: examId, summary: `Deleted exam ${exam.name}`, details: { marksEntered: exam.marksEntered } });
  res.status(204).end();
});

examsRouter.get('/exams/:id', requireRole('admin', 'teacher'), async (req, res) => {
  const examId = intParam(req.params.id);
  const user = me(req);
  const visible = await queryOne(`SELECT 1 FROM exams e WHERE e.id = $2 AND ($1::int IS NOT NULL) AND ${examScope(user.role)}`, [user.id, examId]);
  if (!visible) throw notFound('Exam');
  const exam = await loadExam(examId);
  const papers = await query<ExamPaper>(
    `SELECT a.id AS assessment_id, cs.id AS course_id, c.id AS class_id, c.name AS class_name, sub.name AS subject_name, sub.color,
            CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacher_name,
            (SELECT COUNT(*)::int FROM grades g WHERE g.assessment_id = a.id) AS graded,
            (SELECT COUNT(*)::int FROM students st WHERE st.class_id = c.id) AS students,
            (SELECT ROUND(AVG(g.score / a.max_score * 100), 1) FROM grades g WHERE g.assessment_id = a.id) AS average_percent
       FROM assessments a
       JOIN class_subjects cs ON cs.id = a.class_subject_id
       JOIN classes c ON c.id = cs.class_id
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN users t ON t.id = cs.teacher_id
      WHERE a.exam_id = $1 ${user.role === 'teacher' ? 'AND (cs.teacher_id = $2 OR c.homeroom_teacher_id = $2)' : ''}
      ORDER BY c.grade_level, c.name, sub.name`,
    user.role === 'teacher' ? [examId, user.id] : [examId],
  );
  res.json({ ...exam, papers } satisfies ExamDetail);
});

examsRouter.post('/exams/:id/publish', adminOnly, async (req, res) => {
  const examId = intParam(req.params.id);
  const exam = await loadExam(examId);
  const publish = req.body?.publish !== false;
  await query('UPDATE exams SET published_at = CASE WHEN $2 THEN COALESCE(published_at, now()) ELSE NULL END WHERE id = $1', [examId, publish]);
  if (publish && !exam.publishedAt) {
    // Tell students and their parents that results are ready.
    const audience = `SELECT s.user_id AS id FROM students s JOIN exam_classes ec ON ec.class_id = s.class_id WHERE ec.exam_id = $1
                      UNION SELECT g.parent_id FROM guardians g JOIN students s ON s.user_id = g.student_id
                       JOIN exam_classes ec ON ec.class_id = s.class_id WHERE ec.exam_id = $1`;
    await notifyWhere(audience, [examId], {
      type: 'results',
      title: `${exam.name} results are out`,
      body: 'Report cards are now available.',
      link: `/report-cards?exam=${examId}`,
    });
  }
  await audit(req, { action: publish ? 'publish' : 'unpublish', entity: 'exam', entityId: examId, summary: `${publish ? 'Published' : 'Unpublished'} results for ${exam.name}` });
  res.json(await loadExam(examId));
});

// ---------------------------------------------------------------------------
// Results: class performance and report cards
// ---------------------------------------------------------------------------
interface MarkRow { studentId: number; subjectName: string; color: string; score: number; maxScore: number }

/** Marks for every student in a class for one exam, plus each student's ranking. */
async function classResults(examId: number, classId: number, bands: GradeBand[]) {
  const [students, marks, subjects] = await Promise.all([
    query<{ id: number; firstName: string; lastName: string; admissionNo: string }>(
      `SELECT u.id, u.first_name, u.last_name, s.admission_no FROM students s JOIN users u ON u.id = s.user_id
        WHERE s.class_id = $1 ORDER BY u.last_name, u.first_name`,
      [classId],
    ),
    query<MarkRow>(
      `SELECT g.student_id, sub.name AS subject_name, sub.color, g.score, a.max_score
         FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id JOIN subjects sub ON sub.id = cs.subject_id
         JOIN grades g ON g.assessment_id = a.id
        WHERE a.exam_id = $1 AND cs.class_id = $2`,
      [examId, classId],
    ),
    query<{ subjectName: string; color: string }>(
      `SELECT sub.name AS subject_name, sub.color FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id
         JOIN subjects sub ON sub.id = cs.subject_id WHERE a.exam_id = $1 AND cs.class_id = $2 ORDER BY sub.name`,
      [examId, classId],
    ),
  ]);
  const byStudent = new Map<number, MarkRow[]>();
  for (const m of marks) byStudent.set(m.studentId, [...(byStudent.get(m.studentId) ?? []), m]);
  const rows = students.map((s) => {
    const mine = byStudent.get(s.id) ?? [];
    const total = mine.reduce((sum, m) => sum + m.score, 0);
    const averagePercent = mine.length ? Math.round((mine.reduce((sum, m) => sum + (m.score / m.maxScore) * 100, 0) / mine.length) * 10) / 10 : null;
    return {
      studentId: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, total, averagePercent,
      grade: bandFor(averagePercent, bands)?.grade ?? null, subjectsGraded: mine.length, position: 0,
    };
  });
  // Rank by average (ties share a position, e.g. 1, 2, 2, 4). Students with no marks aren't ranked.
  const ranked = rows.filter((r) => r.averagePercent !== null).sort((a, b) => b.averagePercent! - a.averagePercent!);
  ranked.forEach((r, i) => {
    r.position = i > 0 && r.averagePercent === ranked[i - 1]!.averagePercent ? ranked[i - 1]!.position : i + 1;
  });
  const subjectStats = subjects.map((sub) => {
    const subjectMarks = marks.filter((m) => m.subjectName === sub.subjectName);
    const distribution: Record<string, number> = Object.fromEntries(bands.map((b) => [b.grade, 0]));
    for (const m of subjectMarks) {
      const g = bandFor((m.score / m.maxScore) * 100, bands)?.grade;
      if (g) distribution[g] = (distribution[g] ?? 0) + 1;
    }
    const averagePercent = subjectMarks.length
      ? Math.round((subjectMarks.reduce((sum, m) => sum + (m.score / m.maxScore) * 100, 0) / subjectMarks.length) * 10) / 10
      : null;
    return { ...sub, averagePercent, graded: subjectMarks.length, distribution };
  });
  return { rows, marks, subjectStats, classSize: students.length };
}

async function examScale(exam: Exam) {
  return (await loadScale(exam.gradingScaleId)) ?? { bands: [] as GradeBand[] };
}

examsRouter.get('/exams/:id/performance', requireRole('admin', 'teacher'), async (req, res) => {
  const examId = intParam(req.params.id);
  const classId = intParam(req.query.classId, 'classId');
  const user = me(req);
  const exam = await loadExam(examId);
  if (!exam.classes.some((c) => c.id === classId)) throw notFound('Class in this exam');
  if (user.role === 'teacher') {
    const teaches = await queryOne(
      'SELECT 1 FROM classes c WHERE c.id = $2 AND (c.homeroom_teacher_id = $1 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1))',
      [user.id, classId],
    );
    if (!teaches) throw forbidden("You don't teach this class");
  }
  const { bands } = await examScale(exam);
  const results = await classResults(examId, classId, bands);
  const payload: ClassPerformance = {
    exam, classId, className: exam.classes.find((c) => c.id === classId)!.name,
    subjects: results.subjectStats,
    ranking: results.rows.filter((r) => r.position > 0).sort((a, b) => a.position - b.position),
    bands,
  };
  res.json(payload);
});

async function buildReportCard(examId: number, studentId: number): Promise<Omit<ReportCard, 'canEditRemark'>> {
  const [exam, student, school] = await Promise.all([
    loadExam(examId),
    queryOne<StudentListItem>(`${STUDENT_SELECT} WHERE s.user_id = $1`, [studentId]),
    loadSettings(),
  ]);
  if (!student) throw notFound('Student');
  if (!student.classId || !exam.classes.some((c) => c.id === student.classId)) throw notFound('Report card for this student');
  const { bands } = await examScale(exam);
  const results = await classResults(examId, student.classId, bands);
  const papers = await query<{ subjectName: string; teacherName: string | null; maxScore: number; score: number | null }>(
    `SELECT sub.name AS subject_name, CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacher_name,
            a.max_score, g.score
       FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN users t ON t.id = cs.teacher_id
       LEFT JOIN grades g ON g.assessment_id = a.id AND g.student_id = $3
      WHERE a.exam_id = $1 AND cs.class_id = $2 ORDER BY sub.name`,
    [examId, student.classId, studentId],
  );
  const subjects: ReportCardSubject[] = papers.map((p) => {
    const percent = p.score === null ? null : Math.round((p.score / p.maxScore) * 1000) / 10;
    const band = bandFor(percent, bands);
    return {
      subjectName: p.subjectName, teacherName: p.teacherName, marks: p.score, maxMarks: p.maxScore, percent,
      grade: band?.grade ?? null, points: band?.points ?? null, remark: band?.remark ?? null,
      classAverage: results.subjectStats.find((s) => s.subjectName === p.subjectName)?.averagePercent ?? null,
    };
  });
  const me_ = results.rows.find((r) => r.studentId === studentId)!;
  const [attendance, remark] = await Promise.all([
    queryOne<AttendanceSummary>(
      `SELECT COUNT(*) FILTER (WHERE a.status = 'present')::int AS present, COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent,
              COUNT(*) FILTER (WHERE a.status = 'late')::int AS late, COUNT(*) FILTER (WHERE a.status = 'excused')::int AS excused,
              COUNT(*)::int AS total,
              ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('present','late')) / NULLIF(COUNT(*), 0), 1) AS rate
         FROM attendance a LEFT JOIN terms t ON t.id = $2
        WHERE a.student_id = $1 AND (t.id IS NULL OR a.date BETWEEN t.starts_on AND t.ends_on)`,
      [studentId, exam.termId],
    ),
    queryOne<{ remark: string }>('SELECT remark FROM report_remarks WHERE exam_id = $1 AND student_id = $2', [examId, studentId]),
  ]);
  return {
    school, exam, student, subjects, total: me_.total, averagePercent: me_.averagePercent, grade: me_.grade,
    position: me_.position || null, classSize: results.classSize, attendance: attendance!, remark: remark?.remark ?? null, bands,
  };
}

/** Parents and students only see published results. */
async function assertCanSeeResults(user: ReturnType<typeof me>, examId: number, studentId: number) {
  await assertCanViewStudent(user, studentId);
  if (user.role === 'student' || user.role === 'parent') {
    const published = await queryOne('SELECT 1 FROM exams WHERE id = $1 AND published_at IS NOT NULL', [examId]);
    if (!published) throw notFound('Report card');
  }
}

examsRouter.get('/exams/:id/report-cards/:studentId', async (req, res) => {
  const examId = intParam(req.params.id);
  const studentId = intParam(req.params.studentId, 'studentId');
  const user = me(req);
  await assertCanSeeResults(user, examId, studentId);
  const card = await buildReportCard(examId, studentId);
  const canEditRemark = user.role === 'admin' || (user.role === 'teacher' && !!(await queryOne(
    'SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id WHERE s.user_id = $1 AND c.homeroom_teacher_id = $2',
    [studentId, user.id],
  )));
  res.json({ ...card, canEditRemark } satisfies ReportCard);
});

examsRouter.put('/exams/:id/report-cards/:studentId/remark', requireRole('admin', 'teacher'), async (req, res) => {
  const examId = intParam(req.params.id);
  const studentId = intParam(req.params.studentId, 'studentId');
  const user = me(req);
  const { remark } = parse(z.object({ remark: z.string().trim().max(600) }), req.body);
  if (user.role === 'teacher') {
    // Only the class teacher writes the report-card comment.
    const homeroom = await queryOne(
      'SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id WHERE s.user_id = $1 AND c.homeroom_teacher_id = $2',
      [studentId, user.id],
    );
    if (!homeroom) throw forbidden('Only the class teacher can write the report-card remark');
  }
  if (remark) {
    await query(
      `INSERT INTO report_remarks (exam_id, student_id, remark, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET remark = EXCLUDED.remark, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [examId, studentId, remark, user.id],
    );
  } else {
    await query('DELETE FROM report_remarks WHERE exam_id = $1 AND student_id = $2', [examId, studentId]);
  }
  res.status(204).end();
});

/** Published report cards for one student — the parent and student "Report cards" list. */
examsRouter.get('/students/:id/report-cards', async (req, res) => {
  const studentId = intParam(req.params.id);
  const user = me(req);
  await assertCanViewStudent(user, studentId);
  const staff = user.role === 'admin' || user.role === 'teacher';
  const exams = await query<{ id: number }>(
    `SELECT e.id FROM exams e JOIN exam_classes ec ON ec.exam_id = e.id JOIN students s ON s.class_id = ec.class_id
      WHERE s.user_id = $1 ${staff ? '' : 'AND e.published_at IS NOT NULL'} ORDER BY e.starts_on DESC`,
    [studentId],
  );
  const cards: ReportCardSummary[] = [];
  for (const { id: examId } of exams) {
    const card = await buildReportCard(examId, studentId);
    cards.push({
      examId, examName: card.exam.name, termName: card.exam.termName, publishedAt: card.exam.publishedAt ?? '',
      averagePercent: card.averagePercent, grade: card.grade, position: card.position, classSize: card.classSize,
    });
  }
  res.json(cards);
});
