import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ClassListItem, Course, TeacherListItem, TimetableSlot, TimetableSlotInput } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Segmented, Select, cx,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useUser } from '../lib/auth';
import { DAYS, fullName, isoWeekday, plural } from '../lib/format';

const PX_PER_MIN = 1.15;

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

type Perspective = 'class' | 'teacher';

export function TimetablePage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const isAdmin = user.role === 'admin';
  const classId = params.get('classId') ? Number(params.get('classId')) : null;
  const teacherId = params.get('teacherId') ? Number(params.get('teacherId')) : null;

  const [view, setView] = useState<'week' | 'day'>(() => (window.innerWidth < 720 ? 'day' : 'week'));
  const [day, setDay] = useState(() => Math.min(isoWeekday(), 5));
  const [editing, setEditing] = useState<TimetableSlot | 'new' | null>(null);

  // Pickers depend on role.
  const classes = useQuery({
    queryKey: ['classes', user.role === 'teacher' ? 'mine' : 'all'],
    queryFn: () => api.get<ClassListItem[]>('/classes', user.role === 'teacher' ? { mine: true } : undefined),
    enabled: user.role !== 'student',
  });
  const teachers = useQuery({
    queryKey: ['teachers'],
    queryFn: () => api.get<TeacherListItem[]>('/teachers'),
    enabled: isAdmin,
  });

  // Admins and parents always look at a specific class (or teacher); default to the first one.
  useEffect(() => {
    if ((isAdmin || user.role === 'parent') && !classId && !teacherId && classes.data?.length) {
      setParams({ classId: String(classes.data[0]!.id) }, { replace: true });
    }
  }, [isAdmin, user.role, classId, teacherId, classes.data, setParams]);

  const needsSelection = (isAdmin || user.role === 'parent') && !classId && !teacherId;
  const query: Record<string, number> = {};
  if (classId) query.classId = classId;
  else if (teacherId) query.teacherId = teacherId;

  const slotsQ = useQuery({
    queryKey: ['timetable', query],
    queryFn: () => api.get<TimetableSlot[]>('/timetable', query),
    enabled: !needsSelection,
  });

  const perspective: Perspective = classId ? 'class' : 'teacher';
  const slots = slotsQ.data ?? [];
  const days = useMemo(() => {
    const max = slots.some((s) => s.dayOfWeek === 7) ? 7 : slots.some((s) => s.dayOfWeek === 6) ? 6 : 5;
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [slots]);

  const title = (() => {
    if (classId) return classes.data?.find((c) => c.id === classId)?.name ?? 'Class timetable';
    if (teacherId) {
      const t = teachers.data?.find((x) => x.id === teacherId);
      return t ? fullName(t) : 'Teacher timetable';
    }
    return user.role === 'student' ? 'My timetable' : 'My teaching timetable';
  })();

  const totalPerWeek = slots.length;
  const subjects = new Set(slots.map((s) => s.subjectName)).size;

  return (
    <>
      <PageHeader
        title="Timetable"
        description={isAdmin ? 'Plan lessons for each class. Clashes for the class, teacher and room are checked automatically.' : 'Your weekly lessons at a glance.'}
        actions={
          <>
            <Segmented label="Layout" value={view} onChange={setView} options={[{ value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }]} />
            {isAdmin && (classId || teacherId) && (
              <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>Add lesson</Button>
            )}
          </>
        }
      />

      <Card className="mb-3">
        <div className="toolbar" style={{ borderBottom: 0 }}>
          {isAdmin && (
            <>
              <Segmented<Perspective>
                label="View timetable by"
                value={teacherId ? 'teacher' : 'class'}
                onChange={(v) => {
                  if (v === 'class' && classes.data?.[0]) setParams({ classId: String(classId ?? classes.data[0].id) });
                  if (v === 'teacher' && teachers.data?.[0]) setParams({ teacherId: String(teachers.data[0].id) });
                }}
                options={[{ value: 'class', label: 'By class' }, { value: 'teacher', label: 'By teacher' }]}
              />
              {teacherId ? (
                <Select aria-label="Teacher" value={teacherId} onChange={(e) => setParams({ teacherId: e.target.value })}>
                  {teachers.data?.map((t) => <option key={t.id} value={t.id}>{fullName(t)}{t.specialization ? ` — ${t.specialization}` : ''}</option>)}
                </Select>
              ) : (
                <Select aria-label="Class" value={classId ?? ''} onChange={(e) => setParams({ classId: e.target.value })}>
                  {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </>
          )}
          {user.role === 'teacher' && (
            <Select aria-label="Whose timetable" value={classId ?? ''} onChange={(e) => setParams(e.target.value ? { classId: e.target.value } : {})}>
              <option value="">My lessons</option>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name} (whole class)</option>)}
            </Select>
          )}
          {user.role === 'parent' && (classes.data?.length ?? 0) > 1 && (
            <Select aria-label="Child's class" value={classId ?? ''} onChange={(e) => setParams({ classId: e.target.value })}>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <div className="row" style={{ gap: 10, marginLeft: 'auto' }}>
            <CalendarClock size={18} className="subtle" aria-hidden />
            <span className="bold">{title}</span>
            {!slotsQ.isLoading && <span className="small muted">{plural(totalPerWeek, 'lesson')} a week · {plural(subjects, 'subject')}</span>}
          </div>
        </div>
      </Card>

      {user.role === 'parent' && classes.data && classes.data.length === 0 ? (
        <Card><EmptyState title="No timetable to show">Your account isn’t linked to a child in a class yet.</EmptyState></Card>
      ) : slotsQ.isLoading || needsSelection ? (
        <CardSkeleton rows={8} />
      ) : slotsQ.error ? (
        <ErrorState error={slotsQ.error} onRetry={slotsQ.refetch} />
      ) : slots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock size={26} />}
            title="No lessons scheduled yet"
            action={isAdmin ? <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>Add the first lesson</Button> : undefined}
          >
            {isAdmin ? 'Add lessons to build this week’s timetable.' : 'Your timetable will appear here once the school has published it.'}
          </EmptyState>
        </Card>
      ) : view === 'week' ? (
        <WeekGrid slots={slots} days={days} perspective={perspective} onSelect={isAdmin ? setEditing : undefined} />
      ) : (
        <DayList slots={slots} days={days} day={day} setDay={setDay} perspective={perspective} onSelect={isAdmin ? setEditing : undefined} />
      )}

      {isAdmin && editing && (
        <SlotModal
          slot={editing === 'new' ? null : editing}
          classId={classId}
          teacherId={teacherId}
          defaultDay={view === 'day' ? day : 1}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Week grid
function slotLine(s: TimetableSlot, perspective: Perspective) {
  return perspective === 'class' ? s.teacherName ?? 'No teacher' : s.className;
}

function WeekGrid({ slots, days, perspective, onSelect }: { slots: TimetableSlot[]; days: number[]; perspective: Perspective; onSelect?: (s: TimetableSlot) => void }) {
  const start = Math.floor(Math.min(...slots.map((s) => toMin(s.startsAt))) / 60) * 60;
  const end = Math.ceil(Math.max(...slots.map((s) => toMin(s.endsAt))) / 60) * 60;
  const hours = Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60);
  const height = (end - start) * PX_PER_MIN;
  const today = isoWeekday();

  return (
    <Card>
      <div className="table-wrap">
        <div className="tt-grid" style={{ ['--days' as string]: days.length }} role="table" aria-label="Weekly timetable">
          <div className="tt-head" role="columnheader"><span className="sr-only">Time</span></div>
          {days.map((d) => (
            <div key={d} className={cx('tt-head', d === today && 'today')} role="columnheader" aria-current={d === today ? 'date' : undefined}>
              {DAYS[d - 1]}
              {d === today && <span className="sr-only"> (today)</span>}
            </div>
          ))}
          <div className="tt-time" style={{ position: 'relative', height }} aria-hidden>
            {hours.map((h) => (
              <div key={h} style={{ position: 'absolute', top: (h - start) * PX_PER_MIN - 7, right: 8 }}>{hhmm(h)}</div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className="tt-col" role="cell" aria-label={DAYS[d - 1]} style={{ height, background: d === today ? 'color-mix(in srgb, var(--primary) 4%, transparent)' : undefined }}>
              {hours.map((h) => <div key={h} className="tt-hour" style={{ height: 60 * PX_PER_MIN }} aria-hidden />)}
              {slots.filter((s) => s.dayOfWeek === d).map((s) => {
                const top = (toMin(s.startsAt) - start) * PX_PER_MIN;
                const h = (toMin(s.endsAt) - toMin(s.startsAt)) * PX_PER_MIN - 3;
                const content = (
                  <>
                    <strong className="truncate">{s.subjectName}</strong>
                    <span className="truncate" style={{ display: 'block' }}>{s.startsAt}–{s.endsAt}</span>
                    {h > 50 && <span className="truncate" style={{ display: 'block' }}>{slotLine(s, perspective)}{s.room ? ` · ${s.room}` : ''}</span>}
                  </>
                );
                const label = `${DAYS[d - 1]} ${s.startsAt} to ${s.endsAt}: ${s.subjectName}, ${slotLine(s, perspective)}${s.room ? `, room ${s.room}` : ''}`;
                const style = { top, height: h, ['--c' as string]: s.color };
                return onSelect ? (
                  <button key={s.id} type="button" className="tt-slot" style={style} onClick={() => onSelect(s)} aria-label={`Edit lesson: ${label}`}>{content}</button>
                ) : (
                  <div key={s.id} className="tt-slot" style={style} aria-label={label} role="note">{content}</div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Day list
function DayList({ slots, days, day, setDay, perspective, onSelect }: {
  slots: TimetableSlot[]; days: number[]; day: number; setDay: (d: number) => void; perspective: Perspective; onSelect?: (s: TimetableSlot) => void;
}) {
  const list = slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const today = isoWeekday();
  return (
    <Card>
      <div className="card-header" style={{ flexWrap: 'wrap' }}>
        <Segmented
          label="Day"
          value={day}
          onChange={setDay}
          options={days.map((d) => ({ value: d, label: <>{DAYS[d - 1]!.slice(0, 3)}{d === today && <span className="sr-only"> (today)</span>}</> }))}
        />
        <span className="small muted">{plural(list.length, 'lesson')}</span>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title={`No lessons on ${DAYS[day - 1]}`} />
      ) : (
        <div>
          {list.map((s) => {
            const body = (
              <>
                <div className="lesson-time"><strong>{s.startsAt}</strong>{s.endsAt}</div>
                <div className="lesson-bar" style={{ background: s.color }} aria-hidden />
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="bold">{s.subjectName}</div>
                  <div className="small muted row" style={{ gap: 10 }}>
                    <span>{slotLine(s, perspective)}</span>
                    {s.room && <span className="row" style={{ gap: 4 }}><MapPin size={13} aria-hidden /> {s.room}</span>}
                  </div>
                </div>
              </>
            );
            return onSelect ? (
              <button key={s.id} type="button" className="lesson" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer' }} onClick={() => onSelect(s)} aria-label={`Edit ${s.subjectName} at ${s.startsAt}`}>
                {body}
              </button>
            ) : (
              <div key={s.id} className="lesson">{body}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Edit modal (admin)
const PRESETS = [
  ['08:00', '08:45'], ['08:50', '09:35'], ['09:40', '10:25'], ['10:45', '11:30'], ['11:35', '12:20'], ['13:00', '13:45'], ['13:50', '14:35'],
] as const;

function SlotModal({ slot, classId, teacherId, defaultDay, onClose }: {
  slot: TimetableSlot | null; classId: number | null; teacherId: number | null; defaultDay: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<TimetableSlotInput>({
    courseId: slot?.courseId ?? 0,
    dayOfWeek: slot?.dayOfWeek ?? defaultDay,
    startsAt: slot?.startsAt ?? '08:00',
    endsAt: slot?.endsAt ?? '08:45',
    room: slot?.room ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clash, setClash] = useState<string | null>(null);

  const courses = useQuery({
    queryKey: ['courses', classId ? { classId } : 'all'],
    queryFn: () => api.get<Course[]>('/courses', classId ? { classId } : undefined),
  });
  const options = (courses.data ?? []).filter((c) => !teacherId || classId || c.teacherId === teacherId);

  useEffect(() => {
    if (!form.courseId && options[0]) setForm((f) => ({ ...f, courseId: options[0]!.id }));
  }, [options, form.courseId]);

  const set = <K extends keyof TimetableSlotInput>(k: K, v: TimetableSlotInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setClash(null);
  };

  const save = useMutation({
    mutationFn: (body: TimetableSlotInput) => (slot ? api.put(`/timetable/${slot.id}`, body) : api.post('/timetable', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(slot ? 'Lesson updated' : 'Lesson added');
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setClash(err.message);
      else if (err instanceof ApiError && err.details) setErrors(err.details);
      else toast.error(err);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/timetable/${slot!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetable'] });
      toast.success('Lesson removed');
      onClose();
    },
    onError: (err) => toast.error(err),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.courseId) errs.courseId = 'Choose a subject';
    if (!form.startsAt) errs.startsAt = 'Required';
    if (!form.endsAt) errs.endsAt = 'Required';
    else if (form.startsAt && toMin(form.endsAt) <= toMin(form.startsAt)) errs.endsAt = 'Must be after the start time';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({ ...form, room: form.room?.trim() || null });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={slot ? 'Edit lesson' : 'Add a lesson'}
      description={slot ? `${slot.subjectName} · ${slot.className}` : 'Pick a subject, a day and a time.'}
      onSubmit={submit}
      footer={
        <>
          {slot && (
            <Button
              variant="ghost"
              icon={<Trash2 size={16} />}
              style={{ marginRight: 'auto', color: 'var(--danger)' }}
              loading={remove.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Remove this lesson?', message: `${slot.subjectName} on ${DAYS[slot.dayOfWeek - 1]} at ${slot.startsAt} will be removed from the timetable.`, confirmLabel: 'Remove lesson', danger: true })) remove.mutate();
              }}
            >
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{slot ? 'Save changes' : 'Add lesson'}</Button>
        </>
      }
    >
      <div className="stack">
        {clash && (
          <Alert tone="danger" icon={<AlertTriangle size={20} />} title="This time isn’t free">
            {clash}. Pick another time or room.
          </Alert>
        )}
        <Field label="Subject" required error={errors.courseId} hint={courses.isLoading ? 'Loading subjects…' : undefined}>
          <Select value={form.courseId || ''} onChange={(e) => set('courseId', Number(e.target.value))}>
            {options.length === 0 && <option value="">No subjects set up for this class</option>}
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {classId ? c.subjectName : `${c.className} · ${c.subjectName}`}{c.teacherName ? ` — ${c.teacherName}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Day" required>
          <Select value={form.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </Select>
        </Field>
        <div>
          <span className="field-label" id="period-presets">Quick pick a period</span>
          <div className="row row-wrap mt-1" style={{ gap: 6 }} role="group" aria-labelledby="period-presets">
            {PRESETS.map(([a, b], i) => (
              <Button key={a} size="sm" aria-pressed={form.startsAt === a && form.endsAt === b} variant={form.startsAt === a && form.endsAt === b ? 'primary' : 'secondary'} onClick={() => { set('startsAt', a); set('endsAt', b); }}>
                P{i + 1} · {a}
              </Button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <Field label="Starts" required error={errors.startsAt}>
            <Input type="time" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </Field>
          <Field label="Ends" required error={errors.endsAt}>
            <Input type="time" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </Field>
        </div>
        <Field label="Room" hint="Leave blank to use the class’s usual room" error={errors.room}>
          <Input value={form.room ?? ''} onChange={(e) => set('room', e.target.value)} placeholder="e.g. Science Lab 2" />
        </Field>
        {slot?.teacherName && <p className="small muted">Taught by <Badge>{slot.teacherName}</Badge> — change the teacher on the class page.</p>}
      </div>
    </Modal>
  );
}

