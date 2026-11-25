/** Reusable SELECT fragments so every endpoint returns the same shapes. */

export const STUDENT_SELECT = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active,
         s.admission_no, s.class_id, c.name AS class_name, s.gender, s.date_of_birth,
         s.accessibility_needs
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id`;

export const COURSE_SELECT = `
  SELECT cs.id, cs.class_id, c.name AS class_name, cs.subject_id, sub.name AS subject_name,
         sub.code AS subject_code, sub.color, cs.teacher_id,
         CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacher_name,
         (SELECT COUNT(*)::int FROM students st WHERE st.class_id = cs.class_id) AS student_count
    FROM class_subjects cs
    JOIN classes c   ON c.id = cs.class_id
    JOIN subjects sub ON sub.id = cs.subject_id
    LEFT JOIN users t ON t.id = cs.teacher_id`;

export const SLOT_SELECT = `
  SELECT ts.id, ts.class_subject_id AS course_id, ts.day_of_week,
         to_char(ts.starts_at, 'HH24:MI') AS starts_at, to_char(ts.ends_at, 'HH24:MI') AS ends_at,
         COALESCE(ts.room, c.room) AS room, c.id AS class_id, c.name AS class_name,
         sub.name AS subject_name, sub.color, cs.teacher_id,
         CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacher_name
    FROM timetable_slots ts
    JOIN class_subjects cs ON cs.id = ts.class_subject_id
    JOIN classes c   ON c.id = cs.class_id
    JOIN subjects sub ON sub.id = cs.subject_id
    LEFT JOIN users t ON t.id = cs.teacher_id`;

export const ASSESSMENT_SELECT = `
  SELECT a.id, a.class_subject_id AS course_id, c.name AS class_name, sub.name AS subject_name, sub.color,
         a.term_id, a.title, a.description, a.type, a.max_score, a.due_date,
         (SELECT COUNT(*)::int FROM grades g WHERE g.assessment_id = a.id) AS graded_count,
         (SELECT COUNT(*)::int FROM students st WHERE st.class_id = cs.class_id) AS student_count,
         (SELECT ROUND(AVG(g.score / a.max_score * 100), 1) FROM grades g WHERE g.assessment_id = a.id) AS average_percent
    FROM assessments a
    JOIN class_subjects cs ON cs.id = a.class_subject_id
    JOIN classes c   ON c.id = cs.class_id
    JOIN subjects sub ON sub.id = cs.subject_id`;

export const INVOICE_SELECT = `
  SELECT ib.id, ib.student_id, u.first_name || ' ' || u.last_name AS student_name, s.admission_no,
         c.name AS class_name, ib.term_id, ib.title, ib.amount, ib.amount_paid, ib.balance,
         ib.due_date, ib.status, ib.notes, ib.created_at
    FROM invoice_balances ib
    JOIN students s ON s.user_id = ib.student_id
    JOIN users u    ON u.id = ib.student_id
    LEFT JOIN classes c ON c.id = s.class_id`;

export const ANNOUNCEMENT_SELECT = `
  SELECT a.id, a.title, a.body, a.audience, a.class_id, c.name AS class_name, a.pinned, a.author_id,
         CASE WHEN u.id IS NULL THEN NULL ELSE u.first_name || ' ' || u.last_name END AS author_name,
         a.created_at
    FROM announcements a
    LEFT JOIN classes c ON c.id = a.class_id
    LEFT JOIN users u   ON u.id = a.author_id`;

export const EVENT_SELECT = `
  SELECT id, title, description, type, starts_on, ends_on, location FROM events`;
