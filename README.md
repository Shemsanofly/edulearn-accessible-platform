# 🎓 EduLearn — School Management System

An accessible, full-stack school management system for **administrators, teachers, students and parents**.
Built with **TypeScript** end to end and **PostgreSQL** for storage.

| | |
|---|---|
| **Frontend** | React 19 · Vite · TanStack Query · React Router · lucide icons |
| **Backend** | Node.js · Express 5 · zod validation · JWT sessions in httpOnly cookies |
| **Database** | PostgreSQL 14+ (plain SQL migrations, no ORM) |
| **Tests** | Vitest + Supertest integration tests against a real database |

## What it does

**Administrators**
- Dashboard with live attendance, fee collection, enrolment and alerts for missing registers
- Enrol and manage students, teachers and parents (temporary passwords generated automatically, reset in one click)
- Classes, subjects, terms and course assignments (which teacher teaches what)
- Timetable builder that **refuses clashes** — a class, teacher or room can't be double-booked
- Fees: bill a whole class in one go, record part-payments, see overdue balances
- School-wide announcements and calendar

**Teachers**
- Today's lessons at a glance, with one-tap access to the register
- Attendance register with keyboard shortcuts (P / L / A / E) and history
- Spreadsheet-style gradebook: create assessments, type scores, see averages, export CSV
- Message parents and students; post announcements to their classes

**Students**
- Personal timetable, upcoming assignments, grades with teacher feedback, attendance record, fees

**Parents**
- One card per child with average, attendance, upcoming work and fee balance
- Full progress view per child and direct messaging with their teachers

**For everyone**
- `Ctrl/⌘ + K` command palette to jump anywhere or find a person or class
- Accessibility menu: text size, dark mode, high contrast, a highly-legible font (Atkinson Hyperlegible) and reduced motion — saved to the user's account
- Keyboard navigable, skip link, labelled controls, focus-trapped dialogs, screen-reader announcements
- Responsive layout that works on phones

Each person only ever sees what they should: access rules are enforced on the server (e.g. teachers see only
students they teach, parents only their own children).

## Quick start

### Option A — Docker (easiest)

```bash
docker compose up --build
```

Then load the demo school (optional):

```bash
docker compose exec app node server/dist/db/cli.js seed
```

Open http://localhost:4000.

### Option B — Local Node + PostgreSQL

Requirements: Node 20+ and PostgreSQL 14+.

1. Create a database and user:

   ```bash
   psql -U postgres -c "CREATE ROLE edulearn LOGIN PASSWORD 'edulearn' CREATEDB;"
   ```

   ```bash
   psql -U postgres -c "CREATE DATABASE edulearn OWNER edulearn;"
   ```

2. Install and configure:

   ```bash
   npm install
   ```

   ```bash
   cp .env.example .env
   ```

3. Create the tables and load the demo school:

   ```bash
   npm run db:seed
   ```

4. Start the API (port 4000) and the web app (port 5173) together:

   ```bash
   npm run dev
   ```

Open http://localhost:5173.

### Demo accounts

All demo accounts use the password **`password123`** (or click one on the sign-in page):

| Role | Email | Who |
|---|---|---|
| Administrator | `admin@edulearn.school` | Nadia Bello |
| Teacher | `teacher@edulearn.school` | Sarah Johnson — maths, class teacher of Grade 10A |
| Student | `student@edulearn.school` | Alex Rivera — Grade 10A |
| Parent | `parent@edulearn.school` | Maria Rivera — parent of Alex and Sofia |

The demo data (≈120 students, 6 classes, a full timetable, a term of attendance, grades and fees) is generated
relative to today's date, so it always looks current.

## Using it for a real school

1. Set a strong `JWT_SECRET` (32+ random characters) and `NODE_ENV=production`.
2. Create only an administrator instead of the demo data:

   ```bash
   SEED_MODE=admin-only ADMIN_EMAIL=office@yourschool.org ADMIN_PASSWORD='a-strong-password' npm run db:seed
   ```

3. Sign in, then set up **Subjects & terms → Classes → Teachers → Students → Timetable**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web app with hot reload |
| `npm run build` | Production build (client → `client/dist`, server → `server/dist`) |
| `npm start` | Run the production server (also serves the web app) |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Migrate, then load demo data if the database is empty |
| `npm run db:reset` | ⚠️ Drop everything, migrate and re-seed |
| `npm test` | Integration tests (uses the `edulearn_test` database, or `TEST_DATABASE_URL`) |
| `npm run typecheck` | Type-check server and client |

## Project structure

```
├── shared/types.ts          # API contract shared by server and client
├── server/
│   ├── migrations/          # SQL migrations (applied in order, tracked in schema_migrations)
│   ├── src/
│   │   ├── routes/          # auth, students, teachers, parents, academics, attendance,
│   │   │                    # assessments, fees, communication, dashboard
│   │   ├── lib/access.ts    # who-can-see-what rules
│   │   ├── db/              # pool, migrator, seed, CLI
│   │   └── app.ts           # Express app
│   └── test/                # integration tests
├── client/src/
│   ├── pages/               # one file per screen
│   ├── components/          # layout, UI kit, dialogs, toasts, charts, command palette
│   ├── lib/                 # API client, auth, formatting, preferences
│   └── styles/index.css     # design tokens + components (light, dark, high-contrast)
└── legacy/                  # the original HTML prototype, kept for reference
```

## Database

Main tables: `users`, `students`, `teachers`, `guardians` (parent ↔ student), `classes`, `subjects`,
`class_subjects` (a subject taught to a class by a teacher), `timetable_slots`, `terms`, `attendance`,
`assessments`, `grades`, `invoices`, `payments`, `announcements`, `events`, `messages`.
The `invoice_balances` view derives paid / part-paid / overdue status. See `server/migrations/001_init.sql`.

To change the schema, add a new numbered file such as `server/migrations/002_add_library.sql`; it runs
automatically on the next start.

## License

MIT
