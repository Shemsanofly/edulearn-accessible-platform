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
  schoolName: env.SCHOOL_NAME ?? 'EduLearn Academy',
  currency: env.CURRENCY ?? 'USD',
} as const;
