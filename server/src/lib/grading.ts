import type { GradeBand, GradingScale } from '../../../shared/types.js';
import { query, queryOne } from '../db/pool.js';

/** A grading scale with its bands; the default scale when `scaleId` is null. */
export async function loadScale(scaleId: number | null): Promise<GradingScale | null> {
  const scale = scaleId
    ? await queryOne<Omit<GradingScale, 'bands'>>('SELECT id, name, description, is_default FROM grading_scales WHERE id = $1', [scaleId])
    : await queryOne<Omit<GradingScale, 'bands'>>('SELECT id, name, description, is_default FROM grading_scales ORDER BY is_default DESC, id LIMIT 1');
  if (!scale) return null;
  const bands = await query<GradeBand>(
    'SELECT grade, min_percent, max_percent, points, remark FROM grade_bands WHERE scale_id = $1 ORDER BY min_percent DESC',
    [scale.id],
  );
  return { ...scale, bands };
}

/** The band a percentage falls in. Compared by each band's minimum so gaps like 74.5 still resolve. */
export function bandFor(percent: number | null, bands: GradeBand[]): GradeBand | null {
  if (percent === null || Number.isNaN(percent)) return null;
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => percent >= b.minPercent) ?? sorted[sorted.length - 1] ?? null;
}

/** Validate bands: unique letters, no overlaps, covering 0–100. Returns an error message or null. */
export function checkBands(bands: GradeBand[]): string | null {
  if (!bands.length) return 'Add at least one grade';
  const letters = new Set(bands.map((b) => b.grade.trim().toUpperCase()));
  if (letters.size !== bands.length) return 'Each grade must be different';
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (sorted[0]!.minPercent > 0) return 'The lowest grade must start at 0%';
  if (sorted[sorted.length - 1]!.maxPercent < 100) return 'The highest grade must reach 100%';
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.minPercent <= sorted[i - 1]!.maxPercent) {
      return `Grades ${sorted[i - 1]!.grade} and ${sorted[i]!.grade} overlap`;
    }
  }
  return null;
}
