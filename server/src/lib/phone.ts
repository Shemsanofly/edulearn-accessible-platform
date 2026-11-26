import { z } from 'zod';

/**
 * Normalise Tanzanian numbers to "+255 777 123 456". Accepts 0777123456, 777123456, 255777123456
 * and +255 777 123 456. Other international numbers (starting with +) are kept as typed.
 * Returns '' for something that isn't a phone number, null for blank input.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  let local: string | null = null;
  if (/^\+255\d{9}$/.test(digits)) local = digits.slice(4);
  else if (/^255\d{9}$/.test(digits)) local = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) local = digits.slice(1);
  else if (/^[67]\d{8}$/.test(digits)) local = digits;
  if (local) return `+255 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  if (/^\+\d{7,15}$/.test(digits)) return raw.replace(/\s+/g, ' ');
  return '';
}

/** Optional phone field: blank becomes null; anything else must be a valid number. */
export const phone = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 0777 123 456 or +255 777 123 456' });
      return z.NEVER;
    }
    return n;
  });
