import { Router } from 'express';
import type {
  AttendanceReport, AttendanceReportRow, FeeSummary, FinancialReport, StudentReportRow, TeacherReportRow,
} from '../../../shared/types.js';
import { query, queryOne } from '../db/pool.js';
import { assertCanTakeAttendance } from '../lib/access.js';
import { forbidden, intParam, parse } from '../lib/http.js';
import { PAYMENT_SELECT, STUDENT_SELECT } from '../lib/sql.js';
import { isoDate } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

/** Data for the Reports section. The client turns these into tables, CSV/Excel downloads and printable PDFs. */
export const reportsRouter = Router();

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function range(q: Record<string, unknown>, defaultDays = 30) {
  const to = q.to ? parse(isoDate, q.to) : today();
  const from = q.from ? parse(isoDate, q.from) : daysAgo(defaultDays);
  return { from, to };
}

reportsRouter.get('/attendance', requireRole('admin', 'teacher'), async (req, res) => {
  const user = me(req);
  const { from, to } = range(req.query);
  const params: unknown[] = [from, to];
  const where: string[] = [];
  if (req.query.classId) {
    const classId = intParam(req.query.classId, 'classId');
    await assertCanTakeAttendance(user, classId);
    params.push(classId);
    where.push(`s.class_id = $${params.length}`);
  } else if (user.role === 'teacher') {
    params.push(user.id);
    where.push(`s.class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = $${params.length}
                               UNION SELECT class_id FROM class_subjects WHERE teacher_id = $${params.length})`);
  }
  if (req.query.studentId) {
    params.push(intParam(req.query.studentId, 'studentId'));
    where.push(`s.user_id = $${params.length}`);
  }
  if (req.query.teacherId && user.role === 'admin') {
    params.push(intParam(req.query.teacherId, 'teacherId'));
    where.push(`a.recorded_by = $${params.length}`);
  }
  const whereSql = where.length ? `AND ${where.join(' AND ')}` : '';
  const rows = await query<AttendanceReportRow>(
    `SELECT u.id AS student_id, u.first_name || ' ' || u.last_name AS name, s.admission_no, c.name AS class_name,
            COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present,
            COUNT(a.id) FILTER (WHERE a.status = 'late')::int AS late,
            COUNT(a.id) FILTER (WHERE a.status = 'absent')::int AS absent,
            COUNT(a.id) FILTER (WHERE a.status = 'excused')::int AS excused,
            COUNT(a.id)::int AS total,
            ROUND(100.0 * COUNT(a.id) FILTER (WHERE a.status IN ('present','late')) / NULLIF(COUNT(a.id), 0), 1) AS rate
       FROM students s JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN attendance a ON a.student_id = s.user_id AND a.date BETWEEN $1 AND $2
      WHERE u.is_active ${whereSql}
      GROUP BY u.id, u.first_name, u.last_name, s.admission_no, c.name, c.grade_level
      ORDER BY c.grade_level, c.name, u.last_name, u.first_name`,
    params,
  );
  const daily = await query<AttendanceReport['daily'][number]>(
    `SELECT a.date,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present, COUNT(*) FILTER (WHERE a.status = 'late')::int AS late,
            COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent, COUNT(*) FILTER (WHERE a.status = 'excused')::int AS excused,
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('present','late')) / NULLIF(COUNT(*), 0), 1) AS rate
       FROM attendance a JOIN students s ON s.user_id = a.student_id JOIN users u ON u.id = s.user_id
      WHERE a.date BETWEEN $1 AND $2 ${whereSql}
      GROUP BY a.date ORDER BY a.date`,
    params,
  );
  res.json({ from, to, rows, daily } satisfies AttendanceReport);
});

reportsRouter.get('/financial', requireRole('admin'), async (req, res) => {
  const { from, to } = range(req.query, 90);
  const classFilter = req.query.classId ? intParam(req.query.classId, 'classId') : null;
  const [summary, period, byMonth, byMethod, byClass, payments] = await Promise.all([
    queryOne<FeeSummary>(
      `SELECT COALESCE(SUM(ib.amount), 0) AS billed, COALESCE(SUM(ib.amount_paid), 0) AS collected, COALESCE(SUM(ib.balance), 0) AS outstanding,
              COUNT(*) FILTER (WHERE ib.status = 'overdue')::int AS overdue_count,
              COALESCE(SUM(ib.balance) FILTER (WHERE ib.status = 'overdue'), 0) AS overdue_amount
         FROM invoice_balances ib JOIN students s ON s.user_id = ib.student_id
        WHERE $1::int IS NULL OR s.class_id = $1`,
      [classFilter],
    ),
    queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) AS total FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN students s ON s.user_id = i.student_id
        WHERE p.paid_on BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.class_id = $3)`,
      [from, to, classFilter],
    ),
    query<{ month: string; collected: number }>(
      `SELECT to_char(date_trunc('month', p.paid_on), 'YYYY-MM') AS month, SUM(p.amount) AS collected
         FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN students s ON s.user_id = i.student_id
        WHERE p.paid_on BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.class_id = $3)
        GROUP BY 1 ORDER BY 1`,
      [from, to, classFilter],
    ),
    query<FinancialReport['byMethod'][number]>(
      `SELECT p.method, SUM(p.amount) AS collected, COUNT(*)::int AS count
         FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN students s ON s.user_id = i.student_id
        WHERE p.paid_on BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.class_id = $3)
        GROUP BY p.method ORDER BY collected DESC`,
      [from, to, classFilter],
    ),
    query<FinancialReport['byClass'][number]>(
      `SELECT COALESCE(c.name, 'No class') AS class_name, SUM(ib.amount) AS billed, SUM(ib.amount_paid) AS collected, SUM(ib.balance) AS outstanding
         FROM invoice_balances ib JOIN students s ON s.user_id = ib.student_id LEFT JOIN classes c ON c.id = s.class_id
        WHERE $1::int IS NULL OR s.class_id = $1
        GROUP BY c.name, c.grade_level ORDER BY c.grade_level NULLS LAST, c.name`,
      [classFilter],
    ),
    query<FinancialReport['payments'][number]>(
      `SELECT x.*, u.first_name || ' ' || u.last_name AS student_name, s.admission_no, c.name AS class_name, i.title AS invoice_title
         FROM (${PAYMENT_SELECT}) x
         JOIN invoices i ON i.id = x.invoice_id JOIN students s ON s.user_id = i.student_id JOIN users u ON u.id = s.user_id
         LEFT JOIN classes c ON c.id = s.class_id
        WHERE x.paid_on BETWEEN $1 AND $2 AND ($3::int IS NULL OR s.class_id = $3)
        ORDER BY x.paid_on DESC, x.id DESC LIMIT 2000`,
      [from, to, classFilter],
    ),
  ]);
  const report: FinancialReport = { from, to, summary: summary!, collectedInPeriod: period!.total, byMonth, byMethod, byClass, payments };
  res.json(report);
});

reportsRouter.get('/teachers', requireRole('admin'), async (_req, res) => {
  res.json(await query<TeacherReportRow>(
    `SELECT u.id, u.first_name || ' ' || u.last_name AS name, t.employee_no, t.specialization,
            (SELECT string_agg(c.name, ', ') FROM classes c WHERE c.homeroom_teacher_id = u.id) AS homeroom_class,
            (SELECT COUNT(*)::int FROM class_subjects cs WHERE cs.teacher_id = u.id) AS courses,
            (SELECT COUNT(DISTINCT cs.class_id)::int FROM class_subjects cs WHERE cs.teacher_id = u.id) AS classes,
            (SELECT COUNT(*)::int FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id WHERE cs.teacher_id = u.id) AS lessons_per_week,
            (SELECT COUNT(DISTINCT st.user_id)::int FROM class_subjects cs JOIN students st ON st.class_id = cs.class_id WHERE cs.teacher_id = u.id) AS students,
            (SELECT ROUND(AVG(g.score / a.max_score * 100), 1) FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id
               JOIN grades g ON g.assessment_id = a.id WHERE cs.teacher_id = u.id) AS average_percent,
            (SELECT COUNT(*)::int FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id
              WHERE cs.teacher_id = u.id AND a.due_date <= CURRENT_DATE
                AND (SELECT COUNT(*) FROM grades g WHERE g.assessment_id = a.id) < (SELECT COUNT(*) FROM students st WHERE st.class_id = cs.class_id)) AS ungraded_assessments
       FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.is_active
      ORDER BY u.last_name, u.first_name`,
  ));
});

reportsRouter.get('/students', requireRole('admin', 'teacher'), async (req, res) => {
  const user = me(req);
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.query.classId) {
    params.push(intParam(req.query.classId, 'classId'));
    where.push(`s.class_id = $${params.length}`);
  }
  if (user.role === 'teacher') {
    params.push(user.id);
    where.push(`(c.homeroom_teacher_id = $${params.length} OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = s.class_id AND cs.teacher_id = $${params.length}))`);
  }
  if (req.query.status === 'active' || req.query.status === 'inactive') where.push(`u.is_active = ${req.query.status === 'active'}`);
  const rows = await query<StudentReportRow>(
    `SELECT x.*,
            COALESCE((SELECT string_agg(pu.first_name || ' ' || pu.last_name || ' (' || g.relationship || ')', '; ')
                        FROM guardians g JOIN users pu ON pu.id = g.parent_id WHERE g.student_id = x.id), '') AS guardians,
            COALESCE((SELECT string_agg(pu.phone, '; ') FROM guardians g JOIN users pu ON pu.id = g.parent_id
                       WHERE g.student_id = x.id AND pu.phone IS NOT NULL), '') AS guardian_phones,
            (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('present','late')) / NULLIF(COUNT(*), 0), 1)
               FROM attendance a WHERE a.student_id = x.id) AS attendance_rate,
            (SELECT ROUND(AVG(g.score / a.max_score * 100), 1) FROM grades g JOIN assessments a ON a.id = g.assessment_id
              WHERE g.student_id = x.id) AS average_percent,
            ${user.role === 'admin' ? '(SELECT COALESCE(SUM(ib.balance), 0) FROM invoice_balances ib WHERE ib.student_id = x.id)' : '0'} AS fee_balance
       FROM (${STUDENT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}) x
      ORDER BY x.class_name NULLS LAST, x.last_name, x.first_name`,
    params,
  );
  if (user.role !== 'admin' && rows.some((r) => r.feeBalance)) throw forbidden();
  res.json(rows);
});
