-- EduLearn 002 — upgrades the system into a configurable, multi-school-ready platform.
-- Additive only: existing tables and data keep working.

-- ---------------------------------------------------------------------------
-- School settings (one row). Replaces the SCHOOL_NAME / CURRENCY environment variables.
-- ---------------------------------------------------------------------------
CREATE TABLE school_settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name              text    NOT NULL DEFAULT 'My School',
  motto             text,
  address           text,
  phone             text,
  email             text,
  website           text,
  currency          text    NOT NULL DEFAULT 'TZS' CHECK (currency ~ '^[A-Z]{3}$'),
  default_language  text    NOT NULL DEFAULT 'en' CHECK (default_language IN ('en', 'sw')),
  level_label       text    NOT NULL DEFAULT 'Form',
  is_demo           boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO school_settings (id) VALUES (1);

CREATE TABLE school_logo (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data        bytea NOT NULL,
  mime        text  NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Academic years group terms.
-- ---------------------------------------------------------------------------
CREATE TABLE academic_years (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text    NOT NULL UNIQUE,
  starts_on   date    NOT NULL,
  ends_on     date    NOT NULL,
  is_current  boolean NOT NULL DEFAULT false,
  CHECK (ends_on > starts_on)
);
CREATE UNIQUE INDEX academic_years_one_current_idx ON academic_years (is_current) WHERE is_current;
ALTER TABLE terms ADD COLUMN academic_year_id integer REFERENCES academic_years(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Configurable grading (e.g. CSEE: A 75–100, B 65–74 …).
-- ---------------------------------------------------------------------------
CREATE TABLE grading_scales (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text    NOT NULL UNIQUE,
  description  text,
  is_default   boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX grading_scales_one_default_idx ON grading_scales (is_default) WHERE is_default;

CREATE TABLE grade_bands (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scale_id     integer NOT NULL REFERENCES grading_scales(id) ON DELETE CASCADE,
  grade        text    NOT NULL,
  min_percent  numeric(5,2) NOT NULL CHECK (min_percent BETWEEN 0 AND 100),
  max_percent  numeric(5,2) NOT NULL CHECK (max_percent BETWEEN 0 AND 100),
  points       numeric(4,1),
  remark       text,
  UNIQUE (scale_id, grade),
  CHECK (min_percent <= max_percent)
);

-- ---------------------------------------------------------------------------
-- Examinations. An exam creates one assessment per course in each class it covers,
-- so marks are entered in the existing gradebook.
-- ---------------------------------------------------------------------------
CREATE TABLE exams (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              text    NOT NULL,
  term_id           integer REFERENCES terms(id) ON DELETE SET NULL,
  grading_scale_id  integer REFERENCES grading_scales(id) ON DELETE SET NULL,
  starts_on         date    NOT NULL,
  ends_on           date    NOT NULL,
  max_marks         numeric(6,2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  published_at      timestamptz,
  created_by        integer REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE exam_classes (
  exam_id   integer NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id  integer NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, class_id)
);

ALTER TABLE assessments ADD COLUMN exam_id integer REFERENCES exams(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX assessments_exam_course_idx ON assessments (exam_id, class_subject_id) WHERE exam_id IS NOT NULL;

CREATE TABLE report_remarks (
  exam_id      integer NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id   integer NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  remark       text    NOT NULL,
  updated_by   integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Fee structures and receipts
-- ---------------------------------------------------------------------------
CREATE TABLE fee_structures (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text    NOT NULL,
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  level        smallint CHECK (level BETWEEN 1 AND 13), -- NULL = every level
  term_id      integer REFERENCES terms(id) ON DELETE SET NULL,
  due_date     date    NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ADD COLUMN fee_structure_id integer REFERENCES fee_structures(id) ON DELETE SET NULL;
-- Applying the same fee structure twice must not bill a student twice.
CREATE UNIQUE INDEX invoices_structure_student_idx ON invoices (fee_structure_id, student_id) WHERE fee_structure_id IS NOT NULL;

CREATE SEQUENCE receipt_seq;
ALTER TABLE payments ADD COLUMN receipt_no text NOT NULL UNIQUE
  DEFAULT ('RCT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0'));

-- The view must be rebuilt to expose the new invoice column.
DROP VIEW invoice_balances;
CREATE VIEW invoice_balances AS
SELECT i.*,
       COALESCE(p.paid, 0)::numeric(12,2)             AS amount_paid,
       (i.amount - COALESCE(p.paid, 0))::numeric(12,2) AS balance,
       CASE
         WHEN COALESCE(p.paid, 0) >= i.amount THEN 'paid'
         WHEN i.due_date < CURRENT_DATE THEN 'overdue'
         WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
         ELSE 'unpaid'
       END AS status
FROM invoices i
LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p
       ON p.invoice_id = i.id;

-- ---------------------------------------------------------------------------
-- Notifications, audit log, password resets, session revocation
-- ---------------------------------------------------------------------------
CREATE TYPE notification_type AS ENUM ('attendance', 'results', 'fees', 'announcement', 'assignment', 'message', 'system');

CREATE TABLE notifications (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    integer REFERENCES users(id) ON DELETE SET NULL,
  actor_name  text,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  summary     text NOT NULL,
  details     jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);

CREATE TABLE password_resets (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Bumped on password change/reset/deactivation so old sessions stop working.
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- Files: profile photos and assignment attachments (kept in the database so the
-- app needs no separate file storage to run).
-- ---------------------------------------------------------------------------
CREATE TABLE user_photos (
  user_id     integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data        bytea NOT NULL,
  mime        text  NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assessment_files (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id  integer NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  filename       text    NOT NULL,
  mime           text    NOT NULL,
  size           integer NOT NULL CHECK (size > 0),
  data           bytea   NOT NULL,
  uploaded_by    integer REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_files_assessment_idx ON assessment_files (assessment_id);

-- ---------------------------------------------------------------------------
-- Enquiries from the public website (contact form / demo requests)
-- ---------------------------------------------------------------------------
CREATE TABLE contact_requests (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         text NOT NULL DEFAULT 'contact' CHECK (kind IN ('contact', 'demo')),
  full_name    text NOT NULL,
  school_name  text,
  email        citext NOT NULL,
  phone        text,
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  handled_by   integer REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX contact_requests_created_idx ON contact_requests (created_at DESC);
