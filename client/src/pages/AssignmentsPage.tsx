import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarClock, FileText, MessageSquareText, Paperclip, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { AssessmentType, AssignmentStatus, StudentAssignment } from '../../../shared/types';
import { ChildSwitcher, useSelectedChild } from '../components/ChildSwitcher';
import { Badge, Card, CardSkeleton, EmptyState, ErrorState, PageHeader, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { daysUntil, formatDate, gradeTone, letterGrade, percent, relativeTime, type Tone } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    descriptionStudent: 'Everything your teachers have set, what’s due next, and how your work was marked.',
    descriptionParent: 'Homework, projects and quizzes for {name}, with deadlines and marks.',
    forChild: 'For {name} · {className}',
    filter: 'Filter assignments',
    fAll: 'All', fDueSoon: 'Due soon', fOverdue: 'Overdue', fMarked: 'Marked', fUpcoming: 'Upcoming',
    sMarked: 'Marked', sOverdue: 'Not handed in', sDueSoon: 'Due soon', sUpcoming: 'Upcoming', sNoDeadline: 'No deadline',
    tAssignment: 'Assignment', tQuiz: 'Quiz', tTest: 'Test', tExam: 'Exam', tProject: 'Project',
    due: 'Due {date}', dueToday: 'Due today', dueTomorrow: 'Due tomorrow', noDeadline: 'No deadline set',
    outOf: 'Out of {n} marks',
    score: 'Score',
    feedback: 'Teacher feedback',
    files: 'Files from the teacher',
    instructions: 'Instructions',
    emptyAll: 'No assignments yet',
    emptyAllBody: 'When teachers set homework, projects or quizzes they will appear here.',
    emptyDueSoon: 'Nothing due in the next few days',
    emptyOverdue: 'Nothing overdue — well done!',
    emptyMarked: 'No marked work yet',
    emptyUpcoming: 'Nothing else scheduled yet',
    noChildren: 'No children are linked to your account yet',
    noChildrenBody: 'Please contact the school office to link your account to your child.',
    noClass: 'Not placed in a class yet',
    noClassBody: 'Assignments appear once the school places this student in a class.',
    summary: '{overdue} overdue · {soon} due soon · {marked} marked',
  },
  sw: {
    descriptionStudent: 'Kazi zote ulizopewa na walimu, zinazotakiwa karibuni, na jinsi zilivyosahihishwa.',
    descriptionParent: 'Kazi za nyumbani, miradi na majaribio ya {name}, pamoja na tarehe za mwisho na alama.',
    forChild: 'Kwa {name} · {className}',
    filter: 'Chuja kazi',
    fAll: 'Zote', fDueSoon: 'Karibu kuisha', fOverdue: 'Zimechelewa', fMarked: 'Zimesahihishwa', fUpcoming: 'Zijazo',
    sMarked: 'Imesahihishwa', sOverdue: 'Haijawasilishwa', sDueSoon: 'Muda unakaribia', sUpcoming: 'Ijayo', sNoDeadline: 'Haina tarehe ya mwisho',
    tAssignment: 'Kazi', tQuiz: 'Jaribio fupi', tTest: 'Jaribio', tExam: 'Mtihani', tProject: 'Mradi',
    due: 'Mwisho {date}', dueToday: 'Mwisho leo', dueTomorrow: 'Mwisho kesho', noDeadline: 'Hakuna tarehe ya mwisho',
    outOf: 'Kati ya alama {n}',
    score: 'Alama',
    feedback: 'Maoni ya mwalimu',
    files: 'Faili kutoka kwa mwalimu',
    instructions: 'Maelekezo',
    emptyAll: 'Bado hakuna kazi',
    emptyAllBody: 'Walimu wakitoa kazi za nyumbani, miradi au majaribio zitaonekana hapa.',
    emptyDueSoon: 'Hakuna kazi inayoisha siku chache zijazo',
    emptyOverdue: 'Hakuna kazi iliyochelewa — hongera!',
    emptyMarked: 'Bado hakuna kazi iliyosahihishwa',
    emptyUpcoming: 'Hakuna kazi nyingine iliyopangwa bado',
    noChildren: 'Bado hakuna mtoto aliyeunganishwa na akaunti yako',
    noChildrenBody: 'Tafadhali wasiliana na ofisi ya shule ili kuunganisha akaunti yako na mtoto wako.',
    noClass: 'Bado hajapangiwa darasa',
    noClassBody: 'Kazi zitaonekana shule ikimpangia mwanafunzi huyu darasa.',
    summary: 'Zimechelewa {overdue} · Karibu kuisha {soon} · Zimesahihishwa {marked}',
  },
};

type Filter = 'all' | 'due_soon' | 'overdue' | 'marked' | 'upcoming';
type Key = keyof typeof M.en;

const STATUS: Record<AssignmentStatus, { key: Key; tone: Tone }> = {
  marked: { key: 'sMarked', tone: 'success' },
  overdue: { key: 'sOverdue', tone: 'danger' },
  due_soon: { key: 'sDueSoon', tone: 'warning' },
  upcoming: { key: 'sUpcoming', tone: 'info' },
  no_deadline: { key: 'sNoDeadline', tone: 'neutral' },
};

const TYPE_KEY: Record<AssessmentType, Key> = {
  assignment: 'tAssignment', quiz: 'tQuiz', test: 'tTest', exam: 'tExam', project: 'tProject',
};

const EMPTY: Record<Filter, Key> = {
  all: 'emptyAll', due_soon: 'emptyDueSoon', overdue: 'emptyOverdue', marked: 'emptyMarked', upcoming: 'emptyUpcoming',
};

const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function AssignmentCard({ a }: { a: StudentAssignment }) {
  const t = useT(M);
  const status = STATUS[a.status];
  const days = a.dueDate ? daysUntil(a.dueDate) : null;
  const dueLabel =
    days === null ? t('noDeadline')
      : days === 0 ? t('dueToday')
        : days === 1 ? t('dueTomorrow')
          : `${t('due', { date: formatDate(a.dueDate, { weekday: 'short', day: 'numeric', month: 'short' }) })} · ${relativeTime(a.dueDate!)}`;

  return (
    <Card as="article">
      <div style={{ height: 5, background: a.color, borderRadius: '16px 16px 0 0' }} aria-hidden />
      <div className="card-body stack" style={{ gap: 12 }}>
        <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="row row-wrap" style={{ gap: 8 }}>
              <span className="color-dot" style={{ background: a.color }} aria-hidden />
              <span className="small bold" style={{ color: 'var(--text-muted)' }}>{a.subjectName}</span>
              <Badge>{t(TYPE_KEY[a.type])}</Badge>
            </div>
            <h2 style={{ marginTop: 6, fontSize: '1.05rem' }}>{a.title}</h2>
          </div>
          <Badge tone={status.tone} dot>{t(status.key)}</Badge>
        </div>

        <div className="row row-wrap small muted" style={{ gap: 14 }}>
          <span className="row" style={{ gap: 6 }}><CalendarClock size={15} aria-hidden /> {dueLabel}</span>
          {a.teacherName && <span className="row" style={{ gap: 6 }}><UserRound size={15} aria-hidden /> {a.teacherName}</span>}
          <span>{t('outOf', { n: a.maxScore })}</span>
        </div>

        {a.description && (
          <div>
            <div className="tiny bold muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('instructions')}</div>
            <p className="small pre-wrap mt-1">{a.description}</p>
          </div>
        )}

        {a.files.length > 0 && (
          <div>
            <div className="tiny bold muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('files')}</div>
            <ul className="list mt-1" style={{ display: 'grid', gap: 6 }}>
              {a.files.map((f) => (
                <li key={f.id}>
                  <a href={f.url} className="row small" style={{ gap: 8 }} download={f.filename}>
                    <Paperclip size={15} aria-hidden />
                    <span className="truncate">{f.filename}</span>
                    <span className="subtle">({fileSize(f.size)})</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {a.status === 'marked' && (
          <div className="row between" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              {a.feedback ? (
                <p className="small row" style={{ gap: 6, alignItems: 'flex-start' }}>
                  <MessageSquareText size={15} aria-hidden className="subtle" style={{ marginTop: 3, flex: 'none' }} />
                  <span><span className="sr-only">{t('feedback')}: </span>“{a.feedback}”</span>
                </p>
              ) : (
                <span className="small muted">{t('score')}</span>
              )}
            </div>
            <div className="text-right" style={{ flex: 'none' }}>
              <div className="bold num">{a.score} / {a.maxScore}</div>
              <Badge tone={gradeTone(a.percent)}>{percent(a.percent)} · {letterGrade(a.percent)}</Badge>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function AssignmentsPage() {
  const user = useUser();
  const t = useT(M);
  const { t: c } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const { child, children, setChild, isLoading: loadingChildren } = useSelectedChild();

  const q = useQuery({
    queryKey: ['assignments', child?.id],
    queryFn: () => api.get<StudentAssignment[]>(`/students/${child!.id}/assignments`),
    enabled: !!child,
  });

  const isParent = user.role === 'parent';
  const header = (
    <PageHeader
      title={c('assignments')}
      description={isParent && child ? t('descriptionParent', { name: child.firstName }) : t('descriptionStudent')}
    />
  );

  if (loadingChildren) return <>{header}<CardSkeleton rows={5} /></>;
  if (!child) {
    return (
      <>
        {header}
        <Card><EmptyState icon={<BookOpen size={26} />} title={t('noChildren')}>{t('noChildrenBody')}</EmptyState></Card>
      </>
    );
  }

  const items = q.data ?? [];
  const counts = {
    overdue: items.filter((a) => a.status === 'overdue').length,
    soon: items.filter((a) => a.status === 'due_soon').length,
    marked: items.filter((a) => a.status === 'marked').length,
  };
  const visible = filter === 'all' ? items : items.filter((a) => a.status === filter);
  // Most urgent first: overdue and due soon at the top, then upcoming by date, then marked work (newest first).
  const order: Record<AssignmentStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, no_deadline: 3, marked: 4 };
  const sorted = [...visible].sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const ad = a.dueDate ?? '9999';
    const bd = b.dueDate ?? '9999';
    return a.status === 'marked' ? bd.localeCompare(ad) : ad.localeCompare(bd);
  });

  return (
    <>
      {header}
      {isParent && (
        <div className="row row-wrap between mb-2" style={{ gap: 12 }}>
          <ChildSwitcher children={children} value={child.id} onChange={setChild} />
          <span className="small muted">{t('forChild', { name: `${child.firstName} ${child.lastName}`, className: child.className ?? '—' })}</span>
        </div>
      )}

      {!child.classId ? (
        <Card><EmptyState icon={<BookOpen size={26} />} title={t('noClass')}>{t('noClassBody')}</EmptyState></Card>
      ) : q.isLoading ? (
        <div className="grid grid-2">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} rows={4} />)}</div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <>
          <div className="row row-wrap between mb-2" style={{ gap: 12 }}>
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <Segmented<Filter>
                label={t('filter')}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: `${t('fAll')} (${items.length})` },
                  { value: 'due_soon', label: `${t('fDueSoon')} (${counts.soon})` },
                  { value: 'overdue', label: `${t('fOverdue')} (${counts.overdue})` },
                  { value: 'marked', label: `${t('fMarked')} (${counts.marked})` },
                  { value: 'upcoming', label: t('fUpcoming') },
                ]}
              />
            </div>
          </div>
          {sorted.length === 0 ? (
            <Card>
              <EmptyState icon={<FileText size={26} />} title={t(EMPTY[filter])}>
                {filter === 'all' ? t('emptyAllBody') : undefined}
              </EmptyState>
            </Card>
          ) : (
            <div className="grid grid-2">
              {sorted.map((a) => <AssignmentCard key={a.id} a={a} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
