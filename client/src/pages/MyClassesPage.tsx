import { useQuery } from '@tanstack/react-query';
import { BarChart3, BookOpen, CalendarClock, ClipboardCheck, NotebookPen, School, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ClassListItem, Course } from '../../../shared/types';
import { Badge, ButtonLink, Card, CardSkeleton, EmptyState, ErrorState, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    description: 'Every course you teach, with shortcuts to the register, gradebook and class page.',
    myTimetable: 'My timetable',
    classTeacherOf: 'Class teacher of',
    students: '{n} students',
    oneStudent: '1 student',
    room: 'Room {room}',
    takeRegister: 'Take register',
    classPage: 'Class page',
    emptyTitle: 'You aren’t teaching any courses yet',
    emptyBody: 'Once the school office assigns you to a subject in a class, it will appear here.',
    register: 'Register',
    classTimetable: 'Class timetable',
    attendanceReport: 'Attendance report',
  },
  sw: {
    description: 'Masomo yote unayofundisha, pamoja na njia za mkato kwenda daftari la mahudhurio, alama na ukurasa wa darasa.',
    myTimetable: 'Ratiba yangu',
    classTeacherOf: 'Mwalimu wa darasa la',
    students: 'Wanafunzi {n}',
    oneStudent: 'Mwanafunzi 1',
    room: 'Chumba {room}',
    takeRegister: 'Chukua mahudhurio',
    classPage: 'Ukurasa wa darasa',
    emptyTitle: 'Bado hufundishi somo lolote',
    emptyBody: 'Ofisi ya shule ikikupangia somo katika darasa, litaonekana hapa.',
    register: 'Mahudhurio',
    classTimetable: 'Ratiba ya darasa',
    attendanceReport: 'Ripoti ya mahudhurio',
  },
};

export function MyClassesPage() {
  const user = useUser();
  const { t: c } = useI18n();
  const t = useT(M);
  const courses = useQuery({ queryKey: ['courses', 'mine'], queryFn: () => api.get<Course[]>('/courses') });
  const classes = useQuery({ queryKey: ['classes', 'mine'], queryFn: () => api.get<ClassListItem[]>('/classes', { mine: true }) });

  const homerooms = (classes.data ?? []).filter((h) => h.homeroomTeacherId === user.id);
  const studentCount = (n: number) => (n === 1 ? t('oneStudent') : t('students', { n }));

  return (
    <>
      <PageHeader
        title={c('myClasses')}
        description={t('description')}
        actions={<ButtonLink to="/timetable" icon={<CalendarClock size={17} />}>{t('myTimetable')}</ButtonLink>}
      />

      {homerooms.length > 0 && (
        <Card className="mb-3">
          <div className="card-body row row-wrap between">
            <div className="row" style={{ gap: 14 }}>
              <span className="stat-icon tone-accent" aria-hidden style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--tone-soft)', color: 'var(--tone)' }}>
                <School size={22} />
              </span>
              <div>
                <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('classTeacherOf')}</div>
                <div className="bold" style={{ fontSize: '1.1rem' }}>
                  {homerooms.map((h) => h.name).join(', ')}
                </div>
                <div className="small muted">{homerooms.map((h) => `${studentCount(h.studentCount)}${h.room ? ` · ${t('room', { room: h.room })}` : ''}`).join(' · ')}</div>
              </div>
            </div>
            <div className="row row-wrap" style={{ gap: 8 }}>
              <ButtonLink to={`/attendance?classId=${homerooms[0]!.id}`} variant="primary" icon={<ClipboardCheck size={17} />}>{t('takeRegister')}</ButtonLink>
              <ButtonLink to={`/classes/${homerooms[0]!.id}`} icon={<Users size={17} />}>{t('classPage')}</ButtonLink>
              <ButtonLink to={`/reports?tab=attendance&classId=${homerooms[0]!.id}`} icon={<BarChart3 size={17} />}>{t('attendanceReport')}</ButtonLink>
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
          <EmptyState icon={<BookOpen size={26} />} title={t('emptyTitle')}>
            {t('emptyBody')}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-3">
          {courses.data.map((course) => (
            <Card key={course.id} as="article">
              <div style={{ height: 6, background: course.color, borderRadius: '12px 12px 0 0' }} aria-hidden />
              <div className="card-body stack" style={{ gap: 14 }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h2>{course.subjectName}</h2>
                    <div className="muted small">{course.className}</div>
                  </div>
                  <Badge>{course.subjectCode}</Badge>
                </div>
                <div className="row small muted" style={{ gap: 8 }}>
                  <Users size={16} aria-hidden /> {studentCount(course.studentCount)}
                </div>
                <div className="row row-wrap" style={{ gap: 8 }}>
                  <ButtonLink to={`/gradebook/${course.id}`} size="sm" variant="primary" icon={<NotebookPen size={15} />}>{c('gradebook')}</ButtonLink>
                  <ButtonLink to={`/attendance?classId=${course.classId}`} size="sm" icon={<ClipboardCheck size={15} />}>{t('register')}</ButtonLink>
                </div>
                <div className="row row-wrap small" style={{ gap: 14 }}>
                  <Link to={`/classes/${course.classId}`}>{t('classPage')}</Link>
                  <Link to={`/timetable?classId=${course.classId}`}>{t('classTimetable')}</Link>
                  <Link to={`/reports?tab=attendance&classId=${course.classId}`}>{t('attendanceReport')}</Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
