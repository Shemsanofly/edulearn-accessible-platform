import { dropAll, migrate } from './migrate.js';
import { pool, query, transaction } from './pool.js';
import { KNOWN_DEMO_EMAIL_PATTERN, seedSampleSchool, setupSchool } from './seed.js';
import { invalidateSettings } from '../lib/settings.js';

const [command, ...flags] = process.argv.slice(2);

/**
 * Turn off the shared demo accounts that earlier versions created (…@edulearn.school,
 * …@students.edulearn.school, …@parents.edulearn.school). Nothing is deleted: accounts are only
 * deactivated and signed out everywhere, so they can be re-enabled by an administrator if needed.
 */
async function deactivateDemo(apply: boolean) {
  const rows = await query<{ id: number; email: string; role: string; isActive: boolean }>(
    `SELECT id, email, role, is_active FROM users WHERE email::text ~* $1 ORDER BY role, email`,
    [KNOWN_DEMO_EMAIL_PATTERN],
  );
  const active = rows.filter((r) => r.isActive);
  console.log(`Found ${rows.length} demo account(s), ${active.length} still active.`);
  for (const r of active.slice(0, 15)) console.log(`  ${r.role.padEnd(8)} ${r.email}`);
  if (active.length > 15) console.log(`  … and ${active.length - 15} more`);
  if (!apply) {
    console.log('\nDry run — nothing changed. Run again with --apply to deactivate these accounts.');
    return;
  }
  await transaction(async (db) => {
    await query(
      `UPDATE users SET is_active = false, session_version = session_version + 1, updated_at = now()
        WHERE email::text ~* $1 AND is_active`,
      [KNOWN_DEMO_EMAIL_PATTERN],
      db,
    );
    await query('UPDATE school_settings SET is_demo = false WHERE id = 1', [], db);
    await query(
      `INSERT INTO audit_logs (actor_name, action, entity, summary, details)
       VALUES ('System (command line)', 'deactivate', 'user', $1, $2)`,
      [`Deactivated ${active.length} demo account(s)`, JSON.stringify({ emails: active.map((a) => a.email) })],
      db,
    );
  });
  invalidateSettings();
  console.log(`Deactivated ${active.length} account(s). No records were deleted.`);
}

async function run() {
  switch (command) {
    case 'migrate':
      await migrate();
      console.log('Database is up to date.');
      break;
    case 'setup':
    case 'seed':
      await migrate();
      await setupSchool();
      break;
    case 'sample':
      await migrate();
      await seedSampleSchool();
      break;
    case 'deactivate-demo':
      await migrate();
      await deactivateDemo(flags.includes('--apply'));
      break;
    case 'reset':
      if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
      await dropAll();
      await migrate();
      console.log('Database emptied and migrated. Run `setup` (or `sample` for local development) next.');
      break;
    default:
      console.log('Usage: cli.ts <migrate | setup | sample | deactivate-demo [--apply] | reset>');
      process.exitCode = 1;
  }
}

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
