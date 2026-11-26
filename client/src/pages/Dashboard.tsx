import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Award, ArrowRight, BookOpen, Check, CalendarDays, CheckCircle2, ClipboardCheck, Clock, GraduationCap, History,
  Inbox, Megaphone, NotebookPen, Pin, School, UserRound, Users, Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdminDashboard, Announcement, Assessment, AssessmentType, Dashboard, EventType, ParentDashboard, SchoolEvent, StudentDashboard,
  TeacherDashboard, TimetableSlot,
} from '../../../shared/types';
import { ColumnChart, Donut, TrendChart } from '../components/charts';
import {
  Alert, Avatar, Badge, Button, ButtonLink, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, ProgressBar, StatCard, cx,
} from '../components/ui';
import { api } from '../lib/api';
import { useSchool, useUser } from '../lib/auth';
import {
  attendanceTone, colorFor, daysUntil, formatDate, formatShortDate, fullName, gradeTone, letterGrade, levelName, money, percent,
  relativeTime, type Tone,
} from '../lib/format';
import { useI18n, useT, type CommonKey } from '../lib/i18n';

const M = {
  en: {
    // Shared widgets
    comingUp: 'Coming up', nothingScheduled: 'Nothing scheduled', announcements: 'Announcements', seeAll: 'See all',
    noAnnouncements: 'No announcements yet', pinned: 'Pinned', schoolOffice: 'School office', todaysLessons: 'Today’s lessons',
    fullTimetable: 'Full timetable', noLessons: 'No lessons today', enjoyBreak: 'Enjoy the break!', now: 'Now',
    teacherTbc: 'Teacher to be confirmed', room: 'Room {room}', register: 'Register', graded: '{a}/{b} graded',
    // Admin
    adminSubtitle: 'Here’s how {school} is doing today.', enrol: 'Enrol a student', studentsStat: 'Students', classesHint: '{n} classes',
    teachersStat: 'Teachers', perTeacher: '{n} students per teacher', attendanceToday: 'Attendance today', absentLate: '{absent} absent · {late} late',
    feesOutstanding: 'Fees outstanding', overdueInvoices: '{n} overdue invoices', registersMissing: '{n} classes have not taken today’s register yet',
    registerMissing: '1 class has not taken today’s register yet', openAttendance: 'Open attendance', toSeeWhich: 'to see which ones.',
    enquiriesAlert: '{n} new enquiries from the website', enquiryAlert: '1 new enquiry from the website', reviewEnquiries: 'Review enquiries',
    attendance3w: 'Attendance — last 3 weeks', attendance3wHint: 'Share of students present or late each school day',
    feeCollection: 'Fee collection', allInvoices: 'All invoices this term', collected: 'Collected', billed: 'Billed', overdue: 'Overdue',
    manageFees: 'Manage fees', enrolmentByLevel: 'Enrolment by level', studentsPerLevel: 'Students per level', nStudents: '{n} students',
    performance: 'Academic performance', performanceHint: 'Subject averages · {exam}', noExam: 'No published exam results yet',
    noExamHint: 'Publish an exam to see how each subject is doing.', allExams: 'Examinations', subjectAvg: '{subject} average',
    todaysRegister: 'Today’s register', classesRecorded: '{a} of {b} classes recorded', marked: 'marked',
    quickActions: 'Quick actions', takeAttendance: 'Take or review attendance', createInvoices: 'Create invoices',
    postAnnouncement: 'Post an announcement', editTimetable: 'Edit the timetable', recentActivity: 'Recent activity',
    activityHint: 'Important changes made by staff', noActivity: 'No activity recorded yet', auditLog: 'Audit log',
    // Setup
    setupTitle: 'Let’s get your school set up', setupHint: '{done} of {total} steps done — each one only takes a minute or two.', hide: 'Hide',
    setupProgress: 'Setup progress', stepTerm: 'Add the school term', stepSubjects: 'Add the subjects you teach', stepTeachers: 'Add your teachers',
    stepClasses: 'Create classes', stepCourses: 'Choose who teaches what in each class', stepStudents: 'Enrol students',
    stepTimetable: 'Build the timetable', start: 'Start', done: 'done', todo: 'to do',
    // Teacher
    teacherSubtitle: 'You have {n} lessons today.', teacherNoLessons: 'No lessons on your timetable today.', takeRegister: 'Take {cls} register',
    courses: 'Courses', studentPlaces: '{n} student places', scoresToEnter: 'Scores to enter', nAssessments: '{n} assessments',
    classTeacherOf: 'Class teacher of', noHomeroom: 'No class', todaysRegisterStat: 'Today’s register', registerDone: 'Done', registerTodo: 'To do',
    myCourses: 'My courses', classAverageHint: 'Class average across graded work', allCourses: 'All courses', noCourses: 'You aren’t assigned to any subjects yet',
    needsGrading: 'Needs grading', caughtUp: 'You’re all caught up', courseAverage: '{cls} {subject} average',
    // Student
    myGrades: 'My grades', noClassYet: 'You haven’t been placed in a class yet.', studentSubtitle: '{cls} · let’s make today a good one.',
    supportActive: 'Your support plan is active', supportBody: 'Your teachers know about: {needs}. Use the accessibility button at the top of the page to change text size, contrast and motion.',
    overallAverage: 'Overall average', gradeX: 'Grade {grade}', absencesTerm: '{n} absences this term', absenceTerm: '1 absence this term',
    dueSoon: 'Due soon', assignmentsTests: 'Assignments and tests', feeBalance: 'Fee balance', outstanding: 'Outstanding', allPaid: 'All paid',
    howDoing: 'How I’m doing', howDoingHint: 'Average across marked work in each subject', details: 'Details', all: 'All', nothingDue: 'Nothing due — nice work!',
    // Parent
    parentSubtitle1: 'Here’s how {names} is getting on', parentSubtitleN: 'Here’s how {names} are getting on', parentWelcome: 'Welcome to the parent portal',
    messageTeacher: 'Message a teacher', noChildren: 'No children linked yet', noChildrenHint: 'Please contact the school office to link your account to your child.',
    viewProgress: 'View progress', average: 'Average', attendance: 'Attendance', thisTerm: 'this term', dueSoonLower: 'Due soon',
    assignmentsTestsLower: 'assignments & tests', fees: 'Fees', outstandingLower: 'outstanding', allPaidLower: 'all paid',
    results: 'Results', assignments: 'Assignments', outstandingFees: 'You have {amount} outstanding in school fees',
    seeInvoices: 'See invoices and payment details', and: 'and', quickLinksFor: 'Quick links for {name}', noClass: 'No class',
    // Types
    assignment: 'assignment', quiz: 'quiz', test: 'test', exam: 'exam', project: 'project',
  },
  sw: {
    comingUp: 'Yanayokuja', nothingScheduled: 'Hakuna kilichopangwa', announcements: 'Matangazo', seeAll: 'Tazama yote',
    noAnnouncements: 'Bado hakuna matangazo', pinned: 'Limebandikwa', schoolOffice: 'Ofisi ya shule', todaysLessons: 'Vipindi vya leo',
    fullTimetable: 'Ratiba kamili', noLessons: 'Hakuna vipindi leo', enjoyBreak: 'Furahia mapumziko!', now: 'Sasa',
    teacherTbc: 'Mwalimu atathibitishwa', room: 'Chumba {room}', register: 'Mahudhurio', graded: '{a}/{b} zimesahihishwa',
    adminSubtitle: 'Hivi ndivyo {school} inavyoendelea leo.', enrol: 'Sajili mwanafunzi', studentsStat: 'Wanafunzi', classesHint: 'Madarasa {n}',
    teachersStat: 'Walimu', perTeacher: 'Wanafunzi {n} kwa kila mwalimu', attendanceToday: 'Mahudhurio ya leo', absentLate: 'Hawapo {absent} · wamechelewa {late}',
    feesOutstanding: 'Ada inayodaiwa', overdueInvoices: 'Ankara {n} zimepitwa na muda', registersMissing: 'Madarasa {n} bado hayajachukua mahudhurio ya leo',
    registerMissing: 'Darasa 1 bado halijachukua mahudhurio ya leo', openAttendance: 'Fungua mahudhurio', toSeeWhich: 'kuona ni yapi.',
    enquiriesAlert: 'Maulizo mapya {n} kutoka tovutini', enquiryAlert: 'Ulizo 1 jipya kutoka tovutini', reviewEnquiries: 'Kagua maulizo',
    attendance3w: 'Mahudhurio — wiki 3 zilizopita', attendance3wHint: 'Asilimia ya wanafunzi waliohudhuria au kuchelewa kila siku ya shule',
    feeCollection: 'Ukusanyaji wa ada', allInvoices: 'Ankara zote za muhula huu', collected: 'Zilizokusanywa', billed: 'Zilizotozwa', overdue: 'Zilizopitwa na muda',
    manageFees: 'Simamia ada', enrolmentByLevel: 'Usajili kwa ngazi', studentsPerLevel: 'Wanafunzi kwa ngazi', nStudents: 'Wanafunzi {n}',
    performance: 'Matokeo ya kitaaluma', performanceHint: 'Wastani kwa somo · {exam}', noExam: 'Bado hakuna matokeo ya mtihani yaliyotolewa',
    noExamHint: 'Toa matokeo ya mtihani ili kuona kila somo linavyoendelea.', allExams: 'Mitihani', subjectAvg: 'Wastani wa {subject}',
    todaysRegister: 'Mahudhurio ya leo', classesRecorded: 'Madarasa {a} kati ya {b} yamerekodiwa', marked: 'wamerekodiwa',
    quickActions: 'Vitendo vya haraka', takeAttendance: 'Chukua au kagua mahudhurio', createInvoices: 'Tengeneza ankara',
    postAnnouncement: 'Toa tangazo', editTimetable: 'Hariri ratiba', recentActivity: 'Shughuli za karibuni',
    activityHint: 'Mabadiliko muhimu yaliyofanywa na wafanyakazi', noActivity: 'Bado hakuna shughuli zilizorekodiwa', auditLog: 'Kumbukumbu za shughuli',
    setupTitle: 'Tuanze kuandaa shule yako', setupHint: 'Hatua {done} kati ya {total} zimekamilika — kila moja huchukua dakika moja au mbili tu.', hide: 'Ficha',
    setupProgress: 'Maendeleo ya maandalizi', stepTerm: 'Ongeza muhula wa shule', stepSubjects: 'Ongeza masomo mnayofundisha', stepTeachers: 'Ongeza walimu wako',
    stepClasses: 'Unda madarasa', stepCourses: 'Panga nani anafundisha nini kila darasa', stepStudents: 'Sajili wanafunzi',
    stepTimetable: 'Tengeneza ratiba', start: 'Anza', done: 'imekamilika', todo: 'haijakamilika',
    teacherSubtitle: 'Una vipindi {n} leo.', teacherNoLessons: 'Huna vipindi kwenye ratiba yako leo.', takeRegister: 'Chukua mahudhurio ya {cls}',
    courses: 'Masomo', studentPlaces: 'Nafasi za wanafunzi {n}', scoresToEnter: 'Alama za kuingiza', nAssessments: 'Tathmini {n}',
    classTeacherOf: 'Mwalimu wa darasa la', noHomeroom: 'Hakuna darasa', todaysRegisterStat: 'Mahudhurio ya leo', registerDone: 'Yamechukuliwa', registerTodo: 'Bado',
    myCourses: 'Masomo yangu', classAverageHint: 'Wastani wa darasa kwa kazi zilizosahihishwa', allCourses: 'Masomo yote', noCourses: 'Bado hujapangiwa somo lolote',
    needsGrading: 'Zinahitaji kusahihishwa', caughtUp: 'Umemaliza kila kitu', courseAverage: 'Wastani wa {subject} {cls}',
    myGrades: 'Alama zangu', noClassYet: 'Bado hujapangiwa darasa.', studentSubtitle: '{cls} · tufanye leo iwe siku njema.',
    supportActive: 'Mpango wako wa msaada unatumika', supportBody: 'Walimu wako wanajua kuhusu: {needs}. Tumia kitufe cha ufikivu juu ya ukurasa kubadilisha ukubwa wa maandishi, rangi na miondoko.',
    overallAverage: 'Wastani wa jumla', gradeX: 'Daraja {grade}', absencesTerm: 'Utoro mara {n} muhula huu', absenceTerm: 'Utoro mara 1 muhula huu',
    dueSoon: 'Zinakaribia', assignmentsTests: 'Kazi na majaribio', feeBalance: 'Salio la ada', outstanding: 'Linadaiwa', allPaid: 'Imelipwa yote',
    howDoing: 'Ninavyoendelea', howDoingHint: 'Wastani wa kazi zilizosahihishwa kwa kila somo', details: 'Maelezo', all: 'Zote', nothingDue: 'Hakuna kazi inayodaiwa — hongera!',
    parentSubtitle1: 'Hivi ndivyo {names} anavyoendelea', parentSubtitleN: 'Hivi ndivyo {names} wanavyoendelea', parentWelcome: 'Karibu kwenye ukurasa wa wazazi',
    messageTeacher: 'Mtumie mwalimu ujumbe', noChildren: 'Bado hujaunganishwa na mtoto', noChildrenHint: 'Tafadhali wasiliana na ofisi ya shule ili akaunti yako iunganishwe na mtoto wako.',
    viewProgress: 'Tazama maendeleo', average: 'Wastani', attendance: 'Mahudhurio', thisTerm: 'muhula huu', dueSoonLower: 'Zinakaribia',
    assignmentsTestsLower: 'kazi na majaribio', fees: 'Ada', outstandingLower: 'inadaiwa', allPaidLower: 'imelipwa yote',
    results: 'Matokeo', assignments: 'Kazi', outstandingFees: 'Unadaiwa {amount} ya ada ya shule',
    seeInvoices: 'Tazama ankara na maelezo ya malipo', and: 'na', quickLinksFor: 'Viungo vya haraka vya {name}', noClass: 'Hana darasa',
    assignment: 'kazi', quiz: 'jaribio fupi', test: 'jaribio', exam: 'mtihani', project: 'mradi',
  },
};

type Msg = keyof typeof M.en;
type T = (key: Msg, vars?: Record<string, string | number | null | undefined>) => string;

const greetingKey = (): CommonKey => {
  const h = new Date().getHours();
  return h < 12 ? 'goodMorning' : h < 17 ? 'goodAfternoon' : 'goodEvening';
};

export function DashboardPage() {
  const user = useUser();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });

  if (isLoading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 110, borderRadius: 18 }} />
        <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} rows={1} />)}</div>
        <div className="grid grid-main"><CardSkeleton rows={6} /><CardSkeleton rows={4} /></div>
      </div>
    );
  }
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  switch (data.role) {
    case 'admin':
      return <AdminView d={data} name={user.firstName} />;
    case 'teacher':
      return <TeacherView d={data} name={user.firstName} />;
    case 'student':
      return <StudentView d={data} name={user.firstName} />;
    case 'parent':
      return <ParentView d={data} name={user.firstName} />;
  }
}

// ---------------------------------------------------------------- Shared widgets
function useTodayLabel() {
  useI18n(); // re-render when the language changes
  return formatDate(new Date().toISOString().slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Greeting banner; its colours follow the person's chosen colour theme. */
function Welcome({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  const today = useTodayLabel();
  return (
    <section className="welcome">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <span className="chip-light"><CalendarDays size={14} aria-hidden /> {today}</span>
      </div>
      {action}
    </section>
  );
}

const EVENT_TONE: Record<EventType, Tone> = {
  academic: 'primary', exam: 'danger', holiday: 'success', meeting: 'accent', sports: 'warning', other: 'info',
};

function EventsCard({ events }: { events: SchoolEvent[] }) {
  const { t: tc } = useI18n();
  const t = useT(M);
  return (
    <Card>
      <CardHeader title={t('comingUp')} action={<Link to="/calendar" className="small bold">{tc('calendar')}</Link>} />
      {events.length === 0 ? (
        <EmptyState icon={<CalendarDays size={24} />} title={t('nothingScheduled')} />
      ) : (
        <ul className="list">
          {events.map((e) => {
            const d = new Date(`${e.startsOn}T00:00:00`);
            return (
              <li key={e.id} className="list-item">
                <div className={`date-tile tone-${EVENT_TONE[e.type]}`} aria-hidden>
                  <div className="m">{formatDate(e.startsOn, { month: 'short' })}</div>
                  <div className="d">{d.getDate()}</div>
                </div>
                <div className="grow">
                  <div className="title truncate">{e.title}</div>
                  <div className="meta">
                    {e.startsOn === e.endsOn ? formatDate(e.startsOn, { weekday: 'long', day: 'numeric', month: 'short' }) : `${formatShortDate(e.startsOn)} – ${formatShortDate(e.endsOn)}`}
                    {e.location && ` · ${e.location}`}
                  </div>
                </div>
                <span className="tiny muted">{relativeTime(e.startsOn)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function AnnouncementsCard({ items }: { items: Announcement[] }) {
  const t = useT(M);
  return (
    <Card>
      <CardHeader title={t('announcements')} action={<Link to="/announcements" className="small bold">{t('seeAll')}</Link>} />
      {items.length === 0 ? (
        <EmptyState icon={<Megaphone size={24} />} title={t('noAnnouncements')} />
      ) : (
        <ul className="list">
          {items.map((a) => (
            <li key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  {a.pinned && <Pin size={14} className="text-warning" aria-label={t('pinned')} />}
                  <span className="title">{a.title}</span>
                </div>
                <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 2 }}>{a.body}</p>
                <div className="tiny subtle mt-1">{a.authorName ?? t('schoolOffice')} · {relativeTime(a.createdAt)}{a.className && ` · ${a.className}`}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function minutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

function TodaySchedule({ slots, perspective }: { slots: TimetableSlot[]; perspective: 'teacher' | 'student' }) {
  const t = useT(M);
  const today = useTodayLabel();
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  return (
    <Card>
      <CardHeader title={t('todaysLessons')} subtitle={today} action={<Link to="/timetable" className="small bold">{t('fullTimetable')}</Link>} />
      {slots.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title={t('noLessons')}>{t('enjoyBreak')}</EmptyState>
      ) : (
        <div>
          {slots.map((s) => {
            const live = now >= minutes(s.startsAt) && now < minutes(s.endsAt);
            const past = now >= minutes(s.endsAt);
            return (
              <div key={s.id} className={cx('lesson', live && 'now')} style={{ opacity: past ? 0.6 : 1 }}>
                <div className="lesson-time"><strong>{s.startsAt}</strong>{s.endsAt}</div>
                <div className="lesson-bar" style={{ background: s.color }} aria-hidden />
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="bold">{s.subjectName}</span>
                    {live && <Badge tone="primary" dot>{t('now')}</Badge>}
                  </div>
                  <div className="small muted">
                    {perspective === 'teacher' ? s.className : s.teacherName ?? t('teacherTbc')}
                    {s.room && ` · ${t('room', { room: s.room })}`}
                  </div>
                </div>
                {perspective === 'teacher' && !past && (
                  <ButtonLink to={`/attendance?classId=${s.classId}`} size="sm" variant="ghost">{t('register')}</ButtonLink>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function DueList({ items, emptyText, linkTo }: { items: Assessment[]; emptyText: string; linkTo?: (a: Assessment) => string }) {
  const { t: tc } = useI18n();
  const t = useT(M);
  if (items.length === 0) return <EmptyState icon={<CheckCircle2 size={24} />} title={emptyText} />;
  return (
    <ul className="list">
      {items.map((a) => {
        const due = a.dueDate ? daysUntil(a.dueDate) : null;
        const tone: Tone = due === null ? 'neutral' : due < 0 ? 'danger' : due <= 2 ? 'warning' : 'neutral';
        const body = (
          <>
            <span className="color-dot" style={{ background: a.color }} aria-hidden />
            <div className="grow">
              <div className="title truncate">{a.title}</div>
              <div className="meta">{a.className} · {t(a.type as AssessmentType)}{linkTo && ` · ${t('graded', { a: a.gradedCount, b: a.studentCount })}`}</div>
            </div>
            {a.dueDate && <Badge tone={tone}>{due === 0 ? tc('today') : relativeTime(a.dueDate)}</Badge>}
          </>
        );
        return (
          <li key={a.id}>
            {linkTo ? <Link to={linkTo(a)} className="list-item">{body}</Link> : <div className="list-item">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- Admin
function AdminView({ d, name }: { d: AdminDashboard; name: string }) {
  const school = useSchool();
  const { t: tc } = useI18n();
  const t = useT(M);
  const att = d.attendanceToday;
  const collectedPct = d.fees.billed ? (d.fees.collected / d.fees.billed) * 100 : 0;
  const missingRegisters = att.classesTotal - att.classesTaken;
  return (
    <>
      <Welcome
        title={`${tc(greetingKey())}, ${name}`}
        subtitle={t('adminSubtitle', { school: school.name })}
        action={<ButtonLink to="/students?new=1" icon={<GraduationCap size={18} />}>{t('enrol')}</ButtonLink>}
      />
      <div className="grid grid-4 mb-3">
        <StatCard icon={<GraduationCap size={22} />} label={t('studentsStat')} value={d.counts.students} hint={t('classesHint', { n: d.counts.classes })} to="/students" />
        <StatCard icon={<UserRound size={22} />} label={t('teachersStat')} value={d.counts.teachers} tone="accent" hint={t('perTeacher', { n: (d.counts.students / Math.max(1, d.counts.teachers)).toFixed(0) })} to="/teachers" />
        <StatCard icon={<ClipboardCheck size={22} />} label={t('attendanceToday')} value={percent(att.rate, 1)} tone={attendanceTone(att.rate)} hint={t('absentLate', { absent: att.absent, late: att.late })} to="/attendance" />
        <StatCard icon={<Wallet size={22} />} label={t('feesOutstanding')} value={money(d.fees.outstanding)} tone={d.fees.overdueCount ? 'warning' : 'success'} hint={t('overdueInvoices', { n: d.fees.overdueCount })} to="/fees?status=overdue" />
      </div>

      <SetupChecklist d={d} />

      {(missingRegisters > 0 || d.newEnquiries > 0) && (
        <div className="stack-sm mb-3">
          {missingRegisters > 0 && (
            <Alert tone="warning" icon={<AlertTriangle size={20} />} title={missingRegisters === 1 ? t('registerMissing') : t('registersMissing', { n: missingRegisters })}>
              <Link to="/attendance">{t('openAttendance')}</Link> {t('toSeeWhich')}
            </Alert>
          )}
          {d.newEnquiries > 0 && (
            <Alert tone="info" icon={<Inbox size={20} />} title={d.newEnquiries === 1 ? t('enquiryAlert') : t('enquiriesAlert', { n: d.newEnquiries })}>
              <Link to="/enquiries">{t('reviewEnquiries')}</Link>
            </Alert>
          )}
        </div>
      )}

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title={t('attendance3w')} subtitle={t('attendance3wHint')} />
            <div className="card-body"><TrendChart data={d.attendanceTrend} /></div>
          </Card>
          <PerformanceCard d={d} />
          <div className="grid grid-2">
            <Card>
              <CardHeader title={t('feeCollection')} subtitle={t('allInvoices')} />
              <div className="card-body stack">
                <div>
                  <div className="row between small"><span className="muted">{t('collected')}</span><strong className="num">{percent(collectedPct)}</strong></div>
                  <div className="mt-1"><ProgressBar value={collectedPct} tone="success" label={t('collected')} /></div>
                </div>
                <dl className="kv">
                  <dt>{t('billed')}</dt><dd className="num">{money(d.fees.billed)}</dd>
                  <dt>{t('collected')}</dt><dd className="num text-success">{money(d.fees.collected)}</dd>
                  <dt>{t('overdue')}</dt><dd className="num text-danger">{money(d.fees.overdueAmount)}</dd>
                </dl>
                <ButtonLink to="/fees" size="sm" icon={<ArrowRight size={15} />}>{t('manageFees')}</ButtonLink>
              </div>
            </Card>
            <Card>
              <CardHeader title={t('enrolmentByLevel')} />
              <div className="card-body">
                <ColumnChart
                  label={t('studentsPerLevel')}
                  max={Math.max(1, ...d.enrollmentByGrade.map((g) => g.count))}
                  format={(v) => t('nStudents', { n: v })}
                  color="var(--accent)"
                  data={d.enrollmentByGrade.map((g) => ({ label: levelName(g.gradeLevel, school.levelLabel), title: levelName(g.gradeLevel, school.levelLabel), value: g.count }))}
                />
              </div>
            </Card>
          </div>
          <AnnouncementsCard items={d.announcements} />
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title={t('todaysRegister')} subtitle={t('classesRecorded', { a: att.classesTaken, b: att.classesTotal })} />
            <div className="card-body">
              <Donut
                label={t('todaysRegister')}
                center={<div><div className="donut-center">{att.total}</div><div className="tiny muted">{t('marked')}</div></div>}
                segments={[
                  { label: tc('present'), value: att.present, color: 'var(--success)' },
                  { label: tc('late'), value: att.late, color: 'var(--warning)' },
                  { label: tc('absent'), value: att.absent, color: 'var(--danger)' },
                  { label: tc('excused'), value: att.excused, color: 'var(--info)' },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t('quickActions')} />
            <div className="card-body" style={{ display: 'grid', gap: 8 }}>
              <ButtonLink to="/attendance" icon={<ClipboardCheck size={17} />}>{t('takeAttendance')}</ButtonLink>
              <ButtonLink to="/fees?new=1" icon={<Wallet size={17} />}>{t('createInvoices')}</ButtonLink>
              <ButtonLink to="/announcements?new=1" icon={<Megaphone size={17} />}>{t('postAnnouncement')}</ButtonLink>
              <ButtonLink to="/timetable" icon={<CalendarDays size={17} />}>{t('editTimetable')}</ButtonLink>
            </div>
          </Card>
          <RecentActivityCard d={d} />
          <EventsCard events={d.upcomingEvents} />
        </div>
      </div>
    </>
  );
}

function PerformanceCard({ d }: { d: AdminDashboard }) {
  const t = useT(M);
  const p = d.performance;
  const subjects = p.subjects.filter((s) => s.averagePercent !== null);
  return (
    <Card>
      <CardHeader
        title={t('performance')}
        subtitle={p.examName ? t('performanceHint', { exam: p.examName }) : undefined}
        action={<Link to="/exams" className="small bold">{t('allExams')}</Link>}
      />
      <div className="card-body">
        {!p.examName || subjects.length === 0 ? (
          <EmptyState icon={<Award size={24} />} title={t('noExam')}>{t('noExamHint')}</EmptyState>
        ) : (
          subjects.map((s) => (
            <div key={s.subjectName} className="hbar">
              <span className="label"><span className="color-dot" style={{ background: s.color }} aria-hidden />{s.subjectName}</span>
              <ProgressBar value={s.averagePercent} tone={gradeTone(s.averagePercent)} label={t('subjectAvg', { subject: s.subjectName })} />
              <span className="val">{percent(s.averagePercent)}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function RecentActivityCard({ d }: { d: AdminDashboard }) {
  const t = useT(M);
  return (
    <Card>
      <CardHeader title={t('recentActivity')} subtitle={t('activityHint')} action={<Link to="/audit-log" className="small bold">{t('auditLog')}</Link>} />
      {d.recentActivity.length === 0 ? (
        <EmptyState icon={<History size={24} />} title={t('noActivity')} />
      ) : (
        <ul className="list">
          {d.recentActivity.map((a) => (
            <li key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <Avatar name={a.actorName ?? '?'} size="sm" color={a.actorName ? colorFor(a.actorName) : undefined} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small"><span className="bold">{a.actorName ?? t('schoolOffice')}</span> · {a.summary}</div>
                <div className="tiny subtle">{relativeTime(a.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Getting started (admin)
const SETUP_KEY = 'edulearn-setup-dismissed';

/** Guides a brand-new school through setup in the order things depend on each other. Hides itself once done. */
function SetupChecklist({ d }: { d: AdminDashboard }) {
  const t = useT(M);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(SETUP_KEY) === '1';
    } catch {
      return false;
    }
  });
  const steps = [
    { label: t('stepTerm'), done: d.setup.terms > 0, to: '/academics?tab=terms' },
    { label: t('stepSubjects'), done: d.setup.subjects > 0, to: '/academics' },
    { label: t('stepTeachers'), done: d.counts.teachers > 0, to: '/teachers' },
    { label: t('stepClasses'), done: d.counts.classes > 0, to: '/classes' },
    { label: t('stepCourses'), done: d.setup.courses > 0, to: '/classes' },
    { label: t('stepStudents'), done: d.counts.students > 0, to: '/students?new=1' },
    { label: t('stepTimetable'), done: d.setup.lessons > 0, to: '/timetable' },
  ];
  const done = steps.filter((s) => s.done).length;
  if (dismissed || done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <Card className="mb-3">
      <CardHeader
        title={t('setupTitle')}
        subtitle={t('setupHint', { done, total: steps.length })}
        action={
          <Button size="sm" variant="ghost" onClick={() => {
            try { localStorage.setItem(SETUP_KEY, '1'); } catch { /* ignore */ }
            setDismissed(true);
          }}>{t('hide')}</Button>
        }
      />
      <div className="card-body stack">
        <ProgressBar value={(done / steps.length) * 100} tone="success" label={t('setupProgress')} />
        <ol className="checklist">
          {steps.map((s, i) => (
            <li key={s.label} className={cx('check-item', s.done && 'done')}>
              <span className="check-dot" aria-hidden>{s.done ? <Check size={15} /> : i + 1}</span>
              <span className="label">{s.label}<span className="sr-only"> — {s.done ? t('done') : t('todo')}</span></span>
              {!s.done && <ButtonLink to={s.to} size="sm" variant={s === next ? 'primary' : 'secondary'}>{s === next ? t('start') : t('details')}</ButtonLink>}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Teacher
function TeacherView({ d, name }: { d: TeacherDashboard; name: string }) {
  const { t: tc } = useI18n();
  const t = useT(M);
  const studentTotal = d.courses.reduce((s, c) => s + c.studentCount, 0);
  const toGradeCount = d.toGrade.reduce((s, a) => s + (a.studentCount - a.gradedCount), 0);
  return (
    <>
      <Welcome
        title={`${tc(greetingKey())}, ${name}`}
        subtitle={d.today.length ? t('teacherSubtitle', { n: d.today.length }) : t('teacherNoLessons')}
        action={d.homeroom && !d.homeroom.attendanceTaken ? (
          <ButtonLink to={`/attendance?classId=${d.homeroom.classId}`} icon={<ClipboardCheck size={18} />}>{t('takeRegister', { cls: d.homeroom.className })}</ButtonLink>
        ) : undefined}
      />
      <div className="grid grid-4 mb-3">
        <StatCard icon={<BookOpen size={22} />} label={t('courses')} value={d.courses.length} hint={t('studentPlaces', { n: studentTotal })} to="/my-classes" />
        <StatCard icon={<NotebookPen size={22} />} label={t('scoresToEnter')} value={toGradeCount} tone={toGradeCount ? 'warning' : 'success'} hint={t('nAssessments', { n: d.toGrade.length })} to="/gradebook" />
        <StatCard icon={<School size={22} />} label={t('classTeacherOf')} value={d.homeroom?.className ?? '—'} tone="accent" hint={d.homeroom ? t('nStudents', { n: d.homeroom.studentCount }) : t('noHomeroom')} to={d.homeroom ? `/classes/${d.homeroom.classId}` : undefined} />
        <StatCard
          icon={<ClipboardCheck size={22} />}
          label={t('todaysRegisterStat')}
          value={d.homeroom ? (d.homeroom.attendanceTaken ? t('registerDone') : t('registerTodo')) : '—'}
          tone={d.homeroom?.attendanceTaken ? 'success' : 'warning'}
          hint={d.homeroom?.className}
          to={d.homeroom ? `/attendance?classId=${d.homeroom.classId}` : '/attendance'}
        />
      </div>
      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <TodaySchedule slots={d.today} perspective="teacher" />
          <Card>
            <CardHeader title={t('myCourses')} subtitle={t('classAverageHint')} action={<Link to="/my-classes" className="small bold">{t('allCourses')}</Link>} />
            <div className="card-body">
              {d.courses.length === 0 ? <EmptyState title={t('noCourses')} /> : d.courses.map((c) => (
                <Link key={c.id} to={`/gradebook/${c.id}`} className="hbar" style={{ color: 'inherit' }}>
                  <span className="label"><span className="color-dot" style={{ background: c.color }} aria-hidden />{c.className} · {c.subjectCode}</span>
                  <ProgressBar value={c.averagePercent} tone={gradeTone(c.averagePercent)} label={t('courseAverage', { cls: c.className, subject: c.subjectName })} />
                  <span className="val">{percent(c.averagePercent)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title={t('needsGrading')} action={<Link to="/gradebook" className="small bold">{tc('gradebook')}</Link>} />
            <DueList items={d.toGrade} emptyText={t('caughtUp')} linkTo={(a) => `/gradebook/${a.courseId}?assessment=${a.id}`} />
          </Card>
          <AnnouncementsCard items={d.announcements} />
          <EventsCard events={d.upcomingEvents} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Student
function StudentView({ d, name }: { d: StudentDashboard; name: string }) {
  const { t: tc } = useI18n();
  const t = useT(M);
  const o = d.overview;
  return (
    <>
      <Welcome
        title={`${tc(greetingKey())}, ${name}!`}
        subtitle={o.student.className ? t('studentSubtitle', { cls: o.student.className }) : t('noClassYet')}
        action={<ButtonLink to="/progress" icon={<NotebookPen size={18} />}>{t('myGrades')}</ButtonLink>}
      />
      {o.student.accessibilityNeeds.length > 0 && (
        <div className="mb-3">
          <Alert tone="info" title={t('supportActive')}>
            {t('supportBody', { needs: o.student.accessibilityNeeds.join(', ') })}
          </Alert>
        </div>
      )}
      <div className="grid grid-4 mb-3">
        <StatCard icon={<NotebookPen size={22} />} label={t('overallAverage')} value={percent(o.overallAverage, 1)} tone={gradeTone(o.overallAverage)} hint={t('gradeX', { grade: letterGrade(o.overallAverage) })} to="/progress" />
        <StatCard icon={<ClipboardCheck size={22} />} label={tc('attendance')} value={percent(o.attendance.rate, 1)} tone={attendanceTone(o.attendance.rate)} hint={o.attendance.absent === 1 ? t('absenceTerm') : t('absencesTerm', { n: o.attendance.absent })} to="/progress?tab=attendance" />
        <StatCard icon={<BookOpen size={22} />} label={t('dueSoon')} value={o.upcoming.length} tone="accent" hint={t('assignmentsTests')} to="/assignments" />
        <StatCard icon={<Wallet size={22} />} label={t('feeBalance')} value={money(o.feeBalance)} tone={o.feeBalance > 0 ? 'warning' : 'success'} hint={o.feeBalance > 0 ? t('outstanding') : t('allPaid')} to="/fees" />
      </div>
      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <TodaySchedule slots={d.today} perspective="student" />
          <Card>
            <CardHeader title={t('howDoing')} subtitle={t('howDoingHint')} action={<Link to="/progress" className="small bold">{t('details')}</Link>} />
            <div className="card-body">
              {o.subjectAverages.map((s) => (
                <div key={s.subjectName} className="hbar">
                  <span className="label"><span className="color-dot" style={{ background: s.color }} aria-hidden />{s.subjectName}</span>
                  <ProgressBar value={s.averagePercent} tone={gradeTone(s.averagePercent)} label={t('subjectAvg', { subject: s.subjectName })} />
                  <span className="val">{percent(s.averagePercent)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title={t('dueSoon')} action={<Link to="/assignments" className="small bold">{t('all')}</Link>} />
            <DueList items={o.upcoming.slice(0, 5)} emptyText={t('nothingDue')} />
          </Card>
          <AnnouncementsCard items={d.announcements} />
          <EventsCard events={d.upcomingEvents} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Parent
function ParentView({ d, name }: { d: ParentDashboard; name: string }) {
  const { t: tc } = useI18n();
  const t = useT(M);
  const totalBalance = d.children.reduce((s, c) => s + c.feeBalance, 0);
  const names = d.children.map((c) => c.student.firstName);
  const joined = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} ${t('and')} ${names[names.length - 1]}`;
  return (
    <>
      <Welcome
        title={`${tc(greetingKey())}, ${name}`}
        subtitle={d.children.length ? (d.children.length === 1 ? t('parentSubtitle1', { names: joined }) : t('parentSubtitleN', { names: joined })) : t('parentWelcome')}
        action={<ButtonLink to="/messages?compose=1" icon={<Users size={18} />}>{t('messageTeacher')}</ButtonLink>}
      />
      {d.children.length === 0 ? (
        <Card><EmptyState icon={<Users size={26} />} title={t('noChildren')}>{t('noChildrenHint')}</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-2 mb-3">
            {d.children.map((c) => <ChildCard key={c.student.id} c={c} t={t} />)}
          </div>
          {totalBalance > 0 && (
            <div className="mb-3">
              <Alert tone="warning" icon={<Wallet size={20} />} title={t('outstandingFees', { amount: money(totalBalance) })}>
                <Link to="/fees">{t('seeInvoices')}</Link>
              </Alert>
            </div>
          )}
        </>
      )}
      <div className="grid grid-2">
        <AnnouncementsCard items={d.announcements} />
        <EventsCard events={d.upcomingEvents} />
      </div>
    </>
  );
}

function ChildCard({ c, t }: { c: ParentDashboard['children'][number]; t: T }) {
  const id = c.student.id;
  const name = fullName(c.student);
  const links = [
    { to: `/report-cards?child=${id}`, label: t('results'), icon: <Award size={16} /> },
    { to: `/students/${id}?tab=attendance`, label: t('attendance'), icon: <ClipboardCheck size={16} /> },
    { to: `/assignments?child=${id}`, label: t('assignments'), icon: <BookOpen size={16} /> },
    { to: `/fees?child=${id}`, label: t('fees'), icon: <Wallet size={16} /> },
  ];
  return (
    <Card>
      <div className="card-body">
        <div className="row row-wrap" style={{ gap: 16 }}>
          <Avatar name={name} size="lg" photoUrl={c.student.photoUrl} />
          <div className="grow" style={{ minWidth: 160 }}>
            <h2>{name}</h2>
            <div className="muted small">{c.student.className ?? t('noClass')} · {c.student.admissionNo}</div>
          </div>
          <ButtonLink to={`/students/${id}`} size="sm" variant="primary">{t('viewProgress')}</ButtonLink>
        </div>
        <div className="grid mt-2" style={{ gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <MiniStat label={t('average')} value={percent(c.overallAverage, 1)} sub={t('gradeX', { grade: letterGrade(c.overallAverage) })} tone={gradeTone(c.overallAverage)} />
          <MiniStat label={t('attendance')} value={percent(c.attendanceRate, 1)} sub={t('thisTerm')} tone={attendanceTone(c.attendanceRate)} />
          <MiniStat label={t('dueSoonLower')} value={String(c.upcomingCount)} sub={t('assignmentsTestsLower')} tone="accent" />
          <MiniStat label={t('fees')} value={money(c.feeBalance)} sub={c.feeBalance > 0 ? t('outstandingLower') : t('allPaidLower')} tone={c.feeBalance > 0 ? 'warning' : 'success'} />
        </div>
        <nav aria-label={t('quickLinksFor', { name })} className="grid mt-2" style={{ gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          {links.map((l) => <ButtonLink key={l.to} to={l.to} size="sm" icon={l.icon}>{l.label}</ButtonLink>)}
        </nav>
      </div>
    </Card>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Tone }) {
  return (
    <div className={cx('card', `tone-${tone}`)} style={{ padding: '12px 14px', background: 'var(--surface-2)' }}>
      <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="bold num" style={{ fontSize: '1.25rem', color: 'var(--tone)' }}>{value}</div>
      <div className="tiny muted">{sub}</div>
    </div>
  );
}
