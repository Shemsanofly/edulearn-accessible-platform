import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, query, queryOne } from '../src/db/pool.js';
import { parseCsv, XLSX_MIME } from '../src/lib/xlsx.js';
import { app, signIn } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signIn>>;
let admin: Agent, teacher: Agent;
let className: string, otherClass: string;
const tag = Math.random().toString(36).slice(2, 7);

afterAll(() => pool.end());
beforeAll(async () => {
  [admin, teacher] = await Promise.all([signIn('admin@edulearn.school'), signIn('teacher@edulearn.school')]);
  const classes = await query<{ name: string }>('SELECT name FROM classes ORDER BY grade_level, name LIMIT 2');
  className = classes[0]!.name;
  otherClass = classes[1]!.name;
});

const download = (agent: Agent, url: string) =>
  agent.get(url).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
const upload = (agent: Agent, url: string, file: Buffer, type = XLSX_MIME) => agent.post(url).set('Content-Type', type).send(file);

/** Append rows (by column key) to a downloaded CSV template. */
function csvWithRows(template: Buffer, rows: Record<string, string>[], sep = ',') {
  const lines = parseCsv(template.toString('utf8').replace(/^﻿/, ''));
  const header = lines[1]!;
  const meta = JSON.parse(Buffer.from(lines[0]![1]!.split('.')[0]!, 'base64url').toString());
  const keys: string[] = meta.columns;
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = [lines[0]!, header, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
  return Buffer.from(out.map((l) => l.map(esc).join(sep)).join('\r\n'));
}

async function openXlsx(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const meta = JSON.parse(wb.getWorksheet('_edulearn')!.getCell('A2').value as string);
  return { wb, ws: wb.getWorksheet(meta.sheetName)!, meta: meta as { headerRow: number; columns: string[] } };
}

describe('people templates and exports', () => {
  it('offers Excel and CSV templates to administrators only', async () => {
    const xlsx = await download(admin, '/api/imports/students/template?format=xlsx');
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-disposition']).toMatch(/students-template\.xlsx/);
    const { wb } = await openXlsx(xlsx.body);
    expect(wb.getWorksheet('Classes')!.getCell('A2').value).toBeTruthy();

    const csv = await download(admin, '/api/imports/teachers/template?format=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = parseCsv(csv.body.toString('utf8').replace(/^﻿/, ''));
    expect(lines[0]![0]).toMatch(/^EduLearn template/);
    expect(lines[1]).toEqual(expect.arrayContaining(['Employee No', 'First name', 'Email']));

    expect((await teacher.get('/api/imports/students/template')).status).toBe(403);
    expect((await teacher.get('/api/imports/parents/export?format=csv')).status).toBe(403);
    expect((await admin.get('/api/imports/staff/template')).status).toBe(404);
    expect((await admin.get('/api/imports/students/template?format=pdf')).status).toBe(400);
  });

  it('exports lists as PDF, and guards CSV against spreadsheet formulas', async () => {
    const pdf = await download(admin, '/api/imports/teachers/export?format=pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');

    const created = await admin.post('/api/students').send({ firstName: 'Formula', lastName: '=1+2', email: `formula.${tag}@example.com` });
    expect(created.status).toBe(201);
    const csv = await download(admin, '/api/imports/students/export?format=csv');
    expect(csv.body.toString('utf8')).toContain(`'=1+2`);
    // Importing the export straight back changes nothing (the guard is removed on reading).
    const back = await upload(admin, '/api/imports/students/preview', csv.body, 'text/csv');
    expect(back.status).toBe(200);
    expect(back.body.counts).toMatchObject({ create: 0, update: 0, error: 0 });
  });
});

describe('students import', () => {
  it('creates students from a CSV template (comma or semicolon separated) and returns their sign-in details once', async () => {
    const template = (await download(admin, '/api/imports/students/template?format=csv')).body;
    const file = csvWithRows(template, [
      { firstName: 'Neema', lastName: `Import${tag}`, email: `neema.${tag}@example.com`, class: className, dateOfBirth: '2012-03-25', gender: 'Female' },
      { admissionNo: `OWN-${tag}`, firstName: 'Baraka', lastName: `Import${tag}`, email: `baraka.${tag}@example.com`, class: className.toLowerCase(), dateOfBirth: '14/07/2011', gender: 'm', phone: '0777 123 456' },
    ], ';');
    const preview = await upload(admin, '/api/imports/students/preview', file, 'text/csv');
    expect(preview.status).toBe(200);
    expect(preview.body.issues).toEqual([]);
    expect(preview.body.counts).toMatchObject({ create: 2, update: 0 });
    const saved = await upload(admin, `/api/imports/students/commit?fingerprint=${preview.body.fingerprint}`, file, 'text/csv');
    expect(saved.status).toBe(200);
    expect(saved.body.created).toBe(2);
    expect(saved.body.accounts).toHaveLength(2);
    const baraka = saved.body.accounts.find((a: { email: string }) => a.email === `baraka.${tag}@example.com`);
    expect(baraka.identifier).toBe(`OWN-${tag}`);
    const neema = saved.body.accounts.find((a: { email: string }) => a.email === `neema.${tag}@example.com`);
    expect(neema.identifier).toMatch(/^STU-\d{4}-\d{4}$/);

    const row = await queryOne<{ className: string; dateOfBirth: string; gender: string; phone: string }>(
      `SELECT c.name AS class_name, s.date_of_birth, s.gender, u.phone FROM students s JOIN users u ON u.id = s.user_id
        JOIN classes c ON c.id = s.class_id WHERE u.email = $1`, [`baraka.${tag}@example.com`]);
    expect(row).toMatchObject({ className, dateOfBirth: '2011-07-14', gender: 'male', phone: '+255 777 123 456' });
    // The temporary password works, like an account created on screen.
    const login = await request(app).post('/api/auth/login').send({ email: baraka.email, password: baraka.temporaryPassword });
    expect(login.status).toBe(200);
    // Nothing about passwords is kept in the import record.
    const record = await queryOne<{ changes: unknown }>('SELECT changes FROM data_imports WHERE id = $1', [saved.body.importId]);
    expect(JSON.stringify(record!.changes)).not.toContain(baraka.temporaryPassword);
    // Uploading the same file again creates nobody new.
    const again = await upload(admin, '/api/imports/students/preview', file, 'text/csv');
    expect(again.body.counts).toMatchObject({ create: 0, update: 0, unchanged: 2 });
  });

  it('updates students from an edited Excel export, after confirmation, and only what changed', async () => {
    await admin.post('/api/students').send({ firstName: 'Zawadi', lastName: `Edit${tag}`, email: `zawadi.${tag}@example.com` });
    const exported = await openXlsx((await download(admin, '/api/imports/students/export?format=xlsx')).body);
    const col = (k: string) => exported.meta.columns.indexOf(k) + 1;
    let target = 0;
    for (let r = exported.meta.headerRow + 1; r <= exported.ws.rowCount; r++) {
      if (exported.ws.getRow(r).getCell(col('email')).value === `zawadi.${tag}@example.com`) target = r;
    }
    expect(target).toBeGreaterThan(0);
    exported.ws.getRow(target).getCell(col('class')).value = otherClass;
    exported.ws.getRow(target).getCell(col('phone')).value = '0655 000 111';
    const file = Buffer.from(await exported.wb.xlsx.writeBuffer());

    const preview = await upload(admin, '/api/imports/students/preview', file);
    expect(preview.body.issues).toEqual([]);
    expect(preview.body.counts.update).toBe(1);
    expect(preview.body.counts.create).toBe(0);
    const change = preview.body.rows.find((r: { action: string }) => r.action === 'update');
    expect(change.after).toContain(`Class: — → ${otherClass}`);
    expect(change.after).toContain('Phone');
    expect(preview.body.needsOverwriteConfirm).toBe(true);
    const refused = await upload(admin, `/api/imports/students/commit?fingerprint=${preview.body.fingerprint}`, file);
    expect(refused.status).toBe(400);
    const ok = await upload(admin, `/api/imports/students/commit?fingerprint=${preview.body.fingerprint}&confirmOverwrite=1`, file);
    expect(ok.body).toMatchObject({ created: 0, updated: 1 });
    const row = await queryOne<{ className: string; firstName: string }>(
      'SELECT c.name AS class_name, u.first_name FROM students s JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.class_id WHERE u.email = $1',
      [`zawadi.${tag}@example.com`]);
    expect(row).toMatchObject({ className: otherClass, firstName: 'Zawadi' });
  });

  it('reports invalid rows with their row, column and a fix, and saves nothing', async () => {
    const existingEmail = 'teacher@edulearn.school';
    const template = (await download(admin, '/api/imports/students/template?format=csv')).body;
    const file = csvWithRows(template, [
      { firstName: 'A', lastName: 'One', email: `dup.${tag}@example.com`, class: 'No Such Class' },
      { firstName: 'B', lastName: 'Two', email: `dup.${tag}@example.com` },
      { firstName: 'C', lastName: 'Three', email: 'not-an-email' },
      { firstName: 'D', lastName: 'Four', email: existingEmail },
      { firstName: 'E', email: `e.${tag}@example.com`, dateOfBirth: '31/02/2012' },
      { firstName: 'F', lastName: 'Six', email: `f.${tag}@example.com`, gender: 'Boy' },
    ]);
    const preview = await upload(admin, '/api/imports/students/preview', file, 'text/csv');
    const issues = preview.body.issues as { row: number; column: string; message: string }[];
    const at = (row: number) => issues.filter((i) => i.row === row).map((i) => `${i.column}: ${i.message}`).join(' | ');
    expect(at(3)).toMatch(/Email: This email appears more than once/);
    expect(at(3)).toMatch(/Class: There is no class called/);
    expect(at(5)).toMatch(/isn’t a valid email address/);
    expect(at(6)).toMatch(/already belongs to a teacher account/);
    expect(at(7)).toMatch(/isn’t a date/);
    expect(at(8)).toMatch(/Gender: Use Male, Female or Other/);
    expect(preview.body.canSave).toBe(false);
    const commit = await upload(admin, `/api/imports/students/commit?fingerprint=${preview.body.fingerprint}`, file, 'text/csv');
    expect(commit.status).toBe(400);
    expect(await queryOne(`SELECT 1 FROM users WHERE email = $1`, [`f.${tag}@example.com`])).toBeNull();
  });
});

describe('teachers and parents import', () => {
  it('adds teachers from an Excel template', async () => {
    const t = await openXlsx((await download(admin, '/api/imports/teachers/template?format=xlsx')).body);
    const col = (k: string) => t.meta.columns.indexOf(k) + 1;
    const r = t.meta.headerRow + 1;
    t.ws.getRow(r).getCell(col('firstName')).value = 'Rehema';
    t.ws.getRow(r).getCell(col('lastName')).value = `Staff${tag}`;
    t.ws.getRow(r).getCell(col('email')).value = `rehema.staff.${tag}@example.com`;
    t.ws.getRow(r).getCell(col('specialization')).value = 'Chemistry';
    t.ws.getRow(r).getCell(col('hiredOn')).value = new Date('2024-01-08');
    const file = Buffer.from(await t.wb.xlsx.writeBuffer());
    const preview = await upload(admin, '/api/imports/teachers/preview', file);
    expect(preview.body.issues).toEqual([]);
    expect(preview.body.counts.create).toBe(1);
    const saved = await upload(admin, `/api/imports/teachers/commit?fingerprint=${preview.body.fingerprint}`, file);
    expect(saved.body.accounts[0].identifier).toMatch(/^TCH-/);
    const row = await queryOne<{ specialization: string; hiredOn: string; role: string }>(
      'SELECT t.specialization, t.hired_on, u.role FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.email = $1',
      [`rehema.staff.${tag}@example.com`]);
    expect(row).toMatchObject({ specialization: 'Chemistry', hiredOn: '2024-01-08', role: 'teacher' });
  });

  it('adds a parent linked to children by admission number, then relinks them', async () => {
    const kids = await query<{ admissionNo: string; id: number }>('SELECT admission_no, user_id AS id FROM students ORDER BY user_id LIMIT 3');
    const template = (await download(admin, '/api/imports/parents/template?format=csv')).body;
    const email = `mama.${tag}@example.com`;
    let file = csvWithRows(template, [{ email, firstName: 'Mwanahawa', lastName: `Parent${tag}`, children: `${kids[0]!.admissionNo}; ${kids[1]!.admissionNo}`, relationship: 'Mother' }]);
    let preview = await upload(admin, '/api/imports/parents/preview', file, 'text/csv');
    expect(preview.body.issues).toEqual([]);
    await upload(admin, `/api/imports/parents/commit?fingerprint=${preview.body.fingerprint}`, file, 'text/csv');
    const parentId = (await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1 AND role = $2', [email, 'parent']))!.id;
    let links = await query<{ studentId: number; relationship: string }>('SELECT student_id, relationship FROM guardians WHERE parent_id = $1 ORDER BY student_id', [parentId]);
    expect(links).toEqual([{ studentId: kids[0]!.id, relationship: 'mother' }, { studentId: kids[1]!.id, relationship: 'mother' }]);

    file = csvWithRows(template, [{ email, children: kids[2]!.admissionNo }]);
    preview = await upload(admin, '/api/imports/parents/preview', file, 'text/csv');
    expect(preview.body.counts.update).toBe(1);
    await upload(admin, `/api/imports/parents/commit?fingerprint=${preview.body.fingerprint}&confirmOverwrite=1`, file, 'text/csv');
    links = await query('SELECT student_id, relationship FROM guardians WHERE parent_id = $1', [parentId]);
    expect(links).toEqual([{ studentId: kids[2]!.id, relationship: 'mother' }]);

    const bad = csvWithRows(template, [{ email: `x.${tag}@example.com`, firstName: 'X', lastName: 'Y', children: 'NOPE-0000' }]);
    const badPreview = await upload(admin, '/api/imports/parents/preview', bad, 'text/csv');
    expect(badPreview.body.issues[0].message).toMatch(/No student has admission number NOPE-0000/);
  });

  it('refuses a students file on the teachers import', async () => {
    const students = (await download(admin, '/api/imports/students/template?format=csv')).body;
    const res = await upload(admin, '/api/imports/teachers/preview', students, 'text/csv');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/This is a students template, not a teachers template/);
  });
});

describe('marks and attendance in other formats', () => {
  it('round-trips a marks CSV template and exports the gradebook as PDF and CSV', async () => {
    const teacherId = (await queryOne<{ id: number }>("SELECT id FROM users WHERE email = 'teacher@edulearn.school'"))!.id;
    const course = (await queryOne<{ id: number }>('SELECT id FROM class_subjects WHERE teacher_id = $1 ORDER BY id LIMIT 1', [teacherId]))!;
    const created = await teacher.post('/api/assessments').send({ courseId: course.id, title: `CSV quiz ${tag}`, type: 'quiz', maxScore: 10 });
    const csv = (await download(teacher, `/api/imports/marks/template?assessmentId=${created.body.id}&format=csv`)).body;
    const lines = parseCsv(csv.toString('utf8').replace(/^﻿/, ''));
    const meta = JSON.parse(Buffer.from(lines[0]![1]!.split('.')[0]!, 'base64url').toString());
    const markCol = meta.columns.indexOf('mark');
    lines[2]![markCol] = '0';
    lines[3]![markCol] = '7,5'; // decimal comma, as typed in some locales
    const file = Buffer.from(lines.map((l) => l.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\n'));
    const preview = await upload(teacher, `/api/imports/marks/preview?assessmentId=${created.body.id}`, file, 'text/csv');
    expect(preview.body.issues).toEqual([]);
    expect(preview.body.counts.create).toBe(2);
    const saved = await upload(teacher, `/api/imports/marks/commit?assessmentId=${created.body.id}&fingerprint=${preview.body.fingerprint}`, file, 'text/csv');
    expect(saved.body.created).toBe(2);
    const scores = (await query<{ score: number }>('SELECT score FROM grades WHERE assessment_id = $1 ORDER BY score', [created.body.id])).map((g) => g.score);
    expect(scores).toEqual([0, 7.5]);

    const pdf = await download(teacher, `/api/imports/marks/export?courseId=${course.id}&format=pdf`);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    const gradebookCsv = await download(teacher, `/api/imports/marks/export?courseId=${course.id}&format=csv`);
    expect(gradebookCsv.body.toString('utf8')).toContain(`CSV quiz ${tag} (/10)`);
  });
});
