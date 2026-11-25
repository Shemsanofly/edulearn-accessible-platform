import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role, SessionUser } from '../../../shared/types.js';
import { config } from '../config.js';
import { queryOne } from '../db/pool.js';
import { forbidden, HttpError } from '../lib/http.js';

export const SESSION_COOKIE = 'edulearn_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function issueSession(res: Response, userId: number) {
  const token = jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export const SESSION_USER_SQL = `
  SELECT id, email, role, first_name, last_name, phone, preferences
  FROM users WHERE id = $1 AND is_active`;

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw new HttpError(401, 'Please sign in to continue');
  let userId: number;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    userId = Number(payload.sub);
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
  const user = await queryOne<SessionUser>(SESSION_USER_SQL, [userId]);
  if (!user) throw new HttpError(401, 'Your account is no longer active');
  req.user = user;
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };

/** The signed-in user; only call after requireAuth. */
export function me(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'Please sign in to continue');
  return req.user;
}
