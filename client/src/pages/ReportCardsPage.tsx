import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, GraduationCap, Printer, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ReportCard, ReportCardSummary } from '../../../shared/types';
import { ColumnChart } from '../components/charts';
import { ChildSwitcher, useSelectedChild } from '../components/ChildSwitcher';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, PageHeader, Textarea, cx,
} from '../components/ui';
import { api } from '../lib/api';
import { useSchool, useUser } from '../lib/auth';
import { printPage } from '../lib/export';
import { formatDate, fullName, gradeTone, percent } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    title: 'Report cards', subtitle: 'Examination results once the school publishes them.', subtitleChild: 'Examination results for {name}.',
    noCards: 'No results published yet', noCardsHint: 'You’ll get a notification as soon as the school publishes examination results.',
    progress: 'Progress across exams', average: 'Average', grade: 'Grade', position: 'Position', positionOf: '{pos} of {size}',
    open: 'Open report card', published: 'Published {date}', noChild: 'No children are linked to your account yet.',
    // Report card
    heading: 'Student Report Card', headingSw: 'Ripoti ya Maendeleo ya Mwanafunzi', back: 'Back', print: 'Print / save as PDF',
    exam: 'Examination', term: 'Term', student: 'Student', admission: 'Admission no.', class: 'Class',
    subject: 'Subject', teacher: 'Teacher', marks: 'Marks', percentCol: '%', remark: 'Remark', classAvg: 'Class avg.',
    total: 'Total', overall: 'Overall', notMarked: 'Not marked', absent: 'Absent', exempt: 'Exempt', attendance: 'Attendance this term',
    attendanceLine: '{rate} attendance · {present} present · {late} late · {absent} absent · {excused} excused',
    key: 'Grading key', classTeacherRemark: 'Class teacher’s remark', noRemark: 'No remark yet.',
    remarkPlaceholder: 'Write a short comment about the student’s progress…', saveRemark: 'Save remark', remarkSaved: 'Remark saved',
    classTeacherSign: 'Class teacher’s signature', headSign: 'Head of school’s signature', parentSign: 'Parent’s signature',
    unpublished: 'Not yet published — families can’t see this report card.', notAvailable: 'This report card isn’t available',
  },
  sw: {
    title: 'Ripoti za matokeo', subtitle: 'Matokeo ya mitihani baada ya shule kuyatoa.', subtitleChild: 'Matokeo ya mitihani ya {name}.',
    noCards: 'Bado hakuna matokeo yaliyotolewa', noCardsHint: 'Utapata arifa mara shule itakapotoa matokeo ya mitihani.',
    progress: 'Maendeleo katika mitihani', average: 'Wastani', grade: 'Daraja', position: 'Nafasi', positionOf: '{pos} kati ya {size}',
    open: 'Fungua ripoti', published: 'Yametolewa {date}', noChild: 'Bado hakuna watoto waliounganishwa na akaunti yako.',
    heading: 'Ripoti ya Maendeleo ya Mwanafunzi', headingSw: 'Student Report Card', back: 'Rudi', print: 'Chapisha / hifadhi PDF',
    exam: 'Mtihani', term: 'Muhula', student: 'Mwanafunzi', admission: 'Na. ya usajili', class: 'Darasa',
    subject: 'Somo', teacher: 'Mwalimu', marks: 'Alama', percentCol: '%', remark: 'Maoni', classAvg: 'Wastani wa darasa',
    total: 'Jumla', overall: 'Kwa ujumla', notMarked: 'Haijasahihishwa', absent: 'Hakuwepo', exempt: 'Amesamehewa', attendance: 'Mahudhurio ya muhula huu',
    attendanceLine: 'Mahudhurio {rate} · alikuwepo {present} · alichelewa {late} · hakuwepo {absent} · ruhusa {excused}',
    key: 'Ufunguo wa madaraja', classTeacherRemark: 'Maoni ya mwalimu wa darasa', noRemark: 'Bado hakuna maoni.',
    remarkPlaceholder: 'Andika maoni mafupi kuhusu maendeleo ya mwanafunzi…', saveRemark: 'Hifadhi maoni', remarkSaved: 'Maoni yamehifadhiwa',
    classTeacherSign: 'Sahihi ya mwalimu wa darasa', headSign: 'Sahihi ya mkuu wa shule', parentSign: 'Sahihi ya mzazi',
    unpublished: 'Bado hayajatolewa — familia haziwezi kuona ripoti hii.', notAvailable: 'Ripoti hii haipatikani',
  },
};

// ---------------------------------------------------------------- List (students & parents)
export function ReportCardsPage() {
  const t = useT(M);
  const user = useUser();
  const [params] = useSearchParams();
  const highlight = Number(params.get('exam')) || null;
  const { child, children, setChild, isLoading: childLoading } = useSelectedChild();
  const cards = useQuery({
    queryKey: ['report-cards', child?.id],
    queryFn: () => api.get<ReportCardSummary[]>(`/students/${child!.id}/report-cards`),
    enabled: !!child,
  });

  const subtitle = user.role === 'parent' && child ? t('subtitleChild', { name: child.firstName }) : t('subtitle');

  return (
    <>
      <PageHeader title={t('title')} description={subtitle} />
      {user.role === 'parent' && (
        <div className="mb-3"><ChildSwitcher children={children} value={child?.id ?? null} onChange={setChild} /></div>
      )}
      {childLoading || cards.isLoading ? (
        <div className="grid grid-2"><CardSkeleton rows={3} /><CardSkeleton rows={3} /></div>
      ) : !child ? (
        <Card><EmptyState icon={<GraduationCap size={26} />} title={t('noChild')} /></Card>
      ) : cards.error ? (
        <ErrorState error={cards.error} onRetry={cards.refetch} />
      ) : !cards.data?.length ? (
        <Card><EmptyState icon={<Award size={26} />} title={t('noCards')}>{t('noCardsHint')}</EmptyState></Card>
      ) : (
        <div className="stack" style={{ gap: 20 }}>
          {cards.data.length > 1 && (
            <Card>
              <CardHeader title={t('progress')} />
              <div className="card-body">
                <ColumnChart
                  label={t('progress')}
                  color="var(--accent)"
                  data={[...cards.data].reverse().map((c) => ({ label: c.examName.split(' ').slice(0, 2).join(' '), title: c.examName, value: c.averagePercent }))}
                  format={(v) => percent(v, 1)}
                />
              </div>
            </Card>
          )}
          <div className="grid grid-2">
            {cards.data.map((c) => (
              <Link
                key={c.examId}
                to={`/report-cards/${c.examId}/${child.id}`}
                className={cx('card card-hover', `tone-${gradeTone(c.averagePercent)}`)}
                style={{ color: 'inherit', textDecoration: 'none', outline: highlight === c.examId ? '2px solid var(--accent)' : undefined }}
              >
                <div className="card-body stack" style={{ gap: 12 }}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <h2>{c.examName}</h2>
                      <div className="small muted">{c.termName ?? ''}{c.publishedAt && <> · {t('published', { date: formatDate(c.publishedAt.slice(0, 10)) })}</>}</div>
                    </div>
                    <Award size={22} style={{ color: 'var(--tone)' }} aria-hidden />
                  </div>
                  <div className="grid grid-3" style={{ gap: 10 }}>
                    <Mini label={t('average')} value={percent(c.averagePercent, 1)} />
                    <Mini label={t('grade')} value={c.grade ?? '—'} />
                    <Mini label={t('position')} value={c.position ? t('positionOf', { pos: c.position, size: c.classSize }) : '—'} />
                  </div>
                  <span className="small bold" style={{ color: 'var(--primary)' }}>{t('open')} →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}>
      <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="bold num" style={{ fontSize: '1.1rem', color: 'var(--tone)' }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Single printable report card
export function ReportCardPage() {
  const t = useT(M);
  const { t: c } = useI18n();
  const user = useUser();
  const school = useSchool();
  const { examId, studentId } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-card', examId, studentId],
    queryFn: () => api.get<ReportCard>(`/exams/${examId}/report-cards/${studentId}`),
  });

  const backTo = user.role === 'admin' || user.role === 'teacher' ? `/exams/${examId}?tab=results` : '/report-cards';

  if (isLoading) return <CardSkeleton rows={10} />;
  if (error || !data) {
    return (
      <>
        <div className="mb-2"><Link to={backTo} className="row small bold" style={{ gap: 6 }}><ArrowLeft size={15} aria-hidden />{t('back')}</Link></div>
        <ErrorState error={error ?? new Error(t('notAvailable'))} onRetry={refetch} />
      </>
    );
  }

  const s = data.school ?? school;
  const contact = [s.address, s.phone, s.email].filter(Boolean).join(' · ');
  const att = data.attendance;
  const graded = data.subjects.filter((x) => x.marks !== null);
  const maxTotal = graded.reduce((sum, x) => sum + x.maxMarks, 0);

  return (
    <>
      <div className="row between row-wrap mb-2 no-print">
        <Link to={backTo} className="row small bold" style={{ gap: 6 }}><ArrowLeft size={15} aria-hidden />{t('back')}</Link>
        <Button variant="primary" icon={<Printer size={16} />} onClick={printPage}>{t('print')}</Button>
      </div>
      {!data.exam.publishedAt && (user.role === 'admin' || user.role === 'teacher') && (
        <div className="mb-2 no-print"><Badge tone="warning" dot>{t('unpublished')}</Badge></div>
      )}
      <article className="document" aria-label={t('heading')}>
        <header className="doc-head">
          {s.logoUrl ? <img className="doc-logo" src={s.logoUrl} alt="" /> : <span className="doc-logo" style={{ display: 'grid', placeItems: 'center', background: 'var(--doc-ink)', color: '#fff' }}><GraduationCap size={30} aria-hidden /></span>}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.4rem' }}>{s.name}</h1>
            {s.motto && <div className="muted" style={{ fontStyle: 'italic' }}>“{s.motto}”</div>}
            {contact && <div className="muted small">{contact}</div>}
          </div>
          <div className="doc-title">
            <div className="bold" style={{ color: 'var(--doc-ink)' }}>{t('heading')}</div>
            <div className="muted small">{t('headingSw')}</div>
          </div>
        </header>

        <section style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
          <Avatar name={fullName(data.student)} size="lg" photoUrl={data.student.photoUrl} />
          <dl className="kv doc-kv" style={{ flex: 1, minWidth: 0 }}>
            <dt>{t('student')}</dt><dd className="bold">{fullName(data.student)}</dd>
            <dt>{t('admission')}</dt><dd className="mono">{data.student.admissionNo}</dd>
            <dt>{t('class')}</dt><dd>{data.student.className ?? '—'}</dd>
            <dt>{t('exam')}</dt><dd>{data.exam.name}</dd>
            <dt>{t('term')}</dt><dd>{data.exam.termName ?? '—'}</dd>
            <dt>{t('position')}</dt><dd className="bold">{data.position ? t('positionOf', { pos: data.position, size: data.classSize }) : '—'}</dd>
          </dl>
        </section>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('subject')}</th>
                <th scope="col">{t('teacher')}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{t('marks')}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{t('percentCol')}</th>
                <th scope="col">{t('grade')}</th>
                <th scope="col">{t('remark')}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{t('classAvg')}</th>
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((x) => (
                <tr key={x.subjectName}>
                  <td style={{ fontWeight: 600 }}>{x.subjectName}</td>
                  <td>{x.teacherName ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{x.marks === null ? <span className="muted">{x.status ? t(x.status) : t('notMarked')}</span> : `${x.marks} / ${x.maxMarks}`}</td>
                  <td style={{ textAlign: 'right' }}>{percent(x.percent, 1)}</td>
                  <td style={{ fontWeight: 700 }}>{x.grade ?? '—'}</td>
                  <td>{x.remark ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{percent(x.classAverage, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>{t('total')}</th>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{data.total} / {maxTotal}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{percent(data.averagePercent, 1)}</td>
                <td style={{ fontWeight: 800 }}>{data.grade ?? '—'}</td>
                <td colSpan={2}>{t('overall')}: {data.position ? t('positionOf', { pos: data.position, size: data.classSize }) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18, marginTop: 20 }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 6 }}>{t('attendance')}</h3>
            <p className="small">
              {att.total
                ? t('attendanceLine', { rate: percent(att.rate, 1), present: att.present, late: att.late, absent: att.absent, excused: att.excused })
                : '—'}
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 6 }}>{t('key')}</h3>
            <p className="small">
              {[...data.bands].sort((a, b) => b.minPercent - a.minPercent).map((b) => `${b.grade} ${b.minPercent}–${b.maxPercent}${b.remark ? ` (${b.remark})` : ''}`).join(' · ')}
            </p>
          </div>
        </section>

        <RemarkSection card={data} examId={Number(examId)} studentId={Number(studentId)} />

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 36 }}>
          {[t('classTeacherSign'), t('headSign'), t('parentSign')].map((label) => (
            <div key={label}>
              <div style={{ borderBottom: '1px solid #888', height: 34 }} />
              <div className="small muted" style={{ marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </section>
        <p className="tiny muted" style={{ marginTop: 18 }}>{formatDate(new Date().toISOString().slice(0, 10))} · {c('reportCards')}</p>
      </article>
    </>
  );
}

/** The class teacher's comment: editable by admins and the student's class teacher, read-only for everyone else. */
function RemarkSection({ card, examId, studentId }: { card: ReportCard; examId: number; studentId: number }) {
  const t = useT(M);
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState(card.remark ?? '');
  useEffect(() => setText(card.remark ?? ''), [card.remark]);

  // Teachers: only the class teacher may edit. We can't tell from the card who the class teacher is,
  // so teachers try to save and the server decides; admins can always edit.
  const canEdit = card.canEditRemark;
  const save = useMutation({
    mutationFn: () => api.put(`/exams/${examId}/report-cards/${studentId}/remark`, { remark: text.trim() }),
    onSuccess: () => {
      toast.success(t('remarkSaved'));
      qc.invalidateQueries({ queryKey: ['report-card', String(examId), String(studentId)] });
    },
    onError: (err) => toast.error(err),
  });

  return (
    <section style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: '0.95rem', marginBottom: 6 }}>{t('classTeacherRemark')}</h3>
      {canEdit ? (
        <>
          <div className="no-print stack-sm">
            <label className="sr-only" htmlFor="remark">{t('classTeacherRemark')}</label>
            <Textarea id="remark" rows={3} maxLength={600} value={text} placeholder={t('remarkPlaceholder')} onChange={(e) => setText(e.target.value)} />
            <div>
              <Button size="sm" icon={<Save size={15} />} loading={save.isPending} disabled={text.trim() === (card.remark ?? '')} onClick={() => save.mutate()}>{t('saveRemark')}</Button>
            </div>
          </div>
          <p className="print-only" style={{ whiteSpace: 'pre-wrap' }}>{text || t('noRemark')}</p>
        </>
      ) : (
        <p style={{ whiteSpace: 'pre-wrap' }} className={card.remark ? '' : 'muted'}>{card.remark ?? t('noRemark')}</p>
      )}
    </section>
  );
}
