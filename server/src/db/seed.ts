import type pg from 'pg';
import { hashPassword } from '../lib/passwords.js';
import { invalidateSettings } from '../lib/settings.js';
import { pool, query, queryOne, transaction } from './pool.js';

/**
 * Two ways to fill an empty database:
 *
 * - `setupSchool()` — normal setup for a real school: creates only the first administrator from
 *   ADMIN_EMAIL / ADMIN_PASSWORD (and SCHOOL_NAME). Everyone else is invited from inside the app.
 * - `seedSampleSchool()` — SAMPLE DATA for automated tests and local development only. It creates a
 *   fictional Zanzibar school with shared, well-known passwords, so it refuses to run in production.
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
const rand = mulberry32(20261126);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
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
/** The next date (today or later) that falls on the given month/day. */
const nextOccurrence = (today: Date, month: number, day: number) => {
  let d = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day));
  if (d < today) d = new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, day));
  return d;
};

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

const MALE = ['Ali', 'Said', 'Khamis', 'Hamza', 'Abdalla', 'Yussuf', 'Suleiman', 'Ibrahim', 'Omar', 'Rashid', 'Juma', 'Bakari',
  'Haji', 'Hassan', 'Issa', 'Othman', 'Ameir', 'Salum', 'Mussa', 'Makame', 'Faki', 'Nassor', 'Shaaban', 'Ramadhan'] as const;
const FEMALE = ['Asha', 'Mwanaisha', 'Fatma', 'Zainab', 'Rukia', 'Halima', 'Mwanahawa', 'Salma', 'Amina', 'Saida', 'Maryam',
  'Zuhura', 'Khadija', 'Riziki', 'Mwajuma', 'Nasra', 'Hidaya', 'Time', 'Siti', 'Tatu', 'Mwanamkuu', 'Rehema', 'Subira', 'Latifa'] as const;
const SURNAMES = ['Juma', 'Hamad', 'Ali', 'Khamis', 'Said', 'Omar', 'Mussa', 'Haji', 'Makame', 'Abdalla', 'Seif', 'Suleiman',
  'Rashid', 'Salim', 'Bakari', 'Mohamed', 'Hassan', 'Issa', 'Othman', 'Shaame', 'Ame', 'Vuai', 'Kombo', 'Faki', 'Mzee', 'Pandu'] as const;

const SUBJECTS = [
  { name: 'Mathematics', code: 'MATH', color: '#1d4ed8', description: 'Algebra, geometry, statistics and trigonometry' },
  { name: 'English Language', code: 'ENG', color: '#c2410c', description: 'Reading, writing, grammar and literature' },
  { name: 'Kiswahili', code: 'KISW', color: '#0f766e', description: 'Sarufi, fasihi na utungaji' },
  { name: 'Biology', code: 'BIO', color: '#15803d', description: 'Cells, genetics, ecology and human biology' },
  { name: 'Chemistry', code: 'CHEM', color: '#b91c1c', description: 'Matter, reactions and the periodic table' },
  { name: 'Physics', code: 'PHY', color: '#7c3aed', description: 'Mechanics, energy, waves and electricity' },
  { name: 'Geography', code: 'GEO', color: '#0e7490', description: 'Physical and human geography of Tanzania and the world' },
  { name: 'Civics', code: 'CIV', color: '#a16207', description: 'Citizenship, government and human rights' },
] as const;

const TEACHERS = [
  { first: 'Zuhura', last: 'Hamad', email: 'teacher@edulearn.school', spec: 'Mathematics', qual: 'BSc Education (Mathematics), SUZA' },
  { first: 'Salim', last: 'Khamis', email: 's.khamis@edulearn.school', spec: 'Mathematics', qual: 'Diploma in Education' },
  { first: 'Mwanaisha', last: 'Ali', email: 'm.ali@edulearn.school', spec: 'English Language', qual: 'BA Education (English)' },
  { first: 'Asha', last: 'Makame', email: 'a.makame@edulearn.school', spec: 'Kiswahili', qual: 'BA Kiswahili, SUZA' },
  { first: 'Omar', last: 'Seif', email: 'o.seif@edulearn.school', spec: 'Biology', qual: 'BSc Education (Biology)' },
  { first: 'Fatma', last: 'Abdalla', email: 'f.abdalla@edulearn.school', spec: 'Chemistry', qual: 'BSc Chemistry, PGDE' },
  { first: 'Rashid', last: 'Haji', email: 'r.haji@edulearn.school', spec: 'Physics', qual: 'BSc Education (Physics)' },
  { first: 'Mariam', last: 'Said', email: 'm.said@edulearn.school', spec: 'Geography', qual: 'BA Education (Geography)' },
  { first: 'Khamis', last: 'Mussa', email: 'k.mussa@edulearn.school', spec: 'Civics', qual: 'BA Education (History & Civics)' },
  { first: 'Hidaya', last: 'Suleiman', email: 'h.suleiman@edulearn.school', spec: 'English Language', qual: 'Diploma in Education (English)' },
] as const;

const CLASSES = [
  { name: 'Form 1A', level: 1, section: 'A', room: 'Block A · 01', homeroom: 3 },
  { name: 'Form 1B', level: 1, section: 'B', room: 'Block A · 02', homeroom: 4 },
  { name: 'Form 2A', level: 2, section: 'A', room: 'Block B · 01', homeroom: 0 },
  { name: 'Form 2B', level: 2, section: 'B', room: 'Block B · 02', homeroom: 2 },
  { name: 'Form 3A', level: 3, section: 'A', room: 'Block C · 01', homeroom: 6 },
  { name: 'Form 4A', level: 4, section: 'A', room: 'Block C · 02', homeroom: 5 },
] as const;

const PERIODS = [
  ['07:30', '08:10'], ['08:10', '08:50'], ['08:50', '09:30'], ['10:00', '10:40'],
  ['10:40', '11:20'], ['11:20', '12:00'], ['13:30', '14:10'],
] as const;

const NEEDS = ['Sign language support', 'Extra time in exams', 'Large print materials', 'Sits at the front (low vision)'];

const CSEE = [
  ['A', 75, 100, 1, 'Excellent'], ['B', 65, 74, 2, 'Very good'], ['C', 45, 64, 3, 'Good'],
  ['D', 30, 44, 4, 'Satisfactory'], ['F', 0, 29, 5, 'Fail'],
] as const;
const PSLE = [
  ['A', 81, 100, null, 'Excellent'], ['B', 61, 80, null, 'Very good'], ['C', 41, 60, null, 'Good'],
  ['D', 21, 40, null, 'Satisfactory'], ['E', 0, 20, null, 'Fail'],
] as const;

const tzPhone = () => `+255 7${Math.floor(between(10, 80))} ${Math.floor(between(100, 999))} ${Math.floor(between(100, 999))}`;

export async function setupSchool() {
  const existing = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM users');
  if (existing && existing.n > 0) {
    console.log('This database already has accounts, so setup was skipped. Invite new people from the app instead.');
    return;
  }
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) to create the first administrator.');
  }
  await transaction(async (db) => {
    await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES ($1, $2, 'admin', $3, $4)`,
      [email.toLowerCase(), await hashPassword(password), process.env.ADMIN_FIRST_NAME ?? 'School', process.env.ADMIN_LAST_NAME ?? 'Administrator'],
      db,
    );
    await query('UPDATE school_settings SET name = $1, is_demo = false WHERE id = 1', [process.env.SCHOOL_NAME ?? 'My School'], db);
    // A sensible default grading scale; schools can change it in Subjects & terms → Grading.
    await insertScale(db, 'Secondary (CSEE)', 'Certificate of Secondary Education Examination grades', true, CSEE);
  });
  invalidateSettings();
  console.log(`Created administrator ${email}.`);
}

async function insertScale(db: pg.PoolClient, name: string, description: string, isDefault: boolean, bands: readonly (readonly [string, number, number, number | null, string])[]) {
  const scale = await queryOne<{ id: number }>(
    'INSERT INTO grading_scales (name, description, is_default) VALUES ($1, $2, $3) RETURNING id',
    [name, description, isDefault],
    db,
  );
  await bulkInsert(db, 'grade_bands', ['scale_id', 'grade', 'min_percent', 'max_percent', 'points', 'remark'], bands.map((b) => [scale!.id, ...b]));
  return scale!.id;
}

export async function seedSampleSchool({ quiet = false }: { quiet?: boolean } = {}) {
  const log = quiet ? () => {} : console.log;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Sample data has shared, well-known passwords and must never be loaded in production.');
  }
  const existing = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM users');
  if (existing && existing.n > 0) {
    log('The database already has users, so sample data was not loaded.');
    return;
  }

  const hash = await hashPassword(DEMO_PASSWORD);
  const today = todayUtc();

  await transaction(async (db) => {
    const insertUser = async (email: string, role: string, first: string, last: string, phone: string | null) =>
      (await queryOne<{ id: number }>(
        'INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [email, hash, role, first, last, phone],
        db,
      ))!.id;

    // --- School --------------------------------------------------------------
    await query(
      `UPDATE school_settings SET name = $1, motto = $2, address = $3, phone = $4, email = $5, website = NULL,
         currency = 'TZS', default_language = 'en', level_label = 'Form', is_demo = true WHERE id = 1`,
      ['EduLearn Sample Secondary School', 'Elimu ni Mwanga', 'P.O. Box 0000, Zanzibar (sample address)', '+255 700 000 000', 'office@sample.edulearn.school'],
      db,
    );

    // --- Staff ---------------------------------------------------------------
    const adminId = await insertUser('admin@edulearn.school', 'admin', 'Salma', 'Juma', tzPhone());
    const bursarId = await insertUser('bursar@edulearn.school', 'admin', 'Abdulrahman', 'Hassan', tzPhone());

    const teacherIds: number[] = [];
    for (const [i, t] of TEACHERS.entries()) {
      const id = await insertUser(t.email, 'teacher', t.first, t.last, tzPhone());
      await query(
        'INSERT INTO teachers (user_id, employee_no, qualification, specialization, hired_on) VALUES ($1, $2, $3, $4, $5)',
        [id, `TCH-2019-${String(i + 1).padStart(4, '0')}`, t.qual, t.spec, iso(addDays(today, -Math.floor(between(200, 3000))))],
        db,
      );
      teacherIds.push(id);
    }

    // --- Academic years and terms (Tanzanian schools run January–December in two terms) ---
    const term2Start = addDays(today, -110);
    const term2End = addDays(today, 22);
    const term1Start = addDays(term2Start, -185);
    const term1End = addDays(term2Start, -35);
    const yearName = String(term2Start.getUTCFullYear());
    const yearId = (await queryOne<{ id: number }>(
      'INSERT INTO academic_years (name, starts_on, ends_on, is_current) VALUES ($1, $2, $3, true) RETURNING id',
      [yearName, iso(term1Start), iso(term2End)],
      db,
    ))!.id;
    const term1Id = (await queryOne<{ id: number }>(
      'INSERT INTO terms (name, starts_on, ends_on, is_current, academic_year_id) VALUES ($1, $2, $3, false, $4) RETURNING id',
      [`Term 1 ${yearName}`, iso(term1Start), iso(term1End), yearId],
      db,
    ))!.id;
    const termId = (await queryOne<{ id: number }>(
      'INSERT INTO terms (name, starts_on, ends_on, is_current, academic_year_id) VALUES ($1, $2, $3, true, $4) RETURNING id',
      [`Term 2 ${yearName}`, iso(term2Start), iso(term2End), yearId],
      db,
    ))!.id;

    // --- Grading scales ------------------------------------------------------
    const scaleId = await insertScale(db, 'Secondary (CSEE)', 'Certificate of Secondary Education Examination grades', true, CSEE);
    await insertScale(db, 'Primary (PSLE)', 'Primary School Leaving Examination grades', false, PSLE);

    // --- Subjects & classes --------------------------------------------------
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
        'INSERT INTO classes (name, grade_level, section, room, capacity, homeroom_teacher_id) VALUES ($1, $2, $3, $4, 45, $5) RETURNING id',
        [c.name, c.level, c.section, c.room, teacherIds[c.homeroom]],
        db,
      ))!.id);
    }

    // Every class takes every subject. Mathematics and English have two teachers who share the classes.
    const teachersFor = (subject: string) => TEACHERS.map((t, i) => (t.spec === subject ? teacherIds[i]! : -1)).filter((x) => x > 0);
    const courseIds: number[][] = [];
    for (const [ci, classId] of classIds.entries()) {
      courseIds[ci] = [];
      for (const [si, subjectId] of subjectIds.entries()) {
        const pool = teachersFor(SUBJECTS[si]!.name);
        // The demo teacher (Mwalimu Zuhura) teaches maths to Form 2A, 2B and 3A.
        const teacher = SUBJECTS[si]!.code === 'MATH' ? (ci >= 2 && ci <= 4 ? pool[0] : pool[1]) : pool[ci % pool.length];
        courseIds[ci]![si] = (await queryOne<{ id: number }>(
          'INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ($1, $2, $3) RETURNING id',
          [classId, subjectId, teacher],
          db,
        ))!.id;
      }
    }

    // --- Timetable: a Latin-square rotation means no two classes have the same subject at the same
    // time, so no teacher is ever double-booked. Shifting by day varies each day's order.
    const slotRows: unknown[][] = [];
    for (let ci = 0; ci < classIds.length; ci++) {
      for (let day = 1; day <= 5; day++) {
        for (let p = 0; p < PERIODS.length; p++) {
          const si = (p + ci + 3 * (day - 1)) % SUBJECTS.length;
          slotRows.push([courseIds[ci]![si], day, PERIODS[p]![0], PERIODS[p]![1]]);
        }
      }
    }
    await bulkInsert(db, 'timetable_slots', ['class_subject_id', 'day_of_week', 'starts_at', 'ends_at'], slotRows);

    // --- Students & parents ------------------------------------------------------
    interface Kid { id: number; classIdx: number; ability: number; diligence: number; first: string }
    const kids: Kid[] = [];
    const usedEmails = new Set<string>();
    let admission = 1;
    const sizes = [20, 19, 22, 21, 18, 17];
    const uniqueEmail = (base: string, domain: string) => {
      let address = `${base}@${domain}`;
      let n = 2;
      while (usedEmails.has(address)) address = `${base}${n++}@${domain}`;
      usedEmails.add(address);
      return address;
    };

    const createStudent = async (first: string, last: string, classIdx: number, gender: 'male' | 'female', email?: string) => {
      const address = email ?? uniqueEmail(`${first}.${last}`.toLowerCase(), 'students.edulearn.school');
      usedEmails.add(address);
      const id = await insertUser(address, 'student', first, last, null);
      const age = 13 + CLASSES[classIdx]!.level;
      const dob = addDays(today, -Math.floor(age * 365.25 + between(0, 360)));
      const needs = rand() < 0.07 ? [pick(NEEDS)] : [];
      await query(
        `INSERT INTO students (user_id, admission_no, class_id, date_of_birth, gender, address, accessibility_needs, enrolled_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, `ADM-${2027 - CLASSES[classIdx]!.level}-${String(admission++).padStart(4, '0')}`, classIds[classIdx], iso(dob), gender,
          `${pick(['Mwanakwerekwe', 'Kikwajuni', 'Mombasa', 'Amani', 'Chukwani', 'Mpendae', 'Jang’ombe', 'Kilimani', 'Fuoni', 'Bububu'])}, Zanzibar`,
          email === 'student@edulearn.school' ? ['Sign language support'] : needs, iso(addDays(today, -Math.floor(between(100, 1100))))],
        db,
      );
      const kid = { id, classIdx, first, ability: clamp(normal(58, 14), 20, 95), diligence: clamp(normal(0.93, 0.05), 0.7, 0.995) };
      kids.push(kid);
      return kid;
    };

    // Demo family: Mwanaisha Juma with two children — Ali (Form 2A, the demo student) and Asha (Form 1A).
    const ali = await createStudent('Ali', 'Juma', 2, 'male', 'student@edulearn.school');
    ali.ability = 72;
    const asha = await createStudent('Asha', 'Juma', 0, 'female');
    usedEmails.add('asha.juma@students.edulearn.school');
    const parentId = await insertUser('parent@edulearn.school', 'parent', 'Mwanaisha', 'Juma', '+255 777 123 456');
    await bulkInsert(db, 'guardians', ['parent_id', 'student_id', 'relationship'], [[parentId, ali.id, 'mother'], [parentId, asha.id, 'mother']]);

    for (let ci = 0; ci < classIds.length; ci++) {
      const already = kids.filter((k) => k.classIdx === ci).length;
      for (let i = already; i < sizes[ci]!; i++) {
        const gender = rand() < 0.5 ? 'female' : 'male';
        const last = pick(SURNAMES);
        const kid = await createStudent(pick(gender === 'female' ? FEMALE : MALE), last, ci, gender);
        const mother = rand() < 0.55;
        const parentFirst = pick(mother ? FEMALE : MALE);
        const pid = await insertUser(uniqueEmail(`${parentFirst}.${last}`.toLowerCase(), 'parents.edulearn.school'), 'parent', parentFirst, last, tzPhone());
        await query('INSERT INTO guardians (parent_id, student_id, relationship) VALUES ($1, $2, $3)', [pid, kid.id, mother ? 'mother' : 'father'], db);
      }
    }

    // --- Attendance: every weekday of the term so far. Today is left open for two classes
    // so the "take the register" flow has something to do.
    const attendanceRows: unknown[][] = [];
    for (let d = new Date(term2Start); d <= today; d = addDays(d, 1)) {
      if (!isWeekday(d)) continue;
      const isToday = iso(d) === iso(today);
      for (const kid of kids) {
        if (isToday && (kid.classIdx === 2 || kid.classIdx === 5)) continue;
        const r = rand();
        const miss = 1 - kid.diligence;
        const status = r < kid.diligence ? 'present' : r < kid.diligence + miss * 0.4 ? 'late' : r < kid.diligence + miss * 0.8 ? 'absent' : 'excused';
        const note = status === 'excused' ? pick(['Hospital appointment', 'Family matter', 'School trip']) : status === 'late' ? 'Arrived after assembly' : null;
        attendanceRows.push([kid.id, classIds[kid.classIdx], iso(d), status, note, teacherIds[CLASSES[kid.classIdx]!.homeroom]]);
      }
    }
    await bulkInsert(db, 'attendance', ['student_id', 'class_id', 'date', 'status', 'note', 'recorded_by'], attendanceRows);

    // --- Classwork (quizzes, assignments, projects) ----------------------------------
    const plan = [
      { title: 'Topic quiz', type: 'quiz', max: 20, offset: -80, graded: 1 },
      { title: 'Assignment 1', type: 'assignment', max: 50, offset: -60, graded: 1 },
      { title: 'Group project', type: 'project', max: 40, offset: -20, graded: 1 },
      { title: 'Quiz 2', type: 'quiz', max: 25, offset: -3, graded: 0.4 },
      { title: 'Homework 5', type: 'assignment', max: 30, offset: 4, graded: 0 },
      { title: 'Revision assignment', type: 'assignment', max: 30, offset: 11, graded: 0 },
    ] as const;
    const gradeRows: unknown[][] = [];
    const difficulty: number[][] = classIds.map(() => SUBJECTS.map(() => normal(0, 6)));
    for (let ci = 0; ci < classIds.length; ci++) {
      for (let si = 0; si < SUBJECTS.length; si++) {
        const teacher = (await queryOne<{ teacherId: number }>('SELECT teacher_id FROM class_subjects WHERE id = $1', [courseIds[ci]![si]], db))!.teacherId;
        for (const a of plan) {
          if (a.type === 'project' && si % 3 === 1) continue;
          const assessmentId = (await queryOne<{ id: number }>(
            `INSERT INTO assessments (class_subject_id, term_id, title, description, type, max_score, due_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [courseIds[ci]![si], termId, `${SUBJECTS[si]!.name}: ${a.title}`,
              `${a.title} for ${SUBJECTS[si]!.name}. Show all your working and hand it in on time.`, a.type, a.max,
              iso(addDays(today, a.offset + Math.floor(between(-2, 2)))), teacher],
            db,
          ))!.id;
          if (a.graded === 0) continue;
          for (const kid of kids.filter((k) => k.classIdx === ci)) {
            if (a.graded < 1 && rand() > a.graded) continue;
            const pct = clamp(normal(kid.ability + 8 - difficulty[ci]![si]!, 10), 10, 100);
            const score = Math.round((pct / 100) * a.max * 2) / 2;
            const feedback = pct >= 80 ? 'Kazi nzuri sana — excellent work!' : pct < 40 ? 'Please see me during prep time so we can go over this.' : null;
            gradeRows.push([assessmentId, kid.id, score, feedback, teacher]);
          }
        }
      }
    }

    // --- Examinations: Term 1 terminal (published), Term 2 mid-term (published), Term 2 terminal (upcoming) ---
    const exams = [
      { name: 'Term 1 Terminal Examination', term: term1Id, start: addDays(term1End, -14), end: addDays(term1End, -8), published: addDays(term1End, -3), marked: true, drift: -3 },
      { name: 'Mid-Term Examination', term: termId, start: addDays(today, -48), end: addDays(today, -43), published: addDays(today, -35), marked: true, drift: 0 },
      { name: 'Terminal Examination', term: termId, start: addDays(today, 10), end: addDays(today, 17), published: null, marked: false, drift: 0 },
    ];
    let midTermId = 0;
    for (const e of exams) {
      const examId = (await queryOne<{ id: number }>(
        `INSERT INTO exams (name, term_id, grading_scale_id, starts_on, ends_on, max_marks, published_at, created_by)
         VALUES ($1, $2, $3, $4, $5, 100, $6, $7) RETURNING id`,
        [e.name, e.term, scaleId, iso(e.start), iso(e.end), e.published ? e.published.toISOString() : null, adminId],
        db,
      ))!.id;
      if (e.name === 'Mid-Term Examination') midTermId = examId;
      for (const classId of classIds) await query('INSERT INTO exam_classes (exam_id, class_id) VALUES ($1, $2)', [examId, classId], db);
      for (let ci = 0; ci < classIds.length; ci++) {
        for (let si = 0; si < SUBJECTS.length; si++) {
          const teacher = (await queryOne<{ teacherId: number }>('SELECT teacher_id FROM class_subjects WHERE id = $1', [courseIds[ci]![si]], db))!.teacherId;
          const paperId = (await queryOne<{ id: number }>(
            `INSERT INTO assessments (class_subject_id, term_id, title, description, type, max_score, due_date, created_by, exam_id)
             VALUES ($1, $2, $3, 'Examination paper', 'exam', 100, $4, $5, $6) RETURNING id`,
            [courseIds[ci]![si], e.term, `${SUBJECTS[si]!.name}: ${e.name}`, iso(e.end), teacher, examId],
            db,
          ))!.id;
          if (!e.marked) continue;
          for (const kid of kids.filter((k) => k.classIdx === ci)) {
            const marks = Math.round(clamp(normal(kid.ability + e.drift - difficulty[ci]![si]!, 11), 4, 98));
            gradeRows.push([paperId, kid.id, marks, null, teacher]);
          }
        }
      }
    }
    await bulkInsert(db, 'grades', ['assessment_id', 'student_id', 'score', 'feedback', 'graded_by'], gradeRows);

    // Class-teacher remarks on the mid-term report cards for the demo teacher's class.
    const remarks: unknown[][] = [];
    for (const kid of kids.filter((k) => k.classIdx === 2)) {
      const text = kid.ability >= 70 ? 'An excellent term. Keep up the hard work and help your classmates.'
        : kid.ability >= 50 ? 'Good progress. More practice in mathematics and science will lift your grades.'
          : 'You can do better. Attend remedial classes and revise every evening.';
      remarks.push([midTermId, kid.id, text, teacherIds[0]]);
    }
    await bulkInsert(db, 'report_remarks', ['exam_id', 'student_id', 'remark', 'updated_by'], remarks);

    // --- Fees (TZS) ------------------------------------------------------------------
    const structure = async (name: string, amount: number, level: number | null, due: Date, description: string) =>
      (await queryOne<{ id: number }>(
        'INSERT INTO fee_structures (name, amount, level, term_id, due_date, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [name, amount, level, termId, iso(due), description],
        db,
      ))!.id;
    const tuitionDue = addDays(term2Start, 21);
    const tuition: Record<number, { id: number; amount: number }> = {};
    for (const level of [1, 2, 3, 4]) {
      const amount = level >= 3 ? 500_000 : 450_000;
      tuition[level] = { id: await structure(`Term 2 tuition · Form ${level}`, amount, level, tuitionDue, 'School fees for Term 2'), amount };
    }
    const examFeeId = await structure('Examination & activities fee', 50_000, null, addDays(today, 14), 'Terminal examinations, laboratory materials and sports');

    const paymentRows: unknown[][] = [];
    for (const kid of kids) {
      const level = CLASSES[kid.classIdx]!.level;
      const t = tuition[level]!;
      const tuitionInvoice = (await queryOne<{ id: number }>(
        'INSERT INTO invoices (student_id, term_id, title, amount, due_date, notes, fee_structure_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [kid.id, termId, `Term 2 tuition · Form ${level}`, t.amount, iso(tuitionDue), 'School fees for Term 2', t.id],
        db,
      ))!.id;
      const examInvoice = (await queryOne<{ id: number }>(
        'INSERT INTO invoices (student_id, term_id, title, amount, due_date, notes, fee_structure_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [kid.id, termId, 'Examination & activities fee', 50_000, iso(addDays(today, 14)), 'Terminal examinations, laboratory materials and sports', examFeeId],
        db,
      ))!.id;
      const r = kid.id === ali.id ? 0.7 : rand();
      const method = pick(['mobile_money', 'mobile_money', 'bank_transfer', 'cash'] as const);
      const ref = method === 'mobile_money' ? `MP${Math.floor(between(10_000_000, 99_999_999))}` : method === 'bank_transfer' ? `NMB-${Math.floor(between(100000, 999999))}` : null;
      const paidOn = iso(addDays(term2Start, Math.floor(between(3, 40))));
      if (r < 0.6) {
        paymentRows.push([tuitionInvoice, t.amount, method, ref, paidOn, bursarId]);
        if (rand() < 0.35) paymentRows.push([examInvoice, 50_000, method, ref, iso(addDays(today, -Math.floor(between(1, 10)))), bursarId]);
      } else if (r < 0.85) {
        paymentRows.push([tuitionInvoice, Math.round((t.amount * between(0.3, 0.7)) / 10_000) * 10_000, method, ref, paidOn, bursarId]);
      }
    }
    paymentRows.sort((a, b) => String(a[4]).localeCompare(String(b[4])));
    await bulkInsert(db, 'payments', ['invoice_id', 'amount', 'method', 'reference', 'paid_on', 'recorded_by'], paymentRows);

    // --- Calendar --------------------------------------------------------------------
    const events: [string, string, Date, Date, string | null, string | null][] = [
      ['Parents’ meeting · Mkutano wa wazazi', 'meeting', addDays(today, 3), addDays(today, 3), 'School hall', 'Discuss Term 2 progress with class teachers.'],
      ['Science fair', 'academic', addDays(today, 7), addDays(today, 7), 'Laboratory block', 'Forms 1–3 present their projects. Families welcome from 14:00.'],
      ['Terminal examinations', 'exam', addDays(today, 10), addDays(today, 17), null, 'Timetables are posted on the notice board and in the app.'],
      ['Inter-school sports day', 'sports', addDays(today, 5), addDays(today, 5), 'Amaan Stadium (demo)', null],
      ['Term 2 closes', 'holiday', term2End, term2End, null, 'School closes at 12:00.'],
      ['Mid-term break', 'holiday', addDays(today, -40), addDays(today, -36), null, null],
    ];
    const holidays: [string, number, number][] = [
      ['Independence Day (public holiday)', 12, 9],
      ['Zanzibar Revolution Day · Mapinduzi (public holiday)', 1, 12],
      ['Christmas Day (public holiday)', 12, 25],
    ];
    for (const [title, month, day] of holidays) {
      const d = nextOccurrence(today, month, day);
      if (d.getTime() - today.getTime() < 75 * 864e5) events.push([title, 'holiday', d, d, null, 'No school.']);
    }
    for (const [title, type, s, e, location, description] of events) {
      await query(
        'INSERT INTO events (title, type, starts_on, ends_on, location, description, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [title, type, iso(s), iso(e), location, description, adminId],
        db,
      );
    }

    // --- Announcements -----------------------------------------------------------
    const ann = async (title: string, body: string, audience: string, classIdx: number | null, pinned: boolean, author: number, daysAgo: number) =>
      query(
        `INSERT INTO announcements (title, body, audience, class_id, pinned, author_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 || ' days')::interval)`,
        [title, body, audience, classIdx === null ? null : classIds[classIdx], pinned, author, String(daysAgo)],
        db,
      );
    await ann('Welcome to EduLearn · Karibu EduLearn', 'Parents can now follow attendance, results, fees and school news from their phones. Wazazi sasa wanaweza kufuatilia mahudhurio, matokeo, ada na habari za shule kupitia simu zao.', 'everyone', null, true, adminId, 30);
    await ann('Mid-term results are available', 'Mid-term report cards are now in the app under Results. Class teachers are available to discuss them at the parents’ meeting.', 'parents', null, false, adminId, 35);
    await ann('Terminal examinations', 'Terminal examinations start in ten days. Revision classes run Monday to Thursday from 14:30 in the library.', 'students', null, false, adminId, 4);
    await ann('Ukumbusho wa ada', 'Tafadhali lipeni ada ya muhula wa pili. Malipo yanaweza kufanywa kwa M-Pesa, benki au taslimu ofisini.', 'parents', null, false, bursarId, 6);
    await ann('Form 2A: bring geometry sets', 'Please bring a ruler, protractor and compasses to every maths lesson this week — we are starting construction.', 'class', 2, false, teacherIds[0]!, 2);
    await ann('Staff meeting moved', 'This week’s staff meeting moves to Thursday 14:30 in the staff room.', 'staff', null, false, adminId, 1);

    // --- Messages ------------------------------------------------------------------
    const msg = async (from: number, to: number, subject: string, body: string, hoursAgo: number, read: boolean) =>
      query(
        `INSERT INTO messages (sender_id, recipient_id, subject, body, created_at, read_at)
         VALUES ($1, $2, $3, $4, now() - ($5 || ' hours')::interval, CASE WHEN $6 THEN now() ELSE NULL END)`,
        [from, to, subject, body, String(hoursAgo), read],
        db,
      );
    await msg(parentId, teacherIds[0]!, 'Ali’s mathematics', 'Shikamoo Mwalimu, Ali says the last quiz was difficult. Is there anything we can practise at home?', 30, true);
    await msg(teacherIds[0]!, parentId, 'Re: Ali’s mathematics', 'Marahaba. Ali is doing well overall. The revision questions on algebra in his exercise book are good practice. We can talk more at the parents’ meeting.', 26, false);
    await msg(adminId, teacherIds[0]!, 'Marks deadline', 'Reminder: please finish entering the Quiz 2 marks by Friday.', 5, false);

    // --- Notifications (normally created automatically by actions in the app) -----------
    const note = (userId: number, type: string, title: string, body: string, link: string, hoursAgo: number, read = false) =>
      query(
        `INSERT INTO notifications (user_id, type, title, body, link, created_at, read_at)
         VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' hours')::interval, CASE WHEN $7 THEN now() ELSE NULL END)`,
        [userId, type, title, body, link, String(hoursAgo), read],
        db,
      );
    await note(parentId, 'results', 'Mid-Term Examination results are out', 'Report cards are now available.', `/report-cards?exam=${midTermId}`, 24 * 35, true);
    await note(parentId, 'fees', 'Fee reminder: Term 2 tuition · Form 2', 'TZS 180,000 outstanding for Ali Juma.', '/fees', 24 * 6);
    await note(parentId, 'assignment', 'New assignment: Mathematics: Revision assignment', 'Mathematics · Form 2A', '/assignments', 20);
    await note(parentId, 'announcement', 'Parents’ meeting · Mkutano wa wazazi', 'Discuss Term 2 progress with class teachers.', '/calendar', 10);
    await note(ali.id, 'assignment', 'New assignment: Mathematics: Revision assignment', 'Mathematics · Form 2A', '/assignments', 20);
    await note(teacherIds[0]!, 'system', 'Quiz 2 marks are due on Friday', 'Mathematics · Form 2A, 2B and 3A', '/gradebook', 5);
    await note(adminId, 'system', 'New enquiry from Halima Othman', 'Example enquiry from the public website.', '/enquiries', 3);

    // --- Audit log & enquiries (examples of what the app records) -------------------
    const auditRows: unknown[][] = [
      [adminId, 'Salma Juma', 'create', 'exam', 'Created exam Mid-Term Examination', 24 * 50],
      [adminId, 'Salma Juma', 'publish', 'exam', 'Published results for Mid-Term Examination', 24 * 35],
      [bursarId, 'Abdulrahman Hassan', 'apply', 'fee_structure', `Applied Term 2 tuition to ${kids.length} students`, 24 * 100],
      [bursarId, 'Abdulrahman Hassan', 'remind', 'invoice', 'Sent fee reminders for overdue invoices', 24 * 6],
      [adminId, 'Salma Juma', 'create', 'student', 'Enrolled Asha Juma', 24 * 120],
    ];
    for (const [actor, name, action, entity, summary, hoursAgo] of auditRows) {
      await query(
        `INSERT INTO audit_logs (actor_id, actor_name, action, entity, summary, created_at) VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' hours')::interval)`,
        [actor, name, action, entity, summary, String(hoursAgo)],
        db,
      );
    }
    await query(
      `INSERT INTO contact_requests (kind, full_name, school_name, email, phone, message, created_at) VALUES
       ('contact', 'Halima Othman', 'Example Primary School (sample enquiry)', 'halima@example.com', '+255 777 000 111', 'Could you tell us how teachers and parents get their accounts?', now() - interval '3 hours'),
       ('contact', 'Yussuf Kombo', 'Example Islamic Secondary School (sample enquiry)', 'yussuf@example.com', NULL, 'Does the system work in Kiswahili and support TZS fees?', now() - interval '2 days')`,
      [],
      db,
    );
  });
  invalidateSettings();

  log('Loaded SAMPLE data for local development: "EduLearn Sample Secondary School" (fictional). Shared password: password123');
  log('  admin@edulearn.school    — Salma Juma, administrator');
  log('  teacher@edulearn.school  — Zuhura Hamad, maths teacher & Form 2A class teacher');
  log('  parent@edulearn.school   — Mwanaisha Juma, mother of Ali (Form 2A) and Asha (Form 1A)');
  log('  student@edulearn.school  — Ali Juma, Form 2A');
}

export { pool };

/** Email addresses created by earlier versions' demo seed. Used by the `deactivate-demo` command. */
export const KNOWN_DEMO_EMAIL_PATTERN = String.raw`^[^@]+@((students|parents)\.)?edulearn\.school$`;
