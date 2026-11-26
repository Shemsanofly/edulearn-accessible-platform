import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, queryOne } from '../src/db/pool.js';
import { app, idOf, signIn } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signIn>>;
let admin: Agent, teacher: Agent, student: Agent, parent: Agent;
let alexId: number, sofiaId: number, teacherId: number;

beforeAll(async () => {
  [admin, teacher, student, parent] = await Promise.all([
    signIn('admin@edulearn.school'),
    signIn('teacher@edulearn.school'),
    signIn('student@edulearn.school'),
    signIn('parent@edulearn.school'),
  ]);
  alexId = await idOf('student@edulearn.school');
  sofiaId = await idOf('asha.juma@students.edulearn.school');
  teacherId = await idOf('teacher@edulearn.school');
});

afterAll(() => pool.end());

describe('authentication', () => {
  it('rejects a wrong password without revealing whether the email exists', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email: 'admin@edulearn.school', password: 'nope-nope' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@edulearn.school', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('requires a session for the API', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });

  it('returns the signed-in user', async () => {
    const res = await teacher.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'teacher', firstName: 'Zuhura' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('saves accessibility preferences', async () => {
    const res = await student.patch('/api/auth/profile').send({ preferences: { fontScale: 1.25, highContrast: true } });
    expect(res.body.user.preferences).toMatchObject({ fontScale: 1.25, highContrast: true });
  });

  it('blocks deactivated accounts', async () => {
    const created = await admin.post('/api/teachers').send({ firstName: 'Temp', lastName: 'Teacher', email: 'temp.teacher@edulearn.school' });
    expect(created.status).toBe(201);
    expect(created.body.temporaryPassword).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
    const id = created.body.record.id;
    expect((await admin.patch(`/api/users/${id}/status`).send({ isActive: false })).status).toBe(204);
    const login = await request(app).post('/api/auth/login').send({ email: 'temp.teacher@edulearn.school', password: created.body.temporaryPassword });
    expect(login.status).toBe(403);
  });
});

describe('role-based access', () => {
  it('only lets staff list students', async () => {
    expect((await student.get('/api/students')).status).toBe(403);
    expect((await parent.get('/api/students')).status).toBe(403);
    expect((await admin.get('/api/students')).body.total).toBeGreaterThan(100);
  });

  it('limits teachers to the students they teach', async () => {
    const res = await teacher.get('/api/students?pageSize=100');
    const classes = new Set(res.body.items.map((s: { className: string }) => s.className));
    expect(classes).toEqual(new Set(['Form 2A', 'Form 2B', 'Form 3A']));
  });

  it('lets parents see their own children only', async () => {
    expect((await parent.get(`/api/students/${alexId}/overview`)).status).toBe(200);
    expect((await parent.get(`/api/students/${sofiaId}/overview`)).status).toBe(200);
    const stranger = await queryOne<{ id: number }>("SELECT user_id AS id FROM students WHERE user_id NOT IN ($1, $2) LIMIT 1", [alexId, sofiaId]);
    expect((await parent.get(`/api/students/${stranger!.id}/overview`)).status).toBe(403);
  });

  it("stops a student reading a classmate's record", async () => {
    expect((await student.get(`/api/students/${sofiaId}`)).status).toBe(403);
    expect((await student.get(`/api/students/${alexId}`)).status).toBe(200);
  });

  it('only lets admins create students', async () => {
    const body = { firstName: 'New', lastName: 'Kid', email: 'new.kid@students.edulearn.school' };
    expect((await teacher.post('/api/students').send(body)).status).toBe(403);
    const res = await admin.post('/api/students').send(body);
    expect(res.status).toBe(201);
    expect(res.body.record.admissionNo).toMatch(/^STU-\d{4}-\d{4}$/);
  });
});

describe('attendance', () => {
  it('lets the class teacher take the register', async () => {
    const reg = await teacher.get('/api/attendance/register?classId=3');
    expect(reg.status).toBe(200);
    const entries = reg.body.entries.map((e: { id: number }, i: number) => ({ studentId: e.id, status: i === 0 ? 'absent' : 'present' }));
    const saved = await teacher.put('/api/attendance/register').send({ classId: 3, date: reg.body.date, entries });
    expect(saved.status).toBe(200);
    expect(saved.body.taken).toBe(true);
    expect(saved.body.entries.filter((e: { status: string }) => e.status === 'absent')).toHaveLength(1);
  });

  it('refuses future dates and other teachers', async () => {
    const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const res = await teacher.put('/api/attendance/register').send({ classId: 3, date: future, entries: [{ studentId: alexId, status: 'present' }] });
    expect(res.status).toBe(400);
    // Mwalimu Zuhura does not teach Form 1A.
    expect((await teacher.get('/api/attendance/register?classId=1')).status).toBe(403);
  });
});

describe('gradebook', () => {
  it('saves grades and rejects scores above the maximum', async () => {
    const courses = await teacher.get('/api/courses');
    const course = courses.body.find((c: { className: string }) => c.className === 'Form 2A');
    const created = await teacher.post('/api/assessments').send({ courseId: course.id, title: 'Pop quiz', type: 'quiz', maxScore: 10 });
    expect(created.status).toBe(201);
    const tooHigh = await teacher.put(`/api/assessments/${created.body.id}/grades`).send({ grades: [{ studentId: alexId, score: 11 }] });
    expect(tooHigh.status).toBe(400);
    const ok = await teacher.put(`/api/assessments/${created.body.id}/grades`).send({ grades: [{ studentId: alexId, score: 9 }] });
    expect(ok.body).toMatchObject({ gradedCount: 1, averagePercent: 90 });
  });

  it("does not let a teacher grade someone else's course", async () => {
    const other = await queryOne<{ id: number }>('SELECT id FROM class_subjects WHERE teacher_id <> $1 LIMIT 1', [teacherId]);
    const res = await teacher.post('/api/assessments').send({ courseId: other!.id, title: 'X', type: 'quiz', maxScore: 10 });
    expect(res.status).toBe(403);
  });
});

describe('fees', () => {
  it('records payments and refuses overpayment', async () => {
    const created = await admin.post('/api/fees/invoices').send({ studentIds: [alexId], title: 'Trip', amount: 100, dueDate: '2030-01-01' });
    expect(created.status).toBe(201);
    const invoiceId = created.body.invoiceIds[0];
    const over = await admin.post(`/api/fees/invoices/${invoiceId}/payments`).send({ amount: 150, method: 'cash' });
    expect(over.status).toBe(400);
    const part = await admin.post(`/api/fees/invoices/${invoiceId}/payments`).send({ amount: 40, method: 'card' });
    expect(part.body).toMatchObject({ status: 'partial', balance: 60 });
    const rest = await admin.post(`/api/fees/invoices/${invoiceId}/payments`).send({ amount: 60, method: 'card' });
    expect(rest.body).toMatchObject({ status: 'paid', balance: 0 });
  });

  it('bills a whole class at once', async () => {
    const res = await admin.post('/api/fees/invoices').send({ classId: 6, title: 'Graduation fee', amount: 50, dueDate: '2030-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(17);
  });

  it('shows parents only their own family invoices', async () => {
    const res = await parent.get('/api/fees/invoices?pageSize=100');
    const students = new Set(res.body.items.map((i: { studentId: number }) => i.studentId));
    expect(students).toEqual(new Set([alexId, sofiaId]));
  });
});

describe('timetable', () => {
  it('detects clashes for the class and the teacher', async () => {
    const slots = await admin.get('/api/timetable?classId=3');
    const busy = slots.body[0];
    // Another course in the same class at the same time → class clash.
    const courses = await admin.get('/api/courses?classId=3');
    const other = courses.body.find((c: { id: number }) => c.id !== busy.courseId);
    const res = await admin.post('/api/timetable').send({ courseId: other.id, dayOfWeek: busy.dayOfWeek, startsAt: busy.startsAt, endsAt: busy.endsAt });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Time clash/);
  });

  it('accepts a free slot', async () => {
    const courses = await admin.get('/api/courses?classId=3');
    const res = await admin.post('/api/timetable').send({ courseId: courses.body[0].id, dayOfWeek: 6, startsAt: '09:00', endsAt: '10:00' });
    expect(res.status).toBe(201);
  });
});

describe('messages', () => {
  it('delivers a message and counts it as unread', async () => {
    const before = (await teacher.get('/api/auth/notifications')).body.unreadMessages;
    const sent = await parent.post('/api/messages').send({ recipientId: teacherId, subject: 'Hello', body: 'Quick question about homework' });
    expect(sent.status).toBe(201);
    expect((await teacher.get('/api/auth/notifications')).body.unreadMessages).toBe(before + 1);
  });

  it('does not let parents message unrelated families', async () => {
    const stranger = await queryOne<{ id: number }>("SELECT id FROM users WHERE role = 'parent' AND email <> 'parent@edulearn.school' LIMIT 1");
    const res = await parent.post('/api/messages').send({ recipientId: stranger!.id, subject: 'Hi', body: 'Hello' });
    expect(res.status).toBe(403);
  });
});

describe('dashboards', () => {
  it.each([
    ['admin', () => admin],
    ['teacher', () => teacher],
    ['student', () => student],
    ['parent', () => parent],
  ])('builds the %s dashboard', async (role, agent) => {
    const res = await agent().get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe(role);
  });
});

describe('class pages', () => {
  it('lets teachers open only the classes they teach', async () => {
    expect((await teacher.get('/api/classes/3')).status).toBe(200); // Form 2A
    expect((await teacher.get('/api/classes/1')).status).toBe(403); // Form 1A
  });
});
