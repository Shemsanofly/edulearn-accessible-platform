/**
 * Excel templates, import and export for marks and attendance.
 *
 *   GET  /imports/marks/template?assessmentId=       prepared template with the class roster and saved marks
 *   POST /imports/marks/preview?assessmentId=        (body: .xlsx) what saving would change, with every problem
 *   POST /imports/marks/commit?assessmentId=&fingerprint=&confirmOverwrite=1   save, after re-checking everything
 *   GET  /imports/marks/export?courseId=             read-only gradebook for a course
 *   …and the same four for attendance (classId + date; export takes from/to).
 *
 * Preview and commit run the same analysis. The preview returns a fingerprint of what it saw (including the values
 * stored at that moment); commit recomputes it inside a transaction and refuses when anything changed, so people
 * always save what they reviewed. Writes go through the same functions as manual entry.
 */
import crypto from 'node:crypto';
import express, { Router, type Request } from 'express';
import type pg from 'pg';
import type {
  AttendanceStatus, GradeStatus, ImportIssue, ImportKind, ImportPreview, ImportPreviewRow, ImportResult, SessionUser,
} from '../../../shared/types.js';
import { pool, query, queryOne, transaction } from '../db/pool.js';
import { assertCanManageCourse, assertCanTakeAttendance, assertCanViewCourse } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { bandFor, loadScale } from '../lib/grading.js';
import { badRequest, conflict, intParam, notFound, parse } from '../lib/http.js';
import { notifyAttendance, saveAttendance, saveGrades, scoreProblem, type AttendanceWrite, type GradeWrite } from '../lib/records.js';
import { loadSettings } from '../lib/settings.js';
import { isoDate } from '../lib/validators.js';
import { buildWorkbook, readCell, readTemplate, sendWorkbook, type Template } from '../lib/xlsx.js';
import { me, requireRole } from '../middleware/auth.js';

export const importsRouter = Router();
importsRouter.use(requireRole('admin', 'teacher'));

type Db = pg.PoolClient | typeof pool;
const upload = express.raw({ type: () => true, limit: '2mb' });
const today = () => new Date().toISOString().slice(0, 10);
const fullNameOf = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sameName = (a: string, s: { firstName: string; lastName: string }) =>
  norm(a) === norm(`${s.firstName} ${s.lastName}`) || norm(a) === norm(`${s.lastName} ${s.firstName}`);
const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');

interface StudentRow { id: number; admissionNo: string; firstName: string; lastName: string; classId: number | null; isActive: boolean }

async function classRoster(classId: number, db: Db = pool) {
  return query<StudentRow>(
    `SELECT u.id, s.admission_no, u.first_name, u.last_name, s.class_id, u.is_active
       FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.class_id = $1 AND u.is_active ORDER BY u.last_name, u.first_name`,
    [classId],
    db,
  );
}

async function studentsByAdmission(numbers: string[], db: Db) {
  const rows = await query<StudentRow>(
    `SELECT u.id, s.admission_no, u.first_name, u.last_name, s.class_id, u.is_active
       FROM students s JOIN users u ON u.id = s.user_id WHERE lower(s.admission_no) = ANY($1)`,
    [numbers.map((n) => n.toLowerCase())],
    db,
  );
  return new Map(rows.map((r) => [r.admissionNo.toLowerCase(), r]));
}

/** Shared bookkeeping for one analysis: rows, issues and counts. */
class Review {
  rows: ImportPreviewRow[] = [];
  issues: ImportIssue[] = [];
  notices: string[] = [];

  issue(row: number | null, column: string | null, admissionNo: string | null, studentName: string | null, message: string) {
    this.issues.push({ row, column, admissionNo: admissionNo || null, studentName: studentName || null, message });
  }

  finish(kind: ImportKind, title: string, details: ImportPreview['details'], notInFile: number, key: unknown): ImportPreview {
    const counts = { create: 0, update: 0, unchanged: 0, skip: 0, error: 0 };
    for (const r of this.rows) counts[r.action]++;
    const fingerprint = sha256(JSON.stringify({ kind, key, rows: this.rows.map((r) => [r.row, r.studentId, r.action, r.before, r.after]) }));
    const changes = counts.create + counts.update;
    if (!this.issues.length && !changes) this.notices.push('Nothing to save: every entry in the file matches what is already saved.');
    return {
      kind, title, details, rows: this.rows, issues: this.issues, notices: this.notices, counts, notInFile, fingerprint,
      canSave: this.issues.length === 0 && changes > 0,
      needsOverwriteConfirm: counts.update > 0,
    };
  }
}

/** Read every non-empty row under the header, by the column keys stored in the template. */
function* templateRows(tpl: Template) {
  const col = (key: string) => tpl.meta.columns.indexOf(key) + 1;
  for (let r = tpl.meta.headerRow + 1; r <= tpl.sheet.rowCount; r++) {
    const row = tpl.sheet.getRow(r);
    const get = (key: string) => (col(key) > 0 ? readCell(row.getCell(col(key)).value) : { text: '', num: null, error: null });
    const cells = Object.fromEntries(tpl.meta.columns.map((k) => [k, get(k)]));
    if (Object.entries(cells).every(([k, c]) => k === 'no' || (!c.text && !c.error))) continue;
    yield { row: r, cells, get };
  }
}

/** Check the identifiers of every row; returns the matched student per row (or null when the row has a problem). */
async function matchStudents(tpl: Template, classId: number, className: string, review: Review, db: Db, entryKeys: string[]) {
  const all = [...templateRows(tpl)];
  const numbers = all.map((r) => r.get('admission').text).filter(Boolean);
  const byAdmission = await studentsByAdmission(numbers, db);
  const seen = new Map<string, number[]>();
  for (const r of all) {
    const adm = r.get('admission').text.toLowerCase();
    if (adm) seen.set(adm, [...(seen.get(adm) ?? []), r.row]);
  }
  const matched: { row: number; get: (key: string) => ReturnType<typeof readCell>; student: StudentRow | null; admissionNo: string; name: string }[] = [];
  for (const r of all) {
    const admissionNo = r.get('admission').text;
    const name = r.get('name').text;
    const hasEntry = entryKeys.some((k) => r.get(k).text || r.get(k).error);
    const fail = (column: string, message: string) => {
      review.issue(r.row, column, admissionNo, name, message);
      review.rows.push({ row: r.row, studentId: null, admissionNo, studentName: name, action: 'error', before: null, after: null, note: message });
      matched.push({ row: r.row, get: r.get, student: null, admissionNo, name });
    };
    if (!admissionNo) {
      if (hasEntry) fail('Admission No', 'The admission number is missing. Copy this student’s row from a fresh template.');
      continue;
    }
    const rowsForStudent = seen.get(admissionNo.toLowerCase())!;
    if (rowsForStudent.length > 1) {
      fail('Admission No', `This student appears more than once (rows ${rowsForStudent.join(', ')}). Keep one row per student.`);
      continue;
    }
    const student = byAdmission.get(admissionNo.toLowerCase());
    if (!student) {
      fail('Admission No', 'This admission number isn’t recognised. It may have been changed: use the number from the template.');
      continue;
    }
    if (name && !sameName(name, student)) {
      fail('Student name', `The name doesn’t match admission number ${student.admissionNo} (${fullNameOf(student)}). The admission number may have been changed.`);
      continue;
    }
    if (student.classId !== classId || !student.isActive) {
      const message = `${fullNameOf(student)} is no longer in ${className}.`;
      if (hasEntry) fail('Admission No', `${message} Remove this row, or ask the school office.`);
      else review.rows.push({ row: r.row, studentId: student.id, admissionNo, studentName: fullNameOf(student), action: 'skip', before: null, after: null, note: message });
      continue;
    }
    matched.push({ row: r.row, get: r.get, student, admissionNo: student.admissionNo, name: fullNameOf(student) });
  }
  return matched;
}

// ===========================================================================================================
// Marks
// ===========================================================================================================
interface MarksContext {
  assessmentId: number; title: string; type: string; maxScore: number; courseId: number; classId: number; className: string;
  subjectName: string; termName: string | null; examName: string | null; examPublished: boolean;
}

async function marksContext(assessmentId: number, db: Db = pool) {
  const c = await queryOne<MarksContext>(
    `SELECT a.id AS assessment_id, a.title, a.type, a.max_score, cs.id AS course_id, cs.class_id, c.name AS class_name,
            sub.name AS subject_name, t.name AS term_name, e.name AS exam_name, (e.published_at IS NOT NULL) AS exam_published
       FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id JOIN classes c ON c.id = cs.class_id
       JOIN subjects sub ON sub.id = cs.subject_id LEFT JOIN terms t ON t.id = a.term_id LEFT JOIN exams e ON e.id = a.exam_id
      WHERE a.id = $1`,
    [assessmentId],
    db,
  );
  if (!c) throw notFound('Assessment');
  return c;
}

const marksTitle = (c: MarksContext) => `${c.title} · ${c.subjectName} · ${c.className}`;
const marksDetails = (c: MarksContext) => [
  { label: 'Class', value: c.className },
  { label: 'Subject', value: c.subjectName },
  { label: 'Term', value: c.termName ?? '—' },
  { label: 'Assessment', value: c.examName ? `${c.title} (${c.examName})` : c.title },
  { label: 'Maximum mark', value: String(c.maxScore) },
];

interface StoredGrade { studentId: number; score: number | null; status: GradeStatus | null; feedback: string | null }
const STATUS_LABEL: Record<GradeStatus, string> = { absent: 'Absent', exempt: 'Exempt' };
const gradeText = (g: { score: number | null; status: GradeStatus | null; feedback: string | null } | undefined) => {
  if (!g || (g.score === null && !g.status)) return null;
  const value = g.status ? STATUS_LABEL[g.status] : String(g.score);
  return g.feedback ? `${value} · “${clip(g.feedback)}”` : value;
};

function parseGradeStatus(text: string): GradeStatus | null | undefined {
  const t = text.trim().toUpperCase();
  if (!t) return null;
  if (['ABSENT', 'ABS', 'A', 'HAYUPO'].includes(t)) return 'absent';
  if (['EXEMPT', 'EX', 'E', 'EXCUSED', 'AMESAMEHEWA'].includes(t)) return 'exempt';
  return undefined;
}

async function analyseMarks(tpl: Template, assessmentId: number, user: SessionUser, db: Db) {
  const ctx = await marksContext(assessmentId, db);
  await assertCanManageCourse(user, ctx.courseId);
  const meta = tpl.meta as Template['meta'] & { assessmentId: number; classId: number; maxScore: number; title: string; className: string };
  if (meta.assessmentId !== assessmentId) {
    throw badRequest(`This template is for “${meta.title}” (${meta.className}), not “${ctx.title}”. Choose that assessment, or download the right template.`);
  }
  if (meta.classId !== ctx.classId) throw badRequest('This assessment now belongs to a different class. Download a new template.');

  const review = new Review();
  if (meta.maxScore !== ctx.maxScore) review.notices.push(`The maximum mark changed from ${meta.maxScore} to ${ctx.maxScore} since the template was downloaded. Marks are checked against ${ctx.maxScore}.`);
  if (ctx.examPublished) review.notices.push(`Results for ${ctx.examName} are already published, so parents will see saved changes. Importing never publishes results by itself.`);

  const stored = await query<StoredGrade>('SELECT student_id, score, status, feedback FROM grades WHERE assessment_id = $1', [assessmentId], db);
  const current = new Map(stored.map((g) => [g.studentId, g]));
  const matched = await matchStudents(tpl, ctx.classId, ctx.className, review, db, ['mark', 'status', 'comment']);
  const writes: GradeWrite[] = [];
  const changes: { studentId: number; admissionNo: string; before: string | null; after: string | null }[] = [];

  for (const m of matched) {
    if (!m.student) continue;
    const mark = m.get('mark');
    const statusCell = m.get('status');
    const comment = m.get('comment');
    const problems: [string, string][] = [];
    let score: number | null = null;
    if (mark.error) problems.push(['Mark', `The cell shows ${mark.error}. Type the mark as a number.`]);
    else if (mark.text) {
      if (mark.num === null) problems.push(['Mark', `“${clip(mark.text, 20)}” isn’t a number. Enter a mark from 0 to ${ctx.maxScore}, or leave it blank.`]);
      else {
        const p = scoreProblem(mark.num, ctx.maxScore);
        if (p) problems.push(['Mark', `${p}. Enter a mark from 0 to ${ctx.maxScore}.`]);
        else score = mark.num;
      }
    }
    const status = parseGradeStatus(statusCell.text);
    if (status === undefined) problems.push(['Absent / exempt', `Use ABSENT or EXEMPT, or leave it blank (found “${clip(statusCell.text, 20)}”).`]);
    if (mark.text && status) problems.push(['Mark', 'Enter either a mark or ABSENT/EXEMPT, not both.']);
    if (comment.text.length > 1000) problems.push(['Comment', 'Comments can be at most 1000 characters.']);

    const before = current.get(m.student.id);
    const hasValue = score !== null || !!status;
    if (!problems.length && !hasValue && comment.text && !before) {
      problems.push(['Comment', 'Add a mark or ABSENT/EXEMPT for this comment, or remove the comment.']);
    }
    if (problems.length) {
      for (const [column, message] of problems) review.issue(m.row, column, m.admissionNo, m.name, message);
      review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: 'error', before: gradeText(before), after: null, note: problems[0]![1] });
      continue;
    }
    // Blank cells keep what is saved: a blank mark never becomes 0 and never erases a mark.
    const next = {
      score: hasValue ? (status ? null : score) : before?.score ?? null,
      status: hasValue ? (status ?? null) : before?.status ?? null,
      feedback: comment.text ? comment.text : before?.feedback ?? null,
    };
    const beforeText = gradeText(before);
    const afterText = gradeText(next);
    const same = before && before.score === next.score && before.status === next.status && (before.feedback ?? null) === next.feedback;
    if (!hasValue && !comment.text) {
      review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: 'unchanged', before: beforeText, after: beforeText, note: before ? null : 'No mark entered' });
      continue;
    }
    if (same) {
      review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: 'unchanged', before: beforeText, after: afterText, note: null });
      continue;
    }
    review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: before ? 'update' : 'create', before: beforeText, after: afterText, note: null });
    writes.push({ studentId: m.student.id, score: next.score, status: next.status, feedback: comment.text ? comment.text : undefined });
    changes.push({ studentId: m.student.id, admissionNo: m.admissionNo, before: beforeText, after: afterText });
  }

  const inFile = new Set(review.rows.map((r) => r.studentId));
  const roster = await classRoster(ctx.classId, db);
  const preview = review.finish('marks', marksTitle(ctx), marksDetails(ctx), roster.filter((s) => !inFile.has(s.id)).length, { assessmentId });
  return { ctx, preview, writes, changes };
}

importsRouter.get('/marks/template', async (req, res) => {
  const assessmentId = intParam(req.query.assessmentId, 'assessmentId');
  const ctx = await marksContext(assessmentId);
  await assertCanManageCourse(me(req), ctx.courseId);
  const [roster, stored, school] = await Promise.all([
    classRoster(ctx.classId),
    query<StoredGrade>('SELECT student_id, score, status, feedback FROM grades WHERE assessment_id = $1', [assessmentId]),
    loadSettings(),
  ]);
  const grades = new Map(stored.map((g) => [g.studentId, g]));
  const buffer = await buildWorkbook({
    sheetName: 'Marks',
    title: `${school.name} — marks template`,
    details: [
      ...marksDetails(ctx).map((d) => [d.label, d.value] as [string, string]),
      ['Downloaded', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })],
    ],
    instructions: [
      `Enter a mark from 0 to ${ctx.maxScore} in the Mark column. 0 is a valid mark.`,
      'A blank cell keeps what is already saved. Blank never erases a mark or turns into 0.',
      'If a student missed the assessment or was excused, choose ABSENT or EXEMPT instead of a mark.',
      'Don’t change admission numbers or names, and don’t add students: rows are matched by admission number.',
      'Upload the file in EduLearn (Gradebook › Import). You will see a review before anything is saved.',
    ],
    columns: [
      { key: 'no', header: 'No.', width: 6, align: 'right' },
      { key: 'admission', header: 'Admission No', width: 16 },
      { key: 'name', header: 'Student name', width: 30 },
      {
        key: 'mark', header: `Mark (0–${ctx.maxScore})`, width: 14, entry: true, align: 'right',
        validation: {
          type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, ctx.maxScore], showErrorMessage: true,
          errorTitle: 'Mark out of range', error: `Enter a number from 0 to ${ctx.maxScore}, or leave the cell blank.`,
        },
      },
      {
        key: 'status', header: 'Absent / exempt', width: 16, entry: true,
        validation: { type: 'list', allowBlank: true, formulae: ['"ABSENT,EXEMPT"'], showErrorMessage: true, errorTitle: 'Not allowed', error: 'Choose ABSENT or EXEMPT, or leave the cell blank.' },
      },
      { key: 'comment', header: 'Comment (optional)', width: 36, entry: true },
    ],
    rows: roster.map((s, i) => {
      const g = grades.get(s.id);
      return [i + 1, s.admissionNo, fullNameOf(s), g?.score ?? null, g?.status ? g.status.toUpperCase() : null, g?.feedback ?? null];
    }),
    meta: { kind: 'marks', assessmentId, courseId: ctx.courseId, classId: ctx.classId, maxScore: ctx.maxScore, title: ctx.title, className: ctx.className },
  });
  sendWorkbook(res, `marks-${ctx.className}-${ctx.subjectName}-${ctx.title}.xlsx`, buffer);
});

importsRouter.post('/marks/preview', upload, async (req, res) => {
  const assessmentId = intParam(req.query.assessmentId, 'assessmentId');
  const tpl = await readTemplate(req.body, 'marks');
  const { preview } = await analyseMarks(tpl, assessmentId, me(req), pool);
  res.json(preview);
});

importsRouter.post('/marks/commit', upload, async (req, res) => {
  const assessmentId = intParam(req.query.assessmentId, 'assessmentId');
  const fingerprint = String(req.query.fingerprint ?? '');
  const confirmOverwrite = req.query.confirmOverwrite === '1';
  const user = me(req);
  const tpl = await readTemplate(req.body, 'marks');
  const result = await transaction(async (db): Promise<ImportResult> => {
    // One import per assessment at a time, and lock the saved marks so manual edits wait for this to finish.
    await query('SELECT pg_advisory_xact_lock(1, $1)', [assessmentId], db);
    await query('SELECT 1 FROM grades WHERE assessment_id = $1 FOR UPDATE', [assessmentId], db);
    const a = await analyseMarks(tpl, assessmentId, user, db);
    if (a.preview.issues.length) throw badRequest('The file still has errors. Fix them and upload it again.');
    if (a.preview.fingerprint !== fingerprint) throw conflict('The marks changed after your review. Look at the updated review and save again.');
    if (a.preview.counts.update && !confirmOverwrite) throw badRequest(`Confirm that you want to overwrite ${a.preview.counts.update} saved mark${a.preview.counts.update === 1 ? '' : 's'}.`);
    const { create, update, unchanged } = a.preview.counts;
    if (!a.writes.length) return { importId: null, created: 0, updated: 0, unchanged, title: a.preview.title };
    await saveGrades(db, assessmentId, user.id, a.writes);
    const rec = await queryOne<{ id: number }>(
      `INSERT INTO data_imports (kind, context, filename, file_sha256, imported_by, created_count, updated_count, unchanged_count, changes)
       VALUES ('marks', $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [JSON.stringify({ assessmentId, courseId: a.ctx.courseId, classId: a.ctx.classId, title: a.preview.title }),
        String(req.query.filename ?? '').slice(0, 200) || null, sha256(req.body as Buffer), user.id, create, update, unchanged,
        JSON.stringify(a.changes)],
      db,
    );
    await audit(req, {
      action: 'update', entity: 'grades', entityId: assessmentId,
      summary: `Imported marks from Excel for ${a.preview.title}: ${create} new, ${update} updated`,
      details: { importId: rec!.id, created: create, updated: update, unchanged },
    }, db);
    return { importId: rec!.id, created: create, updated: update, unchanged, title: a.preview.title };
  });
  res.json(result);
});

importsRouter.get('/marks/export', async (req, res) => {
  const courseId = intParam(req.query.courseId, 'courseId');
  await assertCanViewCourse(me(req), courseId);
  const course = await queryOne<{ classId: number; className: string; subjectName: string; teacherName: string | null }>(
    `SELECT cs.class_id, c.name AS class_name, sub.name AS subject_name,
            CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacher_name
       FROM class_subjects cs JOIN classes c ON c.id = cs.class_id JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN users t ON t.id = cs.teacher_id WHERE cs.id = $1`,
    [courseId],
  );
  if (!course) throw notFound('Course');
  const [assessments, roster, stored, scale, school] = await Promise.all([
    query<{ id: number; title: string; maxScore: number; termName: string | null }>(
      `SELECT a.id, a.title, a.max_score, t.name AS term_name FROM assessments a LEFT JOIN terms t ON t.id = a.term_id
        WHERE a.class_subject_id = $1 ORDER BY a.due_date NULLS LAST, a.id`,
      [courseId],
    ),
    classRoster(course.classId),
    query<StoredGrade & { assessmentId: number }>(
      'SELECT g.assessment_id, g.student_id, g.score, g.status, g.feedback FROM grades g JOIN assessments a ON a.id = g.assessment_id WHERE a.class_subject_id = $1',
      [courseId],
    ),
    loadScale(null),
    loadSettings(),
  ]);
  const key = (a: number, s: number) => `${a}:${s}`;
  const grades = new Map(stored.map((g) => [key(g.assessmentId, g.studentId), g]));
  const rows = roster.map((s, i) => {
    const percents: number[] = [];
    const cells = assessments.map((a) => {
      const g = grades.get(key(a.id, s.id));
      if (!g) return null;
      if (g.status) return g.status.toUpperCase();
      percents.push((g.score! / a.maxScore) * 100);
      return g.score;
    });
    const avg = percents.length ? Math.round((percents.reduce((x, y) => x + y, 0) / percents.length) * 10) / 10 : null;
    return [i + 1, s.admissionNo, fullNameOf(s), ...cells, avg, bandFor(avg, scale?.bands ?? [])?.grade ?? null];
  });
  const buffer = await buildWorkbook({
    sheetName: 'Gradebook',
    title: `${school.name} — gradebook`,
    details: [['Class', course.className], ['Subject', course.subjectName], ['Teacher', course.teacherName ?? '—'], ['Exported', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })]],
    instructions: [],
    columns: [
      { key: 'no', header: 'No.', width: 6, align: 'right' },
      { key: 'admission', header: 'Admission No', width: 16 },
      { key: 'name', header: 'Student name', width: 30 },
      ...assessments.map((a) => ({ key: `a${a.id}`, header: `${a.title} (/${a.maxScore})`, width: 14, align: 'right' as const })),
      { key: 'avg', header: 'Average %', width: 12, align: 'right' },
      { key: 'grade', header: 'Grade', width: 8, align: 'center' },
    ],
    rows,
    footerNote: 'Read-only export. To change marks, download a template for one assessment and import it.',
  });
  sendWorkbook(res, `gradebook-${course.className}-${course.subjectName}.xlsx`, buffer);
});

// ===========================================================================================================
// Attendance
// ===========================================================================================================
const ATTENDANCE_WORDS: Record<string, AttendanceStatus> = {
  PRESENT: 'present', P: 'present', YUPO: 'present',
  ABSENT: 'absent', A: 'absent', HAYUPO: 'absent',
  LATE: 'late', L: 'late', AMECHELEWA: 'late',
  EXCUSED: 'excused', E: 'excused', AMERUHUSIWA: 'excused',
};
const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' };
const attendanceText = (a: { status: AttendanceStatus; note: string | null } | undefined) =>
  a ? `${ATTENDANCE_LABEL[a.status]}${a.note ? ` · “${clip(a.note)}”` : ''}` : null;

async function attendanceContext(classId: number, date: string, user: SessionUser, db: Db = pool) {
  await assertCanTakeAttendance(user, classId);
  const cls = await queryOne<{ name: string }>('SELECT name FROM classes WHERE id = $1', [classId], db);
  if (!cls) throw notFound('Class');
  if (date > today()) throw badRequest("You can't record attendance for a future date");
  return { classId, className: cls.name, date };
}
const attendanceDetails = (c: { className: string; date: string }) => [{ label: 'Class', value: c.className }, { label: 'Date', value: c.date }];

async function analyseAttendance(tpl: Template, classId: number, date: string, user: SessionUser, db: Db) {
  const ctx = await attendanceContext(classId, date, user, db);
  const meta = tpl.meta as Template['meta'] & { classId: number; date: string; className: string };
  if (meta.classId !== classId || meta.date !== date) {
    throw badRequest(`This template is for ${meta.className} on ${meta.date}, not ${ctx.className} on ${date}. Choose that class and date, or download the right template.`);
  }
  const review = new Review();
  const stored = await query<{ studentId: number; status: AttendanceStatus; note: string | null }>(
    'SELECT student_id, status, note FROM attendance WHERE date = $1 AND class_id = $2',
    [date, classId],
    db,
  );
  const current = new Map(stored.map((a) => [a.studentId, a]));
  const matched = await matchStudents(tpl, classId, ctx.className, review, db, ['status', 'note']);
  const writes: AttendanceWrite[] = [];
  const changes: { studentId: number; admissionNo: string; before: string | null; after: string | null }[] = [];
  for (const m of matched) {
    if (!m.student) continue;
    const statusCell = m.get('status');
    const note = m.get('note');
    const problems: [string, string][] = [];
    const status = statusCell.text ? ATTENDANCE_WORDS[statusCell.text.toUpperCase()] : null;
    if (statusCell.error) problems.push(['Status', `The cell shows ${statusCell.error}. Choose a status from the list.`]);
    else if (status === undefined) problems.push(['Status', `Use Present, Absent, Late or Excused, or leave it blank (found “${clip(statusCell.text, 20)}”).`]);
    if (note.text.length > 200) problems.push(['Note', 'Notes can be at most 200 characters.']);
    const before = current.get(m.student.id);
    if (!problems.length && !status && note.text && !before) problems.push(['Note', 'Choose a status for this note, or remove the note.']);
    if (problems.length) {
      for (const [column, message] of problems) review.issue(m.row, column, m.admissionNo, m.name, message);
      review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: 'error', before: attendanceText(before), after: null, note: problems[0]![1] });
      continue;
    }
    if (!status && !note.text) {
      review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: 'unchanged', before: attendanceText(before), after: attendanceText(before), note: before ? null : 'No status entered' });
      continue;
    }
    const next = { status: (status || before!.status) as AttendanceStatus, note: note.text ? note.text : before?.note ?? null };
    const beforeText = attendanceText(before);
    const afterText = attendanceText(next);
    if (before && before.status === next.status && (before.note ?? null) === next.note) {
      review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: 'unchanged', before: beforeText, after: afterText, note: null });
      continue;
    }
    review.rows.push({ row: m.row, studentId: m.student.id, admissionNo: m.admissionNo, studentName: m.name, action: before ? 'update' : 'create', before: beforeText, after: afterText, note: null });
    writes.push({ studentId: m.student.id, status: next.status, note: note.text ? note.text : undefined });
    changes.push({ studentId: m.student.id, admissionNo: m.admissionNo, before: beforeText, after: afterText });
  }
  const inFile = new Set(review.rows.map((r) => r.studentId));
  const roster = await classRoster(classId, db);
  const preview = review.finish('attendance', `Attendance · ${ctx.className} · ${date}`, attendanceDetails(ctx), roster.filter((s) => !inFile.has(s.id)).length, { classId, date });
  return { ctx, preview, writes, changes };
}

const dateParam = (v: unknown) => parse(isoDate, v);

importsRouter.get('/attendance/template', async (req, res) => {
  const classId = intParam(req.query.classId, 'classId');
  const date = dateParam(req.query.date);
  const ctx = await attendanceContext(classId, date, me(req));
  const [roster, stored, school] = await Promise.all([
    classRoster(classId),
    query<{ studentId: number; status: AttendanceStatus; note: string | null }>('SELECT student_id, status, note FROM attendance WHERE date = $1 AND class_id = $2', [date, classId]),
    loadSettings(),
  ]);
  const existing = new Map(stored.map((a) => [a.studentId, a]));
  const buffer = await buildWorkbook({
    sheetName: 'Attendance',
    title: `${school.name} — attendance template`,
    details: [['Class', ctx.className], ['Date', date], ['Downloaded', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })]],
    instructions: [
      'Choose a status for each student: Present, Absent, Late or Excused.',
      'A blank status keeps what is already saved for that student.',
      'Notes are optional (for example “Clinic visit”).',
      'Don’t change admission numbers or names, and don’t add students: rows are matched by admission number.',
      'Upload the file in EduLearn (Attendance › Import). You will see a review before anything is saved.',
    ],
    columns: [
      { key: 'no', header: 'No.', width: 6, align: 'right' },
      { key: 'admission', header: 'Admission No', width: 16 },
      { key: 'name', header: 'Student name', width: 30 },
      {
        key: 'status', header: 'Status', width: 14, entry: true,
        validation: { type: 'list', allowBlank: true, formulae: ['"Present,Absent,Late,Excused"'], showErrorMessage: true, errorTitle: 'Not allowed', error: 'Choose Present, Absent, Late or Excused.' },
      },
      { key: 'note', header: 'Note (optional)', width: 36, entry: true },
    ],
    rows: roster.map((s, i) => {
      const a = existing.get(s.id);
      return [i + 1, s.admissionNo, fullNameOf(s), a ? ATTENDANCE_LABEL[a.status] : null, a?.note ?? null];
    }),
    meta: { kind: 'attendance', classId, date, className: ctx.className },
  });
  sendWorkbook(res, `attendance-${ctx.className}-${date}.xlsx`, buffer);
});

importsRouter.post('/attendance/preview', upload, async (req, res) => {
  const classId = intParam(req.query.classId, 'classId');
  const date = dateParam(req.query.date);
  const tpl = await readTemplate(req.body, 'attendance');
  const { preview } = await analyseAttendance(tpl, classId, date, me(req), pool);
  res.json(preview);
});

importsRouter.post('/attendance/commit', upload, async (req, res) => {
  const classId = intParam(req.query.classId, 'classId');
  const date = dateParam(req.query.date);
  const fingerprint = String(req.query.fingerprint ?? '');
  const confirmOverwrite = req.query.confirmOverwrite === '1';
  const user = me(req);
  const tpl = await readTemplate(req.body, 'attendance');
  const { result, flagged } = await transaction(async (db) => {
    await query('SELECT pg_advisory_xact_lock(2, $1)', [classId], db);
    await query('SELECT 1 FROM attendance WHERE class_id = $1 AND date = $2 FOR UPDATE', [classId, date], db);
    const a = await analyseAttendance(tpl, classId, date, user, db);
    if (a.preview.issues.length) throw badRequest('The file still has errors. Fix them and upload it again.');
    if (a.preview.fingerprint !== fingerprint) throw conflict('The register changed after your review. Look at the updated review and save again.');
    if (a.preview.counts.update && !confirmOverwrite) throw badRequest(`Confirm that you want to overwrite ${a.preview.counts.update} saved entr${a.preview.counts.update === 1 ? 'y' : 'ies'}.`);
    const { create, update, unchanged } = a.preview.counts;
    if (!a.writes.length) return { result: { importId: null, created: 0, updated: 0, unchanged, title: a.preview.title }, flagged: [] };
    const flaggedRows = await saveAttendance(db, classId, date, user.id, a.writes);
    const rec = await queryOne<{ id: number }>(
      `INSERT INTO data_imports (kind, context, filename, file_sha256, imported_by, created_count, updated_count, unchanged_count, changes)
       VALUES ('attendance', $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [JSON.stringify({ classId, date, title: a.preview.title }), String(req.query.filename ?? '').slice(0, 200) || null,
        sha256(req.body as Buffer), user.id, create, update, unchanged, JSON.stringify(a.changes)],
      db,
    );
    await audit(req, {
      action: 'update', entity: 'attendance', entityId: `${classId}:${date}`,
      summary: `Imported attendance from Excel for ${a.preview.title}: ${create} new, ${update} updated`,
      details: { importId: rec!.id, created: create, updated: update, unchanged },
    }, db);
    return { result: { importId: rec!.id, created: create, updated: update, unchanged, title: a.preview.title } as ImportResult, flagged: flaggedRows };
  });
  // Parents hear about absences the same way as with the on-screen register.
  await notifyAttendance(date, flagged);
  res.json(result);
});

importsRouter.get('/attendance/export', async (req, res) => {
  const classId = intParam(req.query.classId, 'classId');
  const user = me(req);
  await assertCanTakeAttendance(user, classId);
  const to = req.query.to ? dateParam(req.query.to) : today();
  const from = req.query.from ? dateParam(req.query.from) : new Date(Date.parse(to) - 30 * 864e5).toISOString().slice(0, 10);
  if (from > to) throw badRequest('The start date must be before the end date');
  if (Date.parse(to) - Date.parse(from) > 186 * 864e5) throw badRequest('Export at most six months at a time');
  const cls = await queryOne<{ name: string }>('SELECT name FROM classes WHERE id = $1', [classId]);
  if (!cls) throw notFound('Class');
  const [roster, records, school] = await Promise.all([
    classRoster(classId),
    query<{ studentId: number; date: string; status: AttendanceStatus }>(
      'SELECT student_id, date, status FROM attendance WHERE class_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date',
      [classId, from, to],
    ),
    loadSettings(),
  ]);
  const dates = [...new Set(records.map((r) => r.date))].sort();
  const byKey = new Map(records.map((r) => [`${r.studentId}:${r.date}`, r.status]));
  const letter: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', late: 'L', excused: 'E' };
  const rows = roster.map((s, i) => {
    const marks = dates.map((d) => byKey.get(`${s.id}:${d}`) ?? null);
    const count = (st: AttendanceStatus) => marks.filter((m) => m === st).length;
    const recorded = marks.filter(Boolean).length;
    const rate = recorded ? Math.round(((count('present') + count('late')) / recorded) * 1000) / 10 : null;
    return [i + 1, s.admissionNo, fullNameOf(s), ...marks.map((m) => (m ? letter[m] : null)), count('present'), count('absent'), count('late'), count('excused'), rate];
  });
  const buffer = await buildWorkbook({
    sheetName: 'Attendance',
    title: `${school.name} — attendance`,
    details: [['Class', cls.name], ['From', from], ['To', to], ['Key', 'P present · A absent · L late · E excused']],
    instructions: [],
    columns: [
      { key: 'no', header: 'No.', width: 6, align: 'right' },
      { key: 'admission', header: 'Admission No', width: 16 },
      { key: 'name', header: 'Student name', width: 28 },
      ...dates.map((d) => ({ key: d, header: d.slice(5), width: 6, align: 'center' as const })),
      { key: 'present', header: 'Present', width: 9, align: 'right' },
      { key: 'absent', header: 'Absent', width: 9, align: 'right' },
      { key: 'late', header: 'Late', width: 7, align: 'right' },
      { key: 'excused', header: 'Excused', width: 9, align: 'right' },
      { key: 'rate', header: 'Attendance %', width: 13, align: 'right' },
    ],
    rows,
    footerNote: dates.length ? 'Read-only export.' : 'No attendance was recorded for this class in these dates.',
  });
  sendWorkbook(res, `attendance-${cls.name}-${from}-to-${to}.xlsx`, buffer);
});
