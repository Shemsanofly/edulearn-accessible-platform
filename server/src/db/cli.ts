import { dropAll, migrate } from './migrate.js';
import { pool } from './pool.js';
import { seed } from './seed.js';

const command = process.argv[2];

async function run() {
  switch (command) {
    case 'migrate':
      await migrate();
      console.log('Database is up to date.');
      break;
    case 'seed':
      await migrate();
      await seed();
      break;
    case 'reset':
      await dropAll();
      await migrate();
      await seed();
      break;
    default:
      console.log('Usage: cli.ts <migrate|seed|reset>');
      process.exitCode = 1;
  }
}

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
