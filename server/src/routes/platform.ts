import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AppNotification, AuditEntry, ContactRequest, Paginated, SchoolSettings, StudentListItem } from '../../../shared/types.js';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { canViewStudent } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, intParam, notFound, pageParams, parse, provided } from '../lib/http.js';
import { notifyWhere } from '../lib/notify.js';
import { phone } from '../lib/phone.js';
import { invalidateSettings, loadSettings } from '../lib/settings.js';
import { STUDENT_SELECT } from '../lib/sql.js';
import { email, optionalText } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

/** Routes anyone may call: school branding and the website's contact form. */
export const publicRouter = Router();

publicRouter.get('/school', async (_req, res) => {
  res.json(await loadSettings());
});

publicRouter.get('/school/logo', async (_req, res) => {
  const logo = await queryOne<{ data: Buffer; mime: string }>('SELECT data, mime FROM school_logo WHERE id = 1');
  if (!logo) throw notFound('Logo');
  res.set('Content-Type', logo.mime).set('Cache-Control', 'public, max-age=86400').send(logo.data);
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'You have sent several messages already. Please try again later or call us.' },
});

publicRouter.post('/contact', contactLimiter, async (req, res) => {
  const b = parse(
    z.object({
      kind: z.enum(['contact', 'demo']).default('contact'),
      fullName: z.string().trim().min(2, 'Enter your full name').max(120),
      schoolName: optionalText(160),
      email,
      phone,
      message: z.string().trim().min(5, 'Write a short message').max(3000),
      // Honeypot: real people never fill this hidden field.
      website: z.string().max(0).optional(),
    }),
    req.body,
  );
  const row = await queryOne<{ id: number }>(
    `INSERT INTO contact_requests (kind, full_name, school_name, email, phone, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [b.kind, b.fullName, b.schoolName, b.email, b.phone, b.message],
  );
  await notifyWhere("SELECT id FROM users WHERE role = 'admin' AND is_active", [], {
    type: 'system',
    title: b.kind === 'demo' ? `Demo request from ${b.fullName}` : `New enquiry from ${b.fullName}`,
    body: b.schoolName ? `${b.schoolName}: ${b.message.slice(0, 140)}` : b.message.slice(0, 160),
    link: '/enquiries',
  });
  res.status(201).json({ id: row!.id });
});

/** Routes for signed-in users. */
export const platformRouter = Router();

// ---------------------------------------------------------------------------
// School settings (admin)
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(120),
  motto: optionalText(160),
  address: optionalText(300),
  phone,
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160).nullish().or(z.literal('').transform(() => null)),
  website: optionalText(160),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as TZS'),
  defaultLanguage: z.enum(['en', 'sw']),
  levelLabel: z.string().trim().min(1).max(30),
});

platformRouter.put('/school', requireRole('admin'), async (req, res) => {
  const b = provided(parse(settingsSchema.partial(), req.body), req.body);
  const cols: Record<string, string> = {
    name: 'name', motto: 'motto', address: 'address', phone: 'phone', email: 'email', website: 'website',
    currency: 'currency', defaultLanguage: 'default_language', levelLabel: 'level_label',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(b)) {
    params.push(value ?? null);
    sets.push(`${cols[key]} = $${params.length}`);
  }
  if (sets.length) await query(`UPDATE school_settings SET ${sets.join(', ')}, updated_at = now() WHERE id = 1`, params);
  invalidateSettings();
  await audit(req, { action: 'settings', entity: 'school', summary: 'Updated school settings', details: { fields: Object.keys(b) } });
  res.json(await loadSettings() satisfies SchoolSettings);
});

const imageBody = express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], limit: '2mb' });

platformRouter.put('/school/logo', requireRole('admin'), imageBody, async (req, res) => {
  const mime = req.get('content-type')?.split(';')[0] ?? '';
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Choose a PNG, JPEG, WebP or SVG image under 2 MB');
  await query(
    `INSERT INTO school_logo (id, data, mime) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, mime = EXCLUDED.mime, updated_at = now()`,
    [req.body, mime],
  );
  invalidateSettings();
  await audit(req, { action: 'settings', entity: 'school', summary: 'Uploaded a new school logo' });
  res.json(await loadSettings());
});

platformRouter.delete('/school/logo', requireRole('admin'), async (req, res) => {
  await query('DELETE FROM school_logo WHERE id = 1');
  invalidateSettings();
  await audit(req, { action: 'settings', entity: 'school', summary: 'Removed the school logo' });
  res.json(await loadSettings());
});

// ---------------------------------------------------------------------------
// Profile photos
// ---------------------------------------------------------------------------
const photoBody = express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '2mb' });

/** Students' photos are only visible to people who may see that student; staff photos to anyone signed in. */
async function assertCanSeePhoto(req: express.Request, userId: number) {
  const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  if (!target) throw notFound('User');
  if (target.role === 'student' && !(await canViewStudent(me(req), userId))) throw forbidden();
  if (target.role === 'parent' && me(req).role !== 'admin' && me(req).id !== userId && me(req).role !== 'teacher') throw forbidden();
}

platformRouter.get('/users/:id/photo', async (req, res) => {
  const userId = intParam(req.params.id);
  await assertCanSeePhoto(req, userId);
  const photo = await queryOne<{ data: Buffer; mime: string }>('SELECT data, mime FROM user_photos WHERE user_id = $1', [userId]);
  if (!photo) throw notFound('Photo');
  res.set('Content-Type', photo.mime).set('Cache-Control', 'private, max-age=86400').send(photo.data);
});

/** Admins can set anyone's photo; everyone can set their own. */
platformRouter.put('/users/:id/photo', photoBody, async (req, res) => {
  const userId = intParam(req.params.id);
  const user = me(req);
  if (user.role !== 'admin' && user.id !== userId) throw forbidden('You can only change your own photo');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Choose a JPEG, PNG or WebP photo under 2 MB');
  const mime = req.get('content-type')?.split(';')[0] ?? '';
  const exists = await queryOne('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!exists) throw notFound('User');
  const row = await queryOne<{ v: number }>(
    `INSERT INTO user_photos (user_id, data, mime) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, mime = EXCLUDED.mime, updated_at = now()
     RETURNING extract(epoch FROM updated_at)::bigint AS v`,
    [userId, req.body, mime],
  );
  if (user.id !== userId) await audit(req, { action: 'update', entity: 'user', entityId: userId, summary: 'Updated profile photo' });
  res.json({ photoUrl: `/api/users/${userId}/photo?v=${row!.v}` });
});

platformRouter.delete('/users/:id/photo', async (req, res) => {
  const userId = intParam(req.params.id);
  const user = me(req);
  if (user.role !== 'admin' && user.id !== userId) throw forbidden('You can only change your own photo');
  await query('DELETE FROM user_photos WHERE user_id = $1', [userId]);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
platformRouter.get('/notifications', async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const unreadOnly = req.query.unread === 'true';
  const where = `user_id = $1${unreadOnly ? ' AND read_at IS NULL' : ''}`;
  const [items, count] = await Promise.all([
    query<AppNotification>(
      `SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE ${where}
        ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}`,
      [me(req).id],
    ),
    queryOne<{ total: number }>(`SELECT COUNT(*)::int AS total FROM notifications WHERE ${where}`, [me(req).id]),
  ]);
  res.json({ items, total: count?.total ?? 0, page, pageSize } satisfies Paginated<AppNotification>);
});

platformRouter.post('/notifications/:id/read', async (req, res) => {
  await query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [intParam(req.params.id), me(req).id]);
  res.status(204).end();
});

platformRouter.post('/notifications/read-all', async (req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [me(req).id]);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Audit log (admin)
// ---------------------------------------------------------------------------
platformRouter.get('/audit-logs', requireRole('admin'), async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const params: unknown[] = [];
  const where: string[] = [];
  if (typeof req.query.entity === 'string' && req.query.entity) {
    params.push(req.query.entity);
    where.push(`entity = $${params.length}`);
  }
  if (typeof req.query.action === 'string' && req.query.action) {
    params.push(req.query.action);
    where.push(`action = $${params.length}`);
  }
  const search = String(req.query.search ?? '').trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(summary ILIKE $${params.length} OR actor_name ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [items, count] = await Promise.all([
    query<AuditEntry>(
      `SELECT id, actor_id, actor_name, action, entity, entity_id, summary, created_at FROM audit_logs ${whereSql}
        ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    ),
    queryOne<{ total: number }>(`SELECT COUNT(*)::int AS total FROM audit_logs ${whereSql}`, params),
  ]);
  res.json({ items, total: count?.total ?? 0, page, pageSize } satisfies Paginated<AuditEntry>);
});

// ---------------------------------------------------------------------------
// Website enquiries (admin)
// ---------------------------------------------------------------------------
platformRouter.get('/enquiries', requireRole('admin'), async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const params: unknown[] = [];
  let where = '';
  if (typeof req.query.status === 'string' && ['new', 'contacted', 'closed'].includes(req.query.status)) {
    params.push(req.query.status);
    where = 'WHERE status = $1';
  }
  const [items, count] = await Promise.all([
    query<ContactRequest>(
      `SELECT id, kind, full_name, school_name, email, phone, message, status, created_at FROM contact_requests ${where}
        ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    ),
    queryOne<{ total: number }>(`SELECT COUNT(*)::int AS total FROM contact_requests ${where}`, params),
  ]);
  res.json({ items, total: count?.total ?? 0, page, pageSize } satisfies Paginated<ContactRequest>);
});

platformRouter.patch('/enquiries/:id', requireRole('admin'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['new', 'contacted', 'closed']) }), req.body);
  const row = await queryOne<ContactRequest>(
    `UPDATE contact_requests SET status = $2, handled_by = $3 WHERE id = $1
     RETURNING id, kind, full_name, school_name, email, phone, message, status, created_at`,
    [intParam(req.params.id), status, me(req).id],
  );
  if (!row) throw notFound('Enquiry');
  await audit(req, { action: 'update', entity: 'enquiry', entityId: row.id, summary: `Marked enquiry from ${row.fullName} as ${status}` });
  res.json(row);
});

// ---------------------------------------------------------------------------
// "My children" — the parent's child switcher (a student gets just themselves)
// ---------------------------------------------------------------------------
platformRouter.get('/my/children', async (req, res) => {
  const user = me(req);
  if (user.role === 'parent') {
    res.json(await query<StudentListItem & { relationship: string }>(
      `${STUDENT_SELECT.replace('AS photo_url', 'AS photo_url, g.relationship')}
         JOIN guardians g ON g.student_id = s.user_id WHERE g.parent_id = $1 ORDER BY u.first_name`,
      [user.id],
    ));
  } else if (user.role === 'student') {
    res.json(await query<StudentListItem>(`${STUDENT_SELECT} WHERE s.user_id = $1`, [user.id]));
  } else {
    res.json([]);
  }
});
