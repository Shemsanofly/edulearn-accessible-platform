-- EduLearn School Management System — initial schema
-- Conventions: snake_case, integer identity PKs, timestamptz for instants, date for calendar days.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'student', 'parent');

CREATE TABLE users (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          citext      NOT NULL UNIQUE,
  password_hash  text        NOT NULL,
  role           user_role   NOT NULL,
  first_name     text        NOT NULL,
  last_name      text        NOT NULL,
  phone          text,
  is_active      boolean     NOT NULL DEFAULT true,
  preferences    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_name_idx ON users (lower(first_name || ' ' || last_name));

CREATE TABLE teachers (
  user_id         integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_no     text    NOT NULL UNIQUE,
  qualification   text,
  specialization  text,
  hired_on        date    NOT NULL DEFAULT CURRENT_DATE
);

-- Homeroom classes, e.g. "Grade 10A"
CREATE TABLE classes (
  id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                 text    NOT NULL UNIQUE,
  grade_level          smallint NOT NULL CHECK (grade_level BETWEEN 1 AND 13),
  section              text    NOT NULL DEFAULT 'A',
  room                 text,
  capacity             smallint NOT NULL DEFAULT 35 CHECK (capacity > 0),
  homeroom_teacher_id  integer REFERENCES teachers(user_id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE gender AS ENUM ('male', 'female', 'other', 'unspecified');

CREATE TABLE students (
  user_id              integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  admission_no         text    NOT NULL UNIQUE,
  class_id             integer REFERENCES classes(id) ON DELETE SET NULL,
  date_of_birth        date,
  gender               gender  NOT NULL DEFAULT 'unspecified',
  address              text,
  accessibility_needs  text[]  NOT NULL DEFAULT '{}',
  medical_notes        text,
  enrolled_on          date    NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX students_class_idx ON students (class_id);

CREATE TABLE guardians (
  parent_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id    integer NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  relationship  text    NOT NULL DEFAULT 'guardian',
  is_primary    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (parent_id, student_id)
);
CREATE INDEX guardians_student_idx ON guardians (student_id);

-- ---------------------------------------------------------------------------
-- Academics
-- ---------------------------------------------------------------------------
CREATE TABLE terms (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text    NOT NULL UNIQUE,
  starts_on   date    NOT NULL,
  ends_on     date    NOT NULL,
  is_current  boolean NOT NULL DEFAULT false,
  CHECK (ends_on > starts_on)
);
CREATE UNIQUE INDEX terms_one_current_idx ON terms (is_current) WHERE is_current;

CREATE TABLE subjects (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  code        text NOT NULL UNIQUE,
  color       text NOT NULL DEFAULT '#4361ee',
  description text
);

-- A subject taught to a class by a teacher ("course")
CREATE TABLE class_subjects (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id    integer NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  integer NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id  integer REFERENCES teachers(user_id) ON DELETE SET NULL,
  UNIQUE (class_id, subject_id)
);
CREATE INDEX class_subjects_teacher_idx ON class_subjects (teacher_id);

CREATE TABLE timetable_slots (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_subject_id  integer  NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  day_of_week       smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- ISO: 1 = Monday
  starts_at         time     NOT NULL,
  ends_at           time     NOT NULL,
  room              text,
  CHECK (ends_at > starts_at)
);
CREATE INDEX timetable_slots_day_idx ON timetable_slots (day_of_week, starts_at);

CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

CREATE TABLE attendance (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id   integer NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  class_id     integer NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date         date    NOT NULL,
  status       attendance_status NOT NULL,
  note         text,
  recorded_by  integer REFERENCES users(id) ON DELETE SET NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
CREATE INDEX attendance_class_date_idx ON attendance (class_id, date);

CREATE TYPE assessment_type AS ENUM ('assignment', 'quiz', 'test', 'exam', 'project');

CREATE TABLE assessments (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_subject_id  integer NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  term_id           integer REFERENCES terms(id) ON DELETE SET NULL,
  title             text    NOT NULL,
  description       text,
  type              assessment_type NOT NULL DEFAULT 'assignment',
  max_score         numeric(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  due_date          date,
  created_by        integer REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessments_class_subject_idx ON assessments (class_subject_id);
CREATE INDEX assessments_due_idx ON assessments (due_date);

CREATE TABLE grades (
  assessment_id  integer NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id     integer NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  score          numeric(6,2) NOT NULL CHECK (score >= 0),
  feedback       text,
  graded_by      integer REFERENCES users(id) ON DELETE SET NULL,
  graded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, student_id)
);
CREATE INDEX grades_student_idx ON grades (student_id);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id  integer NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  term_id     integer REFERENCES terms(id) ON DELETE SET NULL,
  title       text    NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date    date    NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_student_idx ON invoices (student_id);

CREATE TYPE payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'mobile_money', 'other');

CREATE TABLE payments (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id   integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  method       payment_method NOT NULL DEFAULT 'cash',
  reference    text,
  paid_on      date    NOT NULL DEFAULT CURRENT_DATE,
  recorded_by  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_invoice_idx ON payments (invoice_id);

-- Invoice balances, used everywhere fees are shown
CREATE VIEW invoice_balances AS
SELECT i.*,
       COALESCE(p.paid, 0)::numeric(12,2)             AS amount_paid,
       (i.amount - COALESCE(p.paid, 0))::numeric(12,2) AS balance,
       CASE
         WHEN COALESCE(p.paid, 0) >= i.amount THEN 'paid'
         WHEN COALESCE(p.paid, 0) > 0 AND i.due_date < CURRENT_DATE THEN 'overdue'
         WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
         WHEN i.due_date < CURRENT_DATE THEN 'overdue'
         ELSE 'unpaid'
       END AS status
FROM invoices i
LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p
       ON p.invoice_id = i.id;

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------
CREATE TYPE audience AS ENUM ('everyone', 'staff', 'students', 'parents', 'class');

CREATE TABLE announcements (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       text     NOT NULL,
  body        text     NOT NULL,
  audience    audience NOT NULL DEFAULT 'everyone',
  class_id    integer  REFERENCES classes(id) ON DELETE CASCADE,
  pinned      boolean  NOT NULL DEFAULT false,
  author_id   integer  REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((audience = 'class') = (class_id IS NOT NULL))
);
CREATE INDEX announcements_created_idx ON announcements (created_at DESC);

CREATE TYPE event_type AS ENUM ('academic', 'exam', 'holiday', 'meeting', 'sports', 'other');

CREATE TABLE events (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       text       NOT NULL,
  description text,
  type        event_type NOT NULL DEFAULT 'other',
  starts_on   date       NOT NULL,
  ends_on     date       NOT NULL,
  location    text,
  created_by  integer    REFERENCES users(id) ON DELETE SET NULL,
  CHECK (ends_on >= starts_on)
);
CREATE INDEX events_dates_idx ON events (starts_on, ends_on);

CREATE TABLE messages (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject       text    NOT NULL,
  body          text    NOT NULL,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX messages_recipient_idx ON messages (recipient_id, created_at DESC);
CREATE INDEX messages_sender_idx ON messages (sender_id, created_at DESC);
