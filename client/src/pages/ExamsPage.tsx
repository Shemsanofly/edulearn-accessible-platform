import { RecordExcelPanel } from '../components/ExcelTools';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, CalendarRange, Download, Eye, EyeOff, NotebookPen, Pencil, Plus, Printer, Trash } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ClassListItem, ClassPerformance, Exam, ExamDetail, ExamPaper, GradingScale, Term } from '../../../shared/types';
import { ColumnChart } from '../components/charts';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Badge, Button, ButtonLink, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader,
  ProgressBar, Select, Tabs,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useUser } from '../lib/auth';
import { downloadCsv, printPage, slug } from '../lib/export';
import { formatDate, gradeTone, percent } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const fieldErrors = (err: unknown): Record<string, string> => (err instanceof ApiError && err.details ? err.details : {});

const M = {
  en: {
    title: 'Examinations', subtitle: 'Plan exams, follow mark entry and publish results to families.',
    teacherSubtitle: 'Exams for the classes you teach. Enter marks from the gradebook.',
    newExam: 'New exam', noExams: 'No exams yet', noExamsHint: 'Create an exam and every subject in the chosen classes gets a paper ready for marks.',
    noExamsTeacher: 'There are no exams for your classes yet.',
    published: 'Results published', notPublished: 'Not published', marksEntered: '{done} of {total} marks entered',
    publish: 'Publish results', unpublish: 'Unpublish', open: 'Open',
    publishQ: 'Publish {name} results?', publishMsg: 'Students and parents will be notified and can see their report cards straight away.',
    unpublishQ: 'Unpublish {name} results?', unpublishMsg: 'Report cards will be hidden from students and parents until you publish again.',
    publishedToast: 'Results published', publishedHint: 'Families have been notified.', unpublishedToast: 'Results hidden from families',
    deleteQ: 'Delete {name}?', deleteMsg: 'The exam and its papers will be removed.', deleteBtn: 'Delete exam',
    deleteMarksQ: 'Delete {name} and its marks?', deleteMarksBtn: 'Delete exam and marks', deleted: '{name} deleted',
    editExam: 'Edit {name}', name: 'Exam name', term: 'Term', currentTerm: 'Current term', scale: 'Grading scale', defaultScale: 'Default scale',
    startsOn: 'Starts on', endsOn: 'Ends on', maxMarks: 'Marks per paper', classes: 'Classes', selectAll: 'Select all',
    nameErr: 'Name the exam, e.g. Mid-Term Examination', startErr: 'Choose the first day', endErr: 'Must be on or after the start date',
    classesErr: 'Choose at least one class', maxErr: 'Enter a number above 0', created: '{name} created', createdHint: 'A paper was prepared for every subject in each class.',
    saved: 'Saved {name}', createExam: 'Create exam', classesHint: 'Each subject taught in these classes gets an exam paper in the gradebook.',
    // Detail
    back: 'Examinations', markEntry: 'Mark entry', classResults: 'Class results', enterMarks: 'Enter marks', classAverage: 'Class average',
    graded: '{done}/{total} marked', noTeacher: 'No teacher', noPapers: 'No papers for your classes in this exam',
    chooseClass: 'Class', subjectAverages: 'Subject averages', distribution: 'Grade distribution', ranking: 'Class ranking',
    position: 'Pos.', student: 'Student', admission: 'Adm. no.', total: 'Total', average: 'Average', grade: 'Grade', subject: 'Subject',
    noResultsYet: 'No marks have been entered for this class yet', viewReport: 'Report card', subjectsCount: '{n} subjects',
    exportCsv: 'Export CSV', print: 'Print', dates: 'Dates',
  },
  sw: {
    title: 'Mitihani', subtitle: 'Panga mitihani, fuatilia uingizaji wa alama na toa matokeo kwa familia.',
    teacherSubtitle: 'Mitihani ya madarasa unayofundisha. Ingiza alama kupitia daftari la alama.',
    newExam: 'Mtihani mpya', noExams: 'Bado hakuna mitihani', noExamsHint: 'Unda mtihani na kila somo katika madarasa uliyochagua litapata karatasi tayari kwa alama.',
    noExamsTeacher: 'Bado hakuna mitihani kwa madarasa yako.',
    published: 'Matokeo yametolewa', notPublished: 'Hayajatolewa', marksEntered: 'Alama {done} kati ya {total} zimeingizwa',
    publish: 'Toa matokeo', unpublish: 'Ficha matokeo', open: 'Fungua',
    publishQ: 'Toa matokeo ya {name}?', publishMsg: 'Wanafunzi na wazazi watapewa taarifa na wataona ripoti zao mara moja.',
    unpublishQ: 'Ficha matokeo ya {name}?', unpublishMsg: 'Ripoti zitafichwa kwa wanafunzi na wazazi hadi utakapozitoa tena.',
    publishedToast: 'Matokeo yametolewa', publishedHint: 'Familia zimepewa taarifa.', unpublishedToast: 'Matokeo yamefichwa kwa familia',
    deleteQ: 'Futa {name}?', deleteMsg: 'Mtihani na karatasi zake zitaondolewa.', deleteBtn: 'Futa mtihani',
    deleteMarksQ: 'Futa {name} pamoja na alama zake?', deleteMarksBtn: 'Futa mtihani na alama', deleted: '{name} umefutwa',
    editExam: 'Hariri {name}', name: 'Jina la mtihani', term: 'Muhula', currentTerm: 'Muhula wa sasa', scale: 'Kipimo cha madaraja', defaultScale: 'Kipimo chaguo-msingi',
    startsOn: 'Unaanza', endsOn: 'Unaisha', maxMarks: 'Alama kwa kila karatasi', classes: 'Madarasa', selectAll: 'Chagua yote',
    nameErr: 'Taja mtihani, mf. Mtihani wa Katikati ya Muhula', startErr: 'Chagua siku ya kwanza', endErr: 'Lazima iwe siku ya kuanza au baadaye',
    classesErr: 'Chagua angalau darasa moja', maxErr: 'Andika namba zaidi ya 0', created: '{name} umeundwa', createdHint: 'Karatasi imeandaliwa kwa kila somo katika kila darasa.',
    saved: '{name} umehifadhiwa', createExam: 'Unda mtihani', classesHint: 'Kila somo linalofundishwa katika madarasa haya litapata karatasi ya mtihani kwenye daftari la alama.',
    back: 'Mitihani', markEntry: 'Uingizaji wa alama', classResults: 'Matokeo ya darasa', enterMarks: 'Ingiza alama', classAverage: 'Wastani wa darasa',
    graded: '{done}/{total} wamesahihishwa', noTeacher: 'Hakuna mwalimu', noPapers: 'Hakuna karatasi za madarasa yako katika mtihani huu',
    chooseClass: 'Darasa', subjectAverages: 'Wastani kwa somo', distribution: 'Mgawanyo wa madaraja', ranking: 'Nafasi darasani',
    position: 'Nafasi', student: 'Mwanafunzi', admission: 'Na. usajili', total: 'Jumla', average: 'Wastani', grade: 'Daraja', subject: 'Somo',
    noResultsYet: 'Bado hakuna alama zilizoingizwa kwa darasa hili', viewReport: 'Ripoti', subjectsCount: 'Masomo {n}',
    exportCsv: 'Hamisha CSV', print: 'Chapisha', dates: 'Tarehe',
  },
};

// ---------------------------------------------------------------- List
export function ExamsPage() {
  const t = useT(M);
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [editing, setEditing] = useState<Exam | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['exams'], queryFn: () => api.get<Exam[]>('/exams') });
  const actions = useExamActions();

  return (
    <>
      <PageHeader
        title={t('title')}
        description={isAdmin ? t('subtitle') : t('teacherSubtitle')}
        actions={isAdmin && <Button variant="primary" icon={<Plus size={17} />} onClick={() => { setEditing(null); setOpen(true); }}>{t('newExam')}</Button>}
      />
      {isAdmin && <RecordExcelPanel areas={[{ resource: 'exams', label: 'Exams' }]} />}
      {isLoading ? (
        <div className="grid grid-2"><CardSkeleton rows={4} /><CardSkeleton rows={4} /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Award size={26} />}
            title={t('noExams')}
            action={isAdmin && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t('newExam')}</Button>}
          >
            {isAdmin ? t('noExamsHint') : t('noExamsTeacher')}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-2">
          {data.map((exam) => {
            const pct = exam.marksExpected ? (exam.marksEntered / exam.marksExpected) * 100 : 0;
            return (
              <Card key={exam.id} className="card-hover">
                <div className="card-body stack" style={{ gap: 12 }}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <Link to={`/exams/${exam.id}`} style={{ color: 'var(--text)' }}><h2 className="truncate">{exam.name}</h2></Link>
                      <div className="small muted mt-1 row row-wrap" style={{ gap: 6 }}>
                        <CalendarRange size={14} aria-hidden />
                        {formatDate(exam.startsOn)} – {formatDate(exam.endsOn)}
                        {exam.termName && <> · {exam.termName}</>}
                      </div>
                    </div>
                    {exam.publishedAt ? <Badge tone="success" dot>{t('published')}</Badge> : <Badge tone="warning" dot>{t('notPublished')}</Badge>}
                  </div>
                  <div className="row row-wrap" style={{ gap: 6 }}>
                    {exam.classes.map((c) => <span key={c.id} className="chip">{c.name}</span>)}
                  </div>
                  <div>
                    <div className="row between small"><span className="muted">{t('marksEntered', { done: exam.marksEntered, total: exam.marksExpected })}</span><strong className="num">{percent(pct)}</strong></div>
                    <div className="mt-1"><ProgressBar value={pct} tone={pct >= 100 ? 'success' : 'primary'} label={t('marksEntered', { done: exam.marksEntered, total: exam.marksExpected })} /></div>
                  </div>
                  <div className="row row-wrap" style={{ gap: 8 }}>
                    <ButtonLink to={`/exams/${exam.id}`} size="sm" variant="primary" icon={<NotebookPen size={15} />}>{t('open')}</ButtonLink>
                    {isAdmin && (
                      <>
                        <Button size="sm" icon={exam.publishedAt ? <EyeOff size={15} /> : <Eye size={15} />} onClick={() => actions.togglePublish(exam)}>
                          {exam.publishedAt ? t('unpublish') : t('publish')}
                        </Button>
                        <Button size="sm" variant="ghost" iconOnly aria-label={t('editExam', { name: exam.name })} icon={<Pencil size={15} />} onClick={() => { setEditing(exam); setOpen(true); }} />
                        <Button size="sm" variant="ghost" iconOnly aria-label={`${t('deleteBtn')}: ${exam.name}`} className="text-danger" icon={<Trash size={15} />} onClick={() => actions.remove(exam)} />
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {isAdmin && <ExamModal open={open} onClose={() => setOpen(false)} exam={editing} />}
    </>
  );
}

/** Publish/unpublish and delete, shared by the list and the detail page. */
function useExamActions(onDeleted?: () => void) {
  const t = useT(M);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['exams'] });
    qc.invalidateQueries({ queryKey: ['exam'] });
  };

  const togglePublish = async (exam: Exam) => {
    const publish = !exam.publishedAt;
    const ok = await confirm({
      title: publish ? t('publishQ', { name: exam.name }) : t('unpublishQ', { name: exam.name }),
      message: publish ? t('publishMsg') : t('unpublishMsg'),
      confirmLabel: publish ? t('publish') : t('unpublish'),
      danger: !publish,
    });
    if (!ok) return;
    try {
      await api.post(`/exams/${exam.id}/publish`, { publish });
      if (publish) toast.success(t('publishedToast'), t('publishedHint'));
      else toast.success(t('unpublishedToast'));
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (exam: Exam) => {
    const ok = await confirm({ title: t('deleteQ', { name: exam.name }), message: t('deleteMsg'), confirmLabel: t('deleteBtn'), danger: true });
    if (!ok) return;
    try {
      await api.del(`/exams/${exam.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const again = await confirm({ title: t('deleteMarksQ', { name: exam.name }), message: err.message, confirmLabel: t('deleteMarksBtn'), danger: true });
        if (!again) return;
        try {
          await api.del(`/exams/${exam.id}?force=true`);
        } catch (err2) {
          toast.error(err2);
          return;
        }
      } else {
        toast.error(err);
        return;
      }
    }
    toast.success(t('deleted', { name: exam.name }));
    refresh();
    onDeleted?.();
  };

  return { togglePublish, remove };
}

function ExamModal({ open, onClose, exam }: { open: boolean; onClose: () => void; exam: Exam | null }) {
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const terms = useQuery({ queryKey: ['terms'], queryFn: () => api.get<Term[]>('/terms'), enabled: open });
  const scales = useQuery({ queryKey: ['grading-scales'], queryFn: () => api.get<GradingScale[]>('/grading-scales'), enabled: open });
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<ClassListItem[]>('/classes'), enabled: open });
  const [form, setForm] = useState({ name: '', termId: '', gradingScaleId: '', startsOn: '', endsOn: '', maxMarks: '100' });
  const [classIds, setClassIds] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(exam
      ? { name: exam.name, termId: exam.termId ? String(exam.termId) : '', gradingScaleId: exam.gradingScaleId ? String(exam.gradingScaleId) : '', startsOn: exam.startsOn, endsOn: exam.endsOn, maxMarks: String(exam.maxMarks) }
      : { name: '', termId: '', gradingScaleId: '', startsOn: '', endsOn: '', maxMarks: '100' });
    setClassIds(exam ? exam.classes.map((cl) => cl.id) : []);
  }, [open, exam]);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => (exam ? api.patch<Exam>(`/exams/${exam.id}`, payload) : api.post<Exam>('/exams', payload)),
    onSuccess: (saved) => {
      if (exam) toast.success(t('saved', { name: saved.name }));
      else toast.success(t('created', { name: saved.name }), t('createdHint'));
      qc.invalidateQueries({ queryKey: ['exams'] });
      qc.invalidateQueries({ queryKey: ['exam'] });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t('nameErr');
    if (!form.startsOn) e.startsOn = t('startErr');
    if (!form.endsOn || (form.startsOn && form.endsOn < form.startsOn)) e.endsOn = t('endErr');
    if (!(Number(form.maxMarks) > 0)) e.maxMarks = t('maxErr');
    if (!classIds.length) e.classIds = t('classesErr');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({
      name: form.name.trim(), startsOn: form.startsOn, endsOn: form.endsOn, maxMarks: Number(form.maxMarks), classIds,
      termId: form.termId ? Number(form.termId) : null, gradingScaleId: form.gradingScaleId ? Number(form.gradingScaleId) : null,
    });
  };

  const toggleClass = (id: number) => setClassIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const all = classes.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      title={exam ? t('editExam', { name: exam.name }) : t('newExam')}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button type="submit" variant="primary" loading={mutation.isPending}>{exam ? c('saveChanges') : t('createExam')}</Button></>}
    >
      <div className="form-grid">
        <Field label={t('name')} required error={errors.name} className="span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mid-Term Examination" data-autofocus />
        </Field>
        <Field label={t('term')} error={errors.termId}>
          <Select value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
            <option value="">{t('currentTerm')}</option>
            {terms.data?.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
          </Select>
        </Field>
        <Field label={t('scale')} error={errors.gradingScaleId}>
          <Select value={form.gradingScaleId} onChange={(e) => setForm({ ...form, gradingScaleId: e.target.value })}>
            <option value="">{t('defaultScale')}</option>
            {scales.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t('startsOn')} required error={errors.startsOn}>
          <Input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
        </Field>
        <Field label={t('endsOn')} required error={errors.endsOn}>
          <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        </Field>
        <Field label={t('maxMarks')} required error={errors.maxMarks}>
          <Input type="number" min={1} max={1000} value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} />
        </Field>
        <fieldset className="field span-2" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">{t('classes')} <span className="req" aria-hidden>*</span></legend>
          <span className="field-hint" style={{ marginBottom: 6 }}>{t('classesHint')}</span>
          <label className="checkbox" style={{ marginBottom: 6 }}>
            <input type="checkbox" checked={all.length > 0 && classIds.length === all.length} onChange={(e) => setClassIds(e.target.checked ? all.map((cl) => cl.id) : [])} />
            {t('selectAll')}
          </label>
          <div className="grid grid-2" style={{ gap: 6 }}>
            {all.map((cl) => (
              <label key={cl.id} className="checkbox">
                <input type="checkbox" checked={classIds.includes(cl.id)} onChange={() => toggleClass(cl.id)} />
                {cl.name}
              </label>
            ))}
          </div>
          {errors.classIds && <span className="field-error">{errors.classIds}</span>}
        </fieldset>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Detail
type DetailTab = 'marks' | 'results';

export function ExamDetailPage() {
  const t = useT(M);
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: DetailTab = params.get('tab') === 'results' ? 'results' : 'marks';
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['exam', id], queryFn: () => api.get<ExamDetail>(`/exams/${id}`) });
  const actions = useExamActions(() => navigate('/exams'));

  if (isLoading) return <CardSkeleton rows={8} />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const pct = data.marksExpected ? (data.marksEntered / data.marksExpected) * 100 : 0;
  const setTab = (next: DetailTab) => {
    const p = new URLSearchParams(params);
    if (next === 'marks') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/exams">{t('back')}</Link><span aria-hidden>/</span><span>{data.name}</span></>}
        title={<span className="row row-wrap" style={{ gap: 10 }}>{data.name}{data.publishedAt ? <Badge tone="success" dot>{t('published')}</Badge> : <Badge tone="warning" dot>{t('notPublished')}</Badge>}</span>}
        description={`${formatDate(data.startsOn)} – ${formatDate(data.endsOn)}${data.termName ? ` · ${data.termName}` : ''}${data.gradingScaleName ? ` · ${data.gradingScaleName}` : ''}`}
        actions={isAdmin && (
          <>
            <Button icon={data.publishedAt ? <EyeOff size={16} /> : <Eye size={16} />} variant={data.publishedAt ? 'secondary' : 'primary'} onClick={() => actions.togglePublish(data)}>
              {data.publishedAt ? t('unpublish') : t('publish')}
            </Button>
            <Button icon={<Pencil size={16} />} onClick={() => setEditing(true)}>{t('editExam', { name: '' }).trim()}</Button>
            <Button variant="ghost" iconOnly aria-label={t('deleteBtn')} className="text-danger" icon={<Trash size={16} />} onClick={() => actions.remove(data)} />
          </>
        )}
      />
      <RecordExcelPanel areas={[{ resource: 'report-remarks', label: 'Report-card remarks', scope: { examId: data.id } }]} />
      <Card className="mb-3">
        <div className="card-body">
          <div className="row between small"><span className="muted">{t('marksEntered', { done: data.marksEntered, total: data.marksExpected })}</span><strong className="num">{percent(pct)}</strong></div>
          <div className="mt-1"><ProgressBar value={pct} tone={pct >= 100 ? 'success' : 'primary'} label={t('marksEntered', { done: data.marksEntered, total: data.marksExpected })} /></div>
        </div>
      </Card>
      <Tabs label={data.name} value={tab} onChange={setTab} tabs={[{ id: 'marks', label: t('markEntry') }, { id: 'results', label: t('classResults') }]} />
      <div role="tabpanel">{tab === 'marks' ? <PapersPanel exam={data} /> : <ResultsPanel exam={data} />}</div>
      {isAdmin && <ExamModal open={editing} onClose={() => setEditing(false)} exam={data} />}
    </>
  );
}

function PapersPanel({ exam }: { exam: ExamDetail }) {
  const t = useT(M);
  const groups = useMemo(() => {
    const map = new Map<string, ExamPaper[]>();
    for (const p of exam.papers) map.set(p.className, [...(map.get(p.className) ?? []), p]);
    return [...map.entries()];
  }, [exam.papers]);

  if (!groups.length) return <Card><EmptyState icon={<NotebookPen size={26} />} title={t('noPapers')} /></Card>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      {groups.map(([className, papers]) => {
        const done = papers.reduce((s, p) => s + p.graded, 0);
        const total = papers.reduce((s, p) => s + p.students, 0);
        return (
          <Card key={className}>
            <CardHeader title={className} subtitle={`${t('subjectsCount', { n: papers.length })} · ${t('graded', { done, total })}`} />
            <ul className="list">
              {papers.map((p) => {
                const pct = p.students ? (p.graded / p.students) * 100 : 0;
                return (
                  <li key={p.assessmentId} className="list-item" style={{ flexWrap: 'wrap' }}>
                    <span className="color-dot" style={{ background: p.color }} aria-hidden />
                    <div className="grow" style={{ minWidth: 160 }}>
                      <div className="title">{p.subjectName}</div>
                      <div className="meta">{p.teacherName ?? t('noTeacher')}</div>
                    </div>
                    <div style={{ width: 160 }}>
                      <div className="tiny muted">{t('graded', { done: p.graded, total: p.students })}</div>
                      <ProgressBar value={pct} tone={pct >= 100 ? 'success' : 'primary'} label={`${p.subjectName} ${t('graded', { done: p.graded, total: p.students })}`} />
                    </div>
                    <div className="text-right" style={{ width: 90 }}>
                      <div className="tiny muted">{t('classAverage')}</div>
                      <Badge tone={gradeTone(p.averagePercent)}>{percent(p.averagePercent, 1)}</Badge>
                    </div>
                    <ButtonLink to={`/gradebook/${p.courseId}?assessment=${p.assessmentId}`} size="sm" icon={<NotebookPen size={15} />}>{t('enterMarks')}</ButtonLink>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function ResultsPanel({ exam }: { exam: ExamDetail }) {
  const t = useT(M);
  const classOptions = useMemo(() => {
    // Teachers only see classes they have papers for.
    const withPapers = new Set(exam.papers.map((p) => p.classId));
    return exam.classes.filter((c) => withPapers.has(c.id));
  }, [exam]);
  const [classId, setClassId] = useState<number | null>(classOptions[0]?.id ?? null);
  useEffect(() => {
    if (classId === null && classOptions[0]) setClassId(classOptions[0].id);
  }, [classOptions, classId]);

  const perf = useQuery({
    queryKey: ['exam', exam.id, 'performance', classId],
    queryFn: () => api.get<ClassPerformance>(`/exams/${exam.id}/performance`, { classId: classId! }),
    enabled: classId !== null,
  });

  if (!classOptions.length) return <Card><EmptyState icon={<Award size={26} />} title={t('noPapers')} /></Card>;

  const p = perf.data;
  const exportCsv = () => {
    if (!p) return;
    downloadCsv(
      slug(`${exam.name} ${p.className} results`),
      [t('position'), t('student'), t('admission'), t('total'), t('average'), t('grade')],
      p.ranking.map((r) => [r.position, r.name, r.admissionNo, r.total, r.averagePercent, r.grade]),
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row row-wrap between no-print">
        <Field label={t('chooseClass')}>
          <Select value={classId ?? ''} onChange={(e) => setClassId(Number(e.target.value))} style={{ minWidth: 200 }}>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="row" style={{ gap: 8 }}>
          <Button icon={<Download size={16} />} onClick={exportCsv} disabled={!p}>{t('exportCsv')}</Button>
          <Button icon={<Printer size={16} />} onClick={printPage} disabled={!p}>{t('print')}</Button>
        </div>
      </div>
      <h2 className="print-only">{exam.name} · {p?.className}</h2>
      {perf.isLoading ? <CardSkeleton rows={6} /> : perf.error ? <ErrorState error={perf.error} onRetry={perf.refetch} /> : !p ? null : !p.ranking.length ? (
        <Card><EmptyState icon={<NotebookPen size={26} />} title={t('noResultsYet')} /></Card>
      ) : (
        <>
          <div className="grid grid-2">
            <Card>
              <CardHeader title={t('subjectAverages')} />
              <div className="card-body">
                <ColumnChart
                  label={t('subjectAverages')}
                  data={p.subjects.map((s) => ({ label: s.subjectName.slice(0, 4), title: s.subjectName, value: s.averagePercent }))}
                  color="var(--accent)"
                />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('distribution')} />
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('subject')}</th>
                      {p.bands.map((b) => <th key={b.grade} scope="col" className="num">{b.grade}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {p.subjects.map((s) => (
                      <tr key={s.subjectName}>
                        <td><span className="row" style={{ gap: 8 }}><span className="color-dot" style={{ background: s.color }} aria-hidden />{s.subjectName}</span></td>
                        {p.bands.map((b) => <td key={b.grade} className="num">{s.distribution[b.grade] ?? 0}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title={t('ranking')} subtitle={p.className} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col" className="num">{t('position')}</th>
                    <th scope="col">{t('student')}</th>
                    <th scope="col">{t('admission')}</th>
                    <th scope="col" className="num">{t('total')}</th>
                    <th scope="col" className="num">{t('average')}</th>
                    <th scope="col">{t('grade')}</th>
                    <th scope="col" className="actions no-print"><span className="sr-only">{t('viewReport')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {p.ranking.map((r) => (
                    <tr key={r.studentId}>
                      <td className="num bold">{r.position}</td>
                      <td className="bold">{r.name}</td>
                      <td className="mono small">{r.admissionNo}</td>
                      <td className="num">{r.total}</td>
                      <td className="num">{percent(r.averagePercent, 1)}</td>
                      <td><Badge tone={gradeTone(r.averagePercent)}>{r.grade ?? '—'}</Badge></td>
                      <td className="actions no-print"><Link to={`/report-cards/${exam.id}/${r.studentId}`} className="small bold">{t('viewReport')}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {!exam.publishedAt && <Alert tone="info" title={t('notPublished')}>{t('unpublishMsg')}</Alert>}
        </>
      )}
    </div>
  );
}
