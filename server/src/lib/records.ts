/**
 * Business rules for saving marks and attendance, shared by manual entry and Excel import so both behave
 * exactly the same way.
 */
import type { AttendanceStatus, GradeStatus } from '../../../shared/types.js';
import type pg from 'pg';
import { query } from '../db/pool.js';

type Db = pg.PoolClient;
import { guardiansOf, notifyUsers } from './notify.js';

export interface GradeWrite {
  studentId: number;
  /** A number from 0 to the maximum, or null when the student has a status (or the grade is being cleared). */
  score: number | null;
  status: GradeStatus | null;
  /** undefined keeps the existing feedback; null or text replaces it. */
  feedback?: string | null;
}

/** Scores are stored with two decimals, from 0 up to and including the assessment's maximum. */
export function scoreProblem(score: number, maxScore: number): string | null {
  if (!Number.isFinite(score)) return 'Enter a number';
  if (score < 0) return "Marks can't be negative";
  if (score > maxScore) return `Marks can't be higher than the maximum of ${maxScore}`;
  if (Math.round(score * 100) !== score * 100) return 'Use at most two decimal places';
  return null;
}

/** Write grades for one assessment. A grade with neither a score nor a status is removed. */
export async function saveGrades(db: Db, assessmentId: number, gradedBy: number, entries: GradeWrite[]) {
  for (const g of entries) {
    if (g.score === null && g.status === null) {
      await query('DELETE FROM grades WHERE assessment_id = $1 AND student_id = $2', [assessmentId, g.studentId], db);
      continue;
    }
    await query(
      `INSERT INTO grades (assessment_id, student_id, score, status, feedback, graded_by) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (assessment_id, student_id) DO UPDATE
         SET score = EXCLUDED.score, status = EXCLUDED.status,
             feedback = CASE WHEN $7 THEN grades.feedback ELSE EXCLUDED.feedback END,
             graded_by = EXCLUDED.graded_by, graded_at = now()`,
      [assessmentId, g.studentId, g.status ? null : g.score, g.status, g.feedback ?? null, gradedBy, g.feedback === undefined],
      db,
    );
  }
}

export interface AttendanceWrite {
  studentId: number;
  status: AttendanceStatus;
  /** undefined keeps the existing note; null or text replaces it. */
  note?: string | null;
}

/**
 * Write a class register for one date. Returns the students who became absent or late with this save, so
 * re-saving the same register doesn't message parents twice.
 */
export async function saveAttendance(db: Db, classId: number, date: string, recordedBy: number, entries: AttendanceWrite[]) {
  const before = await query<{ studentId: number; status: string }>(
    'SELECT student_id, status FROM attendance WHERE date = $1 AND student_id = ANY($2)',
    [date, entries.map((e) => e.studentId)],
    db,
  );
  const previous = new Map(before.map((b) => [b.studentId, b.status]));
  for (const e of entries) {
    await query(
      `INSERT INTO attendance (student_id, class_id, date, status, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, date) DO UPDATE
         SET status = EXCLUDED.status,
             note = CASE WHEN $7 THEN attendance.note ELSE EXCLUDED.note END,
             class_id = EXCLUDED.class_id, recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
      [e.studentId, classId, date, e.status, e.note ?? null, recordedBy, e.note === undefined],
      db,
    );
  }
  return entries.filter((e) => (e.status === 'absent' || e.status === 'late') && previous.get(e.studentId) !== e.status);
}

/** Tell parents about absences and late arrivals (after the register has been saved). */
export async function notifyAttendance(date: string, flagged: AttendanceWrite[]) {
  if (!flagged.length) return;
  const parents = await guardiansOf(flagged.map((f) => f.studentId));
  const names = await query<{ id: number; firstName: string }>('SELECT id, first_name FROM users WHERE id = ANY($1)', [flagged.map((f) => f.studentId)]);
  for (const f of flagged) {
    const name = names.find((n) => n.id === f.studentId)?.firstName ?? 'Your child';
    await notifyUsers(parents.get(f.studentId) ?? [], {
      type: 'attendance',
      title: f.status === 'absent' ? `${name} was marked absent` : `${name} arrived late`,
      body: `${date}${f.note ? ` · ${f.note}` : ''}`,
      link: `/students/${f.studentId}?tab=attendance`,
    });
  }
}
