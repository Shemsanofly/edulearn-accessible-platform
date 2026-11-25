import request from 'supertest';
import { createApp } from '../src/app.js';
import { queryOne } from '../src/db/pool.js';

export const app = createApp();

/** Sign in as a demo user and return an agent that keeps the session cookie. */
export async function signIn(email: string, password = 'password123') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export const idOf = async (email: string) =>
  (await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]))!.id;
