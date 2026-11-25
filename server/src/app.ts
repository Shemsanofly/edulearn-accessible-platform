import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { errorHandler, notFound } from './lib/http.js';
import { requireAuth } from './middleware/auth.js';
import { academicsRouter } from './routes/academics.js';
import { assessmentsRouter, gradebookRouter } from './routes/assessments.js';
import { attendanceRouter } from './routes/attendance.js';
import { authRouter } from './routes/auth.js';
import { communicationRouter } from './routes/communication.js';
import { dashboardRouter } from './routes/dashboard.js';
import { feesRouter } from './routes/fees.js';
import { parentsRouter } from './routes/parents.js';
import { studentsRouter } from './routes/students.js';
import { teachersRouter } from './routes/teachers.js';
import { usersRouter } from './routes/users.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use(requireAuth);
  api.use('/', dashboardRouter);
  api.use('/students', studentsRouter);
  api.use('/teachers', teachersRouter);
  api.use('/parents', parentsRouter);
  api.use('/users', usersRouter);
  api.use('/', academicsRouter);
  api.use('/attendance', attendanceRouter);
  api.use('/assessments', assessmentsRouter);
  api.use('/gradebook', gradebookRouter);
  api.use('/fees', feesRouter);
  api.use('/', communicationRouter);
  api.use(() => {
    throw notFound('Endpoint');
  });
  app.use('/api', api);

  // In production the server also hosts the built React app.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
