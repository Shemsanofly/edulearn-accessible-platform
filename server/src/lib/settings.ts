import type { SchoolSettings } from '../../../shared/types.js';
import { queryOne } from '../db/pool.js';

let cache: { value: SchoolSettings; at: number } | null = null;

/** The school's configuration. Cached briefly because almost every page needs it. */
export async function loadSettings(): Promise<SchoolSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await queryOne<SchoolSettings & { logoVersion: number | null }>(
    `SELECT s.name, s.motto, s.address, s.phone, s.email, s.website, s.currency, s.default_language,
            s.level_label, s.is_demo, extract(epoch FROM l.updated_at)::bigint AS logo_version
       FROM school_settings s LEFT JOIN school_logo l ON l.id = 1 WHERE s.id = 1`,
  );
  const { logoVersion, ...settings } = row!;
  const value: SchoolSettings = { ...settings, logoUrl: logoVersion ? `/api/school/logo?v=${logoVersion}` : null };
  cache = { value, at: Date.now() };
  return value;
}

export const invalidateSettings = () => {
  cache = null;
};
