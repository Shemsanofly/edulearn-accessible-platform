import type { Request } from 'express';
import type pg from 'pg';
import { pool, query } from '../db/pool.js';

export interface AuditInput {
  action:
    | 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'reset_password' | 'activate' | 'deactivate'
    | 'payment' | 'apply' | 'remind' | 'settings';
  entity: string;
  entityId?: string | number | null;
  summary: string;
  details?: Record<string, unknown>;
}

/** Record an important administrative action. Never throws: auditing must not break the request. */
export async function audit(req: Request, entry: AuditInput, db: Pick<pg.Pool, 'query'> | pg.PoolClient = pool) {
  const user = req.user;
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, entity, entity_id, summary, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user?.id ?? null, user ? `${user.firstName} ${user.lastName}` : null, entry.action, entry.entity,
        entry.entityId == null ? null : String(entry.entityId), entry.summary,
        entry.details ? JSON.stringify(entry.details) : null, req.ip ?? null],
      db,
    );
  } catch (err) {
    console.error('Audit log write failed:', (err as Error).message);
  }
}
