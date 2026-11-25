import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarRange, CheckCircle2, Pencil, Plus, Trash } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Subject, Term } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Tabs, Textarea,
} from '../components/ui';
import { api } from '../lib/api';
import { daysUntil, formatDate, todayIso } from '../lib/format';
import { apiFieldErrors } from './StudentsPage';

type TabId = 'subjects' | 'terms';

export function AcademicsPage() {
  const [tab, setTab] = useState<TabId>('subjects');
  return (
    <>
      <PageHeader title="Subjects & terms" description="The building blocks of your curriculum and school year." />
      <Tabs label="Academic setup" value={tab} onChange={setTab} tabs={[{ id: 'subjects', label: 'Subjects' }, { id: 'terms', label: 'Terms' }]} />
      <div role="tabpanel">{tab === 'subjects' ? <SubjectsPanel /> : <TermsPanel />}</div>
    </>
  );
}

// ---------------------------------------------------------------- Subjects
const PALETTE = ['#4361ee', '#e85d04', '#7209b7', '#2a9d8f', '#d62828', '#9c6644', '#0077b6', '#c2185b', '#15803d', '#b45309'];

function SubjectsPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['subjects'], queryFn: () => api.get<Subject[]>('/subjects') });

  const remove = async (s: Subject) => {
    const ok = await confirm({ title: `Delete ${s.name}?`, message: 'This removes the subject from the catalogue.', confirmLabel: 'Delete subject', danger: true });
    if (!ok) return;
    try {
      await api.del(`/subjects/${s.id}`);
      toast.success(`${s.name} deleted`);
      qc.invalidateQueries({ queryKey: ['subjects'] });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Subjects"
        subtitle="Add a subject here, then assign it to classes from each class page."
        action={<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>New subject</Button>}
      />
      {isLoading ? (
        <div style={{ padding: 20 }}><CardSkeleton rows={4} /></div>
      ) : error ? (
        <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title="No subjects yet" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Add a subject</Button>} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Code</th>
                <th scope="col">Description</th>
                <th scope="col" className="actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td><span className="row" style={{ gap: 10 }}><span className="color-dot" style={{ background: s.color, width: 14, height: 14 }} aria-hidden /><span className="bold">{s.name}</span></span></td>
                  <td className="mono">{s.code}</td>
                  <td className="small muted">{s.description ?? '—'}</td>
                  <td className="actions">
                    <Button variant="ghost" size="sm" iconOnly aria-label={`Edit ${s.name}`} icon={<Pencil size={16} />} onClick={() => { setEditing(s); setOpen(true); }} />
                    <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${s.name}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(s)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SubjectModal open={open} onClose={() => setOpen(false)} subject={editing} usedColors={data?.map((s) => s.color) ?? []} />
    </Card>
  );
}

function SubjectModal({ open, onClose, subject, usedColors }: { open: boolean; onClose: () => void; subject: Subject | null; usedColors: string[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', code: '', color: PALETTE[0]!, description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(subject
      ? { name: subject.name, code: subject.code, color: subject.color, description: subject.description ?? '' }
      : { name: '', code: '', color: PALETTE.find((c) => !usedColors.includes(c)) ?? PALETTE[0]!, description: '' });
    // usedColors is a fresh array each render; only reset when the dialog opens or the subject changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject]);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Omit<Subject, 'id'>) => (subject ? api.patch<Subject>(`/subjects/${subject.id}`, payload) : api.post<Subject>('/subjects', payload)),
    onSuccess: (s) => {
      toast.success(subject ? `Saved ${s.name}` : `${s.name} added`);
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['class'] });
      onClose();
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Enter the subject name';
    if (!form.code.trim()) e.code = 'Enter a short code, e.g. MATH';
    if (!/^#[0-9a-fA-F]{6}$/.test(form.color)) e.color = 'Choose a colour';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({ name: form.name.trim(), code: form.code.trim().toUpperCase(), color: form.color, description: form.description.trim() || null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? `Edit ${subject.name}` : 'New subject'}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{subject ? 'Save changes' : 'Add subject'}</Button></>}
    >
      <div className="form-grid">
        <Field label="Name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Geography" data-autofocus />
        </Field>
        <Field label="Code" required error={errors.code} hint="Up to 12 letters">
          <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={12} className="mono" placeholder="GEO" />
        </Field>
        <div className="field span-2">
          <span className="field-label" id="subject-colour-label">Colour</span>
          <div className="row row-wrap" style={{ gap: 8 }} role="radiogroup" aria-labelledby="subject-colour-label">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color.toLowerCase() === c}
                aria-label={c}
                onClick={() => set('color', c)}
                style={{ width: 30, height: 30, borderRadius: 8, background: c, cursor: 'pointer', border: form.color.toLowerCase() === c ? '3px solid var(--text)' : '2px solid var(--surface)', boxShadow: 'var(--shadow-sm)' }}
              />
            ))}
            <label className="row small muted" style={{ gap: 6, marginLeft: 6 }}>
              Custom
              <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} aria-label="Custom colour" style={{ width: 40, height: 30, border: 0, background: 'none', padding: 0 }} />
            </label>
          </div>
          <span className="field-hint">Used on timetables, gradebooks and charts.</span>
          {errors.color && <span className="field-error">{errors.color}</span>}
        </div>
        <Field label="Description" className="span-2" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Terms
function TermsPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Term | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['terms'], queryFn: () => api.get<Term[]>('/terms') });

  const makeCurrent = async (t: Term) => {
    try {
      await api.patch(`/terms/${t.id}`, { isCurrent: true });
      toast.success(`${t.name} is now the current term`, 'New assessments and invoices will be filed under it.');
      qc.invalidateQueries({ queryKey: ['terms'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (t: Term) => {
    const ok = await confirm({ title: `Delete ${t.name}?`, message: 'Assessments and invoices in this term are kept but will no longer be linked to a term.', confirmLabel: 'Delete term', danger: true });
    if (!ok) return;
    try {
      await api.del(`/terms/${t.id}`);
      toast.success(`${t.name} deleted`);
      qc.invalidateQueries({ queryKey: ['terms'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const today = todayIso();
  return (
    <Card>
      <CardHeader
        title="Terms"
        subtitle="The current term is used by default for new assessments and invoices."
        action={<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>New term</Button>}
      />
      {isLoading ? (
        <div style={{ padding: 20 }}><CardSkeleton rows={3} /></div>
      ) : error ? (
        <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<CalendarRange size={26} />} title="No terms yet" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Add a term</Button>} />
      ) : (
        <ul className="list">
          {data.map((t) => {
            const running = t.startsOn <= today && t.endsOn >= today;
            return (
              <li key={t.id} className="list-item">
                <CalendarRange size={20} className={t.isCurrent ? 'text-success' : 'subtle'} aria-hidden />
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="title">{t.name}</span>
                    {t.isCurrent && <Badge tone="success" dot>Current</Badge>}
                    {!t.isCurrent && running && <Badge tone="warning">In progress, not current</Badge>}
                  </div>
                  <div className="meta">
                    {formatDate(t.startsOn)} – {formatDate(t.endsOn)}
                    {running && ` · ${daysUntil(t.endsOn)} days left`}
                  </div>
                </div>
                {!t.isCurrent && <Button size="sm" icon={<CheckCircle2 size={15} />} onClick={() => makeCurrent(t)}>Make current</Button>}
                <Button variant="ghost" size="sm" iconOnly aria-label={`Edit ${t.name}`} icon={<Pencil size={16} />} onClick={() => { setEditing(t); setOpen(true); }} />
                <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${t.name}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(t)} />
              </li>
            );
          })}
        </ul>
      )}
      <TermModal open={open} onClose={() => setOpen(false)} term={editing} />
    </Card>
  );
}

function TermModal({ open, onClose, term }: { open: boolean; onClose: () => void; term: Term | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '', isCurrent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(term ? { name: term.name, startsOn: term.startsOn, endsOn: term.endsOn, isCurrent: term.isCurrent } : { name: '', startsOn: '', endsOn: '', isCurrent: false });
  }, [open, term]);

  const mutation = useMutation({
    mutationFn: (payload: Omit<Term, 'id'>) => (term ? api.patch<Term>(`/terms/${term.id}`, payload) : api.post<Term>('/terms', payload)),
    onSuccess: (t) => {
      toast.success(term ? `Saved ${t.name}` : `${t.name} added`);
      qc.invalidateQueries({ queryKey: ['terms'] });
      onClose();
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name the term, e.g. Term 2 · 2026/27';
    if (!form.startsOn) e.startsOn = 'Choose the first day';
    if (!form.endsOn) e.endsOn = 'Choose the last day';
    else if (form.startsOn && form.endsOn <= form.startsOn) e.endsOn = 'Must be after the start date';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({ ...form, name: form.name.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={term ? `Edit ${term.name}` : 'New term'}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{term ? 'Save changes' : 'Add term'}</Button></>}
    >
      <div className="form-grid">
        <Field label="Name" required error={errors.name} className="span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />
        </Field>
        <Field label="Starts on" required error={errors.startsOn}>
          <Input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
        </Field>
        <Field label="Ends on" required error={errors.endsOn}>
          <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        </Field>
        <label className="checkbox span-2">
          <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
          Make this the current term
        </label>
      </div>
    </Modal>
  );
}
