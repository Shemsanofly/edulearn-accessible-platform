import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarClock, ClipboardCheck, NotebookPen, School, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ClassListItem, Course } from '../../../shared/types';
import { Badge, ButtonLink, Card, CardSkeleton, EmptyState, ErrorState, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { plural } from '../lib/format';

export function MyClassesPage() {
  const user = useUser();
  const courses = useQuery({ queryKey: ['courses', 'mine'], queryFn: () => api.get<Course[]>('/courses') });
  const classes = useQuery({ queryKey: ['classes', 'mine'], queryFn: () => api.get<ClassListItem[]>('/classes', { mine: true }) });

  const homerooms = (classes.data ?? []).filter((c) => c.homeroomTeacherId === user.id);

  return (
    <>
      <PageHeader
        title="My classes"
        description="Every course you teach, with shortcuts to the register, gradebook and class page."
        actions={<ButtonLink to="/timetable" icon={<CalendarClock size={17} />}>My timetable</ButtonLink>}
      />

      {homerooms.length > 0 && (
        <Card className="mb-3">
          <div className="card-body row row-wrap between">
            <div className="row" style={{ gap: 14 }}>
              <span className="stat-icon tone-accent" aria-hidden style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--tone-soft)', color: 'var(--tone)' }}>
                <School size={22} />
              </span>
              <div>
                <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Class teacher of</div>
                <div className="bold" style={{ fontSize: '1.1rem' }}>
                  {homerooms.map((h) => h.name).join(', ')}
                </div>
                <div className="small muted">{homerooms.map((h) => `${plural(h.studentCount, 'student')}${h.room ? ` · Room ${h.room}` : ''}`).join(' · ')}</div>
              </div>
            </div>
            <div className="row row-wrap" style={{ gap: 8 }}>
              <ButtonLink to={`/attendance?classId=${homerooms[0]!.id}`} variant="primary" icon={<ClipboardCheck size={17} />}>Take register</ButtonLink>
              <ButtonLink to={`/classes/${homerooms[0]!.id}`} icon={<Users size={17} />}>Class page</ButtonLink>
            </div>
          </div>
        </Card>
      )}

      {courses.isLoading ? (
        <div className="grid grid-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} rows={3} />)}</div>
      ) : courses.error ? (
        <ErrorState error={courses.error} onRetry={courses.refetch} />
      ) : !courses.data?.length ? (
        <Card>
          <EmptyState icon={<BookOpen size={26} />} title="You aren’t teaching any courses yet">
            Once the school office assigns you to a subject in a class, it will appear here.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-3">
          {courses.data.map((c) => (
            <Card key={c.id} as="article">
              <div style={{ height: 6, background: c.color, borderRadius: '12px 12px 0 0' }} aria-hidden />
              <div className="card-body stack" style={{ gap: 14 }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h2>{c.subjectName}</h2>
                    <div className="muted small">{c.className}</div>
                  </div>
                  <Badge>{c.subjectCode}</Badge>
                </div>
                <div className="row small muted" style={{ gap: 8 }}>
                  <Users size={16} aria-hidden /> {plural(c.studentCount, 'student')}
                </div>
                <div className="row row-wrap" style={{ gap: 8 }}>
                  <ButtonLink to={`/gradebook/${c.id}`} size="sm" variant="primary" icon={<NotebookPen size={15} />}>Gradebook</ButtonLink>
                  <ButtonLink to={`/attendance?classId=${c.classId}`} size="sm" icon={<ClipboardCheck size={15} />}>Register</ButtonLink>
                </div>
                <div className="row small" style={{ gap: 14 }}>
                  <Link to={`/classes/${c.classId}`}>Class page</Link>
                  <Link to={`/timetable?classId=${c.classId}`}>Class timetable</Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
