import { Router } from 'express';
import { z } from 'zod';
import type { AttendanceRegister, RegisterEntry } from '../../../shared/types.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { assertCanTakeAttendance } from '../lib/access.js';
import { guardiansOf, notifyUsers } from '../lib/notify.js';
import { badRequest, intParam, parse } from '../lib/http.js';
import { id, isoDate } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireRole('admin', 'teacher'));

const today = () => new Date().toISOString().slice(0, 10);

async function loadRegister(classId: number, date: string): Promise<AttendanceRegister> {
  const cls = await queryOne<{ name: string }>('SELECT name FROM classes WHERE id = $1', [classId]);
  const entries = await query<RegisterEntry>(
    `SELECT u.id, u.first_name, u.last_name, s.admission_no, a.status, a.note
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN attendance a ON a.student_id = s.user_id AND a.date = $2
      WHERE s.class_id = $1 AND u.is_active
      ORDER BY u.last_name, u.first_name`,
    [classId, date],
  );
  return { classId, className: cls!.name, date, taken: entries.some((e) => e.status !== null), entries };
}

attendanceRouter.get('/register', async (req, res) => {
  const classId = intParam(req.query.classId, 'classId');
  const date = req.query.date ? parse(isoDate, req.query.date) : today();
  await assertCanTakeAttendance(me(req), classId);
  res.json(await loadRegister(classId, date));
});

attendanceRouter.put('/register', async (req, res) => {
  const body = parse(
    z.object({
      classId: id,
      date: isoDate,
      entries: z.array(z.object({
        studentId: id,
        status: z.enum(['present', 'absent', 'late', 'excused']),
        note: z.string().trim().max(200).nullish(),
      })).min(1).max(300),
    }),
    req.body,
  );
  const user = me(req);
  await assertCanTakeAttendance(user, body.classId);
  if (body.date > today()) throw badRequest("You can't record attendance for a future date");

  const flagged = await transaction(async (db) => {
    // Only students who belong to this class can be marked.
    const members = await query<{ userId: number }>('SELECT user_id FROM students WHERE class_id = $1', [body.classId], db);
    const allowed = new Set(members.map((m) => m.userId));
    const stray = body.entries.find((e) => !allowed.has(e.studentId));
    if (stray) throw badRequest('One of the students is not in this class');
    const before = await query<{ studentId: number; status: string }>(
      'SELECT student_id, status FROM attendance WHERE date = $1 AND student_id = ANY($2)',
      [body.date, body.entries.map((e) => e.studentId)],
      db,
    );
    const previous = new Map(before.map((b) => [b.studentId, b.status]));
    for (const e of body.entries) {
      await query(
        `INSERT INTO attendance (student_id, class_id, date, status, note, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (student_id, date) DO UPDATE
           SET status = EXCLUDED.status, note = EXCLUDED.note, class_id = EXCLUDED.class_id,
               recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
        [e.studentId, body.classId, body.date, e.status, e.note || null, user.id],
        db,
      );
    }
    // Only newly absent or late students trigger a message, so re-saving doesn't spam parents.
    return body.entries.filter((e) => (e.status === 'absent' || e.status === 'late') && previous.get(e.studentId) !== e.status);
  });
  if (flagged.length) {
    const parents = await guardiansOf(flagged.map((f) => f.studentId));
    const names = await query<{ id: number; firstName: string }>('SELECT id, first_name FROM users WHERE id = ANY($1)', [flagged.map((f) => f.studentId)]);
    for (const f of flagged) {
      const name = names.find((n) => n.id === f.studentId)?.firstName ?? 'Your child';
      await notifyUsers(parents.get(f.studentId) ?? [], {
        type: 'attendance',
        title: f.status === 'absent' ? `${name} was marked absent` : `${name} arrived late`,
        body: `${body.date}${f.note ? ` · ${f.note}` : ''}`,
        link: `/students/${f.studentId}?tab=attendance`,
      });
    }
  }
  res.json(await loadRegister(body.classId, body.date));
});

/** Daily attendance rate for a class across a date range — powers the history view. */
attendanceRouter.get('/history', async (req, res) => {
  const classId = intParam(req.query.classId, 'classId');
  await assertCanTakeAttendance(me(req), classId);
  const to = req.query.to ? parse(isoDate, req.query.to) : today();
  const from = req.query.from ? parse(isoDate, req.query.from) : new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  res.json(await query(
    `SELECT date,
            COUNT(*) FILTER (WHERE status = 'present')::int AS present,
            COUNT(*) FILTER (WHERE status = 'absent')::int AS absent,
            COUNT(*) FILTER (WHERE status = 'late')::int AS late,
            COUNT(*) FILTER (WHERE status = 'excused')::int AS excused,
            COUNT(*)::int AS total,
            ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('present','late')) / NULLIF(COUNT(*), 0), 1) AS rate
       FROM attendance WHERE class_id = $1 AND date BETWEEN $2 AND $3
      GROUP BY date ORDER BY date DESC`,
    [classId, from, to],
  ));
});
