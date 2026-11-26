import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../db/pool.js';
import { badRequest, intParam, notFound, parse } from '../lib/http.js';
import { hashPassword, temporaryPassword } from '../lib/passwords.js';
import { audit } from '../lib/audit.js';
import { me, requireRole } from '../middleware/auth.js';

/** Account-level admin actions that apply to every role. */
export const usersRouter = Router();
usersRouter.use(requireRole('admin'));

usersRouter.post('/:id/reset-password', async (req, res) => {
  const id = intParam(req.params.id);
  const temp = temporaryPassword();
  const row = await queryOne<{ name: string }>(
    `UPDATE users SET password_hash = $2, session_version = session_version + 1, updated_at = now() WHERE id = $1
     RETURNING first_name || ' ' || last_name AS name`,
    [id, await hashPassword(temp)],
  );
  if (!row) throw notFound('User');
  await audit(req, { action: 'reset_password', entity: 'user', entityId: id, summary: `Reset the password for ${row.name}` });
  res.json({ temporaryPassword: temp });
});

usersRouter.patch('/:id/status', async (req, res) => {
  const id = intParam(req.params.id);
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  if (id === me(req).id && !isActive) throw badRequest("You can't deactivate your own account");
  const row = await queryOne<{ name: string }>(
    `UPDATE users SET is_active = $2, session_version = session_version + CASE WHEN $2 THEN 0 ELSE 1 END, updated_at = now()
      WHERE id = $1 RETURNING first_name || ' ' || last_name AS name`,
    [id, isActive],
  );
  if (!row) throw notFound('User');
  await audit(req, { action: isActive ? 'activate' : 'deactivate', entity: 'user', entityId: id, summary: `${isActive ? 'Reactivated' : 'Deactivated'} ${row.name}` });
  res.status(204).end();
});
