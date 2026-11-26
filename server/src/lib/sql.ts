/** Reusable SELECT fragments so every endpoint returns the same shapes. */

/** URL of a user's photo (with a version so browsers refresh it after a change), or NULL. Needs `u` = users. */
export const PHOTO_URL = `(SELECT '/api/users/' || u.id || '/photo?v=' || extract(epoch FROM ph.updated_at)::bigint
                            FROM user_photos ph WHERE ph.user_id = u.id)`;

export const STUDENT_SELECT = `
  SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active,
         s.admission_no, s.class_id, c.name AS class_name, s.gender, s.date_of_birth,
         s.accessibility_needs, ${PHOTO_URL} AS photo_url
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
         (SELECT ROUND(AVG(g.score / a.max_score * 100), 1) FROM grades g WHERE g.assessment_id = a.id) AS average_percent,
         a.exam_id, (SELECT e.name FROM exams e WHERE e.id = a.exam_id) AS exam_name,
         (SELECT COUNT(*)::int FROM assessment_files f WHERE f.assessment_id = a.id) AS file_count
    FROM assessments a
    JOIN class_subjects cs ON cs.id = a.class_subject_id
    JOIN classes c   ON c.id = cs.class_id
    JOIN subjects sub ON sub.id = cs.subject_id`;

export const INVOICE_SELECT = `
  SELECT ib.id, ib.student_id, u.first_name || ' ' || u.last_name AS student_name, s.admission_no,
         c.name AS class_name, ib.term_id, ib.title, ib.amount, ib.amount_paid, ib.balance,
         ib.due_date, ib.status, ib.notes, ib.created_at, ib.fee_structure_id
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

export const PAYMENT_SELECT = `
  SELECT p.id, p.invoice_id, p.amount, p.method, p.reference, p.paid_on, p.receipt_no,
         CASE WHEN ru.id IS NULL THEN NULL ELSE ru.first_name || ' ' || ru.last_name END AS recorded_by_name
    FROM payments p LEFT JOIN users ru ON ru.id = p.recorded_by`;

export const TERM_SELECT = `
  SELECT t.id, t.name, t.starts_on, t.ends_on, t.is_current, t.academic_year_id, ay.name AS academic_year_name
    FROM terms t LEFT JOIN academic_years ay ON ay.id = t.academic_year_id`;
