import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarDays, CalendarRange, CheckCircle2, Pencil, Plus, Scale, Star, Trash, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AcademicYear, GradeBand, GradingScale, Subject, Term } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Select, Tabs, Textarea,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { daysUntil, formatDate, todayIso } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const fieldErrors = (err: unknown): Record<string, string> => (err instanceof ApiError && err.details ? err.details : {});

const M = {
  en: {
    title: 'Subjects & terms', subtitle: 'The building blocks of your curriculum and school year.', tabsLabel: 'Academic setup',
    subjects: 'Subjects', terms: 'Terms', years: 'Academic years', grading: 'Grading',
    // Subjects
    subjectsHint: 'Add a subject here, then assign it to classes from each class page.', newSubject: 'New subject', noSubjects: 'No subjects yet',
    addSubject: 'Add a subject', subject: 'Subject', code: 'Code', description: 'Description', actions: 'Actions',
    deleteSubjectQ: 'Delete {name}?', deleteSubjectMsg: 'This removes the subject from the catalogue.', deleteSubject: 'Delete subject',
    nameDeleted: '{name} deleted', nameSaved: 'Saved {name}', nameAdded: '{name} added', editName: 'Edit {name}', name: 'Name',
    subjectNameErr: 'Enter the subject name', codeErr: 'Enter a short code, e.g. MATH', colourErr: 'Choose a colour', codeHint: 'Up to 12 letters',
    colour: 'Colour', custom: 'Custom', customColour: 'Custom colour', colourHint: 'Used on timetables, gradebooks and charts.',
    // Terms
    termsHint: 'The current term is used by default for new assessments, exams and invoices.', newTerm: 'New term', noTerms: 'No terms yet',
    addTerm: 'Add a term', current: 'Current', inProgress: 'In progress, not current', daysLeft: '{n} days left', makeCurrent: 'Make current',
    nowCurrentTerm: '{name} is now the current term', nowCurrentHint: 'New assessments and invoices will be filed under it.',
    deleteTermQ: 'Delete {name}?', deleteTermMsg: 'Assessments and invoices in this term are kept but will no longer be linked to a term.',
    deleteTerm: 'Delete term', termNameErr: 'Name the term, e.g. Term 1 2026', startErr: 'Choose the first day', endErr: 'Choose the last day',
    endAfter: 'Must be after the start date', startsOn: 'Starts on', endsOn: 'Ends on', makeCurrentTerm: 'Make this the current term',
    academicYear: 'Academic year', noYear: 'No academic year', addTerm2: 'Add term',
    // Years
    yearsHint: 'An academic year groups its terms, e.g. 2026 with Term 1 and Term 2.', newYear: 'New academic year', noYears: 'No academic years yet',
    addYear: 'Add an academic year', termCount: '{n} terms', yearNameErr: 'Name the year, e.g. 2026', makeCurrentYear: 'Make this the current academic year',
    deleteYearQ: 'Delete {name}?', deleteYearMsg: 'Its terms are kept but will no longer belong to a year.', deleteYear: 'Delete year',
    nowCurrentYear: '{name} is now the current academic year',
    // Grading
    gradingHint: 'How percentages turn into grades on report cards. Exams use the default scale unless you choose another.',
    newScale: 'New grading scale', noScales: 'No grading scales yet', addScale: 'Add a grading scale', default: 'Default', makeDefault: 'Make default',
    grade: 'Grade', min: 'Min %', max: 'Max %', points: 'Points', remark: 'Remark', range: 'Range',
    deleteScaleQ: 'Delete {name}?', deleteScaleMsg: 'Exams using it will fall back to the default scale.', deleteScale: 'Delete scale',
    scaleNameErr: 'Name the scale, e.g. Secondary (CSEE)', bandsErr: 'Every grade needs a letter and a range between 0 and 100',
    addBand: 'Add grade', removeBand: 'Remove grade {grade}', defaultScale: 'Use as the default scale',
    bandsHelp: 'Cover 0–100 with no overlaps, e.g. A 75–100, B 65–74 … F 0–29.', nowDefault: '{name} is now the default scale',
    bands: 'Grades', saveScale: 'Save scale',
  },
  sw: {
    title: 'Masomo na mihula', subtitle: 'Misingi ya mtaala na mwaka wa masomo.', tabsLabel: 'Mipangilio ya taaluma',
    subjects: 'Masomo', terms: 'Mihula', years: 'Miaka ya masomo', grading: 'Madaraja',
    subjectsHint: 'Ongeza somo hapa, kisha liweke kwenye madarasa kupitia ukurasa wa kila darasa.', newSubject: 'Somo jipya', noSubjects: 'Bado hakuna masomo',
    addSubject: 'Ongeza somo', subject: 'Somo', code: 'Msimbo', description: 'Maelezo', actions: 'Vitendo',
    deleteSubjectQ: 'Futa {name}?', deleteSubjectMsg: 'Hii itaondoa somo kwenye orodha.', deleteSubject: 'Futa somo',
    nameDeleted: '{name} limefutwa', nameSaved: '{name} limehifadhiwa', nameAdded: '{name} limeongezwa', editName: 'Hariri {name}', name: 'Jina',
    subjectNameErr: 'Andika jina la somo', codeErr: 'Andika msimbo mfupi, mf. MATH', colourErr: 'Chagua rangi', codeHint: 'Hadi herufi 12',
    colour: 'Rangi', custom: 'Nyingine', customColour: 'Rangi nyingine', colourHint: 'Hutumika kwenye ratiba, madaftari ya alama na chati.',
    termsHint: 'Muhula wa sasa hutumika kwa kazi mpya, mitihani na ankara.', newTerm: 'Muhula mpya', noTerms: 'Bado hakuna mihula',
    addTerm: 'Ongeza muhula', current: 'Wa sasa', inProgress: 'Unaendelea, si wa sasa', daysLeft: 'Siku {n} zimebaki', makeCurrent: 'Fanya wa sasa',
    nowCurrentTerm: '{name} sasa ni muhula wa sasa', nowCurrentHint: 'Kazi mpya na ankara zitawekwa chini yake.',
    deleteTermQ: 'Futa {name}?', deleteTermMsg: 'Kazi na ankara za muhula huu zitabaki lakini hazitaunganishwa na muhula.',
    deleteTerm: 'Futa muhula', termNameErr: 'Taja muhula, mf. Muhula 1 2026', startErr: 'Chagua siku ya kwanza', endErr: 'Chagua siku ya mwisho',
    endAfter: 'Lazima iwe baada ya tarehe ya kuanza', startsOn: 'Unaanza', endsOn: 'Unaisha', makeCurrentTerm: 'Fanya huu kuwa muhula wa sasa',
    academicYear: 'Mwaka wa masomo', noYear: 'Hakuna mwaka wa masomo', addTerm2: 'Ongeza muhula',
    yearsHint: 'Mwaka wa masomo hukusanya mihula yake, mf. 2026 wenye Muhula 1 na Muhula 2.', newYear: 'Mwaka mpya wa masomo', noYears: 'Bado hakuna miaka ya masomo',
    addYear: 'Ongeza mwaka wa masomo', termCount: 'Mihula {n}', yearNameErr: 'Taja mwaka, mf. 2026', makeCurrentYear: 'Fanya huu kuwa mwaka wa sasa',
    deleteYearQ: 'Futa {name}?', deleteYearMsg: 'Mihula yake itabaki lakini haitakuwa ya mwaka wowote.', deleteYear: 'Futa mwaka',
    nowCurrentYear: '{name} sasa ni mwaka wa masomo wa sasa',
    gradingHint: 'Jinsi asilimia zinavyogeuzwa kuwa madaraja kwenye ripoti. Mitihani hutumia kipimo chaguo-msingi usipochagua kingine.',
    newScale: 'Kipimo kipya cha madaraja', noScales: 'Bado hakuna vipimo vya madaraja', addScale: 'Ongeza kipimo cha madaraja', default: 'Chaguo-msingi', makeDefault: 'Fanya chaguo-msingi',
    grade: 'Daraja', min: 'Chini %', max: 'Juu %', points: 'Pointi', remark: 'Maoni', range: 'Kiwango',
    deleteScaleQ: 'Futa {name}?', deleteScaleMsg: 'Mitihani inayokitumia itatumia kipimo chaguo-msingi.', deleteScale: 'Futa kipimo',
    scaleNameErr: 'Taja kipimo, mf. Sekondari (CSEE)', bandsErr: 'Kila daraja linahitaji herufi na kiwango kati ya 0 na 100',
    addBand: 'Ongeza daraja', removeBand: 'Ondoa daraja {grade}', defaultScale: 'Tumia kama kipimo chaguo-msingi',
    bandsHelp: 'Funika 0–100 bila kuingiliana, mf. A 75–100, B 65–74 … F 0–29.', nowDefault: '{name} sasa ni kipimo chaguo-msingi',
    bands: 'Madaraja', saveScale: 'Hifadhi kipimo',
  },
};

type TabId = 'subjects' | 'terms' | 'years' | 'grading';
const TABS: TabId[] = ['subjects', 'terms', 'years', 'grading'];

export function AcademicsPage() {
  const t = useT(M);
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabId | null;
  const tab: TabId = raw && TABS.includes(raw) ? raw : 'subjects';
  const setTab = (next: TabId) => setParams(next === 'subjects' ? {} : { tab: next }, { replace: true });
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Tabs
        label={t('tabsLabel')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'subjects', label: t('subjects') },
          { id: 'terms', label: t('terms') },
          { id: 'years', label: t('years') },
          { id: 'grading', label: t('grading') },
        ]}
      />
      <div role="tabpanel">
        {tab === 'subjects' && <SubjectsPanel />}
        {tab === 'terms' && <TermsPanel />}
        {tab === 'years' && <YearsPanel />}
        {tab === 'grading' && <GradingPanel />}
      </div>
    </>
  );
}

function Loading() {
  return <div style={{ padding: 20 }}><CardSkeleton rows={4} /></div>;
}

// ---------------------------------------------------------------- Subjects
const PALETTE = ['#1d4ed8', '#c2410c', '#0f766e', '#15803d', '#b91c1c', '#7c3aed', '#0e7490', '#a16207', '#be185d', '#1b3a6b'];

function SubjectsPanel() {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['subjects'], queryFn: () => api.get<Subject[]>('/subjects') });

  const remove = async (s: Subject) => {
    const ok = await confirm({ title: t('deleteSubjectQ', { name: s.name }), message: t('deleteSubjectMsg'), confirmLabel: t('deleteSubject'), danger: true });
    if (!ok) return;
    try {
      await api.del(`/subjects/${s.id}`);
      toast.success(t('nameDeleted', { name: s.name }));
      qc.invalidateQueries({ queryKey: ['subjects'] });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('subjects')}
        subtitle={t('subjectsHint')}
        action={<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>{t('newSubject')}</Button>}
      />
      {isLoading ? <Loading /> : error ? (
        <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title={t('noSubjects')} action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t('addSubject')}</Button>} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('subject')}</th>
                <th scope="col">{t('code')}</th>
                <th scope="col">{t('description')}</th>
                <th scope="col" className="actions"><span className="sr-only">{t('actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td><span className="row" style={{ gap: 10 }}><span className="color-dot" style={{ background: s.color, width: 14, height: 14 }} aria-hidden /><span className="bold">{s.name}</span></span></td>
                  <td className="mono">{s.code}</td>
                  <td className="small muted">{s.description ?? '—'}</td>
                  <td className="actions">
                    <Button variant="ghost" size="sm" iconOnly aria-label={t('editName', { name: s.name })} icon={<Pencil size={16} />} onClick={() => { setEditing(s); setOpen(true); }} />
                    <Button variant="ghost" size="sm" iconOnly aria-label={`${c('delete')} ${s.name}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(s)} />
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
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', code: '', color: PALETTE[0]!, description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(subject
      ? { name: subject.name, code: subject.code, color: subject.color, description: subject.description ?? '' }
      : { name: '', code: '', color: PALETTE.find((col) => !usedColors.includes(col)) ?? PALETTE[0]!, description: '' });
    // usedColors is a new array each render; only reset when the dialog opens or the subject changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject]);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Omit<Subject, 'id'>) => (subject ? api.patch<Subject>(`/subjects/${subject.id}`, payload) : api.post<Subject>('/subjects', payload)),
    onSuccess: (s) => {
      toast.success(subject ? t('nameSaved', { name: s.name }) : t('nameAdded', { name: s.name }));
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['class'] });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t('subjectNameErr');
    if (!form.code.trim()) e.code = t('codeErr');
    if (!/^#[0-9a-fA-F]{6}$/.test(form.color)) e.color = t('colourErr');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({ name: form.name.trim(), code: form.code.trim().toUpperCase(), color: form.color, description: form.description.trim() || null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? t('editName', { name: subject.name }) : t('newSubject')}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{subject ? c('saveChanges') : t('addSubject')}</Button></>}
    >
      <div className="form-grid">
        <Field label={t('name')} required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Geography" data-autofocus />
        </Field>
        <Field label={t('code')} required error={errors.code} hint={t('codeHint')}>
          <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={12} className="mono" placeholder="GEO" />
        </Field>
        <div className="field span-2">
          <span className="field-label" id="subject-colour-label">{t('colour')}</span>
          <div className="row row-wrap" style={{ gap: 8 }} role="radiogroup" aria-labelledby="subject-colour-label">
            {PALETTE.map((col) => (
              <button
                key={col}
                type="button"
                role="radio"
                aria-checked={form.color.toLowerCase() === col}
                aria-label={col}
                onClick={() => set('color', col)}
                style={{ width: 30, height: 30, borderRadius: 8, background: col, cursor: 'pointer', border: form.color.toLowerCase() === col ? '3px solid var(--text)' : '2px solid var(--surface)', boxShadow: 'var(--shadow-sm)' }}
              />
            ))}
            <label className="row small muted" style={{ gap: 6, marginLeft: 6 }}>
              {t('custom')}
              <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} aria-label={t('customColour')} style={{ width: 40, height: 30, border: 0, background: 'none', padding: 0 }} />
            </label>
          </div>
          <span className="field-hint">{t('colourHint')}</span>
          {errors.color && <span className="field-error">{errors.color}</span>}
        </div>
        <Field label={t('description')} className="span-2" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Terms
function TermsPanel() {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Term | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['terms'], queryFn: () => api.get<Term[]>('/terms') });

  const makeCurrent = async (term: Term) => {
    try {
      await api.patch(`/terms/${term.id}`, { isCurrent: true });
      toast.success(t('nowCurrentTerm', { name: term.name }), t('nowCurrentHint'));
      qc.invalidateQueries({ queryKey: ['terms'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (term: Term) => {
    const ok = await confirm({ title: t('deleteTermQ', { name: term.name }), message: t('deleteTermMsg'), confirmLabel: t('deleteTerm'), danger: true });
    if (!ok) return;
    try {
      await api.del(`/terms/${term.id}`);
      toast.success(t('nameDeleted', { name: term.name }));
      qc.invalidateQueries({ queryKey: ['terms'] });
      qc.invalidateQueries({ queryKey: ['academic-years'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const today = todayIso();
  return (
    <Card>
      <CardHeader
        title={t('terms')}
        subtitle={t('termsHint')}
        action={<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>{t('newTerm')}</Button>}
      />
      {isLoading ? <Loading /> : error ? (
        <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<CalendarRange size={26} />} title={t('noTerms')} action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t('addTerm')}</Button>} />
      ) : (
        <ul className="list">
          {data.map((term) => {
            const running = term.startsOn <= today && term.endsOn >= today;
            return (
              <li key={term.id} className="list-item">
                <CalendarRange size={20} className={term.isCurrent ? 'text-success' : 'subtle'} aria-hidden />
                <div className="grow">
                  <div className="row row-wrap" style={{ gap: 8 }}>
                    <span className="title">{term.name}</span>
                    {term.isCurrent && <Badge tone="success" dot>{t('current')}</Badge>}
                    {!term.isCurrent && running && <Badge tone="warning">{t('inProgress')}</Badge>}
                    {term.academicYearName && <Badge tone="info">{term.academicYearName}</Badge>}
                  </div>
                  <div className="meta">
                    {formatDate(term.startsOn)} – {formatDate(term.endsOn)}
                    {running && ` · ${t('daysLeft', { n: daysUntil(term.endsOn) })}`}
                  </div>
                </div>
                {!term.isCurrent && <Button size="sm" icon={<CheckCircle2 size={15} />} onClick={() => makeCurrent(term)}>{t('makeCurrent')}</Button>}
                <Button variant="ghost" size="sm" iconOnly aria-label={t('editName', { name: term.name })} icon={<Pencil size={16} />} onClick={() => { setEditing(term); setOpen(true); }} />
                <Button variant="ghost" size="sm" iconOnly aria-label={`${c('delete')} ${term.name}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(term)} />
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
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const years = useQuery({ queryKey: ['academic-years'], queryFn: () => api.get<AcademicYear[]>('/academic-years'), enabled: open });
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '', isCurrent: false, academicYearId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(term
      ? { name: term.name, startsOn: term.startsOn, endsOn: term.endsOn, isCurrent: term.isCurrent, academicYearId: term.academicYearId ? String(term.academicYearId) : '' }
      : { name: '', startsOn: '', endsOn: '', isCurrent: false, academicYearId: '' });
  }, [open, term]);

  // A new term defaults to the current academic year.
  useEffect(() => {
    if (open && !term && !form.academicYearId && years.data) {
      const current = years.data.find((y) => y.isCurrent);
      if (current) setForm((f) => ({ ...f, academicYearId: String(current.id) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, term, years.data]);

  const mutation = useMutation({
    mutationFn: (payload: { name: string; startsOn: string; endsOn: string; isCurrent: boolean; academicYearId: number | null }) =>
      term ? api.patch<Term>(`/terms/${term.id}`, payload) : api.post<Term>('/terms', payload),
    onSuccess: (saved) => {
      toast.success(term ? t('nameSaved', { name: saved.name }) : t('nameAdded', { name: saved.name }));
      qc.invalidateQueries({ queryKey: ['terms'] });
      qc.invalidateQueries({ queryKey: ['academic-years'] });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t('termNameErr');
    if (!form.startsOn) e.startsOn = t('startErr');
    if (!form.endsOn) e.endsOn = t('endErr');
    else if (form.startsOn && form.endsOn <= form.startsOn) e.endsOn = t('endAfter');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({
      name: form.name.trim(), startsOn: form.startsOn, endsOn: form.endsOn, isCurrent: form.isCurrent,
      academicYearId: form.academicYearId ? Number(form.academicYearId) : null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={term ? t('editName', { name: term.name }) : t('newTerm')}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{term ? c('saveChanges') : t('addTerm2')}</Button></>}
    >
      <div className="form-grid">
        <Field label={t('name')} required error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Term 1 2026" data-autofocus />
        </Field>
        <Field label={t('academicYear')} error={errors.academicYearId}>
          <Select value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}>
            <option value="">{t('noYear')}</option>
            {years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        </Field>
        <Field label={t('startsOn')} required error={errors.startsOn}>
          <Input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
        </Field>
        <Field label={t('endsOn')} required error={errors.endsOn}>
          <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        </Field>
        <label className="checkbox span-2">
          <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
          {t('makeCurrentTerm')}
        </label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Academic years
function YearsPanel() {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['academic-years'], queryFn: () => api.get<AcademicYear[]>('/academic-years') });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['academic-years'] });
    qc.invalidateQueries({ queryKey: ['terms'] });
  };

  const makeCurrent = async (y: AcademicYear) => {
    try {
      await api.patch(`/academic-years/${y.id}`, { isCurrent: true });
      toast.success(t('nowCurrentYear', { name: y.name }));
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (y: AcademicYear) => {
    const ok = await confirm({ title: t('deleteYearQ', { name: y.name }), message: t('deleteYearMsg'), confirmLabel: t('deleteYear'), danger: true });
    if (!ok) return;
    try {
      await api.del(`/academic-years/${y.id}`);
      toast.success(t('nameDeleted', { name: y.name }));
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t('years')}
        subtitle={t('yearsHint')}
        action={<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>{t('newYear')}</Button>}
      />
      {isLoading ? <Loading /> : error ? (
        <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<CalendarDays size={26} />} title={t('noYears')} action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t('addYear')}</Button>} />
      ) : (
        <ul className="list">
          {data.map((y) => (
            <li key={y.id} className="list-item">
              <CalendarDays size={20} className={y.isCurrent ? 'text-success' : 'subtle'} aria-hidden />
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <span className="title">{y.name}</span>
                  {y.isCurrent && <Badge tone="success" dot>{t('current')}</Badge>}
                </div>
                <div className="meta">{formatDate(y.startsOn)} – {formatDate(y.endsOn)} · {t('termCount', { n: y.termCount })}</div>
              </div>
              {!y.isCurrent && <Button size="sm" icon={<CheckCircle2 size={15} />} onClick={() => makeCurrent(y)}>{t('makeCurrent')}</Button>}
              <Button variant="ghost" size="sm" iconOnly aria-label={t('editName', { name: y.name })} icon={<Pencil size={16} />} onClick={() => { setEditing(y); setOpen(true); }} />
              <Button variant="ghost" size="sm" iconOnly aria-label={`${c('delete')} ${y.name}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(y)} />
            </li>
          ))}
        </ul>
      )}
      <YearModal open={open} onClose={() => setOpen(false)} year={editing} onSaved={refresh} />
    </Card>
  );
}

function YearModal({ open, onClose, year, onSaved }: { open: boolean; onClose: () => void; year: AcademicYear | null; onSaved: () => void }) {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '', isCurrent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(year ? { name: year.name, startsOn: year.startsOn, endsOn: year.endsOn, isCurrent: year.isCurrent } : { name: '', startsOn: '', endsOn: '', isCurrent: false });
  }, [open, year]);

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => (year ? api.patch<AcademicYear>(`/academic-years/${year.id}`, payload) : api.post<AcademicYear>('/academic-years', payload)),
    onSuccess: (saved) => {
      toast.success(year ? t('nameSaved', { name: saved.name }) : t('nameAdded', { name: saved.name }));
      onSaved();
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t('yearNameErr');
    if (!form.startsOn) e.startsOn = t('startErr');
    if (!form.endsOn) e.endsOn = t('endErr');
    else if (form.startsOn && form.endsOn <= form.startsOn) e.endsOn = t('endAfter');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({ ...form, name: form.name.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={year ? t('editName', { name: year.name }) : t('newYear')}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{year ? c('saveChanges') : t('addYear')}</Button></>}
    >
      <div className="form-grid">
        <Field label={t('name')} required error={errors.name} className="span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="2026" data-autofocus />
        </Field>
        <Field label={t('startsOn')} required error={errors.startsOn}>
          <Input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
        </Field>
        <Field label={t('endsOn')} required error={errors.endsOn}>
          <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        </Field>
        <label className="checkbox span-2">
          <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
          {t('makeCurrentYear')}
        </label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Grading scales
function GradingPanel() {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<GradingScale | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['grading-scales'], queryFn: () => api.get<GradingScale[]>('/grading-scales') });

  const makeDefault = async (s: GradingScale) => {
    try {
      await api.put(`/grading-scales/${s.id}`, { name: s.name, description: s.description, isDefault: true, bands: s.bands });
      toast.success(t('nowDefault', { name: s.name }));
      qc.invalidateQueries({ queryKey: ['grading-scales'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (s: GradingScale) => {
    const ok = await confirm({ title: t('deleteScaleQ', { name: s.name }), message: t('deleteScaleMsg'), confirmLabel: t('deleteScale'), danger: true });
    if (!ok) return;
    try {
      await api.del(`/grading-scales/${s.id}`);
      toast.success(t('nameDeleted', { name: s.name }));
      qc.invalidateQueries({ queryKey: ['grading-scales'] });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="stack">
      <Card>
        <CardHeader
          title={t('grading')}
          subtitle={t('gradingHint')}
          action={<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>{t('newScale')}</Button>}
        />
        {isLoading ? <Loading /> : error ? (
          <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Scale size={26} />} title={t('noScales')} action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t('addScale')}</Button>} />
        ) : null}
      </Card>
      {data && data.length > 0 && (
        <div className="grid grid-2">
          {data.map((s) => (
            <Card key={s.id}>
              <CardHeader
                title={<span className="row" style={{ gap: 8 }}>{s.name}{s.isDefault && <Badge tone="success" dot>{t('default')}</Badge>}</span>}
                subtitle={s.description ?? undefined}
                action={
                  <div className="row" style={{ gap: 4 }}>
                    {!s.isDefault && <Button size="sm" variant="ghost" icon={<Star size={15} />} onClick={() => makeDefault(s)}>{t('makeDefault')}</Button>}
                    <Button variant="ghost" size="sm" iconOnly aria-label={t('editName', { name: s.name })} icon={<Pencil size={16} />} onClick={() => { setEditing(s); setOpen(true); }} />
                    {!s.isDefault && <Button variant="ghost" size="sm" iconOnly aria-label={`${c('delete')} ${s.name}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(s)} />}
                  </div>
                }
              />
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('grade')}</th>
                      <th scope="col">{t('range')}</th>
                      <th scope="col" className="num">{t('points')}</th>
                      <th scope="col">{t('remark')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...s.bands].sort((a, b) => b.minPercent - a.minPercent).map((b) => (
                      <tr key={b.grade}>
                        <td className="bold">{b.grade}</td>
                        <td className="num">{b.minPercent}–{b.maxPercent}%</td>
                        <td className="num">{b.points ?? '—'}</td>
                        <td className="small muted">{b.remark ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ScaleModal open={open} onClose={() => setOpen(false)} scale={editing} />
    </div>
  );
}

interface BandRow { grade: string; minPercent: string; maxPercent: string; points: string; remark: string }

const DEFAULT_BANDS: BandRow[] = [
  { grade: 'A', minPercent: '75', maxPercent: '100', points: '1', remark: 'Excellent' },
  { grade: 'B', minPercent: '65', maxPercent: '74', points: '2', remark: 'Very good' },
  { grade: 'C', minPercent: '45', maxPercent: '64', points: '3', remark: 'Good' },
  { grade: 'D', minPercent: '30', maxPercent: '44', points: '4', remark: 'Satisfactory' },
  { grade: 'F', minPercent: '0', maxPercent: '29', points: '5', remark: 'Fail' },
];

function ScaleModal({ open, onClose, scale }: { open: boolean; onClose: () => void; scale: GradingScale | null }) {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [rows, setRows] = useState<BandRow[]>(DEFAULT_BANDS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setName(scale?.name ?? '');
    setDescription(scale?.description ?? '');
    setIsDefault(scale?.isDefault ?? false);
    setRows(scale
      ? [...scale.bands].sort((a, b) => b.minPercent - a.minPercent).map((b) => ({
          grade: b.grade, minPercent: String(b.minPercent), maxPercent: String(b.maxPercent), points: b.points == null ? '' : String(b.points), remark: b.remark ?? '',
        }))
      : DEFAULT_BANDS.map((b) => ({ ...b })));
  }, [open, scale]);

  const setRow = (i: number, k: keyof BandRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const mutation = useMutation({
    mutationFn: (payload: { name: string; description: string | null; isDefault: boolean; bands: GradeBand[] }) =>
      scale ? api.put<GradingScale>(`/grading-scales/${scale.id}`, payload) : api.post<GradingScale>('/grading-scales', payload),
    onSuccess: (saved) => {
      toast.success(scale ? t('nameSaved', { name: saved.name }) : t('nameAdded', { name: saved.name }));
      qc.invalidateQueries({ queryKey: ['grading-scales'] });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      setServerError(err instanceof Error ? err.message : null);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t('scaleNameErr');
    const bands: GradeBand[] = rows.map((r) => ({
      grade: r.grade.trim().toUpperCase(), minPercent: Number(r.minPercent), maxPercent: Number(r.maxPercent),
      points: r.points.trim() === '' ? null : Number(r.points), remark: r.remark.trim() || null,
    }));
    const bad = bands.some((b) => !b.grade || r0(b.minPercent) || r0(b.maxPercent) || b.minPercent > b.maxPercent || (b.points !== null && Number.isNaN(b.points)));
    if (!bands.length || bad) e.bands = t('bandsErr');
    setErrors(e);
    setServerError(null);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({ name: name.trim(), description: description.trim() || null, isDefault, bands });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={scale ? t('editName', { name: scale.name }) : t('newScale')}
      description={t('bandsHelp')}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{t('saveScale')}</Button></>}
    >
      <div className="stack">
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <div className="form-grid">
          <Field label={t('name')} required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Secondary (CSEE)" data-autofocus />
          </Field>
          <Field label={t('description')}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>{t('bands')}</legend>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('grade')}</th>
                  <th scope="col">{t('min')}</th>
                  <th scope="col">{t('max')}</th>
                  <th scope="col">{t('points')}</th>
                  <th scope="col">{t('remark')}</th>
                  <th scope="col"><span className="sr-only">{t('actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><Input className="input-sm" style={{ width: 60 }} value={r.grade} maxLength={4} aria-label={t('grade')} onChange={(e) => setRow(i, 'grade', e.target.value.toUpperCase())} /></td>
                    <td><Input className="input-sm" style={{ width: 76 }} type="number" min={0} max={100} value={r.minPercent} aria-label={`${t('min')} ${r.grade}`} onChange={(e) => setRow(i, 'minPercent', e.target.value)} /></td>
                    <td><Input className="input-sm" style={{ width: 76 }} type="number" min={0} max={100} value={r.maxPercent} aria-label={`${t('max')} ${r.grade}`} onChange={(e) => setRow(i, 'maxPercent', e.target.value)} /></td>
                    <td><Input className="input-sm" style={{ width: 70 }} type="number" min={0} value={r.points} aria-label={`${t('points')} ${r.grade}`} onChange={(e) => setRow(i, 'points', e.target.value)} /></td>
                    <td><Input className="input-sm" value={r.remark} aria-label={`${t('remark')} ${r.grade}`} onChange={(e) => setRow(i, 'remark', e.target.value)} /></td>
                    <td className="actions">
                      <Button variant="ghost" size="sm" iconOnly aria-label={t('removeBand', { grade: r.grade || i + 1 })} icon={<X size={16} />} disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors.bands && <span className="field-error mt-1">{errors.bands}</span>}
          <Button size="sm" className="mt-1" icon={<Plus size={15} />} onClick={() => setRows((rs) => [...rs, { grade: '', minPercent: '', maxPercent: '', points: '', remark: '' }])}>{t('addBand')}</Button>
        </fieldset>
        <label className="checkbox">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          {t('defaultScale')}
        </label>
      </div>
    </Modal>
  );
}

/** True when a percentage is missing or outside 0–100. */
function r0(n: number) {
  return Number.isNaN(n) || n < 0 || n > 100;
}
