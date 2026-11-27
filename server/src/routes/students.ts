import { Router } from 'express';
import type {
  AttendanceRecord, AttendanceSummary, CreatedAccount, Guardian, Invoice, Paginated, StudentDetail,
  StudentGrade, StudentListItem, StudentOverview, SubjectAverage, Assessment,
} from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanViewStudent } from '../lib/access.js';
import { insertStudent, patchStudent, studentSchema } from '../lib/people.js';
import { audit } from '../lib/audit.js';
import { intParam, notFound, orderBy, pageParams, parse, provided } from '../lib/http.js';
import { ASSESSMENT_SELECT, INVOICE_SELECT, STUDENT_SELECT } from '../lib/sql.js';
import { me, requireRole } from '../middleware/auth.js';

export const studentsRouter = Router();


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
      `${STUDENT_SELECT} ${whereSql} ${orderBy(req.query, {
        name: 'u.last_name', firstName: 'u.first_name', admission: 's.admission_no', class: 'c.grade_level, c.name', dob: 's.date_of_birth', status: 'u.is_active',
      }, 'u.last_name, u.first_name', 'u.last_name, u.first_name')} LIMIT ${pageSize} OFFSET ${offset}`,
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
  const result = await transaction((db) => insertStudent(db, body));
  await audit(req, { action: 'create', entity: 'student', entityId: result.id, summary: `Enrolled ${body.firstName} ${body.lastName}` });
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
  await transaction((db) => patchStudent(db, studentId, body));
  const updated = await loadStudent(studentId);
  await audit(req, { action: 'update', entity: 'student', entityId: studentId, summary: `Updated ${updated!.firstName} ${updated!.lastName}`, details: { fields: Object.keys(body) } });
  res.json(updated);
});

studentsRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const studentId = intParam(req.params.id);
  const row = await queryOne<{ name: string }>("DELETE FROM users WHERE id = $1 AND role = 'student' RETURNING first_name || ' ' || last_name AS name", [studentId]);
  if (!row) throw notFound('Student');
  await audit(req, { action: 'delete', entity: 'student', entityId: studentId, summary: `Deleted student ${row.name}` });
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
              g.score, g.status, a.max_score, ROUND(g.score / a.max_score * 100, 1) AS percent, g.feedback
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
