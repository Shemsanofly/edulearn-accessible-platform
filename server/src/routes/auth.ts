import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Notifications, SessionUser } from '../../../shared/types.js';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { HttpError, parse } from '../lib/http.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { email, password } from '../lib/validators.js';
import { clearSession, issueSession, me, requireAuth, SESSION_USER_SQL } from '../middleware/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1, 'Enter your password') }), req.body);
  const row = await queryOne<{ id: number; passwordHash: string; isActive: boolean }>(
    'SELECT id, password_hash, is_active FROM users WHERE email = $1',
    [body.email],
  );
  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
    throw new HttpError(401, 'That email and password combination is not right');
  }
  if (!row.isActive) throw new HttpError(403, 'This account has been deactivated. Please contact the school office.');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
  issueSession(res, row.id);
  const user = await queryOne<SessionUser>(SESSION_USER_SQL, [row.id]);
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: me(req), school: { name: config.schoolName, currency: config.currency } });
});

authRouter.get('/notifications', requireAuth, async (req, res) => {
  const row = await queryOne<Notifications>(
    'SELECT COUNT(*)::int AS unread_messages FROM messages WHERE recipient_id = $1 AND read_at IS NULL',
    [me(req).id],
  );
  res.json(row);
});

authRouter.patch('/profile', requireAuth, async (req, res) => {
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
      phone: z.string().trim().max(40).nullish(),
      preferences: z
        .object({
          theme: z.enum(['light', 'dark', 'system']).optional(),
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
  await query(
    `UPDATE users SET
       first_name  = COALESCE($2, first_name),
       last_name   = COALESCE($3, last_name),
       phone       = CASE WHEN $4::boolean THEN $5 ELSE phone END,
       preferences = preferences || COALESCE($6::jsonb, '{}'::jsonb),
       updated_at  = now()
     WHERE id = $1`,
    [user.id, body.firstName ?? null, body.lastName ?? null, body.phone !== undefined, body.phone || null,
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
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [user.id, await hashPassword(body.newPassword)]);
  res.status(204).end();
});
