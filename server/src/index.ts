import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';

async function main() {
  await migrate((msg) => console.log(msg));
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`🎓 ${config.schoolName} API listening on http://localhost:${config.port}`);
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
