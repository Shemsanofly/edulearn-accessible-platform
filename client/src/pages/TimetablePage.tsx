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
import { ChildSwitcher, useSelectedChild } from '../components/ChildSwitcher';
import { DAYS, fullName, isoWeekday } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    classTimetable: 'Class timetable', teacherTimetable: 'Teacher timetable', myTimetable: 'My timetable',
    myTeaching: 'My teaching timetable', childTimetable: '{name}’s timetable',
    descAdmin: 'Plan lessons for each class. Clashes for the class, teacher and room are checked automatically.',
    descOther: 'Your weekly lessons at a glance.', descParent: 'Your child’s weekly lessons at a glance.',
    layout: 'Layout', week: 'Week', day: 'Day', addLesson: 'Add lesson',
    viewBy: 'View timetable by', byClass: 'By class', byTeacher: 'By teacher', teacher: 'Teacher',
    whose: 'Whose timetable', myLessons: 'My lessons', wholeClass: '{name} (whole class)',
    perWeek: '{lessons} lessons a week · {subjects} subjects', lessons: '{n} lessons', oneLesson: '1 lesson',
    noTimetable: 'No timetable to show', noChild: 'Your account isn’t linked to a child in a class yet.',
    noLessons: 'No lessons scheduled yet', addFirst: 'Add the first lesson',
    noLessonsAdmin: 'Add lessons to build this week’s timetable.',
    noLessonsOther: 'Your timetable will appear here once the school has published it.',
    noTeacher: 'No teacher', weekly: 'Weekly timetable', time: 'Time', todayMark: ' (today)',
    lessonLabel: '{day} {start} to {end}: {subject}, {who}', roomPart: ', room {room}', editLesson: 'Edit lesson: {label}',
    noLessonsOn: 'No lessons on {day}', editAt: 'Edit {subject} at {time}',
    updated: 'Lesson updated', added: 'Lesson added', removed: 'Lesson removed',
    eSubject: 'Choose a subject', eAfter: 'Must be after the start time',
    editTitle: 'Edit lesson', addTitle: 'Add a lesson', pickHint: 'Pick a subject, a day and a time.',
    removeTitle: 'Remove this lesson?', removeBody: '{subject} on {day} at {time} will be removed from the timetable.',
    removeLesson: 'Remove lesson', notFree: 'This time isn’t free', pickAnother: 'Pick another time or room.',
    subject: 'Subject', loadingSubjects: 'Loading subjects…', noSubjects: 'No subjects set up for this class',
    quickPick: 'Quick pick a period', starts: 'Starts', ends: 'Ends', room: 'Room',
    roomHint: 'Leave blank to use the class’s usual room', roomPh: 'e.g. Science Lab 2',
    taughtBy: 'Taught by', changeTeacher: '— change the teacher on the class page.',
  },
  sw: {
    classTimetable: 'Ratiba ya darasa', teacherTimetable: 'Ratiba ya mwalimu', myTimetable: 'Ratiba yangu',
    myTeaching: 'Ratiba yangu ya kufundisha', childTimetable: 'Ratiba ya {name}',
    descAdmin: 'Panga vipindi kwa kila darasa. Migongano ya darasa, mwalimu na chumba hukaguliwa yenyewe.',
    descOther: 'Vipindi vyako vya wiki kwa haraka.', descParent: 'Vipindi vya wiki vya mtoto wako kwa haraka.',
    layout: 'Mpangilio', week: 'Wiki', day: 'Siku', addLesson: 'Ongeza kipindi',
    viewBy: 'Tazama ratiba kwa', byClass: 'Kwa darasa', byTeacher: 'Kwa mwalimu', teacher: 'Mwalimu',
    whose: 'Ratiba ya nani', myLessons: 'Vipindi vyangu', wholeClass: '{name} (darasa zima)',
    perWeek: 'Vipindi {lessons} kwa wiki · masomo {subjects}', lessons: 'Vipindi {n}', oneLesson: 'Kipindi 1',
    noTimetable: 'Hakuna ratiba ya kuonyesha', noChild: 'Akaunti yako bado haijaunganishwa na mtoto aliye darasani.',
    noLessons: 'Bado hakuna vipindi vilivyopangwa', addFirst: 'Ongeza kipindi cha kwanza',
    noLessonsAdmin: 'Ongeza vipindi ili kujenga ratiba ya wiki hii.',
    noLessonsOther: 'Ratiba yako itaonekana hapa shule itakapoitoa.',
    noTeacher: 'Hakuna mwalimu', weekly: 'Ratiba ya wiki', time: 'Muda', todayMark: ' (leo)',
    lessonLabel: '{day} {start} hadi {end}: {subject}, {who}', roomPart: ', chumba {room}', editLesson: 'Hariri kipindi: {label}',
    noLessonsOn: 'Hakuna vipindi siku ya {day}', editAt: 'Hariri {subject} saa {time}',
    updated: 'Kipindi kimesasishwa', added: 'Kipindi kimeongezwa', removed: 'Kipindi kimeondolewa',
    eSubject: 'Chagua somo', eAfter: 'Lazima iwe baada ya muda wa kuanza',
    editTitle: 'Hariri kipindi', addTitle: 'Ongeza kipindi', pickHint: 'Chagua somo, siku na muda.',
    removeTitle: 'Ondoa kipindi hiki?', removeBody: '{subject} siku ya {day} saa {time} kitaondolewa kwenye ratiba.',
    removeLesson: 'Ondoa kipindi', notFree: 'Muda huu haupo wazi', pickAnother: 'Chagua muda au chumba kingine.',
    subject: 'Somo', loadingSubjects: 'Inapakia masomo…', noSubjects: 'Hakuna masomo yaliyowekwa kwa darasa hili',
    quickPick: 'Chagua kipindi haraka', starts: 'Kinaanza', ends: 'Kinaisha', room: 'Chumba',
    roomHint: 'Acha wazi kutumia chumba cha kawaida cha darasa', roomPh: 'mf. Maabara ya Sayansi 2',
    taughtBy: 'Kinafundishwa na', changeTeacher: '— badilisha mwalimu kwenye ukurasa wa darasa.',
  },
};

const PX_PER_MIN = 1.15;

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

type Perspective = 'class' | 'teacher';

export function TimetablePage() {
  const user = useUser();
  const t = useT(M);
  const { t: c } = useI18n();
  const [params, setParams] = useSearchParams();
  const isAdmin = user.role === 'admin';
  const isParent = user.role === 'parent';
  // Parents pick a child; everyone else picks a class (or teacher) in the URL.
  const { child, children, setChild, isLoading: loadingChildren } = useSelectedChild();
  const classId = isParent ? child?.classId ?? null : params.get('classId') ? Number(params.get('classId')) : null;
  const teacherId = !isParent && params.get('teacherId') ? Number(params.get('teacherId')) : null;

  const [view, setView] = useState<'week' | 'day'>(() => (window.innerWidth < 720 ? 'day' : 'week'));
  const [day, setDay] = useState(() => Math.min(isoWeekday(), 5));
  const [editing, setEditing] = useState<TimetableSlot | 'new' | null>(null);

  // Pickers depend on role.
  const classes = useQuery({
    queryKey: ['classes', user.role === 'teacher' ? 'mine' : 'all'],
    queryFn: () => api.get<ClassListItem[]>('/classes', user.role === 'teacher' ? { mine: true } : undefined),
    enabled: user.role !== 'student' && !isParent,
  });
  const teachers = useQuery({
    queryKey: ['teachers'],
    queryFn: () => api.get<TeacherListItem[]>('/teachers'),
    enabled: isAdmin,
  });

  // Admins always look at a specific class (or teacher); default to the first one.
  useEffect(() => {
    if (isAdmin && !classId && !teacherId && classes.data?.length) {
      setParams({ classId: String(classes.data[0]!.id) }, { replace: true });
    }
  }, [isAdmin, classId, teacherId, classes.data, setParams]);

  const needsSelection = (isAdmin || isParent) && !classId && !teacherId;
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
    if (isParent) return child ? `${t('childTimetable', { name: child.firstName })} · ${child.className ?? ''}` : t('classTimetable');
    if (classId) return classes.data?.find((cl) => cl.id === classId)?.name ?? t('classTimetable');
    if (teacherId) {
      const tc = teachers.data?.find((x) => x.id === teacherId);
      return tc ? fullName(tc) : t('teacherTimetable');
    }
    return user.role === 'student' ? t('myTimetable') : t('myTeaching');
  })();

  const totalPerWeek = slots.length;
  const subjects = new Set(slots.map((s) => s.subjectName)).size;

  return (
    <>
      <PageHeader
        title={c('timetable')}
        description={isAdmin ? t('descAdmin') : isParent ? t('descParent') : t('descOther')}
        actions={
          <>
            <Segmented label={t('layout')} value={view} onChange={setView} options={[{ value: 'week', label: t('week') }, { value: 'day', label: t('day') }]} />
            {isAdmin && (classId || teacherId) && (
              <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>{t('addLesson')}</Button>
            )}
          </>
        }
      />

      <Card className="mb-3">
        <div className="toolbar" style={{ borderBottom: 0 }}>
          {isAdmin && (
            <>
              <Segmented<Perspective>
                label={t('viewBy')}
                value={teacherId ? 'teacher' : 'class'}
                onChange={(v) => {
                  if (v === 'class' && classes.data?.[0]) setParams({ classId: String(classId ?? classes.data[0].id) });
                  if (v === 'teacher' && teachers.data?.[0]) setParams({ teacherId: String(teachers.data[0].id) });
                }}
                options={[{ value: 'class', label: t('byClass') }, { value: 'teacher', label: t('byTeacher') }]}
              />
              {teacherId ? (
                <Select aria-label={t('teacher')} value={teacherId} onChange={(e) => setParams({ teacherId: e.target.value })}>
                  {teachers.data?.map((tc) => <option key={tc.id} value={tc.id}>{fullName(tc)}{tc.specialization ? ` — ${tc.specialization}` : ''}</option>)}
                </Select>
              ) : (
                <Select aria-label={c('class')} value={classId ?? ''} onChange={(e) => setParams({ classId: e.target.value })}>
                  {classes.data?.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                </Select>
              )}
            </>
          )}
          {user.role === 'teacher' && (
            <Select aria-label={t('whose')} value={classId ?? ''} onChange={(e) => setParams(e.target.value ? { classId: e.target.value } : {})}>
              <option value="">{t('myLessons')}</option>
              {classes.data?.map((cl) => <option key={cl.id} value={cl.id}>{t('wholeClass', { name: cl.name })}</option>)}
            </Select>
          )}
          {isParent && <ChildSwitcher children={children} value={child?.id ?? null} onChange={setChild} />}
          <div className="row" style={{ gap: 10, marginLeft: 'auto' }}>
            <CalendarClock size={18} className="subtle" aria-hidden />
            <span className="bold">{title}</span>
            {!slotsQ.isLoading && !needsSelection && <span className="small muted">{t('perWeek', { lessons: totalPerWeek, subjects })}</span>}
          </div>
        </div>
      </Card>

      {isParent && !loadingChildren && !classId ? (
        <Card><EmptyState title={t('noTimetable')}>{t('noChild')}</EmptyState></Card>
      ) : slotsQ.isLoading || needsSelection ? (
        <CardSkeleton rows={8} />
      ) : slotsQ.error ? (
        <ErrorState error={slotsQ.error} onRetry={slotsQ.refetch} />
      ) : slots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock size={26} />}
            title={t('noLessons')}
            action={isAdmin ? <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>{t('addFirst')}</Button> : undefined}
          >
            {isAdmin ? t('noLessonsAdmin') : t('noLessonsOther')}
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
function slotLine(s: TimetableSlot, perspective: Perspective, noTeacher: string) {
  return perspective === 'class' ? s.teacherName ?? noTeacher : s.className;
}

function WeekGrid({ slots, days, perspective, onSelect }: { slots: TimetableSlot[]; days: number[]; perspective: Perspective; onSelect?: (s: TimetableSlot) => void }) {
  const t = useT(M);
  const start = Math.floor(Math.min(...slots.map((s) => toMin(s.startsAt))) / 60) * 60;
  const end = Math.ceil(Math.max(...slots.map((s) => toMin(s.endsAt))) / 60) * 60;
  const hours = Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60);
  const height = (end - start) * PX_PER_MIN;
  const today = isoWeekday();

  return (
    <Card>
      <div className="table-wrap">
        <div className="tt-grid" style={{ ['--days' as string]: days.length }} role="table" aria-label={t('weekly')}>
          <div className="tt-head" role="columnheader"><span className="sr-only">{t('time')}</span></div>
          {days.map((d) => (
            <div key={d} className={cx('tt-head', d === today && 'today')} role="columnheader" aria-current={d === today ? 'date' : undefined}>
              {DAYS[d - 1]}
              {d === today && <span className="sr-only">{t('todayMark')}</span>}
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
                    {h > 50 && <span className="truncate" style={{ display: 'block' }}>{slotLine(s, perspective, t('noTeacher'))}{s.room ? ` · ${s.room}` : ''}</span>}
                  </>
                );
                const label = t('lessonLabel', { day: DAYS[d - 1], start: s.startsAt, end: s.endsAt, subject: s.subjectName, who: slotLine(s, perspective, t('noTeacher')) }) + (s.room ? t('roomPart', { room: s.room }) : '');
                const style = { top, height: h, ['--c' as string]: s.color };
                return onSelect ? (
                  <button key={s.id} type="button" className="tt-slot" style={style} onClick={() => onSelect(s)} aria-label={t('editLesson', { label })}>{content}</button>
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
  const t = useT(M);
  const list = slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const today = isoWeekday();
  return (
    <Card>
      <div className="card-header" style={{ flexWrap: 'wrap' }}>
        <Segmented
          label={t('day')}
          value={day}
          onChange={setDay}
          options={days.map((d) => ({ value: d, label: <>{DAYS[d - 1]!.slice(0, 3)}{d === today && <span className="sr-only">{t('todayMark')}</span>}</> }))}
        />
        <span className="small muted">{list.length === 1 ? t('oneLesson') : t('lessons', { n: list.length })}</span>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title={t('noLessonsOn', { day: DAYS[day - 1] })} />
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
                    <span>{slotLine(s, perspective, t('noTeacher'))}</span>
                    {s.room && <span className="row" style={{ gap: 4 }}><MapPin size={13} aria-hidden /> {s.room}</span>}
                  </div>
                </div>
              </>
            );
            return onSelect ? (
              <button key={s.id} type="button" className="lesson" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer' }} onClick={() => onSelect(s)} aria-label={t('editAt', { subject: s.subjectName, time: s.startsAt })}>
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
// Typical 40-minute periods; any time can still be typed in.
const PRESETS = [
  ['07:30', '08:10'], ['08:10', '08:50'], ['08:50', '09:30'], ['10:00', '10:40'], ['10:40', '11:20'], ['11:20', '12:00'], ['13:30', '14:10'],
] as const;

function SlotModal({ slot, classId, teacherId, defaultDay, onClose }: {
  slot: TimetableSlot | null; classId: number | null; teacherId: number | null; defaultDay: number; onClose: () => void;
}) {
  const t = useT(M);
  const { t: c } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<TimetableSlotInput>({
    courseId: slot?.courseId ?? 0,
    dayOfWeek: slot?.dayOfWeek ?? defaultDay,
    startsAt: slot?.startsAt ?? PRESETS[0][0],
    endsAt: slot?.endsAt ?? PRESETS[0][1],
    room: slot?.room ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clash, setClash] = useState<string | null>(null);

  const courses = useQuery({
    queryKey: ['courses', classId ? { classId } : 'all'],
    queryFn: () => api.get<Course[]>('/courses', classId ? { classId } : undefined),
  });
  const options = (courses.data ?? []).filter((co) => !teacherId || classId || co.teacherId === teacherId);

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
      toast.success(slot ? t('updated') : t('added'));
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
      toast.success(t('removed'));
      onClose();
    },
    onError: (err) => toast.error(err),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.courseId) errs.courseId = t('eSubject');
    if (!form.startsAt) errs.startsAt = c('required');
    if (!form.endsAt) errs.endsAt = c('required');
    else if (form.startsAt && toMin(form.endsAt) <= toMin(form.startsAt)) errs.endsAt = t('eAfter');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({ ...form, room: form.room?.trim() || null });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={slot ? t('editTitle') : t('addTitle')}
      description={slot ? `${slot.subjectName} · ${slot.className}` : t('pickHint')}
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
                if (await confirm({ title: t('removeTitle'), message: t('removeBody', { subject: slot.subjectName, day: DAYS[slot.dayOfWeek - 1], time: slot.startsAt }), confirmLabel: t('removeLesson'), danger: true })) remove.mutate();
              }}
            >
              {c('remove')}
            </Button>
          )}
          <Button onClick={onClose}>{c('cancel')}</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{slot ? c('saveChanges') : t('addLesson')}</Button>
        </>
      }
    >
      <div className="stack">
        {clash && (
          <Alert tone="danger" icon={<AlertTriangle size={20} />} title={t('notFree')}>
            {clash}. {t('pickAnother')}
          </Alert>
        )}
        <Field label={t('subject')} required error={errors.courseId} hint={courses.isLoading ? t('loadingSubjects') : undefined}>
          <Select value={form.courseId || ''} onChange={(e) => set('courseId', Number(e.target.value))}>
            {options.length === 0 && <option value="">{t('noSubjects')}</option>}
            {options.map((co) => (
              <option key={co.id} value={co.id}>
                {classId ? co.subjectName : `${co.className} · ${co.subjectName}`}{co.teacherName ? ` — ${co.teacherName}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('day')} required>
          <Select value={form.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </Select>
        </Field>
        <div>
          <span className="field-label" id="period-presets">{t('quickPick')}</span>
          <div className="row row-wrap mt-1" style={{ gap: 6 }} role="group" aria-labelledby="period-presets">
            {PRESETS.map(([a, b], i) => (
              <Button key={a} size="sm" aria-pressed={form.startsAt === a && form.endsAt === b} variant={form.startsAt === a && form.endsAt === b ? 'primary' : 'secondary'} onClick={() => { set('startsAt', a); set('endsAt', b); }}>
                P{i + 1} · {a}
              </Button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <Field label={t('starts')} required error={errors.startsAt}>
            <Input type="time" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </Field>
          <Field label={t('ends')} required error={errors.endsAt}>
            <Input type="time" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </Field>
        </div>
        <Field label={t('room')} hint={t('roomHint')} error={errors.room}>
          <Input value={form.room ?? ''} onChange={(e) => set('room', e.target.value)} placeholder={t('roomPh')} />
        </Field>
        {slot?.teacherName && <p className="small muted">{t('taughtBy')} <Badge>{slot.teacherName}</Badge> {t('changeTeacher')}</p>}
      </div>
    </Modal>
  );
}

