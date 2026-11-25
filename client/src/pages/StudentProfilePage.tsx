import { useQuery } from '@tanstack/react-query';
import {
  Accessibility, BookOpen, CalendarDays, ClipboardCheck, Mail, MessageSquare, NotebookPen, Pencil, Phone, Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { StudentOverview } from '../../../shared/types';
import { Donut } from '../components/charts';
import {
  Avatar, Badge, Button, ButtonLink, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, PageHeader, ProgressBar,
  Select, StatCard, Tabs,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import {
  ATTENDANCE_META, attendanceTone, daysUntil, formatDate, fullName, gradeTone, INVOICE_META, letterGrade, money, percent,
  relativeTime, type Tone,
} from '../lib/format';
import { StudentFormDrawer } from './StudentsPage';

type TabId = 'overview' | 'grades' | 'attendance' | 'fees';

export function StudentProfilePage() {
  const { id } = useParams();
  const studentId = Number(id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return <ErrorState error={new Error('That student link is not valid.')} />;
  }
  return <StudentProfile studentId={studentId} self={false} />;
}

export function MyProgressPage() {
  const user = useUser();
  return <StudentProfile studentId={user.id} self />;
}

function StudentProfile({ studentId, self }: { studentId: number; self: boolean }) {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const showFees = user.role !== 'teacher';
  const requested = params.get('tab') as TabId | null;
  const tab: TabId = requested && ['overview', 'grades', 'attendance', 'fees'].includes(requested) && (requested !== 'fees' || showFees) ? requested : 'overview';
  const setTab = (t: TabId) => {
    if (t === 'overview') params.delete('tab');
    else params.set('tab', t);
    setParams(params, { replace: true });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student-overview', studentId],
    queryFn: () => api.get<StudentOverview>(`/students/${studentId}/overview`),
  });

  if (isLoading) {
    return (
      <div className="stack">
        <CardSkeleton rows={2} />
        <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} rows={1} />)}</div>
        <CardSkeleton rows={6} />
      </div>
    );
  }
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const s = data.student;
  const name = fullName(s);
  const breadcrumb = self ? undefined : user.role === 'parent' ? (
    <><Link to="/">Dashboard</Link><span aria-hidden>/</span><span>{name}</span></>
  ) : user.role === 'student' ? undefined : (
    <><Link to="/students">Students</Link><span aria-hidden>/</span><span>{name}</span></>
  );

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'grades', label: 'Grades', count: data.grades.length },
    { id: 'attendance', label: 'Attendance' },
  ];
  if (showFees) tabs.push({ id: 'fees', label: 'Fees', count: data.invoices.length });

  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb}
        title={self ? 'My grades & attendance' : name}
        description={self ? 'Everything your teachers have recorded this term.' : undefined}
        actions={
          <>
            {user.role === 'admin' && <Button icon={<Pencil size={17} />} onClick={() => setEditOpen(true)}>Edit details</Button>}
            {(user.role === 'admin' || user.role === 'teacher') && s.classId && (
              <ButtonLink to={`/classes/${s.classId}`} icon={<BookOpen size={17} />}>View class</ButtonLink>
            )}
          </>
        }
      />

      <Card className="mb-3">
        <div className="card-body">
          <div className="row row-wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
            <Avatar name={name} size="lg" />
            <div className="grow" style={{ minWidth: 220 }}>
              <h2 style={{ fontSize: '1.3rem' }}>{name}</h2>
              <div className="row row-wrap muted small mt-1" style={{ gap: 14 }}>
                <span>{s.className ?? 'No class assigned'}</span>
                <span className="mono">{s.admissionNo}</span>
                {s.dateOfBirth && <span>Born {formatDate(s.dateOfBirth)}</span>}
                <span>Enrolled {formatDate(s.enrolledOn)}</span>
                {!s.isActive && <Badge tone="danger">Account deactivated</Badge>}
              </div>
              {s.accessibilityNeeds.length > 0 && (
                <div className="row row-wrap mt-1" style={{ gap: 6 }} aria-label="Accessibility needs">
                  <Accessibility size={16} className="subtle" aria-hidden />
                  {s.accessibilityNeeds.map((n) => <Badge key={n} tone="info">{n}</Badge>)}
                </div>
              )}
              {s.medicalNotes && (user.role === 'admin' || user.role === 'teacher') && (
                <p className="small mt-1"><span className="bold">Medical notes:</span> {s.medicalNotes}</p>
              )}
            </div>
            {s.guardians.length > 0 && user.role !== 'student' && (
              <div style={{ minWidth: 240 }}>
                <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  {s.guardians.length === 1 ? 'Parent / guardian' : 'Parents / guardians'}
                </div>
                <ul className="list stack-sm">
                  {s.guardians.map((g) => {
                    const gName = fullName(g);
                    return (
                      <li key={g.id} className="row" style={{ gap: 10 }}>
                        <Avatar name={gName} size="sm" />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="bold small">
                            {user.role === 'admin' ? <Link to={`/parents?search=${encodeURIComponent(gName)}`}>{gName}</Link> : gName}
                            <span className="muted" style={{ fontWeight: 400 }}> · {g.relationship}</span>
                          </div>
                          <div className="tiny muted row" style={{ gap: 10 }}>
                            <a href={`mailto:${g.email}`} className="row" style={{ gap: 4 }}><Mail size={12} aria-hidden />{g.email}</a>
                            {g.phone && <a href={`tel:${g.phone}`} className="row" style={{ gap: 4 }}><Phone size={12} aria-hidden />{g.phone}</a>}
                          </div>
                        </div>
                        {g.id !== user.id && (user.role === 'admin' || user.role === 'teacher') && (
                          <ButtonLink to={`/messages?compose=1&to=${g.id}`} size="sm" variant="ghost" icon={<MessageSquare size={15} />}>
                            <span className="sr-only">Message {gName}</span>
                          </ButtonLink>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Tabs label="Student record" tabs={tabs} value={tab} onChange={setTab} />

      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab data={data} showFees={showFees} goTo={setTab} />}
        {tab === 'grades' && <GradesTab data={data} />}
        {tab === 'attendance' && <AttendanceTab data={data} />}
        {tab === 'fees' && showFees && <FeesTab data={data} />}
      </div>

      {user.role === 'admin' && <StudentFormDrawer open={editOpen} onClose={() => setEditOpen(false)} student={s} onSaved={() => refetch()} />}
    </>
  );
}

// ---------------------------------------------------------------- Tabs
function OverviewTab({ data, showFees, goTo }: { data: StudentOverview; showFees: boolean; goTo: (t: TabId) => void }) {
  return (
    <>
      <div className="grid grid-4 mb-3">
        <StatCard icon={<NotebookPen size={22} />} label="Overall average" value={percent(data.overallAverage, 1)} tone={gradeTone(data.overallAverage)} hint={`Grade ${letterGrade(data.overallAverage)} · ${data.grades.length} marked`} />
        <StatCard icon={<ClipboardCheck size={22} />} label="Attendance" value={percent(data.attendance.rate, 1)} tone={attendanceTone(data.attendance.rate)} hint={`${data.attendance.absent} absent · ${data.attendance.late} late`} />
        <StatCard icon={<BookOpen size={22} />} label="Due soon" value={data.upcoming.length} tone="accent" hint="Assignments & tests" />
        {showFees
          ? <StatCard icon={<Wallet size={22} />} label="Fee balance" value={money(data.feeBalance)} tone={data.feeBalance > 0 ? 'warning' : 'success'} hint={data.feeBalance > 0 ? 'Outstanding' : 'All paid'} />
          : <StatCard icon={<CalendarDays size={22} />} label="Days recorded" value={data.attendance.total} tone="info" hint="This term" />}
      </div>
      <div className="grid grid-main">
        <Card>
          <CardHeader title="Subject averages" subtitle="Average across all marked work" action={<Button size="sm" variant="ghost" onClick={() => goTo('grades')}>All grades</Button>} />
          <div className="card-body">
            {data.subjectAverages.length === 0 ? (
              <EmptyState title="No subjects yet">Subjects appear once the student is placed in a class.</EmptyState>
            ) : data.subjectAverages.map((sub) => (
              <div key={sub.subjectName} className="hbar">
                <span className="label">
                  <span className="color-dot" style={{ background: sub.color }} aria-hidden />
                  <span>
                    {sub.subjectName}
                    {sub.teacherName && <span className="tiny muted" style={{ display: 'block' }}>{sub.teacherName}</span>}
                  </span>
                </span>
                <ProgressBar value={sub.averagePercent} tone={gradeTone(sub.averagePercent)} label={`${sub.subjectName} average`} />
                <span className="val">{percent(sub.averagePercent)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Due soon" />
          {data.upcoming.length === 0 ? (
            <EmptyState title="Nothing due">No upcoming assignments or tests.</EmptyState>
          ) : (
            <ul className="list">
              {data.upcoming.map((a) => {
                const d = a.dueDate ? daysUntil(a.dueDate) : null;
                const tone: Tone = d === null ? 'neutral' : d <= 2 ? 'warning' : 'neutral';
                return (
                  <li key={a.id} className="list-item">
                    <span className="color-dot" style={{ background: a.color }} aria-hidden />
                    <div className="grow">
                      <div className="title truncate">{a.title}</div>
                      <div className="meta">{a.subjectName} · {a.type} · out of {a.maxScore}</div>
                    </div>
                    {a.dueDate && <Badge tone={tone}>{d === 0 ? 'Today' : relativeTime(a.dueDate)}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function GradesTab({ data }: { data: StudentOverview }) {
  const [subject, setSubject] = useState('');
  const subjects = useMemo(() => [...new Set(data.grades.map((g) => g.subjectName))].sort(), [data.grades]);
  const rows = subject ? data.grades.filter((g) => g.subjectName === subject) : data.grades;
  return (
    <Card>
      <div className="toolbar">
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter grades by subject">
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <span className="small muted">{rows.length} marked {rows.length === 1 ? 'piece' : 'pieces'} of work</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<NotebookPen size={26} />} title="No grades yet">Marks appear here as soon as teachers enter them.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Assessment</th>
                <th scope="col">Subject</th>
                <th scope="col">Type</th>
                <th scope="col">Date</th>
                <th scope="col" className="num">Score</th>
                <th scope="col">Result</th>
                <th scope="col">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.assessmentId}>
                  <td className="bold">{g.title}</td>
                  <td><span className="row" style={{ gap: 8 }}><span className="color-dot" style={{ background: g.color }} aria-hidden />{g.subjectName}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{g.type}</td>
                  <td className="num">{formatDate(g.dueDate)}</td>
                  <td className="num">{g.score ?? '—'} / {g.maxScore}</td>
                  <td><Badge tone={gradeTone(g.percent)}>{percent(g.percent)} · {letterGrade(g.percent)}</Badge></td>
                  <td className="small muted" style={{ maxWidth: 320 }}>{g.feedback ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AttendanceTab({ data }: { data: StudentOverview }) {
  const a = data.attendance;
  return (
    <div className="grid grid-main">
      <Card>
        <CardHeader title="Recent days" subtitle="The last 30 recorded school days" />
        {data.recentAttendance.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={26} />} title="No attendance recorded yet" />
        ) : (
          <ul className="list">
            {data.recentAttendance.map((r) => {
              const meta = ATTENDANCE_META[r.status];
              return (
                <li key={r.date} className="list-item">
                  <div className="grow">
                    <div className="title">{formatDate(r.date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                    {r.note && <div className="meta">{r.note}</div>}
                  </div>
                  <Badge tone={meta.tone} dot>{meta.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="This term" subtitle={`${a.total} days recorded`} />
        <div className="card-body stack">
          <Donut
            label="Attendance this term"
            center={<div><div className="donut-center">{percent(a.rate)}</div><div className="tiny muted">attended</div></div>}
            segments={[
              { label: 'Present', value: a.present, color: 'var(--success)' },
              { label: 'Late', value: a.late, color: 'var(--warning)' },
              { label: 'Absent', value: a.absent, color: 'var(--danger)' },
              { label: 'Excused', value: a.excused, color: 'var(--info)' },
            ]}
          />
          <p className="small muted">Late arrivals count as attended. Excused absences are recorded with a reason by the school.</p>
        </div>
      </Card>
    </div>
  );
}

function FeesTab({ data }: { data: StudentOverview }) {
  const user = useUser();
  return (
    <Card>
      <CardHeader
        title="Invoices"
        subtitle={data.feeBalance > 0 ? `${money(data.feeBalance)} outstanding` : 'Everything is paid — thank you!'}
        action={<Link to={user.role === 'admin' ? `/fees?studentId=${data.student.id}` : '/fees'} className="small bold">{user.role === 'admin' ? 'Manage fees' : 'Fees page'}</Link>}
      />
      {data.invoices.length === 0 ? (
        <EmptyState icon={<Wallet size={26} />} title="No invoices" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Due</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col" className="num">Paid</th>
                <th scope="col" className="num">Balance</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id}>
                  <td className="bold">{i.title}</td>
                  <td className="num">{formatDate(i.dueDate)}</td>
                  <td className="num">{money(i.amount)}</td>
                  <td className="num">{money(i.amountPaid)}</td>
                  <td className="num bold">{money(i.balance)}</td>
                  <td><Badge tone={INVOICE_META[i.status].tone} dot>{INVOICE_META[i.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
