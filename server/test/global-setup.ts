import { dropAll, migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { seedSampleSchool } from '../src/db/seed.js';

/** Build a fresh, seeded test database once before the suite runs. */
export default async function setup() {
  await dropAll();
  await migrate(() => {});
  await seedSampleSchool({ quiet: true });
  await pool.end();
}
