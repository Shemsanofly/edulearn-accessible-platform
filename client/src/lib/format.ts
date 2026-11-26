import type { AttendanceStatus, InvoiceStatus, Role } from '../../../shared/types';

let currency = 'TZS';
let locale = 'en-GB';
let language: 'en' | 'sw' = 'en';
export const setCurrency = (c: string) => {
  currency = c;
};
/** Called by the i18n provider; all formatting below follows the chosen language. */
export const setFormatLocale = (l: string, lang: 'en' | 'sw') => {
  locale = l;
  language = lang;
};
export const currentLanguage = () => language;

const parseDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const formatDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? parseDay(iso).toLocaleDateString(locale, opts) : '—';

export const formatShortDate = (iso: string | null | undefined) => formatDate(iso, { day: 'numeric', month: 'short' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** "in 3 days", "yesterday", "2 hours ago" */
export function relativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const isDay = iso.length === 10;
  if (isDay) {
    const diff = Math.round((parseDay(iso).getTime() - parseDay(todayIso()).getTime()) / 864e5);
    if (Math.abs(diff) < 7) return rtf.format(diff, 'day');
    if (Math.abs(diff) < 60) return rtf.format(Math.round(diff / 7), 'week');
    return formatDate(iso);
  }
  const secs = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(secs);
  if (abs < 60) return language === 'sw' ? 'sasa hivi' : 'just now';
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(secs / 86400), 'day');
  return formatDate(iso.slice(0, 10));
}

export const daysUntil = (iso: string) => Math.round((parseDay(iso).getTime() - parseDay(todayIso()).getTime()) / 864e5);

/** Money in the school's currency, e.g. "TZS 450,000" (English) or "TSh 450,000" (Kiswahili). */
export const money = (n: number) => {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
};

export const number = (n: number) => new Intl.NumberFormat(locale).format(n);

export const percent = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`);

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');

let gradeBands: { grade: string; minPercent: number }[] = [];
/** Use the school's default grading scale for letter grades (set once after sign-in). */
export const setGradeBands = (bands: { grade: string; minPercent: number }[]) => {
  gradeBands = [...bands].sort((a, b) => b.minPercent - a.minPercent);
};

/** Letter grade from the school's grading scale (CSEE by default); falls back to A–E in 10% steps. */
export function letterGrade(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '—';
  if (gradeBands.length) return (gradeBands.find((b) => pct >= b.minPercent) ?? gradeBands[gradeBands.length - 1]!).grade;
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'E';
}

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

export const gradeTone = (pct: number | null | undefined): Tone =>
  pct === null || pct === undefined ? 'neutral' : pct >= 80 ? 'success' : pct >= 65 ? 'primary' : pct >= 50 ? 'warning' : 'danger';

export const attendanceTone = (rate: number | null | undefined): Tone =>
  rate === null || rate === undefined ? 'neutral' : rate >= 95 ? 'success' : rate >= 90 ? 'primary' : rate >= 80 ? 'warning' : 'danger';

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; tone: Tone; key: string }> = {
  present: { label: 'Present', tone: 'success', key: 'P' },
  late: { label: 'Late', tone: 'warning', key: 'L' },
  absent: { label: 'Absent', tone: 'danger', key: 'A' },
  excused: { label: 'Excused', tone: 'info', key: 'E' },
};

export const INVOICE_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'success' },
  partial: { label: 'Part paid', tone: 'info' },
  unpaid: { label: 'Unpaid', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
};

export const ROLE_META: Record<Role, { label: string; color: string }> = {
  admin: { label: 'Administrator', color: 'var(--role-admin)' },
  teacher: { label: 'Teacher', color: 'var(--role-teacher)' },
  student: { label: 'Student', color: 'var(--role-student)' },
  parent: { label: 'Parent', color: 'var(--role-parent)' },
};

const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SW = ['Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi', 'Jumapili'];
/** Day names in the current language, Monday first (index 0 = ISO day 1). */
export const DAYS = new Proxy(DAYS_EN, { get: (target, prop) => Reflect.get(language === 'sw' ? DAYS_SW : target, prop) }) as string[];

/** "Form 2" / "Kidato cha 2" (or "Standard 3" / "Darasa la 3"), using the school's level label. */
export function levelName(level: number, label = 'Form') {
  if (language === 'sw') {
    const l = label.toLowerCase();
    if (l === 'form') return `Kidato cha ${level}`;
    if (l === 'standard' || l === 'grade' || l === 'class') return `Darasa la ${level}`;
  }
  return `${label} ${level}`;
}
export const isoWeekday = () => ((new Date().getDay() + 6) % 7) + 1;

/** Stable pleasant colour for an avatar based on a name. */
export function colorFor(name: string): string {
  const palette = ['#4361ee', '#7209b7', '#2a9d8f', '#e85d04', '#c2185b', '#0077b6', '#6a4c93', '#15803d', '#b45309', '#3a0ca3'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;
