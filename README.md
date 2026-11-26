# 🎓 EduLearn — School Management System

A modern, bilingual (**English / Kiswahili**) school management platform that connects **administrators, teachers and
parents** (plus students), built for schools in **Zanzibar and Tanzania**. It runs in any browser on computers, tablets
and phones.

| | |
|---|---|
| **Frontend** | React 19 · Vite · TypeScript · TanStack Query · React Router |
| **Backend** | Node.js · Express 5 · TypeScript · zod validation · JWT sessions in httpOnly cookies |
| **Database** | PostgreSQL 14+ (plain SQL migrations) |
| **Tests** | Vitest + Supertest integration tests against a real database (51 tests) |

> The whole application is TypeScript. `legacy/` holds the original HTML prototype for reference only;
> `.gitattributes` excludes it from GitHub's language statistics.

## Features

### Public website
A professional landing page (`/`) with features, how it works, benefits, about, and a contact / **request a demo**
form. Enquiries are saved and appear for administrators under **Enquiries**.

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
- **Announcements**, calendar (incl. Tanzanian public holidays in the demo), messages
- **Reports** with Excel (CSV) export and print / save as PDF: attendance, academic, financial, teachers, students
- **Audit log** of important administrative actions, **school settings** (name, logo, motto, contacts, currency,
  default language, level label)

### Teachers (limited to their own classes and subjects)
Dashboard, my classes, attendance register (keyboard shortcuts P/L/A/E), gradebook, exam mark entry, assignments with
file attachments, timetable, class announcements, messages with parents, student profiles, class reports.
Teachers cannot see finances, create accounts or change school settings.

### Parents (designed for phones)
Switch between children; results and printable **report cards**, progress charts, attendance and late/absence
history, fees with **downloadable receipts**, assignments with deadlines and files, timetable, announcements, and
**notifications** for absences, results, fees, assignments and school news. Parents only ever see their own children.

### For everyone
English / Kiswahili switch, TZS amounts, dd/mm/yyyy dates, Tanzanian phone numbers (0777 123 456 → +255 777 123 456),
notification centre, `Ctrl/⌘ + K` search, `?` for keyboard shortcuts, colour themes (navy by default), dark mode,
large text, high contrast, readable font, reduced motion, and a bottom tab bar on phones.

### Security
Passwords hashed with bcrypt · httpOnly session cookies · sessions revoked after a password change/reset or
deactivation · forgot-password links (single use, 30 minutes) · rate-limited sign-in, reset and contact endpoints ·
role checks on **every** API route (hiding a button is never the only protection) · input validation with zod ·
audit log of administrative actions.

> **Payments:** the system records payments made at the bank, by mobile money or at the office.
> It does **not** take online payments — no payment gateway is integrated.

## Quick start

### Option A — Docker

```bash
docker compose up --build
```

Load the demo school (optional):

```bash
docker compose exec app node server/dist/db/cli.js seed
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
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:5173 (the API runs on port 4000).

## Demo data and accounts

`npm run db:seed` creates **EduLearn Demo Secondary School**, a fictional school in Zanzibar. Every name, phone number,
mark and payment in it is invented, and the app shows a **"Demo data"** badge while it is loaded. The demo logins are
only offered on the sign-in page when demo data is present.

All demo accounts use the password **`password123`**:

| Role | Email | Who |
|---|---|---|
| Administrator | `admin@edulearn.school` | Salma Juma |
| Teacher | `teacher@edulearn.school` | Zuhura Hamad — Mathematics, class teacher of Form 2A |
| Parent | `parent@edulearn.school` | Mwanaisha Juma — mother of Ali (Form 2A) and Asha (Form 1A) |
| Student | `student@edulearn.school` | Ali Juma — Form 2A |

## Setting up a real school

1. Set a strong `JWT_SECRET` (32+ random characters), `NODE_ENV=production` and `APP_URL`.
2. Create only the administrator (no demo data):

   ```bash
   SEED_MODE=admin-only SCHOOL_NAME="Your School" ADMIN_EMAIL=office@yourschool.ac.tz ADMIN_PASSWORD='a-strong-password' npm run db:seed
   ```

3. Sign in and follow the **"Let's get your school set up"** checklist: school settings → term → subjects → teachers →
   classes → who teaches what → students & parents → timetable → fee structures.
4. Optional: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` so "Forgot password" sends emails.
   Without SMTP, reset requests notify administrators, who can issue a temporary password.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web app with hot reload |
| `npm run build` | Production build (client → `client/dist`, server → `server/dist`) |
| `npm start` | Production server (also serves the web app) |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Migrate, then load demo data if the database is empty |
| `npm run db:reset` | ⚠️ Drop everything, migrate and re-seed |
| `npm test` | Integration tests (database `edulearn_test`, or `TEST_DATABASE_URL`) |
| `npm run typecheck` | Type-check server and client |

## Project structure

```
├── shared/types.ts            # API contract shared by server and client
├── server/
│   ├── migrations/            # 001_init.sql, 002_school_platform.sql (applied automatically on start)
│   ├── src/routes/            # auth, students, teachers, parents, academics, attendance, assessments,
│   │                          # exams, fees, reports, communication, platform (settings, notifications, audit…)
│   ├── src/lib/               # access rules, audit, notifications, grading, phone numbers, settings
│   └── test/                  # integration tests
├── client/src/
│   ├── pages/                 # one file per screen, each with its English & Kiswahili text
│   ├── components/            # layout, UI kit, dialogs, charts, notifications, child switcher
│   ├── lib/                   # API client, auth, i18n, formatting, export helpers
│   └── styles/index.css       # design tokens (navy / white / teal), light & dark, print styles
└── legacy/                    # the original HTML prototype
```

## Database

Core: `users`, `students`, `teachers`, `guardians` (parent ↔ student, many-to-many), `classes`, `subjects`,
`class_subjects` (teacher ↔ subject ↔ class), `timetable_slots`, `academic_years`, `terms`, `attendance`,
`assessments` (assignments, quizzes, tests and exam papers), `grades`, `exams`, `exam_classes`, `report_remarks`,
`grading_scales`, `grade_bands`, `fee_structures`, `invoices`, `payments` (numbered receipts), `announcements`,
`events`, `messages`, `notifications`, `audit_logs`, `password_resets`, `user_photos`, `assessment_files`,
`school_settings`, `school_logo`, `contact_requests`.

Add a schema change as a new numbered file (e.g. `server/migrations/003_library.sql`); it runs on the next start.

## License

MIT
