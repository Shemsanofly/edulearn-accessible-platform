/**
 * Creating and updating students, teachers and parents. Shared by the on-screen forms and bulk import, so both
 * validate and save in exactly the same way.
 */
import type pg from 'pg';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { createUser, nextCode, updateUser } from './accounts.js';
import { phone } from './phone.js';
import { email, id, isoDate, name, optionalText, password } from './validators.js';

type Db = pg.PoolClient;

// --------------------------------------------------------------------------------------------------- Students
export const studentSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password: password.optional(),
  phone,
  admissionNo: z.string().trim().max(40).optional(),
  classId: id.nullish(),
  dateOfBirth: isoDate.nullish(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).default('unspecified'),
  address: optionalText(300),
  accessibilityNeeds: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  medicalNotes: optionalText(1000),
  isActive: z.boolean().optional(),
});
export type StudentInput = z.infer<typeof studentSchema>;

export async function insertStudent(db: Db, body: StudentInput) {
  const account = await createUser(db, { ...body, role: 'student' });
  const admissionNo = body.admissionNo || (await nextCode(db, 'students', 'admission_no', 'STU'));
  await query(
    `INSERT INTO students (user_id, admission_no, class_id, date_of_birth, gender, address, accessibility_needs, medical_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [account.id, admissionNo, body.classId ?? null, body.dateOfBirth ?? null, body.gender, body.address,
      body.accessibilityNeeds, body.medicalNotes],
    db,
  );
  return { ...account, identifier: admissionNo };
}

/** `body` holds only the fields being changed (see `provided`). */
export async function patchStudent(db: Db, studentId: number, body: Partial<StudentInput>) {
  await updateUser(db, studentId, body);
  await query(
    `UPDATE students SET
       admission_no = COALESCE($2, admission_no),
       class_id = CASE WHEN $3::boolean THEN $4 ELSE class_id END,
       date_of_birth = CASE WHEN $5::boolean THEN $6::date ELSE date_of_birth END,
       gender = COALESCE($7, gender),
       address = CASE WHEN $8::boolean THEN $9 ELSE address END,
       accessibility_needs = COALESCE($10, accessibility_needs),
       medical_notes = CASE WHEN $11::boolean THEN $12 ELSE medical_notes END
     WHERE user_id = $1`,
    [studentId, body.admissionNo || null, 'classId' in body, body.classId ?? null, 'dateOfBirth' in body,
      body.dateOfBirth ?? null, body.gender ?? null, 'address' in body, body.address ?? null,
      body.accessibilityNeeds ?? null, 'medicalNotes' in body, body.medicalNotes ?? null],
    db,
  );
}

// --------------------------------------------------------------------------------------------------- Teachers
export const teacherSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password: password.optional(),
  phone,
  employeeNo: z.string().trim().max(40).optional(),
  qualification: optionalText(120),
  specialization: optionalText(120),
  hiredOn: isoDate.optional(),
  isActive: z.boolean().optional(),
});
export type TeacherInput = z.infer<typeof teacherSchema>;

export async function insertTeacher(db: Db, body: TeacherInput) {
  const account = await createUser(db, { ...body, role: 'teacher' });
  const employeeNo = body.employeeNo || (await nextCode(db, 'teachers', 'employee_no', 'TCH'));
  await query(
    `INSERT INTO teachers (user_id, employee_no, qualification, specialization, hired_on)
     VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))`,
    [account.id, employeeNo, body.qualification, body.specialization, body.hiredOn ?? null],
    db,
  );
  return { ...account, identifier: employeeNo };
}

export async function patchTeacher(db: Db, teacherId: number, body: Partial<TeacherInput>) {
  await updateUser(db, teacherId, body);
  await query(
    `UPDATE teachers SET
       employee_no = COALESCE($2, employee_no),
       qualification = CASE WHEN $3::boolean THEN $4 ELSE qualification END,
       specialization = CASE WHEN $5::boolean THEN $6 ELSE specialization END,
       hired_on = COALESCE($7::date, hired_on)
     WHERE user_id = $1`,
    [teacherId, body.employeeNo || null, 'qualification' in body, body.qualification ?? null, 'specialization' in body,
      body.specialization ?? null, body.hiredOn ?? null],
    db,
  );
}

// ---------------------------------------------------------------------------------------------------- Parents
const childSchema = z.object({ studentId: id, relationship: z.string().trim().min(1).max(40).default('guardian') });
export const parentSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password: password.optional(),
  phone,
  isActive: z.boolean().optional(),
  children: z.array(childSchema).max(20).optional(),
});
export type ParentInput = z.infer<typeof parentSchema>;

export async function setChildren(db: Db, parentId: number, children: { studentId: number; relationship: string }[]) {
  await query('DELETE FROM guardians WHERE parent_id = $1', [parentId], db);
  for (const child of children) {
    await query(
      'INSERT INTO guardians (parent_id, student_id, relationship) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [parentId, child.studentId, child.relationship],
      db,
    );
  }
}

export async function insertParent(db: Db, body: ParentInput) {
  const account = await createUser(db, { ...body, role: 'parent' });
  if (body.children) await setChildren(db, account.id, body.children);
  return { ...account, identifier: null };
}

export async function patchParent(db: Db, parentId: number, body: Partial<ParentInput>) {
  await updateUser(db, parentId, body);
  if (body.children) await setChildren(db, parentId, body.children);
}
