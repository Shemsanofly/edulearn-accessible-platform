import crypto from 'node:crypto';
import express, { Router, type Request } from 'express';
import type { ImportPreview, ImportPreviewRow, ImportResult, RecordResource } from '../../../shared/types.js';
import { pool, query, queryOne, transaction } from '../db/pool.js';
import { authorizeResource, loadReferences, resources, type Column, type DataRow, type Db, type ResourceContext } from '../lib/record-resources.js';
import { badRequest, conflict, HttpError, intParam, notFound } from '../lib/http.js';
import { buildWorkbook, readCell, readTemplate, sendWorkbook, type Template } from '../lib/xlsx.js';
import { me, requireRole } from '../middleware/auth.js';
export const recordImportsRouter = Router();
recordImportsRouter.use(requireRole('admin', 'teacher'));
const upload = express.raw({ type: () => true, limit: '2mb' });
const checksum = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
/** Apply the same role-specific normalization as the regular forms before displaying changes. */
function normalizeRecord(resource: RecordResource, data: DataRow, newTeacherRecord = false): DataRow {
    const row = { ...data };
    if (resource === 'exams') row.classIds = [...new Set(row.classIds as number[])].sort((a, b) => a - b);
    if (resource === 'announcements') {
        if (row.audience !== 'class') row.classId = null;
        if (newTeacherRecord) row.pinned = false;
    }
    if (resource === 'invitations') {
        const d = row.details as DataRow;
        row.details = row.role === 'parent' ? { children: d.children ?? [] }
            : row.role === 'student' ? { classId: d.classId ?? null }
            : row.role === 'teacher' ? { specialization: d.specialization ?? null } : {};
    }
    return row;
}
const display = (row: DataRow, cols: Column[]) => cols.filter(c => row[c.key] !== undefined && row[c.key] !== null && row[c.key] !== '').map(c => `${c.label.replace(/\s*\*$/, '')}: ${Array.isArray(row[c.key]) ? (row[c.key] as unknown[]).join(' | ') : typeof row[c.key] === 'object' ? JSON.stringify(row[c.key]) : row[c.key]}`).join(' · ');
function context(req: Request, write: boolean) {
    const key = String(req.params.resource);
    if (!Object.hasOwn(resources, key))
        throw notFound('Import area');
    const resource = key as RecordResource;
    const user = me(req);
    authorizeResource(resource, user, write);
    const scope: DataRow = {};
    for (const key of ['classId', 'courseId', 'examId'])
        if (req.query[key] !== undefined) {
            if (!resources[resource].columns.some(c => c.key === key))
                throw badRequest(`This area cannot be filtered by ${key}.`);
            scope[key] = intParam(req.query[key], key);
        }
    return { resource, spec: resources[resource], user, scope };
}
const inScope = (row: DataRow, scope: DataRow) => Object.entries(scope).every(([k, v]) => Number(row[k]) === Number(v));
async function workbook(req: Request, template: boolean) {
    const { resource, spec, user, scope } = context(req, template);
    const [records, refs] = await Promise.all([spec.load(user, pool), loadReferences(user, pool)]);
    // Metadata signs the resource and selection; an export can also be edited and re-imported.
    const columns = [
        { key: 'id', header: 'Record ID (keep for existing rows)', width: 18 },
        { key: 'importKey', header: 'Import key (new records)', width: 28, entry: true },
        ...spec.columns.map(c => ({ key: c.key, header: c.label, width: c.type === 'json' ? 80 : 30, entry: true })),
    ];
    const rows = template ? Array.from({ length: 100 }, () => columns.map(c => typeof scope[c.key] === 'number' ? Number(scope[c.key]) : null))
        : records.filter(r => inScope(r, scope)).map(r => [Number(r.id), null, ...spec.columns.map(c => {
                const value = r[c.key];
                if (value === undefined || value === null)
                    return null;
                if (c.type === 'list')
                    return (value as unknown[]).join(' | ');
                if (c.type === 'json')
                    return JSON.stringify(value);
                if (typeof value === 'boolean')
                    return value ? 'TRUE' : 'FALSE';
                return typeof value === 'number' ? value : String(value);
            })]);
    const usedRefs = [...new Set(spec.columns.flatMap(c => c.ref ? [c.ref] : []))];
    const buffer = await buildWorkbook({
        sheetName: 'Records', title: `${spec.label} — ${template ? 'entry template' : 'export'}`,
        details: [['Area', spec.label], ['Generated', new Date().toISOString()], ...Object.entries(scope).map(([k, v]) => [k, String(v)] as [
                string,
                string
            ])],
        instructions: [
            'Required columns have *. Fill new rows, save as .xlsx, then Import and review before saving. Maximum 1,000 rows.',
            'Keep Record ID when editing existing rows. For new rows leave it blank and enter a unique, permanent Import key (e.g. school-2026-001). Reuse that key on re-upload.',
            'Email / subject code / class name / year or term name also match existing records. Use Export to edit existing data.',
            'Blank cells keep existing values. Use the regular editor to clear a saved value. Missing rows are never deleted.',
            'Dates: YYYY-MM-DD. Times: HH:MM (24-hour). Booleans: TRUE/FALSE. List values: separate with |.',
            'Copy numeric IDs from the reference sheets. Do not use names instead of IDs. Import referenced people/classes/subjects first.',
            ...(resource === 'grading-scales' ? ['Grade bands JSON example: [{"grade":"A","minPercent":75,"maxPercent":100,"points":1,"remark":"Excellent"},{"grade":"B","minPercent":0,"maxPercent":74,"points":2,"remark":"Pass"}]'] : []),
            ...(resource === 'invitations' ? ['Parent access details example: {"children":[{"studentId":1,"relationship":"mother"}]}. Teacher: {"specialization":"Mathematics"}. Student: {"classId":1}. Administrator: {}.', 'Invitation links are available once after saving. Download and share them privately. Import does not email invitations automatically.'] : []),
            ...(['students', 'teachers', 'parents'].includes(resource) ? ['New accounts receive generated temporary passwords after Save import. Download the one-time credentials file and share privately. Existing passwords are unchanged.'] : []),
            ...(['invoices', 'payments'].includes(resource) ? ['Existing financial records are read-only during import. Use a new import key only for a new transaction.'] : []),
        ], columns, rows, meta: { kind: 'records', resource, scope },
        references: usedRefs.map(key => {
            const values = refs[key] ?? [];
            const keys = Object.keys(values[0] ?? { id: null, name: null });
            return { name: key, headers: keys, rows: values.map(row => keys.map(k => typeof row[k] === 'number' ? Number(row[k]) : row[k] == null ? null : String(row[k]))) };
        }),
    });
    return { resource, buffer };
}
recordImportsRouter.get('/:resource/template', async (req, res) => { const out = await workbook(req, true); sendWorkbook(res, `${out.resource}-template.xlsx`, out.buffer); });
recordImportsRouter.get('/:resource/export', async (req, res) => { const out = await workbook(req, false); sendWorkbook(res, `${out.resource}-export.xlsx`, out.buffer); });
interface Write {
    excelRow: number;
    input: DataRow;
    before?: DataRow;
    importKey: string;
    preview: ImportPreviewRow;
}
async function analyse(req: Request, tpl: Template, db: Db) {
    const { resource, spec, user, scope } = context(req, true);
    if (tpl.meta.resource !== resource || !equal(tpl.meta.scope, scope))
        throw badRequest('This template belongs to a different area or selection. Download the matching template.');
    if (!equal(tpl.meta.columns, ['id', 'importKey', ...spec.columns.map(c => c.key)]))
        throw badRequest('Template columns have changed. Download a fresh template.');
    const expectedHeaders = ['Record ID (keep for existing rows)', 'Import key (new records)', ...spec.columns.map(c => c.label)];
    if (expectedHeaders.some((label, i) => readCell(tpl.sheet.getCell(tpl.meta.headerRow, i + 1).value).text !== label))
        throw badRequest('The template headers or column order changed. Download a fresh template.');
    // The commit transaction uses SERIALIZABLE isolation; preview reads a consistent snapshot too.
    const stored = await spec.load(user, db);
    const refs = await loadReferences(user, db);
    const mappings = await query<{
        importKey: string;
        recordId: number;
    }>('SELECT import_key,record_id FROM record_import_keys WHERE resource=$1 ORDER BY import_key', [resource], db);
    const ctx: ResourceContext = { user, db, refs, credentials: [], invitationLinks: [] };
    const byKey = new Map(mappings.map(m => [m.importKey, m.recordId]));
    const rows: ImportPreviewRow[] = [];
    const issues: ImportPreview['issues'] = [];
    const writes: Write[] = [];
    const seen = new Set<string>();
    const fail = (excelRow: number, column: string, message: string, label = '') => {
        issues.push({ row: excelRow, column, admissionNo: null, studentName: label || spec.label, message });
    };
    const composite = (spec.keys?.length ?? 0) > 1;
    for (let n = tpl.meta.headerRow + 1; n <= tpl.sheet.rowCount; n++) {
        const cells = tpl.meta.columns.map((_key, i) => readCell(tpl.sheet.getCell(n, i + 1).value));
        // Scope-prefilled blank template rows must remain blank until another field is entered.
        if (cells.every((c, i) => !c.text && !c.error || Object.hasOwn(scope, tpl.meta.columns[i])))
            continue;
        const startIssues = issues.length;
        const raw: DataRow = {};
        const recordId = cells[0].text ? Number(cells[0].text) : null;
        const importKey = cells[1].text;
        const rowPreview: ImportPreviewRow = { row: n, studentId: recordId, admissionNo: importKey, studentName: spec.label, action: 'error', before: null, after: null, note: null };
        rows.push(rowPreview);
        if (recordId !== null && (!Number.isSafeInteger(recordId) || recordId <= 0))
            fail(n, 'Record ID', 'Use an existing numeric Record ID or leave it blank.');
        if (importKey.length > 120)
            fail(n, 'Import key', 'Use at most 120 characters.');
        spec.columns.forEach((col, i) => {
            const cell = cells[i + 2];
            if (cell.error) {
                fail(n, col.label, `Excel error: ${cell.error}`);
                return;
            }
            if (!cell.text)
                return;
            try {
                switch (col.type) {
                    case 'number':
                        if (cell.num === null || !Number.isFinite(cell.num))
                            throw new Error('Enter a number.');
                        raw[col.key] = cell.num;
                        break;
                    case 'boolean':
                        if (!/^(true|false|yes|no|1|0)$/i.test(cell.text))
                            throw new Error('Enter TRUE or FALSE.');
                        raw[col.key] = /^(true|yes|1)$/i.test(cell.text);
                        break;
                    case 'list':
                        raw[col.key] = cell.text.split('|').map(x => col.ref ? Number(x.trim()) : x.trim()).filter(x => x !== '');
                        break;
                    case 'json':
                        raw[col.key] = JSON.parse(cell.text);
                        break;
                    case 'date':
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(cell.text) || !Number.isFinite(Date.parse(cell.text)) || new Date(cell.text).toISOString().slice(0, 10) !== cell.text)
                            throw new Error('Use a valid date: YYYY-MM-DD.');
                        raw[col.key] = cell.text;
                        break;
                    case 'time':
                        if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(cell.text))
                            throw new Error('Use HH:MM in 24-hour time.');
                        raw[col.key] = cell.text.slice(0, 5);
                        break;
                    default: raw[col.key] = cell.text;
                }
            }
            catch (err) {
                fail(n, col.label, err instanceof SyntaxError ? 'Enter valid JSON as shown in the instructions.' : (err as Error).message);
            }
        });
        const natural = spec.keys?.every(k => raw[k] !== undefined) ? stored.find(r => spec.keys!.every(k => normalize(r[k]) === normalize(raw[k]))) : undefined;
        const mapped = importKey ? byKey.get(importKey) : undefined;
        const existing = composite ? natural : stored.find(r => Number(r.id) === (recordId ?? mapped)) ?? natural;
        if (recordId !== null && (!existing || Number(existing.id) !== recordId))
            fail(n, 'Record ID', 'This record does not exist in your permitted area.');
        if (mapped !== undefined && (!existing || Number(existing.id) !== mapped))
            fail(n, 'Import key', 'This key belongs to another or deleted record. Use its original ID and data.');
        if (recordId !== null && natural && Number(natural.id) !== recordId)
            fail(n, 'Record ID', 'The ID and unique identifier point to different records.');
        if (!existing && !importKey && !spec.keys)
            fail(n, 'Import key', 'New records need a unique import key so re-uploading cannot create duplicates.');
        if (existing && !inScope(existing, scope))
            fail(n, 'Record ID', 'This record is outside the selected class, course or exam.');
        const identity = existing ? `id:${existing.id}:${composite ? spec.keys!.map(k => normalize(raw[k])).join(':') : ''}` : spec.keys ? `key:${spec.keys.map(k => normalize(raw[k])).join(':')}` : `import:${importKey}`;
        for (const key of new Set([identity, ...(importKey ? [`import:${importKey}`] : [])])) {
            if (seen.has(key))
                fail(n, 'Import key', 'This record appears more than once in the file.');
            seen.add(key);
        }
        for (const [key, value] of Object.entries(scope)) {
            if (raw[key] !== undefined && !equal(raw[key], value))
                fail(n, key, 'This value does not match the selected context.');
            raw[key] = value;
        }
        const parsed = spec.schema.safeParse({ ...existing, ...raw });
        if (!parsed.success) {
            for (const issue of parsed.error.issues)
                fail(n, spec.columns.find(c => c.key === issue.path[0])?.label ?? issue.path.join('.'), issue.message);
        }
        if (issues.length !== startIssues || !parsed.success)
            continue;
        const input = normalizeRecord(resource, parsed.data as DataRow, user.role === 'teacher' && !existing);
        if (resource === 'grading-scales' && !existing && !stored.some(row => row.isDefault)) input.isDefault = true;
        rowPreview.studentName = String(input.title ?? input.name ?? ([input.firstName, input.lastName].filter(Boolean).join(' ') || spec.label));
        rowPreview.admissionNo = String(input.admissionNo ?? input.employeeNo ?? input.email ?? importKey ?? '');
        const existingParsed = existing ? spec.schema.safeParse(existing) : null;
        const beforeData = existingParsed?.success ? normalizeRecord(resource, existingParsed.data as DataRow) : existing;
        const before = beforeData ? Object.fromEntries(spec.columns.map(c => [c.key, beforeData[c.key]])) : undefined;
        const after = Object.fromEntries(spec.columns.map(c => [c.key, input[c.key]]));
        const unchanged = !!existing && equal(before, after);
        const uniqueFields: Partial<Record<RecordResource, string[]>> = { students: ['email', 'admissionNo'], teachers: ['email', 'employeeNo'], parents: ['email'], classes: ['name'], subjects: ['name', 'code'], terms: ['name'], 'academic-years': ['name'], 'grading-scales': ['name'] };
        for (const key of uniqueFields[resource] ?? []) {
            if (stored.some(r => normalize(r[key]) === normalize(input[key]) && Number(r.id) !== Number(existing?.id)))
                fail(n, key, 'This unique value already belongs to another record.');
            const signature = `unique:${key}:${normalize(input[key])}`;
            if (seen.has(signature))
                fail(n, key, 'This unique value appears more than once in the file.');
            seen.add(signature);
        }
        for (const col of spec.columns) {
            if (!col.ref || input[col.key] == null)
                continue;
            const ids = Array.isArray(input[col.key]) ? input[col.key] as unknown[] : [input[col.key]];
            if (ids.some(value => !(refs[col.ref!] ?? []).some(r => Number(r.id) === Number(value))))
                fail(n, col.label, 'Choose an ID from the reference sheet within your permitted area.');
        }
        try {
            if (!unchanged && issues.length === startIssues)
                await spec.validate?.(input, existing, ctx);
        }
        catch (err) {
            if (!(err instanceof HttpError))
                throw err;
            fail(n, 'Record', err.message);
        }
        if (issues.length !== startIssues)
            continue;
        rowPreview.action = unchanged ? 'unchanged' : existing ? 'update' : 'create';
        rowPreview.studentId = existing ? Number(existing.id) : null;
        rowPreview.before = before ? display(before, spec.columns) : null;
        rowPreview.after = display(after, spec.columns);
        if (!unchanged)
            writes.push({ excelRow: n, input, before: existing, importKey, preview: rowPreview });
    }
    // Validate file-wide constraints before Save, as well as checking again while writing.
    if (resource === 'payments') {
        const totals = new Map<number, number>();
        for (const w of writes)
            totals.set(Number(w.input.invoiceId), (totals.get(Number(w.input.invoiceId)) ?? 0) + Number(w.input.amount));
        for (const w of writes) {
            const balance = Number(refs.invoices.find(i => Number(i.id) === Number(w.input.invoiceId))?.balance ?? 0);
            if (totals.get(Number(w.input.invoiceId))! > balance)
                fail(w.excelRow, 'Amount', 'The combined payments in this file exceed the invoice balance.');
        }
    }
    if (resource === 'students') {
        const counts = new Map<number, number>();
        for (const w of writes)
            if (w.input.classId && Number(w.input.classId) !== Number(w.before?.classId))
                counts.set(Number(w.input.classId), (counts.get(Number(w.input.classId)) ?? 0) + 1);
        for (const [classId, added] of counts) {
            const cls = refs.classes.find(c => Number(c.id) === classId)!;
            const count = await queryOne<{
                n: number;
            }>('SELECT COUNT(*)::int AS n FROM students WHERE class_id=$1', [classId], db);
            if (count!.n + added > Number(cls.capacity))
                for (const w of writes.filter(w => Number(w.input.classId) === classId))
                    fail(w.excelRow, 'Class', 'These enrollments would exceed class capacity.');
        }
    }
    if (['terms', 'academic-years', 'grading-scales'].includes(resource)) {
        const field = resource === 'grading-scales' ? 'isDefault' : 'isCurrent';
        const flagged = rows.filter(r => r.action !== 'error').filter(r => { const w = writes.find(w => w.excelRow === r.row); return w ? w.input[field] === true : stored.some(s => Number(s.id) === r.studentId && s[field] === true); });
        if (flagged.length > 1)
            for (const row of flagged)
                fail(row.row, field, 'Only one record can be current/default.');
    }
    if (resource === 'timetable')
        for (let i = 0; i < writes.length; i++)
            for (let j = i + 1; j < writes.length; j++) {
                const a = writes[i], b = writes[j];
                const ac = refs.courses.find(c => Number(c.id) === Number(a.input.courseId))!, bc = refs.courses.find(c => Number(c.id) === Number(b.input.courseId))!;
                const room = (w: Write, c: DataRow) => w.input.room || refs.classes.find(cl => cl.id === c.classId)?.room;
                if (a.input.dayOfWeek === b.input.dayOfWeek && String(a.input.startsAt) < String(b.input.endsAt) && String(b.input.startsAt) < String(a.input.endsAt) && (ac.classId === bc.classId || (ac.teacherId && ac.teacherId === bc.teacherId) || (room(a, ac) && room(a, ac) === room(b, bc)))) {
                    fail(a.excelRow, 'Time', `Time clash with Excel row ${b.excelRow}.`);
                    fail(b.excelRow, 'Time', `Time clash with Excel row ${a.excelRow}.`);
                }
            }
    for (const row of rows)
        if (issues.some(i => i.row === row.row))
            row.action = 'error';
    if (!rows.length)
        issues.push({ row: null, column: null, admissionNo: null, studentName: null, message: 'Enter at least one record in the template.' });
    const counts = { create: 0, update: 0, unchanged: 0, skip: 0, error: 0 };
    rows.forEach(r => counts[r.action]++);
    const preview: ImportPreview = { kind: 'records', title: spec.label, details: [{ label: 'Area', value: spec.label }], rows, issues, counts, notInFile: 0,
        notices: ['Missing rows are left unchanged. Blank cells keep saved values.', ...(['students', 'teachers', 'parents'].includes(resource) ? ['New account credentials are available once after saving. Existing passwords are never exported.'] : [])],
        fingerprint: checksum({ resource, scope, user: user.id, file: crypto.createHash('sha256').update(req.body).digest('hex'), stored, refs, mappings }),
        canSave: !issues.length && writes.length > 0, needsOverwriteConfirm: counts.update > 0 };
    return { preview, writes, ctx, resource, spec, scope };
}
recordImportsRouter.post('/:resource/preview', upload, async (req, res) => {
    context(req, true);
    const tpl = await readTemplate(req.body, 'records');
    const result = await transaction(async (db) => { await query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY', [], db); return analyse(req, tpl, db); });
    res.json(result.preview);
});
recordImportsRouter.post('/:resource/commit', upload, async (req, res) => {
    context(req, true);
    const tpl = await readTemplate(req.body, 'records');
    const result = await transaction(async (db) => {
        await query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE', [], db);
        const { preview, writes, ctx, resource, spec, scope } = await analyse(req, tpl, db);
        // Re-upload of an already committed file is an explicit no-op.
        if (!preview.issues.length && !writes.length)
            return { importId: null, created: 0, updated: 0, unchanged: preview.counts.unchanged, title: spec.label } satisfies ImportResult;
        if (preview.issues.length)
            throw badRequest('Fix the file errors and check it again before saving.');
        if (req.query.fingerprint !== preview.fingerprint)
            throw conflict('Records changed since the review. Check the file again.');
        if (preview.needsOverwriteConfirm && req.query.confirmOverwrite !== '1')
            throw badRequest('Confirm replacement of existing values before saving.');
        for (const w of writes) {
            try {
                await spec.validate?.(w.input, w.before, ctx);
                const recordId = await spec.save(w.input, w.before, ctx);
                if (w.importKey)
                    await query('INSERT INTO record_import_keys (resource,import_key,record_id) VALUES ($1,$2,$3) ON CONFLICT (resource,import_key) DO NOTHING', [resource, w.importKey, recordId], db);
            }
            catch (err) {
                if (err instanceof HttpError)
                    throw badRequest(`Excel row ${w.excelRow}: ${err.message}`);
                const code = (err as {
                    code?: string;
                }).code;
                if (code === '23505')
                    throw badRequest(`Excel row ${w.excelRow}: a unique value is already in use. Check the file again.`);
                if (code === '23503' || code === '23514')
                    throw badRequest(`Excel row ${w.excelRow}: a referenced record or value is no longer valid. Check the file again.`);
                throw err;
            }
        }
        const history = await queryOne<{
            id: number;
        }>(`INSERT INTO data_imports (kind,context,filename,file_sha256,imported_by,created_count,updated_count,changes) VALUES ('records',$1,$2,$3,$4,$5,$6,$7) RETURNING id`, [JSON.stringify({ resource, scope }), String(req.query.filename ?? '').slice(0, 150), crypto.createHash('sha256').update(req.body).digest('hex'), ctx.user.id, preview.counts.create, preview.counts.update, JSON.stringify(writes.map(w => ({ row: w.excelRow, before: w.preview.before, after: w.preview.after })))], db);
        // Auditing is part of this transaction: failure rolls back the records too.
        await query(`INSERT INTO audit_logs(actor_id,actor_name,action,entity,entity_id,summary,details) VALUES($1,$2,'create','data_import',$3,$4,$5)`, [ctx.user.id, `${ctx.user.firstName} ${ctx.user.lastName}`, String(history!.id), `Imported ${spec.label}: ${preview.counts.create} new, ${preview.counts.update} updated`, JSON.stringify({ resource, created: preview.counts.create, updated: preview.counts.update })], db);
        return { importId: history!.id, created: preview.counts.create, updated: preview.counts.update, unchanged: preview.counts.unchanged, title: spec.label, ...(ctx.credentials.length ? { credentials: ctx.credentials } : {}), ...(ctx.invitationLinks.length ? { invitationLinks: ctx.invitationLinks } : {}) } satisfies ImportResult;
    });
    res.json(result);
});
