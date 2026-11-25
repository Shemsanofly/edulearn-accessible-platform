import { Router } from 'express';
import { z } from 'zod';
import type { Announcement, Contact, Message, SchoolEvent, SessionUser } from '../../../shared/types.js';
import { query, queryOne } from '../db/pool.js';
import { badRequest, forbidden, intParam, notFound, parse, provided } from '../lib/http.js';
import { ANNOUNCEMENT_SELECT, EVENT_SELECT } from '../lib/sql.js';
import { id, isoDate, optionalText } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

export const communicationRouter = Router();

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** SQL condition limiting announcements to those the user's audience includes. Uses $1 = user id. */
export function announcementVisibility(user: SessionUser): string {
  switch (user.role) {
    case 'admin':
      return 'true';
    case 'teacher':
      return `(a.audience IN ('everyone','staff','students','parents') OR a.class_id IN (
                SELECT id FROM classes WHERE homeroom_teacher_id = $1
                UNION SELECT class_id FROM class_subjects WHERE teacher_id = $1))`;
    case 'student':
      return `(a.audience IN ('everyone','students') OR a.class_id = (SELECT class_id FROM students WHERE user_id = $1))`;
    case 'parent':
      return `(a.audience IN ('everyone','parents') OR a.class_id IN (
                SELECT s.class_id FROM guardians g JOIN students s ON s.user_id = g.student_id WHERE g.parent_id = $1))`;
  }
}

export const visibleAnnouncements = (user: SessionUser, limit = 50) =>
  query<Announcement>(
    `${ANNOUNCEMENT_SELECT} WHERE ($1::int IS NOT NULL) AND ${announcementVisibility(user)}
      ORDER BY a.pinned DESC, a.created_at DESC LIMIT ${limit}`,
    [user.id],
  );

communicationRouter.get('/announcements', async (req, res) => {
  res.json(await visibleAnnouncements(me(req), 100));
});

const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(150),
  body: z.string().trim().min(1, 'Required').max(5000),
  audience: z.enum(['everyone', 'staff', 'students', 'parents', 'class']),
  classId: id.nullish(),
  pinned: z.boolean().default(false),
});

communicationRouter.post('/announcements', requireRole('admin', 'teacher'), async (req, res) => {
  const b = parse(announcementSchema, req.body);
  const user = me(req);
  if (b.audience === 'class' && !b.classId) throw badRequest('Choose which class this is for', { classId: 'Required' });
  if (b.audience !== 'class') b.classId = null;
  if (user.role === 'teacher') {
    // Teachers post to their own classes; school-wide notices come from the office.
    if (b.audience !== 'class') throw forbidden('Teachers can post announcements to their own classes');
    const teaches = await queryOne(
      'SELECT 1 FROM classes c WHERE c.id = $2 AND (c.homeroom_teacher_id = $1 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1))',
      [user.id, b.classId],
    );
    if (!teaches) throw forbidden("You don't teach that class");
    b.pinned = false;
  }
  const row = await queryOne<{ id: number }>(
    'INSERT INTO announcements (title, body, audience, class_id, pinned, author_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [b.title, b.body, b.audience, b.classId ?? null, b.pinned, user.id],
  );
  res.status(201).json(await queryOne<Announcement>(`${ANNOUNCEMENT_SELECT} WHERE a.id = $1`, [row!.id]));
});

communicationRouter.patch('/announcements/:id', requireRole('admin'), async (req, res) => {
  const b = provided(parse(announcementSchema.pick({ title: true, body: true, pinned: true }).partial(), req.body), req.body);
  const row = await queryOne(
    'UPDATE announcements SET title = COALESCE($2, title), body = COALESCE($3, body), pinned = COALESCE($4, pinned) WHERE id = $1 RETURNING id',
    [intParam(req.params.id), b.title ?? null, b.body ?? null, b.pinned ?? null],
  );
  if (!row) throw notFound('Announcement');
  res.json(await queryOne<Announcement>(`${ANNOUNCEMENT_SELECT} WHERE a.id = $1`, [intParam(req.params.id)]));
});

communicationRouter.delete('/announcements/:id', requireRole('admin', 'teacher'), async (req, res) => {
  const user = me(req);
  const row = await queryOne<{ authorId: number | null }>('SELECT author_id FROM announcements WHERE id = $1', [intParam(req.params.id)]);
  if (!row) throw notFound('Announcement');
  if (user.role !== 'admin' && row.authorId !== user.id) throw forbidden('You can only delete your own announcements');
  await query('DELETE FROM announcements WHERE id = $1', [intParam(req.params.id)]);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------
const eventSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(150),
  description: optionalText(2000),
  type: z.enum(['academic', 'exam', 'holiday', 'meeting', 'sports', 'other']),
  startsOn: isoDate,
  endsOn: isoDate,
  location: optionalText(120),
});

communicationRouter.get('/events', async (req, res) => {
  const from = req.query.from ? parse(isoDate, req.query.from) : null;
  const to = req.query.to ? parse(isoDate, req.query.to) : null;
  res.json(await query<SchoolEvent>(
    `${EVENT_SELECT} WHERE ($1::date IS NULL OR ends_on >= $1) AND ($2::date IS NULL OR starts_on <= $2) ORDER BY starts_on, id`,
    [from, to],
  ));
});

communicationRouter.post('/events', requireRole('admin'), async (req, res) => {
  const b = parse(eventSchema, req.body);
  if (b.endsOn < b.startsOn) throw badRequest('The event must end on or after its start date', { endsOn: 'Must be on or after the start date' });
  res.status(201).json(await queryOne<SchoolEvent>(
    `INSERT INTO events (title, description, type, starts_on, ends_on, location, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, description, type, starts_on, ends_on, location`,
    [b.title, b.description, b.type, b.startsOn, b.endsOn, b.location, me(req).id],
  ));
});

communicationRouter.put('/events/:id', requireRole('admin'), async (req, res) => {
  const b = parse(eventSchema, req.body);
  if (b.endsOn < b.startsOn) throw badRequest('The event must end on or after its start date', { endsOn: 'Must be on or after the start date' });
  const row = await queryOne<SchoolEvent>(
    `UPDATE events SET title = $2, description = $3, type = $4, starts_on = $5, ends_on = $6, location = $7 WHERE id = $1
     RETURNING id, title, description, type, starts_on, ends_on, location`,
    [intParam(req.params.id), b.title, b.description, b.type, b.startsOn, b.endsOn, b.location],
  );
  if (!row) throw notFound('Event');
  res.json(row);
});

communicationRouter.delete('/events/:id', requireRole('admin'), async (req, res) => {
  const row = await queryOne('DELETE FROM events WHERE id = $1 RETURNING id', [intParam(req.params.id)]);
  if (!row) throw notFound('Event');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Who a user may message. Teachers ↔ their students and those students' parents; everyone ↔ admins. */
function contactsSql(user: SessionUser): string {
  const name = `u.first_name, u.last_name`;
  const admins = `SELECT u.id, ${name}, u.role, 'School office' AS context FROM users u WHERE u.role = 'admin' AND u.is_active`;
  switch (user.role) {
    case 'admin':
      return `SELECT u.id, ${name}, u.role,
                CASE u.role WHEN 'admin' THEN 'School office'
                  WHEN 'teacher' THEN 'Teacher'
                  WHEN 'student' THEN 'Student' || COALESCE(' · ' || (SELECT c.name FROM students s JOIN classes c ON c.id = s.class_id WHERE s.user_id = u.id), '')
                  ELSE 'Parent' END AS context
              FROM users u WHERE u.is_active`;
    case 'teacher':
      return `${admins}
        UNION SELECT u.id, ${name}, u.role, COALESCE(t.specialization, 'Teacher') AS context
              FROM users u JOIN teachers t ON t.user_id = u.id WHERE u.is_active
        UNION SELECT u.id, ${name}, u.role, 'Student · ' || c.name AS context
              FROM students s JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.class_id
             WHERE u.is_active AND (c.homeroom_teacher_id = $1 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1))
        UNION SELECT u.id, ${name}, u.role, 'Parent of ' || su.first_name || ' (' || c.name || ')' AS context
              FROM guardians g JOIN users u ON u.id = g.parent_id JOIN students s ON s.user_id = g.student_id
              JOIN users su ON su.id = s.user_id JOIN classes c ON c.id = s.class_id
             WHERE u.is_active AND (c.homeroom_teacher_id = $1 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1))`;
    case 'parent':
      return `${admins}
        UNION SELECT u.id, ${name}, u.role, sub.name || ' teacher · ' || su.first_name AS context
              FROM guardians g JOIN students s ON s.user_id = g.student_id JOIN users su ON su.id = s.user_id
              JOIN class_subjects cs ON cs.class_id = s.class_id JOIN subjects sub ON sub.id = cs.subject_id
              JOIN users u ON u.id = cs.teacher_id
             WHERE g.parent_id = $1 AND u.is_active
        UNION SELECT u.id, ${name}, u.role, 'Class teacher · ' || su.first_name AS context
              FROM guardians g JOIN students s ON s.user_id = g.student_id JOIN users su ON su.id = s.user_id
              JOIN classes c ON c.id = s.class_id JOIN users u ON u.id = c.homeroom_teacher_id
             WHERE g.parent_id = $1 AND u.is_active`;
    case 'student':
      return `${admins}
        UNION SELECT u.id, ${name}, u.role, sub.name || ' teacher' AS context
              FROM students s JOIN class_subjects cs ON cs.class_id = s.class_id JOIN subjects sub ON sub.id = cs.subject_id
              JOIN users u ON u.id = cs.teacher_id WHERE s.user_id = $1 AND u.is_active
        UNION SELECT u.id, ${name}, u.role, 'Class teacher' AS context
              FROM students s JOIN classes c ON c.id = s.class_id JOIN users u ON u.id = c.homeroom_teacher_id
             WHERE s.user_id = $1 AND u.is_active`;
  }
}

async function contactsFor(user: SessionUser, search = '', onlyId?: number): Promise<Contact[]> {
  // A person can be reachable for several reasons; keep one row each, joining the reasons.
  return query<Contact>(
    `SELECT id, first_name, last_name, role, string_agg(DISTINCT context, '; ') AS context
       FROM (${contactsSql(user)}) x
      WHERE id <> $1 AND ($2 = '' OR first_name || ' ' || last_name ILIKE '%' || $2 || '%') AND ($3::int IS NULL OR id = $3)
      GROUP BY id, first_name, last_name, role
      ORDER BY role, last_name, first_name LIMIT 200`,
    [user.id, search, onlyId ?? null],
  );
}

communicationRouter.get('/messages/contacts', async (req, res) => {
  res.json(await contactsFor(me(req), String(req.query.search ?? '').trim()));
});

const MESSAGE_SELECT = `
  SELECT m.id, m.sender_id, su.first_name || ' ' || su.last_name AS sender_name, su.role AS sender_role,
         m.recipient_id, ru.first_name || ' ' || ru.last_name AS recipient_name, ru.role AS recipient_role,
         m.subject, m.body, m.read_at, m.created_at
    FROM messages m JOIN users su ON su.id = m.sender_id JOIN users ru ON ru.id = m.recipient_id`;

communicationRouter.get('/messages', async (req, res) => {
  const user = me(req);
  const box = req.query.box === 'sent' ? 'sent' : 'inbox';
  const column = box === 'sent' ? 'm.sender_id' : 'm.recipient_id';
  res.json(await query<Message>(`${MESSAGE_SELECT} WHERE ${column} = $1 ORDER BY m.created_at DESC LIMIT 200`, [user.id]));
});

communicationRouter.post('/messages', async (req, res) => {
  const b = parse(
    z.object({
      recipientId: id,
      subject: z.string().trim().min(1, 'Add a subject').max(150),
      body: z.string().trim().min(1, 'Write a message').max(5000),
    }),
    req.body,
  );
  const user = me(req);
  const [allowed] = await contactsFor(user, '', b.recipientId);
  if (!allowed) throw forbidden("You can't send messages to that person");
  const row = await queryOne<{ id: number }>(
    'INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES ($1, $2, $3, $4) RETURNING id',
    [user.id, b.recipientId, b.subject, b.body],
  );
  res.status(201).json(await queryOne<Message>(`${MESSAGE_SELECT} WHERE m.id = $1`, [row!.id]));
});

communicationRouter.post('/messages/:id/read', async (req, res) => {
  await query('UPDATE messages SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND recipient_id = $2', [intParam(req.params.id), me(req).id]);
  res.status(204).end();
});

communicationRouter.delete('/messages/:id', async (req, res) => {
  const row = await queryOne('DELETE FROM messages WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2) RETURNING id', [intParam(req.params.id), me(req).id]);
  if (!row) throw notFound('Message');
  res.status(204).end();
});
