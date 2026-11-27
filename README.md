# 🎓 EduLearn — School Management System

A modern, bilingual (**English / Kiswahili**) school management platform that connects **administrators, teachers and
parents** (plus students), built for schools in **Zanzibar and Tanzania**. It runs in any browser on computers, tablets
and phones.

| | |
|---|---|
| **Frontend** | React 19 · Vite · TypeScript · TanStack Query · React Router |
| **Backend** | Node.js · Express 5 · TypeScript · zod validation · JWT sessions in httpOnly cookies |
| **Database** | PostgreSQL 14+ (plain SQL migrations) |
| **Tests** | Vitest + Supertest integration tests against a real database (79 tests) |

> The whole application is TypeScript. `legacy/` holds the original HTML prototype for reference only;
> `.gitattributes` excludes it from GitHub's language statistics.

## Features

### Public website
A landing page (`/home`) with features, how it works, how to get an account, about, and a contact form. Messages are
saved and appear for administrators under **Enquiries**. Sign-in (`/login`), account set-up (`/register`) and
password help share one layout: a short explanation of the page beside the form, which on phones gives way to the form
alone. The site uses no photographs or stock imagery.

### Accounts by invitation
Nobody can sign up on their own or choose their own role. An administrator opens **Invitations** (or **New → Invite
someone**), picks the role — parent, student, teacher or administrator — and the details that go with it (a student's
class, a parent's children, a teacher's subject). The person receives a one-time link (emailed when SMTP is set up;
otherwise the admin copies it and shares it privately), opens `/register`, confirms their name and chooses a password.
The role, email address and links to children come only from the invitation: anything else sent to the API is ignored.
Links expire (3–30 days, default 14), work once, can be re-sent (the old link stops working) or cancelled. Only a hash
of each token is stored. Administrators can still create accounts directly with a temporary password, as before.

### Administrators
- Dashboard: students, teachers, parents, classes, today's attendance, outstanding fees, academic performance of the
  latest exam, recent activity, alerts, and a "get your school set up" checklist for new schools
- **Students** (photos, admission numbers, classes, status, support needs), **teachers** (subjects & classes),
  **parents/guardians** (one parent ↔ many children)
- **Classes, subjects, academic years and terms**; class level names are configurable (Form / Standard / Grade)
- **Timetable** builder that refuses clashes (class, teacher or room double-booked)
- **Attendance** overview, history and reports
- **Examinations**: create an exam for chosen classes, enter marks in the gradebook, **configurable grading scales**
  (CSEE and PSLE included), automatic grades, **report cards** with class positions and class-teacher remarks,
  class performance, publish results to parents
- **Fees** in TZS: fee structures per level, bill a class without double billing, record (part-)payments, numbered
  **receipts**, outstanding balances, fee reminders, financial reports
- **Announcements**, calendar (incl. Tanzanian public holidays in the sample data), messages
- **Reports** with Excel (CSV) export and print / save as PDF: attendance, academic, financial, teachers, students
- **Audit log** of important administrative actions, **school settings** (name, logo, motto, contacts, currency,
  default language, level label)

### Teachers (limited to their own classes and subjects)
Dashboard, my classes, attendance register (keyboard shortcuts P/L/A/E), gradebook, exam mark entry, assignments with
file attachments, timetable, class announcements, messages with parents, student profiles, class reports, and
**Excel templates, import and export** for marks and attendance (see the [teacher guide](#teacher-guide-excel-templates)).
Teachers cannot see finances, create accounts or change school settings.

### Teacher guide: Excel templates
Use Excel when it's easier to fill in marks or a register offline. The **Gradebook** (open a course) and **Attendance**
pages each have three buttons:

| Button | What it does |
|---|---|
| **Template** | Downloads an `.xlsx` file for one assessment (choose the term and assessment) or one register date. It lists your class with admission numbers and names, and fills in anything already saved. |
| **Import** | Uploads the completed template, shows a review, and saves only when you confirm. |
| **Export** | Downloads a read-only copy: the whole gradebook for the course, or attendance for a date range. |

**Filling in marks**
- Type a mark from 0 to the maximum shown in the column heading. **0 is a mark**; a blank cell means "no change" and
  never erases or zeroes a saved mark.
- If a student missed the assessment or was excused, choose **ABSENT** or **EXEMPT** in the next column instead of a
  mark. (On screen you can type `ABS` or `EX` in a gradebook cell.) Absent and exempt don't count towards averages.
- The comment column is optional.

**Filling in attendance:** choose Present, Absent, Late or Excused for each student. Blank keeps what is saved.
Notes are optional.

**Don't** change admission numbers or names, add students, or copy rows between templates. Students are matched by
admission number and every file is tied to its class and assessment (or date), so a template for one class can't be
uploaded to another.

**Importing**
1. Click **Import**, choose the same assessment (or date) and pick your file, then **Check file**.
2. The review shows how many records are new, will change or are unchanged, and every problem with its Excel row,
   student and column. Fix problems in Excel and upload again: nothing is saved while any remain. **Download error
   report** gives you the list as a spreadsheet.
3. If the file would replace saved values, tick the box to confirm, then **Save import**.

Saving re-checks everything. If someone changed the same marks after your review, you'll be shown an updated review
instead. An import is saved completely or not at all. Uploading the same file twice changes nothing the second time.
Each import is recorded (who, when, what changed) and appears in the audit log.

Imported marks follow the normal process: exam results still reach parents only when the office publishes them.
Imported absences notify parents exactly like the on-screen register. Small corrections are still quickest on screen.

### Parents (designed for phones)
Switch between children; results and printable **report cards**, progress charts, attendance and late/absence
history, fees with **downloadable receipts**, assignments with deadlines and files, timetable, announcements, and
**notifications** for absences, results, fees, assignments and school news. Parents only ever see their own children.

### For everyone
English / Kiswahili switch, TZS amounts, dd/mm/yyyy dates, Tanzanian phone numbers (0777 123 456 → +255 777 123 456),
notification centre, `Ctrl/⌘ + K` search, `?` for keyboard shortcuts, a **New** menu with each role's most common tasks,
sortable tables (sorting runs on the server for paged lists), colour themes (ocean teal by default; academic navy, royal blue, school green, maroon, royal purple, terracotta and indigo to choose from), dark mode, large text,
high contrast, readable font, reduced motion, and a bottom tab bar on phones.

### Security
Passwords hashed with bcrypt · httpOnly session cookies · sessions revoked after a password change/reset or
deactivation · forgot-password links (single use, 30 minutes) · invitation-only registration with hashed, single-use,
expiring tokens · rate-limited sign-in, registration, reset and contact endpoints ·
role checks on **every** API route (hiding a button is never the only protection) · input validation with zod ·
audit log of administrative actions.

> **Payments:** the system records payments made at the bank, by mobile money or at the office.
> It does **not** take online payments — no payment gateway is integrated.

## Quick start

### Option A — Docker

```bash
docker compose up --build
```

Create the first administrator:

```bash
docker compose exec -e ADMIN_EMAIL=office@yourschool.ac.tz -e ADMIN_PASSWORD='a-strong-password' -e SCHOOL_NAME='Your School' app node server/dist/db/cli.js setup
```

Open http://localhost:4000.

### Option B — Node + PostgreSQL

Requirements: Node 20+ and PostgreSQL 14+.

```bash
psql -U postgres -c "CREATE ROLE edulearn LOGIN PASSWORD 'edulearn' CREATEDB;"
```

```bash
psql -U postgres -c "CREATE DATABASE edulearn OWNER edulearn;"
```

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
ADMIN_EMAIL=office@yourschool.ac.tz ADMIN_PASSWORD='a-strong-password' SCHOOL_NAME="Your School" npm run db:setup
```

```bash
npm run dev
```

Open http://localhost:5173 (the API runs on port 4000), sign in as that administrator and invite everyone else.

## Setting up a real school

1. Set a strong `JWT_SECRET` (32+ random characters), `NODE_ENV=production` and `APP_URL` (used in invitation and
   password-reset links).
2. Create the first administrator with `npm run db:setup` (see Quick start). It does nothing if the database already has
   accounts, and it never creates sample or shared accounts. `ADMIN_FIRST_NAME` / `ADMIN_LAST_NAME` are optional.
3. Sign in and follow the **"Let's get your school set up"** checklist: school settings → term → subjects → teachers →
   classes → who teaches what → students & parents → timetable → fee structures.
4. Invite people from **Invitations**. Optional: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` so
   invitations and "Forgot password" are emailed. Without SMTP, the admin copies invitation links by hand, and reset
   requests notify administrators, who can issue a temporary password.

## Sample data (local development only)

`npm run db:sample` loads **EduLearn Sample Secondary School**, a fictional school in Zanzibar with invented people,
marks and payments, into an **empty** database. It refuses to run when `NODE_ENV=production`, and the app no longer
advertises its accounts anywhere. The automated tests use the same fixture in their own database (`edulearn_test`).
Its accounts (`admin@`, `teacher@`, `parent@`, `student@edulearn.school`, and pupils/parents under
`students.` / `parents.edulearn.school`) share the password `password123` — never load it into a database people use.

## Turning off old demo accounts on an existing installation

Earlier versions loaded the demo school by default, with shared, publicly known passwords. Upgrading does **not** touch
your data. To disable those accounts safely:

```bash
npm run db:deactivate-demo
```

This is a dry run: it lists every active account whose email ends in `@edulearn.school`,
`@students.edulearn.school` or `@parents.edulearn.school`. Check the list, then apply it:

```bash
npm run db:deactivate-demo -- --apply
```

Matching accounts are deactivated and signed out everywhere, the old "demo" flag is cleared, and an entry is added to
the audit log. **Nothing is deleted** — an administrator can reactivate a student, teacher or parent account from its
list page. If you used the
demo school as your real school, first invite or create a real administrator for yourself, then run the command.
In Docker: `docker compose exec app node server/dist/db/cli.js deactivate-demo [--apply]`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web app with hot reload |
| `npm run build` | Production build (client → `client/dist`, server → `server/dist`) |
| `npm start` | Production server (also serves the web app) |
| `npm run db:migrate` | Apply pending SQL migrations (also done automatically on start) |
| `npm run db:setup` | Migrate, then create the first administrator if there are no accounts (`db:seed` is an alias) |
| `npm run db:sample` | Load the fictional sample school into an empty database (development only) |
| `npm run db:deactivate-demo` | List old shared demo accounts; add `-- --apply` to deactivate them (nothing is deleted) |
| `npm test` | Integration tests (database `edulearn_test`, or `TEST_DATABASE_URL`) |
| `npm run typecheck` | Type-check server and client |

## Project structure

```
├── shared/types.ts            # API contract shared by server and client
├── server/
│   ├── migrations/            # 001_init.sql … 004_imports.sql (applied automatically on start)
│   ├── src/routes/            # auth, students, teachers, parents, academics, attendance, assessments,
│   │                          # exams, fees, reports, communication, invitations, platform (settings, audit…)
│   ├── src/lib/               # access rules, audit, notifications, grading, phone numbers, settings
│   └── test/                  # integration tests
├── client/src/
│   ├── pages/                 # one file per screen, each with its English & Kiswahili text
│   ├── components/            # layout, UI kit, dialogs, charts, notifications, child switcher
│   ├── lib/                   # API client, auth, i18n, formatting, export helpers
│   └── styles/index.css       # design tokens (ocean teal, warm neutrals, dark "ink" surfaces), light & dark, print
└── legacy/                    # the original HTML prototype
```

## Database

Core: `users`, `students`, `teachers`, `guardians` (parent ↔ student, many-to-many), `classes`, `subjects`,
`class_subjects` (teacher ↔ subject ↔ class), `timetable_slots`, `academic_years`, `terms`, `attendance`,
`assessments` (assignments, quizzes, tests and exam papers), `grades`, `exams`, `exam_classes`, `report_remarks`,
`grading_scales`, `grade_bands`, `fee_structures`, `invoices`, `payments` (numbered receipts), `announcements`,
`events`, `messages`, `notifications`, `audit_logs`, `password_resets`, `user_photos`, `assessment_files`,
`school_settings`, `school_logo`, `contact_requests`, `invitations` (hashed one-time tokens, role and details fixed by
the administrator), `data_imports` (each Excel import: who, when, counts and the before/after of every changed record).
A grade is either a score or a status (`absent` / `exempt`).

Add a schema change as a new numbered file (e.g. `server/migrations/005_library.sql`); it runs on the next start.
Upgrading an existing installation only needs a restart: `003_invitations.sql` adds the `invitations` table and
`004_imports.sql` adds grade statuses and the `data_imports` table. Neither changes existing rows.

## Fonts, icons and images

Interface text uses [Manrope](https://fonts.google.com/specimen/Manrope); large website and sign-in headlines use
[Fraunces](https://fonts.google.com/specimen/Fraunces); the "readable font" setting uses
[Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible). All three are served by Google Fonts
under the SIL Open Font License. Icons come from [Lucide](https://lucide.dev) (ISC licence). The project contains no
third-party photographs; the only image asset is the EduLearn favicon (`client/public/favicon.svg`).

## License

MIT
