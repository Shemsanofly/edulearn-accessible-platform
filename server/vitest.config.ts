import { defineConfig } from 'vitest/config';

// Set before anything imports the db pool, so global setup and test workers both use the test database.
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://edulearn:edulearn@localhost:5432/edulearn_test',
  JWT_SECRET: 'test-secret-test-secret-test-secret',
};
Object.assign(process.env, env);

export default defineConfig({
  test: {
    environment: 'node',
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    globalSetup: './test/global-setup.ts',
    env,
  },
});
