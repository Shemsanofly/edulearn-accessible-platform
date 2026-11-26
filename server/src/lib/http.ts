import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: Record<string, string>) => new HttpError(400, msg, details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

/** Parse and validate input with a zod schema, turning issues into a friendly 400. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!details[key]) details[key] = issue.message;
  }
  const first = Object.entries(details)[0];
  const message = first ? (first[0] === '_' ? first[1] : `${first[0]}: ${first[1]}`) : 'Invalid input';
  throw badRequest(message, details);
}

export const intParam = (value: unknown, name = 'id'): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}`);
  return n;
};

export function pageParams(q: Request['query']) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  const pgErr = err as { code?: string; constraint?: string; detail?: string };
  // Map common PostgreSQL errors to helpful messages.
  if (pgErr.code === '23505') {
    const field = /\((.+?)\)=/.exec(pgErr.detail ?? '')?.[1] ?? 'value';
    res.status(409).json({ error: `That ${field.replace(/_/g, ' ')} is already in use` });
    return;
  }
  if (pgErr.code === '23503') {
    res.status(409).json({ error: 'This record is linked to other data and cannot be changed that way' });
    return;
  }
  if (pgErr.code === '23514' || pgErr.code === '22P02' || pgErr.code === '22007' || pgErr.code === '22008') {
    res.status(400).json({ error: 'Some of the values provided are not valid' });
    return;
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

/** Keep only the keys the client actually sent, so PATCH never clears fields by accident. */
export function provided<T extends object>(parsed: T, raw: unknown): Partial<T> {
  const r = (raw ?? {}) as object;
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => Object.hasOwn(r, k))) as Partial<T>;
}

/**
 * Build a safe ORDER BY from ?sort=key&dir=asc|desc. Only keys in `columns` are accepted, so user
 * input never reaches SQL directly; anything else falls back to `fallback`.
 */
export function orderBy(q: Request['query'], columns: Record<string, string>, fallback: string, tiebreak = ''): string {
  const key = typeof q.sort === 'string' ? q.sort : '';
  const column = Object.hasOwn(columns, key) ? columns[key] : null;
  if (!column) return `ORDER BY ${fallback}`;
  const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${dir} NULLS LAST${tiebreak ? `, ${tiebreak}` : ''}`;
}
