import pg from 'pg';
import { config } from '../config.js';

// Return numerics as numbers, bigint counts as numbers, and dates as plain YYYY-MM-DD strings.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => parseFloat(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => parseInt(v, 10));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function camelize<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[camel(key)] = row[key];
  return out as T;
}

type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

/** Run a query and return rows with camelCase keys. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool,
): Promise<T[]> {
  const result = await db.query(text, params);
  return result.rows.map((r) => camelize<T>(r));
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool,
): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

/** Run `fn` inside a transaction; rolls back on any thrown error. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
