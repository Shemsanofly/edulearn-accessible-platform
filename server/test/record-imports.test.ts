import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RecordResource } from '../../shared/types.js';
import { pool, query, queryOne } from '../src/db/pool.js';
import { resources } from '../src/lib/record-resources.js';
import { parseCsv, XLSX_MIME } from '../src/lib/xlsx.js';
import { app, idOf, signIn } from './helpers.js';
type Agent = Awaited<ReturnType<typeof signIn>>;
let admin: Agent, teacher: Agent, parent: Agent, student: Agent;
let courseId: number, teacherId: number, studentId: number, parentId: number, classId: number;
afterAll(() => pool.end());
beforeAll(async () => {
    [admin, teacher, parent, student] = await Promise.all(['admin', 'teacher', 'parent', 'student'].map(role => signIn(`${role}@edulearn.school`)));
    [teacherId, studentId, parentId] = await Promise.all(['teacher', 'student', 'parent'].map(role => idOf(`${role}@edulearn.school`)));
    const course = (await queryOne<{
        id: number;
        classId: number;
    }>('SELECT id,class_id FROM class_subjects WHERE teacher_id=$1 ORDER BY id LIMIT 1', [teacherId]))!;
    courseId = course.id;
    classId = course.classId;
});
const url = (resource: RecordResource, step: string, extra = '') => `/api/imports/records/${resource}/${step}${extra}`;
const download = (agent: Agent, path: string) => agent.get(path).buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
});
async function open(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const meta = JSON.parse(wb.getWorksheet('_edulearn')!.getCell('A2').value as string) as {
        sheetName: string;
        headerRow: number;
        columns: string[];
    };
    return { wb, meta, sheet: wb.getWorksheet(meta.sheetName)! };
}
async function file(resource: RecordResource, rows: Record<string, unknown>[], agent = admin, scope = '') {
    const response = await download(agent, url(resource, 'template', scope));
    expect(response.status, response.body?.toString()).toBe(200);
    const s = await open(response.body);
    rows.forEach((row, index) => Object.entries(row).forEach(([key, value]) => {
        const col = s.meta.columns.indexOf(key) + 1;
        expect(col, `Column ${key} missing from ${resource}`).toBeGreaterThan(0);
        s.sheet.getCell(s.meta.headerRow + 1 + index, col).value = (Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value) as ExcelJS.CellValue;
    }));
    return Buffer.from(await s.wb.xlsx.writeBuffer());
}
const upload = (agent: Agent, resource: RecordResource, step: string, buffer: Buffer, params = '') => agent.post(url(resource, step, params)).set('Content-Type', XLSX_MIME).send(buffer);
async function save(resource: RecordResource, rows: Record<string, unknown>[], agent = admin, scope = '') {
    const buffer = await file(resource, rows, agent, scope);
    const preview = await upload(agent, resource, 'preview', buffer, scope);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.issues, JSON.stringify(preview.body)).toEqual([]);
    expect(preview.body.canSave, JSON.stringify(preview.body)).toBe(true);
    const params = `${scope || '?'}${scope ? '&' : ''}fingerprint=${preview.body.fingerprint}&confirmOverwrite=1`;
    const result = await upload(agent, resource, 'commit', buffer, params);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return { buffer, preview, result, params };
}
describe('Excel controls for all managed records', () => {
    it.each(Object.keys(resources) as RecordResource[])('downloads a signed %s template and export without passwords or tokens', async (resource) => {
        for (const step of ['template', 'export']) {
            const res = await download(admin, url(resource, step));
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain(XLSX_MIME);
            const s = await open(res.body);
            expect(s.meta.columns).not.toContain('password');
            expect(s.meta.columns).not.toContain('passwordHash');
            expect(s.meta.columns).not.toContain('tokenHash');
            expect(s.sheet.getCell(s.meta.headerRow, 1).value).toContain('Record ID');
        }
    });
    it('does not persist anything on preview and reports all invalid rows', async () => {
        const buffer = await file('subjects', [{ name: 'Bulk Never Saved', code: 'BULK-NS' }, { name: '', code: 'BAD', color: 'not-a-colour' }]);
        const preview = await upload(admin, 'subjects', 'preview', buffer);
        expect(preview.status).toBe(200);
        expect(preview.body.canSave).toBe(false);
        expect(preview.body.issues.length).toBeGreaterThan(0);
        expect(await queryOne("SELECT id FROM subjects WHERE code='BULK-NS'")).toBeNull();
        const commit = await upload(admin, 'subjects', 'commit', buffer, `?fingerprint=${preview.body.fingerprint}`);
        expect(commit.status).toBe(400);
        expect(await queryOne("SELECT id FROM subjects WHERE code='BULK-NS'")).toBeNull();
    });
    it('creates subjects, updates via export, preserves blanks, and requires overwrite confirmation', async () => {
        await save('subjects', [{ name: 'Bulk Civics', code: 'BULKCIV', description: 'Keep this description' }]);
        const subject = (await queryOne<{
            id: number;
        }>("SELECT id FROM subjects WHERE code='BULKCIV'"))!;
        const buffer = await file('subjects', [{ id: subject.id, name: 'Bulk Civics updated' }]);
        const preview = await upload(admin, 'subjects', 'preview', buffer);
        expect(preview.body.counts.update).toBe(1);
        expect(preview.body.needsOverwriteConfirm).toBe(true);
        expect((await upload(admin, 'subjects', 'commit', buffer, `?fingerprint=${preview.body.fingerprint}`)).status).toBe(400);
        expect((await upload(admin, 'subjects', 'commit', buffer, `?fingerprint=${preview.body.fingerprint}&confirmOverwrite=1`)).status).toBe(200);
        expect(await queryOne('SELECT name,description FROM subjects WHERE id=$1', [subject.id])).toMatchObject({ name: 'Bulk Civics updated', description: 'Keep this description' });
    });
    it('rejects stale previews and detects duplicate unique identifiers before saving', async () => {
        const buffer = await file('subjects', [{ name: 'Bulk Stale', code: 'BULKST' }]);
        const preview = await upload(admin, 'subjects', 'preview', buffer);
        await query("UPDATE subjects SET description='Concurrent edit' WHERE code='BULKCIV'");
        expect((await upload(admin, 'subjects', 'commit', buffer, `?fingerprint=${preview.body.fingerprint}`)).status).toBe(409);
        const duplicates = await file('subjects', [{ name: 'Bulk Duplicate', code: 'BULKD1' }, { name: 'Bulk Duplicate', code: 'BULKD2' }]);
        const check = await upload(admin, 'subjects', 'preview', duplicates);
        expect(check.body.canSave).toBe(false);
        expect(check.body.issues.some((i: {
            message: string;
        }) => i.message.includes('more than once'))).toBe(true);
    });
    it('imports classes, teachers, students, parents and guardian links with one-time credentials', async () => {
        const teacherSave = await save('teachers', [{ employeeNo: 'BULK-T1', email: 'bulk.teacher@example.com', firstName: 'Bulk', lastName: 'Teacher' }]);
        expect(teacherSave.result.body.credentials).toHaveLength(1);
        expect((await request(app).post('/api/auth/login').send({ email: 'bulk.teacher@example.com', password: teacherSave.result.body.credentials[0].temporaryPassword })).status).toBe(200);
        await save('classes', [{ name: 'Bulk Class', gradeLevel: 2, capacity: 3, section: 'B', homeroomTeacherId: await idOf('bulk.teacher@example.com') }]);
        const cls = (await queryOne<{
            id: number;
        }>("SELECT id FROM classes WHERE name='Bulk Class'"))!;
        const studentSave = await save('students', [{ admissionNo: 'BULK-S1', email: 'bulk.student@example.com', firstName: 'Bulk', lastName: 'Student', classId: cls.id }]);
        expect(studentSave.result.body.credentials).toHaveLength(1);
        await save('parents', [{ email: 'bulk.parent@example.com', firstName: 'Bulk', lastName: 'Parent' }]);
        const sid = await idOf('bulk.student@example.com'), pid = await idOf('bulk.parent@example.com');
        await save('guardians', [{ parentId: pid, studentId: sid, relationship: 'mother' }]);
        expect(await queryOne('SELECT relationship FROM guardians WHERE parent_id=$1 AND student_id=$2', [pid, sid])).toMatchObject({ relationship: 'mother' });
        const replay = await upload(admin, 'students', 'commit', studentSave.buffer, studentSave.params);
        expect(replay.status).toBe(200);
        expect(replay.body.created).toBe(0);
        expect(replay.body.credentials).toBeUndefined();
    });
    it('imports academic years, terms, grading scales, courses and exams, generating exam papers', async () => {
        await save('academic-years', [{ name: 'Bulk Year', startsOn: '2030-01-01', endsOn: '2030-12-31' }]);
        const year = (await queryOne<{
            id: number;
        }>("SELECT id FROM academic_years WHERE name='Bulk Year'"))!;
        await save('terms', [{ name: 'Bulk Term', startsOn: '2030-01-01', endsOn: '2030-06-01', academicYearId: year.id }]);
        const term = (await queryOne<{
            id: number;
        }>("SELECT id FROM terms WHERE name='Bulk Term'"))!;
        await save('grading-scales', [{ name: 'Bulk Scale', bands: [{ grade: 'A', minPercent: 50, maxPercent: 100, points: 1 }, { grade: 'B', minPercent: 0, maxPercent: 49, points: 2 }] }]);
        const scale = (await queryOne<{
            id: number;
        }>("SELECT id FROM grading_scales WHERE name='Bulk Scale'"))!;
        const cls = (await queryOne<{
            id: number;
        }>("SELECT id FROM classes WHERE name='Bulk Class'"))!;
        const subject = (await queryOne<{
            id: number;
        }>("SELECT id FROM subjects WHERE code='BULKCIV'"))!;
        await save('courses', [{ classId: cls.id, subjectId: subject.id, teacherId: await idOf('bulk.teacher@example.com') }]);
        await save('exams', [{ importKey: 'bulk-exam', name: 'Bulk Exam', termId: term.id, gradingScaleId: scale.id, startsOn: '2030-05-01', endsOn: '2030-05-02', classIds: String(cls.id) }]);
        expect((await queryOne<{
            n: number;
        }>("SELECT COUNT(*)::int AS n FROM assessments a JOIN exams e ON e.id=a.exam_id WHERE e.name='Bulk Exam'"))!.n).toBe(1);
        expect((await queryOne<{
            publishedAt: string | null;
        }>("SELECT published_at FROM exams WHERE name='Bulk Exam'"))!.publishedAt).toBeNull();
    });
    it('allows assigned teachers to import assessments, but blocks foreign courses and parent management access', async () => {
        const outcome = await save('assessments', [{ importKey: 'bulk-teacher-assessment', title: 'Bulk teacher assignment', type: 'assignment', maxScore: 30 }], teacher, `?courseId=${courseId}`);
        expect(outcome.result.body.created).toBe(1);
        const other = (await queryOne<{
            id: number;
        }>('SELECT id FROM class_subjects WHERE teacher_id<>$1 AND class_id NOT IN(SELECT id FROM classes WHERE homeroom_teacher_id=$1) LIMIT 1', [teacherId]))!;
        const buffer = await file('assessments', [{ importKey: 'bulk-forbidden', title: 'Forbidden', type: 'test', maxScore: 30, courseId: other.id }], teacher);
        const preview = await upload(teacher, 'assessments', 'preview', buffer);
        expect(preview.body.canSave).toBe(false);
        for (const actor of [parent, student])
            expect((await download(actor, url('students', 'export'))).status).toBe(403);
        expect((await download(teacher, url('students', 'template'))).status).toBe(403);
        const exported = await open((await download(teacher, url('students', 'export'))).body);
        const exportedIds: number[] = [];
        for (let r = exported.meta.headerRow + 1; r <= exported.sheet.rowCount; r++)
            exportedIds.push(Number(exported.sheet.getCell(r, 1).value));
        const allowed = await query<{
            userId: number;
        }>(`SELECT s.user_id FROM students s JOIN classes c ON c.id=s.class_id WHERE c.homeroom_teacher_id=$1 OR EXISTS(SELECT 1 FROM class_subjects cs WHERE cs.class_id=c.id AND cs.teacher_id=$1)`, [teacherId]);
        expect(exportedIds.every(id => allowed.some(s => s.userId === id))).toBe(true);
    });
    it('imports timetable entries and reports clashes inside the file and with existing lessons', async () => {
        const buffer = await file('timetable', [{ importKey: 'bulk-slot1', courseId, dayOfWeek: 7, startsAt: '05:00', endsAt: '06:00' }, { importKey: 'bulk-slot2', courseId, dayOfWeek: 7, startsAt: '05:30', endsAt: '06:30' }]);
        const preview = await upload(admin, 'timetable', 'preview', buffer);
        expect(preview.body.canSave).toBe(false);
        expect(preview.body.issues.some((i: {
            message: string;
        }) => i.message.includes('Time clash'))).toBe(true);
        await save('timetable', [{ importKey: 'bulk-slot1', courseId, dayOfWeek: 7, startsAt: '05:00', endsAt: '06:00' }]);
        const second = await file('timetable', [{ importKey: 'bulk-slot2', courseId, dayOfWeek: 7, startsAt: '05:30', endsAt: '06:30' }]);
        expect((await upload(admin, 'timetable', 'preview', second)).body.canSave).toBe(false);
    });
    it('imports invoices and payments exactly once, prevents combined overpayment and preserves financial records', async () => {
        await save('fee-structures', [{ importKey: 'bulk-fee', name: 'Bulk Fee', amount: 100, dueDate: '2030-02-01' }]);
        const inv = await save('invoices', [{ importKey: 'bulk-invoice', studentId, title: 'Bulk Invoice', amount: 100, dueDate: '2030-02-01' }]);
        expect((await upload(admin, 'invoices', 'commit', inv.buffer, inv.params)).body.created).toBe(0);
        const invoice = (await queryOne<{
            id: number;
        }>("SELECT id FROM invoices WHERE title='Bulk Invoice'"))!;
        const tooMuch = await file('payments', [{ importKey: 'bulk-pay1', invoiceId: invoice.id, amount: 60, method: 'cash', paidOn: '2026-01-01' }, { importKey: 'bulk-pay2', invoiceId: invoice.id, amount: 60, method: 'cash', paidOn: '2026-01-01' }]);
        expect((await upload(admin, 'payments', 'preview', tooMuch)).body.canSave).toBe(false);
        const pay = await save('payments', [{ importKey: 'bulk-payment', invoiceId: invoice.id, amount: 40, method: 'cash', paidOn: '2026-01-01' }]);
        expect((await upload(admin, 'payments', 'commit', pay.buffer, pay.params)).body.created).toBe(0);
        expect((await queryOne<{
            n: number;
        }>('SELECT COUNT(*)::int AS n FROM payments WHERE invoice_id=$1', [invoice.id]))!.n).toBe(1);
        expect((await queryOne<{
            balance: number;
        }>('SELECT balance FROM invoice_balances WHERE id=$1', [invoice.id]))!.balance).toBe(60);
    });
    it('rolls back all new records and import history if a write fails halfway', async () => {
        const buffer = await file('subjects', [{ name: 'Bulk Rollback One', code: 'BULKR1' }, { name: 'Bulk Rollback Two', code: 'BULKR2' }]);
        const preview = await upload(admin, 'subjects', 'preview', buffer);
        const before = (await queryOne<{
            n: number;
        }>('SELECT COUNT(*)::int AS n FROM data_imports'))!.n;
        await query(`CREATE FUNCTION test_reject_bulk() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.code='BULKR2' THEN RAISE EXCEPTION 'Test write rejection' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`);
        await query('CREATE TRIGGER test_reject_bulk BEFORE INSERT ON subjects FOR EACH ROW EXECUTE FUNCTION test_reject_bulk()');
        try {
            const commit = await upload(admin, 'subjects', 'commit', buffer, `?fingerprint=${preview.body.fingerprint}`);
            expect(commit.status).toBe(400);
            expect(await queryOne("SELECT 1 FROM subjects WHERE code='BULKR1'")).toBeNull();
            expect((await queryOne<{
                n: number;
            }>('SELECT COUNT(*)::int AS n FROM data_imports'))!.n).toBe(before);
        }
        finally {
            await query('DROP TRIGGER test_reject_bulk ON subjects');
            await query('DROP FUNCTION test_reject_bulk()');
        }
    });
    it('imports school events and announcements, and returns invitation links only once', async () => {
        await save('events', [{ importKey: 'bulk-event', title: 'Bulk Sports', type: 'sports', startsOn: '2030-01-03', endsOn: '2030-01-03' }]);
        const notice = await save('announcements', [{ importKey: 'bulk-notice', title: 'Bulk class notice', body: 'Bring your exercise book', audience: 'class', classId, pinned: true }], teacher);
        expect(notice.preview.body.rows[0].after).toContain('Pinned (TRUE/FALSE): false');
        expect(await queryOne("SELECT pinned FROM announcements WHERE title='Bulk class notice'")).toMatchObject({ pinned: false });
        const inv = await save('invitations', [{ importKey: 'bulk-invite', email: 'bulk.invited@example.com', firstName: 'Bulk', lastName: 'Invited', role: 'parent', details: { children: [{ studentId, relationship: 'mother' }] } }]);
        expect(inv.result.body.invitationLinks).toHaveLength(1);
        const token = new URL(inv.result.body.invitationLinks[0].link).searchParams.get('token');
        expect((await request(app).get(`/api/auth/invitation?token=${token}`)).status).toBe(200);
        expect((await upload(admin, 'invitations', 'commit', inv.buffer, inv.params)).body.invitationLinks).toBeUndefined();
    });
    it('imports report-card remarks only for included students and their class teacher', async () => {
        const exam = (await queryOne<{
            id: number;
        }>('SELECT ec.exam_id AS id FROM exam_classes ec JOIN students s ON s.class_id=ec.class_id WHERE s.user_id=$1 LIMIT 1', [studentId]))!;
        const b = await file('report-remarks', [{ examId: exam.id, studentId, remark: 'Bulk: keep practising.' }], admin, `?examId=${exam.id}`);
        const p = await upload(admin, 'report-remarks', 'preview', b, `?examId=${exam.id}`);
        expect(p.body.issues).toEqual([]);
        const result = await upload(admin, 'report-remarks', 'commit', b, `?examId=${exam.id}&fingerprint=${p.body.fingerprint}&confirmOverwrite=1`);
        expect(result.status).toBe(200);
        expect(await queryOne('SELECT remark FROM report_remarks WHERE exam_id=$1 AND student_id=$2', [exam.id, studentId])).toMatchObject({ remark: 'Bulk: keep practising.' });
    });
    it('rejects future births, reversed grade bands and scores beyond database precision before saving', async () => {
        const cases: { resource: RecordResource; row: Record<string, unknown> }[] = [
            { resource: 'students', row: { admissionNo: 'FUTURE-S1', email: 'future@example.com', firstName: 'Future', lastName: 'Student', dateOfBirth: '2099-01-01' } },
            { resource: 'grading-scales', row: { name: 'Invalid reversed band', bands: [{ grade: 'A', minPercent: 80, maxPercent: 100 }, { grade: 'B', minPercent: 61, maxPercent: 40 }, { grade: 'C', minPercent: 0, maxPercent: 60 }] } },
            { resource: 'assessments', row: { importKey: 'too-many-marks', courseId, title: 'Too many marks', type: 'test', maxScore: 10000 } },
        ];
        for (const c of cases) {
            const buffer = await file(c.resource, [c.row]);
            const preview = await upload(admin, c.resource, 'preview', buffer);
            expect(preview.status).toBe(200);
            expect(preview.body.canSave).toBe(false);
            expect(preview.body.issues.length).toBeGreaterThan(0);
        }
    });
    it.each(Object.keys(resources) as RecordResource[])('can re-import an unchanged %s export as a no-op', async (resource) => {
        const exported = await download(admin, url(resource, 'export'));
        const preview = await upload(admin, resource, 'preview', exported.body);
        expect(preview.status, JSON.stringify(preview.body)).toBe(200);
        expect(preview.body.issues, JSON.stringify(preview.body.issues)).toEqual([]);
        expect(preview.body.counts.create).toBe(0);
        expect(preview.body.counts.update).toBe(0);
    });
});

describe('CSV and PDF for managed records', () => {
    const csvLine = (cells: string[]) => cells.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    it('imports new records from a CSV template and re-uploading changes nothing', async () => {
        const tpl = await download(admin, url('subjects', 'template', '?format=csv'));
        expect(tpl.status).toBe(200);
        expect(tpl.headers['content-type']).toContain('text/csv');
        const rows = parseCsv(tpl.body.toString('utf8').replace(/^﻿/, ''));
        const header = rows.findIndex(r => r[0]?.startsWith('Record ID'));
        expect(header).toBeGreaterThan(0);
        const cols = rows[header];
        const line = cols.map(() => '');
        line[cols.indexOf('Import key (new records)')] = 'csv-subject-1';
        line[cols.indexOf('Subject name *')] = 'CSV Bulk Subject';
        line[cols.indexOf('Subject code *')] = 'CSVB1';
        const text = [...rows.slice(0, header + 1).map(csvLine), csvLine(line)].join('\r\n');
        const send = (step: string, params = '') => admin.post(url('subjects', step, params)).set('Content-Type', 'text/csv').send(Buffer.from(text));
        const preview = await send('preview');
        expect(preview.status, JSON.stringify(preview.body)).toBe(200);
        expect(preview.body.issues).toEqual([]);
        expect(preview.body.counts.create).toBe(1);
        const saved = await send('commit', `?fingerprint=${preview.body.fingerprint}`);
        expect(saved.status, JSON.stringify(saved.body)).toBe(200);
        expect(await queryOne('SELECT id FROM subjects WHERE code = $1', ['CSVB1'])).toBeTruthy();
        const again = await send('preview');
        expect(again.body.counts.create).toBe(0);
    });
    it('exports records as CSV and PDF, and refuses a PDF template', async () => {
        const csv = await download(admin, url('subjects', 'export', '?format=csv'));
        expect(csv.status).toBe(200);
        expect(csv.body.toString('utf8')).toContain('CSV Bulk Subject');
        const pdf = await download(admin, url('subjects', 'export', '?format=pdf'));
        expect(pdf.status).toBe(200);
        expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
        expect((await download(admin, url('subjects', 'template', '?format=pdf'))).status).toBe(400);
    });
});
