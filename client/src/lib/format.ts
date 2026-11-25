import type { AttendanceStatus, InvoiceStatus, Role } from '../../../shared/types';

let currency = 'USD';
export const setCurrency = (c: string) => {
  currency = c;
};

const parseDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const formatDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? parseDay(iso).toLocaleDateString(undefined, opts) : '—';

export const formatShortDate = (iso: string | null | undefined) => formatDate(iso, { day: 'numeric', month: 'short' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** "in 3 days", "yesterday", "2 hours ago" */
export function relativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const isDay = iso.length === 10;
  if (isDay) {
    const diff = Math.round((parseDay(iso).getTime() - parseDay(todayIso()).getTime()) / 864e5);
    if (Math.abs(diff) < 7) return rtf.format(diff, 'day');
    if (Math.abs(diff) < 60) return rtf.format(Math.round(diff / 7), 'week');
    return formatDate(iso);
  }
  const secs = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(secs);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(secs / 86400), 'day');
  return formatDate(iso.slice(0, 10));
}

export const daysUntil = (iso: string) => Math.round((parseDay(iso).getTime() - parseDay(todayIso()).getTime()) / 864e5);

export const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);

export const percent = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`);

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');

export function letterGrade(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '—';
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

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const isoWeekday = () => ((new Date().getDay() + 6) % 7) + 1;

/** Stable pleasant colour for an avatar based on a name. */
export function colorFor(name: string): string {
  const palette = ['#4361ee', '#7209b7', '#2a9d8f', '#e85d04', '#c2185b', '#0077b6', '#6a4c93', '#15803d', '#b45309', '#3a0ca3'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;
