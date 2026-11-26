import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role, SessionUser } from '../../../shared/types.js';
import { config } from '../config.js';
import { queryOne } from '../db/pool.js';
import { forbidden, HttpError } from '../lib/http.js';
import { PHOTO_URL } from '../lib/sql.js';

export const SESSION_COOKIE = 'edulearn_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** `version` is users.session_version; bumping it in the database signs the user out everywhere. */
export function issueSession(res: Response, userId: number, version: number) {
  const token = jwt.sign({ sub: String(userId), ver: version }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
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
  SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.phone, u.preferences, ${PHOTO_URL} AS photo_url
  FROM users u WHERE u.id = $1 AND u.is_active`;

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw new HttpError(401, 'Please sign in to continue');
  let userId: number;
  let version: number;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    userId = Number(payload.sub);
    version = Number(payload.ver ?? 1);
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
  const user = await queryOne<SessionUser & { sessionVersion: number }>(
    SESSION_USER_SQL.replace('AS photo_url', 'AS photo_url, u.session_version'),
    [userId],
  );
  if (!user) throw new HttpError(401, 'Your account is no longer active');
  if (user.sessionVersion !== version) throw new HttpError(401, 'You were signed out because your password changed. Please sign in again.');
  delete (user as Partial<typeof user>).sessionVersion;
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
