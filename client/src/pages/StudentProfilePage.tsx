import { useQuery } from '@tanstack/react-query';
import {
  Accessibility, Award, BookOpen, CalendarDays, ChevronDown, ChevronUp, ClipboardCheck, Mail, MessageSquare, NotebookPen,
  Pencil, Phone, Receipt, Wallet,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { AssessmentType, InvoiceDetail, ReportCardSummary, StudentOverview } from '../../../shared/types';
import { ChildSwitcher, useChildren } from '../components/ChildSwitcher';
import { Donut } from '../components/charts';
import {
  Avatar, Badge, Button, ButtonLink, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, PageHeader, ProgressBar,
  Select, StatCard, StatGroup, Tabs,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import {
  ATTENDANCE_META, attendanceTone, daysUntil, formatDate, fullName, gradeTone, INVOICE_META, letterGrade, money, percent,
  relativeTime, type Tone,
} from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { StudentFormDrawer } from './StudentsPage';

type TabId = 'overview' | 'grades' | 'attendance' | 'fees' | 'reports';
const TAB_IDS: TabId[] = ['overview', 'grades', 'attendance', 'fees', 'reports'];

const M = {
  en: {
    invalidLink: 'That student link is not valid.', myTitle: 'My grades & attendance', myDesc: 'Everything your teachers have recorded this term.',
    editDetails: 'Edit details', viewClass: 'View class', assignments: 'Assignments', noClass: 'No class assigned', born: 'Born {date}',
    enrolled: 'Enrolled {date}', deactivated: 'Account deactivated', needs: 'Accessibility needs', medical: 'Medical notes:',
    guardian: 'Parent / guardian', guardians: 'Parents / guardians', message: 'Message {name}', record: 'Student record',
    overview: 'Overview', reportCards: 'Report cards',
    overall: 'Overall average', gradeMarked: 'Grade {grade} · {n} marked', absentLate: '{absent} absent · {late} late', dueSoon: 'Due soon',
    assignmentsTests: 'Assignments & tests', feeBalance: 'Fee balance', outstanding: 'Outstanding', allPaid: 'All paid',
    daysRecorded: 'Days recorded', thisTerm: 'This term', subjectAverages: 'Subject averages', acrossMarked: 'Average across all marked work',
    allGrades: 'All grades', noSubjects: 'No subjects yet', noSubjectsHint: 'Subjects appear once the student is placed in a class.',
    nothingDue: 'Nothing due', nothingDueHint: 'No upcoming assignments or tests.', outOf: 'out of {n}', subjectAverage: '{subject} average',
    filterSubject: 'Filter grades by subject', allSubjects: 'All subjects', marked: '{n} marked pieces of work', noGrades: 'No grades yet',
    noGradesHint: 'Marks appear here as soon as teachers enter them.', assessment: 'Assessment', subject: 'Subject', type: 'Type',
    date: 'Date', score: 'Score', result: 'Result', feedback: 'Feedback', recentDays: 'Recent days', last30: 'The last 30 recorded school days',
    noAttendance: 'No attendance recorded yet', daysCount: '{n} days recorded', attendanceTerm: 'Attendance this term', attended: 'attended',
    attendanceNote: 'Late arrivals count as attended. Excused absences are recorded with a reason by the school.',
    invoices: 'Invoices', outstandingAmt: '{amount} outstanding', thankYou: 'Everything is paid — thank you!', manageFees: 'Manage fees',
    feesPage: 'Fees page', noInvoices: 'No invoices', invoice: 'Invoice', due: 'Due', amount: 'Amount', paid: 'Paid', balance: 'Balance',
    status: 'Status', receipts: 'Receipts', hideReceipts: 'Hide receipts', receiptsFor: 'Receipts for {title}', loadingReceipts: 'Loading receipts…',
    noPayments: 'No payments yet', receiptNo: 'Receipt {no}', paidOn: 'Paid {date}', viewReceipt: 'View receipt',
    noReportCards: 'No report cards yet', noReportCardsHint: 'Report cards appear here once the school publishes examination results.',
    position: 'Position {pos} of {size}', notPublished: 'Not published', average: 'Average', openReport: 'Open report card',
    grade: 'Grade', term: 'Term',
    assignment: 'Assignment', quiz: 'Quiz', test: 'Test', exam: 'Exam', project: 'Project',
  },
  sw: {
    invalidLink: 'Kiungo hiki cha mwanafunzi si sahihi.', myTitle: 'Alama na mahudhurio yangu', myDesc: 'Kila kitu walimu wako wamerekodi muhula huu.',
    editDetails: 'Hariri taarifa', viewClass: 'Tazama darasa', assignments: 'Kazi za nyumbani', noClass: 'Hajapangiwa darasa', born: 'Alizaliwa {date}',
    enrolled: 'Alisajiliwa {date}', deactivated: 'Akaunti imesimamishwa', needs: 'Mahitaji maalum', medical: 'Taarifa za afya:',
    guardian: 'Mzazi / mlezi', guardians: 'Wazazi / walezi', message: 'Mtumie {name} ujumbe', record: 'Kumbukumbu za mwanafunzi',
    overview: 'Muhtasari', reportCards: 'Ripoti za matokeo',
    overall: 'Wastani wa jumla', gradeMarked: 'Daraja {grade} · kazi {n} zimesahihishwa', absentLate: 'Hayupo {absent} · amechelewa {late}', dueSoon: 'Zinakaribia',
    assignmentsTests: 'Kazi na majaribio', feeBalance: 'Salio la ada', outstanding: 'Linadaiwa', allPaid: 'Imelipwa yote',
    daysRecorded: 'Siku zilizorekodiwa', thisTerm: 'Muhula huu', subjectAverages: 'Wastani kwa somo', acrossMarked: 'Wastani wa kazi zote zilizosahihishwa',
    allGrades: 'Alama zote', noSubjects: 'Bado hakuna masomo', noSubjectsHint: 'Masomo yataonekana mwanafunzi akipangiwa darasa.',
    nothingDue: 'Hakuna kazi inayodaiwa', nothingDueHint: 'Hakuna kazi au majaribio yanayokuja.', outOf: 'kati ya {n}', subjectAverage: 'Wastani wa {subject}',
    filterSubject: 'Chuja alama kwa somo', allSubjects: 'Masomo yote', marked: 'Kazi {n} zimesahihishwa', noGrades: 'Bado hakuna alama',
    noGradesHint: 'Alama zitaonekana hapa mara walimu wanapoziingiza.', assessment: 'Tathmini', subject: 'Somo', type: 'Aina',
    date: 'Tarehe', score: 'Alama', result: 'Matokeo', feedback: 'Maoni', recentDays: 'Siku za karibuni', last30: 'Siku 30 za mwisho zilizorekodiwa',
    noAttendance: 'Bado hakuna mahudhurio yaliyorekodiwa', daysCount: 'Siku {n} zimerekodiwa', attendanceTerm: 'Mahudhurio muhula huu', attended: 'alihudhuria',
    attendanceNote: 'Waliochelewa huhesabiwa kuwa wamehudhuria. Utoro wenye ruhusa hurekodiwa na shule pamoja na sababu.',
    invoices: 'Ankara', outstandingAmt: '{amount} zinadaiwa', thankYou: 'Kila kitu kimelipwa — asante!', manageFees: 'Simamia ada',
    feesPage: 'Ukurasa wa ada', noInvoices: 'Hakuna ankara', invoice: 'Ankara', due: 'Mwisho wa kulipa', amount: 'Kiasi', paid: 'Kilicholipwa', balance: 'Salio',
    status: 'Hali', receipts: 'Stakabadhi', hideReceipts: 'Ficha stakabadhi', receiptsFor: 'Stakabadhi za {title}', loadingReceipts: 'Inapakia stakabadhi…',
    noPayments: 'Bado hakuna malipo', receiptNo: 'Stakabadhi {no}', paidOn: 'Ililipwa {date}', viewReceipt: 'Tazama stakabadhi',
    noReportCards: 'Bado hakuna ripoti za matokeo', noReportCardsHint: 'Ripoti zitaonekana hapa shule ikishatoa matokeo ya mitihani.',
    position: 'Nafasi ya {pos} kati ya {size}', notPublished: 'Hayajatolewa', average: 'Wastani', openReport: 'Fungua ripoti',
    grade: 'Daraja', term: 'Muhula',
    assignment: 'Kazi', quiz: 'Jaribio fupi', test: 'Jaribio', exam: 'Mtihani', project: 'Mradi',
  },
};

export function StudentProfilePage() {
  const { id } = useParams();
  const t = useT(M);
  const studentId = Number(id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return <ErrorState error={new Error(t('invalidLink'))} />;
  }
  return <StudentProfile studentId={studentId} self={false} />;
}

export function MyProgressPage() {
  const user = useUser();
  return <StudentProfile studentId={user.id} self />;
}

function StudentProfile({ studentId, self }: { studentId: number; self: boolean }) {
  const user = useUser();
  const navigate = useNavigate();
  const { t: tc } = useI18n();
  const t = useT(M);
  const [params, setParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const showFees = user.role !== 'teacher';
  const requested = params.get('tab') as TabId | null;
  const tab: TabId = requested && TAB_IDS.includes(requested) && (requested !== 'fees' || showFees) ? requested : 'overview';
  const setTab = (next: TabId) => {
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    setParams(params, { replace: true });
  };
  const { data: children = [] } = useChildren();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student-overview', studentId],
    queryFn: () => api.get<StudentOverview>(`/students/${studentId}/overview`),
  });
  const reportCards = useQuery({
    queryKey: ['student-report-cards', studentId],
    queryFn: () => api.get<ReportCardSummary[]>(`/students/${studentId}/report-cards`),
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
  const family = user.role === 'parent' || user.role === 'student';
  const breadcrumb = self ? undefined : user.role === 'parent' ? (
    <><Link to="/">{tc('myChildren')}</Link><span aria-hidden>/</span><span>{name}</span></>
  ) : user.role === 'student' ? undefined : (
    <><Link to="/students">{tc('students')}</Link><span aria-hidden>/</span><span>{name}</span></>
  );

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('overview') },
    { id: 'grades', label: tc('grades'), count: data.grades.length },
    { id: 'attendance', label: tc('attendance') },
    { id: 'reports', label: t('reportCards'), count: reportCards.data?.length },
  ];
  if (showFees) tabs.push({ id: 'fees', label: tc('feesShort'), count: data.invoices.length });

  return (
    <>
      {user.role === 'parent' && children.length > 1 && (
        <div className="mb-2">
          <ChildSwitcher
            children={children}
            value={studentId}
            onChange={(id) => navigate(`/students/${id}${tab === 'overview' ? '' : `?tab=${tab}`}`)}
          />
        </div>
      )}
      <PageHeader
        breadcrumb={breadcrumb}
        title={self ? t('myTitle') : name}
        description={self ? t('myDesc') : undefined}
        actions={
          <>
            {user.role === 'admin' && <Button icon={<Pencil size={17} />} onClick={() => setEditOpen(true)}>{t('editDetails')}</Button>}
            {(user.role === 'admin' || user.role === 'teacher') && s.classId && (
              <ButtonLink to={`/classes/${s.classId}`} icon={<BookOpen size={17} />}>{t('viewClass')}</ButtonLink>
            )}
            {family && (
              <ButtonLink to={user.role === 'parent' ? `/assignments?child=${s.id}` : '/assignments'} icon={<BookOpen size={17} />}>
                {t('assignments')}
              </ButtonLink>
            )}
          </>
        }
      />

      <Card className="mb-3">
        <div className="card-body">
          <div className="row row-wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
            <Avatar name={name} size="xl" photoUrl={s.photoUrl} />
            <div className="grow" style={{ minWidth: 220 }}>
              <h2 style={{ fontSize: '1.3rem' }}>{name}</h2>
              <div className="row row-wrap muted small mt-1" style={{ gap: 14 }}>
                <span>{s.className ?? t('noClass')}</span>
                <span className="mono">{s.admissionNo}</span>
                {s.dateOfBirth && <span>{t('born', { date: formatDate(s.dateOfBirth) })}</span>}
                <span>{t('enrolled', { date: formatDate(s.enrolledOn) })}</span>
                {!s.isActive && <Badge tone="danger">{t('deactivated')}</Badge>}
              </div>
              {s.accessibilityNeeds.length > 0 && (
                <div className="row row-wrap mt-1" style={{ gap: 6 }} aria-label={t('needs')}>
                  <Accessibility size={16} className="subtle" aria-hidden />
                  {s.accessibilityNeeds.map((n) => <Badge key={n} tone="info">{n}</Badge>)}
                </div>
              )}
              {s.medicalNotes && (user.role === 'admin' || user.role === 'teacher') && (
                <p className="small mt-1"><span className="bold">{t('medical')}</span> {s.medicalNotes}</p>
              )}
            </div>
            {s.guardians.length > 0 && user.role !== 'student' && (
              <div style={{ minWidth: 240 }}>
                <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  {s.guardians.length === 1 ? t('guardian') : t('guardians')}
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
                          <div className="tiny muted row row-wrap" style={{ gap: 10 }}>
                            <a href={`mailto:${g.email}`} className="row" style={{ gap: 4 }}><Mail size={12} aria-hidden />{g.email}</a>
                            {g.phone && <a href={`tel:${g.phone.replace(/\s/g, '')}`} className="row" style={{ gap: 4 }}><Phone size={12} aria-hidden />{g.phone}</a>}
                          </div>
                        </div>
                        {g.id !== user.id && (user.role === 'admin' || user.role === 'teacher') && (
                          <ButtonLink to={`/messages?compose=1&to=${g.id}`} size="sm" variant="ghost" icon={<MessageSquare size={15} />}>
                            <span className="sr-only">{t('message', { name: gName })}</span>
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

      <Tabs label={t('record')} tabs={tabs} value={tab} onChange={setTab} />

      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab data={data} showFees={showFees} goTo={setTab} />}
        {tab === 'grades' && <GradesTab data={data} />}
        {tab === 'attendance' && <AttendanceTab data={data} />}
        {tab === 'reports' && <ReportCardsTab studentId={studentId} query={reportCards} />}
        {tab === 'fees' && showFees && <FeesTab data={data} />}
      </div>

      {user.role === 'admin' && <StudentFormDrawer open={editOpen} onClose={() => setEditOpen(false)} student={s} onSaved={() => refetch()} />}
    </>
  );
}

const typeLabel = (type: AssessmentType, t: (k: AssessmentType) => string) => t(type);

// ---------------------------------------------------------------- Tabs
function OverviewTab({ data, showFees, goTo }: { data: StudentOverview; showFees: boolean; goTo: (t: TabId) => void }) {
  const { t: tc } = useI18n();
  const t = useT(M);
  return (
    <>
      <StatGroup className="mb-3">
        <StatCard icon={<NotebookPen size={16} />} label={t('overall')} value={percent(data.overallAverage, 1)} tone={gradeTone(data.overallAverage)} hint={t('gradeMarked', { grade: letterGrade(data.overallAverage), n: data.grades.length })} />
        <StatCard icon={<ClipboardCheck size={16} />} label={tc('attendance')} value={percent(data.attendance.rate, 1)} tone={attendanceTone(data.attendance.rate)} hint={t('absentLate', { absent: data.attendance.absent, late: data.attendance.late })} />
        <StatCard icon={<BookOpen size={16} />} label={t('dueSoon')} value={data.upcoming.length} tone="accent" hint={t('assignmentsTests')} />
        {showFees
          ? <StatCard icon={<Wallet size={16} />} label={t('feeBalance')} value={money(data.feeBalance)} tone={data.feeBalance > 0 ? 'warning' : 'success'} hint={data.feeBalance > 0 ? t('outstanding') : t('allPaid')} />
          : <StatCard icon={<CalendarDays size={16} />} label={t('daysRecorded')} value={data.attendance.total} tone="info" hint={t('thisTerm')} />}
      </StatGroup>
      <div className="grid grid-main">
        <Card>
          <CardHeader title={t('subjectAverages')} subtitle={t('acrossMarked')} action={<Button size="sm" variant="ghost" onClick={() => goTo('grades')}>{t('allGrades')}</Button>} />
          <div className="card-body">
            {data.subjectAverages.length === 0 ? (
              <EmptyState title={t('noSubjects')}>{t('noSubjectsHint')}</EmptyState>
            ) : data.subjectAverages.map((sub) => (
              <div key={sub.subjectName} className="hbar">
                <span className="label">
                  <span className="color-dot" style={{ background: sub.color }} aria-hidden />
                  <span>
                    {sub.subjectName}
                    {sub.teacherName && <span className="tiny muted" style={{ display: 'block' }}>{sub.teacherName}</span>}
                  </span>
                </span>
                <ProgressBar value={sub.averagePercent} tone={gradeTone(sub.averagePercent)} label={t('subjectAverage', { subject: sub.subjectName })} />
                <span className="val">{percent(sub.averagePercent)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dueSoon')} />
          {data.upcoming.length === 0 ? (
            <EmptyState title={t('nothingDue')}>{t('nothingDueHint')}</EmptyState>
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
                      <div className="meta">{a.subjectName} · {typeLabel(a.type, t)} · {t('outOf', { n: a.maxScore })}</div>
                    </div>
                    {a.dueDate && <Badge tone={tone}>{d === 0 ? tc('today') : relativeTime(a.dueDate)}</Badge>}
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
  const t = useT(M);
  const [subject, setSubject] = useState('');
  const subjects = useMemo(() => [...new Set(data.grades.map((g) => g.subjectName))].sort(), [data.grades]);
  const rows = subject ? data.grades.filter((g) => g.subjectName === subject) : data.grades;
  return (
    <Card>
      <div className="toolbar">
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t('filterSubject')}>
          <option value="">{t('allSubjects')}</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <span className="small muted">{t('marked', { n: rows.length })}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<NotebookPen size={26} />} title={t('noGrades')}>{t('noGradesHint')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('assessment')}</th>
                <th scope="col">{t('subject')}</th>
                <th scope="col">{t('type')}</th>
                <th scope="col">{t('date')}</th>
                <th scope="col" className="num">{t('score')}</th>
                <th scope="col">{t('result')}</th>
                <th scope="col">{t('feedback')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.assessmentId}>
                  <td className="bold">{g.title}</td>
                  <td><span className="row" style={{ gap: 8 }}><span className="color-dot" style={{ background: g.color }} aria-hidden />{g.subjectName}</span></td>
                  <td>{typeLabel(g.type, t)}</td>
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
  const { t: tc } = useI18n();
  const t = useT(M);
  const a = data.attendance;
  return (
    <div className="grid grid-main">
      <Card>
        <CardHeader title={t('recentDays')} subtitle={t('last30')} />
        {data.recentAttendance.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={26} />} title={t('noAttendance')} />
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
                  <Badge tone={meta.tone} dot>{tc(r.status)}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title={t('thisTerm')} subtitle={t('daysCount', { n: a.total })} />
        <div className="card-body stack">
          <Donut
            label={t('attendanceTerm')}
            center={<div><div className="donut-center">{percent(a.rate)}</div><div className="tiny muted">{t('attended')}</div></div>}
            segments={[
              { label: tc('present'), value: a.present, color: 'var(--success)' },
              { label: tc('late'), value: a.late, color: 'var(--warning)' },
              { label: tc('absent'), value: a.absent, color: 'var(--danger)' },
              { label: tc('excused'), value: a.excused, color: 'var(--info)' },
            ]}
          />
          <p className="small muted">{t('attendanceNote')}</p>
        </div>
      </Card>
    </div>
  );
}

function ReportCardsTab({ studentId, query }: { studentId: number; query: ReturnType<typeof useQuery<ReportCardSummary[]>> }) {
  const t = useT(M);
  if (query.isLoading) return <CardSkeleton rows={3} />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const cards = query.data ?? [];
  if (cards.length === 0) {
    return <Card><EmptyState icon={<Award size={26} />} title={t('noReportCards')}>{t('noReportCardsHint')}</EmptyState></Card>;
  }
  return (
    <div className="grid grid-3">
      {cards.map((c) => (
        <Link key={c.examId} to={`/report-cards/${c.examId}/${studentId}`} className="card card-hover" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="card-body stack-sm">
            <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
              <div>
                <h3>{c.examName}</h3>
                {c.termName && <div className="small muted">{c.termName}</div>}
              </div>
              {c.publishedAt ? <Badge tone="success" dot>{formatDate(c.publishedAt.slice(0, 10))}</Badge> : <Badge tone="warning">{t('notPublished')}</Badge>}
            </div>
            <div className="row" style={{ gap: 18 }}>
              <div>
                <div className="tiny muted">{t('average')}</div>
                <div className="bold num" style={{ fontSize: '1.4rem' }}>{percent(c.averagePercent, 1)}</div>
              </div>
              <div>
                <div className="tiny muted">{t('grade')}</div>
                <div className="bold" style={{ fontSize: '1.4rem' }}>{c.grade ?? '—'}</div>
              </div>
            </div>
            {c.position && <div className="small">{t('position', { pos: c.position, size: c.classSize })}</div>}
            <span className="small bold" style={{ color: 'var(--primary)' }}>{t('openReport')} →</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function FeesTab({ data }: { data: StudentOverview }) {
  const user = useUser();
  const { t: tc } = useI18n();
  const t = useT(M);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader
        title={t('invoices')}
        subtitle={data.feeBalance > 0 ? t('outstandingAmt', { amount: money(data.feeBalance) }) : t('thankYou')}
        action={<Link to={user.role === 'admin' ? `/fees?studentId=${data.student.id}` : user.role === 'parent' ? `/fees?child=${data.student.id}` : '/fees'} className="small bold">{user.role === 'admin' ? t('manageFees') : t('feesPage')}</Link>}
      />
      {data.invoices.length === 0 ? (
        <EmptyState icon={<Wallet size={26} />} title={t('noInvoices')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('invoice')}</th>
                <th scope="col">{t('due')}</th>
                <th scope="col" className="num">{t('amount')}</th>
                <th scope="col" className="num">{t('paid')}</th>
                <th scope="col" className="num">{t('balance')}</th>
                <th scope="col">{t('status')}</th>
                <th scope="col"><span className="sr-only">{t('receipts')}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => (
                <Fragment key={i.id}>
                  <tr>
                    <td className="bold">{i.title}</td>
                    <td className="num">{formatDate(i.dueDate)}</td>
                    <td className="num">{money(i.amount)}</td>
                    <td className="num">{money(i.amountPaid)}</td>
                    <td className="num bold">{money(i.balance)}</td>
                    <td><Badge tone={INVOICE_META[i.status].tone} dot>{tc(i.status)}</Badge></td>
                    <td className="actions">
                      {i.amountPaid > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={open === i.id}
                          icon={open === i.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          onClick={() => setOpen(open === i.id ? null : i.id)}
                        >
                          {open === i.id ? t('hideReceipts') : t('receipts')}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {open === i.id && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
                        <InvoiceReceipts invoiceId={i.id} title={i.title} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function InvoiceReceipts({ invoiceId, title }: { invoiceId: number; title: string }) {
  const t = useT(M);
  const q = useQuery({ queryKey: ['invoice', invoiceId], queryFn: () => api.get<InvoiceDetail>(`/fees/invoices/${invoiceId}`) });
  if (q.isLoading) return <span className="small muted">{t('loadingReceipts')}</span>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const payments = q.data?.payments ?? [];
  if (!payments.length) return <span className="small muted">{t('noPayments')}</span>;
  return (
    <ul className="list stack-sm" aria-label={t('receiptsFor', { title })}>
      {payments.map((p) => (
        <li key={p.id} className="row row-wrap" style={{ gap: 12 }}>
          <Receipt size={16} className="subtle" aria-hidden />
          <span className="mono small">{t('receiptNo', { no: p.receiptNo })}</span>
          <span className="small muted">{t('paidOn', { date: formatDate(p.paidOn) })}</span>
          <span className="small bold num">{money(p.amount)}</span>
          <Link to={`/receipts/${p.id}`} className="small bold" style={{ marginLeft: 'auto' }}>{t('viewReceipt')}</Link>
        </li>
      ))}
    </ul>
  );
}
