const env = process.env;

const isProduction = env.NODE_ENV === 'production';

if (isProduction && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

export const config = {
  isProduction,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://edulearn:edulearn@localhost:5432/edulearn',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-change-me-dev-only-secret',
  sessionDays: Number(env.SESSION_DAYS ?? 7),
  /** Public address of the app, used in password-reset emails. */
  appUrl: env.APP_URL ?? 'http://localhost:5173',
  /** True when APP_URL was set explicitly; links in emails then always use it rather than the request's Origin. */
  appUrlConfigured: !!env.APP_URL,
  /** Optional SMTP settings for password-reset emails. Without them, resets go through the school office. */
  smtp: env.SMTP_HOST
    ? {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM ?? env.SMTP_USER ?? 'no-reply@example.com',
      }
    : null,
} as const;
