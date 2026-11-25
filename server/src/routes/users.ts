import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../db/pool.js';
import { badRequest, intParam, notFound, parse } from '../lib/http.js';
import { hashPassword, temporaryPassword } from '../lib/passwords.js';
import { me, requireRole } from '../middleware/auth.js';

/** Account-level admin actions that apply to every role. */
export const usersRouter = Router();
usersRouter.use(requireRole('admin'));

usersRouter.post('/:id/reset-password', async (req, res) => {
  const id = intParam(req.params.id);
  const temp = temporaryPassword();
  const row = await queryOne('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id', [id, await hashPassword(temp)]);
  if (!row) throw notFound('User');
  res.json({ temporaryPassword: temp });
});

usersRouter.patch('/:id/status', async (req, res) => {
  const id = intParam(req.params.id);
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  if (id === me(req).id && !isActive) throw badRequest("You can't deactivate your own account");
  const row = await queryOne('UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id', [id, isActive]);
  if (!row) throw notFound('User');
  res.status(204).end();
});
