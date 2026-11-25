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
import { apiFieldErrors } from './StudentsPage';

const TYPES: Record<EventType, { label: string; tone: Tone }> = {
  academic: { label: 'Academic', tone: 'primary' },
  exam: { label: 'Exam', tone: 'danger' },
  holiday: { label: 'Holiday', tone: 'success' },
  meeting: { label: 'Meeting', tone: 'accent' },
  sports: { label: 'Sports', tone: 'warning' },
  other: { label: 'Other', tone: 'info' },
};

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    const ok = await confirm({ title: `Delete “${e.title}”?`, message: 'It will disappear from everyone’s calendar.', confirmLabel: 'Delete event', danger: true });
    if (!ok) return;
    try {
      await api.del(`/events/${e.id}`);
      toast.success('Event deleted');
      setViewing(null);
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Term dates, exams, holidays and school events."
        actions={isAdmin && <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditor({ event: null })}>New event</Button>}
      />
      <div className="grid grid-main">
        <Card>
          <div className="card-header">
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" iconOnly aria-label="Previous month" icon={<ChevronLeft size={18} />} onClick={() => shift(-1)} />
              <Button size="sm" iconOnly aria-label="Next month" icon={<ChevronRight size={18} />} onClick={() => shift(1)} />
              <h2 aria-live="polite" style={{ marginLeft: 6 }}>{title}</h2>
            </div>
            <Button size="sm" onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>Today</Button>
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
                  const label = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
                  return (
                    <div
                      key={iso}
                      role="gridcell"
                      aria-label={`${label}${events.length ? `, ${events.length} event${events.length === 1 ? '' : 's'}` : ''}`}
                      className={cx('cal-day', outside && 'muted', iso === today && 'today')}
                      onClick={(ev) => isAdmin && ev.target === ev.currentTarget && setEditor({ event: null, date: iso })}
                      style={isAdmin ? { cursor: 'copy' } : undefined}
                    >
                      {isAdmin ? (
                        <button type="button" className="cal-num" style={{ border: 0, background: iso === today ? undefined : 'none', cursor: 'pointer' }} aria-label={`Add event on ${label}`} onClick={() => setEditor({ event: null, date: iso })}>
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
                      {events.length > 3 && <span className="tiny muted">+{events.length - 3} more</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="card-footer">
            <div className="chart-legend">
              {(Object.keys(TYPES) as EventType[]).map((t) => (
                <span key={t}><span className={`color-dot tone-${TYPES[t].tone}`} style={{ background: 'var(--tone)' }} aria-hidden />{TYPES[t].label}</span>
              ))}
            </div>
            {isAdmin && <span className="tiny muted">Tip: click a date to add an event</span>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Upcoming" subtitle="Next events across the school" />
          {upcoming.isLoading ? (
            <div style={{ padding: 20 }}><CardSkeleton rows={4} /></div>
          ) : upcoming.error ? (
            <div style={{ padding: 20 }}><ErrorState error={upcoming.error} onRetry={upcoming.refetch} /></div>
          ) : !upcoming.data?.length ? (
            <EmptyState icon={<CalendarDays size={24} />} title="Nothing scheduled" />
          ) : (
            <ul className="list">
              {upcoming.data.slice(0, 10).map((e) => {
                const d = new Date(`${e.startsOn}T00:00:00`);
                return (
                  <li key={e.id}>
                    <button type="button" className="list-item w-full" style={{ border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }} onClick={() => setViewing(e)}>
                      <div className={`date-tile tone-${TYPES[e.type].tone}`} aria-hidden>
                        <div className="m">{d.toLocaleDateString(undefined, { month: 'short' })}</div>
                        <div className="d">{d.getDate()}</div>
                      </div>
                      <div className="grow">
                        <div className="title truncate">{e.title}</div>
                        <div className="meta">{describeRange(e)}</div>
                      </div>
                      <span className="tiny muted">{e.startsOn <= today ? 'Now' : relativeTime(e.startsOn)}</span>
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
            <Button variant="danger" icon={<Trash size={16} />} onClick={() => remove(viewing)} style={{ marginRight: 'auto' }}>Delete</Button>
            <Button onClick={() => setViewing(null)}>Close</Button>
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => { setEditor({ event: viewing }); setViewing(null); }}>Edit</Button>
          </>
        ) : <Button onClick={() => setViewing(null)}>Close</Button>}
      >
        {viewing && (
          <div className="stack">
            <div className="row row-wrap" style={{ gap: 8 }}>
              <Badge tone={TYPES[viewing.type].tone}>{TYPES[viewing.type].label}</Badge>
              {viewing.location && <span className="row small muted" style={{ gap: 4 }}><MapPin size={14} aria-hidden />{viewing.location}</span>}
            </div>
            <p className="pre-wrap">{viewing.description ?? <span className="muted">No further details.</span>}</p>
          </div>
        )}
      </Modal>

      {isAdmin && <EventModal state={editor} onClose={() => setEditor(null)} />}
    </>
  );
}

function EventModal({ state, onClose }: { state: { event: SchoolEvent | null; date?: string } | null; onClose: () => void }) {
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
      toast.success(event ? 'Event updated' : 'Event added', `${saved.title} · ${describeRange(saved)}`);
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
    if (!form.title.trim()) e.title = 'Give the event a name';
    if (!form.startsOn) e.startsOn = 'Choose a start date';
    if (!form.endsOn) e.endsOn = 'Choose an end date';
    else if (form.startsOn && form.endsOn < form.startsOn) e.endsOn = 'Must be on or after the start date';
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
      title={event ? 'Edit event' : 'New event'}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{event ? 'Save changes' : 'Add event'}</Button></>}
    >
      <div className="form-grid">
        <Field label="Title" required error={errors.title} className="span-2">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-autofocus />
        </Field>
        <Field label="Type" required>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}>
            {(Object.keys(TYPES) as EventType[]).map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}
          </Select>
        </Field>
        <Field label="Location" error={errors.location}>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Main hall" />
        </Field>
        <Field label="Starts" required error={errors.startsOn}>
          <Input
            type="date"
            value={form.startsOn}
            onChange={(e) => setForm({ ...form, startsOn: e.target.value, endsOn: form.endsOn && form.endsOn >= e.target.value ? form.endsOn : e.target.value })}
          />
        </Field>
        <Field label="Ends" required error={errors.endsOn} hint="Same day for one-day events">
          <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        </Field>
        <Field label="Details" className="span-2" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
        </Field>
      </div>
    </Modal>
  );
}
