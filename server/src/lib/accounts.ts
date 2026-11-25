import type pg from 'pg';
import type { Role } from '../../../shared/types.js';
import { queryOne } from '../db/pool.js';
import { hashPassword, temporaryPassword } from './passwords.js';

interface NewUser {
  email: string;
  password?: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string | null;
  isActive?: boolean;
}

/** Insert a user row; generates a temporary password when none is given. */
export async function createUser(db: pg.PoolClient, input: NewUser) {
  const temp = input.password ? null : temporaryPassword();
  const row = await queryOne<{ id: number }>(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.email, await hashPassword(input.password ?? temp!), input.role, input.firstName, input.lastName,
      input.phone ?? null, input.isActive ?? true],
    db,
  );
  return { id: row!.id, temporaryPassword: temp };
}

export async function updateUser(
  db: pg.PoolClient,
  id: number,
  input: Partial<Omit<NewUser, 'role'>>,
) {
  await queryOne(
    `UPDATE users SET
       email      = COALESCE($2, email),
       first_name = COALESCE($3, first_name),
       last_name  = COALESCE($4, last_name),
       phone      = CASE WHEN $5::boolean THEN $6 ELSE phone END,
       is_active  = COALESCE($7, is_active),
       password_hash = COALESCE($8, password_hash),
       updated_at = now()
     WHERE id = $1`,
    [id, input.email ?? null, input.firstName ?? null, input.lastName ?? null, input.phone !== undefined,
      input.phone ?? null, input.isActive ?? null, input.password ? await hashPassword(input.password) : null],
    db,
  );
}

/** Next sequential code like STU-2026-0042. */
export async function nextCode(db: pg.PoolClient, table: 'students' | 'teachers', column: string, prefix: string) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const row = await queryOne<{ max: number | null }>(
    `SELECT MAX(split_part(${column}, '-', 3)::int) AS max FROM ${table} WHERE ${column} LIKE $1 AND split_part(${column}, '-', 3) ~ '^\\d+$'`,
    [like],
    db,
  );
  return `${prefix}-${year}-${String((row?.max ?? 0) + 1).padStart(4, '0')}`;
}
