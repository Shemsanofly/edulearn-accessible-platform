import type pg from 'pg';
import { hashPassword } from '../lib/passwords.js';
import { pool, query, queryOne, transaction } from './pool.js';

/**
 * Seeds a realistic demo school. Dates are relative to today so the demo always looks "live".
 *
 * Set SEED_MODE=admin-only (with ADMIN_EMAIL / ADMIN_PASSWORD) to create just an administrator
 * for a real deployment.
 */

export const DEMO_PASSWORD = 'password123';

// Deterministic PRNG so every seed produces the same school.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261125);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const normal = (mean: number, sd: number) => {
  const u = 1 - rand();
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const todayUtc = () => new Date(`${iso(new Date())}T00:00:00Z`);

async function bulkInsert(db: pg.PoolClient, table: string, columns: string[], rows: unknown[][]) {
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = slice
      .map((row) => `(${row.map((v) => (params.push(v), `$${params.length}`)).join(', ')})`)
      .join(', ');
    await db.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}`, params);
  }
}

const FIRST = ['Liam', 'Olivia', 'Noah', 'Emma', 'Amara', 'Kofi', 'Aisha', 'Mateo', 'Zara', 'Yusuf', 'Mia', 'Ethan', 'Fatima',
  'Lucas', 'Chloe', 'Daniel', 'Nia', 'Omar', 'Grace', 'Leo', 'Hana', 'Samuel', 'Imani', 'Ravi', 'Sofia', 'Jonah', 'Layla',
  'Elijah', 'Priya', 'Kai', 'Ruth', 'Tariq', 'Esther', 'Diego', 'Naledi', 'Isaac', 'Mei', 'Caleb', 'Wanjiru', 'Felix',
  'Adaeze', 'Hugo', 'Saanvi', 'Malik', 'Freya', 'Bilal', 'Ivy', 'Jamal', 'Ayana', 'Theo'] as const;
const LAST = ['Okafor', 'Smith', 'Mensah', 'Garcia', 'Patel', 'Nguyen', 'Kim', 'Hassan', 'Brown', 'Mwangi', 'Silva', 'Ahmed',
  'Johnson', 'Kowalski', 'Osei', 'Lopez', 'Chen', 'Williams', 'Banda', 'Novak', 'Tanaka', 'Ali', 'Davis', 'Moyo', 'Rossi',
  'Mukherjee', 'Adeyemi', 'Martin', 'Kariuki', 'Haddad'] as const;

const SUBJECTS = [
  { name: 'Mathematics', code: 'MATH', color: '#4361ee', description: 'Algebra, geometry, statistics and calculus' },
  { name: 'English Language', code: 'ENG', color: '#e85d04', description: 'Reading, writing, grammar and literature' },
  { name: 'Physics', code: 'PHY', color: '#7209b7', description: 'Mechanics, energy, waves and electricity' },
  { name: 'Biology', code: 'BIO', color: '#2a9d8f', description: 'Cells, genetics, ecology and human biology' },
  { name: 'Chemistry', code: 'CHEM', color: '#d62828', description: 'Atoms, reactions and the periodic table' },
  { name: 'History', code: 'HIST', color: '#9c6644', description: 'World and regional history' },
  { name: 'Computer Science', code: 'CS', color: '#0077b6', description: 'Programming, algorithms and digital literacy' },
] as const;

const TEACHERS = [
  { first: 'Sarah', last: 'Johnson', email: 'teacher@edulearn.school', spec: 'Mathematics', qual: 'MSc Mathematics Education' },
  { first: 'David', last: 'Mensah', email: 'd.mensah@edulearn.school', spec: 'Mathematics', qual: 'BSc Mathematics, PGCE' },
  { first: 'Grace', last: 'Wanjiku', email: 'g.wanjiku@edulearn.school', spec: 'English Language', qual: 'MA English Literature' },
  { first: 'Peter', last: 'Lindqvist', email: 'p.lindqvist@edulearn.school', spec: 'English Language', qual: 'BA Linguistics, PGCE' },
  { first: 'Robert', last: 'Roberts', email: 'r.roberts@edulearn.school', spec: 'Physics', qual: 'PhD Applied Physics' },
  { first: 'Amina', last: 'Diallo', email: 'a.diallo@edulearn.school', spec: 'Biology', qual: 'MSc Molecular Biology' },
  { first: 'Carlos', last: 'Mendes', email: 'c.mendes@edulearn.school', spec: 'Chemistry', qual: 'BSc Chemistry, PGCE' },
  { first: 'Helen', last: 'Okoye', email: 'h.okoye@edulearn.school', spec: 'History', qual: 'MA Modern History' },
  { first: 'Kenji', last: 'Watanabe', email: 'k.watanabe@edulearn.school', spec: 'Computer Science', qual: 'MSc Computer Science' },
] as const;

const CLASSES = [
  { name: 'Grade 9A', grade: 9, section: 'A', room: 'B-101', homeroom: 3 },
  { name: 'Grade 9B', grade: 9, section: 'B', room: 'B-102', homeroom: 5 },
  { name: 'Grade 10A', grade: 10, section: 'A', room: 'B-204', homeroom: 0 },
  { name: 'Grade 10B', grade: 10, section: 'B', room: 'B-205', homeroom: 2 },
  { name: 'Grade 11A', grade: 11, section: 'A', room: 'C-301', homeroom: 4 },
  { name: 'Grade 12A', grade: 12, section: 'A', room: 'C-302', homeroom: 8 },
] as const;

const PERIODS = [
  ['08:00', '08:45'], ['08:50', '09:35'], ['09:40', '10:25'], ['10:45', '11:30'],
  ['11:35', '12:20'], ['13:00', '13:45'], ['13:50', '14:35'],
] as const;

const NEEDS = ['Sign language support', 'Extra time in exams', 'Large print materials', 'Screen reader', 'Hearing loop'];

async function seedAdminOnly() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) to create the first administrator.');
  }
  await query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES ($1, $2, 'admin', 'School', 'Administrator')`,
    [email.toLowerCase(), await hashPassword(password)],
  );
  console.log(`Created administrator ${email}.`);
}

export async function seed({ quiet = false }: { quiet?: boolean } = {}) {
  const log = quiet ? () => {} : console.log;
  const existing = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM users');
  if (existing && existing.n > 0) {
    log('The database already has users, so seeding was skipped. Use `npm run db:reset` to start over.');
    return;
  }
  if (process.env.SEED_MODE === 'admin-only') return seedAdminOnly();

  const hash = await hashPassword(DEMO_PASSWORD);
  const today = todayUtc();

  await transaction(async (db) => {
    const insertUser = async (email: string, role: string, first: string, last: string, phone: string | null) =>
      (await queryOne<{ id: number }>(
        'INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [email, hash, role, first, last, phone],
        db,
      ))!.id;
    const phone = () => `+1 555 ${String(Math.floor(between(100, 999)))} ${String(Math.floor(between(1000, 9999)))}`;

    // --- Staff -------------------------------------------------------------
    const adminId = await insertUser('admin@edulearn.school', 'admin', 'Nadia', 'Bello', phone());
    await insertUser('bursar@edulearn.school', 'admin', 'Thomas', 'Achebe', phone());

    const teacherIds: number[] = [];
    for (const [i, t] of TEACHERS.entries()) {
      const id = await insertUser(t.email, 'teacher', t.first, t.last, phone());
      await query(
        'INSERT INTO teachers (user_id, employee_no, qualification, specialization, hired_on) VALUES ($1, $2, $3, $4, $5)',
        [id, `TCH-2020-${String(i + 1).padStart(4, '0')}`, t.qual, t.spec, iso(addDays(today, -Math.floor(between(200, 3000))))],
        db,
      );
      teacherIds.push(id);
    }

    // --- Terms ---------------------------------------------------------------
    const termStart = addDays(today, -84);
    const termEnd = addDays(today, 28);
    const prevTermStart = addDays(termStart, -120);
    const currentTermId = (await queryOne<{ id: number }>(
      `INSERT INTO terms (name, starts_on, ends_on, is_current) VALUES ($1, $2, $3, true) RETURNING id`,
      [`Term 1 · ${termStart.getUTCFullYear()}/${String(termStart.getUTCFullYear() + 1).slice(2)}`, iso(termStart), iso(termEnd)],
      db,
    ))!.id;
    await query(
      'INSERT INTO terms (name, starts_on, ends_on, is_current) VALUES ($1, $2, $3, false)',
      [`Term 3 · ${prevTermStart.getUTCFullYear() - 1}/${String(prevTermStart.getUTCFullYear()).slice(2)}`, iso(prevTermStart), iso(addDays(termStart, -50))],
      db,
    );

    // --- Subjects & classes ----------------------------------------------
    const subjectIds: number[] = [];
    for (const s of SUBJECTS) {
      subjectIds.push((await queryOne<{ id: number }>(
        'INSERT INTO subjects (name, code, color, description) VALUES ($1, $2, $3, $4) RETURNING id',
        [s.name, s.code, s.color, s.description],
        db,
      ))!.id);
    }

    const classIds: number[] = [];
    for (const c of CLASSES) {
      classIds.push((await queryOne<{ id: number }>(
        'INSERT INTO classes (name, grade_level, section, room, capacity, homeroom_teacher_id) VALUES ($1, $2, $3, $4, 30, $5) RETURNING id',
        [c.name, c.grade, c.section, c.room, teacherIds[c.homeroom]],
        db,
      ))!.id);
    }

    // Each class takes every subject. Where a subject has two teachers, alternate classes between them.
    const teachersFor = (subject: string) => TEACHERS.map((t, i) => (t.spec === subject ? teacherIds[i] : -1)).filter((x) => x > 0);
    const courseIds: number[][] = []; // [classIdx][subjectIdx]
    for (const [ci, classId] of classIds.entries()) {
      courseIds[ci] = [];
      for (const [si, subjectId] of subjectIds.entries()) {
        const pool = teachersFor(SUBJECTS[si].name);
        // Ms. Johnson (demo teacher) takes Grade 10A/10B/11A maths.
        const teacher = SUBJECTS[si].code === 'MATH' ? (ci >= 2 && ci <= 4 ? pool[0] : pool[1]) : pool[ci % pool.length];
        courseIds[ci][si] = (await queryOne<{ id: number }>(
          'INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ($1, $2, $3) RETURNING id',
          [classId, subjectId, teacher],
          db,
        ))!.id;
      }
    }

    // --- Timetable: a Latin-square rotation means no subject is taught to two classes at once,
    // so no teacher is ever double-booked.
    const slotRows: unknown[][] = [];
    for (let ci = 0; ci < classIds.length; ci++) {
      for (let day = 1; day <= 5; day++) {
        for (let p = 0; p < PERIODS.length; p++) {
          // Shift by two periods each day so the week varies; classes stay distinct at every period.
          const si = (p + ci + 2 * (day - 1)) % SUBJECTS.length;
          slotRows.push([courseIds[ci][si], day, PERIODS[p][0], PERIODS[p][1]]);
        }
      }
    }
    await bulkInsert(db, 'timetable_slots', ['class_subject_id', 'day_of_week', 'starts_at', 'ends_at'], slotRows);

    // --- Students & parents ------------------------------------------------
    interface Kid { id: number; classIdx: number; ability: number; diligence: number }
    const kids: Kid[] = [];
    const usedEmails = new Set<string>();
    let admission = 1;
    const sizes = [20, 19, 22, 21, 18, 17];

    const createStudent = async (first: string, last: string, classIdx: number, email?: string, gender?: 'male' | 'female') => {
      let address = email ?? `${first}.${last}`.toLowerCase() + '@students.edulearn.school';
      let n = 2;
      while (usedEmails.has(address)) address = `${first}.${last}${n++}`.toLowerCase() + '@students.edulearn.school';
      usedEmails.add(address);
      const id = await insertUser(address, 'student', first, last, null);
      const age = 14 + (CLASSES[classIdx].grade - 9);
      const dob = addDays(today, -Math.floor(age * 365.25 + between(0, 360)));
      const needs = rand() < 0.08 ? [pick(NEEDS)] : [];
      await query(
        `INSERT INTO students (user_id, admission_no, class_id, date_of_birth, gender, address, accessibility_needs, enrolled_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, `STU-2023-${String(admission++).padStart(4, '0')}`, classIds[classIdx], iso(dob), gender ?? (rand() < 0.5 ? 'female' : 'male'),
          `${Math.floor(between(1, 200))} ${pick(['Acacia', 'Baobab', 'Cedar', 'Jacaranda', 'Mango', 'Palm'])} Road`,
          email === 'student@edulearn.school' ? ['Sign language support'] : needs, iso(addDays(today, -Math.floor(between(100, 1100))))],
        db,
      );
      const kid = { id, classIdx, ability: clamp(normal(74, 11), 40, 98), diligence: clamp(normal(0.93, 0.05), 0.7, 0.995) };
      kids.push(kid);
      return kid;
    };

    // Demo family: Maria Rivera with two children, Alex (10A, the demo student) and Sofia (9A).
    const alex = await createStudent('Alex', 'Rivera', 2, 'student@edulearn.school', 'male');
    alex.ability = 84;
    const sofia = await createStudent('Sofia', 'Rivera', 0, undefined, 'female');
    const mariaId = await insertUser('parent@edulearn.school', 'parent', 'Maria', 'Rivera', phone());
    await bulkInsert(db, 'guardians', ['parent_id', 'student_id', 'relationship'], [[mariaId, alex.id, 'mother'], [mariaId, sofia.id, 'mother']]);

    for (let ci = 0; ci < classIds.length; ci++) {
      const already = kids.filter((k) => k.classIdx === ci).length;
      for (let i = already; i < sizes[ci]; i++) {
        const last = pick(LAST);
        const kid = await createStudent(pick(FIRST), last, ci);
        const parentFirst = pick(['Grace', 'John', 'Fatuma', 'Michael', 'Esther', 'Joseph', 'Ana', 'Ibrahim', 'Linda', 'Paul', 'Mercy', 'Ahmed']);
        let parentEmail = `${parentFirst}.${last}`.toLowerCase() + '@mail.com';
        let n = 2;
        while (usedEmails.has(parentEmail)) parentEmail = `${parentFirst}.${last}${n++}`.toLowerCase() + '@mail.com';
        usedEmails.add(parentEmail);
        const parentId = await insertUser(parentEmail, 'parent', parentFirst, last, phone());
        await query(
          'INSERT INTO guardians (parent_id, student_id, relationship) VALUES ($1, $2, $3)',
          [parentId, kid.id, ['Grace', 'Fatuma', 'Esther', 'Ana', 'Linda', 'Mercy'].includes(parentFirst) ? 'mother' : 'father'],
          db,
        );
      }
    }

    // --- Attendance: every weekday of the term so far. Today is left open for two classes,
    // so the "take the register" flow has something to do.
    const attendanceRows: unknown[][] = [];
    for (let d = new Date(termStart); d <= today; d = addDays(d, 1)) {
      if (!isWeekday(d)) continue;
      const isToday = iso(d) === iso(today);
      for (const kid of kids) {
        if (isToday && (kid.classIdx === 2 || kid.classIdx === 5)) continue;
        const r = rand();
        const status = r < kid.diligence ? 'present' : r < kid.diligence + (1 - kid.diligence) * 0.4 ? 'late'
          : r < kid.diligence + (1 - kid.diligence) * 0.8 ? 'absent' : 'excused';
        const note = status === 'excused' ? pick(['Medical appointment', 'Family event', 'School trip']) : status === 'late' ? 'Arrived after first bell' : null;
        attendanceRows.push([kid.id, classIds[kid.classIdx], iso(d), status, note, teacherIds[CLASSES[kid.classIdx].homeroom]]);
      }
    }
    await bulkInsert(db, 'attendance', ['student_id', 'class_id', 'date', 'status', 'note', 'recorded_by'], attendanceRows);

    // --- Assessments & grades ---------------------------------------------
    const plan = [
      { title: 'Diagnostic quiz', type: 'quiz', max: 20, offset: -70, graded: 1 },
      { title: 'Unit 1 assignment', type: 'assignment', max: 50, offset: -52, graded: 1 },
      { title: 'Mid-term test', type: 'test', max: 100, offset: -35, graded: 1 },
      { title: 'Unit 2 project', type: 'project', max: 40, offset: -12, graded: 1 },
      { title: 'Unit 3 quiz', type: 'quiz', max: 25, offset: -3, graded: 0.4 },
      { title: 'Homework set 5', type: 'assignment', max: 30, offset: 5, graded: 0 },
      { title: 'End-of-term exam', type: 'exam', max: 100, offset: 24, graded: 0 },
    ] as const;
    const gradeRows: unknown[][] = [];
    for (let ci = 0; ci < classIds.length; ci++) {
      for (let si = 0; si < SUBJECTS.length; si++) {
        const teacher = (await queryOne<{ teacherId: number }>('SELECT teacher_id FROM class_subjects WHERE id = $1', [courseIds[ci][si]], db))!.teacherId;
        const difficulty = normal(0, 5);
        for (const a of plan) {
          // Skip a few items for variety so not every course looks identical.
          if (a.type === 'project' && si % 3 === 1) continue;
          const assessmentId = (await queryOne<{ id: number }>(
            `INSERT INTO assessments (class_subject_id, term_id, title, description, type, max_score, due_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [courseIds[ci][si], currentTermId, `${SUBJECTS[si].name}: ${a.title}`,
              `${a.title} for ${SUBJECTS[si].name}. Show all working and submit on time.`, a.type, a.max,
              iso(addDays(today, a.offset + Math.floor(between(-2, 2)))), teacher],
            db,
          ))!.id;
          if (a.graded === 0) continue;
          for (const kid of kids.filter((k) => k.classIdx === ci)) {
            if (a.graded < 1 && rand() > a.graded) continue;
            const pct = clamp(normal(kid.ability - difficulty, 8), 15, 100);
            const score = Math.round((pct / 100) * a.max * 2) / 2;
            const feedback = pct >= 85 ? 'Excellent work — keep it up!' : pct < 55 ? "Let's review this together during office hours." : null;
            gradeRows.push([assessmentId, kid.id, score, feedback, teacher]);
          }
        }
      }
    }
    await bulkInsert(db, 'grades', ['assessment_id', 'student_id', 'score', 'feedback', 'graded_by'], gradeRows);

    // --- Fees --------------------------------------------------------------
    const tuitionDue = iso(addDays(termStart, 30));
    const activityDue = iso(addDays(today, 14));
    const paymentRows: unknown[][] = [];
    for (const kid of kids) {
      const tuition = CLASSES[kid.classIdx].grade >= 11 ? 1350 : 1200;
      const tuitionId = (await queryOne<{ id: number }>(
        'INSERT INTO invoices (student_id, term_id, title, amount, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [kid.id, currentTermId, 'Term 1 tuition', tuition, tuitionDue],
        db,
      ))!.id;
      const activityId = (await queryOne<{ id: number }>(
        'INSERT INTO invoices (student_id, term_id, title, amount, due_date, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [kid.id, currentTermId, 'Lab & activities fee', 150, activityDue, 'Covers science lab materials and sports kit'],
        db,
      ))!.id;
      const r = kid.id === alex.id ? 0.7 : rand();
      const method = pick(['bank_transfer', 'mobile_money', 'card', 'cash'] as const);
      const paidOn = iso(addDays(termStart, Math.floor(between(5, 40))));
      if (r < 0.62) {
        paymentRows.push([tuitionId, tuition, method, `TX-${Math.floor(between(100000, 999999))}`, paidOn, adminId]);
        if (rand() < 0.4) paymentRows.push([activityId, 150, method, null, iso(addDays(today, -Math.floor(between(1, 10)))), adminId]);
      } else if (r < 0.85) {
        paymentRows.push([tuitionId, Math.round(tuition * between(0.3, 0.7) / 10) * 10, method, `TX-${Math.floor(between(100000, 999999))}`, paidOn, adminId]);
      }
    }
    await bulkInsert(db, 'payments', ['invoice_id', 'amount', 'method', 'reference', 'paid_on', 'recorded_by'], paymentRows);

    // --- Calendar ------------------------------------------------------------
    const events: [string, string, number, number, string | null, string | null][] = [
      ['Parent–teacher conferences', 'meeting', 3, 4, 'Main hall', 'Book a 10-minute slot with each of your child’s teachers.'],
      ['Science fair', 'academic', 9, 9, 'Sports hall', 'Grades 9–11 present their projects. Families welcome from 2pm.'],
      ['Inter-school athletics meet', 'sports', 12, 12, 'City stadium', null],
      ['End-of-term exams', 'exam', 21, 25, null, 'Exam timetables are posted on each class page.'],
      ['Term 1 ends', 'holiday', 28, 28, null, 'School closes at 12:30.'],
      ['Staff development day', 'meeting', -6, -6, 'Staff room', 'No classes for students.'],
      ['Mid-term break', 'holiday', -40, -36, null, null],
    ];
    for (const [title, type, s, e, location, description] of events) {
      await query(
        'INSERT INTO events (title, type, starts_on, ends_on, location, description, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [title, type, iso(addDays(today, s)), iso(addDays(today, e)), location, description, adminId],
        db,
      );
    }

    // --- Announcements -------------------------------------------------------
    const ann = async (title: string, body: string, audience: string, classIdx: number | null, pinned: boolean, author: number, daysAgo: number) =>
      query(
        `INSERT INTO announcements (title, body, audience, class_id, pinned, author_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 || ' days')::interval)`,
        [title, body, audience, classIdx === null ? null : classIds[classIdx], pinned, author, String(daysAgo)],
        db,
      );
    await ann('Welcome to EduLearn', 'Our new school management system is live! Students and parents can now see timetables, grades, attendance and fees in one place. Use the accessibility menu (top right) to adjust text size, contrast and motion.', 'everyone', null, true, adminId, 20);
    await ann('End-of-term exam timetable', 'Exams begin in three weeks. Revision sessions run every Tuesday and Thursday after school in the library.', 'students', null, false, adminId, 4);
    await ann('Fee reminder', 'Term 1 tuition was due at the start of the term. Please settle any outstanding balance or contact the bursar to arrange a payment plan.', 'parents', null, false, adminId, 6);
    await ann('Grade 10A: calculators needed', 'Please bring a scientific calculator to every maths lesson from Monday — we are starting trigonometry.', 'class', 2, false, teacherIds[0], 2);
    await ann('Staff meeting moved', 'This week’s staff meeting moves to Thursday 3:30pm in the staff room.', 'staff', null, false, adminId, 1);

    // --- Messages --------------------------------------------------------------
    const msg = async (from: number, to: number, subject: string, body: string, hoursAgo: number, read: boolean) =>
      query(
        `INSERT INTO messages (sender_id, recipient_id, subject, body, created_at, read_at)
         VALUES ($1, $2, $3, $4, now() - ($5 || ' hours')::interval, CASE WHEN $6 THEN now() ELSE NULL END)`,
        [from, to, subject, body, String(hoursAgo), read],
        db,
      );
    await msg(mariaId, teacherIds[0], 'Alex’s maths progress', 'Hello Ms. Johnson, Alex mentioned the last quiz felt difficult. Is there anything we can practise at home?', 30, true);
    await msg(teacherIds[0], mariaId, 'Re: Alex’s maths progress', 'Hi Maria, Alex is doing well overall! The worksheets on quadratic equations in the resources folder would be great practice. Happy to chat at the conferences.', 26, false);
    await msg(adminId, teacherIds[0], 'Gradebook deadline', 'Reminder: mid-term grades should be complete by Friday so reports can go out.', 5, false);
  });

  log('Seeded the demo school. Sign in with any of these accounts (password: password123):');
  log('  admin@edulearn.school    — administrator');
  log('  teacher@edulearn.school  — Sarah Johnson, maths teacher & Grade 10A class teacher');
  log('  student@edulearn.school  — Alex Rivera, Grade 10A');
  log('  parent@edulearn.school   — Maria Rivera, parent of Alex and Sofia');
}

export { pool };
