import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, query, queryOne } from '../src/db/pool.js';
import { XLSX_MIME } from '../src/lib/xlsx.js';
import { app, idOf, signIn } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signIn>>;
let admin: Agent, teacher: Agent, otherTeacher: Agent, student: Agent;
let courseId: number, classId: number, className: string;
let roster: { id: number; admissionNo: string; firstName: string; lastName: string }[];
let outsider: { admissionNo: string; name: string };

afterAll(() => pool.end());

/** Download a file as a Buffer. */
const download = (agent: Agent | ReturnType<typeof request>, url: string) =>
  (agent as Agent).get(url).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

interface Sheet { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet; meta: { headerRow: number; columns: string[] } & Record<string, unknown> }

async function open(buffer: Buffer): Promise<Sheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const meta = JSON.parse(wb.getWorksheet('_edulearn')!.getCell('A2').value as string);
  return { wb, ws: wb.getWorksheet(meta.sheetName)!, meta };
}

/** The Excel row for a student, found by admission number. */
function rowOf(s: Sheet, admissionNo: string) {
  const col = s.meta.columns.indexOf('admission') + 1;
  for (let r = s.meta.headerRow + 1; r <= s.ws.rowCount; r++) if (s.ws.getRow(r).getCell(col).value === admissionNo) return r;
  throw new Error(`No row for ${admissionNo}`);
}
const setCell = (s: Sheet, row: number, key: string, value: ExcelJS.CellValue) => {
  s.ws.getRow(row).getCell(s.meta.columns.indexOf(key) + 1).value = value;
};
const save = async (s: Sheet) => Buffer.from(await s.wb.xlsx.writeBuffer());

const upload = (agent: Agent, url: string, file: Buffer) => agent.post(url).set('Content-Type', XLSX_MIME).send(file);

async function newAssessment(maxScore = 50, title = `Import test ${Math.random().toString(36).slice(2, 7)}`) {
  const res = await teacher.post('/api/assessments').send({ courseId, title, type: 'test', maxScore });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

const marksUrl = (step: string, assessmentId: number, extra = '') => `/api/imports/marks/${step}?assessmentId=${assessmentId}${extra}`;
const gradesOf = (assessmentId: number) =>
  query<{ studentId: number; score: number | null; status: string | null; feedback: string | null }>(
    'SELECT student_id, score, status, feedback FROM grades WHERE assessment_id = $1', [assessmentId]);

beforeAll(async () => {
  [admin, teacher, student] = await Promise.all([
    signIn('admin@edulearn.school'), signIn('teacher@edulearn.school'), signIn('student@edulearn.school'),
  ]);
  const teacherId = await idOf('teacher@edulearn.school');
  const course = (await queryOne<{ id: number; classId: number; className: string }>(
    `SELECT cs.id, cs.class_id, c.name AS class_name FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
      WHERE cs.teacher_id = $1 ORDER BY cs.id LIMIT 1`,
    [teacherId],
  ))!;
  ({ id: courseId, classId, className } = course);
  roster = await query(
    `SELECT u.id, s.admission_no, u.first_name, u.last_name FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.class_id = $1 AND u.is_active ORDER BY u.last_name, u.first_name`,
    [classId],
  );
  const other = (await queryOne<{ admissionNo: string; firstName: string; lastName: string }>(
    `SELECT s.admission_no, u.first_name, u.last_name FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.class_id <> $1 AND u.is_active LIMIT 1`,
    [classId],
  ))!;
  outsider = { admissionNo: other.admissionNo, name: `${other.firstName} ${other.lastName}` };
  // A teacher who does not teach this course (and is not the class teacher).
  const otherEmail = (await queryOne<{ email: string }>(
    `SELECT u.email FROM teachers t JOIN users u ON u.id = t.user_id
      WHERE u.id <> $1 AND u.is_active
        AND NOT EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.id = $2 AND cs.teacher_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = $3 AND c.homeroom_teacher_id = u.id)
      ORDER BY u.id LIMIT 1`,
    [teacherId, courseId, classId],
  ))!.email;
  otherTeacher = await signIn(otherEmail);
});

describe('marks template', () => {
  it('lists the class roster with admission numbers, the maximum mark and saved marks', async () => {
    const assessmentId = await newAssessment(40);
    await teacher.put(`/api/assessments/${assessmentId}/grades`).send({ grades: [{ studentId: roster[0]!.id, score: 17 }] });
    const res = await download(teacher, marksUrl('template', assessmentId));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(XLSX_MIME);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="marks-/);
    const s = await open(res.body);
    expect(s.meta).toMatchObject({ kind: 'marks', version: 1, assessmentId, classId, maxScore: 40 });
    const header = s.ws.getRow(s.meta.headerRow).values as unknown[];
    expect(header).toEqual(expect.arrayContaining(['Admission No', 'Student name', 'Mark (0–40)', 'Absent / exempt']));
    expect(s.ws.rowCount - s.meta.headerRow).toBe(roster.length);
    const first = rowOf(s, roster[0]!.admissionNo);
    expect(s.ws.getRow(first).getCell(s.meta.columns.indexOf('mark') + 1).value).toBe(17);
    expect(s.ws.getRow(first).getCell(s.meta.columns.indexOf('name') + 1).value).toBe(`${roster[0]!.firstName} ${roster[0]!.lastName}`);
  });

  it('is only available to the course teacher and administrators', async () => {
    const assessmentId = await newAssessment();
    expect((await otherTeacher.get(marksUrl('template', assessmentId))).status).toBe(403);
    expect((await student.get(marksUrl('template', assessmentId))).status).toBe(403);
    expect((await download(admin, marksUrl('template', assessmentId))).status).toBe(200);
  });
});

describe('marks import', () => {
  it('previews and saves new marks, treating 0 as a mark and blank as "no change"', async () => {
    const assessmentId = await newAssessment(50);
    const [a, b, c] = roster;
    await teacher.put(`/api/assessments/${assessmentId}/grades`).send({ grades: [{ studentId: c!.id, score: 12 }] });
    const s = await open((await download(teacher, marksUrl('template', assessmentId))).body);
    setCell(s, rowOf(s, a!.admissionNo), 'mark', 0);
    setCell(s, rowOf(s, b!.admissionNo), 'mark', '42.5');
    setCell(s, rowOf(s, c!.admissionNo), 'mark', null); // blank: keep the saved 12
    const file = await save(s);

    const preview = await upload(teacher, marksUrl('preview', assessmentId), file);
    expect(preview.status).toBe(200);
    expect(preview.body.issues).toEqual([]);
    expect(preview.body.counts).toMatchObject({ create: 2, update: 0, error: 0 });
    expect(preview.body.canSave).toBe(true);
    expect(preview.body.needsOverwriteConfirm).toBe(false);
    expect(preview.body.rows.find((r: { studentId: number }) => r.studentId === a!.id)).toMatchObject({ action: 'create', before: null, after: '0' });
    expect(preview.body.rows.find((r: { studentId: number }) => r.studentId === c!.id)).toMatchObject({ action: 'unchanged', before: '12' });

    const saved = await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${preview.body.fingerprint}&filename=marks.xlsx`), file);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ created: 2, updated: 0 });
    const grades = new Map((await gradesOf(assessmentId)).map((g) => [g.studentId, g]));
    expect(grades.get(a!.id)).toMatchObject({ score: 0, status: null });
    expect(grades.get(b!.id)).toMatchObject({ score: 42.5 });
    expect(grades.get(c!.id)).toMatchObject({ score: 12 });
    expect(grades.size).toBe(3);

    // Who imported, when and what changed.
    const record = await queryOne<{ importedBy: number; createdCount: number; changes: unknown[]; kind: string }>(
      'SELECT imported_by, created_count, changes, kind FROM data_imports WHERE id = $1', [saved.body.importId]);
    expect(record).toMatchObject({ importedBy: await idOf('teacher@edulearn.school'), createdCount: 2, kind: 'marks' });
    expect(record!.changes).toHaveLength(2);
    const log = await queryOne<{ summary: string }>("SELECT summary FROM audit_logs WHERE entity = 'grades' AND entity_id = $1 ORDER BY id DESC LIMIT 1", [String(assessmentId)]);
    expect(log!.summary).toMatch(/Imported marks from Excel.*2 new/);

    // Uploading the same file again changes nothing and creates no duplicates.
    const again = await upload(teacher, marksUrl('preview', assessmentId), file);
    expect(again.body.counts).toMatchObject({ create: 0, update: 0, unchanged: roster.length });
    expect(again.body.canSave).toBe(false);
    const repeat = await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${again.body.fingerprint}`), file);
    expect(repeat.body).toMatchObject({ created: 0, updated: 0, importId: null });
    expect(await gradesOf(assessmentId)).toHaveLength(3);
  });

  it('records ABSENT and EXEMPT as statuses without a score', async () => {
    const assessmentId = await newAssessment(20);
    const s = await open((await download(teacher, marksUrl('template', assessmentId))).body);
    setCell(s, rowOf(s, roster[0]!.admissionNo), 'status', 'ABSENT');
    setCell(s, rowOf(s, roster[1]!.admissionNo), 'status', 'exempt');
    setCell(s, rowOf(s, roster[2]!.admissionNo), 'mark', 15);
    const file = await save(s);
    const preview = await upload(teacher, marksUrl('preview', assessmentId), file);
    expect(preview.body.counts.create).toBe(3);
    await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${preview.body.fingerprint}`), file);
    const grades = new Map((await gradesOf(assessmentId)).map((g) => [g.studentId, g]));
    expect(grades.get(roster[0]!.id)).toMatchObject({ score: null, status: 'absent' });
    expect(grades.get(roster[1]!.id)).toMatchObject({ score: null, status: 'exempt' });
    // The gradebook shows the statuses, and they don't count towards averages.
    const book = await teacher.get(`/api/gradebook/${courseId}`);
    const row = book.body.rows.find((r: { id: number }) => r.id === roster[0]!.id);
    expect(row.statuses[assessmentId]).toBe('absent');
    expect(row.scores[assessmentId]).toBeNull();
  });

  it('applies the same rules to manual entry: statuses, 0 and the maximum', async () => {
    const assessmentId = await newAssessment(10);
    const put = (grades: unknown[]) => teacher.put(`/api/assessments/${assessmentId}/grades`).send({ grades });
    expect((await put([{ studentId: roster[0]!.id, score: null, status: 'absent' }])).status).toBe(200);
    expect((await put([{ studentId: roster[1]!.id, score: 0 }])).status).toBe(200);
    expect((await put([{ studentId: roster[2]!.id, score: 4, status: 'exempt' }])).status).toBe(400);
    expect((await put([{ studentId: roster[2]!.id, score: 11 }])).status).toBe(400);
    const grades = new Map((await gradesOf(assessmentId)).map((g) => [g.studentId, g]));
    expect(grades.get(roster[0]!.id)).toMatchObject({ score: null, status: 'absent' });
    expect(grades.get(roster[1]!.id)).toMatchObject({ score: 0, status: null });
  });

  it('reports every invalid row by Excel row, student and column, and refuses to save', async () => {
    const assessmentId = await newAssessment(30);
    const s = await open((await download(teacher, marksUrl('template', assessmentId))).body);
    const rows = roster.slice(0, 8).map((r) => rowOf(s, r.admissionNo));
    setCell(s, rows[0]!, 'mark', 31);                 // above the maximum
    setCell(s, rows[1]!, 'mark', -1);                 // negative
    setCell(s, rows[2]!, 'mark', 'twelve');           // not a number
    setCell(s, rows[3]!, 'status', 'SICK');           // unknown status
    setCell(s, rows[4]!, 'mark', 10);
    setCell(s, rows[4]!, 'status', 'ABSENT');         // both
    setCell(s, rows[5]!, 'admission', 'ADM-9999-9999'); // altered identifier
    setCell(s, rows[5]!, 'mark', 5);
    setCell(s, rows[6]!, 'name', 'Someone Else');     // name no longer matches the admission number
    setCell(s, rows[6]!, 'mark', 5);
    const dup = roster[9]!;                            // a second row for the same student
    const extra = s.ws.rowCount + 1;
    setCell(s, extra, 'admission', dup.admissionNo);
    setCell(s, extra, 'name', `${dup.firstName} ${dup.lastName}`);
    setCell(s, extra, 'mark', 3);
    const out = s.ws.rowCount + 1;                    // a student from another class
    setCell(s, out, 'admission', outsider.admissionNo);
    setCell(s, out, 'name', outsider.name);
    setCell(s, out, 'mark', 4);
    const file = await save(s);

    const preview = await upload(teacher, marksUrl('preview', assessmentId), file);
    expect(preview.status).toBe(200);
    expect(preview.body.canSave).toBe(false);
    const issues = preview.body.issues as { row: number; column: string; message: string; admissionNo: string }[];
    const at = (row: number) => issues.filter((i) => i.row === row);
    expect(at(rows[0]!)[0]).toMatchObject({ column: 'Mark', message: expect.stringContaining('higher than the maximum of 30') });
    expect(at(rows[1]!)[0]!.message).toMatch(/negative/);
    expect(at(rows[2]!)[0]!.message).toMatch(/isn’t a number/);
    expect(at(rows[3]!)[0]).toMatchObject({ column: 'Absent / exempt' });
    expect(at(rows[4]!)[0]!.message).toMatch(/not both/);
    expect(at(rows[5]!)[0]).toMatchObject({ column: 'Admission No', message: expect.stringContaining('isn’t recognised') });
    expect(at(rows[6]!)[0]).toMatchObject({ column: 'Student name', message: expect.stringContaining('doesn’t match') });
    expect(at(rowOf(s, dup.admissionNo))[0]!.message).toMatch(/more than once/);
    expect(at(extra)[0]!.message).toMatch(/more than once/);
    expect(at(out)[0]!.message).toContain(`no longer in ${className}`);
    expect(at(rows[0]!)[0]!.admissionNo).toBe(roster[0]!.admissionNo);

    const commit = await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${preview.body.fingerprint}`), file);
    expect(commit.status).toBe(400);
    expect(await gradesOf(assessmentId)).toHaveLength(0);
  });

  it('asks for confirmation before overwriting saved marks', async () => {
    const assessmentId = await newAssessment(50);
    await teacher.put(`/api/assessments/${assessmentId}/grades`).send({ grades: [{ studentId: roster[0]!.id, score: 20 }] });
    const s = await open((await download(teacher, marksUrl('template', assessmentId))).body);
    setCell(s, rowOf(s, roster[0]!.admissionNo), 'mark', 25);
    const file = await save(s);
    const preview = await upload(teacher, marksUrl('preview', assessmentId), file);
    expect(preview.body.counts.update).toBe(1);
    expect(preview.body.needsOverwriteConfirm).toBe(true);
    expect(preview.body.rows.find((r: { action: string }) => r.action === 'update')).toMatchObject({ before: '20', after: '25' });
    const refused = await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${preview.body.fingerprint}`), file);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Confirm that you want to overwrite 1 saved mark/);
    expect((await gradesOf(assessmentId))[0]!.score).toBe(20);
    const ok = await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${preview.body.fingerprint}&confirmOverwrite=1`), file);
    expect(ok.body).toMatchObject({ created: 0, updated: 1 });
    expect((await gradesOf(assessmentId))[0]!.score).toBe(25);
  });

  it('requires a fresh review when marks changed after the preview', async () => {
    const assessmentId = await newAssessment(50);
    const s = await open((await download(teacher, marksUrl('template', assessmentId))).body);
    setCell(s, rowOf(s, roster[0]!.admissionNo), 'mark', 30);
    const file = await save(s);
    const preview = await upload(teacher, marksUrl('preview', assessmentId), file);
    // Someone saves a mark on screen in the meantime.
    await teacher.put(`/api/assessments/${assessmentId}/grades`).send({ grades: [{ studentId: roster[0]!.id, score: 11 }] });
    const stale = await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${preview.body.fingerprint}&confirmOverwrite=1`), file);
    expect(stale.status).toBe(409);
    expect((await gradesOf(assessmentId))[0]!.score).toBe(11);
  });

  it('rejects other people, other assessments, other kinds of file and tampered templates', async () => {
    const a1 = await newAssessment();
    const a2 = await newAssessment();
    const s = await open((await download(teacher, marksUrl('template', a1))).body);
    setCell(s, rowOf(s, roster[0]!.admissionNo), 'mark', 5);
    const file = await save(s);

    expect((await upload(otherTeacher, marksUrl('preview', a1), file)).status).toBe(403);
    expect((await upload(otherTeacher, marksUrl('commit', a1, '&fingerprint=x'), file)).status).toBe(403);
    expect((await upload(student, marksUrl('preview', a1), file)).status).toBe(403);

    const wrong = await upload(teacher, marksUrl('preview', a2), file);
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/This template is for/);

    const tampered = await open(file);
    tampered.wb.getWorksheet('_edulearn')!.getCell('A2').value = JSON.stringify({ ...tampered.meta, assessmentId: a2 });
    const bad = await upload(teacher, marksUrl('preview', a2), await save(tampered));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/were changed/);

    const plainCsv = await upload(teacher, marksUrl('preview', a1), Buffer.from('name,mark\nAli,4'));
    expect(plainCsv.status).toBe(400);
    expect(plainCsv.body.error).toMatch(/isn’t an EduLearn template/);
    const binary = await upload(teacher, marksUrl('preview', a1), Buffer.from([0, 1, 2, 3, 0, 9]));
    expect(binary.body.error).toMatch(/isn’t an Excel workbook \(\.xlsx\) or a CSV file/);

    const plain = new ExcelJS.Workbook();
    plain.addWorksheet('Sheet1').getCell('A1').value = 'Admission No';
    const foreign = await upload(teacher, marksUrl('preview', a1), Buffer.from(await plain.xlsx.writeBuffer()));
    expect(foreign.body.error).toMatch(/isn’t an EduLearn template/);
  });

  it('rolls back the whole import if saving fails part-way', async () => {
    const assessmentId = await newAssessment(50);
    const victim = roster[2]!.id;
    await pool.query(`
      CREATE OR REPLACE FUNCTION test_fail_grade() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.assessment_id = ${assessmentId} AND NEW.student_id = ${victim} THEN RAISE EXCEPTION 'simulated failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_grade BEFORE INSERT ON grades FOR EACH ROW EXECUTE FUNCTION test_fail_grade();`);
    try {
      const s = await open((await download(teacher, marksUrl('template', assessmentId))).body);
      for (const r of roster.slice(0, 5)) setCell(s, rowOf(s, r.admissionNo), 'mark', 10);
      const file = await save(s);
      const preview = await upload(teacher, marksUrl('preview', assessmentId), file);
      expect(preview.body.canSave).toBe(true);
      const before = (await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM data_imports'))!.n;
      const res = await upload(teacher, marksUrl('commit', assessmentId, `&fingerprint=${preview.body.fingerprint}`), file);
      expect(res.status).toBe(500);
      expect(await gradesOf(assessmentId)).toHaveLength(0);
      expect((await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM data_imports'))!.n).toBe(before);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS test_fail_grade ON grades; DROP FUNCTION IF EXISTS test_fail_grade();');
    }
  });

  it('never publishes exam results', async () => {
    const paper = await queryOne<{ id: number; examId: number }>(
      `SELECT a.id, a.exam_id FROM assessments a JOIN exams e ON e.id = a.exam_id
        WHERE a.class_subject_id = $1 AND e.published_at IS NULL LIMIT 1`,
      [courseId],
    );
    if (!paper) return; // the sample data has no unpublished exam for this course
    const s = await open((await download(teacher, marksUrl('template', paper.id))).body);
    setCell(s, rowOf(s, roster[3]!.admissionNo), 'mark', 1);
    const file = await save(s);
    const preview = await upload(teacher, marksUrl('preview', paper.id), file);
    await upload(teacher, marksUrl('commit', paper.id, `&fingerprint=${preview.body.fingerprint}&confirmOverwrite=1`), file);
    expect((await queryOne<{ publishedAt: string | null }>('SELECT published_at FROM exams WHERE id = $1', [paper.examId]))!.publishedAt).toBeNull();
  });

  it('exports the gradebook as a read-only workbook', async () => {
    const res = await download(teacher, `/api/imports/marks/export?courseId=${courseId}`);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.getWorksheet('Gradebook')).toBeTruthy();
    expect(wb.getWorksheet('_edulearn')).toBeUndefined();
    expect((await otherTeacher.get(`/api/imports/marks/export?courseId=${courseId}`)).status).toBe(403);
  });
});

describe('attendance import', () => {
  const date = '2024-03-04';
  const url = (step: string, extra = '') => `/api/imports/attendance/${step}?classId=${classId}&date=${date}${extra}`;

  it('imports a register, accepts the allowed statuses only and is safe to upload twice', async () => {
    const res = await download(teacher, url('template'));
    expect(res.status).toBe(200);
    const s = await open(res.body);
    expect(s.meta).toMatchObject({ kind: 'attendance', classId, date });
    setCell(s, rowOf(s, roster[0]!.admissionNo), 'status', 'Present');
    setCell(s, rowOf(s, roster[1]!.admissionNo), 'status', 'absent');
    setCell(s, rowOf(s, roster[1]!.admissionNo), 'note', 'Clinic visit');
    setCell(s, rowOf(s, roster[2]!.admissionNo), 'status', 'L');
    setCell(s, rowOf(s, roster[3]!.admissionNo), 'status', 'Sick');
    let file = await save(s);
    const bad = await upload(teacher, url('preview'), file);
    expect(bad.body.issues).toHaveLength(1);
    expect(bad.body.issues[0]).toMatchObject({ column: 'Status', admissionNo: roster[3]!.admissionNo });

    setCell(s, rowOf(s, roster[3]!.admissionNo), 'status', null);
    file = await save(s);
    const preview = await upload(teacher, url('preview'), file);
    expect(preview.body.counts).toMatchObject({ create: 3, error: 0 });
    const saved = await upload(teacher, url('commit', `&fingerprint=${preview.body.fingerprint}`), file);
    expect(saved.body).toMatchObject({ created: 3, updated: 0 });
    const rows = await query<{ studentId: number; status: string; note: string | null }>(
      'SELECT student_id, status, note FROM attendance WHERE class_id = $1 AND date = $2', [classId, date]);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.studentId === roster[1]!.id)).toMatchObject({ status: 'absent', note: 'Clinic visit' });

    const again = await upload(teacher, url('preview'), file);
    expect(again.body.counts).toMatchObject({ create: 0, update: 0 });
    expect(again.body.canSave).toBe(false);
  });

  it('refuses future dates, other classes and people who cannot take the register', async () => {
    const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    expect((await teacher.get(`/api/imports/attendance/template?classId=${classId}&date=${future}`)).status).toBe(400);
    expect((await otherTeacher.get(url('template'))).status).toBe(403);
    const s = await open((await download(teacher, url('template'))).body);
    const otherDate = await upload(teacher, `/api/imports/attendance/preview?classId=${classId}&date=2024-03-05`, await save(s));
    expect(otherDate.status).toBe(400);
    expect(otherDate.body.error).toMatch(/This template is for/);
    // A marks template is not an attendance template.
    const marks = await download(teacher, marksUrl('template', await newAssessment()));
    expect((await upload(teacher, url('preview'), marks.body)).body.error).toMatch(/marks template, not an attendance template/);
  });

  it('exports attendance for a date range', async () => {
    const res = await download(teacher, `/api/imports/attendance/export?classId=${classId}&from=2024-03-01&to=2024-03-31`);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.getWorksheet('Attendance')!;
    const values = ws.getSheetValues().flat().filter(Boolean);
    expect(values).toEqual(expect.arrayContaining(['03-04', 'Attendance %']));
  });
});
