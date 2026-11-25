import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, Clock, GraduationCap,
  Megaphone, NotebookPen, Pin, School, UserRound, Users, Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  AdminDashboard, Announcement, Assessment, Dashboard, ParentDashboard, SchoolEvent, StudentDashboard,
  TeacherDashboard, TimetableSlot,
} from '../../../shared/types';
import { ColumnChart, Donut, TrendChart } from '../components/charts';
import {
  Alert, Avatar, Badge, ButtonLink, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, ProgressBar, StatCard, cx,
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import {
  attendanceTone, daysUntil, formatDate, formatShortDate, fullName, gradeTone, letterGrade, money, percent, plural,
  relativeTime, type Tone,
} from '../lib/format';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
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
function Welcome({ title, subtitle, action, from, to }: { title: string; subtitle: string; action?: React.ReactNode; from?: string; to?: string }) {
  return (
    <section className="welcome" style={{ ['--welcome-from' as string]: from, ['--welcome-to' as string]: to }}>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </section>
  );
}

const todayLabel = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const EVENT_TONE: Record<SchoolEvent['type'], Tone> = {
  academic: 'primary', exam: 'danger', holiday: 'success', meeting: 'accent', sports: 'warning', other: 'info',
};

function EventsCard({ events }: { events: SchoolEvent[] }) {
  return (
    <Card>
      <CardHeader title="Coming up" action={<Link to="/calendar" className="small bold">Calendar</Link>} />
      {events.length === 0 ? (
        <EmptyState icon={<CalendarDays size={24} />} title="Nothing scheduled" />
      ) : (
        <ul className="list">
          {events.map((e) => {
            const d = new Date(`${e.startsOn}T00:00:00`);
            return (
              <li key={e.id} className="list-item">
                <div className={`date-tile tone-${EVENT_TONE[e.type]}`} aria-hidden>
                  <div className="m">{d.toLocaleDateString(undefined, { month: 'short' })}</div>
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
  return (
    <Card>
      <CardHeader title="Announcements" action={<Link to="/announcements" className="small bold">See all</Link>} />
      {items.length === 0 ? (
        <EmptyState icon={<Megaphone size={24} />} title="No announcements yet" />
      ) : (
        <ul className="list">
          {items.map((a) => (
            <li key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  {a.pinned && <Pin size={14} className="text-warning" aria-label="Pinned" />}
                  <span className="title">{a.title}</span>
                </div>
                <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 2 }}>{a.body}</p>
                <div className="tiny subtle mt-1">{a.authorName ?? 'School office'} · {relativeTime(a.createdAt)}{a.className && ` · ${a.className}`}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function minutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
}

function TodaySchedule({ slots, perspective }: { slots: TimetableSlot[]; perspective: 'teacher' | 'student' }) {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  return (
    <Card>
      <CardHeader title="Today’s lessons" subtitle={todayLabel()} action={<Link to="/timetable" className="small bold">Full timetable</Link>} />
      {slots.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title="No lessons today">Enjoy the break!</EmptyState>
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
                    {live && <Badge tone="primary" dot>Now</Badge>}
                  </div>
                  <div className="small muted">
                    {perspective === 'teacher' ? s.className : s.teacherName ?? 'Teacher to be confirmed'}
                    {s.room && ` · Room ${s.room}`}
                  </div>
                </div>
                {perspective === 'teacher' && !past && (
                  <ButtonLink to={`/attendance?classId=${s.classId}`} size="sm" variant="ghost">Register</ButtonLink>
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
              <div className="meta">{a.className} · {a.type}{linkTo && ` · ${a.gradedCount}/${a.studentCount} graded`}</div>
            </div>
            {a.dueDate && <Badge tone={tone}>{due === 0 ? 'Today' : relativeTime(a.dueDate)}</Badge>}
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
  const { school } = useAuth();
  const att = d.attendanceToday;
  const collectedPct = d.fees.billed ? (d.fees.collected / d.fees.billed) * 100 : 0;
  const missingRegisters = att.classesTotal - att.classesTaken;
  return (
    <>
      <Welcome
        title={`${greeting()}, ${name}`}
        subtitle={`Here’s how ${school.name} is doing today · ${todayLabel()}`}
        action={<ButtonLink to="/students?new=1" icon={<GraduationCap size={18} />}>Enrol a student</ButtonLink>}
      />
      <div className="grid grid-4 mb-3">
        <StatCard icon={<GraduationCap size={22} />} label="Students" value={d.counts.students} hint={`${d.counts.classes} classes`} to="/students" />
        <StatCard icon={<UserRound size={22} />} label="Teachers" value={d.counts.teachers} tone="accent" hint={`${(d.counts.students / Math.max(1, d.counts.teachers)).toFixed(0)} students per teacher`} to="/teachers" />
        <StatCard icon={<ClipboardCheck size={22} />} label="Attendance today" value={percent(att.rate, 1)} tone={attendanceTone(att.rate)} hint={`${att.absent} absent · ${att.late} late`} to="/attendance" />
        <StatCard icon={<Wallet size={22} />} label="Fees outstanding" value={money(d.fees.outstanding)} tone={d.fees.overdueCount ? 'warning' : 'success'} hint={`${plural(d.fees.overdueCount, 'overdue invoice')}`} to="/fees?status=overdue" />
      </div>

      {missingRegisters > 0 && (
        <div className="mb-3">
          <Alert tone="warning" icon={<AlertTriangle size={20} />} title={`${plural(missingRegisters, 'class has', 'classes have')} not taken today’s register yet`}>
            <Link to="/attendance">Open attendance</Link> to see which ones.
          </Alert>
        </div>
      )}

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title="Attendance — last 3 weeks" subtitle="Share of students present or late each school day" />
            <div className="card-body"><TrendChart data={d.attendanceTrend} /></div>
          </Card>
          <div className="grid grid-2">
            <Card>
              <CardHeader title="Fee collection" subtitle="All invoices this term" />
              <div className="card-body stack">
                <div>
                  <div className="row between small"><span className="muted">Collected</span><strong className="num">{percent(collectedPct)}</strong></div>
                  <div className="mt-1"><ProgressBar value={collectedPct} tone="success" label="Fees collected" /></div>
                </div>
                <dl className="kv">
                  <dt>Billed</dt><dd className="num">{money(d.fees.billed)}</dd>
                  <dt>Collected</dt><dd className="num text-success">{money(d.fees.collected)}</dd>
                  <dt>Overdue</dt><dd className="num text-danger">{money(d.fees.overdueAmount)}</dd>
                </dl>
                <ButtonLink to="/fees" size="sm" icon={<ArrowRight size={15} />}>Manage fees</ButtonLink>
              </div>
            </Card>
            <Card>
              <CardHeader title="Enrolment by grade" />
              <div className="card-body">
                <ColumnChart
                  label="Students per grade"
                  max={Math.max(1, ...d.enrollmentByGrade.map((g) => g.count))}
                  format={(v) => plural(v, 'student')}
                  color="var(--accent)"
                  data={d.enrollmentByGrade.map((g) => ({ label: `Gr ${g.gradeLevel}`, title: `Grade ${g.gradeLevel}`, value: g.count }))}
                />
              </div>
            </Card>
          </div>
          <AnnouncementsCard items={d.announcements} />
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title="Today’s register" subtitle={`${att.classesTaken} of ${att.classesTotal} classes recorded`} />
            <div className="card-body">
              <Donut
                label="Attendance today"
                center={<div><div className="donut-center">{att.total}</div><div className="tiny muted">marked</div></div>}
                segments={[
                  { label: 'Present', value: att.present, color: 'var(--success)' },
                  { label: 'Late', value: att.late, color: 'var(--warning)' },
                  { label: 'Absent', value: att.absent, color: 'var(--danger)' },
                  { label: 'Excused', value: att.excused, color: 'var(--info)' },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Quick actions" />
            <div className="card-body" style={{ display: 'grid', gap: 8 }}>
              <ButtonLink to="/attendance" icon={<ClipboardCheck size={17} />}>Take or review attendance</ButtonLink>
              <ButtonLink to="/fees?new=1" icon={<Wallet size={17} />}>Create invoices</ButtonLink>
              <ButtonLink to="/announcements?new=1" icon={<Megaphone size={17} />}>Post an announcement</ButtonLink>
              <ButtonLink to="/timetable" icon={<CalendarDays size={17} />}>Edit the timetable</ButtonLink>
            </div>
          </Card>
          <EventsCard events={d.upcomingEvents} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Teacher
function TeacherView({ d, name }: { d: TeacherDashboard; name: string }) {
  const studentTotal = d.courses.reduce((s, c) => s + c.studentCount, 0);
  const toGradeCount = d.toGrade.reduce((s, a) => s + (a.studentCount - a.gradedCount), 0);
  return (
    <>
      <Welcome
        title={`${greeting()}, ${name}`}
        subtitle={`You have ${plural(d.today.length, 'lesson')} today · ${todayLabel()}`}
        from="#c2185b"
        to="#7209b7"
        action={d.homeroom && !d.homeroom.attendanceTaken ? (
          <ButtonLink to={`/attendance?classId=${d.homeroom.classId}`} icon={<ClipboardCheck size={18} />}>Take {d.homeroom.className} register</ButtonLink>
        ) : undefined}
      />
      <div className="grid grid-4 mb-3">
        <StatCard icon={<BookOpen size={22} />} label="Courses" value={d.courses.length} hint={`${studentTotal} student places`} to="/my-classes" />
        <StatCard icon={<NotebookPen size={22} />} label="Scores to enter" value={toGradeCount} tone={toGradeCount ? 'warning' : 'success'} hint={`${plural(d.toGrade.length, 'assessment')}`} to="/gradebook" />
        <StatCard icon={<School size={22} />} label="Class teacher of" value={d.homeroom?.className ?? '—'} tone="accent" hint={d.homeroom ? plural(d.homeroom.studentCount, 'student') : 'No homeroom'} to={d.homeroom ? `/classes/${d.homeroom.classId}` : undefined} />
        <StatCard
          icon={<ClipboardCheck size={22} />}
          label="Today’s register"
          value={d.homeroom ? (d.homeroom.attendanceTaken ? 'Done' : 'To do') : '—'}
          tone={d.homeroom?.attendanceTaken ? 'success' : 'warning'}
          hint={d.homeroom?.className}
          to={d.homeroom ? `/attendance?classId=${d.homeroom.classId}` : '/attendance'}
        />
      </div>
      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <TodaySchedule slots={d.today} perspective="teacher" />
          <Card>
            <CardHeader title="My courses" subtitle="Class average across graded work" action={<Link to="/my-classes" className="small bold">All courses</Link>} />
            <div className="card-body">
              {d.courses.length === 0 ? <EmptyState title="You aren’t assigned to any courses yet" /> : d.courses.map((c) => (
                <Link key={c.id} to={`/gradebook/${c.id}`} className="hbar" style={{ color: 'inherit' }}>
                  <span className="label"><span className="color-dot" style={{ background: c.color }} aria-hidden />{c.className} · {c.subjectCode}</span>
                  <ProgressBar value={c.averagePercent} tone={gradeTone(c.averagePercent)} label={`${c.className} ${c.subjectName} average`} />
                  <span className="val">{percent(c.averagePercent)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title="Needs grading" action={<Link to="/gradebook" className="small bold">Gradebook</Link>} />
            <DueList items={d.toGrade} emptyText="You’re all caught up" linkTo={(a) => `/gradebook/${a.courseId}?assessment=${a.id}`} />
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
  const o = d.overview;
  return (
    <>
      <Welcome
        title={`${greeting()}, ${name}!`}
        subtitle={`${o.student.className ?? 'No class yet'} · ${todayLabel()}`}
        from="#7209b7"
        to="#4361ee"
        action={<ButtonLink to="/progress" icon={<NotebookPen size={18} />}>My grades</ButtonLink>}
      />
      {o.student.accessibilityNeeds.length > 0 && (
        <div className="mb-3">
          <Alert tone="info" title="Your support plan is active">
            Your teachers know about: {o.student.accessibilityNeeds.join(', ')}. Use the accessibility button at the top of the page to change text size, contrast and motion.
          </Alert>
        </div>
      )}
      <div className="grid grid-4 mb-3">
        <StatCard icon={<NotebookPen size={22} />} label="Overall average" value={percent(o.overallAverage, 1)} tone={gradeTone(o.overallAverage)} hint={`Grade ${letterGrade(o.overallAverage)}`} to="/progress" />
        <StatCard icon={<ClipboardCheck size={22} />} label="Attendance" value={percent(o.attendance.rate, 1)} tone={attendanceTone(o.attendance.rate)} hint={`${o.attendance.absent} absences this term`} to="/progress?tab=attendance" />
        <StatCard icon={<BookOpen size={22} />} label="Due soon" value={o.upcoming.length} tone="accent" hint="Assignments and tests" to="/assignments" />
        <StatCard icon={<Wallet size={22} />} label="Fee balance" value={money(o.feeBalance)} tone={o.feeBalance > 0 ? 'warning' : 'success'} hint={o.feeBalance > 0 ? 'Outstanding' : 'All paid'} to="/fees" />
      </div>
      <div className="grid grid-main">
        <div className="stack" style={{ gap: 20 }}>
          <TodaySchedule slots={d.today} perspective="student" />
          <Card>
            <CardHeader title="How I’m doing" subtitle="Average across marked work in each subject" action={<Link to="/progress" className="small bold">Details</Link>} />
            <div className="card-body">
              {o.subjectAverages.map((s) => (
                <div key={s.subjectName} className="hbar">
                  <span className="label"><span className="color-dot" style={{ background: s.color }} aria-hidden />{s.subjectName}</span>
                  <ProgressBar value={s.averagePercent} tone={gradeTone(s.averagePercent)} label={`${s.subjectName} average`} />
                  <span className="val">{percent(s.averagePercent)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title="Due soon" action={<Link to="/assignments" className="small bold">All</Link>} />
            <DueList items={o.upcoming.slice(0, 5)} emptyText="Nothing due — nice work!" />
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
  const totalBalance = d.children.reduce((s, c) => s + c.feeBalance, 0);
  return (
    <>
      <Welcome
        title={`${greeting()}, ${name}`}
        subtitle={d.children.length ? `Here’s how ${d.children.map((c) => c.student.firstName).join(' and ')} ${d.children.length === 1 ? 'is' : 'are'} getting on` : 'Welcome to the parent portal'}
        from="#3a0ca3"
        to="#4361ee"
        action={<ButtonLink to="/messages?compose=1" icon={<Users size={18} />}>Message a teacher</ButtonLink>}
      />
      {d.children.length === 0 ? (
        <Card><EmptyState icon={<Users size={26} />} title="No children linked yet">Please contact the school office to link your account to your child.</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-2 mb-3">
            {d.children.map((c) => (
              <Card key={c.student.id}>
                <div className="card-body">
                  <div className="row" style={{ gap: 16 }}>
                    <Avatar name={fullName(c.student)} size="lg" />
                    <div className="grow">
                      <h2>{fullName(c.student)}</h2>
                      <div className="muted small">{c.student.className ?? 'No class'} · {c.student.admissionNo}</div>
                    </div>
                    <ButtonLink to={`/students/${c.student.id}`} size="sm" variant="primary">View progress</ButtonLink>
                  </div>
                  <div className="grid mt-2" style={{ gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <MiniStat label="Average" value={percent(c.overallAverage, 1)} sub={`Grade ${letterGrade(c.overallAverage)}`} tone={gradeTone(c.overallAverage)} />
                    <MiniStat label="Attendance" value={percent(c.attendanceRate, 1)} sub="this term" tone={attendanceTone(c.attendanceRate)} />
                    <MiniStat label="Due soon" value={String(c.upcomingCount)} sub="assignments & tests" tone="accent" />
                    <MiniStat label="Fees" value={money(c.feeBalance)} sub={c.feeBalance > 0 ? 'outstanding' : 'all paid'} tone={c.feeBalance > 0 ? 'warning' : 'success'} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {totalBalance > 0 && (
            <div className="mb-3">
              <Alert tone="warning" icon={<Wallet size={20} />} title={`You have ${money(totalBalance)} outstanding in school fees`}>
                <Link to="/fees">See invoices and payment details</Link>
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

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Tone }) {
  return (
    <div className={cx('card', `tone-${tone}`)} style={{ padding: '12px 14px', background: 'var(--surface-2)' }}>
      <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="bold num" style={{ fontSize: '1.25rem', color: 'var(--tone)' }}>{value}</div>
      <div className="tiny muted">{sub}</div>
    </div>
  );
}
