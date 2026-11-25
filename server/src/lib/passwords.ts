import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';

const ROUNDS = config.isTest ? 4 : 11;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Readable temporary password, e.g. "maple-river-4821". */
export function temporaryPassword(): string {
  const words = ['maple', 'river', 'cloud', 'tiger', 'amber', 'cedar', 'lunar', 'coral', 'pixel', 'orbit',
    'meadow', 'harbor', 'summit', 'falcon', 'willow', 'ember', 'aspen', 'delta', 'nova', 'quartz'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 10000)}`;
}
