import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, Trash } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EventInput, EventType, SchoolEvent } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Select, Textarea, cx,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDate, formatShortDate, relativeTime, toIso, todayIso, type Tone } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { apiFieldErrors } from './StudentsPage';

const M = {
  en: {
    tAcademic: 'Academic', tExam: 'Exam', tHoliday: 'Holiday', tMeeting: 'Meeting', tSports: 'Sports', tOther: 'Other',
    description: 'Term dates, exams, holidays and school events.',
    newEvent: 'New event', prevMonth: 'Previous month', nextMonth: 'Next month',
    deleteTitle: 'Delete “{title}”?', deleteMessage: 'It will disappear from everyone’s calendar.', deleteEvent: 'Delete event',
    deletedToast: 'Event deleted', events: '{n} events', oneEvent: '1 event', addOn: 'Add event on {date}', more: '+{n} more',
    tip: 'Tip: click a date to add an event', upcoming: 'Upcoming', upcomingSub: 'Next events across the school',
    nothingScheduled: 'Nothing scheduled', now: 'Now', noDetails: 'No further details.',
    updated: 'Event updated', added: 'Event added',
    eTitle: 'Give the event a name', eStart: 'Choose a start date', eEnd: 'Choose an end date', eEndAfter: 'Must be on or after the start date',
    editEvent: 'Edit event', addEvent: 'Add event',
    fTitle: 'Title', fType: 'Type', fLocation: 'Location', fLocationPh: 'e.g. School hall', fStarts: 'Starts', fEnds: 'Ends',
    fEndsHint: 'Same day for one-day events', fDetails: 'Details',
  },
  sw: {
    tAcademic: 'Kitaaluma', tExam: 'Mtihani', tHoliday: 'Likizo', tMeeting: 'Mkutano', tSports: 'Michezo', tOther: 'Nyingine',
    description: 'Tarehe za muhula, mitihani, likizo na matukio ya shule.',
    newEvent: 'Tukio jipya', prevMonth: 'Mwezi uliopita', nextMonth: 'Mwezi ujao',
    deleteTitle: 'Futa “{title}”?', deleteMessage: 'Litaondoka kwenye kalenda ya kila mtu.', deleteEvent: 'Futa tukio',
    deletedToast: 'Tukio limefutwa', events: 'Matukio {n}', oneEvent: 'Tukio 1', addOn: 'Ongeza tukio tarehe {date}', more: '+{n} zaidi',
    tip: 'Kidokezo: bofya tarehe kuongeza tukio', upcoming: 'Yajayo', upcomingSub: 'Matukio yajayo shuleni',
    nothingScheduled: 'Hakuna kilichopangwa', now: 'Sasa', noDetails: 'Hakuna maelezo zaidi.',
    updated: 'Tukio limesasishwa', added: 'Tukio limeongezwa',
    eTitle: 'Lipe tukio jina', eStart: 'Chagua tarehe ya kuanza', eEnd: 'Chagua tarehe ya kumaliza', eEndAfter: 'Lazima iwe siku ya kuanza au baadaye',
    editEvent: 'Hariri tukio', addEvent: 'Ongeza tukio',
    fTitle: 'Jina', fType: 'Aina', fLocation: 'Mahali', fLocationPh: 'mf. Ukumbi wa shule', fStarts: 'Linaanza', fEnds: 'Linaisha',
    fEndsHint: 'Siku hiyo hiyo kwa tukio la siku moja', fDetails: 'Maelezo',
  },
};
type MKey = keyof typeof M.en;

const TYPES: Record<EventType, { label: MKey; tone: Tone }> = {
  academic: { label: 'tAcademic', tone: 'primary' },
  exam: { label: 'tExam', tone: 'danger' },
  holiday: { label: 'tHoliday', tone: 'success' },
  meeting: { label: 'tMeeting', tone: 'accent' },
  sports: { label: 'tSports', tone: 'warning' },
  other: { label: 'tOther', tone: 'info' },
};

/** Short weekday names (Mon…Sun) in the current language, using a known Monday as the base. */
const weekdayNames = (locale: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }));

/** All days shown for a month, starting on the Monday before the 1st and ending on the Sunday after the last day. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const end = new Date(year, month + 1, 0 + (7 - (((last.getDay() + 6) % 7) + 1)));
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(d);
  return days;
}

const describeRange = (e: SchoolEvent) =>
  e.startsOn === e.endsOn
    ? formatDate(e.startsOn, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${formatShortDate(e.startsOn)} – ${formatDate(e.endsOn)}`;

export function CalendarPage() {
  const user = useUser();
  const t = useT(M);
  const { t: c, locale } = useI18n();
  const DOW = useMemo(() => weekdayNames(locale), [locale]);
  const isAdmin = user.role === 'admin';
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [viewing, setViewing] = useState<SchoolEvent | null>(null);
  const [editor, setEditor] = useState<{ event: SchoolEvent | null; date?: string } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const days = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const from = toIso(days[0]!);
  const to = toIso(days[days.length - 1]!);
  const today = todayIso();

  const month = useQuery({ queryKey: ['events', from, to], queryFn: () => api.get<SchoolEvent[]>('/events', { from, to }) });
  const upcoming = useQuery({ queryKey: ['events', 'upcoming'], queryFn: () => api.get<SchoolEvent[]>('/events', { from: today }) });

  const byDay = useMemo(() => {
    const map = new Map<string, SchoolEvent[]>();
    for (const d of days) {
      const iso = toIso(d);
      map.set(iso, (month.data ?? []).filter((e) => e.startsOn <= iso && e.endsOn >= iso));
    }
    return map;
  }, [days, month.data]);

  const shift = (n: number) => setCursor((c) => {
    const d = new Date(c.year, c.month + n, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const remove = async (e: SchoolEvent) => {
    const ok = await confirm({ title: t('deleteTitle', { title: e.title }), message: t('deleteMessage'), confirmLabel: t('deleteEvent'), danger: true });
    if (!ok) return;
    try {
      await api.del(`/events/${e.id}`);
      toast.success(t('deletedToast'));
      setViewing(null);
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title={c('calendar')}
        description={t('description')}
        actions={isAdmin && <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditor({ event: null })}>{t('newEvent')}</Button>}
      />
      <div className="grid grid-main">
        <Card>
          <div className="card-header">
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" iconOnly aria-label={t('prevMonth')} icon={<ChevronLeft size={18} />} onClick={() => shift(-1)} />
              <Button size="sm" iconOnly aria-label={t('nextMonth')} icon={<ChevronRight size={18} />} onClick={() => shift(1)} />
              <h2 aria-live="polite" style={{ marginLeft: 6 }}>{title}</h2>
            </div>
            <Button size="sm" onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>{c('today')}</Button>
          </div>
          {month.error ? (
            <div style={{ padding: 20 }}><ErrorState error={month.error} onRetry={month.refetch} /></div>
          ) : (
            <div style={{ opacity: month.isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
              <div className="cal-grid" role="grid" aria-label={title}>
                {DOW.map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
                {days.map((d) => {
                  const iso = toIso(d);
                  const events = byDay.get(iso) ?? [];
                  const outside = d.getMonth() !== cursor.month;
                  const label = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
                  return (
                    <div
                      key={iso}
                      role="gridcell"
                      aria-label={`${label}${events.length ? `, ${events.length === 1 ? t('oneEvent') : t('events', { n: events.length })}` : ''}`}
                      className={cx('cal-day', outside && 'muted', iso === today && 'today')}
                      onClick={(ev) => isAdmin && ev.target === ev.currentTarget && setEditor({ event: null, date: iso })}
                      style={isAdmin ? { cursor: 'copy' } : undefined}
                    >
                      {isAdmin ? (
                        <button type="button" className="cal-num" style={{ border: 0, background: iso === today ? undefined : 'none', cursor: 'pointer' }} aria-label={t('addOn', { date: label })} onClick={() => setEditor({ event: null, date: iso })}>
                          {d.getDate()}
                        </button>
                      ) : (
                        <span className="cal-num" aria-hidden>{d.getDate()}</span>
                      )}
                      {events.slice(0, 3).map((e) => (
                        <button key={e.id} type="button" className={`cal-event tone-${TYPES[e.type].tone}`} onClick={() => setViewing(e)} title={e.title}>
                          {e.title}
                        </button>
                      ))}
                      {events.length > 3 && <span className="tiny muted">{t('more', { n: events.length - 3 })}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="card-footer">
            <div className="chart-legend">
              {(Object.keys(TYPES) as EventType[]).map((ty) => (
                <span key={ty}><span className={`color-dot tone-${TYPES[ty].tone}`} style={{ background: 'var(--tone)' }} aria-hidden />{t(TYPES[ty].label)}</span>
              ))}
            </div>
            {isAdmin && <span className="tiny muted">{t('tip')}</span>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('upcoming')} subtitle={t('upcomingSub')} />
          {upcoming.isLoading ? (
            <div style={{ padding: 20 }}><CardSkeleton rows={4} /></div>
          ) : upcoming.error ? (
            <div style={{ padding: 20 }}><ErrorState error={upcoming.error} onRetry={upcoming.refetch} /></div>
          ) : !upcoming.data?.length ? (
            <EmptyState icon={<CalendarDays size={24} />} title={t('nothingScheduled')} />
          ) : (
            <ul className="list">
              {upcoming.data.slice(0, 10).map((e) => {
                const d = new Date(`${e.startsOn}T00:00:00`);
                return (
                  <li key={e.id}>
                    <button type="button" className="list-item w-full" style={{ border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }} onClick={() => setViewing(e)}>
                      <div className={`date-tile tone-${TYPES[e.type].tone}`} aria-hidden>
                        <div className="m">{d.toLocaleDateString(locale, { month: 'short' })}</div>
                        <div className="d">{d.getDate()}</div>
                      </div>
                      <div className="grow">
                        <div className="title truncate">{e.title}</div>
                        <div className="meta">{describeRange(e)}</div>
                      </div>
                      <span className="tiny muted">{e.startsOn <= today ? t('now') : relativeTime(e.startsOn)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title}
        description={viewing ? describeRange(viewing) : undefined}
        footer={isAdmin && viewing ? (
          <>
            <Button variant="danger" icon={<Trash size={16} />} onClick={() => remove(viewing)} style={{ marginRight: 'auto' }}>{c('delete')}</Button>
            <Button onClick={() => setViewing(null)}>{c('close')}</Button>
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => { setEditor({ event: viewing }); setViewing(null); }}>{c('edit')}</Button>
          </>
        ) : <Button onClick={() => setViewing(null)}>{c('close')}</Button>}
      >
        {viewing && (
          <div className="stack">
            <div className="row row-wrap" style={{ gap: 8 }}>
              <Badge tone={TYPES[viewing.type].tone}>{t(TYPES[viewing.type].label)}</Badge>
              {viewing.location && <span className="row small muted" style={{ gap: 4 }}><MapPin size={14} aria-hidden />{viewing.location}</span>}
            </div>
            <p className="pre-wrap">{viewing.description ?? <span className="muted">{t('noDetails')}</span>}</p>
          </div>
        )}
      </Modal>

      {isAdmin && <EventModal state={editor} onClose={() => setEditor(null)} />}
    </>
  );
}

function EventModal({ state, onClose }: { state: { event: SchoolEvent | null; date?: string } | null; onClose: () => void }) {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const event = state?.event ?? null;
  const [form, setForm] = useState({ title: '', type: 'academic' as EventType, startsOn: '', endsOn: '', location: '', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!state) return;
    setErrors({});
    const e = state.event;
    const date = state.date ?? todayIso();
    setForm(e
      ? { title: e.title, type: e.type, startsOn: e.startsOn, endsOn: e.endsOn, location: e.location ?? '', description: e.description ?? '' }
      : { title: '', type: 'academic', startsOn: date, endsOn: date, location: '', description: '' });
  }, [state]);

  const mutation = useMutation({
    mutationFn: (payload: EventInput) => (event ? api.put<SchoolEvent>(`/events/${event.id}`, payload) : api.post<SchoolEvent>('/events', payload)),
    onSuccess: (saved) => {
      toast.success(event ? t('updated') : t('added'), `${saved.title} · ${describeRange(saved)}`);
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = t('eTitle');
    if (!form.startsOn) e.startsOn = t('eStart');
    if (!form.endsOn) e.endsOn = t('eEnd');
    else if (form.startsOn && form.endsOn < form.startsOn) e.endsOn = t('eEndAfter');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({
      title: form.title.trim(),
      type: form.type,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    });
  };

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={event ? t('editEvent') : t('newEvent')}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{event ? c('saveChanges') : t('addEvent')}</Button></>}
    >
      <div className="form-grid">
        <Field label={t('fTitle')} required error={errors.title} className="span-2">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-autofocus />
        </Field>
        <Field label={t('fType')} required>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}>
            {(Object.keys(TYPES) as EventType[]).map((ty) => <option key={ty} value={ty}>{t(TYPES[ty].label)}</option>)}
          </Select>
        </Field>
        <Field label={t('fLocation')} error={errors.location}>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={t('fLocationPh')} />
        </Field>
        <Field label={t('fStarts')} required error={errors.startsOn}>
          <Input
            type="date"
            value={form.startsOn}
            onChange={(e) => setForm({ ...form, startsOn: e.target.value, endsOn: form.endsOn && form.endsOn >= e.target.value ? form.endsOn : e.target.value })}
          />
        </Field>
        <Field label={t('fEnds')} required error={errors.endsOn} hint={t('fEndsHint')}>
          <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        </Field>
        <Field label={t('fDetails')} className="span-2" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
        </Field>
      </div>
    </Modal>
  );
}
