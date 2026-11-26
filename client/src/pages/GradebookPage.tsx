import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Award, BookOpen, Download, Eye, FileUp, NotebookPen, Paperclip, Pencil, Plus, Save, Trash2, Undo2, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Assessment, AssessmentInput, AssessmentType, AttachmentInfo, Course, Gradebook } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Select,
  StatCard, StatGroup, Textarea, cx,
} from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useUser } from '../lib/auth';
import { downloadCsv, slug } from '../lib/export';
import { formatShortDate, fullName, gradeTone, letterGrade, percent } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    tAssignment: 'Assignment', tQuiz: 'Quiz', tTest: 'Test', tExam: 'Exam', tProject: 'Project',
    chooseCourse: 'Choose a course to enter and review scores.',
    noCourses: 'No courses yet', noCoursesBody: 'Courses appear here once subjects are assigned to classes.',
    subjects: '{n} subjects', oneSubject: '1 subject', noTeacher: 'No teacher assigned', viewOnly: 'View only',
    enterNumber: 'Enter a number', negative: 'Can’t be negative', maxIs: 'Max is {max}',
    fixScores: 'Some scores need fixing', cellsRed: '{n} highlighted in red.',
    scoresSaved: 'Scores saved', scoresUpdated: '{n} scores updated.', oneScoreUpdated: '1 score updated.',
    assessmentDeleted: 'Assessment deleted',
    csvAdmission: 'Admission no', csvStudent: 'Student', csvAverage: 'Average %',
    taughtBy: 'Taught by {name}', exportCsv: 'Export to Excel (CSV)', newAssessment: 'New assessment',
    viewOnlyBody: 'Only {name} can enter scores for this course.', theTeacher: 'the course teacher',
    classAverage: 'Class average', grade: 'Grade {g}', assessments: 'Assessments', students: 'Students',
    scoresMissing: 'Scores missing', acrossAll: 'Across all assessments', caughtUp: 'All caught up',
    noAssessments: 'No assessments yet', createFirst: 'Create the first assessment',
    noAssessmentsBody: 'Add a quiz, test or assignment to start recording scores.',
    noStudents: 'No students in this class yet',
    caption: 'Scores for {subject}, {className}. Use Enter or the arrow keys to move between students.',
    student: 'Student', average: 'Average', examPaper: 'Exam paper: {name}', files: '{n} files attached',
    edit: 'Edit {title}', delete: 'Delete {title}', deleteTitle: 'Delete “{title}”?',
    deleteWithScores: 'This also deletes {n} recorded scores. This can’t be undone.', cantUndo: 'This can’t be undone.',
    deleteAssessment: 'Delete assessment', cellLabel: '{name}, {title}, out of {max}',
    allSaved: 'All scores saved. Leave a cell empty to clear a score.',
    unsaved: '{n} unsaved changes', unsavedOne: '1 unsaved change', needFixing: '{n} need fixing',
    discard: 'Discard',
    updated: 'Assessment updated', created: 'Assessment created', enterInColumn: 'Enter scores in the new column.',
    eTitle: 'Give the assessment a name', eMax: 'Enter a number above 0',
    editAssessment: 'Edit assessment', newHint: 'Students and parents see it in their assignments; files you attach can be downloaded.',
    createAssessment: 'Create assessment',
    title: 'Title', titlePh: 'e.g. Chapter 4 quiz', type: 'Type', outOf: 'Marked out of', outOfHint: 'The maximum score',
    dueDate: 'Due date', instructions: 'Instructions', instructionsHint: 'Optional — shown to students and parents',
    examLocked: 'This is a paper of the exam “{name}”. Its type and maximum marks are set on the Examinations page.',
    attachments: 'Attachments', attachHint: 'PDF, Word, Excel, PowerPoint, text or images · up to 5 MB each · max 5 files',
    addFiles: 'Add files', uploading: 'Uploading…', removeFile: 'Remove {name}', willUpload: 'Will be uploaded when you create the assessment',
    tooBig: '{name} is larger than 5 MB', badType: '{name} isn’t a supported file type', tooMany: 'An assignment can have up to 5 files',
    uploaded: 'File uploaded', fileRemoved: 'File removed', uploadFailed: 'Couldn’t upload {name}',
    noFiles: 'No files attached yet.',
  },
  sw: {
    tAssignment: 'Kazi', tQuiz: 'Jaribio fupi', tTest: 'Jaribio', tExam: 'Mtihani', tProject: 'Mradi',
    chooseCourse: 'Chagua somo ili kuingiza na kukagua alama.',
    noCourses: 'Bado hakuna masomo', noCoursesBody: 'Masomo yataonekana hapa yakishapangiwa madarasa.',
    subjects: 'Masomo {n}', oneSubject: 'Somo 1', noTeacher: 'Hakuna mwalimu aliyepangwa', viewOnly: 'Kutazama tu',
    enterNumber: 'Andika namba', negative: 'Haiwezi kuwa chini ya sifuri', maxIs: 'Upeo ni {max}',
    fixScores: 'Baadhi ya alama zinahitaji kurekebishwa', cellsRed: 'Visanduku {n} vimewekwa rangi nyekundu.',
    scoresSaved: 'Alama zimehifadhiwa', scoresUpdated: 'Alama {n} zimesasishwa.', oneScoreUpdated: 'Alama 1 imesasishwa.',
    assessmentDeleted: 'Tathmini imefutwa',
    csvAdmission: 'Namba ya usajili', csvStudent: 'Mwanafunzi', csvAverage: 'Wastani %',
    taughtBy: 'Linafundishwa na {name}', exportCsv: 'Hamisha kwa Excel (CSV)', newAssessment: 'Tathmini mpya',
    viewOnlyBody: 'Ni {name} pekee anayeweza kuingiza alama za somo hili.', theTeacher: 'mwalimu wa somo',
    classAverage: 'Wastani wa darasa', grade: 'Daraja {g}', assessments: 'Tathmini', students: 'Wanafunzi',
    scoresMissing: 'Alama zinazokosekana', acrossAll: 'Katika tathmini zote', caughtUp: 'Zote zimekamilika',
    noAssessments: 'Bado hakuna tathmini', createFirst: 'Unda tathmini ya kwanza',
    noAssessmentsBody: 'Ongeza jaribio, mtihani au kazi ili kuanza kurekodi alama.',
    noStudents: 'Bado hakuna wanafunzi katika darasa hili',
    caption: 'Alama za {subject}, {className}. Tumia Enter au vitufe vya mishale kuhamia mwanafunzi mwingine.',
    student: 'Mwanafunzi', average: 'Wastani', examPaper: 'Karatasi ya mtihani: {name}', files: 'Faili {n} zimeambatishwa',
    edit: 'Hariri {title}', delete: 'Futa {title}', deleteTitle: 'Futa “{title}”?',
    deleteWithScores: 'Hii pia itafuta alama {n} zilizorekodiwa. Haiwezi kutenduliwa.', cantUndo: 'Haiwezi kutenduliwa.',
    deleteAssessment: 'Futa tathmini', cellLabel: '{name}, {title}, kati ya {max}',
    allSaved: 'Alama zote zimehifadhiwa. Acha kisanduku wazi kufuta alama.',
    unsaved: 'Mabadiliko {n} hayajahifadhiwa', unsavedOne: 'Badiliko 1 halijahifadhiwa', needFixing: '{n} vinahitaji kurekebishwa',
    discard: 'Achana nayo',
    updated: 'Tathmini imesasishwa', created: 'Tathmini imeundwa', enterInColumn: 'Ingiza alama kwenye safu mpya.',
    eTitle: 'Ipe tathmini jina', eMax: 'Andika namba kubwa kuliko 0',
    editAssessment: 'Hariri tathmini', newHint: 'Wanafunzi na wazazi wataiona kwenye kazi zao; faili unazoambatisha zinaweza kupakuliwa.',
    createAssessment: 'Unda tathmini',
    title: 'Jina', titlePh: 'mf. Jaribio la sura ya 4', type: 'Aina', outOf: 'Alama za juu', outOfHint: 'Alama ya juu kabisa',
    dueDate: 'Tarehe ya mwisho', instructions: 'Maelekezo', instructionsHint: 'Si lazima — yataonekana kwa wanafunzi na wazazi',
    examLocked: 'Hii ni karatasi ya mtihani “{name}”. Aina yake na alama za juu huwekwa kwenye ukurasa wa Mitihani.',
    attachments: 'Viambatisho', attachHint: 'PDF, Word, Excel, PowerPoint, maandishi au picha · hadi MB 5 kila moja · faili 5 zaidi',
    addFiles: 'Ongeza faili', uploading: 'Inapakia…', removeFile: 'Ondoa {name}', willUpload: 'Itapakiwa ukiunda tathmini',
    tooBig: '{name} ni kubwa kuliko MB 5', badType: '{name} si aina ya faili inayokubalika', tooMany: 'Kazi moja inaweza kuwa na faili hadi 5',
    uploaded: 'Faili imepakiwa', fileRemoved: 'Faili imeondolewa', uploadFailed: 'Imeshindikana kupakia {name}',
    noFiles: 'Bado hakuna faili zilizoambatishwa.',
  },
};
type MKey = keyof typeof M.en;

const TYPES: { value: AssessmentType; label: MKey }[] = [
  { value: 'assignment', label: 'tAssignment' },
  { value: 'quiz', label: 'tQuiz' },
  { value: 'test', label: 'tTest' },
  { value: 'exam', label: 'tExam' },
  { value: 'project', label: 'tProject' },
];
const typeKey = (t: AssessmentType): MKey => TYPES.find((x) => x.value === t)?.label ?? 'tAssignment';

const MAX_FILE = 5 * 1024 * 1024;
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp';
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};
/** Browsers sometimes leave `type` empty (e.g. .docx on some systems), so fall back to the extension. */
const mimeOf = (f: File) => f.type || MIME_BY_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';
const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function GradebookPage() {
  const { courseId } = useParams();
  return courseId ? <CourseGradebook courseId={Number(courseId)} /> : <CoursePicker />;
}

// ---------------------------------------------------------------- Course picker
function CoursePicker() {
  const user = useUser();
  const t = useT(M);
  const { t: c } = useI18n();
  const q = useQuery({
    queryKey: ['courses', user.role === 'teacher' ? 'teacher-all' : 'all'],
    queryFn: () => api.get<Course[]>('/courses', user.role === 'teacher' ? { all: true } : undefined),
  });

  const groups = useMemo(() => {
    const map = new Map<string, Course[]>();
    for (const co of q.data ?? []) {
      if (!map.has(co.className)) map.set(co.className, []);
      map.get(co.className)!.push(co);
    }
    return [...map.entries()];
  }, [q.data]);

  return (
    <>
      <PageHeader title={c('gradebook')} description={t('chooseCourse')} />
      {q.isLoading ? (
        <div className="grid grid-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} rows={3} />)}</div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : groups.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={26} />} title={t('noCourses')}>{t('noCoursesBody')}</EmptyState></Card>
      ) : (
        <div className="grid grid-3">
          {groups.map(([className, courses]) => (
            <Card key={className}>
              <CardHeader title={className} subtitle={courses.length === 1 ? t('oneSubject') : t('subjects', { n: courses.length })} />
              <ul className="list">
                {courses.map((co) => {
                  const mine = user.role === 'admin' || co.teacherId === user.id;
                  return (
                    <li key={co.id}>
                      <Link to={`/gradebook/${co.id}`} className="list-item">
                        <span className="color-dot" style={{ background: co.color }} aria-hidden />
                        <div className="grow">
                          <div className="title">{co.subjectName}</div>
                          <div className="meta">{co.teacherName ?? t('noTeacher')}</div>
                        </div>
                        {!mine && <Badge tone="info"><Eye size={12} aria-hidden /> {t('viewOnly')}</Badge>}
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
  const t = useT(M);
  const { t: c } = useI18n();
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
    if (Number.isNaN(n)) return t('enterNumber');
    if (n < 0) return t('negative');
    if (n > max) return t('maxIs', { max });
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
      toast.error(t('fixScores'), t('cellsRed', { n: invalidKeys.length }));
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
      qc.invalidateQueries({ queryKey: ['exams'] });
      toast.success(t('scoresSaved'), dirtyKeys.length === 1 ? t('oneScoreUpdated') : t('scoresUpdated', { n: dirtyKeys.length }));
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
      toast.success(t('assessmentDeleted'));
    },
    onError: (err) => toast.error(err),
  });

  const exportCsv = () => {
    if (!gb) return;
    downloadCsv(
      `${slug(`${gb.course.className}-${gb.course.subjectName}`)}-grades`,
      [t('csvAdmission'), t('csvStudent'), ...gb.assessments.map((a) => `${shortTitle(a, gb.course)} (/${a.maxScore})`), t('csvAverage'), c('grades')],
      gb.rows.map((r) => [r.admissionNo, fullName(r), ...gb.assessments.map((a) => r.scores[a.id] ?? null), r.averagePercent, r.averagePercent === null ? '' : letterGrade(r.averagePercent)]),
    );
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
        breadcrumb={<><Link to="/gradebook"><ArrowLeft size={14} aria-hidden style={{ display: 'inline', verticalAlign: '-2px' }} /> {c('gradebook')}</Link><span aria-hidden>/</span><span>{course.className}</span></>}
        title={<span className="row" style={{ gap: 10 }}><span className="color-dot" style={{ background: course.color, width: 14, height: 14 }} aria-hidden />{course.subjectName} · {course.className}</span>}
        description={course.teacherName ? t('taughtBy', { name: course.teacherName }) : t('noTeacher')}
        actions={
          <>
            <Button icon={<Download size={17} />} onClick={exportCsv} disabled={!rows.length}>{t('exportCsv')}</Button>
            {!readOnly && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>{t('newAssessment')}</Button>}
          </>
        }
      />

      {readOnly && (
        <div className="mb-3">
          <Alert tone="info" icon={<Eye size={20} />} title={t('viewOnly')}>{t('viewOnlyBody', { name: course.teacherName ?? t('theTeacher') })}</Alert>
        </div>
      )}

      <StatGroup className="mb-3">
        <StatCard icon={<NotebookPen size={16} />} label={t('classAverage')} value={percent(classAvg, 1)} tone={gradeTone(classAvg)} hint={t('grade', { g: letterGrade(classAvg) })} />
        <StatCard icon={<BookOpen size={16} />} label={t('assessments')} value={assessments.length} tone="accent" />
        <StatCard icon={<Users size={16} />} label={t('students')} value={rows.length} tone="info" />
        <StatCard icon={<Pencil size={16} />} label={t('scoresMissing')} value={toGrade} tone={toGrade ? 'warning' : 'success'} hint={toGrade ? t('acrossAll') : t('caughtUp')} />
      </StatGroup>

      <Card>
        {assessments.length === 0 ? (
          <EmptyState
            icon={<NotebookPen size={26} />}
            title={t('noAssessments')}
            action={!readOnly ? <Button variant="primary" icon={<Plus size={17} />} onClick={() => setEditing('new')}>{t('createFirst')}</Button> : undefined}
          >
            {t('noAssessmentsBody')}
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title={t('noStudents')} />
        ) : (
          <div className="table-wrap">
            <table className="table gradebook">
              <caption className="sr-only">{t('caption', { subject: course.subjectName, className: course.className })}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky">{t('student')}</th>
                  {assessments.map((a) => {
                    const isExam = a.examId !== null;
                    return (
                      <th
                        key={a.id}
                        id={`assessment-col-${a.id}`}
                        scope="col"
                        className="assessment-head num"
                        style={a.id === highlight ? { background: 'var(--primary-soft)' } : undefined}
                      >
                        {isExam && (
                          <span style={{ display: 'block', marginBottom: 2 }}>
                            <Badge tone="accent" title={t('examPaper', { name: a.examName ?? '' })}><Award size={11} aria-hidden /> {t('tExam')}</Badge>
                          </span>
                        )}
                        <span className="t" title={a.title}>{shortTitle(a, course)}</span>
                        <span className="m">{t(typeKey(a.type))} · /{a.maxScore}{a.dueDate && ` · ${formatShortDate(a.dueDate)}`}</span>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 2, marginTop: 4 }}>
                          {a.fileCount > 0 && (
                            <span className="row tiny muted" style={{ gap: 2, marginRight: 4 }} title={t('files', { n: a.fileCount })}>
                              <Paperclip size={12} aria-hidden />{a.fileCount}<span className="sr-only"> {t('files', { n: a.fileCount })}</span>
                            </span>
                          )}
                          <Badge tone={gradeTone(a.averagePercent)} title={t('classAverage')}>{percent(a.averagePercent)}</Badge>
                          {!readOnly && (
                            <>
                              <Button variant="ghost" size="sm" iconOnly aria-label={t('edit', { title: a.title })} icon={<Pencil size={14} />} onClick={() => setEditing(a)} />
                              {!isExam && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  aria-label={t('delete', { title: a.title })}
                                  icon={<Trash2 size={14} />}
                                  onClick={async () => {
                                    if (await confirm({
                                      title: t('deleteTitle', { title: shortTitle(a, course) }),
                                      message: a.gradedCount ? t('deleteWithScores', { n: a.gradedCount }) : t('cantUndo'),
                                      confirmLabel: t('deleteAssessment'),
                                      danger: true,
                                    })) removeAssessment.mutate(a.id);
                                  }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th scope="col" className="num">{t('average')}</th>
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
                              aria-label={t('cellLabel', { name: fullName(r), title: shortTitle(a, course), max: a.maxScore })}
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
              {dirtyKeys.length === 0 ? t('allSaved') : (
                <>
                  <strong className="text-warning">{dirtyKeys.length === 1 ? t('unsavedOne') : t('unsaved', { n: dirtyKeys.length })}</strong>
                  {invalidKeys.length > 0 && <span className="text-danger"> · {t('needFixing', { n: invalidKeys.length })}</span>}
                </>
              )}
            </span>
            <div className="row" style={{ gap: 8 }}>
              {dirtyKeys.length > 0 && <Button variant="ghost" icon={<Undo2 size={16} />} onClick={() => setEdits({})} disabled={saving}>{t('discard')}</Button>}
              <Button variant="primary" icon={<Save size={17} />} loading={saving} disabled={dirtyKeys.length === 0} onClick={saveAll}>{c('saveChanges')}</Button>
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

/** Titles are often prefixed with the subject ("Mathematics: Quiz 1") — drop the redundant prefix in the grid. */
function shortTitle(a: Assessment, course: Course) {
  const prefix = `${course.subjectName}: `;
  return a.title.startsWith(prefix) ? a.title.slice(prefix.length) : a.title;
}

// ---------------------------------------------------------------- Create / edit assessment
function AssessmentModal({ courseId, assessment, onClose }: { courseId: number; assessment: Assessment | null; onClose: () => void }) {
  const t = useT(M);
  const { t: c } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const isExam = !!assessment && assessment.examId !== null;
  const [form, setForm] = useState({
    title: assessment?.title ?? '',
    type: assessment?.type ?? ('assignment' as AssessmentType),
    maxScore: assessment ? String(assessment.maxScore) : '100',
    dueDate: assessment?.dueDate ?? '',
    description: assessment?.description ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Files picked before a new assessment exists are uploaded right after it's created.
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const files = useQuery({
    queryKey: ['assessment-files', assessment?.id],
    queryFn: () => api.get<AttachmentInfo[]>(`/assessments/${assessment!.id}/files`),
    enabled: !!assessment,
  });
  const existing = files.data ?? [];

  const refreshFiles = (id: number) => {
    qc.invalidateQueries({ queryKey: ['assessment-files', id] });
    qc.invalidateQueries({ queryKey: ['gradebook', courseId] });
  };

  const uploadOne = (id: number, file: File) =>
    api.upload<AttachmentInfo[]>('POST', `/assessments/${id}/files?name=${encodeURIComponent(file.name)}`, file, mimeOf(file));

  const validate = (picked: File[]) => {
    const ok: File[] = [];
    for (const f of picked) {
      if (f.size > MAX_FILE) toast.error(t('tooBig', { name: f.name }));
      else if (!MIME_BY_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] && !f.type) toast.error(t('badType', { name: f.name }));
      else ok.push(f);
    }
    if (existing.length + pending.length + ok.length > 5) {
      toast.error(t('tooMany'));
      return ok.slice(0, Math.max(0, 5 - existing.length - pending.length));
    }
    return ok;
  };

  const onPick = async (list: FileList | null) => {
    const picked = validate(Array.from(list ?? []));
    if (fileInput.current) fileInput.current.value = '';
    if (!picked.length) return;
    if (!assessment) {
      setPending((p) => [...p, ...picked]);
      return;
    }
    setUploading(true);
    try {
      for (const f of picked) {
        try {
          await uploadOne(assessment.id, f);
        } catch (err) {
          toast.error(t('uploadFailed', { name: f.name }), errorMessage(err));
        }
      }
      toast.success(t('uploaded'));
    } finally {
      setUploading(false);
      refreshFiles(assessment.id);
    }
  };

  const removeFile = useMutation({
    mutationFn: (fileId: number) => api.del<AttachmentInfo[]>(`/assessments/${assessment!.id}/files/${fileId}`),
    onSuccess: () => {
      toast.success(t('fileRemoved'));
      refreshFiles(assessment!.id);
    },
    onError: (err) => toast.error(err),
  });

  const save = useMutation({
    mutationFn: (body: Omit<AssessmentInput, 'courseId'>) =>
      assessment ? api.patch<Assessment>(`/assessments/${assessment.id}`, body) : api.post<Assessment>('/assessments', { ...body, courseId }),
    onSuccess: async (saved) => {
      if (!assessment && pending.length) {
        setUploading(true);
        for (const f of pending) {
          try {
            await uploadOne(saved.id, f);
          } catch (err) {
            toast.error(t('uploadFailed', { name: f.name }), errorMessage(err));
          }
        }
        setUploading(false);
      }
      qc.invalidateQueries({ queryKey: ['gradebook', courseId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(assessment ? t('updated') : t('created'), assessment ? undefined : t('enterInColumn'));
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error(err);
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = t('eTitle');
    const max = Number(form.maxScore);
    if (!form.maxScore || Number.isNaN(max) || max <= 0) errs.maxScore = t('eMax');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // Exam papers take their type and maximum from the exam, so only send what may change.
    save.mutate(isExam
      ? { title: form.title.trim(), dueDate: form.dueDate || null, description: form.description.trim() || null } as Omit<AssessmentInput, 'courseId'>
      : {
          title: form.title.trim(),
          type: form.type,
          maxScore: max,
          dueDate: form.dueDate || null,
          description: form.description.trim() || null,
        });
  };

  const busy = save.isPending || uploading;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={assessment ? t('editAssessment') : t('newAssessment')}
      description={assessment ? undefined : t('newHint')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{c('cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>{assessment ? c('saveChanges') : t('createAssessment')}</Button>
        </>
      }
    >
      <div className="form-grid">
        {isExam && (
          <div className="span-2">
            <Alert tone="info" icon={<Award size={20} />}>{t('examLocked', { name: assessment!.examName ?? '' })}</Alert>
          </div>
        )}
        <Field label={t('title')} required error={errors.title} className="span-2">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={t('titlePh')} maxLength={120} data-autofocus />
        </Field>
        <Field label={t('type')} required error={errors.type}>
          <Select value={form.type} onChange={(e) => set('type', e.target.value)} disabled={isExam}>
            {TYPES.map((ty) => <option key={ty.value} value={ty.value}>{t(ty.label)}</option>)}
          </Select>
        </Field>
        <Field label={t('outOf')} required error={errors.maxScore} hint={t('outOfHint')}>
          <Input type="number" min={1} step="any" inputMode="decimal" value={form.maxScore} onChange={(e) => set('maxScore', e.target.value)} disabled={isExam} />
        </Field>
        <Field label={t('dueDate')} error={errors.dueDate} className="span-2">
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label={t('instructions')} error={errors.description} hint={t('instructionsHint')} className="span-2">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        </Field>

        <div className="span-2 field">
          <span className="field-label" id="attachments-label">{t('attachments')}</span>
          <span className="field-hint">{t('attachHint')}</span>
          <ul className="list" aria-labelledby="attachments-label" style={{ display: 'grid', gap: 6, marginTop: 4 }}>
            {existing.map((f) => (
              <li key={f.id} className="row" style={{ gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <Paperclip size={15} aria-hidden className="subtle" />
                <a href={f.url} download={f.filename} className="truncate grow small">{f.filename}</a>
                <span className="tiny muted">{fileSize(f.size)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('removeFile', { name: f.filename })}
                  icon={<X size={14} />}
                  disabled={removeFile.isPending}
                  onClick={() => removeFile.mutate(f.id)}
                />
              </li>
            ))}
            {pending.map((f, i) => (
              <li key={`${f.name}-${i}`} className="row" style={{ gap: 8, padding: '6px 10px', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
                <Paperclip size={15} aria-hidden className="subtle" />
                <span className="truncate grow small">{f.name}</span>
                <span className="tiny muted" title={t('willUpload')}>{fileSize(f.size)}</span>
                <Button variant="ghost" size="sm" iconOnly aria-label={t('removeFile', { name: f.name })} icon={<X size={14} />} onClick={() => setPending((p) => p.filter((_, j) => j !== i))} />
              </li>
            ))}
            {assessment && !files.isLoading && existing.length === 0 && pending.length === 0 && <li className="small muted">{t('noFiles')}</li>}
          </ul>
          {pending.length > 0 && <span className="field-hint">{t('willUpload')}</span>}
          <div className="mt-1">
            <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onPick(e.target.files)} aria-labelledby="attachments-label" />
            <Button
              size="sm"
              icon={<FileUp size={15} />}
              loading={uploading}
              disabled={existing.length + pending.length >= 5}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? t('uploading') : t('addFiles')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
