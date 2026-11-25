import { z } from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use the format HH:MM');
export const id = z.coerce.number().int().positive();
export const name = z.string().trim().min(1, 'Required').max(80);
export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);
export const password = z.string().min(8, 'Password must be at least 8 characters').max(200);
export const optionalText = (max = 500) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
