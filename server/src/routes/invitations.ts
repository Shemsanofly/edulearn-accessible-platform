import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { Invitation, InvitationDetails, IssuedInvitation, Paginated, Role } from '../../../shared/types.js';
import { config } from '../config.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, intParam, notFound, pageParams, parse } from '../lib/http.js';
import { sendMail } from '../lib/mail.js';
import { loadSettings } from '../lib/settings.js';
import { email, id, name, optionalText } from '../lib/validators.js';
import { me, requireRole } from '../middleware/auth.js';

/**
 * Invitation-based registration. Administrators invite a person by email with a fixed role
 * (and, for students and parents, their class or children). The person opens the link, chooses
 * a password and their account is created — they can never pick their own role or school.
 */
export const invitationsRouter = Router();
invitationsRouter.use(requireRole('admin'));

export const hashInviteToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

const STATUS_SQL = `CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted'
                         WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                         WHEN i.expires_at < now() THEN 'expired'
                         ELSE 'pending' END`;

export const INVITATION_SELECT = `
  SELECT i.id, i.email, i.role, i.first_name, i.last_name, i.details, i.message, ${STATUS_SQL} AS status,
         CASE WHEN u.id IS NULL THEN NULL ELSE u.first_name || ' ' || u.last_name END AS invited_by_name,
         i.created_at, i.expires_at, i.accepted_at,
         CASE i.role
           WHEN 'student' THEN (SELECT c.name FROM classes c WHERE c.id = (i.details->>'classId')::int)
           WHEN 'parent' THEN (SELECT string_agg(su.first_name || ' ' || su.last_name, ', ' ORDER BY su.first_name)
                                 FROM jsonb_array_elements(COALESCE(i.details->'children', '[]'::jsonb)) ch
                                 JOIN users su ON su.id = (ch->>'studentId')::int)
           WHEN 'teacher' THEN NULLIF(i.details->>'specialization', '')
         END AS detail_summary
    FROM invitations i LEFT JOIN users u ON u.id = i.invited_by`;

const detailsSchema = z.object({
  classId: id.nullish(),
  children: z.array(z.object({ studentId: id, relationship: z.string().trim().min(1).max(40).default('guardian') })).max(20).optional(),
  specialization: optionalText(120),
});

export const invitationSchema = z.object({
  email,
  role: z.enum(['admin', 'teacher', 'student', 'parent']),
  firstName: name,
  lastName: name,
  details: detailsSchema.default({ specialization: null }),
  message: optionalText(500),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(14),
});

/** Keep only the details that make sense for the role, and check they point at real records. */
async function cleanDetails(role: Role, d: z.infer<typeof detailsSchema>): Promise<InvitationDetails> {
  if (role === 'student') {
    if (d.classId) {
      const cls = await queryOne('SELECT 1 FROM classes WHERE id = $1', [d.classId]);
      if (!cls) throw badRequest('That class no longer exists', { 'details.classId': 'Choose a class' });
    }
    return { classId: d.classId ?? null };
  }
  if (role === 'parent') {
    const children = d.children ?? [];
    if (children.length) {
      const found = await query<{ userId: number }>('SELECT user_id FROM students WHERE user_id = ANY($1)', [children.map((c) => c.studentId)]);
      if (found.length !== new Set(children.map((c) => c.studentId)).size) throw badRequest('One of the children could not be found');
    }
    return { children };
  }
  if (role === 'teacher') return { specialization: d.specialization ?? null };
  return {};
}

export function invitationLink(req: Request, token: string) {
  const origin = config.appUrlConfigured ? config.appUrl : (req.get('origin') ?? config.appUrl);
  return `${origin.replace(/\/$/, '')}/register?token=${encodeURIComponent(token)}`;
}

const ROLE_WORDS: Record<Role, string> = { admin: 'an administrator', teacher: 'a teacher', student: 'a student', parent: 'a parent' };

async function emailInvitation(to: string, firstName: string, role: Role, link: string, expiresAt: string, message: string | null) {
  const school = await loadSettings();
  const days = Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 864e5));
  return sendMail(
    to,
    `${school.name}: create your account`,
    `Hello ${firstName},\n\n${school.name} has invited you to join its school system as ${ROLE_WORDS[role]}.` +
      `${message ? `\n\n"${message}"` : ''}\n\nCreate your account here (the link works once and expires in ${days} days):\n\n${link}\n\n` +
      `If you weren't expecting this, you can ignore this email.\n\n${school.name}`,
  );
}

const loadInvitation = (invitationId: number) => queryOne<Invitation>(`${INVITATION_SELECT} WHERE i.id = $1`, [invitationId]);

invitationsRouter.get('/', async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  const status = String(req.query.status ?? '');
  if (['pending', 'accepted', 'expired', 'revoked'].includes(status)) {
    params.push(status);
    where.push(`${STATUS_SQL} = $${params.length}`);
  }
  if (typeof req.query.role === 'string' && ['admin', 'teacher', 'student', 'parent'].includes(req.query.role)) {
    params.push(req.query.role);
    where.push(`i.role = $${params.length}`);
  }
  const search = String(req.query.search ?? '').trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(i.email ILIKE $${params.length} OR i.first_name || ' ' || i.last_name ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [items, count] = await Promise.all([
    query<Invitation>(`${INVITATION_SELECT} ${whereSql} ORDER BY i.created_at DESC, i.id DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
    queryOne<{ total: number }>(`SELECT COUNT(*)::int AS total FROM invitations i ${whereSql}`, params),
  ]);
  res.json({ items, total: count?.total ?? 0, page, pageSize } satisfies Paginated<Invitation>);
});

invitationsRouter.post('/', async (req, res) => {
  const b = parse(invitationSchema, req.body);
  const existingUser = await queryOne('SELECT 1 FROM users WHERE email = $1', [b.email]);
  if (existingUser) throw conflict('Someone already has an account with that email address', );
  const open = await queryOne(
    'SELECT 1 FROM invitations WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()',
    [b.email],
  );
  if (open) throw conflict('That email address already has an open invitation. Re-send or cancel it instead.');
  const details = await cleanDetails(b.role, b.details);
  const token = newToken();
  const row = await transaction(async (db) => {
    // An expired invitation for the same email is closed so the new one can take its place.
    await query('UPDATE invitations SET revoked_at = now() WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL', [b.email], db);
    return queryOne<{ id: number; expiresAt: string }>(
      `INSERT INTO invitations (token_hash, email, role, first_name, last_name, details, message, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' days')::interval) RETURNING id, expires_at`,
      [hashInviteToken(token), b.email, b.role, b.firstName, b.lastName, JSON.stringify(details), b.message, me(req).id, String(b.expiresInDays)],
      db,
    );
  });
  const link = invitationLink(req, token);
  let emailed = false;
  try {
    emailed = await emailInvitation(b.email, b.firstName, b.role, link, String(row!.expiresAt), b.message);
  } catch (err) {
    console.error('Could not send invitation email:', (err as Error).message);
  }
  await audit(req, { action: 'create', entity: 'invitation', entityId: row!.id, summary: `Invited ${b.firstName} ${b.lastName} as ${b.role}`, details: { emailed } });
  const payload: IssuedInvitation = { invitation: (await loadInvitation(row!.id))!, link, emailed };
  res.status(201).json(payload);
});

/** Issue a fresh link (the old one stops working) and extend the expiry. */
invitationsRouter.post('/:id/resend', async (req, res) => {
  const invitationId = intParam(req.params.id);
  const inv = await loadInvitation(invitationId);
  if (!inv) throw notFound('Invitation');
  if (inv.status === 'accepted') throw conflict('This invitation has already been used to create an account');
  if (inv.status === 'revoked') throw conflict('This invitation was cancelled. Create a new one instead.');
  if (await queryOne('SELECT 1 FROM users WHERE email = $1', [inv.email])) throw conflict('Someone already has an account with that email address');
  const days = parse(z.object({ expiresInDays: z.coerce.number().int().min(1).max(30).default(14) }), req.body ?? {}).expiresInDays;
  const token = newToken();
  const row = await queryOne<{ expiresAt: string }>(
    `UPDATE invitations SET token_hash = $2, expires_at = now() + ($3 || ' days')::interval WHERE id = $1 RETURNING expires_at`,
    [invitationId, hashInviteToken(token), String(days)],
  );
  const link = invitationLink(req, token);
  let emailed = false;
  try {
    emailed = await emailInvitation(inv.email, inv.firstName, inv.role, link, String(row!.expiresAt), inv.message);
  } catch (err) {
    console.error('Could not send invitation email:', (err as Error).message);
  }
  await audit(req, { action: 'update', entity: 'invitation', entityId: invitationId, summary: `Re-sent the invitation for ${inv.firstName} ${inv.lastName}` });
  const payload: IssuedInvitation = { invitation: (await loadInvitation(invitationId))!, link, emailed };
  res.json(payload);
});

/** Cancel an invitation. The link stops working immediately; the record stays for the audit trail. */
invitationsRouter.delete('/:id', async (req, res) => {
  const invitationId = intParam(req.params.id);
  const row = await queryOne<{ firstName: string; lastName: string }>(
    'UPDATE invitations SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING first_name, last_name',
    [invitationId],
  );
  if (!row) {
    const exists = await loadInvitation(invitationId);
    if (!exists) throw notFound('Invitation');
    throw conflict(exists.status === 'accepted' ? 'This invitation has already been used' : 'This invitation is already cancelled');
  }
  await audit(req, { action: 'delete', entity: 'invitation', entityId: invitationId, summary: `Cancelled the invitation for ${row.firstName} ${row.lastName}` });
  res.status(204).end();
});
