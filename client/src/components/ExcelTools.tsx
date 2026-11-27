import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileDown, FileSpreadsheet, FileUp, Info, RefreshCw, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { Assessment, ImportPreview, ImportPreviewRow, ImportResult, RecordResource, Term } from '../../../shared/types';
import { api, ApiError, errorMessage } from '../lib/api';
import { downloadCsv } from '../lib/export';
import { useI18n, useT } from '../lib/i18n';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { Alert, Badge, Button, Card, Field, Input, Select, StatCard, StatGroup } from './ui';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const todayIso = () => new Date().toISOString().slice(0, 10);

const M = {
  en: {
    template: 'Template', import: 'Import', export: 'Export',
    area: 'Excel data',
    recordsHint: 'Enter records in the downloaded template. Use the reference sheets for linked IDs. Export contains existing records for review or editing.',
    credentials: 'Download new account credentials', credentialsHint: 'Temporary passwords are shown once. Download this file before closing and share it privately.',
    csvRecord: 'Record', csvIdentifier: 'Identifier',
    inviteLinks: 'Download invitation links', inviteLinksHint: 'Download the links before closing and share them privately. Invitations have not been emailed.',
    templateTitle: 'Download a template', templateMarksDesc: 'An Excel file with this class’s students and any marks already saved.',
    templateAttDesc: 'An Excel file with this class’s students and any statuses already saved for the date.',
    term: 'Term', allTerms: 'All terms', assessment: 'Assessment', noAssessments: 'Add an assessment first, then download its template.',
    maxMark: 'Maximum mark {max}', date: 'Date', download: 'Download template', downloaded: 'Template downloaded',
    downloadedHint: 'Fill it in, save it as .xlsx, then use Import.',
    exportTitle: 'Export attendance', from: 'From', to: 'To', exportBtn: 'Download export', exported: 'Export downloaded',
    importTitle: 'Import from Excel', importDesc: 'Upload a completed EduLearn template. You’ll see every change before anything is saved.',
    file: 'Completed template (.xlsx)', fileHint: 'Use a file from the Template button. Other spreadsheets can’t be matched safely.',
    chooseFile: 'Choose a file to upload', check: 'Check file', checking: 'Checking…',
    review: 'Review import', newRecords: 'New', changed: 'Will change', unchanged: 'Unchanged', errors: 'Errors', skipped: 'Skipped',
    notInFile: '{n} students in the class aren’t in the file. They are left as they are.',
    fixTitle: 'Fix {n} problems, then upload the file again', fixTitleOne: 'Fix 1 problem, then upload the file again',
    fixBody: 'Nothing has been saved. Each problem shows the Excel row, the student and the column to correct.',
    row: 'Row {n}', errorReport: 'Download error report', another: 'Choose another file',
    changesTitle: 'Changes to save', skippedTitle: 'Skipped rows', unchangedTitle: 'Show {n} unchanged rows',
    newBadge: 'New', updateBadge: 'Change', more: 'and {n} more',
    confirmOverwrite: 'Replace {n} saved values with the values in this file',
    confirmOverwriteOne: 'Replace 1 saved value with the value in this file',
    save: 'Save import', saving: 'Saving…', cancel: 'Cancel', back: 'Back', close: 'Close',
    staleTitle: 'Records changed since your review', staleBody: 'Someone saved changes after you checked the file. Here is the updated review.',
    doneTitle: 'Import saved', doneBody: '{created} new · {updated} updated · {unchanged} unchanged', done: 'Done',
    nothingSaved: 'Nothing needed saving: the file matches what is already saved.',
    csvRow: 'Excel row', csvAdmission: 'Admission No', csvStudent: 'Student', csvColumn: 'Column', csvProblem: 'Problem',
  },
  sw: {
    template: 'Kiolezo', import: 'Leta', export: 'Hamisha',
    area: 'Taarifa za Excel',
    recordsHint: 'Jaza taarifa katika kiolezo. Tumia vitambulisho kwenye karatasi za marejeo. Hamisha hupakua taarifa zilizopo kwa ukaguzi au kuhariri.',
    credentials: 'Pakua taarifa za akaunti mpya', credentialsHint: 'Nenosiri la muda linaonyeshwa mara moja. Pakua faili kabla ya kufunga, kisha lishiriki kwa siri.',
    csvRecord: 'Rekodi', csvIdentifier: 'Kitambulisho',
    inviteLinks: 'Pakua viungo vya mwaliko', inviteLinksHint: 'Pakua viungo kabla ya kufunga na uvishiriki kwa siri. Mialiko haijatumwa kwa barua pepe.',
    templateTitle: 'Pakua kiolezo', templateMarksDesc: 'Faili la Excel lenye wanafunzi wa darasa hili na alama zilizokwisha hifadhiwa.',
    templateAttDesc: 'Faili la Excel lenye wanafunzi wa darasa hili na mahudhurio yaliyokwisha hifadhiwa kwa tarehe hiyo.',
    term: 'Muhula', allTerms: 'Mihula yote', assessment: 'Tathmini', noAssessments: 'Ongeza tathmini kwanza, kisha pakua kiolezo chake.',
    maxMark: 'Alama za juu {max}', date: 'Tarehe', download: 'Pakua kiolezo', downloaded: 'Kiolezo kimepakuliwa',
    downloadedHint: 'Kijaze, kihifadhi kama .xlsx, kisha tumia Leta.',
    exportTitle: 'Hamisha mahudhurio', from: 'Kuanzia', to: 'Hadi', exportBtn: 'Pakua', exported: 'Faili limepakuliwa',
    importTitle: 'Leta kutoka Excel', importDesc: 'Pakia kiolezo cha EduLearn kilichojazwa. Utaona kila badiliko kabla ya kuhifadhi.',
    file: 'Kiolezo kilichojazwa (.xlsx)', fileHint: 'Tumia faili kutoka kitufe cha Kiolezo. Majedwali mengine hayawezi kulinganishwa kwa usalama.',
    chooseFile: 'Chagua faili la kupakia', check: 'Kagua faili', checking: 'Inakagua…',
    review: 'Kagua uletaji', newRecords: 'Mpya', changed: 'Yatabadilika', unchanged: 'Hayabadiliki', errors: 'Makosa', skipped: 'Yamerukwa',
    notInFile: 'Wanafunzi {n} wa darasa hawamo kwenye faili. Taarifa zao hazitaguswa.',
    fixTitle: 'Rekebisha matatizo {n}, kisha pakia faili tena', fixTitleOne: 'Rekebisha tatizo 1, kisha pakia faili tena',
    fixBody: 'Hakuna kilichohifadhiwa. Kila tatizo linaonyesha safu ya Excel, mwanafunzi na safu wima ya kurekebisha.',
    row: 'Safu {n}', errorReport: 'Pakua ripoti ya makosa', another: 'Chagua faili jingine',
    changesTitle: 'Mabadiliko ya kuhifadhi', skippedTitle: 'Safu zilizorukwa', unchangedTitle: 'Onyesha safu {n} zisizobadilika',
    newBadge: 'Mpya', updateBadge: 'Badiliko', more: 'na mengine {n}',
    confirmOverwrite: 'Badilisha taarifa {n} zilizohifadhiwa kwa zilizo kwenye faili hili',
    confirmOverwriteOne: 'Badilisha taarifa 1 iliyohifadhiwa kwa iliyo kwenye faili hili',
    save: 'Hifadhi uletaji', saving: 'Inahifadhi…', cancel: 'Ghairi', back: 'Rudi', close: 'Funga',
    staleTitle: 'Taarifa zimebadilika tangu ukaguzi wako', staleBody: 'Mtu amehifadhi mabadiliko baada ya wewe kukagua faili. Huu ni ukaguzi mpya.',
    doneTitle: 'Uletaji umehifadhiwa', doneBody: 'Mpya {created} · zimesasishwa {updated} · hazijabadilika {unchanged}', done: 'Nimemaliza',
    nothingSaved: 'Hakuna cha kuhifadhi: faili linalingana na kilichohifadhiwa.',
    csvRow: 'Safu ya Excel', csvAdmission: 'Namba ya usajili', csvStudent: 'Mwanafunzi', csvColumn: 'Safu wima', csvProblem: 'Tatizo',
  },
};
type T = ReturnType<typeof useT<keyof typeof M.en>>;

export type ExcelTarget =
  | { kind: 'marks'; courseId: number; label: string; assessments: Assessment[]; canEdit: boolean; defaultAssessmentId?: number | null }
  | { kind: 'attendance'; classId: number; className: string; date: string }
  | { kind: 'records'; resource: RecordResource; label: string; scope: Record<string, number>; canEdit: boolean };

const endpoint = (target: ExcelTarget, step: string) => target.kind === 'records'
  ? `/imports/records/${target.resource}/${step}` : `/imports/${target.kind}/${step}`;

/** Reuses the same review/confirmation workflow for every managed record area. */
export function RecordExcelTools({ resource, label, scope = {}, canEdit = true }: {
  resource: RecordResource; label: string; scope?: Record<string, number>; canEdit?: boolean;
}) {
  return <ExcelTools target={{ kind: 'records', resource, label, scope, canEdit }} />;
}

export function RecordExcelPanel({ areas }: { areas: {
  resource: RecordResource; label: string; scope?: Record<string, number>; canEdit?: boolean;
}[] }) {
  const [selected, setSelected] = useState('');
  const { lang } = useI18n();
  const t = useT(M);
  const sw: Record<RecordResource, string> = {
    students: 'Wanafunzi', teachers: 'Walimu', parents: 'Akaunti za wazazi', guardians: 'Uhusiano wa wazazi na watoto',
    classes: 'Madarasa', courses: 'Masomo na walimu', subjects: 'Masomo', terms: 'Mihula',
    'academic-years': 'Miaka ya masomo', 'grading-scales': 'Viwango vya madaraja', timetable: 'Ratiba',
    assessments: 'Tathmini na kazi', exams: 'Mitihani', 'report-remarks': 'Maoni ya ripoti',
    'fee-structures': 'Miundo ya ada', invoices: 'Ankara', payments: 'Malipo', announcements: 'Matangazo',
    events: 'Matukio ya kalenda', invitations: 'Mialiko',
  };
  const area = areas.find(a => a.resource === selected) ?? areas[0];
  if (!area) return null;
  return <Card className="mb-3">
    <div className="toolbar" style={{ flexWrap: 'wrap', borderBottom: 0 }}>
      <span className="row bold" style={{ gap: 8 }}><FileSpreadsheet size={18} aria-hidden /> Excel</span>
      {areas.length > 1 ? <Select aria-label={t('area')} value={area.resource} onChange={e => setSelected(e.target.value)} style={{ width: 'auto', maxWidth: '100%' }}>
        {areas.map(a => <option key={a.resource} value={a.resource}>{lang === 'sw' ? sw[a.resource] : a.label}</option>)}
      </Select> : <span className="small muted">{lang === 'sw' ? sw[area.resource] : area.label}</span>}
      <div className="row row-wrap" style={{ gap: 8, marginLeft: 'auto' }}>
        <RecordExcelTools key={`${area.resource}:${JSON.stringify(area.scope)}`} {...area} />
      </div>
    </div>
  </Card>;
}

type Open = 'template' | 'import' | 'export' | null;

/** Template, Import and Export buttons for a gradebook or an attendance register. */
export function ExcelTools({ target }: { target: ExcelTarget }) {
  const t = useT(M);
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const canEdit = target.kind === 'attendance' || target.canEdit;

  const exportNow = async () => {
    if (target.kind === 'attendance') return setOpen('export');
    try {
      await api.download(endpoint(target, 'export'), target.kind === 'records' ? target.scope : { courseId: target.courseId });
      toast.success(t('exported'));
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      {canEdit && <Button icon={<FileSpreadsheet size={17} />} onClick={() => setOpen('template')}>{t('template')}</Button>}
      {canEdit && <Button icon={<FileUp size={17} />} onClick={() => setOpen('import')}>{t('import')}</Button>}
      <Button icon={<FileDown size={17} />} onClick={exportNow}>{t('export')}</Button>
      {open === 'template' && <TemplateDialog target={target} onClose={() => setOpen(null)} />}
      {open === 'import' && <ImportDialog target={target} onClose={() => setOpen(null)} />}
      {open === 'export' && target.kind === 'attendance' && <ExportDialog target={target} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Choose the assessment (by term) for a marks file, or the date for an attendance file. */
function ContextFields({ target, assessmentId, setAssessmentId, date, setDate, t }: {
  target: ExcelTarget; assessmentId: number | null; setAssessmentId: (id: number | null) => void; date: string; setDate: (d: string) => void; t: T;
}) {
  const terms = useQuery({ queryKey: ['terms'], queryFn: () => api.get<Term[]>('/terms'), enabled: target.kind === 'marks' });
  const [termId, setTermId] = useState<string>('');
  if (target.kind === 'records') return <Alert tone="info">{target.label}: {t('recordsHint')}</Alert>;
  if (target.kind === 'attendance') {
    return (
      <Field label={t('date')}>
        <Input type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
    );
  }
  const usedTerms = (terms.data ?? []).filter((tm) => target.assessments.some((a) => a.termId === tm.id));
  const list = target.assessments.filter((a) => !termId || String(a.termId) === termId);
  const chosen = target.assessments.find((a) => a.id === assessmentId);
  if (!target.assessments.length) return <Alert tone="info">{t('noAssessments')}</Alert>;
  return (
    <div className="form-grid">
      <Field label={t('term')}>
        <Select value={termId} onChange={(e) => {
          setTermId(e.target.value);
          const first = target.assessments.find((a) => !e.target.value || String(a.termId) === e.target.value);
          setAssessmentId(first?.id ?? null);
        }}>
          <option value="">{t('allTerms')}</option>
          {usedTerms.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </Select>
      </Field>
      <Field label={t('assessment')} hint={chosen ? t('maxMark', { max: chosen.maxScore }) : undefined}>
        <Select value={assessmentId ?? ''} onChange={(e) => setAssessmentId(e.target.value ? Number(e.target.value) : null)}>
          {list.map((a) => <option key={a.id} value={a.id}>{a.examName ? `${a.title} (${a.examName})` : a.title}</option>)}
        </Select>
      </Field>
    </div>
  );
}

function useContextState(target: ExcelTarget) {
  const initial = target.kind === 'marks'
    ? (target.assessments.find((a) => a.id === target.defaultAssessmentId) ?? target.assessments[target.assessments.length - 1])?.id ?? null
    : null;
  const [assessmentId, setAssessmentId] = useState<number | null>(initial);
  const [date, setDate] = useState(target.kind === 'attendance' ? target.date : todayIso());
  const query = target.kind === 'marks' ? { assessmentId } : target.kind === 'attendance' ? { classId: target.classId, date } : target.scope;
  const ready = target.kind === 'marks' ? assessmentId !== null : !!date;
  return { assessmentId, setAssessmentId, date, setDate, query, ready };
}

function TemplateDialog({ target, onClose }: { target: ExcelTarget; onClose: () => void }) {
  const t = useT(M);
  const toast = useToast();
  const ctx = useContextState(target);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await api.download(endpoint(target, 'template'), ctx.query);
      toast.success(t('downloaded'), t('downloadedHint'));
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('templateTitle')}
      description={target.kind === 'marks' ? `${target.label} · ${t('templateMarksDesc')}` : target.kind === 'attendance' ? `${target.className} · ${t('templateAttDesc')}` : target.label}
      onSubmit={download}
      footer={<><Button onClick={onClose}>{t('cancel')}</Button><Button type="submit" variant="primary" icon={<Download size={17} />} loading={busy} disabled={!ctx.ready}>{t('download')}</Button></>}
    >
      <ContextFields target={target} {...ctx} t={t} />
    </Modal>
  );
}

function ExportDialog({ target, onClose }: { target: Extract<ExcelTarget, { kind: 'attendance' }>; onClose: () => void }) {
  const t = useT(M);
  const toast = useToast();
  const [to, setTo] = useState(target.date);
  const [from, setFrom] = useState(() => new Date(Date.parse(target.date) - 30 * 864e5).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api.download('/imports/attendance/export', { classId: target.classId, from, to });
      toast.success(t('exported'));
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('exportTitle')}
      description={target.className}
      onSubmit={run}
      footer={<><Button onClick={onClose}>{t('cancel')}</Button><Button type="submit" variant="primary" icon={<FileDown size={17} />} loading={busy}>{t('exportBtn')}</Button></>}
    >
      <div className="form-grid">
        <Field label={t('from')}><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('to')}><Input type="date" value={to} max={todayIso()} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ImportDialog({ target, onClose }: { target: ExcelTarget; onClose: () => void }) {
  const t = useT(M);
  const qc = useQueryClient();
  const ctx = useContextState(target);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [stale, setStale] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const url = (step: 'preview' | 'commit', extra: Record<string, string> = {}) =>
    `${endpoint(target, step)}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(ctx.query).map(([k, v]) => [k, String(v)])), ...extra })}`;

  const check = async (refresh = false) => {
    if (!file) { setFileError(t('chooseFile')); return; }
    setBusy('check');
    setFileError(null);
    try {
      const p = await api.upload<ImportPreview>('POST', url('preview'), file, XLSX_MIME);
      setPreview(p);
      setConfirmed(false);
      setStale(refresh);
    } catch (err) {
      setFileError(errorMessage(err));
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!file || !preview) return;
    setBusy('save');
    try {
      const res = await api.upload<ImportResult>('POST', url('commit', {
        fingerprint: preview.fingerprint, filename: file.name, ...(confirmed ? { confirmOverwrite: '1' } : {}),
      }), file, XLSX_MIME);
      setResult(res);
      // Totals, averages, dashboards and reports all read from what was just saved.
      await qc.invalidateQueries();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBusy(null);
        await check(true);
        return;
      }
      setFileError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setPreview(null);
    setFile(null);
    setStale(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (result) {
    const nothing = result.created + result.updated === 0;
    return (
      <Modal open onClose={onClose} title={t('doneTitle')} footer={<Button variant="primary" onClick={onClose}>{t('done')}</Button>}>
        <div role="status" className="stack">
          <span className="empty-icon" style={{ margin: 0, background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden><CheckCircle2 size={24} /></span>
          <p className="bold">{result.title}</p>
          {!!result.credentials?.length && <Alert tone="warning" title={t('credentialsHint')}>
            <Button icon={<Download size={17} />} onClick={() => downloadCsv('new-account-credentials', ['Email', 'Temporary password'], result.credentials!.map(c => [c.email, c.temporaryPassword]))}>{t('credentials')}</Button>
          </Alert>}
          {!!result.invitationLinks?.length && <Alert tone="warning" title={t('inviteLinksHint')}>
            <Button icon={<Download size={17} />} onClick={() => downloadCsv('invitation-links', ['Email', 'Invitation link'], result.invitationLinks!.map(c => [c.email, c.link]))}>{t('inviteLinks')}</Button>
          </Alert>}
          {nothing ? <p className="muted">{t('nothingSaved')}</p> : (
            <StatGroup>
              <StatCard icon={<CheckCircle2 size={16} />} label={t('newRecords')} value={result.created} tone="success" />
              <StatCard icon={<RefreshCw size={16} />} label={t('changed')} value={result.updated} tone="info" />
              <StatCard icon={<Info size={16} />} label={t('unchanged')} value={result.unchanged} tone="primary" />
            </StatGroup>
          )}
        </div>
      </Modal>
    );
  }

  const body = !preview ? (
    <div className="stack">
      <ContextFields target={target} {...ctx} t={t} />
      <Field label={t('file')} hint={t('fileHint')} error={fileError ?? undefined}>
        <Input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFileError(null); }}
        />
      </Field>
    </div>
  ) : (
    <Review preview={preview} stale={stale} confirmed={confirmed} setConfirmed={setConfirmed} error={fileError} onAnother={reset} t={t} />
  );

  const canSave = !!preview?.canSave && (!preview.needsOverwriteConfirm || confirmed);
  return (
    <Modal
      open
      onClose={onClose}
      variant="drawer"
      size="lg"
      title={preview ? t('review') : t('importTitle')}
      description={preview ? preview.title : t('importDesc')}
      onSubmit={() => (preview ? save() : check())}
      footer={preview ? (
        <>
          <Button onClick={reset} disabled={!!busy}>{t('back')}</Button>
          {preview.canSave
            ? <Button type="submit" variant="primary" icon={<Upload size={17} />} loading={busy === 'save'} disabled={!canSave}>{t('save')}</Button>
            : <Button variant="primary" onClick={onClose}>{t('close')}</Button>}
        </>
      ) : (
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" icon={<FileUp size={17} />} loading={busy === 'check'} disabled={!ctx.ready}>{t('check')}</Button>
        </>
      )}
    >
      {body}
    </Modal>
  );
}

const SHOW = 50;

function Review({ preview, stale, confirmed, setConfirmed, error, onAnother, t }: {
  preview: ImportPreview; stale: boolean; confirmed: boolean; setConfirmed: (v: boolean) => void; error: string | null; onAnother: () => void; t: T;
}) {
  const changes = useMemo(() => preview.rows.filter((r) => r.action === 'create' || r.action === 'update'), [preview]);
  const unchanged = preview.rows.filter((r) => r.action === 'unchanged');
  const skipped = preview.rows.filter((r) => r.action === 'skip');
  const { counts, issues } = preview;

  const errorReport = () => downloadCsv(
    `import-errors-${preview.kind}`,
    [t('csvRow'), t(preview.kind === 'records' ? 'csvIdentifier' : 'csvAdmission'), t(preview.kind === 'records' ? 'csvRecord' : 'csvStudent'), t('csvColumn'), t('csvProblem')],
    issues.map((i) => [i.row, i.admissionNo, i.studentName, i.column, i.message]),
  );

  return (
    <div className="stack">
      {stale && <Alert tone="warning" title={t('staleTitle')}>{t('staleBody')}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="row row-wrap" style={{ gap: 6 }}>
        {preview.details.map((d) => <span key={d.label} className="chip"><span className="muted">{d.label}:</span> {d.value}</span>)}
      </div>
      <StatGroup label={t('review')}>
        <StatCard icon={<CheckCircle2 size={16} />} label={t('newRecords')} value={counts.create} tone="success" />
        <StatCard icon={<RefreshCw size={16} />} label={t('changed')} value={counts.update} tone="info" />
        <StatCard icon={<Info size={16} />} label={t('unchanged')} value={counts.unchanged} tone="primary" />
        <StatCard icon={<AlertTriangle size={16} />} label={t('errors')} value={issues.length} tone={issues.length ? 'danger' : 'success'} />
      </StatGroup>
      {preview.notices.map((n) => <Alert key={n} tone="info">{n}</Alert>)}
      {preview.notInFile > 0 && <p className="small muted">{t('notInFile', { n: preview.notInFile })}</p>}

      {issues.length > 0 && (
        <section className="stack-sm" aria-labelledby="import-issues">
          <Alert tone="danger" title={issues.length === 1 ? t('fixTitleOne') : t('fixTitle', { n: issues.length })}>{t('fixBody')}</Alert>
          <div className="row row-wrap" style={{ gap: 8 }}>
            <Button size="sm" icon={<Download size={15} />} onClick={errorReport}>{t('errorReport')}</Button>
            <Button size="sm" variant="ghost" icon={<FileUp size={15} />} onClick={onAnother}>{t('another')}</Button>
          </div>
          <h3 id="import-issues" className="sr-only">{t('errors')}</h3>
          <ul className="list card import-list">
            {issues.map((i, n) => (
              <li key={n} className="list-item">
                <Badge tone="danger">{i.row ? t('row', { n: i.row }) : '—'}</Badge>
                <div className="grow">
                  <div className="title small">{i.studentName || i.admissionNo || '—'}{i.admissionNo && i.studentName ? <span className="muted"> · {i.admissionNo}</span> : null}{i.column ? <span className="muted"> · {i.column}</span> : null}</div>
                  <div className="meta">{i.message}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {changes.length > 0 && (
        <section className="stack-sm">
          <h3>{t('changesTitle')}</h3>
          <RowList rows={changes.slice(0, SHOW)} t={t} />
          {changes.length > SHOW && <p className="small muted">{t('more', { n: changes.length - SHOW })}</p>}
        </section>
      )}

      {skipped.length > 0 && (
        <section className="stack-sm">
          <h3>{t('skippedTitle')}</h3>
          <RowList rows={skipped} t={t} />
        </section>
      )}

      {unchanged.length > 0 && (
        <details>
          <summary className="small bold" style={{ cursor: 'pointer' }}>{t('unchangedTitle', { n: unchanged.length })}</summary>
          <div className="mt-1"><RowList rows={unchanged} t={t} /></div>
        </details>
      )}

      {preview.canSave && preview.needsOverwriteConfirm && (
        <label className="checkbox" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>{counts.update === 1 ? t('confirmOverwriteOne') : t('confirmOverwrite', { n: counts.update })}</span>
        </label>
      )}
    </div>
  );
}

function RowList({ rows, t }: { rows: ImportPreviewRow[]; t: T }) {
  return (
    <ul className="list card import-list">
      {rows.map((r) => (
        <li key={r.row} className="list-item">
          <span className="tiny muted num" style={{ width: 52, flex: 'none' }}>{t('row', { n: r.row })}</span>
          <div className="grow">
            <div className="title small">{r.studentName} <span className="muted">· {r.admissionNo}</span></div>
            <div className="meta">
              {r.action === 'skip' || (r.action === 'unchanged' && r.note) ? r.note : (
                <>
                  {r.before && r.action === 'update' && <><s>{r.before}</s> → </>}
                  <strong style={{ color: 'var(--text)' }}>{r.after ?? '—'}</strong>
                </>
              )}
            </div>
          </div>
          {r.action === 'create' && <Badge tone="success">{t('newBadge')}</Badge>}
          {r.action === 'update' && <Badge tone="info">{t('updateBadge')}</Badge>}
        </li>
      ))}
    </ul>
  );
}
