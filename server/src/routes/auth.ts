import { Router, type Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { Notifications, SessionUser } from '../../../shared/types.js';
import { config } from '../config.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { HttpError, parse } from '../lib/http.js';
import { notifyWhere } from '../lib/notify.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { phone } from '../lib/phone.js';
import { loadSettings } from '../lib/settings.js';
import { email, password } from '../lib/validators.js';
import { clearSession, issueSession, me, requireAuth, SESSION_COOKIE, SESSION_USER_SQL } from '../middleware/auth.js';

export const authRouter = Router();

const limiter = (limit: number, message: string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 1000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: message },
  });

/**
 * Only failed sign-ins count, per network address + email. A whole class signing in from the school's
 * shared internet connection is never blocked, but guessing one account's password is.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts for this account. Please wait 15 minutes or use “Forgot password”.' },
});
const resetLimiter = limiter(5, 'Too many reset requests. Please wait a few minutes and try again.');

authRouter.post('/login', loginLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1, 'Enter your password') }), req.body);
  const row = await queryOne<{ id: number; passwordHash: string; isActive: boolean; sessionVersion: number }>(
    'SELECT id, password_hash, is_active, session_version FROM users WHERE email = $1',
    [body.email],
  );
  // Same message for unknown email and wrong password, so accounts can't be discovered.
  if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
    throw new HttpError(401, 'That email and password combination is not right');
  }
  if (!row.isActive) throw new HttpError(403, 'This account has been deactivated. Please contact the school office.');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
  issueSession(res, row.id, row.sessionVersion);
  const user = await queryOne<SessionUser>(SESSION_USER_SQL, [row.id]);
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

/** Returns `user: null` instead of 401 when signed out, so the app can check quietly on load. */
authRouter.get('/me', async (req, res) => {
  const school = await loadSettings();
  if (!req.cookies?.[SESSION_COOKIE]) {
    res.json({ user: null, school });
    return;
  }
  try {
    await requireAuth(req, res, () => {});
    res.json({ user: me(req), school });
  } catch {
    clearSession(res);
    res.json({ user: null, school });
  }
});

authRouter.get('/notifications', requireAuth, async (req, res) => {
  const row = await queryOne<Notifications>(
    `SELECT (SELECT COUNT(*)::int FROM messages WHERE recipient_id = $1 AND read_at IS NULL) AS unread_messages,
            (SELECT COUNT(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL) AS unread_notifications`,
    [me(req).id],
  );
  res.json(row);
});

authRouter.patch('/profile', requireAuth, async (req, res) => {
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
      phone: phone.optional(),
      preferences: z
        .object({
          theme: z.enum(['light', 'dark', 'system']).optional(),
          accent: z.enum(['navy', 'indigo', 'ocean', 'forest', 'sunset', 'grape', 'rose']).optional(),
          language: z.enum(['en', 'sw']).optional(),
          fontScale: z.number().min(0.875).max(1.5).optional(),
          highContrast: z.boolean().optional(),
          reducedMotion: z.boolean().optional(),
          dyslexiaFont: z.boolean().optional(),
        })
        .optional(),
    }),
    req.body,
  );
  const user = me(req);
  const phoneSent = Object.hasOwn(req.body ?? {}, 'phone');
  await query(
    `UPDATE users SET
       first_name  = COALESCE($2, first_name),
       last_name   = COALESCE($3, last_name),
       phone       = CASE WHEN $4::boolean THEN $5 ELSE phone END,
       preferences = preferences || COALESCE($6::jsonb, '{}'::jsonb),
       updated_at  = now()
     WHERE id = $1`,
    [user.id, body.firstName ?? null, body.lastName ?? null, phoneSent, body.phone ?? null,
      body.preferences ? JSON.stringify(body.preferences) : null],
  );
  res.json({ user: await queryOne<SessionUser>(SESSION_USER_SQL, [user.id]) });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
  const user = me(req);
  const row = await queryOne<{ passwordHash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
    throw new HttpError(400, 'Your current password is not correct', { currentPassword: 'Incorrect password' });
  }
  // Bump the session version: other devices are signed out, this one gets a fresh session.
  const updated = await queryOne<{ sessionVersion: number }>(
    'UPDATE users SET password_hash = $2, session_version = session_version + 1, updated_at = now() WHERE id = $1 RETURNING session_version',
    [user.id, await hashPassword(body.newPassword)],
  );
  issueSession(res, user.id, updated!.sessionVersion);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------
const RESET_MINUTES = 30;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

async function sendResetEmail(to: string, name: string, link: string) {
  if (!config.smtp) return false;
  const school = await loadSettings();
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject: `${school.name}: reset your password`,
    text: `Hello ${name},\n\nUse this link to choose a new password. It works once and expires in ${RESET_MINUTES} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.\n\n${school.name}`,
  });
  return true;
}

const resetLink = (req: Request, token: string) => {
  const origin = req.get('origin') ?? config.appUrl;
  return `${origin}/reset-password?token=${token}`;
};

/**
 * Always answers the same way, so it can't be used to discover which emails have accounts.
 * With SMTP configured the user gets an email; otherwise the school office is notified and can reset it.
 */
authRouter.post('/forgot-password', resetLimiter, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const user = await queryOne<{ id: number; firstName: string; lastName: string; role: string }>(
    'SELECT id, first_name, last_name, role FROM users WHERE email = $1 AND is_active',
    [body.email],
  );
  let emailed = false;
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [user.id, hashToken(token), String(RESET_MINUTES)],
    );
    const link = resetLink(req, token);
    try {
      emailed = await sendResetEmail(body.email, user.firstName, link);
    } catch (err) {
      console.error('Could not send reset email:', (err as Error).message);
    }
    if (!emailed) {
      if (!config.isProduction && !config.isTest) console.log(`[dev] Password reset link for ${body.email}: ${link}`);
      await notifyWhere(
        "SELECT id FROM users WHERE role = 'admin' AND is_active",
        [],
        {
          type: 'system',
          title: `${user.firstName} ${user.lastName} asked to reset their password`,
          body: `Open their record and use "Reset password" to give them a temporary password (${user.role}).`,
          link: user.role === 'student' ? `/students/${user.id}` : user.role === 'teacher' ? `/teachers?focus=${user.id}` : user.role === 'parent' ? `/parents?search=${encodeURIComponent(user.firstName)}` : '/settings',
        },
      );
    }
  }
  res.json({
    ok: true,
    delivery: config.smtp ? 'email' : 'office',
  });
});

authRouter.post('/reset-password', resetLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(20).max(200), password }), req.body);
  await transaction(async (db) => {
    const reset = await queryOne<{ id: number; userId: number }>(
      `SELECT pr.id, pr.user_id FROM password_resets pr JOIN users u ON u.id = pr.user_id
        WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now() AND u.is_active FOR UPDATE OF pr`,
      [hashToken(body.token)],
      db,
    );
    if (!reset) throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');
    await query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [reset.userId], db);
    await query(
      'UPDATE users SET password_hash = $2, session_version = session_version + 1, updated_at = now() WHERE id = $1',
      [reset.userId, await hashPassword(body.password)],
      db,
    );
    await audit(req, { action: 'reset_password', entity: 'user', entityId: reset.userId, summary: 'Password reset with an emailed link' }, db);
  });
  res.status(204).end();
});
