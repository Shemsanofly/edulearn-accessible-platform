import type pg from 'pg';
import type { NotificationType } from '../../../shared/types.js';
import { pool, query } from '../db/pool.js';

type Db = Pick<pg.Pool, 'query'> | pg.PoolClient;

export interface NewNotification {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

/** Send the same notification to many users in one statement. */
export async function notifyUsers(userIds: number[], n: NewNotification, db: Db = pool) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  await query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     SELECT u.id, $2, $3, $4, $5 FROM users u WHERE u.id = ANY($1) AND u.is_active`,
    [ids, n.type, n.title, n.body ?? null, n.link ?? null],
    db,
  );
}

/** Notify everyone selected by a SQL query that returns a single `id` column. */
export async function notifyWhere(sql: string, params: unknown[], n: NewNotification, db: Db = pool) {
  const p = params.length;
  await query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     SELECT DISTINCT x.id, $${p + 1}::notification_type, $${p + 2}, $${p + 3}, $${p + 4} FROM (${sql}) x`,
    [...params, n.type, n.title, n.body ?? null, n.link ?? null],
    db,
  );
}

/** Active parents/guardians of the given students, keyed by student. */
export async function guardiansOf(studentIds: number[], db: Db = pool): Promise<Map<number, number[]>> {
  const rows = await query<{ studentId: number; parentId: number }>(
    `SELECT g.student_id, g.parent_id FROM guardians g JOIN users u ON u.id = g.parent_id
      WHERE g.student_id = ANY($1) AND u.is_active`,
    [studentIds],
    db,
  );
  const map = new Map<number, number[]>();
  for (const r of rows) map.set(r.studentId, [...(map.get(r.studentId) ?? []), r.parentId]);
  return map;
}
