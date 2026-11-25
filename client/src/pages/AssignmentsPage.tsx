import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, MessageSquareText } from 'lucide-react';
import type { Assessment, StudentGrade, StudentOverview } from '../../../shared/types';
import { Badge, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { daysUntil, formatDate, gradeTone, letterGrade, percent, relativeTime, type Tone } from '../lib/format';

const TYPE_LABEL: Record<Assessment['type'], string> = {
  assignment: 'Assignment', quiz: 'Quiz', test: 'Test', exam: 'Exam', project: 'Project',
};

function dueTone(days: number): Tone {
  if (days < 0) return 'danger';
  if (days <= 2) return 'warning';
  if (days <= 7) return 'primary';
  return 'neutral';
}

function UpcomingList({ items }: { items: Assessment[] }) {
  return (
    <ul className="list">
      {items.map((a) => {
        const days = a.dueDate ? daysUntil(a.dueDate) : null;
        return (
          <li key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <span className="lesson-bar" style={{ background: a.color, alignSelf: 'stretch' }} aria-hidden />
            <div className="grow">
              <div className="row row-wrap" style={{ gap: 8 }}>
                <span className="title">{a.title}</span>
                <Badge>{TYPE_LABEL[a.type]}</Badge>
              </div>
              <div className="meta">
                {a.subjectName} · out of {a.maxScore}
                {a.dueDate && ` · due ${formatDate(a.dueDate, { weekday: 'long', day: 'numeric', month: 'short' })}`}
              </div>
              {a.description && <p className="small muted mt-1">{a.description}</p>}
            </div>
            {days !== null && <Badge tone={dueTone(days)}>{days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : relativeTime(a.dueDate!)}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}

function GradeRow({ g }: { g: StudentGrade }) {
  return (
    <li className="list-item" style={{ alignItems: 'flex-start' }}>
      <span className="color-dot" style={{ background: g.color, marginTop: 6 }} aria-hidden />
      <div className="grow">
        <div className="title">{g.title}</div>
        <div className="meta">{g.subjectName} · {TYPE_LABEL[g.type]}{g.dueDate && ` · ${formatDate(g.dueDate)}`}</div>
        {g.feedback && (
          <p className="small mt-1 row" style={{ gap: 6, alignItems: 'flex-start' }}>
            <MessageSquareText size={15} aria-hidden className="subtle" style={{ marginTop: 3, flex: 'none' }} />
            <span><span className="sr-only">Teacher feedback: </span>“{g.feedback}”</span>
          </p>
        )}
      </div>
      <div className="text-right">
        <div className="bold num">{g.score ?? '—'} / {g.maxScore}</div>
        <Badge tone={gradeTone(g.percent)}>{percent(g.percent)} · {letterGrade(g.percent)}</Badge>
      </div>
    </li>
  );
}

export function AssignmentsPage() {
  const user = useUser();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['overview', user.id],
    queryFn: () => api.get<StudentOverview>(`/students/${user.id}/overview`),
  });

  if (isLoading) return <div className="grid grid-main"><CardSkeleton rows={6} /><CardSkeleton rows={6} /></div>;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const upcoming = data.upcoming;
  const thisWeek = upcoming.filter((a) => a.dueDate && daysUntil(a.dueDate) <= 7);
  const later = upcoming.filter((a) => !a.dueDate || daysUntil(a.dueDate) > 7);
  const recent = data.grades.slice(0, 12);

  return (
    <>
      <PageHeader title="Assignments" description="What’s due next, and how your recent work was marked." />
      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title="Due this week" subtitle={thisWeek.length ? `${thisWeek.length} to work on` : undefined} />
            {thisWeek.length ? <UpcomingList items={thisWeek} /> : <EmptyState icon={<CheckCircle2 size={24} />} title="Nothing due this week">Enjoy the breathing room — or get ahead on what’s coming later.</EmptyState>}
          </Card>
          <Card>
            <CardHeader title="Coming later" />
            {later.length ? <UpcomingList items={later} /> : <EmptyState icon={<BookOpen size={24} />} title="Nothing else scheduled yet" />}
          </Card>
        </div>
        <Card>
          <CardHeader title="Recently marked" subtitle="Your latest scores and teacher feedback" />
          {recent.length ? <ul className="list">{recent.map((g) => <GradeRow key={g.assessmentId} g={g} />)}</ul> : <EmptyState title="No marked work yet" />}
        </Card>
      </div>
    </>
  );
}
