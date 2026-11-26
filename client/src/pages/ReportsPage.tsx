import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Download, Printer, Receipt, Users, Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AttendanceReport, ClassListItem, ClassPerformance, Exam, FinancialReport, PaymentMethod, StudentReportRow, TeacherReportRow,
} from '../../../shared/types';
import { ColumnChart, TrendChart } from '../components/charts';
import {
  Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Select, StatCard, StatGroup, Tabs,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { downloadCsv, printPage, slug } from '../lib/export';
import { attendanceTone, formatDate, gradeTone, money, percent, toIso } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    title: 'Reports', subtitle: 'Attendance, results, finance and staff reports. Download them for Excel or print them as PDF.',
    attendance: 'Attendance', academic: 'Academic', financial: 'Financial', teachers: 'Teachers', students: 'Student register',
    class: 'Class', allClasses: 'All classes', allMyClasses: 'All my classes', from: 'From', to: 'To', status: 'Status',
    active: 'Active', inactive: 'Inactive', all: 'All', exam: 'Exam', chooseExam: 'Choose an exam',
    exportCsv: 'Export to Excel (CSV)', print: 'Print / save as PDF', generated: 'Generated {date}',
    // Attendance
    avgRate: 'Average attendance', present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', rate: 'Rate', days: 'Days recorded',
    daily: 'Daily attendance', perStudent: 'By student', student: 'Student', admission: 'Adm. no.', noAttendance: 'No attendance recorded for this period',
    lowAttendance: 'Below 80%', studentsBelow: '{n} students below 80%',
    // Academic
    subjectAverages: 'Subject averages', ranking: 'Class ranking', position: 'Pos.', total: 'Total', average: 'Average', grade: 'Grade',
    noExams: 'No exams yet', pickClass: 'Choose a class', noMarks: 'No marks have been entered for this class yet', subject: 'Subject', marked: 'Marked',
    // Financial
    billed: 'Billed', collected: 'Collected', outstanding: 'Outstanding', overdue: 'Overdue', inPeriod: 'Collected in period',
    byMonth: 'Collections by month', byMethod: 'By payment method', byClass: 'By class', payments: 'Payments', method: 'Method', count: 'Payments',
    receipt: 'Receipt', date: 'Date', invoice: 'Invoice', amount: 'Amount', reference: 'Reference', noPayments: 'No payments in this period',
    cash: 'Cash', card: 'Card', bank_transfer: 'Bank transfer', mobile_money: 'Mobile money', other: 'Other',
    // Teachers
    teacher: 'Teacher', employeeNo: 'Staff no.', specialization: 'Subject area', homeroom: 'Class teacher of', courses: 'Courses', classes: 'Classes',
    lessons: 'Lessons / week', studentsCol: 'Students', ungraded: 'Ungraded work', noTeachers: 'No teachers yet',
    // Students
    gender: 'Gender', guardians: 'Parents / guardians', phones: 'Phone numbers', attendanceRate: 'Attendance', feeBalance: 'Fee balance',
    noStudents: 'No students match these filters', male: 'Male', female: 'Female', unspecified: '—', count2: '{n} students',
  },
  sw: {
    title: 'Ripoti', subtitle: 'Ripoti za mahudhurio, matokeo, fedha na watumishi. Zipakue kwa Excel au zichapishe kama PDF.',
    attendance: 'Mahudhurio', academic: 'Taaluma', financial: 'Fedha', teachers: 'Walimu', students: 'Rejista ya wanafunzi',
    class: 'Darasa', allClasses: 'Madarasa yote', allMyClasses: 'Madarasa yangu yote', from: 'Kuanzia', to: 'Hadi', status: 'Hali',
    active: 'Hai', inactive: 'Wamesitishwa', all: 'Wote', exam: 'Mtihani', chooseExam: 'Chagua mtihani',
    exportCsv: 'Hamisha kwa Excel (CSV)', print: 'Chapisha / hifadhi PDF', generated: 'Imetolewa {date}',
    avgRate: 'Wastani wa mahudhurio', present: 'Wapo', late: 'Wamechelewa', absent: 'Hawapo', excused: 'Wana ruhusa', rate: 'Kiwango', days: 'Siku zilizorekodiwa',
    daily: 'Mahudhurio ya kila siku', perStudent: 'Kwa mwanafunzi', student: 'Mwanafunzi', admission: 'Na. usajili', noAttendance: 'Hakuna mahudhurio yaliyorekodiwa kipindi hiki',
    lowAttendance: 'Chini ya 80%', studentsBelow: 'Wanafunzi {n} wako chini ya 80%',
    subjectAverages: 'Wastani kwa somo', ranking: 'Nafasi darasani', position: 'Nafasi', total: 'Jumla', average: 'Wastani', grade: 'Daraja',
    noExams: 'Bado hakuna mitihani', pickClass: 'Chagua darasa', noMarks: 'Bado hakuna alama zilizoingizwa kwa darasa hili', subject: 'Somo', marked: 'Wamesahihishwa',
    billed: 'Kilichotozwa', collected: 'Kilichokusanywa', outstanding: 'Kinachodaiwa', overdue: 'Kilichopitwa na muda', inPeriod: 'Kilichokusanywa kipindi hiki',
    byMonth: 'Makusanyo kwa mwezi', byMethod: 'Kwa njia ya malipo', byClass: 'Kwa darasa', payments: 'Malipo', method: 'Njia', count: 'Malipo',
    receipt: 'Stakabadhi', date: 'Tarehe', invoice: 'Ankara', amount: 'Kiasi', reference: 'Kumbukumbu', noPayments: 'Hakuna malipo kipindi hiki',
    cash: 'Taslimu', card: 'Kadi', bank_transfer: 'Benki', mobile_money: 'Pesa kwa simu', other: 'Nyingine',
    teacher: 'Mwalimu', employeeNo: 'Na. ya mtumishi', specialization: 'Eneo la somo', homeroom: 'Mwalimu wa darasa', courses: 'Masomo', classes: 'Madarasa',
    lessons: 'Vipindi / wiki', studentsCol: 'Wanafunzi', ungraded: 'Kazi zisizosahihishwa', noTeachers: 'Bado hakuna walimu',
    gender: 'Jinsia', guardians: 'Wazazi / walezi', phones: 'Namba za simu', attendanceRate: 'Mahudhurio', feeBalance: 'Deni la ada',
    noStudents: 'Hakuna wanafunzi wanaolingana na vichujio hivi', male: 'Mvulana', female: 'Msichana', unspecified: '—', count2: 'Wanafunzi {n}',
  },
};

type TabId = 'attendance' | 'academic' | 'financial' | 'teachers' | 'students';
const daysAgo = (n: number) => toIso(new Date(Date.now() - n * 864e5));

export function ReportsPage() {
  const t = useT(M);
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const tabs: TabId[] = isAdmin ? ['attendance', 'academic', 'financial', 'teachers', 'students'] : ['attendance', 'academic', 'students'];
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabId | null;
  const tab: TabId = raw && tabs.includes(raw) ? raw : 'attendance';
  const setTab = (next: TabId) => setParams(next === 'attendance' ? {} : { tab: next }, { replace: true });

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="no-print">
        <Tabs label={t('title')} value={tab} onChange={setTab} tabs={tabs.map((id) => ({ id, label: t(id) }))} />
      </div>
      <h1 className="print-only" style={{ marginBottom: 12 }}>{t(tab)}</h1>
      <div role="tabpanel">
        {tab === 'attendance' && <AttendanceReportPanel />}
        {tab === 'academic' && <AcademicReportPanel />}
        {tab === 'financial' && isAdmin && <FinancialReportPanel />}
        {tab === 'teachers' && isAdmin && <TeachersReportPanel />}
        {tab === 'students' && <StudentsReportPanel />}
      </div>
    </>
  );
}

/** Classes the user can report on: all for admins, their own for teachers. */
function useReportClasses() {
  const user = useUser();
  return useQuery({
    queryKey: ['classes', user.role === 'teacher' ? 'mine' : 'all'],
    queryFn: () => api.get<ClassListItem[]>('/classes', user.role === 'teacher' ? { mine: true } : undefined),
  });
}

function Toolbar({ children, onExport, canExport }: { children: React.ReactNode; onExport: () => void; canExport: boolean }) {
  const t = useT(M);
  return (
    <div className="row row-wrap between mb-3 no-print" style={{ alignItems: 'flex-end' }}>
      <div className="row row-wrap" style={{ gap: 12, alignItems: 'flex-end' }}>{children}</div>
      <div className="row" style={{ gap: 8 }}>
        <Button icon={<Download size={16} />} onClick={onExport} disabled={!canExport}>{t('exportCsv')}</Button>
        <Button icon={<Printer size={16} />} onClick={printPage} disabled={!canExport}>{t('print')}</Button>
      </div>
    </div>
  );
}

function ClassFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT(M);
  const user = useUser();
  const classes = useReportClasses();
  return (
    <Field label={t('class')}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 180 }}>
        <option value="">{user.role === 'teacher' ? t('allMyClasses') : t('allClasses')}</option>
        {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
    </Field>
  );
}

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const t = useT(M);
  return (
    <>
      <Field label={t('from')}><Input type="date" value={from} max={to} onChange={(e) => onFrom(e.target.value)} /></Field>
      <Field label={t('to')}><Input type="date" value={to} min={from} onChange={(e) => onTo(e.target.value)} /></Field>
    </>
  );
}

function Loading() {
  return <div className="stack"><div className="grid grid-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} rows={1} />)}</div><CardSkeleton rows={8} /></div>;
}

// ---------------------------------------------------------------- Attendance
function AttendanceReportPanel() {
  const t = useT(M);
  const [classId, setClassId] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(toIso(new Date()));
  const q = useQuery({
    queryKey: ['reports', 'attendance', classId, from, to],
    queryFn: () => api.get<AttendanceReport>('/reports/attendance', { classId: classId || undefined, from, to }),
    enabled: !!from && !!to && from <= to,
  });
  const d = q.data;
  const totals = useMemo(() => {
    const rows = d?.rows ?? [];
    const sum = (k: 'present' | 'late' | 'absent' | 'excused' | 'total') => rows.reduce((s, r) => s + r[k], 0);
    const total = sum('total');
    return {
      present: sum('present'), late: sum('late'), absent: sum('absent'), excused: sum('excused'), total,
      rate: total ? Math.round(((sum('present') + sum('late')) / total) * 1000) / 10 : null,
      below: rows.filter((r) => r.rate !== null && r.rate < 80).length,
    };
  }, [d]);

  const exportCsv = () => d && downloadCsv(
    slug(`attendance ${from} ${to}`),
    [t('student'), t('admission'), t('class'), t('present'), t('late'), t('absent'), t('excused'), t('days'), `${t('rate')} %`],
    d.rows.map((r) => [r.name, r.admissionNo, r.className, r.present, r.late, r.absent, r.excused, r.total, r.rate]),
  );

  return (
    <>
      <Toolbar onExport={exportCsv} canExport={!!d?.rows.length}>
        <ClassFilter value={classId} onChange={setClassId} />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </Toolbar>
      <p className="print-only small">{formatDate(from)} – {formatDate(to)}</p>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : !d ? null : (
        <div className="stack" style={{ gap: 20 }}>
          <StatGroup>
            <StatCard icon={<ClipboardCheck size={16} />} label={t('avgRate')} value={percent(totals.rate, 1)} tone={attendanceTone(totals.rate)} hint={`${formatDate(from)} – ${formatDate(to)}`} />
            <StatCard icon={<CheckCircle2 size={16} />} label={t('present')} value={totals.present} tone="success" hint={`${t('late')}: ${totals.late}`} />
            <StatCard icon={<AlertTriangle size={16} />} label={t('absent')} value={totals.absent} tone="danger" hint={`${t('excused')}: ${totals.excused}`} />
            <StatCard icon={<Users size={16} />} label={t('lowAttendance')} value={totals.below} tone={totals.below ? 'warning' : 'success'} hint={t('studentsBelow', { n: totals.below })} />
          </StatGroup>
          {d.daily.length > 0 && (
            <Card>
              <CardHeader title={t('daily')} />
              <div className="card-body"><TrendChart data={d.daily.slice(-30)} /></div>
            </Card>
          )}
          <Card>
            <CardHeader title={t('perStudent')} subtitle={t('count2', { n: d.rows.length })} />
            {!d.rows.length || totals.total === 0 ? <EmptyState icon={<ClipboardCheck size={26} />} title={t('noAttendance')} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('student')}</th>
                      <th scope="col">{t('class')}</th>
                      <th scope="col" className="num">{t('present')}</th>
                      <th scope="col" className="num">{t('late')}</th>
                      <th scope="col" className="num">{t('absent')}</th>
                      <th scope="col" className="num">{t('excused')}</th>
                      <th scope="col" className="num">{t('rate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.studentId}>
                        <td><Link to={`/students/${r.studentId}`} className="bold" style={{ color: 'inherit' }}>{r.name}</Link><div className="tiny muted mono">{r.admissionNo}</div></td>
                        <td>{r.className ?? '—'}</td>
                        <td className="num">{r.present}</td>
                        <td className="num">{r.late}</td>
                        <td className="num">{r.absent}</td>
                        <td className="num">{r.excused}</td>
                        <td className="num"><Badge tone={attendanceTone(r.rate)}>{percent(r.rate, 1)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Academic
function AcademicReportPanel() {
  const t = useT(M);
  const exams = useQuery({ queryKey: ['exams'], queryFn: () => api.get<Exam[]>('/exams') });
  const classes = useReportClasses();
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');

  const exam = exams.data?.find((e) => String(e.id) === examId) ?? exams.data?.[0];
  const myClassIds = new Set(classes.data?.map((c) => c.id));
  const classOptions = (exam?.classes ?? []).filter((c) => myClassIds.has(c.id));
  const cls = classOptions.find((c) => String(c.id) === classId) ?? classOptions[0];

  const perf = useQuery({
    queryKey: ['exam', exam?.id, 'performance', cls?.id],
    queryFn: () => api.get<ClassPerformance>(`/exams/${exam!.id}/performance`, { classId: cls!.id }),
    enabled: !!exam && !!cls,
  });
  const p = perf.data;

  const exportCsv = () => {
    if (!p) return;
    downloadCsv(
      slug(`${p.exam.name} ${p.className}`),
      [t('position'), t('student'), t('admission'), t('total'), `${t('average')} %`, t('grade')],
      [
        ...p.ranking.map((r) => [r.position, r.name, r.admissionNo, r.total, r.averagePercent, r.grade]),
        [],
        [t('subject'), `${t('average')} %`, t('marked'), ...p.bands.map((b) => b.grade)],
        ...p.subjects.map((s) => [s.subjectName, s.averagePercent, s.graded, ...p.bands.map((b) => s.distribution[b.grade] ?? 0)]),
      ].map((r) => r as (string | number | null)[]),
    );
  };

  if (exams.isLoading || classes.isLoading) return <Loading />;
  if (exams.error) return <ErrorState error={exams.error} onRetry={exams.refetch} />;
  if (!exams.data?.length) return <Card><EmptyState icon={<BarChart3 size={26} />} title={t('noExams')} /></Card>;

  return (
    <>
      <Toolbar onExport={exportCsv} canExport={!!p?.ranking.length}>
        <Field label={t('exam')}>
          <Select value={exam ? String(exam.id) : ''} onChange={(e) => { setExamId(e.target.value); setClassId(''); }} style={{ minWidth: 220 }}>
            {exams.data.map((e) => <option key={e.id} value={e.id}>{e.name}{e.termName ? ` · ${e.termName}` : ''}</option>)}
          </Select>
        </Field>
        <Field label={t('class')}>
          <Select value={cls ? String(cls.id) : ''} onChange={(e) => setClassId(e.target.value)} style={{ minWidth: 160 }}>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </Toolbar>
      <p className="print-only small">{exam?.name} · {cls?.name}</p>
      {!cls ? <Card><EmptyState icon={<BarChart3 size={26} />} title={t('pickClass')} /></Card>
        : perf.isLoading ? <Loading /> : perf.error ? <ErrorState error={perf.error} onRetry={perf.refetch} /> : !p ? null : !p.ranking.length ? (
          <Card><EmptyState icon={<BarChart3 size={26} />} title={t('noMarks')} /></Card>
        ) : (
          <div className="stack" style={{ gap: 20 }}>
            <Card>
              <CardHeader title={t('subjectAverages')} subtitle={`${p.exam.name} · ${p.className}`} />
              <div className="card-body">
                <ColumnChart label={t('subjectAverages')} color="var(--accent)" data={p.subjects.map((s) => ({ label: s.subjectName.slice(0, 4), title: s.subjectName, value: s.averagePercent }))} />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('ranking')} />
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col" className="num">{t('position')}</th>
                      <th scope="col">{t('student')}</th>
                      <th scope="col" className="num">{t('total')}</th>
                      <th scope="col" className="num">{t('average')}</th>
                      <th scope="col">{t('grade')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.ranking.map((r) => (
                      <tr key={r.studentId}>
                        <td className="num bold">{r.position}</td>
                        <td><Link to={`/report-cards/${p.exam.id}/${r.studentId}`} className="bold" style={{ color: 'inherit' }}>{r.name}</Link><div className="tiny muted mono">{r.admissionNo}</div></td>
                        <td className="num">{r.total}</td>
                        <td className="num">{percent(r.averagePercent, 1)}</td>
                        <td><Badge tone={gradeTone(r.averagePercent)}>{r.grade ?? '—'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
    </>
  );
}

// ---------------------------------------------------------------- Financial (admin)
function FinancialReportPanel() {
  const t = useT(M);
  const [classId, setClassId] = useState('');
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(toIso(new Date()));
  const q = useQuery({
    queryKey: ['reports', 'financial', classId, from, to],
    queryFn: () => api.get<FinancialReport>('/reports/financial', { classId: classId || undefined, from, to }),
    enabled: !!from && !!to && from <= to,
  });
  const d = q.data;
  const methodLabel = (m: PaymentMethod) => t(m);
  const monthLabel = (m: string) => formatDate(`${m}-01`, { month: 'short', year: '2-digit' });

  const exportCsv = () => d && downloadCsv(
    slug(`payments ${from} ${to}`),
    [t('date'), t('receipt'), t('student'), t('admission'), t('class'), t('invoice'), t('method'), t('reference'), t('amount')],
    d.payments.map((p) => [p.paidOn, p.receiptNo, p.studentName, p.admissionNo, p.className, p.invoiceTitle, methodLabel(p.method), p.reference, p.amount]),
  );

  return (
    <>
      <Toolbar onExport={exportCsv} canExport={!!d}>
        <ClassFilter value={classId} onChange={setClassId} />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </Toolbar>
      <p className="print-only small">{formatDate(from)} – {formatDate(to)}</p>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : !d ? null : (
        <div className="stack" style={{ gap: 20 }}>
          <StatGroup>
            <StatCard icon={<Receipt size={16} />} label={t('billed')} value={money(d.summary.billed)} />
            <StatCard icon={<CheckCircle2 size={16} />} label={t('collected')} value={money(d.summary.collected)} tone="success" hint={`${t('inPeriod')}: ${money(d.collectedInPeriod)}`} />
            <StatCard icon={<Wallet size={16} />} label={t('outstanding')} value={money(d.summary.outstanding)} tone="warning" />
            <StatCard icon={<AlertTriangle size={16} />} label={t('overdue')} value={money(d.summary.overdueAmount)} tone="danger" hint={`${d.summary.overdueCount}`} />
          </StatGroup>
          <div className="grid grid-2">
            <Card>
              <CardHeader title={t('byMonth')} />
              <div className="card-body">
                {d.byMonth.length ? (
                  <ColumnChart
                    label={t('byMonth')}
                    max={Math.max(1, ...d.byMonth.map((m) => m.collected))}
                    format={(v) => money(v)}
                    color="var(--accent)"
                    data={d.byMonth.map((m) => ({ label: monthLabel(m.month), value: m.collected }))}
                  />
                ) : <EmptyState title={t('noPayments')} />}
              </div>
            </Card>
            <Card>
              <CardHeader title={t('byMethod')} />
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th scope="col">{t('method')}</th><th scope="col" className="num">{t('count')}</th><th scope="col" className="num">{t('collected')}</th></tr></thead>
                  <tbody>
                    {d.byMethod.map((m) => (
                      <tr key={m.method}><td>{methodLabel(m.method)}</td><td className="num">{m.count}</td><td className="num bold">{money(m.collected)}</td></tr>
                    ))}
                    {!d.byMethod.length && <tr><td colSpan={3} className="muted">{t('noPayments')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title={t('byClass')} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">{t('class')}</th><th scope="col" className="num">{t('billed')}</th><th scope="col" className="num">{t('collected')}</th><th scope="col" className="num">{t('outstanding')}</th></tr></thead>
                <tbody>
                  {d.byClass.map((c) => (
                    <tr key={c.className}>
                      <td className="bold">{c.className}</td>
                      <td className="num">{money(c.billed)}</td>
                      <td className="num text-success">{money(c.collected)}</td>
                      <td className="num text-danger">{money(c.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title={t('payments')} subtitle={`${d.payments.length}`} />
            {!d.payments.length ? <EmptyState icon={<Receipt size={26} />} title={t('noPayments')} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('date')}</th>
                      <th scope="col">{t('receipt')}</th>
                      <th scope="col">{t('student')}</th>
                      <th scope="col">{t('invoice')}</th>
                      <th scope="col">{t('method')}</th>
                      <th scope="col" className="num">{t('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.payments.slice(0, 500).map((p) => (
                      <tr key={p.id}>
                        <td className="small">{formatDate(p.paidOn)}</td>
                        <td><Link to={`/receipts/${p.id}`} className="mono small bold">{p.receiptNo}</Link></td>
                        <td>{p.studentName}<div className="tiny muted">{p.className ?? ''}</div></td>
                        <td className="small">{p.invoiceTitle}</td>
                        <td className="small">{methodLabel(p.method)}{p.reference ? <div className="tiny muted mono">{p.reference}</div> : null}</td>
                        <td className="num bold">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Teachers (admin)
function TeachersReportPanel() {
  const t = useT(M);
  const q = useQuery({ queryKey: ['reports', 'teachers'], queryFn: () => api.get<TeacherReportRow[]>('/reports/teachers') });
  const rows = q.data ?? [];
  const exportCsv = () => downloadCsv(
    'teachers',
    [t('teacher'), t('employeeNo'), t('specialization'), t('homeroom'), t('courses'), t('classes'), t('lessons'), t('studentsCol'), `${t('average')} %`, t('ungraded')],
    rows.map((r) => [r.name, r.employeeNo, r.specialization, r.homeroomClass, r.courses, r.classes, r.lessonsPerWeek, r.students, r.averagePercent, r.ungradedAssessments]),
  );
  return (
    <>
      <Toolbar onExport={exportCsv} canExport={rows.length > 0}><span /></Toolbar>
      {q.isLoading ? <CardSkeleton rows={8} /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : !rows.length ? (
        <Card><EmptyState icon={<Users size={26} />} title={t('noTeachers')} /></Card>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('teacher')}</th>
                  <th scope="col">{t('homeroom')}</th>
                  <th scope="col" className="num">{t('courses')}</th>
                  <th scope="col" className="num">{t('classes')}</th>
                  <th scope="col" className="num">{t('lessons')}</th>
                  <th scope="col" className="num">{t('studentsCol')}</th>
                  <th scope="col" className="num">{t('average')}</th>
                  <th scope="col" className="num">{t('ungraded')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><span className="bold">{r.name}</span><div className="tiny muted">{r.specialization ?? ''} · <span className="mono">{r.employeeNo}</span></div></td>
                    <td>{r.homeroomClass ?? '—'}</td>
                    <td className="num">{r.courses}</td>
                    <td className="num">{r.classes}</td>
                    <td className="num">{r.lessonsPerWeek}</td>
                    <td className="num">{r.students}</td>
                    <td className="num"><Badge tone={gradeTone(r.averagePercent)}>{percent(r.averagePercent, 1)}</Badge></td>
                    <td className="num">{r.ungradedAssessments ? <Badge tone="warning">{r.ungradedAssessments}</Badge> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Student register
function StudentsReportPanel() {
  const t = useT(M);
  const { t: c } = useI18n();
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('active');
  const q = useQuery({
    queryKey: ['reports', 'students', classId, status],
    queryFn: () => api.get<StudentReportRow[]>('/reports/students', { classId: classId || undefined, status: status || undefined }),
  });
  const rows = q.data ?? [];
  const genderLabel = (g: StudentReportRow['gender']) => t(g);

  const exportCsv = () => downloadCsv(
    slug(`student register ${rows[0]?.className && classId ? rows[0].className : ''}`),
    [t('student'), t('admission'), t('class'), t('gender'), t('guardians'), t('phones'), `${t('attendanceRate')} %`, `${t('average')} %`, ...(isAdmin ? [t('feeBalance')] : [])],
    rows.map((r) => [
      `${r.firstName} ${r.lastName}`, r.admissionNo, r.className, genderLabel(r.gender), r.guardians, r.guardianPhones, r.attendanceRate, r.averagePercent,
      ...(isAdmin ? [r.feeBalance] : []),
    ]),
  );

  return (
    <>
      <Toolbar onExport={exportCsv} canExport={rows.length > 0}>
        <ClassFilter value={classId} onChange={setClassId} />
        <Field label={t('status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">{t('active')}</option>
            <option value="inactive">{t('inactive')}</option>
            <option value="">{t('all')}</option>
          </Select>
        </Field>
      </Toolbar>
      {q.isLoading ? <CardSkeleton rows={8} /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : !rows.length ? (
        <Card><EmptyState icon={<Users size={26} />} title={t('noStudents')} /></Card>
      ) : (
        <Card>
          <CardHeader title={t('students')} subtitle={t('count2', { n: rows.length })} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('student')}</th>
                  <th scope="col">{t('class')}</th>
                  <th scope="col">{t('gender')}</th>
                  <th scope="col">{t('guardians')}</th>
                  <th scope="col">{t('phones')}</th>
                  <th scope="col" className="num">{t('attendanceRate')}</th>
                  <th scope="col" className="num">{t('average')}</th>
                  {isAdmin && <th scope="col" className="num">{t('feeBalance')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/students/${r.id}`} className="bold" style={{ color: 'inherit' }}>{r.firstName} {r.lastName}</Link>
                      <div className="tiny muted mono">{r.admissionNo}{!r.isActive && ` · ${c('inactive')}`}</div>
                    </td>
                    <td>{r.className ?? '—'}</td>
                    <td className="small">{genderLabel(r.gender)}</td>
                    <td className="small">{r.guardians || '—'}</td>
                    <td className="small mono">{r.guardianPhones || '—'}</td>
                    <td className="num"><Badge tone={attendanceTone(r.attendanceRate)}>{percent(r.attendanceRate, 1)}</Badge></td>
                    <td className="num"><Badge tone={gradeTone(r.averagePercent)}>{percent(r.averagePercent, 1)}</Badge></td>
                    {isAdmin && <td className={`num ${r.feeBalance > 0 ? 'text-danger' : ''}`}>{money(r.feeBalance)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
