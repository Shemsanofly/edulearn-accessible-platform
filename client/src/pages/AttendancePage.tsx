import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, History, Keyboard, Save, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AttendanceRegister, AttendanceStatus, ClassListItem } from '../../../shared/types';
import { useToast } from '../components/Toast';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, ProgressBar,
  Select, Tabs, cx,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { ATTENDANCE_META, attendanceTone, formatDate, fullName, percent, toIso, todayIso } from '../lib/format';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
const KEY_TO_STATUS: Record<string, AttendanceStatus> = { p: 'present', l: 'late', a: 'absent', e: 'excused' };

interface Draft {
  status: AttendanceStatus | null;
  note: string;
}

interface HistoryRow {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number | null;
}

/** Step to the previous/next weekday. */
function shiftSchoolDay(iso: string, dir: -1 | 1) {
  const d = new Date(`${iso}T00:00:00`);
  do d.setDate(d.getDate() + dir);
  while (d.getDay() === 0 || d.getDay() === 6);
  return toIso(d);
}

export function AttendancePage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'register' | 'history'>('register');
  const classId = params.get('classId') ? Number(params.get('classId')) : null;

  const classes = useQuery({
    queryKey: ['classes', user.role === 'teacher' ? 'mine' : 'all'],
    queryFn: () => api.get<ClassListItem[]>('/classes', user.role === 'teacher' ? { mine: true } : undefined),
  });

  // Default to the teacher's homeroom (or the first class).
  useEffect(() => {
    if (!classId && classes.data?.length) {
      const home = classes.data.find((c) => c.homeroomTeacherId === user.id) ?? classes.data[0]!;
      setParams({ classId: String(home.id) }, { replace: true });
    }
  }, [classId, classes.data, user.id, setParams]);

  if (classes.isLoading) return <CardSkeleton rows={8} />;
  if (classes.error) return <ErrorState error={classes.error} onRetry={classes.refetch} />;
  if (!classes.data?.length) {
    return (
      <>
        <PageHeader title="Attendance" />
        <Card><EmptyState icon={<ClipboardCheck size={26} />} title="No classes to take attendance for">You’ll see classes here once you’re assigned as a class teacher or subject teacher.</EmptyState></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Take the daily register and review how attendance is trending."
        actions={
          <Field label="Class" className="w-full">
            <Select value={classId ?? ''} onChange={(e) => setParams({ classId: e.target.value })} style={{ minWidth: 200 }}>
              {classes.data.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.homeroomTeacherId === user.id ? ' (my class)' : ''}</option>
              ))}
            </Select>
          </Field>
        }
      />
      <Tabs
        label="Attendance views"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'register', label: <><ClipboardCheck size={16} aria-hidden /> Register</> },
          { id: 'history', label: <><History size={16} aria-hidden /> History</> },
        ]}
      />
      {classId && (tab === 'register' ? <Register key={classId} classId={classId} /> : <HistoryView classId={classId} />)}
    </>
  );
}

// ---------------------------------------------------------------- Register
function Register({ classId }: { classId: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const reg = useQuery({
    queryKey: ['register', classId, date],
    queryFn: () => api.get<AttendanceRegister>('/attendance/register', { classId, date }),
  });

  const original = useMemo(() => {
    const out: Record<number, Draft> = {};
    reg.data?.entries.forEach((e) => (out[e.id] = { status: e.status, note: e.note ?? '' }));
    return out;
  }, [reg.data]);

  useEffect(() => setDrafts(original), [original]);

  const entries = reg.data?.entries ?? [];
  const changed = entries.filter((e) => {
    const a = drafts[e.id];
    const b = original[e.id];
    return a && b && (a.status !== b.status || a.note.trim() !== b.note.trim());
  }).length;
  const missing = entries.filter((e) => !drafts[e.id]?.status).length;
  const counts = STATUSES.reduce<Record<AttendanceStatus, number>>((acc, s) => {
    acc[s] = entries.filter((e) => drafts[e.id]?.status === s).length;
    return acc;
  }, { present: 0, late: 0, absent: 0, excused: 0 });

  const setStatus = (id: number, status: AttendanceStatus) =>
    setDrafts((d) => ({ ...d, [id]: { note: d[id]?.note ?? '', status } }));

  const save = useMutation({
    mutationFn: () =>
      api.put<AttendanceRegister>('/attendance/register', {
        classId,
        date,
        entries: entries.map((e) => ({ studentId: e.id, status: drafts[e.id]!.status, note: drafts[e.id]!.note.trim() || null })),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['register', classId, date], data);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['attendance-history', classId] });
      toast.success('Register saved', `${data.className} · ${formatDate(date)}`);
    },
    onError: (err) => toast.error(err),
  });

  const goDate = (next: string) => {
    if (changed > 0 && !window.confirm('You have unsaved changes to this register. Leave without saving?')) return;
    setDate(next > todayIso() ? todayIso() : next);
  };

  const onRowKey = (e: React.KeyboardEvent, index: number, id: number) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const status = KEY_TO_STATUS[e.key.toLowerCase()];
    if (status && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setStatus(id, status);
      rowRefs.current[index + 1]?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      rowRefs.current[index + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      rowRefs.current[index - 1]?.focus();
    }
  };

  const isToday = date === todayIso();

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Card>
        <div className="toolbar">
          <div className="row" style={{ gap: 6 }}>
            <Button iconOnly size="sm" aria-label="Previous school day" icon={<ChevronLeft size={17} />} onClick={() => goDate(shiftSchoolDay(date, -1))} />
            <label className="sr-only" htmlFor="register-date">Register date</label>
            <Input id="register-date" type="date" className="input-sm" value={date} max={todayIso()} onChange={(e) => e.target.value && goDate(e.target.value)} style={{ width: 170 }} />
            <Button iconOnly size="sm" aria-label="Next school day" icon={<ChevronRight size={17} />} disabled={isToday} onClick={() => goDate(shiftSchoolDay(date, 1))} />
            {!isToday && <Button size="sm" variant="ghost" onClick={() => goDate(todayIso())}>Today</Button>}
          </div>
          <span className="bold">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          {reg.data && (reg.data.taken ? <Badge tone="success" dot>Recorded</Badge> : <Badge tone="warning" dot>Not taken yet</Badge>)}
          <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
            <Button size="sm" icon={<CheckCheck size={16} />} disabled={!entries.length} onClick={() => setDrafts((d) => Object.fromEntries(entries.map((e) => [e.id, { note: d[e.id]?.note ?? '', status: d[e.id]?.status ?? 'present' }])))}>
              Mark rest present
            </Button>
            {changed > 0 && <Button size="sm" variant="ghost" icon={<Undo2 size={16} />} onClick={() => setDrafts(original)}>Undo changes</Button>}
          </div>
        </div>

        <div className="toolbar" style={{ gap: 16 }} aria-live="polite">
          {STATUSES.map((s) => (
            <span key={s} className={cx('row small', `tone-${ATTENDANCE_META[s].tone}`)} style={{ gap: 6 }}>
              <span className="color-dot" style={{ background: 'var(--tone)', borderRadius: '50%' }} aria-hidden />
              {ATTENDANCE_META[s].label} <strong className="num">{counts[s]}</strong>
            </span>
          ))}
          <span className="small muted" style={{ marginLeft: 'auto' }}>
            {missing > 0 ? `${missing} still to mark` : `All ${entries.length} marked`}
          </span>
        </div>

        {reg.isLoading ? (
          <div className="card-body"><CardSkeleton rows={6} /></div>
        ) : reg.error ? (
          <div className="card-body"><ErrorState error={reg.error} onRetry={reg.refetch} /></div>
        ) : entries.length === 0 ? (
          <EmptyState title="No students in this class yet" />
        ) : (
          <div role="list" aria-label="Students">
            {entries.map((e, i) => {
              const d = drafts[e.id] ?? { status: null, note: '' };
              const name = fullName(e);
              return (
                <div
                  key={e.id}
                  role="listitem"
                  className="register-row"
                  tabIndex={0}
                  ref={(el) => { rowRefs.current[i] = el; }}
                  aria-label={`${name}: ${d.status ? ATTENDANCE_META[d.status].label : 'not marked'}`}
                  onKeyDown={(ev) => onRowKey(ev, i, e.id)}
                  style={{ background: d.status === null ? 'color-mix(in srgb, var(--warning) 5%, transparent)' : undefined }}
                >
                  <div className="cell-person">
                    <Avatar name={name} size="sm" />
                    <div className="truncate">
                      <div className="name truncate">{name}</div>
                      <div className="sub">{e.admissionNo}</div>
                    </div>
                  </div>
                  <div className="status-picker" role="group" aria-label={`Status for ${name}`}>
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={cx('status-btn', `tone-${ATTENDANCE_META[s].tone}`)}
                        aria-pressed={d.status === s}
                        onClick={() => setStatus(e.id, s)}
                        title={`${ATTENDANCE_META[s].label} (${ATTENDANCE_META[s].key})`}
                      >
                        {ATTENDANCE_META[s].label}
                      </button>
                    ))}
                  </div>
                  <Input
                    className="input-sm"
                    aria-label={`Note for ${name}`}
                    placeholder={d.status === 'absent' || d.status === 'excused' ? 'Reason (optional)' : 'Note (optional)'}
                    value={d.note}
                    maxLength={200}
                    onChange={(ev) => setDrafts((x) => ({ ...x, [e.id]: { status: x[e.id]?.status ?? null, note: ev.target.value } }))}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="card-footer" style={{ flexWrap: 'wrap' }}>
          <span className="small muted row" style={{ gap: 6 }}>
            <Keyboard size={15} aria-hidden /> Tip: focus a student and press <kbd className="kbd">P</kbd> <kbd className="kbd">L</kbd> <kbd className="kbd">A</kbd> <kbd className="kbd">E</kbd> to mark and move down.
          </span>
          <div className="row" style={{ gap: 10 }}>
            {changed > 0 && <span className="small text-warning bold">{changed} unsaved change{changed === 1 ? '' : 's'}</span>}
            <Button
              variant="primary"
              icon={<Save size={17} />}
              loading={save.isPending}
              disabled={!entries.length || missing > 0 || (changed === 0 && !!reg.data?.taken)}
              onClick={() => save.mutate()}
              title={missing > 0 ? 'Mark every student before saving' : undefined}
            >
              {reg.data?.taken ? 'Save changes' : 'Save register'}
            </Button>
          </div>
        </div>
      </Card>
      {missing > 0 && entries.length > 0 && changed > 0 && (
        <Alert tone="info" title="Almost there">Mark the remaining {missing} student{missing === 1 ? '' : 's'} to save the register, or use “Mark rest present”.</Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- History
function HistoryView({ classId }: { classId: number }) {
  const [from, setFrom] = useState(() => toIso(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(todayIso());
  const q = useQuery({
    queryKey: ['attendance-history', classId, from, to],
    queryFn: () => api.get<HistoryRow[]>('/attendance/history', { classId, from, to }),
  });
  const rows = q.data ?? [];
  const totals = rows.reduce((acc, r) => ({ attended: acc.attended + r.present + r.late, total: acc.total + r.total }), { attended: 0, total: 0 });
  const avg = totals.total ? (totals.attended / totals.total) * 100 : null;

  return (
    <Card>
      <CardHeader
        title="Daily attendance"
        subtitle={avg === null ? 'No registers in this period' : `Average ${percent(avg, 1)} over ${rows.length} school days`}
        action={
          <div className="row" style={{ gap: 8 }}>
            <label className="sr-only" htmlFor="hist-from">From</label>
            <Input id="hist-from" type="date" className="input-sm" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            <span className="muted small">to</span>
            <label className="sr-only" htmlFor="hist-to">To</label>
            <Input id="hist-to" type="date" className="input-sm" value={to} min={from} max={todayIso()} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </div>
        }
      />
      {q.isLoading ? (
        <div className="card-body"><CardSkeleton rows={6} /></div>
      ) : q.error ? (
        <div className="card-body"><ErrorState error={q.error} onRetry={q.refetch} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<History size={24} />} title="No registers in this period" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" style={{ width: '32%' }}>Attendance rate</th>
                <th scope="col" className="num">Present</th>
                <th scope="col" className="num">Late</th>
                <th scope="col" className="num">Absent</th>
                <th scope="col" className="num">Excused</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="bold">{formatDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <div style={{ flex: 1 }}><ProgressBar value={r.rate} tone={attendanceTone(r.rate)} label={`Attendance on ${r.date}`} /></div>
                      <span className="num bold small" style={{ width: 52, textAlign: 'right' }}>{percent(r.rate, 1)}</span>
                    </div>
                  </td>
                  <td className="num">{r.present}</td>
                  <td className="num">{r.late || <span className="subtle">0</span>}</td>
                  <td className={cx('num', r.absent > 0 && 'text-danger bold')}>{r.absent}</td>
                  <td className="num">{r.excused || <span className="subtle">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
