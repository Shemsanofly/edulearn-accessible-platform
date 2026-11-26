import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool, query } from './db/pool.js';

async function main() {
  await migrate((msg) => console.log(msg));
  // Older versions configured the school through SCHOOL_NAME / CURRENCY. Carry those over once.
  if (process.env.SCHOOL_NAME || process.env.CURRENCY) {
    await query(
      `UPDATE school_settings SET name = COALESCE($1, name), currency = COALESCE($2, currency)
        WHERE id = 1 AND name = 'My School'`,
      [process.env.SCHOOL_NAME || null, process.env.CURRENCY?.toUpperCase() || null],
    );
  }
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`🎓 EduLearn API listening on http://localhost:${config.port}`);
  });
  const shutdown = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
