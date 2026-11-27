# 🎓 EduLearn — School Management System

A modern, bilingual (**English / Kiswahili**) school management platform that connects **administrators, teachers and
parents** (plus students), built for schools in **Zanzibar and Tanzania**. It runs in any browser on computers, tablets
and phones.

| | |
|---|---|
| **Frontend** | React 19 · Vite · TypeScript · TanStack Query · React Router |
| **Backend** | Node.js · Express 5 · TypeScript · zod validation · JWT sessions in httpOnly cookies |
| **Database** | PostgreSQL 14+ (plain SQL migrations) |
| **Tests** | Vitest + Supertest integration tests against a real database (142 tests) |

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
  **parents/guardians** (one parent ↔ many children), each with an **Import/Export** menu for adding or updating many
  people at once from Excel or CSV and exporting the list as Excel, CSV or PDF (see the
  [admin guide](#admin-guide-importing-students-teachers-and-parents))
- **Classes, subjects, academic years and terms**; class level names are configurable (Form / Standard / Grade)
- **Timetable** builder that refuses clashes (class, teacher or room double-booked)
- **Attendance** overview, history and reports
- **Examinations**: create an exam for chosen classes, enter marks in the gradebook, **configurable grading scales**
  (CSEE and PSLE included), automatic grades, **report cards** with class positions and class-teacher remarks,
  class performance, publish results to parents
- **Fees** in TZS: fee structures per level, bill a class without double billing, record (part-)payments, numbered
  **receipts**, outstanding balances, fee reminders, financial reports
- **Announcements**, calendar (incl. Tanzanian public holidays in the sample data), messages
- **Reports** with CSV export and print / save as PDF: attendance, academic, financial, teachers, students
- **Audit log** of important administrative actions, **school settings** (name, logo, motto, contacts, currency,
  default language, level label)

### Teachers (limited to their own classes and subjects)
Dashboard, my classes, attendance register (keyboard shortcuts P/L/A/E), gradebook, exam mark entry, assignments with
file attachments, timetable, class announcements, messages with parents, student profiles, class reports, and
an **Import/Export** menu (Excel, CSV and PDF) for marks and attendance (see the [teacher guide](#teacher-guide-excel-templates)).
Teachers cannot see finances, create accounts or change school settings.

### Import/Export across school records

Management pages have the same **Import/Export** menu (import from CSV or Excel, export to CSV, Excel or PDF, CSV or
Excel templates). Where a page manages several datasets, choose one under **Records** at the top of the menu first
(for example invoices, payments or fee structures). Students, teachers and parents use the matching described in the
[admin guide](#admin-guide-importing-students-teachers-and-parents); the areas below use Record IDs and import keys.

| Area | Datasets |
|---|---|
| People | Students and class subject lists (on a class's page), parent-child links, invitations |
| Classes and academic setup | Classes, subject/teacher assignments, subjects, terms, academic years, grading scales |
| Teaching | Timetable, assessments/assignments, exams, report-card remarks |
| Finance | Fee structures, invoices, payments |
| School communication | Announcements, calendar events |

The existing marks and attendance tools remain on their respective pages. Personal profile settings, branding,
individual messages, and file attachments continue to use their dedicated forms.

1. **Template** downloads 100 blank entry rows and column instructions; the Excel template also has reference sheets
   listing the IDs of linked records you may use. Insert additional rows if needed, up to 1,000. Import referenced records first: for example,
   create classes before students, then parents before parent-child links.
2. Fill required columns marked `*`. Use `YYYY-MM-DD` dates, `HH:MM` times, `TRUE`/`FALSE`, and `|` between list items.
   Nested grading bands and invitation access details use JSON; the template includes examples.
3. Keep **Record ID** to update an existing record. For a new record leave ID blank and provide a stable, unique
   **Import key** (particularly for invoices, payments, assessments, timetable entries, exams, events and notices).
   People, classes, subjects, years and terms can also match their existing unique email/code/name. Reuse the same
   import key when uploading a corrected file; changing the key means a new record.
4. **Import** checks every row and shows new, changed, unchanged and invalid records. Nothing is saved until you
   confirm. Changes require overwrite confirmation. Blank cells preserve saved values; omitted rows are not deleted.
   Excel and CSV **exports** download all permitted records in that area (or the current class/course/exam where shown), including
   IDs, so they can be edited and imported again (PDF is for printing). Search and pagination do not limit these exports.

Permissions match the normal forms: administrators manage school records; teachers can import their assigned
assessments, class announcements and class-teacher report remarks, and export their permitted working records.
Parents and students cannot access management imports. Timetable clashes, class capacity, unique identifiers,
linked records, grading bands, exam rules and payment balances are validated. Each batch saves atomically and is
audited; a changed database requires a fresh review. Uploading an unchanged file again creates no duplicate records.
Existing invoices and payments are read-only during import. Importing fee structures does not issue invoices or
publish exam results automatically.

New accounts return a **one-time credentials download** after saving. Existing passwords are never exported or
changed by import. New invitations similarly return a one-time links download; bulk import does not send emails.
Download these files before closing the result and share privately. Use the normal password reset or invitation
resend action if the one-time file is lost. Import logs contain no passwords or invitation tokens.

Migrations `005_record_imports.sql` (duplicate-upload tracking) and `006_people_imports.sql` run automatically on
server startup. After
pulling dependency changes, run `npm ci` and restart `npm run dev` (or rebuild your deployment).

### Teacher guide: Excel templates
Use Excel (or any spreadsheet that saves CSV) when it's easier to fill in marks or a register offline. The
**Gradebook** (open a course) and **Attendance** pages have an **Import/Export** button that opens this menu:

| Group | Options | What they do |
|---|---|---|
| **Import from file** | Import from CSV · Import from Excel | Uploads a completed template, shows a review, and saves only when you confirm. |
| **Export** | Export to CSV · Excel · PDF | Downloads a copy: the whole gradebook for the course, or attendance for a date range. |
| **Download templates** | CSV template · Excel template | A file for one assessment (choose the term and assessment) or one register date. It lists your class with admission numbers and names, and fills in anything already saved. |

Excel templates have drop-down lists and lock the columns you mustn't change. CSV templates work in any spreadsheet
program: keep the first row (`EduLearn template — keep this row unchanged`) as it is, because it ties the file to
your class. Commas, semicolons and tabs are all understood, as are decimal commas (`7,5`).

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
1. Open **Import/Export › Import from Excel** (or CSV), choose the same assessment (or date) and pick your file, then **Check file**.
2. The review shows how many records are new, will change or are unchanged, and every problem with its Excel row,
   student and column. Fix problems in Excel and upload again: nothing is saved while any remain. **Download error
   report** gives you the list as a spreadsheet.
3. If the file would replace saved values, tick the box to confirm, then **Save import**.

Saving re-checks everything. If someone changed the same marks after your review, you'll be shown an updated review
instead. An import is saved completely or not at all. Uploading the same file twice changes nothing the second time.
Each import is recorded (who, when, what changed) and appears in the audit log.

Imported marks follow the normal process: exam results still reach parents only when the office publishes them.
Imported absences notify parents exactly like the on-screen register. Small corrections are still quickest on screen.

### Admin guide: importing students, teachers and parents
The **Students**, **Teachers** and **Parents** pages each have an **Import/Export** menu with the same three groups.
Use it to add a whole intake at once or to update many records together.

1. **Download templates › Excel template** (or CSV). The students template includes a list of your classes.
2. Fill in one person per row. Required for new people: first name, last name and email. Students also take
   admission number, class, date of birth (YYYY-MM-DD or DD/MM/YYYY), gender, phone and address; teachers take
   employee number, specialization, qualification and start date; parents take their children's admission numbers
   (separated by `;`) and relationship (mother, father, guardian…).
3. **Import from file**, check the review and save. Every row is checked with the same rules as the on-screen form,
   and nothing is saved while any problem remains.

**How rows are matched:** students by admission number, teachers by employee number, parents by email. A row with a
number the school doesn't have yet creates a new person with that number; leave it blank to have one assigned
(STU-…, TCH-…). Changes to existing people are listed field by field and need your confirmation before saving.

**To update existing people**, choose **Export › Excel** (or CSV), edit the file and import it again; Excel and CSV
exports are signed templates. PDF exports are for printing only. A blank cell keeps what is saved.

**New accounts** get a temporary password, shown once on the success screen with **Download sign-in details**.
Share each one privately; passwords are not stored in the import record and can't be shown again (use **Reset password**
on the person's row if needed). Administrator accounts can't be created by import; invite them instead.

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
│   ├── migrations/            # 001_init.sql … 006_people_imports.sql (applied automatically on start)
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
the administrator), `data_imports` (each import from Excel or CSV: who, when, counts and the before/after of every changed record).
A grade is either a score or a status (`absent` / `exempt`).

Add a schema change as a new numbered file (e.g. `server/migrations/007_library.sql`); it runs on the next start.
Upgrading an existing installation only needs a restart: `003_invitations.sql` adds the `invitations` table and
`004_imports.sql` adds grade statuses and the `data_imports` table, `005_record_imports.sql` adds import keys for
school records and `006_people_imports.sql` records student, teacher and parent imports. None of them changes existing
rows.

## Fonts, icons and images

Interface text uses [Manrope](https://fonts.google.com/specimen/Manrope); large website and sign-in headlines use
[Fraunces](https://fonts.google.com/specimen/Fraunces); the "readable font" setting uses
[Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible). All three are served by Google Fonts
under the SIL Open Font License. Icons come from [Lucide](https://lucide.dev) (ISC licence). The project contains no
third-party photographs; the only image asset is the EduLearn favicon (`client/public/favicon.svg`).

## License

MIT
