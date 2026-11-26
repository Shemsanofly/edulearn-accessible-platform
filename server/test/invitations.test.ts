import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, query, queryOne } from '../src/db/pool.js';
import { app, idOf, signIn } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signIn>>;
let admin: Agent, teacher: Agent, parent: Agent;
let aliId: number;

beforeAll(async () => {
  [admin, teacher, parent] = await Promise.all([
    signIn('admin@edulearn.school'),
    signIn('teacher@edulearn.school'),
    signIn('parent@edulearn.school'),
  ]);
  aliId = await idOf('student@edulearn.school');
});

afterAll(() => pool.end());

const tokenFrom = (link: string) => new URL(link).searchParams.get('token')!;

describe('issuing invitations', () => {
  it('is limited to administrators', async () => {
    const body = { email: 'x@example.com', role: 'teacher', firstName: 'X', lastName: 'Y' };
    expect((await teacher.post('/api/invitations').send(body)).status).toBe(403);
    expect((await parent.post('/api/invitations').send(body)).status).toBe(403);
    expect((await request(app).post('/api/invitations').send(body)).status).toBe(401);
    expect((await teacher.get('/api/invitations')).status).toBe(403);
  });

  it('returns a one-time link and stores only a hash of the token', async () => {
    const res = await admin.post('/api/invitations').send({ email: 'new.teacher@example.com', role: 'teacher', firstName: 'Neema', lastName: 'Ali', details: { specialization: 'Biology' } });
    expect(res.status).toBe(201);
    expect(res.body.link).toMatch(/\/register\?token=/);
    expect(res.body.emailed).toBe(false); // no SMTP in tests
    expect(res.body.invitation).toMatchObject({ status: 'pending', role: 'teacher', detailSummary: 'Biology' });
    const token = tokenFrom(res.body.link);
    const stored = await queryOne<{ tokenHash: string }>('SELECT token_hash FROM invitations WHERE id = $1', [res.body.invitation.id]);
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });

  it('refuses emails that already have an account or an open invitation', async () => {
    expect((await admin.post('/api/invitations').send({ email: 'parent@edulearn.school', role: 'parent', firstName: 'A', lastName: 'B' })).status).toBe(409);
    expect((await admin.post('/api/invitations').send({ email: 'new.teacher@example.com', role: 'teacher', firstName: 'A', lastName: 'B' })).status).toBe(409);
  });

  it('validates class and children references', async () => {
    const badClass = await admin.post('/api/invitations').send({ email: 's1@example.com', role: 'student', firstName: 'A', lastName: 'B', details: { classId: 99999 } });
    expect(badClass.status).toBe(400);
    const badChild = await admin.post('/api/invitations').send({ email: 'p1@example.com', role: 'parent', firstName: 'A', lastName: 'B', details: { children: [{ studentId: 99999, relationship: 'mother' }] } });
    expect(badChild.status).toBe(400);
  });
});

describe('registering with an invitation', () => {
  it('shows who the invitation is for, without needing an account', async () => {
    const res = await admin.post('/api/invitations').send({ email: 'mama.ali@example.com', role: 'parent', firstName: 'Rehema', lastName: 'Juma', details: { children: [{ studentId: aliId, relationship: 'aunt' }] } });
    const token = tokenFrom(res.body.link);
    const lookup = await request(app).get(`/api/auth/invitation?token=${token}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({ email: 'mama.ali@example.com', role: 'parent', detailSummary: 'Ali Juma' });
    expect(lookup.body.id).toBeUndefined();
  });

  it('creates the invited account with the invited role only, links children, and signs in', async () => {
    const res = await admin.post('/api/invitations').send({ email: 'guardian@example.com', role: 'parent', firstName: 'Saida', lastName: 'Omar', details: { children: [{ studentId: aliId, relationship: 'guardian' }] } });
    const token = tokenFrom(res.body.link);
    const agent = request.agent(app);
    // Extra fields such as role, email or isAdmin are ignored.
    const reg = await agent.post('/api/auth/register').send({ token, firstName: 'Saida', lastName: 'Omar', phone: '0655 123 456', password: 'strong-pass-1', role: 'admin', email: 'evil@example.com', isAdmin: true });
    expect(reg.status).toBe(201);
    expect(reg.body.user).toMatchObject({ role: 'parent', email: 'guardian@example.com', phone: '+255 655 123 456' });
    // Signed in straight away, and sees the linked child.
    const children = await agent.get('/api/my/children');
    expect(children.body.map((c: { id: number }) => c.id)).toEqual([aliId]);
    expect((await agent.get('/api/students')).status).toBe(403);
    // The invitation is now used up.
    expect((await request(app).get(`/api/auth/invitation?token=${token}`)).status).toBe(404);
    expect((await request(app).post('/api/auth/register').send({ token, firstName: 'X', lastName: 'Y', password: 'another-pass' })).status).toBe(404);
    const list = await admin.get('/api/invitations?status=accepted');
    expect(list.body.items.some((i: { email: string }) => i.email === 'guardian@example.com')).toBe(true);
  });

  it('places invited students in their class and gives teachers a staff record', async () => {
    const s = await admin.post('/api/invitations').send({ email: 'new.student@example.com', role: 'student', firstName: 'Hamza', lastName: 'Said', details: { classId: 3 } });
    const sReg = await request(app).post('/api/auth/register').send({ token: tokenFrom(s.body.link), firstName: 'Hamza', lastName: 'Said', password: 'student-pass-1' });
    expect(sReg.status).toBe(201);
    const student = await queryOne<{ classId: number; admissionNo: string }>('SELECT class_id, admission_no FROM students WHERE user_id = $1', [sReg.body.user.id]);
    expect(student).toMatchObject({ classId: 3 });
    expect(student!.admissionNo).toMatch(/^STU-\d{4}-\d{4}$/);

    const t = await admin.post('/api/invitations').send({ email: 'another.teacher@example.com', role: 'teacher', firstName: 'Omar', lastName: 'Faki', details: { specialization: 'Physics' } });
    const tReg = await request(app).post('/api/auth/register').send({ token: tokenFrom(t.body.link), firstName: 'Omar', lastName: 'Faki', password: 'teacher-pass-1' });
    expect(tReg.status).toBe(201);
    expect(await queryOne('SELECT 1 FROM teachers WHERE user_id = $1 AND specialization = $2', [tReg.body.user.id, 'Physics'])).toBeTruthy();
  });

  it('rejects unknown, expired and cancelled invitations', async () => {
    expect((await request(app).get('/api/auth/invitation?token=not-a-real-token-at-all-xyz')).status).toBe(404);
    expect((await request(app).post('/api/auth/register').send({ token: 'not-a-real-token-at-all-xyz', firstName: 'A', lastName: 'B', password: 'some-pass-1' })).status).toBe(404);

    const exp = await admin.post('/api/invitations').send({ email: 'late@example.com', role: 'teacher', firstName: 'A', lastName: 'B' });
    await query("UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [exp.body.invitation.id]);
    expect((await request(app).get(`/api/auth/invitation?token=${tokenFrom(exp.body.link)}`)).status).toBe(410);
    expect((await request(app).post('/api/auth/register').send({ token: tokenFrom(exp.body.link), firstName: 'A', lastName: 'B', password: 'some-pass-1' })).status).toBe(410);

    const rev = await admin.post('/api/invitations').send({ email: 'cancel@example.com', role: 'teacher', firstName: 'A', lastName: 'B' });
    expect((await admin.delete(`/api/invitations/${rev.body.invitation.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/auth/invitation?token=${tokenFrom(rev.body.link)}`)).status).toBe(404);
  });

  it('re-sending replaces the old link', async () => {
    const inv = await admin.post('/api/invitations').send({ email: 'resend@example.com', role: 'teacher', firstName: 'A', lastName: 'B' });
    const again = await admin.post(`/api/invitations/${inv.body.invitation.id}/resend`).send({});
    expect(again.status).toBe(200);
    expect((await request(app).get(`/api/auth/invitation?token=${tokenFrom(inv.body.link)}`)).status).toBe(404);
    expect((await request(app).get(`/api/auth/invitation?token=${tokenFrom(again.body.link)}`)).status).toBe(200);
  });

  it('validates the password and names', async () => {
    const inv = await admin.post('/api/invitations').send({ email: 'weak@example.com', role: 'teacher', firstName: 'A', lastName: 'B' });
    const res = await request(app).post('/api/auth/register').send({ token: tokenFrom(inv.body.link), firstName: '', lastName: 'B', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['firstName', 'password']));
  });

  it('lets administrators invite another administrator, but only administrators', async () => {
    const inv = await admin.post('/api/invitations').send({ email: 'deputy@example.com', role: 'admin', firstName: 'Deputy', lastName: 'Head' });
    const reg = await request(app).post('/api/auth/register').send({ token: tokenFrom(inv.body.link), firstName: 'Deputy', lastName: 'Head', password: 'deputy-pass-1' });
    expect(reg.body.user.role).toBe('admin');
  });
});

describe('sorting lists', () => {
  it('sorts students by admission number in both directions and ignores unknown keys', async () => {
    const asc = await admin.get('/api/students?sort=admission&dir=asc&pageSize=5');
    const desc = await admin.get('/api/students?sort=admission&dir=desc&pageSize=5');
    const a = asc.body.items.map((s: { admissionNo: string }) => s.admissionNo);
    const d = desc.body.items.map((s: { admissionNo: string }) => s.admissionNo);
    expect([...a].sort()).toEqual(a);
    expect([...d].sort().reverse()).toEqual(d);
    expect((await admin.get('/api/students?sort=password_hash;DROP%20TABLE%20users')).status).toBe(200);
  });

  it('sorts invoices by balance', async () => {
    const res = await admin.get('/api/fees/invoices?sort=balance&dir=desc&pageSize=10');
    const balances = res.body.items.map((i: { balance: number }) => i.balance);
    expect([...balances].sort((x, y) => y - x)).toEqual(balances);
  });
});
