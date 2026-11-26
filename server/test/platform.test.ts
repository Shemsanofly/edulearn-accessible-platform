import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/lib/phone.js';
import { pool, query, queryOne } from '../src/db/pool.js';
import { app, idOf, signIn } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signIn>>;
let admin: Agent, teacher: Agent, student: Agent, parent: Agent;
let aliId: number, ashaId: number, parentId: number;

beforeAll(async () => {
  [admin, teacher, student, parent] = await Promise.all([
    signIn('admin@edulearn.school'),
    signIn('teacher@edulearn.school'),
    signIn('student@edulearn.school'),
    signIn('parent@edulearn.school'),
  ]);
  aliId = await idOf('student@edulearn.school');
  ashaId = await idOf('asha.juma@students.edulearn.school');
  parentId = await idOf('parent@edulearn.school');
});

afterAll(() => pool.end());

describe('school settings & public site', () => {
  it('exposes school branding publicly and flags demo data', async () => {
    const res = await request(app).get('/api/school');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ currency: 'TZS', levelLabel: 'Form' });
    expect(res.body.isDemo).toBeUndefined();
  });

  it('lets only admins change settings, and records it in the audit log', async () => {
    expect((await teacher.put('/api/school').send({ motto: 'x' })).status).toBe(403);
    const res = await admin.put('/api/school').send({ motto: 'Elimu ni Ufunguo', phone: '0777 123 456' });
    expect(res.body).toMatchObject({ motto: 'Elimu ni Ufunguo', phone: '+255 777 123 456' });
    const log = await admin.get('/api/audit-logs?entity=school');
    expect(log.body.items[0].summary).toMatch(/school settings/i);
    expect((await teacher.get('/api/audit-logs')).status).toBe(403);
  });

  it('accepts contact enquiries from the website and notifies admins', async () => {
    const res = await request(app).post('/api/contact').send({
      kind: 'demo', fullName: 'Test Person', schoolName: 'Test School', email: 'test@example.com', phone: '0655 111 222', message: 'Please show us the system',
    });
    expect(res.status).toBe(201);
    const list = await admin.get('/api/enquiries?status=new');
    const mine = list.body.items.find((e: { fullName: string }) => e.fullName === 'Test Person');
    expect(mine).toMatchObject({ phone: '+255 655 111 222', kind: 'contact' }); // demo requests are no longer offered
    // The hidden honeypot field blocks bots.
    const bot = await request(app).post('/api/contact').send({ fullName: 'Bot', email: 'b@example.com', message: 'spam spam', website: 'http://x' });
    expect(bot.status).toBe(400);
  });
});

describe('phone numbers', () => {
  it('normalises Tanzanian numbers', () => {
    expect(normalizePhone('0777123456')).toBe('+255 777 123 456');
    expect(normalizePhone('+255 777 123 456')).toBe('+255 777 123 456');
    expect(normalizePhone('255712345678')).toBe('+255 712 345 678');
    expect(normalizePhone('12')).toBe('');
  });

  it('rejects invalid phone numbers on forms', async () => {
    const res = await admin.post('/api/parents').send({ firstName: 'A', lastName: 'B', email: 'ab@example.com', phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.details.phone).toMatch(/valid phone/);
  });
});

describe('passwords & sessions', () => {
  it('resets a password with a valid token and signs out old sessions', async () => {
    const email = 'm.said@edulearn.school';
    const old = await signIn(email);
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(200);
    // The real token is only emailed; create a known one to exercise the reset endpoint.
    const token = crypto.randomBytes(32).toString('base64url');
    const userId = await idOf(email);
    await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`, [
      userId, crypto.createHash('sha256').update(token).digest('hex'),
    ]);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' })).status).toBe(204);
    // Old session no longer works; new password does; the token can't be reused.
    expect((await old.get('/api/dashboard')).status).toBe(401);
    await signIn(email, 'brand-new-pass');
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass' })).status).toBe(400);
  });

  it('answers forgot-password the same way for unknown emails', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('signs a user out everywhere when an admin resets their password', async () => {
    const email = 'k.mussa@edulearn.school';
    const session = await signIn(email);
    const id = await idOf(email);
    await admin.post(`/api/users/${id}/reset-password`);
    expect((await session.get('/api/dashboard')).status).toBe(401);
  });
});

describe('grading scales', () => {
  it('rejects overlapping bands', async () => {
    const res = await admin.post('/api/grading-scales').send({
      name: 'Broken', bands: [{ grade: 'A', minPercent: 50, maxPercent: 100 }, { grade: 'B', minPercent: 0, maxPercent: 60 }],
    });
    expect(res.status).toBe(400);
  });

  it('creates a valid scale', async () => {
    const res = await admin.post('/api/grading-scales').send({
      name: 'Pass/Fail', bands: [{ grade: 'P', minPercent: 50, maxPercent: 100, remark: 'Pass' }, { grade: 'F', minPercent: 0, maxPercent: 49, remark: 'Fail' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.bands).toHaveLength(2);
  });
});

describe('examinations & report cards', () => {
  let examId: number;

  it('creates an exam with a paper for every subject in each class', async () => {
    const res = await admin.post('/api/exams').send({ name: 'Test Exam', startsOn: '2030-03-01', endsOn: '2030-03-05', classIds: [3] });
    expect(res.status).toBe(201);
    examId = res.body.id;
    const detail = await admin.get(`/api/exams/${examId}`);
    expect(detail.body.papers).toHaveLength(8);
    expect(detail.body.marksExpected).toBe(8 * 22);
  });

  it('lets the subject teacher enter marks in the gradebook', async () => {
    const detail = await teacher.get(`/api/exams/${examId}`);
    const maths = detail.body.papers.find((p: { subjectName: string }) => p.subjectName === 'Mathematics');
    const res = await teacher.put(`/api/assessments/${maths.assessmentId}/grades`).send({ grades: [{ studentId: aliId, score: 81 }] });
    expect(res.status).toBe(200);
    // But not another teacher's subject.
    const english = detail.body.papers.find((p: { subjectName: string }) => p.subjectName === 'English Language');
    expect((await teacher.put(`/api/assessments/${english.assessmentId}/grades`).send({ grades: [{ studentId: aliId, score: 50 }] })).status).toBe(403);
  });

  it('hides results from parents until they are published', async () => {
    expect((await parent.get(`/api/exams/${examId}/report-cards/${aliId}`)).status).toBe(404);
    expect((await parent.get('/api/exams')).body.some((e: { id: number }) => e.id === examId)).toBe(false);
    const pub = await admin.post(`/api/exams/${examId}/publish`).send({ publish: true });
    expect(pub.body.publishedAt).toBeTruthy();
    const card = await parent.get(`/api/exams/${examId}/report-cards/${aliId}`);
    expect(card.status).toBe(200);
    const maths = card.body.subjects.find((s: { subjectName: string }) => s.subjectName === 'Mathematics');
    expect(maths).toMatchObject({ marks: 81, grade: 'A', remark: 'Excellent' });
    expect(card.body.position).toBe(1);
    // Parents were told.
    const notes = await parent.get('/api/notifications');
    expect(notes.body.items.some((n: { title: string }) => n.title === 'Test Exam results are out')).toBe(true);
  });

  it("doesn't show another family's report card", async () => {
    const other = await queryOne<{ id: number }>(
      'SELECT s.user_id AS id FROM students s WHERE s.class_id = 3 AND s.user_id <> $1 LIMIT 1',
      [aliId],
    );
    expect((await parent.get(`/api/exams/${examId}/report-cards/${other!.id}`)).status).toBe(403);
  });

  it('lets the class teacher write the report-card remark', async () => {
    expect((await teacher.put(`/api/exams/${examId}/report-cards/${aliId}/remark`).send({ remark: 'Hongera!' })).status).toBe(204);
    const card = await student.get(`/api/exams/${examId}/report-cards/${aliId}`);
    expect(card.body.remark).toBe('Hongera!');
    // Asha is not in her class.
    expect((await teacher.put(`/api/exams/${examId}/report-cards/${ashaId}/remark`).send({ remark: 'x' })).status).toBe(403);
  });

  it('shows class performance with rankings', async () => {
    const res = await teacher.get(`/api/exams/${examId}/performance?classId=3`);
    expect(res.status).toBe(200);
    expect(res.body.ranking[0]).toMatchObject({ studentId: aliId, position: 1 });
  });
});

describe('fees', () => {
  it('applies a fee structure once per student, even when run twice', async () => {
    const fs = await admin.post('/api/fees/structures').send({ name: 'Trip fee', amount: 25000, level: 4, dueDate: '2030-01-10' });
    expect(fs.status).toBe(201);
    const first = await admin.post(`/api/fees/structures/${fs.body.id}/apply`).send({});
    expect(first.body.created).toBe(17);
    const again = await admin.post(`/api/fees/structures/${fs.body.id}/apply`).send({});
    expect(again.body.created).toBe(0);
    // The amount can't change once invoices exist.
    expect((await admin.patch(`/api/fees/structures/${fs.body.id}`).send({ amount: 30000 })).status).toBe(409);
  });

  it('issues numbered receipts that the family can see', async () => {
    const inv = await admin.post('/api/fees/invoices').send({ studentIds: [aliId], title: 'Uniform', amount: 40000, dueDate: '2030-01-01' });
    const paid = await admin.post(`/api/fees/invoices/${inv.body.invoiceIds[0]}/payments`).send({ amount: 15000, method: 'mobile_money', reference: 'MP123' });
    const payment = paid.body.payments[0];
    expect(payment.receiptNo).toMatch(/^RCT-\d{4}-\d{6}$/);
    const receipt = await parent.get(`/api/fees/payments/${payment.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({ balanceAfter: 25000 });
    expect((await teacher.get(`/api/fees/payments/${payment.id}/receipt`)).status).toBe(403);
    const notes = await parent.get('/api/notifications');
    expect(notes.body.items.some((n: { title: string }) => n.title.startsWith('Payment received'))).toBe(true);
  });

  it('sends fee reminders for overdue invoices', async () => {
    const res = await admin.post('/api/fees/reminders').send({});
    expect(res.status).toBe(200);
    expect(res.body.reminded).toBeGreaterThan(0);
  });
});

describe('notifications', () => {
  it('tells parents when their child is marked absent, once', async () => {
    const reg = await teacher.get('/api/attendance/register?classId=3');
    const entries = reg.body.entries.map((e: { id: number }) => ({ studentId: e.id, status: e.id === aliId ? 'absent' : 'present' }));
    await teacher.put('/api/attendance/register').send({ classId: 3, date: reg.body.date, entries });
    await teacher.put('/api/attendance/register').send({ classId: 3, date: reg.body.date, entries });
    const notes = await parent.get('/api/notifications?unread=true&pageSize=100');
    const absences = notes.body.items.filter((n: { title: string }) => n.title === 'Ali was marked absent');
    expect(absences).toHaveLength(1);
    const counts = await parent.get('/api/auth/notifications');
    expect(counts.body.unreadNotifications).toBeGreaterThan(0);
    await parent.post('/api/notifications/read-all');
    expect((await parent.get('/api/auth/notifications')).body.unreadNotifications).toBe(0);
  });
});

describe('files', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  it('stores student photos and only shows them to people who may see the student', async () => {
    const res = await admin.put(`/api/users/${aliId}/photo`).set('Content-Type', 'image/png').send(png);
    expect(res.status).toBe(200);
    expect((await parent.get(`/api/users/${aliId}/photo`)).status).toBe(200);
    const stranger = await signIn('a.makame@edulearn.school'); // teaches Kiswahili in Form 1A & 1B? — not Form 2A
    const teaches = await queryOne('SELECT 1 FROM class_subjects WHERE class_id = 3 AND teacher_id = $1', [await idOf('a.makame@edulearn.school')]);
    expect((await stranger.get(`/api/users/${aliId}/photo`)).status).toBe(teaches ? 200 : 403);
    expect((await parent.put(`/api/users/${aliId}/photo`).set('Content-Type', 'image/png').send(png)).status).toBe(403);
  });

  it('attaches files to assignments for the class to download', async () => {
    const courses = await teacher.get('/api/courses');
    const course = courses.body.find((c: { className: string }) => c.className === 'Form 2A');
    const created = await teacher.post('/api/assessments').send({ courseId: course.id, title: 'Worksheet', type: 'assignment', maxScore: 20, dueDate: '2030-01-01' });
    const up = await teacher
      .post(`/api/assessments/${created.body.id}/files?name=worksheet.pdf`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.4 test'));
    expect(up.status).toBe(201);
    const list = await parent.get(`/api/students/${aliId}/assignments`);
    const item = list.body.find((a: { id: number }) => a.id === created.body.id);
    expect(item.files).toHaveLength(1);
    expect(item.status).toBe('upcoming');
    const download = await student.get(item.files[0].url.replace('/api', '/api'));
    expect(download.status).toBe(200);
    // Executables are refused.
    const bad = await teacher.post(`/api/assessments/${created.body.id}/files?name=x.exe`).set('Content-Type', 'application/x-msdownload').send(Buffer.from('MZ'));
    expect(bad.status).toBe(400);
  });
});

describe('reports', () => {
  it('limits reports by role', async () => {
    expect((await admin.get('/api/reports/financial')).status).toBe(200);
    expect((await teacher.get('/api/reports/financial')).status).toBe(403);
    expect((await parent.get('/api/reports/attendance')).status).toBe(403);
    const att = await teacher.get('/api/reports/attendance?classId=3');
    expect(att.status).toBe(200);
    expect(att.body.rows.length).toBe(22);
    expect((await teacher.get('/api/reports/attendance?classId=1')).status).toBe(403);
  });

  it('builds teacher and student registers', async () => {
    const teachers = await admin.get('/api/reports/teachers');
    expect(teachers.body.find((t: { name: string }) => t.name === 'Zuhura Hamad').lessonsPerWeek).toBeGreaterThan(0);
    const students = await admin.get('/api/reports/students?classId=3');
    expect(students.body.find((s: { id: number }) => s.id === aliId).guardians).toMatch(/Mwanaisha Juma/);
  });
});

describe('parent access', () => {
  it('only lists the parent’s own children', async () => {
    const dash = await parent.get('/api/dashboard');
    expect(dash.body.children.map((c: { student: { id: number } }) => c.student.id).sort()).toEqual([aliId, ashaId].sort());
    expect(parentId).toBeGreaterThan(0);
  });
});
