/**
 * Bulk templates, import and export of students, teachers and parents (administrators only).
 *
 *   GET  /imports/:kind/template?format=xlsx|csv     blank template with instructions and allowed values
 *   GET  /imports/:kind/export?format=xlsx|csv|pdf   everyone on the list; Excel/CSV exports can be edited and imported
 *   POST /imports/:kind/preview                      what saving would create or change, with every problem
 *   POST /imports/:kind/commit?fingerprint=&confirmOverwrite=1
 *
 * Rows are matched by a stable identifier — admission number (students), employee number (teachers) or email
 * (parents) — never by name. A blank identifier, or one not yet used, creates a new account. Blank cells keep what is
 * saved. New accounts get a temporary password, returned once for the administrator to hand out (never stored).
 * Creating and updating use the same functions and validation as the on-screen forms.
 */
import express, { Router, type Request } from 'express';
import type pg from 'pg';
import type { z } from 'zod';
import type { ImportedAccount, ImportPreview, ImportResult, PeopleKind } from '../../../shared/types.js';
import { pool, query, queryOne, transaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, HttpError } from '../lib/http.js';
import {
  insertParent, insertStudent, insertTeacher, parentSchema, patchParent, patchStudent, patchTeacher, studentSchema, teacherSchema,
} from '../lib/people.js';
import { email as emailSchema } from '../lib/validators.js';
import { phone as phoneSchema } from '../lib/phone.js';
import { loadSettings } from '../lib/settings.js';
import { formatParam, readTemplate, sendTable, type CellRead, type SheetColumn, type SheetSpec, type Template } from '../lib/xlsx.js';
import { me, requireRole } from '../middleware/auth.js';
import { clip, Review, sha256, templateRows } from './imports.js';

export const peopleImportsRouter = Router();
peopleImportsRouter.use(requireRole('admin'));

type Db = pg.PoolClient | typeof pool;
const upload = express.raw({ type: () => true, limit: '4mb' });
const KINDS: PeopleKind[] = ['students', 'teachers', 'parents'];
const LOCK_KEY: Record<PeopleKind, number> = { students: 31, teachers: 32, parents: 33 };

function kindParam(req: Request): PeopleKind {
  const k = req.params.kind as PeopleKind;
  if (!KINDS.includes(k)) throw new HttpError(404, 'Not found');
  return k;
}

// ----------------------------------------------------------------------------------------------- Field parsing
type Parsed = { value?: unknown; error?: string };
const isoFrom = (cell: CellRead): Parsed => {
  if (cell.date) return { value: cell.date.toISOString().slice(0, 10) };
  // Excel sometimes keeps a date as its serial number (days since 30 Dec 1899), e.g. 45299 = 2024-01-08.
  if (cell.num !== null && Number.isInteger(cell.num) && cell.num > 3000 && cell.num < 80000) {
    return { value: new Date(Date.UTC(1899, 11, 30) + cell.num * 864e5).toISOString().slice(0, 10) };
  }
  const t = cell.text;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let iso: string | null = m ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` : null;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t);
  if (m) iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`; // day/month/year, as used in Tanzania
  if (!iso || Number.isNaN(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) {
    return { error: `“${clip(t, 20)}” isn’t a date. Use YYYY-MM-DD, for example 2012-03-25.` };
  }
  return { value: iso };
};
const textField = (max: number) => (cell: CellRead): Parsed =>
  cell.text.length > max ? { error: `Use at most ${max} characters.` } : { value: cell.text };
const emailField = (cell: CellRead): Parsed => {
  const r = emailSchema.safeParse(cell.text);
  return r.success ? { value: r.data } : { error: `“${clip(cell.text, 30)}” isn’t a valid email address.` };
};
const phoneField = (cell: CellRead): Parsed => {
  const r = phoneSchema.safeParse(cell.text);
  return r.success ? { value: r.data } : { error: 'Enter a valid phone number, for example 0777 123 456 or +255 777 123 456.' };
};
const GENDERS: Record<string, string> = { male: 'male', m: 'male', female: 'female', f: 'female', other: 'other', unspecified: 'unspecified', me: 'male', ke: 'female' };
const genderField = (cell: CellRead): Parsed => {
  const g = GENDERS[cell.text.toLowerCase()];
  return g ? { value: g } : { error: 'Use Male, Female or Other.' };
};

interface Field {
  key: string;
  header: string;
  width: number;
  /** Needed when the row creates a new person. */
  required?: boolean;
  parse: (cell: CellRead) => Parsed;
  /** Turn the parsed value into the input the save functions take (after class and child lookups). */
  apply?: (value: unknown, lookups: Lookups) => Record<string, unknown> | { error: string };
  validation?: SheetColumn['validation'];
}

interface Lookups { classesByName: Map<string, { id: number; name: string }>; studentsByAdmission: Map<string, { id: number; name: string }> }

interface Existing { id: number; key: string; email: string; values: Record<string, string> }

interface KindConfig {
  noun: string;
  plural: string;
  keyField: Field;
  fields: Field[];
  schema: z.ZodObject<z.ZodRawShape>;
  /** Current records with display values per field key. */
  load: (db: Db) => Promise<Existing[]>;
  insert: (db: pg.PoolClient, body: never) => Promise<{ id: number; temporaryPassword: string | null; identifier: string | null }>;
  patch: (db: pg.PoolClient, id: number, body: never) => Promise<void>;
  /** Extra columns in exports (not imported). */
  exportOnly?: { key: string; header: string; width: number }[];
}

const nameFields: Field[] = [
  { key: 'firstName', header: 'First name', width: 16, required: true, parse: textField(80) },
  { key: 'lastName', header: 'Last name', width: 16, required: true, parse: textField(80) },
];

const CONFIG: Record<PeopleKind, KindConfig> = {
  students: {
    noun: 'student', plural: 'students',
    keyField: { key: 'admissionNo', header: 'Admission No', width: 16, parse: textField(40) },
    fields: [
      ...nameFields,
      { key: 'email', header: 'Email', width: 30, required: true, parse: emailField },
      { key: 'phone', header: 'Phone', width: 16, parse: phoneField },
      {
        key: 'class', header: 'Class', width: 12, parse: textField(80),
        apply: (v, l) => {
          const c = l.classesByName.get(String(v).toLowerCase());
          return c ? { classId: c.id } : { error: `There is no class called “${clip(String(v), 20)}”. Use a class name from the Classes list, for example ${[...l.classesByName.values()].slice(0, 3).map((x) => x.name).join(', ')}.` };
        },
      },
      { key: 'dateOfBirth', header: 'Date of birth (YYYY-MM-DD)', width: 16, parse: isoFrom },
      {
        key: 'gender', header: 'Gender', width: 12, parse: genderField,
        validation: { type: 'list', allowBlank: true, formulae: ['"Male,Female,Other"'], showErrorMessage: true, errorTitle: 'Not allowed', error: 'Choose Male, Female or Other.' },
      },
      { key: 'address', header: 'Address', width: 26, parse: textField(300) },
    ],
    schema: studentSchema as unknown as z.ZodObject<z.ZodRawShape>,
    load: (db) => query<Existing>(
      `SELECT u.id, s.admission_no AS key, u.email,
              json_build_object('admissionNo', s.admission_no, 'firstName', u.first_name, 'lastName', u.last_name, 'email', u.email,
                'phone', COALESCE(u.phone, ''), 'class', COALESCE(c.name, ''), 'dateOfBirth', COALESCE(s.date_of_birth::text, ''),
                'gender', initcap(s.gender::text), 'address', COALESCE(s.address, ''),
                'status', CASE WHEN u.is_active THEN 'Active' ELSE 'Deactivated' END) AS values
         FROM students s JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id
        ORDER BY c.grade_level NULLS LAST, c.name, u.last_name, u.first_name`, [], db),
    insert: insertStudent as KindConfig['insert'],
    patch: patchStudent as KindConfig['patch'],
    exportOnly: [{ key: 'status', header: 'Status', width: 12 }],
  },
  teachers: {
    noun: 'teacher', plural: 'teachers',
    keyField: { key: 'employeeNo', header: 'Employee No', width: 16, parse: textField(40) },
    fields: [
      ...nameFields,
      { key: 'email', header: 'Email', width: 30, required: true, parse: emailField },
      { key: 'phone', header: 'Phone', width: 16, parse: phoneField },
      { key: 'specialization', header: 'Subject / specialisation', width: 22, parse: textField(120) },
      { key: 'qualification', header: 'Qualification', width: 22, parse: textField(120) },
      { key: 'hiredOn', header: 'Hired on (YYYY-MM-DD)', width: 16, parse: isoFrom },
    ],
    schema: teacherSchema as unknown as z.ZodObject<z.ZodRawShape>,
    load: (db) => query<Existing>(
      `SELECT u.id, t.employee_no AS key, u.email,
              json_build_object('employeeNo', t.employee_no, 'firstName', u.first_name, 'lastName', u.last_name, 'email', u.email,
                'phone', COALESCE(u.phone, ''), 'specialization', COALESCE(t.specialization, ''), 'qualification', COALESCE(t.qualification, ''),
                'hiredOn', COALESCE(t.hired_on::text, ''), 'status', CASE WHEN u.is_active THEN 'Active' ELSE 'Deactivated' END) AS values
         FROM teachers t JOIN users u ON u.id = t.user_id ORDER BY u.last_name, u.first_name`, [], db),
    insert: insertTeacher as KindConfig['insert'],
    patch: patchTeacher as KindConfig['patch'],
    exportOnly: [{ key: 'status', header: 'Status', width: 12 }],
  },
  parents: {
    noun: 'parent', plural: 'parents',
    keyField: { key: 'email', header: 'Email', width: 30, parse: emailField },
    fields: [
      ...nameFields,
      { key: 'phone', header: 'Phone', width: 16, parse: phoneField },
      {
        key: 'children', header: 'Children (admission numbers, separated by ;)', width: 30, parse: textField(400),
        apply: (v, l) => {
          const numbers = String(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
          const unknown = numbers.filter((n) => !l.studentsByAdmission.has(n.toLowerCase()));
          if (unknown.length) return { error: `No student has admission number ${unknown.slice(0, 3).join(', ')}.` };
          if (numbers.length > 20) return { error: 'Link at most 20 children.' };
          return { childIds: [...new Set(numbers.map((n) => l.studentsByAdmission.get(n.toLowerCase())!.id))] };
        },
      },
      { key: 'relationship', header: 'Relationship', width: 14, parse: textField(40) },
    ],
    schema: parentSchema as unknown as z.ZodObject<z.ZodRawShape>,
    load: (db) => query<Existing>(
      `SELECT u.id, u.email AS key, u.email,
              json_build_object('email', u.email, 'firstName', u.first_name, 'lastName', u.last_name, 'phone', COALESCE(u.phone, ''),
                'children', COALESCE((SELECT string_agg(s.admission_no, '; ' ORDER BY s.admission_no) FROM guardians g JOIN students s ON s.user_id = g.student_id WHERE g.parent_id = u.id), ''),
                'relationship', COALESCE((SELECT initcap(g.relationship) FROM guardians g WHERE g.parent_id = u.id ORDER BY g.is_primary DESC LIMIT 1), ''),
                'status', CASE WHEN u.is_active THEN 'Active' ELSE 'Deactivated' END) AS values
         FROM users u WHERE u.role = 'parent' ORDER BY u.last_name, u.first_name`, [], db),
    insert: insertParent as KindConfig['insert'],
    patch: patchParent as KindConfig['patch'],
    exportOnly: [{ key: 'status', header: 'Status', width: 12 }],
  },
};

const columnsFor = (cfg: KindConfig, withExport: boolean): SheetColumn[] => [
  { key: cfg.keyField.key, header: cfg.keyField.header, width: cfg.keyField.width },
  ...cfg.fields.map((f) => ({ key: f.key, header: f.header, width: f.width, entry: true, validation: f.validation })),
  ...(withExport ? (cfg.exportOnly ?? []).map((c) => ({ ...c })) : []),
];

async function lookups(db: Db): Promise<Lookups> {
  const [classes, students] = await Promise.all([
    query<{ id: number; name: string }>('SELECT id, name FROM classes ORDER BY grade_level, name', [], db),
    query<{ id: number; admissionNo: string; name: string }>(
      "SELECT s.user_id AS id, s.admission_no, u.first_name || ' ' || u.last_name AS name FROM students s JOIN users u ON u.id = s.user_id", [], db),
  ]);
  return {
    classesByName: new Map(classes.map((c) => [c.name.toLowerCase(), c])),
    studentsByAdmission: new Map(students.map((s) => [s.admissionNo.toLowerCase(), s])),
  };
}

interface Write { kind: 'create' | 'update'; row: number; id: number | null; name: string; body: Record<string, unknown> }

/** Field label shown in the review for a changed value. */
const showValue = (v: string | undefined) => (v ? clip(v, 30) : '—');

async function analysePeople(kind: PeopleKind, tpl: Template, db: Db) {
  const cfg = CONFIG[kind];
  const review = new Review();
  const [existing, look] = await Promise.all([cfg.load(db), lookups(db)]);
  const byKey = new Map(existing.map((e) => [e.key.toLowerCase(), e]));
  const byEmail = new Map(existing.map((e) => [e.email.toLowerCase(), e]));
  const emailsInUse = new Map((await query<{ id: number; email: string; role: string }>('SELECT id, email, role FROM users', [], db)).map((u) => [u.email.toLowerCase(), u]));
  const rows = [...templateRows(tpl)];

  // Duplicate identifiers and emails inside the file.
  const seenKey = new Map<string, number[]>();
  const seenEmail = new Map<string, number[]>();
  for (const r of rows) {
    const k = r.get(cfg.keyField.key).text.toLowerCase();
    if (k) seenKey.set(k, [...(seenKey.get(k) ?? []), r.row]);
    if (kind !== 'parents') {
      const e = r.get('email').text.toLowerCase();
      if (e) seenEmail.set(e, [...(seenEmail.get(e) ?? []), r.row]);
    }
  }

  const writes: Write[] = [];
  const changes: { id: number | null; key: string; before: string | null; after: string | null }[] = [];
  for (const r of rows) {
    const keyText = r.get(cfg.keyField.key).text;
    const fullName = `${r.get('firstName').text} ${r.get('lastName').text}`.trim();
    const problems: [string, string][] = [];
    const fail = (column: string, message: string) => problems.push([column, message]);

    const dupKey = keyText ? seenKey.get(keyText.toLowerCase())! : [];
    if (dupKey.length > 1) fail(cfg.keyField.header, `This ${cfg.keyField.header.toLowerCase()} appears more than once (rows ${dupKey.join(', ')}). Keep one row per ${cfg.noun}.`);
    const dupEmail = kind !== 'parents' && r.get('email').text ? seenEmail.get(r.get('email').text.toLowerCase())! : [];
    if (dupEmail.length > 1) fail('Email', `This email appears more than once (rows ${dupEmail.join(', ')}). Each person needs their own email.`);

    // Parse every provided cell.
    const input: Record<string, unknown> = {};
    const provided: Record<string, string> = {};
    if (keyText) {
      const p = cfg.keyField.parse(r.get(cfg.keyField.key));
      if (p.error) fail(cfg.keyField.header, p.error);
    }
    for (const f of cfg.fields) {
      const cell = r.get(f.key);
      if (cell.error) { fail(f.header, `The cell shows ${cell.error}. Type the value instead.`); continue; }
      if (!cell.text && !cell.date) continue;
      const p = f.parse(cell);
      if (p.error) { fail(f.header, p.error); continue; }
      provided[f.key] = String(p.value);
      if (f.apply) {
        const applied = f.apply(p.value, look);
        if ('error' in applied) fail(f.header, String(applied.error));
        else Object.assign(input, applied);
      } else input[f.key] = p.value;
    }

    let current: Existing | undefined;
    if (kind === 'parents') {
      const parsedEmail = keyText ? emailField(r.get('email')) : { error: 'An email address is needed to match or create a parent.' };
      if (parsedEmail.error) fail('Email', parsedEmail.error);
      else {
        const em = String(parsedEmail.value);
        current = byKey.get(em);
        const owner = emailsInUse.get(em);
        if (!current && owner) fail('Email', `This email already belongs to a ${owner.role} account. Parents need their own email.`);
        input.email = em;
        provided.email = em;
      }
    } else if (keyText) {
      current = byKey.get(keyText.toLowerCase());
      if (!current) input[cfg.keyField.key] = keyText; // a new person with the school's own number
    } else if (input.email) {
      // No number yet (for example a row added before the number was given): the email identifies the person.
      current = byEmail.get(String(input.email));
    }
    if (kind !== 'parents' && input.email) {
      const owner = emailsInUse.get(String(input.email));
      if (owner && owner.id !== current?.id) {
        fail('Email', current
          ? `This email already belongs to another account (${owner.role}).`
          : `This email already belongs to a ${owner.role} account. If this row is that person, use their ${cfg.keyField.header.toLowerCase()} instead.`);
      }
    }
    if ('childIds' in input) {
      input.children = (input.childIds as number[]).map((studentId) => ({ studentId, relationship: String(input.relationship ?? current?.values.relationship ?? 'guardian').toLowerCase() || 'guardian' }));
      delete input.childIds;
    }
    delete input.relationship;

    const label = current ? `${current.values.firstName} ${current.values.lastName}` : fullName || keyText;
    if (!problems.length && !current) {
      for (const f of cfg.fields) if (f.required && !provided[f.key]) fail(f.header, `${f.header} is needed for a new ${cfg.noun}.`);
      if (kind === 'parents' && !keyText) fail('Email', 'An email address is needed for a new parent.');
    }

    if (!problems.length && current) {
      // Only fields that actually change are saved.
      const diff: string[] = [];
      const patch: Record<string, unknown> = {};
      for (const f of cfg.fields) {
        if (!(f.key in provided)) continue;
        const before = current.values[f.key] ?? '';
        const after = f.key === 'gender' ? provided[f.key]!.charAt(0).toUpperCase() + provided[f.key]!.slice(1) : provided[f.key]!;
        const same = f.key === 'children'
          ? before.split(';').map((x) => x.trim().toLowerCase()).filter(Boolean).sort().join() === after.split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(Boolean).sort().join()
          : before.toLowerCase() === after.toLowerCase() && (f.key !== 'firstName' && f.key !== 'lastName' && f.key !== 'address' ? true : before === after);
        if (same) continue;
        diff.push(`${f.header.replace(/ \(.*\)$/, '')}: ${showValue(before)} → ${showValue(after)}`);
        if (f.key === 'class') patch.classId = input.classId;
        else if (f.key === 'children') patch.children = input.children;
        else if (f.key === 'relationship') continue; // applied with the children below
        else patch[f.key] = input[f.key];
      }
      // A new relationship on its own re-links the current children with that relationship.
      if ('relationship' in provided && !('children' in provided) && diff.some((d) => d.startsWith('Relationship'))) {
        const ids = (current.values.children ?? '').split(';').map((x) => look.studentsByAdmission.get(x.trim().toLowerCase())?.id).filter((x): x is number => !!x);
        patch.children = ids.map((studentId) => ({ studentId, relationship: provided.relationship!.toLowerCase() }));
      }
      if (!diff.length) {
        review.rows.push({ row: r.row, studentId: current.id, admissionNo: current.key, studentName: label, action: 'unchanged', before: null, after: null, note: null });
        continue;
      }
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
      const check = cfg.schema.partial().safeParse(patch);
      if (!check.success) {
        for (const issue of check.error.issues) fail(String(issue.path[0] ?? ''), issue.message);
      } else {
        const text = diff.join('; ');
        review.rows.push({ row: r.row, studentId: current.id, admissionNo: current.key, studentName: label, action: 'update', before: null, after: text, note: null });
        writes.push({ kind: 'update', row: r.row, id: current.id, name: label, body: check.data });
        changes.push({ id: current.id, key: current.key, before: null, after: text });
        continue;
      }
    }

    if (!problems.length && !current) {
      const check = cfg.schema.safeParse(input);
      if (!check.success) {
        for (const issue of check.error.issues) fail(String(issue.path[0] ?? ''), issue.message);
      } else {
        const summary = [provided.class, provided.email ?? input.email, provided.specialization, provided.children && `children ${provided.children}`].filter(Boolean).join(' · ');
        review.rows.push({ row: r.row, studentId: null, admissionNo: keyText || 'New', studentName: label, action: 'create', before: null, after: summary || 'New', note: null });
        writes.push({ kind: 'create', row: r.row, id: null, name: label, body: check.data });
        changes.push({ id: null, key: keyText || String(input.email), before: null, after: `New ${cfg.noun}: ${label}` });
        continue;
      }
    }

    for (const [column, message] of problems) review.issue(r.row, column, keyText || null, label || null, message);
    review.rows.push({ row: r.row, studentId: current?.id ?? null, admissionNo: keyText, studentName: label, action: 'error', before: null, after: null, note: problems[0]?.[1] ?? null });
  }

  const preview: ImportPreview = review.finish(kind, `${cfg.plural[0]!.toUpperCase()}${cfg.plural.slice(1)} import`,
    [{ label: 'Rows in file', value: String(rows.length) }, { label: 'Matched by', value: cfg.keyField.header }], 0, { kind });
  return { cfg, preview, writes, changes };
}

// --------------------------------------------------------------------------------------------------- Routes
peopleImportsRouter.get('/:kind/template', async (req, res) => {
  const kind = kindParam(req);
  const cfg = CONFIG[kind];
  const format = formatParam(req.query.format, false);
  const [school, look] = await Promise.all([loadSettings(), lookups(pool)]);
  const columns = columnsFor(cfg, false);
  const classNames = [...look.classesByName.values()].map((c) => c.name);
  const classCol = columns.find((c) => c.key === 'class');
  if (classCol && classNames.length) {
    classCol.validation = { type: 'list', allowBlank: true, formulae: [`Classes!$A$2:$A$${classNames.length + 1}`], showErrorMessage: true, errorTitle: 'Unknown class', error: 'Choose a class from the list.' };
  }
  const spec: SheetSpec = {
    sheetName: cfg.plural[0]!.toUpperCase() + cfg.plural.slice(1),
    title: `${school.name} — ${cfg.plural} template`,
    details: [['Downloaded', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })]],
    instructions: [
      kind === 'parents'
        ? 'One row per parent. Parents are matched by email: an email already in EduLearn updates that parent, a new one adds a parent.'
        : `One row per ${cfg.noun}. Leave ${cfg.keyField.header} blank to add a new ${cfg.noun} (a number is given automatically), or use your school’s own number.`,
      `Needed for a new ${cfg.noun}: ${cfg.fields.filter((f) => f.required).map((f) => f.header).join(', ')}${kind === 'parents' ? ', Email' : ''}.`,
      ...(kind === 'students' ? ['Class must match a class name in EduLearn (see the Classes sheet). Dates as YYYY-MM-DD. Gender: Male, Female or Other.'] : []),
      ...(kind === 'teachers' ? ['Dates as YYYY-MM-DD.'] : []),
      ...(kind === 'parents' ? ['Children: the students’ admission numbers separated by “;”. Relationship: Mother, Father, Guardian…'] : []),
      'To change existing people, use Export (Excel or CSV), edit it and import it back. Blank cells keep what is saved.',
      'New accounts get a temporary password, shown once after the import so you can hand them out.',
    ],
    columns,
    rows: format === 'xlsx' ? Array.from({ length: 200 }, () => columns.map(() => null)) : [],
    meta: { kind },
    lockIdentifiers: false,
    lists: kind === 'students' ? [{ name: 'Classes', header: 'Class names', values: classNames }] : undefined,
  };
  await sendTable(res, `${cfg.plural}-template`, format, spec);
});

peopleImportsRouter.get('/:kind/export', async (req, res) => {
  const kind = kindParam(req);
  const cfg = CONFIG[kind];
  const format = formatParam(req.query.format, true);
  const [school, existing] = await Promise.all([loadSettings(), cfg.load(pool)]);
  const columns = columnsFor(cfg, true);
  const spec: SheetSpec = {
    sheetName: cfg.plural[0]!.toUpperCase() + cfg.plural.slice(1),
    title: `${school.name} — ${cfg.plural}`,
    details: [['Exported', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })], ['Total', String(existing.length)]],
    instructions: format === 'pdf' ? [] : [
      'You can edit this file and import it back: rows are matched by the first column. Blank cells keep what is saved.',
      'The Status column is for information only; deactivate or reactivate accounts on screen.',
    ],
    columns,
    rows: existing.map((e) => columns.map((c) => e.values[c.key] || null)),
    meta: format === 'pdf' ? undefined : { kind },
    lockIdentifiers: false,
  };
  await sendTable(res, `${cfg.plural}-${new Date().toISOString().slice(0, 10)}`, format, spec);
});

peopleImportsRouter.post('/:kind/preview', upload, async (req, res) => {
  const kind = kindParam(req);
  const tpl = await readTemplate(req.body, kind);
  const { preview } = await analysePeople(kind, tpl, pool);
  res.json(preview);
});

peopleImportsRouter.post('/:kind/commit', upload, async (req, res) => {
  const kind = kindParam(req);
  const fingerprint = String(req.query.fingerprint ?? '');
  const confirmOverwrite = req.query.confirmOverwrite === '1';
  const tpl = await readTemplate(req.body, kind);
  const user = me(req);
  const result = await transaction(async (db): Promise<ImportResult> => {
    await query('SELECT pg_advisory_xact_lock(3, $1)', [LOCK_KEY[kind]], db);
    const a = await analysePeople(kind, tpl, db);
    if (a.preview.issues.length) throw badRequest('The file still has errors. Fix them and upload it again.');
    if (a.preview.fingerprint !== fingerprint) throw conflict('The records changed after your review. Look at the updated review and save again.');
    if (a.preview.counts.update && !confirmOverwrite) throw badRequest(`Confirm that you want to update ${a.preview.counts.update} existing ${a.preview.counts.update === 1 ? a.cfg.noun : a.cfg.plural}.`);
    const { create, update, unchanged } = a.preview.counts;
    if (!a.writes.length) return { importId: null, created: 0, updated: 0, unchanged, title: a.preview.title };
    const accounts: ImportedAccount[] = [];
    for (const w of a.writes) {
      if (w.kind === 'create') {
        const acc = await a.cfg.insert(db, w.body as never);
        if (acc.temporaryPassword) accounts.push({ name: w.name, email: String(w.body.email), identifier: acc.identifier, temporaryPassword: acc.temporaryPassword });
      } else {
        await a.cfg.patch(db, w.id!, w.body as never);
      }
    }
    const rec = await queryOne<{ id: number }>(
      `INSERT INTO data_imports (kind, context, filename, file_sha256, imported_by, created_count, updated_count, unchanged_count, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [kind, JSON.stringify({ kind }), String(req.query.filename ?? '').slice(0, 200) || null, sha256(req.body as Buffer), user.id,
        create, update, unchanged, JSON.stringify(a.changes)],
      db,
    );
    await audit(req, {
      action: create ? 'create' : 'update', entity: a.cfg.noun, entityId: `import:${rec!.id}`,
      summary: `Imported ${a.cfg.plural} from a file: ${create} new, ${update} updated`,
      details: { importId: rec!.id, created: create, updated: update, unchanged },
    }, db);
    return { importId: rec!.id, created: create, updated: update, unchanged, title: a.preview.title, accounts };
  });
  res.json(result);
});
