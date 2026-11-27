import type pg from 'pg';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { RecordResource, SessionUser } from '../../../shared/types.js';
import { pool, query, queryOne } from '../db/pool.js';
import { config } from '../config.js';
import { createUser, updateUser } from './accounts.js';
import { badRequest, forbidden } from './http.js';
import { checkBands } from './grading.js';
import { notifyWhere } from './notify.js';
import { id, isoDate, optionalText } from './validators.js';
import { parentSchema, studentSchema, teacherSchema } from './people.js';
import { classSchema, subjectSchema, termSchema, slotSchema } from '../routes/academics.js';
import { yearSchema, scaleSchema, examSchema, syncPapers } from '../routes/exams.js';
import { assessmentSchema } from '../routes/assessments.js';
import { structureSchema, money } from '../routes/fees.js';
import { announcementSchema, eventSchema } from '../routes/communication.js';
import { invitationSchema, hashInviteToken } from '../routes/invitations.js';
export type DataRow = Record<string, unknown>;
export type Db = pg.PoolClient | typeof pool;
type Ref = 'students' | 'teachers' | 'parents' | 'classes' | 'subjects' | 'terms' | 'years' | 'scales' | 'courses' | 'exams' | 'invoices';
export interface Column {
    key: string;
    label: string;
    type?: 'number' | 'boolean' | 'date' | 'time' | 'list' | 'json';
    ref?: Ref;
}
export interface ResourceContext {
    user: SessionUser;
    db: Db;
    refs: Record<string, DataRow[]>;
    credentials: {
        email: string;
        temporaryPassword: string;
    }[];
    invitationLinks: {
        email: string;
        link: string;
    }[];
}
export interface Resource {
    label: string;
    schema: z.ZodType;
    columns: Column[];
    keys?: string[];
    teacherWrite?: boolean;
    load: (user: SessionUser, db: Db) => Promise<DataRow[]>;
    validate?: (row: DataRow, before: DataRow | undefined, ctx: ResourceContext) => Promise<void>;
    save: (row: DataRow, before: DataRow | undefined, ctx: ResourceContext) => Promise<number>;
}
const field = (key: string, label: string, type?: Column['type'], ref?: Ref): Column => ({ key, label, type, ref });
const ref = (key: string, label: string, target: Ref) => field(key, `${label} ID (see reference sheet)`, 'number', target);
const dates = [field('startsOn', 'Start date (YYYY-MM-DD)', 'date'), field('endsOn', 'End date (YYYY-MM-DD)', 'date')];
const current = field('isCurrent', 'Current (TRUE/FALSE)', 'boolean');
const active = field('isActive', 'Active (TRUE/FALSE)', 'boolean');
const personColumns = [field('firstName', 'First name *'), field('lastName', 'Last name *'), field('email', 'Email *'), field('phone', 'Phone'), active];
const personScope = (user: SessionUser, alias = 's') => user.role === 'teacher'
    ? ` AND EXISTS (SELECT 1 FROM classes cl WHERE cl.id = ${alias}.class_id AND (cl.homeroom_teacher_id = ${user.id} OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = cl.id AND cs.teacher_id = ${user.id})))` : '';
const courseScope = (user: SessionUser, alias = 'cs') => user.role === 'teacher'
    ? ` AND (${alias}.teacher_id = ${user.id} OR EXISTS (SELECT 1 FROM classes cl WHERE cl.id = ${alias}.class_id AND cl.homeroom_teacher_id = ${user.id}))` : '';
/** Names below come only from this source file, never from spreadsheet input. */
async function tableSave(table: string, mapping: Record<string, string>, row: DataRow, recordId: number | null, db: Db, extras: DataRow = {}, idColumn = 'id') {
    const entries = Object.entries(mapping).filter(([key]) => row[key] !== undefined).map(([key, column]) => [column, row[key]] as const);
    entries.push(...Object.entries(extras));
    const columns = entries.map(([column]) => column);
    const values = entries.map(([, value]) => value);
    if (recordId !== null) {
        await query(`UPDATE ${table} SET ${columns.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE ${idColumn} = $${values.length + 1}`, [...values, recordId], db);
        return recordId;
    }
    const result = await queryOne<{
        id: number;
    }>(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${idColumn} AS id`, values, db);
    return result!.id;
}
const basic = (table: string, mapping: Record<string, string>) => async (row: DataRow, before: DataRow | undefined, ctx: ResourceContext) => tableSave(table, mapping, row, before ? Number(before.id) : null, ctx.db);
const ordered = (sql: string) => (_user: SessionUser, db: Db) => query<DataRow>(`${sql} ORDER BY 1`, [], db);
const ensureDateRange = async (row: DataRow) => {
    if (String(row.endsOn) < String(row.startsOn) || ((row.isCurrent !== undefined) && row.endsOn === row.startsOn))
        throw badRequest('End date must be after the start date (exams and events may end on the same date).');
};
const requireAssignedCourse = async (row: DataRow, ctx: ResourceContext) => {
    const course = ctx.refs.courses.find((c) => Number(c.id) === Number(row.courseId));
    if (!course)
        throw badRequest('Choose an existing course from the Courses reference sheet.');
    if (ctx.user.role === 'teacher' && Number(course.teacherId) !== ctx.user.id)
        throw forbidden('Only the assigned subject teacher can change this course.');
};
async function validatePerson(row: DataRow, before: DataRow | undefined, ctx: ResourceContext) {
    const existing = await queryOne<{
        id: number;
    }>('SELECT id FROM users WHERE email = $1', [row.email], ctx.db);
    if (existing && existing.id !== Number(before?.id))
        throw badRequest('This email belongs to another person. Use a unique email.');
}
function personResource(role: 'student' | 'teacher' | 'parent', schema: z.ZodType, columns: Column[], load: Resource['load'], mapping: Record<string, string>): Resource {
    return {
        label: role === 'student' ? 'Students' : role === 'teacher' ? 'Teachers' : 'Parents', schema, columns, keys: ['email'], load,
        validate: async (row, before, ctx) => {
            await validatePerson(row, before, ctx);
            if (role === 'student' && row.dateOfBirth && String(row.dateOfBirth) > new Date().toISOString().slice(0, 10)) {
                throw badRequest('Date of birth cannot be in the future.');
            }
            if (role !== 'parent') {
                const table = role === 'student' ? 'students' : 'teachers';
                const key = role === 'student' ? 'admissionNo' : 'employeeNo';
                if (!row[key])
                    throw badRequest(`${key} is required for spreadsheet enrollment.`);
                const existing = await queryOne<{
                    id: number;
                }>(`SELECT user_id AS id FROM ${table} WHERE ${mapping[key]} = $1`, [row[key]], ctx.db);
                if (existing && existing.id !== Number(before?.id))
                    throw badRequest(`${key} is already assigned to another person.`);
            }
            if (role === 'student' && row.classId && (!before || Number(before.classId) !== Number(row.classId))) {
                const cls = ctx.refs.classes.find((c) => Number(c.id) === Number(row.classId));
                const count = await queryOne<{
                    n: number;
                }>('SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1', [row.classId], ctx.db);
                if (cls && count!.n >= Number(cls.capacity))
                    throw badRequest('This class is full. Choose another class.');
            }
        },
        save: async (row, before, ctx) => {
            let recordId = Number(before?.id);
            if (!before) {
                const account = await createUser(ctx.db as pg.PoolClient, { ...row, role } as Parameters<typeof createUser>[1]);
                recordId = account.id;
                if (account.temporaryPassword)
                    ctx.credentials.push({ email: String(row.email), temporaryPassword: account.temporaryPassword });
                if (role !== 'parent')
                    await tableSave(role === 'student' ? 'students' : 'teachers', mapping, row, null, ctx.db, { user_id: recordId }, 'user_id');
            }
            else {
                await updateUser(ctx.db as pg.PoolClient, recordId, row);
                if (row.isActive === false && before.isActive !== false)
                    await query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [recordId], ctx.db);
                if (role !== 'parent')
                    await tableSave(role === 'student' ? 'students' : 'teachers', mapping, row, recordId, ctx.db, {}, 'user_id');
            }
            return recordId;
        },
    };
}
export const resources: Record<RecordResource, Resource> = {
    invitations: {
        label: 'Invitations', schema: invitationSchema,
        columns: [field('email', 'Email *'), field('role', 'Role (admin/teacher/parent/student) *'), field('firstName', 'First name *'), field('lastName', 'Last name *'), field('details', 'Access details JSON (see instructions)', 'json'), field('message', 'Message'), field('expiresInDays', 'Valid for days (1-30)', 'number')],
        load: ordered('SELECT id,email,role,first_name,last_name,details,message,14 AS expires_in_days,accepted_at,revoked_at,expires_at FROM invitations'),
        validate: async (row, before, ctx) => {
            if (before)
                throw badRequest('Existing invitations are read-only during import. Use Resend or Cancel on the Invitations page.');
            if (await queryOne('SELECT 1 FROM users WHERE email=$1', [row.email], ctx.db))
                throw badRequest('This email already has an account.');
            if (await queryOne('SELECT 1 FROM invitations WHERE email=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()', [row.email], ctx.db))
                throw badRequest('This email already has a pending invitation.');
            const details = row.details as DataRow;
            if (row.role === 'student' && details.classId && !ctx.refs.classes.some(c => c.id === details.classId))
                throw badRequest('Choose an existing class ID in access details.');
            if (row.role === 'parent' && ((details.children ?? []) as DataRow[]).some(c => !ctx.refs.students.some(s => s.id === c.studentId)))
                throw badRequest('Choose existing student IDs in access details.');
        },
        save: async (row, _before, ctx) => {
            const token = crypto.randomBytes(32).toString('base64url');
            const d = row.details as DataRow;
            const details = row.role === 'parent' ? { children: d.children ?? [] } : row.role === 'student' ? { classId: d.classId ?? null } : row.role === 'teacher' ? { specialization: d.specialization ?? null } : {};
            await query('UPDATE invitations SET revoked_at=now() WHERE email=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at<=now()', [row.email], ctx.db);
            const out = await queryOne<{
                id: number;
            }>(`INSERT INTO invitations(token_hash,email,role,first_name,last_name,details,message,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+($9||' days')::interval) RETURNING id`, [hashInviteToken(token), row.email, row.role, row.firstName, row.lastName, JSON.stringify(details), row.message, ctx.user.id, String(row.expiresInDays)], ctx.db);
            ctx.invitationLinks.push({ email: String(row.email), link: `${config.appUrl.replace(/\/$/, '')}/register?token=${encodeURIComponent(token)}` });
            return out!.id;
        },
    },
    students: personResource('student', studentSchema.omit({ password: true }).extend({ admissionNo: z.string().trim().min(1).max(40) }), [
        field('admissionNo', 'Admission number *'), ...personColumns, ref('classId', 'Class', 'classes'),
        field('dateOfBirth', 'Date of birth (YYYY-MM-DD)', 'date'), field('gender', 'Gender (male/female/other/unspecified)'),
        field('address', 'Address'), field('accessibilityNeeds', 'Support needs (separate with |)', 'list'), field('medicalNotes', 'Medical notes'),
    ], (user, db) => query<DataRow>(`SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active,
    s.admission_no, s.class_id, s.date_of_birth, s.gender, s.address, s.accessibility_needs, s.medical_notes
    FROM students s JOIN users u ON u.id = s.user_id WHERE true ${personScope(user)} ORDER BY u.id`, [], db), { admissionNo: 'admission_no', classId: 'class_id', dateOfBirth: 'date_of_birth', gender: 'gender', address: 'address', accessibilityNeeds: 'accessibility_needs', medicalNotes: 'medical_notes' }),
    teachers: personResource('teacher', teacherSchema.omit({ password: true }).extend({ employeeNo: z.string().trim().min(1).max(40) }), [
        field('employeeNo', 'Employee number *'), ...personColumns, field('qualification', 'Qualification'), field('specialization', 'Specialization'), field('hiredOn', 'Hired on (YYYY-MM-DD)', 'date'),
    ], ordered(`SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, t.employee_no, t.qualification, t.specialization, t.hired_on FROM teachers t JOIN users u ON u.id = t.user_id`), { employeeNo: 'employee_no', qualification: 'qualification', specialization: 'specialization', hiredOn: 'hired_on' }),
    parents: personResource('parent', parentSchema.omit({ password: true, children: true }), personColumns, ordered("SELECT id, first_name, last_name, email, phone, is_active FROM users WHERE role = 'parent'"), {}),
    guardians: {
        label: 'Parent-child links', schema: z.object({ parentId: id, studentId: id, relationship: z.string().trim().min(1).max(40).default('guardian'), isPrimary: z.boolean().default(true) }),
        columns: [ref('parentId', 'Parent', 'parents'), ref('studentId', 'Student', 'students'), field('relationship', 'Relationship'), field('isPrimary', 'Primary guardian (TRUE/FALSE)', 'boolean')], keys: ['parentId', 'studentId'],
        load: ordered('SELECT parent_id AS id, parent_id, student_id, relationship, is_primary FROM guardians'),
        save: async (row, _before, ctx) => {
            await query(`INSERT INTO guardians (parent_id, student_id, relationship, is_primary) VALUES ($1,$2,$3,$4)
        ON CONFLICT (parent_id, student_id) DO UPDATE SET relationship = EXCLUDED.relationship, is_primary = EXCLUDED.is_primary`, [row.parentId, row.studentId, row.relationship, row.isPrimary], ctx.db);
            return Number(row.parentId);
        },
    },
    classes: {
        label: 'Classes', schema: classSchema, keys: ['name'],
        columns: [field('name', 'Class name *'), field('gradeLevel', 'Level (1-13) *', 'number'), field('section', 'Section'), field('room', 'Room'), field('capacity', 'Capacity', 'number'), ref('homeroomTeacherId', 'Class teacher', 'teachers')],
        load: (user, db) => query<DataRow>(`SELECT c.id, c.name, c.grade_level, c.section, c.room, c.capacity, c.homeroom_teacher_id FROM classes c WHERE true ${user.role === 'teacher' ? `AND (c.homeroom_teacher_id = ${user.id} OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = ${user.id}))` : ''} ORDER BY c.id`, [], db),
        validate: async (row, before, ctx) => { if (before) {
            const n = await queryOne<{
                n: number;
            }>('SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1', [before.id], ctx.db);
            if (n!.n > Number(row.capacity))
                throw badRequest('Capacity cannot be lower than current enrollment.');
        } },
        save: basic('classes', { name: 'name', gradeLevel: 'grade_level', section: 'section', room: 'room', capacity: 'capacity', homeroomTeacherId: 'homeroom_teacher_id' }),
    },
    courses: {
        label: 'Class subject assignments', schema: z.object({ classId: id, subjectId: id, teacherId: id.nullish() }), keys: ['classId', 'subjectId'],
        columns: [ref('classId', 'Class', 'classes'), ref('subjectId', 'Subject', 'subjects'), ref('teacherId', 'Teacher', 'teachers')],
        load: (user, db) => query<DataRow>(`SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id FROM class_subjects cs WHERE true ${courseScope(user)} ORDER BY cs.id`, [], db),
        save: basic('class_subjects', { classId: 'class_id', subjectId: 'subject_id', teacherId: 'teacher_id' }),
    },
    subjects: {
        label: 'Subjects', schema: subjectSchema, keys: ['code'],
        columns: [field('name', 'Subject name *'), field('code', 'Subject code *'), field('color', 'Colour (#4361ee)'), field('description', 'Description')],
        load: ordered('SELECT id, name, code, color, description FROM subjects'), save: basic('subjects', { name: 'name', code: 'code', color: 'color', description: 'description' }),
    },
    terms: {
        label: 'Terms', schema: termSchema, keys: ['name'],
        columns: [field('name', 'Term name *'), ...dates, current, ref('academicYearId', 'Academic year', 'years')],
        load: ordered('SELECT id, name, starts_on, ends_on, is_current, academic_year_id FROM terms'), validate: ensureDateRange,
        save: async (row, before, ctx) => { if (row.isCurrent)
            await query('UPDATE terms SET is_current = false WHERE is_current', [], ctx.db); return basic('terms', { name: 'name', startsOn: 'starts_on', endsOn: 'ends_on', isCurrent: 'is_current', academicYearId: 'academic_year_id' })(row, before, ctx); },
    },
    'academic-years': {
        label: 'Academic years', schema: yearSchema, keys: ['name'], columns: [field('name', 'Year name *'), ...dates, current],
        load: ordered('SELECT id, name, starts_on, ends_on, is_current FROM academic_years'), validate: ensureDateRange,
        save: async (row, before, ctx) => { if (row.isCurrent)
            await query('UPDATE academic_years SET is_current = false WHERE is_current', [], ctx.db); return basic('academic_years', { name: 'name', startsOn: 'starts_on', endsOn: 'ends_on', isCurrent: 'is_current' })(row, before, ctx); },
    },
    'grading-scales': {
        label: 'Grading scales', schema: scaleSchema, keys: ['name'], columns: [field('name', 'Scale name *'), field('description', 'Description'), field('isDefault', 'Default (TRUE/FALSE)', 'boolean'), field('bands', 'Grade bands JSON (see Instructions)', 'json')],
        load: ordered(`SELECT gs.id, gs.name, gs.description, gs.is_default, COALESCE((SELECT json_agg(json_build_object('grade',gb.grade,'minPercent',gb.min_percent,'maxPercent',gb.max_percent,'points',gb.points,'remark',gb.remark) ORDER BY gb.min_percent DESC) FROM grade_bands gb WHERE gb.scale_id = gs.id), '[]') AS bands FROM grading_scales gs`),
        validate: async (row, before) => {
            const bands = row.bands as Parameters<typeof checkBands>[0];
            if (bands.some(b => b.minPercent > b.maxPercent)) throw badRequest('A grade band minimum cannot exceed its maximum.');
            if (before?.isDefault && !row.isDefault) throw badRequest('Set another grading scale as default instead of removing the current default.');
            const problem = checkBands(bands);
            if (problem) throw badRequest(problem);
        },
        save: async (row, before, ctx) => {
            if (row.isDefault)
                await query('UPDATE grading_scales SET is_default = false WHERE is_default', [], ctx.db);
            if (!before && !(await queryOne('SELECT 1 FROM grading_scales WHERE is_default', [], ctx.db)))
                row.isDefault = true;
            const recordId = await basic('grading_scales', { name: 'name', description: 'description', isDefault: 'is_default' })(row, before, ctx);
            await query('DELETE FROM grade_bands WHERE scale_id = $1', [recordId], ctx.db);
            for (const band of row.bands as DataRow[])
                await tableSave('grade_bands', { grade: 'grade', minPercent: 'min_percent', maxPercent: 'max_percent', points: 'points', remark: 'remark' }, { ...band, grade: String(band.grade).toUpperCase() }, null, ctx.db, { scale_id: recordId });
            return recordId;
        },
    },
    timetable: {
        label: 'Timetable', schema: slotSchema, columns: [ref('courseId', 'Course', 'courses'), field('dayOfWeek', 'Weekday (1=Mon, 7=Sun) *', 'number'), field('startsAt', 'Start time (HH:MM) *', 'time'), field('endsAt', 'End time (HH:MM) *', 'time'), field('room', 'Room')],
        load: (user, db) => query<DataRow>(`SELECT ts.id, ts.class_subject_id AS course_id, ts.day_of_week, to_char(ts.starts_at,'HH24:MI') AS starts_at, to_char(ts.ends_at,'HH24:MI') AS ends_at, ts.room FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id WHERE true ${courseScope(user)} ORDER BY ts.id`, [], db),
        validate: async (row, before, ctx) => {
            if (String(row.endsAt) <= String(row.startsAt))
                throw badRequest('A lesson must end after it starts.');
            const course = ctx.refs.courses.find(c => Number(c.id) === Number(row.courseId))!;
            const room = row.room || ctx.refs.classes.find(c => Number(c.id) === Number(course.classId))?.room;
            const clash = await queryOne(`SELECT 1 FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id JOIN classes c ON c.id = cs.class_id
        WHERE ts.day_of_week = $1 AND ts.starts_at < $3::time AND ts.ends_at > $2::time AND ($4::int IS NULL OR ts.id <> $4)
        AND (cs.class_id = $5 OR (cs.teacher_id IS NOT NULL AND cs.teacher_id = $6) OR ($7::text IS NOT NULL AND COALESCE(ts.room,c.room) = $7))`, [row.dayOfWeek, row.startsAt, row.endsAt, before?.id ?? null, course.classId, course.teacherId, room ?? null], ctx.db);
            if (clash)
                throw badRequest('Time clash: the class, teacher or room already has a lesson at that time.');
        },
        save: async (row, before, ctx) => { await resources.timetable.validate!(row, before, ctx); return basic('timetable_slots', { courseId: 'class_subject_id', dayOfWeek: 'day_of_week', startsAt: 'starts_at', endsAt: 'ends_at', room: 'room' })(row, before, ctx); },
    },
    assessments: {
        label: 'Assessments and assignments', schema: assessmentSchema, teacherWrite: true,
        columns: [ref('courseId', 'Course', 'courses'), ref('termId', 'Term', 'terms'), field('title', 'Title *'), field('description', 'Instructions'), field('type', 'Type (assignment/quiz/test/exam/project) *'), field('maxScore', 'Maximum mark *', 'number'), field('dueDate', 'Due date (YYYY-MM-DD)', 'date')],
        load: (user, db) => query<DataRow>(`SELECT a.id, a.class_subject_id AS course_id, a.term_id, a.title, a.description, a.type, a.max_score, a.due_date FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id WHERE a.exam_id IS NULL ${courseScope(user)} ORDER BY a.id`, [], db),
        validate: async (row, before, ctx) => { await requireAssignedCourse(row, ctx); if (Number(row.maxScore) > 9999.99) throw badRequest('Maximum mark cannot exceed 9999.99.'); if (before) {
            const max = await queryOne<{
                max: number | null;
            }>('SELECT MAX(score) AS max FROM grades WHERE assessment_id = $1', [before.id], ctx.db);
            if (max?.max != null && max.max > Number(row.maxScore))
                throw badRequest('Maximum mark cannot be below an existing score.');
            if (row.courseId !== before.courseId)
                throw badRequest('An existing assessment cannot be moved to another course.');
        } },
        save: async (row, before, ctx) => {
            const recordId = await tableSave('assessments', { courseId: 'class_subject_id', termId: 'term_id', title: 'title', description: 'description', type: 'type', maxScore: 'max_score', dueDate: 'due_date' }, row, before ? Number(before.id) : null, ctx.db, before ? {} : { created_by: ctx.user.id });
            if (!before)
                await notifyWhere(`SELECT g.parent_id AS id FROM guardians g JOIN students s ON s.user_id = g.student_id JOIN class_subjects cs ON cs.class_id = s.class_id WHERE cs.id = $1`, [row.courseId], { type: 'assignment', title: `New ${row.type}: ${row.title}`, link: '/assignments' }, ctx.db);
            return recordId;
        },
    },
    exams: {
        label: 'Exams', schema: examSchema, columns: [field('name', 'Exam name *'), ref('termId', 'Term', 'terms'), ref('gradingScaleId', 'Grading scale', 'scales'), ...dates, field('maxMarks', 'Maximum marks', 'number'), field('classIds', 'Class IDs (separate with |) *', 'list', 'classes')],
        load: ordered(`SELECT e.id, e.name, e.term_id, e.grading_scale_id, e.starts_on, e.ends_on, e.max_marks, COALESCE((SELECT json_agg(ec.class_id ORDER BY ec.class_id) FROM exam_classes ec WHERE ec.exam_id = e.id),'[]') AS class_ids FROM exams e`),
        validate: async (row, before, ctx) => { await ensureDateRange(row); if (before) {
            const marked = await queryOne('SELECT 1 FROM grades g JOIN assessments a ON a.id = g.assessment_id WHERE a.exam_id = $1 LIMIT 1', [before.id], ctx.db);
            if (marked && (row.maxMarks !== before.maxMarks || JSON.stringify(row.classIds) !== JSON.stringify(before.classIds)))
                throw badRequest('An exam with marks cannot change its classes or maximum through import. Use the exam editor.');
        } },
        save: async (row, before, ctx) => {
            const recordId = await tableSave('exams', { name: 'name', termId: 'term_id', gradingScaleId: 'grading_scale_id', startsOn: 'starts_on', endsOn: 'ends_on', maxMarks: 'max_marks' }, row, before ? Number(before.id) : null, ctx.db, before ? {} : { created_by: ctx.user.id });
            await query('DELETE FROM exam_classes WHERE exam_id = $1 AND NOT (class_id = ANY($2))', [recordId, row.classIds], ctx.db);
            for (const classId of row.classIds as number[])
                await query('INSERT INTO exam_classes (exam_id,class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [recordId, classId], ctx.db);
            await query('UPDATE assessments SET max_score = $2, term_id = $3, due_date = $4 WHERE exam_id = $1', [recordId, row.maxMarks, row.termId ?? null, row.endsOn], ctx.db);
            await syncPapers(ctx.db as pg.PoolClient, recordId, ctx.user.id);
            return recordId;
        },
    },
    'report-remarks': {
        label: 'Report-card remarks', teacherWrite: true, schema: z.object({ examId: id, studentId: id, remark: z.string().trim().min(1).max(600) }), keys: ['examId', 'studentId'],
        columns: [ref('examId', 'Exam', 'exams'), ref('studentId', 'Student', 'students'), field('remark', 'Remark *')],
        load: (user, db) => query<DataRow>(`SELECT rr.student_id AS id, rr.exam_id, rr.student_id, rr.remark FROM report_remarks rr JOIN students s ON s.user_id = rr.student_id JOIN classes c ON c.id = s.class_id WHERE true ${user.role === 'teacher' ? `AND c.homeroom_teacher_id = ${user.id}` : ''} ORDER BY rr.exam_id, rr.student_id`, [], db),
        validate: async (row, _before, ctx) => {
            const own = await queryOne(`SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id JOIN exam_classes ec ON ec.class_id = c.id WHERE s.user_id = $1 AND ec.exam_id = $2 AND ($3::int IS NULL OR c.homeroom_teacher_id = $3)`, [row.studentId, row.examId, ctx.user.role === 'teacher' ? ctx.user.id : null], ctx.db);
            if (!own)
                throw badRequest('This exam must include the student’s class; only the class teacher can write its remarks.');
        },
        save: async (row, _before, ctx) => { await query(`INSERT INTO report_remarks (exam_id,student_id,remark,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT (exam_id,student_id) DO UPDATE SET remark=EXCLUDED.remark,updated_by=EXCLUDED.updated_by,updated_at=now()`, [row.examId, row.studentId, row.remark, ctx.user.id], ctx.db); return Number(row.studentId); },
    },
    'fee-structures': {
        label: 'Fee structures', schema: structureSchema, columns: [field('name', 'Name *'), field('amount', 'Amount *', 'number'), field('level', 'Level (blank=all)', 'number'), ref('termId', 'Term', 'terms'), field('dueDate', 'Due date (YYYY-MM-DD) *', 'date'), field('description', 'Description'), active],
        load: ordered('SELECT id,name,amount,level,term_id,due_date,description,is_active FROM fee_structures'),
        validate: async (row, before, ctx) => { if (before && Number(row.amount) !== Number(before.amount) && await queryOne('SELECT 1 FROM invoices WHERE fee_structure_id = $1 LIMIT 1', [before.id], ctx.db))
            throw badRequest('Invoices already use this fee structure; create a new one to change the amount.'); },
        save: basic('fee_structures', { name: 'name', amount: 'amount', level: 'level', termId: 'term_id', dueDate: 'due_date', description: 'description', isActive: 'is_active' }),
    },
    invoices: {
        label: 'Invoices', schema: z.object({ studentId: id, termId: id.nullish(), title: z.string().trim().min(1).max(120), amount: money, dueDate: isoDate, notes: optionalText(500) }),
        columns: [ref('studentId', 'Student', 'students'), ref('termId', 'Term', 'terms'), field('title', 'Invoice title *'), field('amount', 'Amount *', 'number'), field('dueDate', 'Due date (YYYY-MM-DD) *', 'date'), field('notes', 'Notes')],
        load: ordered('SELECT id,student_id,term_id,title,amount,due_date,notes FROM invoices'),
        validate: async (_row, before) => { if (before)
            throw badRequest('Existing invoices cannot be changed through import. Use a new import key for a new invoice.'); },
        save: async (row, before, ctx) => {
            const recordId = await basic('invoices', { studentId: 'student_id', termId: 'term_id', title: 'title', amount: 'amount', dueDate: 'due_date', notes: 'notes' })(row, before, ctx);
            await notifyWhere('SELECT parent_id AS id FROM guardians WHERE student_id = $1', [row.studentId], { type: 'fees', title: `New invoice: ${row.title}`, body: `${row.amount} due ${row.dueDate}`, link: '/fees' }, ctx.db);
            return recordId;
        },
    },
    payments: {
        label: 'Payments', schema: z.object({ invoiceId: id, amount: money, method: z.enum(['cash', 'card', 'bank_transfer', 'mobile_money', 'other']), reference: optionalText(80), paidOn: isoDate }),
        columns: [ref('invoiceId', 'Invoice', 'invoices'), field('amount', 'Amount *', 'number'), field('method', 'Method (cash/card/bank_transfer/mobile_money/other) *'), field('reference', 'Payment reference'), field('paidOn', 'Payment date (YYYY-MM-DD) *', 'date')],
        load: ordered('SELECT id,invoice_id,amount,method,reference,paid_on FROM payments'),
        validate: async (row, before, ctx) => {
            if (before)
                throw badRequest('Existing payments cannot be edited through import.');
            const inv = await queryOne<{
                balance: number;
            }>('SELECT balance FROM invoice_balances WHERE id = $1', [row.invoiceId], ctx.db);
            if (!inv || Number(row.amount) > inv.balance)
                throw badRequest(`Payment exceeds the remaining balance (${inv?.balance ?? 0}).`);
            if (row.reference && await queryOne('SELECT 1 FROM payments WHERE invoice_id = $1 AND reference = $2', [row.invoiceId, row.reference], ctx.db))
                throw badRequest('This payment reference is already recorded on this invoice.');
        },
        save: async (row, before, ctx) => {
            await query('SELECT id FROM invoices WHERE id=$1 FOR UPDATE', [row.invoiceId], ctx.db);
            await resources.payments.validate!(row, before, ctx);
            const recordId = await tableSave('payments', { invoiceId: 'invoice_id', amount: 'amount', method: 'method', reference: 'reference', paidOn: 'paid_on' }, row, null, ctx.db, { recorded_by: ctx.user.id });
            await notifyWhere('SELECT g.parent_id AS id FROM guardians g JOIN invoices i ON i.student_id=g.student_id WHERE i.id=$1', [row.invoiceId], { type: 'fees', title: `Payment received: ${row.amount}`, link: `/receipts/${recordId}` }, ctx.db);
            return recordId;
        },
    },
    announcements: {
        label: 'Announcements', schema: announcementSchema, teacherWrite: true,
        columns: [field('title', 'Title *'), field('body', 'Message *'), field('audience', 'Audience (everyone/staff/students/parents/class) *'), ref('classId', 'Class', 'classes'), field('pinned', 'Pinned (TRUE/FALSE)', 'boolean')],
        load: (user, db) => query<DataRow>(`SELECT id,title,body,audience,class_id,pinned FROM announcements WHERE true ${user.role === 'teacher' ? `AND author_id=${user.id}` : ''} ORDER BY id`, [], db),
        validate: async (row, before, ctx) => {
            if (row.audience === 'class' && !row.classId)
                throw badRequest('Class announcements need a class ID.');
            if (row.audience !== 'class')
                row.classId = null;
            if (ctx.user.role === 'teacher') {
                if (before)
                    throw forbidden('Only administrators can edit announcements.');
                if (row.audience !== 'class')
                    throw forbidden('Teachers may only post to their assigned classes.');
                const own = ctx.refs.classes.some(c => Number(c.id) === Number(row.classId));
                if (!own)
                    throw forbidden('You do not teach this class.');
                row.pinned = false;
            }
        },
        save: async (row, before, ctx) => {
            const recordId = await tableSave('announcements', { title: 'title', body: 'body', audience: 'audience', classId: 'class_id', pinned: 'pinned' }, row, before ? Number(before.id) : null, ctx.db, before ? {} : { author_id: ctx.user.id });
            if (!before) {
                const recipientSql: Record<string, string> = { everyone: 'SELECT id FROM users WHERE is_active AND id<>$1 AND $2::int IS NULL', staff: "SELECT id FROM users WHERE is_active AND role IN ('admin','teacher') AND id<>$1 AND $2::int IS NULL", students: "SELECT id FROM users WHERE is_active AND role='student' AND id<>$1 AND $2::int IS NULL", parents: "SELECT id FROM users WHERE is_active AND role='parent' AND id<>$1 AND $2::int IS NULL", class: 'SELECT g.parent_id AS id FROM guardians g JOIN students s ON s.user_id=g.student_id WHERE s.class_id=$2 AND g.parent_id<>$1 UNION SELECT user_id AS id FROM students WHERE class_id=$2 AND user_id<>$1' };
                await notifyWhere(recipientSql[String(row.audience)], [ctx.user.id, row.classId ?? null], { type: 'announcement', title: String(row.title), body: String(row.body).slice(0, 160), link: '/announcements' }, ctx.db);
            }
            return recordId;
        },
    },
    events: { label: 'Calendar events', schema: eventSchema, columns: [field('title', 'Title *'), field('description', 'Description'), field('type', 'Type (academic/exam/holiday/meeting/sports/other) *'), ...dates, field('location', 'Location')], load: ordered('SELECT id,title,description,type,starts_on,ends_on,location FROM events'), validate: ensureDateRange,
        save: (row, before, ctx) => tableSave('events', { title: 'title', description: 'description', type: 'type', startsOn: 'starts_on', endsOn: 'ends_on', location: 'location' }, row, before ? Number(before.id) : null, ctx.db, before ? {} : { created_by: ctx.user.id }) },
};
// Imports are management operations. Teachers can export their own working records and
// import only the areas they can already change through the normal forms.
const teacherRead: RecordResource[] = ['students', 'teachers', 'classes', 'courses', 'subjects', 'terms', 'academic-years', 'grading-scales', 'timetable', 'assessments', 'report-remarks', 'announcements', 'events'];
export function authorizeResource(resource: RecordResource, user: SessionUser, write: boolean) {
    if (user.role === 'admin')
        return;
    if (user.role === 'teacher' && (write ? resources[resource].teacherWrite : teacherRead.includes(resource)))
        return;
    throw forbidden('Your role cannot import or export this area.');
}
export async function loadReferences(user: SessionUser, db: Db): Promise<Record<string, DataRow[]>> {
    // A PoolClient is one connection; issue its queries in order rather than queuing parallel promises.
    const students = await query<DataRow>(`SELECT u.id,s.admission_no,u.first_name||' '||u.last_name AS name,s.class_id FROM students s JOIN users u ON u.id=s.user_id WHERE true ${personScope(user)} ORDER BY u.id`, [], db);
    const teachers = await query<DataRow>("SELECT u.id,u.first_name||' '||u.last_name AS name,u.email FROM teachers t JOIN users u ON u.id=t.user_id ORDER BY u.id", [], db);
    const parents = user.role === 'admin' ? await query<DataRow>("SELECT id,first_name||' '||last_name AS name,email FROM users WHERE role='parent' ORDER BY id", [], db) : [];
    const classes = await resources.classes.load(user, db);
    const subjects = await resources.subjects.load(user, db);
    const terms = await resources.terms.load(user, db);
    const years = await resources['academic-years'].load(user, db);
    const scales = await query<DataRow>('SELECT id,name FROM grading_scales ORDER BY id', [], db);
    const courses = await resources.courses.load(user, db);
    const exams = await query<DataRow>(`SELECT e.id,e.name FROM exams e WHERE true ${user.role === 'teacher' ? `AND EXISTS (SELECT 1 FROM exam_classes ec JOIN classes c ON c.id=ec.class_id WHERE ec.exam_id=e.id AND (c.homeroom_teacher_id=${user.id} OR EXISTS(SELECT 1 FROM class_subjects cs WHERE cs.class_id=c.id AND cs.teacher_id=${user.id})))` : ''} ORDER BY e.id`, [], db);
    const invoices = user.role === 'admin' ? await query<DataRow>('SELECT ib.id,ib.student_id,ib.title,ib.balance FROM invoice_balances ib ORDER BY ib.id', [], db) : [];
    return { students, teachers, parents, classes, subjects, terms, years, scales, courses, exams, invoices };
}
