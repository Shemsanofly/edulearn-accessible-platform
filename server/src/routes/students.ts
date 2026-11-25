import { Router } from 'express';
import { z } from 'zod';
import type {
  AttendanceRecord, AttendanceSummary, CreatedAccount, Guardian, Invoice, Paginated, StudentDetail,
  StudentGrade, StudentListItem, StudentOverview, SubjectAverage, Assessment,
} from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanViewStudent } from '../lib/access.js';
import { createUser, nextCode, updateUser } from '../lib/accounts.js';
import { intParam, notFound, pageParams, parse, provided } from '../lib/http.js';
import { ASSESSMENT_SELECT, INVOICE_SELECT, STUDENT_SELECT } from '../lib/sql.js';
import { email, id, isoDate, name, optionalText, password } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const studentsRouter = Router();

const studentSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password: password.optional(),
  phone: optionalText(40),
  admissionNo: z.string().trim().max(40).optional(),
  classId: id.nullish(),
  dateOfBirth: isoDate.nullish(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).default('unspecified'),
  address: optionalText(300),
  accessibilityNeeds: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  medicalNotes: optionalText(1000),
  isActive: z.boolean().optional(),
});

// List — admins see everyone, teachers see students in classes they teach.
studentsRouter.get('/', requireRole('admin', 'teacher'), async (req, res) => {
  const user = me(req);
  const { page, pageSize, offset } = pageParams(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  const search = String(req.query.search ?? '').trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.first_name || ' ' || u.last_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR s.admission_no ILIKE $${params.length})`);
  }
  if (req.query.classId) {
    params.push(intParam(req.query.classId, 'classId'));
    where.push(`s.class_id = $${params.length}`);
  }
  if (req.query.status === 'active' || req.query.status === 'inactive') {
    where.push(`u.is_active = ${req.query.status === 'active'}`);
  }
  if (user.role === 'teacher') {
    params.push(user.id);
    where.push(`(c.homeroom_teacher_id = $${params.length} OR EXISTS (
      SELECT 1 FROM class_subjects cs WHERE cs.class_id = s.class_id AND cs.teacher_id = $${params.length}))`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [items, count] = await Promise.all([
    query<StudentListItem>(
      `${STUDENT_SELECT} ${whereSql} ORDER BY u.last_name, u.first_name LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    ),
    queryOne<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM students s JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id ${whereSql}`,
      params,
    ),
  ]);
  const result: Paginated<StudentListItem> = { items, total: count?.total ?? 0, page, pageSize };
  res.json(result);
});

export async function loadStudent(studentId: number): Promise<StudentDetail | null> {
  const student = await queryOne<StudentDetail>(
    `${STUDENT_SELECT.replace('s.accessibility_needs', 's.accessibility_needs, s.address, s.medical_notes, s.enrolled_on')}
     WHERE s.user_id = $1`,
    [studentId],
  );
  if (!student) return null;
  student.guardians = await query<Guardian>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, g.relationship, g.is_primary
       FROM guardians g JOIN users u ON u.id = g.parent_id
      WHERE g.student_id = $1 ORDER BY g.is_primary DESC, u.last_name`,
    [studentId],
  );
  return student;
}

studentsRouter.post('/', requireRole('admin'), async (req, res) => {
  const body = parse(studentSchema, req.body);
  const result = await transaction(async (db) => {
    const account = await createUser(db, { ...body, role: 'student' });
    const admissionNo = body.admissionNo || (await nextCode(db, 'students', 'admission_no', 'STU'));
    await query(
      `INSERT INTO students (user_id, admission_no, class_id, date_of_birth, gender, address, accessibility_needs, medical_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [account.id, admissionNo, body.classId ?? null, body.dateOfBirth ?? null, body.gender, body.address,
        body.accessibilityNeeds, body.medicalNotes],
      db,
    );
    return account;
  });
  const payload: CreatedAccount<StudentDetail> = {
    record: (await loadStudent(result.id))!,
    temporaryPassword: result.temporaryPassword,
  };
  res.status(201).json(payload);
});

studentsRouter.get('/:id', async (req, res) => {
  const studentId = intParam(req.params.id);
  await assertCanViewStudent(me(req), studentId);
  res.json(await loadStudent(studentId));
});

studentsRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const studentId = intParam(req.params.id);
  const body = provided(parse(studentSchema.partial(), req.body), req.body);
  const exists = await queryOne('SELECT 1 FROM students WHERE user_id = $1', [studentId]);
  if (!exists) throw notFound('Student');
  await transaction(async (db) => {
    await updateUser(db, studentId, body);
    await query(
      `UPDATE students SET
         admission_no = COALESCE($2, admission_no),
         class_id = CASE WHEN $3::boolean THEN $4 ELSE class_id END,
         date_of_birth = CASE WHEN $5::boolean THEN $6::date ELSE date_of_birth END,
         gender = COALESCE($7, gender),
         address = CASE WHEN $8::boolean THEN $9 ELSE address END,
         accessibility_needs = COALESCE($10, accessibility_needs),
         medical_notes = CASE WHEN $11::boolean THEN $12 ELSE medical_notes END
       WHERE user_id = $1`,
      [studentId, body.admissionNo || null, 'classId' in body, body.classId ?? null, 'dateOfBirth' in body,
        body.dateOfBirth ?? null, body.gender ?? null, 'address' in body, body.address ?? null,
        body.accessibilityNeeds ?? null, 'medicalNotes' in body, body.medicalNotes ?? null],
      db,
    );
  });
  res.json(await loadStudent(studentId));
});

studentsRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const studentId = intParam(req.params.id);
  const row = await queryOne("DELETE FROM users WHERE id = $1 AND role = 'student' RETURNING id", [studentId]);
  if (!row) throw notFound('Student');
  res.status(204).end();
});

/** Everything about one student's progress — used by students, parents, teachers and admins. */
export async function buildOverview(studentId: number): Promise<StudentOverview> {
  const student = await loadStudent(studentId);
  if (!student) throw notFound('Student');

  const [attendance, recentAttendance, subjectAverages, grades, upcoming, invoices] = await Promise.all([
    queryOne<AttendanceSummary>(
      `SELECT COUNT(*) FILTER (WHERE status = 'present')::int AS present,
              COUNT(*) FILTER (WHERE status = 'absent')::int  AS absent,
              COUNT(*) FILTER (WHERE status = 'late')::int    AS late,
              COUNT(*) FILTER (WHERE status = 'excused')::int AS excused,
              COUNT(*)::int AS total,
              ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('present','late')) / NULLIF(COUNT(*), 0), 1) AS rate
         FROM attendance WHERE student_id = $1`,
      [studentId],
    ),
    query<AttendanceRecord>(
      'SELECT date, status, note FROM attendance WHERE student_id = $1 ORDER BY date DESC LIMIT 30',
      [studentId],
    ),
    query<SubjectAverage>(
      `SELECT sub.name AS subject_name, sub.color,
              CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacher_name,
              ROUND(AVG(g.score / a.max_score * 100), 1) AS average_percent
         FROM students st
         JOIN class_subjects cs ON cs.class_id = st.class_id
         JOIN subjects sub ON sub.id = cs.subject_id
         LEFT JOIN users t ON t.id = cs.teacher_id
         LEFT JOIN assessments a ON a.class_subject_id = cs.id
         LEFT JOIN grades g ON g.assessment_id = a.id AND g.student_id = st.user_id
        WHERE st.user_id = $1
        GROUP BY sub.name, sub.color, t.id, t.first_name, t.last_name
        ORDER BY sub.name`,
      [studentId],
    ),
    query<StudentGrade>(
      `SELECT a.id AS assessment_id, a.title, a.type, sub.name AS subject_name, sub.color, a.due_date,
              g.score, a.max_score, ROUND(g.score / a.max_score * 100, 1) AS percent, g.feedback
         FROM students st
         JOIN class_subjects cs ON cs.class_id = st.class_id
         JOIN subjects sub ON sub.id = cs.subject_id
         JOIN assessments a ON a.class_subject_id = cs.id
         JOIN grades g ON g.assessment_id = a.id AND g.student_id = st.user_id
        WHERE st.user_id = $1
        ORDER BY COALESCE(a.due_date, a.created_at::date) DESC, a.id DESC`,
      [studentId],
    ),
    query<Assessment>(
      `${ASSESSMENT_SELECT}
        WHERE cs.class_id = (SELECT class_id FROM students WHERE user_id = $1)
          AND a.due_date >= CURRENT_DATE
          AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.assessment_id = a.id AND g.student_id = $1)
        ORDER BY a.due_date LIMIT 50`,
      [studentId],
    ),
    query<Invoice>(`${INVOICE_SELECT} WHERE ib.student_id = $1 ORDER BY ib.due_date DESC`, [studentId]),
  ]);

  const graded = subjectAverages.filter((s) => s.averagePercent !== null);
  const overallAverage = graded.length
    ? Math.round((graded.reduce((sum, s) => sum + (s.averagePercent ?? 0), 0) / graded.length) * 10) / 10
    : null;

  return {
    student,
    attendance: attendance!,
    recentAttendance,
    subjectAverages,
    overallAverage,
    grades,
    upcoming,
    invoices,
    feeBalance: invoices.reduce((sum, i) => sum + i.balance, 0),
  };
}

studentsRouter.get('/:id/overview', async (req, res) => {
  const studentId = intParam(req.params.id);
  await assertCanViewStudent(me(req), studentId);
  res.json(await buildOverview(studentId));
});
