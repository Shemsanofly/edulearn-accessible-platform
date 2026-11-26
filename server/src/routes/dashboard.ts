import { Router } from 'express';
import type {
  AdminDashboard, Assessment, AuditEntry, ChildSummary, Course, FeeSummary, ParentDashboard, SchoolEvent,
  SearchResults, StudentDashboard, StudentListItem, TeacherDashboard, TimetableSlot,
} from '../../../shared/types.js';
import { query, queryOne } from '../db/pool.js';
import { ASSESSMENT_SELECT, COURSE_SELECT, EVENT_SELECT, SLOT_SELECT, STUDENT_SELECT } from '../lib/sql.js';
import { me, requireRole } from '../middleware/auth.js';
import { visibleAnnouncements } from './communication.js';
import { buildOverview } from './students.js';

export const dashboardRouter = Router();

const isoDow = () => ((new Date().getDay() + 6) % 7) + 1;
const upcomingEvents = () =>
  query<SchoolEvent>(`${EVENT_SELECT} WHERE ends_on >= CURRENT_DATE ORDER BY starts_on LIMIT 6`);

dashboardRouter.get('/dashboard', async (req, res) => {
  const user = me(req);
  const [events, announcements] = await Promise.all([upcomingEvents(), visibleAnnouncements(user, 5)]);

  if (user.role === 'admin') {
    const [counts, today, trend, enrollment, fees, setup, latestExam, recentActivity, enquiries] = await Promise.all([
      queryOne<AdminDashboard['counts']>(
        `SELECT (SELECT COUNT(*)::int FROM students s JOIN users u ON u.id = s.user_id WHERE u.is_active) AS students,
                (SELECT COUNT(*)::int FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.is_active) AS teachers,
                (SELECT COUNT(*)::int FROM users WHERE role = 'parent' AND is_active) AS parents,
                (SELECT COUNT(*)::int FROM classes) AS classes`,
      ),
      queryOne<AdminDashboard['attendanceToday']>(
        `SELECT COUNT(*) FILTER (WHERE status = 'present')::int AS present,
                COUNT(*) FILTER (WHERE status = 'absent')::int AS absent,
                COUNT(*) FILTER (WHERE status = 'late')::int AS late,
                COUNT(*) FILTER (WHERE status = 'excused')::int AS excused,
                COUNT(*)::int AS total,
                ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('present','late')) / NULLIF(COUNT(*), 0), 1) AS rate,
                COUNT(DISTINCT class_id)::int AS classes_taken,
                (SELECT COUNT(*)::int FROM classes WHERE EXISTS (SELECT 1 FROM students s WHERE s.class_id = classes.id)) AS classes_total
           FROM attendance WHERE date = CURRENT_DATE`,
      ),
      query<{ date: string; rate: number | null }>(
        `SELECT d::date::text AS date,
                (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('present','late')) / NULLIF(COUNT(*), 0), 1)
                   FROM attendance a WHERE a.date = d::date) AS rate
           FROM generate_series(CURRENT_DATE - 20, CURRENT_DATE, interval '1 day') d
          WHERE extract(isodow FROM d) < 6
          ORDER BY d`,
      ),
      query<{ gradeLevel: number; count: number }>(
        `SELECT c.grade_level, COUNT(s.user_id)::int AS count FROM classes c LEFT JOIN students s ON s.class_id = c.id
          GROUP BY c.grade_level ORDER BY c.grade_level`,
      ),
      queryOne<FeeSummary>(
        `SELECT COALESCE(SUM(amount), 0) AS billed, COALESCE(SUM(amount_paid), 0) AS collected, COALESCE(SUM(balance), 0) AS outstanding,
                COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_count,
                COALESCE(SUM(balance) FILTER (WHERE status = 'overdue'), 0) AS overdue_amount
           FROM invoice_balances`,
      ),
      queryOne<AdminDashboard['setup']>(
        `SELECT (SELECT COUNT(*)::int FROM terms) AS terms,
                (SELECT COUNT(*)::int FROM subjects) AS subjects,
                (SELECT COUNT(*)::int FROM class_subjects) AS courses,
                (SELECT COUNT(*)::int FROM timetable_slots) AS lessons`,
      ),
      queryOne<{ id: number; name: string }>('SELECT id, name FROM exams WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1'),
      query<AuditEntry>('SELECT id, actor_id, actor_name, action, entity, entity_id, summary, created_at FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 6'),
      queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM contact_requests WHERE status = 'new'"),
    ]);
    const performanceSubjects = latestExam
      ? await query<AdminDashboard['performance']['subjects'][number]>(
          `SELECT sub.name AS subject_name, sub.color, ROUND(AVG(g.score / a.max_score * 100), 1) AS average_percent
             FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id JOIN subjects sub ON sub.id = cs.subject_id
             LEFT JOIN grades g ON g.assessment_id = a.id
            WHERE a.exam_id = $1 GROUP BY sub.name, sub.color ORDER BY sub.name`,
          [latestExam.id],
        )
      : [];
    const dashboard: AdminDashboard = {
      role: 'admin', counts: counts!, attendanceToday: today!, attendanceTrend: trend, enrollmentByGrade: enrollment,
      fees: fees!, setup: setup!, upcomingEvents: events, announcements,
      performance: { examName: latestExam?.name ?? null, subjects: performanceSubjects },
      recentActivity, newEnquiries: enquiries?.n ?? 0,
    };
    res.json(dashboard);
    return;
  }

  if (user.role === 'teacher') {
    const [todaySlots, courses, toGrade, homeroom] = await Promise.all([
      query<TimetableSlot>(`${SLOT_SELECT} WHERE cs.teacher_id = $1 AND ts.day_of_week = $2 ORDER BY ts.starts_at`, [user.id, isoDow()]),
      query<Course & { averagePercent: number | null }>(
        `SELECT x.*, (SELECT ROUND(AVG(g.score / a.max_score * 100), 1) FROM assessments a JOIN grades g ON g.assessment_id = a.id
                       WHERE a.class_subject_id = x.id) AS average_percent
           FROM (${COURSE_SELECT} WHERE cs.teacher_id = $1) x ORDER BY x.class_name, x.subject_name`,
        [user.id],
      ),
      query<Assessment>(
        `${ASSESSMENT_SELECT} WHERE cs.teacher_id = $1 AND (a.due_date IS NULL OR a.due_date <= CURRENT_DATE)
           AND (SELECT COUNT(*) FROM grades g WHERE g.assessment_id = a.id) < (SELECT COUNT(*) FROM students st WHERE st.class_id = cs.class_id)
         ORDER BY a.due_date NULLS LAST LIMIT 8`,
        [user.id],
      ),
      queryOne<NonNullable<TeacherDashboard['homeroom']>>(
        `SELECT c.id AS class_id, c.name AS class_name,
                (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id) AS student_count,
                EXISTS (SELECT 1 FROM attendance a WHERE a.class_id = c.id AND a.date = CURRENT_DATE) AS attendance_taken
           FROM classes c WHERE c.homeroom_teacher_id = $1 ORDER BY c.name LIMIT 1`,
        [user.id],
      ),
    ]);
    const dashboard: TeacherDashboard = {
      role: 'teacher', today: todaySlots, courses, toGrade, homeroom, upcomingEvents: events, announcements,
    };
    res.json(dashboard);
    return;
  }

  if (user.role === 'student') {
    const [overview, todaySlots] = await Promise.all([
      buildOverview(user.id),
      query<TimetableSlot>(
        `${SLOT_SELECT} WHERE c.id = (SELECT class_id FROM students WHERE user_id = $1) AND ts.day_of_week = $2 ORDER BY ts.starts_at`,
        [user.id, isoDow()],
      ),
    ]);
    const dashboard: StudentDashboard = { role: 'student', overview, today: todaySlots, upcomingEvents: events, announcements };
    res.json(dashboard);
    return;
  }

  // Parent
  const kids = await query<StudentListItem & { relationship: string }>(
    `${STUDENT_SELECT.replace('s.accessibility_needs', 's.accessibility_needs, g.relationship')}
       JOIN guardians g ON g.student_id = s.user_id
      WHERE g.parent_id = $1 ORDER BY u.first_name`,
    [user.id],
  );
  const children: ChildSummary[] = await Promise.all(
    kids.map(async ({ relationship, ...student }) => {
      const o = await buildOverview(student.id);
      return {
        student, relationship, attendanceRate: o.attendance.rate, overallAverage: o.overallAverage,
        feeBalance: o.feeBalance, upcomingCount: o.upcoming.length,
      };
    }),
  );
  const dashboard: ParentDashboard = { role: 'parent', children, upcomingEvents: events, announcements };
  res.json(dashboard);
});

/** Quick search across people and classes — powers the command palette. */
dashboardRouter.get('/search', requireRole('admin', 'teacher'), async (req, res) => {
  const user = me(req);
  const q = String(req.query.q ?? '').trim();
  const empty: SearchResults = { students: [], teachers: [], parents: [], classes: [] };
  if (q.length < 2) {
    res.json(empty);
    return;
  }
  const like = `%${q}%`;
  const teacherScope = user.role === 'teacher'
    ? `AND (c.homeroom_teacher_id = $2 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = s.class_id AND cs.teacher_id = $2))`
    : '';
  const [students, teachers, parents, classes] = await Promise.all([
    query<SearchResults['students'][number]>(
      `SELECT u.id, u.first_name || ' ' || u.last_name AS name, s.admission_no || COALESCE(' · ' || c.name, '') AS detail
         FROM students s JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id
        WHERE (u.first_name || ' ' || u.last_name ILIKE $1 OR s.admission_no ILIKE $1) ${teacherScope}
        ORDER BY u.last_name LIMIT 6`,
      user.role === 'teacher' ? [like, user.id] : [like],
    ),
    query<SearchResults['teachers'][number]>(
      `SELECT u.id, u.first_name || ' ' || u.last_name AS name, COALESCE(t.specialization, t.employee_no) AS detail
         FROM teachers t JOIN users u ON u.id = t.user_id
        WHERE u.first_name || ' ' || u.last_name ILIKE $1 OR t.employee_no ILIKE $1 ORDER BY u.last_name LIMIT 5`,
      [like],
    ),
    user.role === 'admin'
      ? query<SearchResults['parents'][number]>(
          `SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email AS detail FROM users u
            WHERE u.role = 'parent' AND (u.first_name || ' ' || u.last_name ILIKE $1 OR u.email ILIKE $1) ORDER BY u.last_name LIMIT 5`,
          [like],
        )
      : Promise.resolve([]),
    query<SearchResults['classes'][number]>(
      `SELECT c.id, c.name, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) || ' students' AS detail
         FROM classes c WHERE c.name ILIKE $1 ORDER BY c.grade_level, c.name LIMIT 5`,
      [like],
    ),
  ]);
  res.json({ students, teachers, parents, classes } satisfies SearchResults);
});

