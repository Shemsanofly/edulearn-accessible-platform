import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Download, Eye, NotebookPen, Pencil, Plus, Save, Trash2, Undo2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Assessment, AssessmentInput, AssessmentType, Course, Gradebook } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Select,
  StatCard, Textarea, cx,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatShortDate, fullName, gradeTone, letterGrade, percent, plural } from '../lib/format';

const TYPES: { value: AssessmentType; label: string }[] = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'test', label: 'Test' },
  { value: 'exam', label: 'Exam' },
  { value: 'project', label: 'Project' },
];
const typeLabel = (t: AssessmentType) => TYPES.find((x) => x.value === t)?.label ?? t;

export function GradebookPage() {
  const { courseId } = useParams();
  return courseId ? <CourseGradebook courseId={Number(courseId)} /> : <CoursePicker />;
}

// ---------------------------------------------------------------- Course picker
function CoursePicker() {
  const user = useUser();
  const q = useQuery({
    queryKey: ['courses', user.role === 'teacher' ? 'teacher-all' : 'all'],
    queryFn: () => api.get<Course[]>('/courses', user.role === 'teacher' ? { all: true } : undefined),
  });

  const groups = useMemo(() => {
    const map = new Map<string, Course[]>();
    for (const c of q.data ?? []) {
      if (!map.has(c.className)) map.set(c.className, []);
      map.get(c.className)!.push(c);
    }
    return [...map.entries()];
  }, [q.data]);

  return (
    <>
      <PageHeader title="Gradebook" description="Choose a course to enter and review scores." />
      {q.isLoading ? (
        <div className="grid grid-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} rows={3} />)}</div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : groups.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={26} />} title="No courses yet">Courses appear here once subjects are assigned to classes.</EmptyState></Card>
      ) : (
        <div className="grid grid-3">
          {groups.map(([className, courses]) => (
            <Card key={className}>
              <CardHeader title={className} subtitle={plural(courses.length, 'subject')} />
              <ul className="list">
                {courses.map((c) => {
                  const mine = user.role === 'admin' || c.teacherId === user.id;
                  return (
                    <li key={c.id}>
                      <Link to={`/gradebook/${c.id}`} className="list-item">
                        <span className="color-dot" style={{ background: c.color }} aria-hidden />
                        <div className="grow">
                          <div className="title">{c.subjectName}</div>
                          <div className="meta">{c.teacherName ?? 'No teacher assigned'}</div>
                        </div>
                        {!mine && <Badge tone="info"><Eye size={12} aria-hidden /> View only</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Course gradebook
const cellKey = (assessmentId: number, studentId: number) => `${assessmentId}:${studentId}`;

function CourseGradebook({ courseId }: { courseId: number }) {
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const highlight = params.get('assessment') ? Number(params.get('assessment')) : null;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Assessment | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const q = useQuery({ queryKey: ['gradebook', courseId], queryFn: () => api.get<Gradebook>(`/gradebook/${courseId}`) });
  const gb = q.data;
  const readOnly = !!gb && user.role === 'teacher' && gb.course.teacherId !== user.id;

  const original = useMemo(() => {
    const out: Record<string, string> = {};
    gb?.rows.forEach((r) => gb.assessments.forEach((a) => (out[cellKey(a.id, r.id)] = r.scores[a.id] == null ? '' : String(r.scores[a.id]))));
    return out;
  }, [gb]);

  const maxById = useMemo(() => new Map(gb?.assessments.map((a) => [a.id, a.maxScore]) ?? []), [gb]);

  const invalid = (key: string, value: string) => {
    if (value.trim() === '') return null;
    const n = Number(value);
    const max = maxById.get(Number(key.split(':')[0])) ?? 0;
    if (Number.isNaN(n)) return 'Enter a number';
    if (n < 0) return "Can't be negative";
    if (n > max) return `Max is ${max}`;
    return null;
  };

  const dirtyKeys = Object.keys(edits).filter((k) => edits[k]!.trim() !== (original[k] ?? ''));
  const invalidKeys = dirtyKeys.filter((k) => invalid(k, edits[k]!));

  // Warn before closing the tab with unsaved scores.
  useEffect(() => {
    if (!dirtyKeys.length) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyKeys.length]);

  useEffect(() => {
    if (highlight && gb) document.getElementById(`assessment-col-${highlight}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [highlight, gb]);

  const saveAll = async () => {
    if (invalidKeys.length) {
      toast.error('Some scores need fixing', `${plural(invalidKeys.length, 'cell')} highlighted in red.`);
      return;
    }
    const byAssessment = new Map<number, { studentId: number; score: number | null }[]>();
    for (const k of dirtyKeys) {
      const [aid, sid] = k.split(':').map(Number) as [number, number];
      const raw = edits[k]!.trim();
      if (!byAssessment.has(aid)) byAssessment.set(aid, []);
      byAssessment.get(aid)!.push({ studentId: sid, score: raw === '' ? null : Number(raw) });
    }
    setSaving(true);
    try {
      for (const [aid, grades] of byAssessment) await api.put(`/assessments/${aid}/grades`, { grades });
      setEdits({});
      await qc.invalidateQueries({ queryKey: ['gradebook', courseId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Scores saved', `${plural(dirtyKeys.length, 'score')} updated.`);
    } catch (err) {
      toast.error(err);
      qc.invalidateQueries({ queryKey: ['gradebook', courseId] });
    } finally {
      setSaving(false);
    }
  };

  const removeAssessment = useMutation({
    mutationFn: (id: number) => api.del(`/assessments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gradebook', courseId] });
      toast.success('Assessment deleted');
    },
    onError: (err) => toast.error(err),
  });

  const exportCsv = () => {
    if (!gb) return;
    const esc = (v: string | number | null) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Admission no', 'Student', ...gb.assessments.map((a) => `${shortTitle(a, gb.course)} (/${a.maxScore})`), 'Average %'];
    const lines = gb.rows.map((r) => [r.admissionNo, fullName(r), ...gb.assessments.map((a) => r.scores[a.id] ?? null), r.averagePercent].map(esc).join(','));
    const blob = new Blob([[header.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gb.course.className}-${gb.course.subjectName}-grades.csv`.replace(/\s+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  const moveFocus = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    let target: [number, number] | null = null;
    if (e.key === 'Enter' || e.key === 'ArrowDown') target = [row + 1, col];
    else if (e.key === 'ArrowUp') target = [row - 1, col];
    if (!target) return;
    e.preventDefault();
    document.querySelector<HTMLInputElement>(`[data-cell="${target[0]}-${target[1]}"]`)?.focus();
  };

  if (q.isLoading) return <CardSkeleton rows={10} />;
  if (q.error || !gb) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const { course, assessments, rows } = gb;
  const averages = rows.map((r) => r.averagePercent).filter((x): x is number => x !== null);
  const classAvg = averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null;
  const toGrade = assessments.reduce((s, a) => s + Math.max(0, a.studentCount - a.gradedCount), 0);

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/gradebook"><ArrowLeft size={14} aria-hidden style={{ display: 'inline', verticalAlign: '-2px' }} /> Gradebook</Link><span aria-hidden>/</span><span>{course.className}</span></>}
        title={<span className="row" style={{ gap: 10 }}><span className="color-dot" style={{ background: course.color, width: 14, height: 14 }} aria-hidden />{course.subjectName} · {course.className}</span>}
        description={course.teacherName ? `Taught by ${course.teacherName}` : 'No teacher assigned'}
        actions={
          <>
            <Button icon={<Download size={17} />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
            {!readOnly && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>New assessment</Button>}
          </>
        }
      />

      {readOnly && (
        <div className="mb-3">
          <Alert tone="info" icon={<Eye size={20} />} title="View only">Only {course.teacherName ?? 'the course teacher'} can enter scores for this course.</Alert>
        </div>
      )}

      <div className="grid grid-4 mb-3">
        <StatCard icon={<NotebookPen size={22} />} label="Class average" value={percent(classAvg, 1)} tone={gradeTone(classAvg)} hint={`Grade ${letterGrade(classAvg)}`} />
        <StatCard icon={<BookOpen size={22} />} label="Assessments" value={assessments.length} tone="accent" />
        <StatCard icon={<Users size={22} />} label="Students" value={rows.length} tone="info" />
        <StatCard icon={<Pencil size={22} />} label="Scores missing" value={toGrade} tone={toGrade ? 'warning' : 'success'} hint={toGrade ? 'Across all assessments' : 'All caught up'} />
      </div>

      <Card>
        {assessments.length === 0 ? (
          <EmptyState
            icon={<NotebookPen size={26} />}
            title="No assessments yet"
            action={!readOnly ? <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>Create the first assessment</Button> : undefined}
          >
            Add a quiz, test or assignment to start recording scores.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="No students in this class yet" />
        ) : (
          <div className="table-wrap">
            <table className="table gradebook">
              <caption className="sr-only">Scores for {course.subjectName}, {course.className}. Use Enter or the arrow keys to move between students.</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky">Student</th>
                  {assessments.map((a) => (
                    <th
                      key={a.id}
                      id={`assessment-col-${a.id}`}
                      scope="col"
                      className="assessment-head num"
                      style={a.id === highlight ? { background: 'var(--primary-soft)' } : undefined}
                    >
                      <span className="t" title={a.title}>{shortTitle(a, course)}</span>
                      <span className="m">{typeLabel(a.type)} · /{a.maxScore}{a.dueDate && ` · ${formatShortDate(a.dueDate)}`}</span>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 2, marginTop: 4 }}>
                        <Badge tone={gradeTone(a.averagePercent)} title="Class average">{percent(a.averagePercent)}</Badge>
                        {!readOnly && (
                          <>
                            <Button variant="ghost" size="sm" iconOnly aria-label={`Edit ${a.title}`} icon={<Pencil size={14} />} onClick={() => setEditing(a)} />
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              aria-label={`Delete ${a.title}`}
                              icon={<Trash2 size={14} />}
                              onClick={async () => {
                                if (await confirm({
                                  title: `Delete “${shortTitle(a, course)}”?`,
                                  message: a.gradedCount ? `This also deletes ${plural(a.gradedCount, 'recorded score')}. This can’t be undone.` : 'This can’t be undone.',
                                  confirmLabel: 'Delete assessment',
                                  danger: true,
                                })) removeAssessment.mutate(a.id);
                              }}
                            />
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                  <th scope="col" className="num">Average</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.id}>
                    <th scope="row" className="sticky" style={{ fontWeight: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: 'inherit', color: 'inherit', borderBottom: '1px solid var(--border)' }}>
                      <Link to={`/students/${r.id}`} className="cell-person" style={{ color: 'inherit' }}>
                        <Avatar name={fullName(r)} size="sm" />
                        <div className="truncate">
                          <div className="name truncate">{fullName(r)}</div>
                          <div className="sub">{r.admissionNo}</div>
                        </div>
                      </Link>
                    </th>
                    {assessments.map((a, ci) => {
                      const key = cellKey(a.id, r.id);
                      const value = edits[key] ?? original[key] ?? '';
                      const dirty = value.trim() !== (original[key] ?? '');
                      const err = dirty ? invalid(key, value) : null;
                      return (
                        <td key={a.id} className="num" style={a.id === highlight ? { background: 'color-mix(in srgb, var(--primary) 5%, transparent)' } : undefined}>
                          {readOnly ? (
                            <span className={cx(value === '' && 'subtle')}>{value === '' ? '—' : value}</span>
                          ) : (
                            <input
                              className={cx('input score-input', dirty && 'dirty')}
                              inputMode="decimal"
                              value={value}
                              data-cell={`${ri}-${ci}`}
                              aria-label={`${fullName(r)}, ${shortTitle(a, course)}, out of ${a.maxScore}`}
                              aria-invalid={err ? true : undefined}
                              title={err ?? undefined}
                              placeholder="—"
                              style={err ? { borderColor: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}
                              onChange={(e) => setEdits((x) => ({ ...x, [key]: e.target.value.replace(',', '.') }))}
                              onKeyDown={(e) => moveFocus(e, ri, ci)}
                              onFocus={(e) => e.target.select()}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="num">
                      <Badge tone={gradeTone(r.averagePercent)}>{percent(r.averagePercent, 1)} · {letterGrade(r.averagePercent)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly && assessments.length > 0 && rows.length > 0 && (
          <div className="card-footer" style={{ position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--surface)', borderRadius: '0 0 12px 12px', flexWrap: 'wrap' }}>
            <span className="small muted" aria-live="polite">
              {dirtyKeys.length === 0 ? 'All scores saved. Leave a cell empty to clear a score.' : (
                <>
                  <strong className="text-warning">{plural(dirtyKeys.length, 'unsaved change')}</strong>
                  {invalidKeys.length > 0 && <span className="text-danger"> · {plural(invalidKeys.length, 'cell')} need fixing</span>}
                </>
              )}
            </span>
            <div className="row" style={{ gap: 8 }}>
              {dirtyKeys.length > 0 && <Button variant="ghost" icon={<Undo2 size={16} />} onClick={() => setEdits({})} disabled={saving}>Discard</Button>}
              <Button variant="primary" icon={<Save size={17} />} loading={saving} disabled={dirtyKeys.length === 0} onClick={saveAll}>Save changes</Button>
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <AssessmentModal
          courseId={courseId}
          assessment={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** Seeded titles are prefixed with the subject ("Mathematics: Quiz 1") — drop the redundant prefix in the grid. */
function shortTitle(a: Assessment, course: Course) {
  const prefix = `${course.subjectName}: `;
  return a.title.startsWith(prefix) ? a.title.slice(prefix.length) : a.title;
}

// ---------------------------------------------------------------- Create / edit assessment
function AssessmentModal({ courseId, assessment, onClose }: { courseId: number; assessment: Assessment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    title: assessment?.title ?? '',
    type: assessment?.type ?? ('assignment' as AssessmentType),
    maxScore: assessment ? String(assessment.maxScore) : '100',
    dueDate: assessment?.dueDate ?? '',
    description: assessment?.description ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: (body: Omit<AssessmentInput, 'courseId'>) =>
      assessment ? api.patch<Assessment>(`/assessments/${assessment.id}`, body) : api.post<Assessment>('/assessments', { ...body, courseId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gradebook', courseId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(assessment ? 'Assessment updated' : 'Assessment created', assessment ? undefined : 'Enter scores in the new column.');
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error(err);
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Give the assessment a name';
    const max = Number(form.maxScore);
    if (!form.maxScore || Number.isNaN(max) || max <= 0) errs.maxScore = 'Enter a number above 0';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({
      title: form.title.trim(),
      type: form.type,
      maxScore: max,
      dueDate: form.dueDate || null,
      description: form.description.trim() || null,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={assessment ? 'Edit assessment' : 'New assessment'}
      description={assessment ? undefined : 'Students will see it in their upcoming work once it has a due date.'}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{assessment ? 'Save changes' : 'Create assessment'}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Title" required error={errors.title} className="span-2">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Chapter 4 quiz" maxLength={120} data-autofocus />
        </Field>
        <Field label="Type" required error={errors.type}>
          <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Marked out of" required error={errors.maxScore} hint="The maximum score">
          <Input type="number" min={1} step="any" inputMode="decimal" value={form.maxScore} onChange={(e) => set('maxScore', e.target.value)} />
        </Field>
        <Field label="Due date" error={errors.dueDate} className="span-2">
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label="Instructions" error={errors.description} hint="Optional — shown to students" className="span-2">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        </Field>
      </div>
    </Modal>
  );
}
