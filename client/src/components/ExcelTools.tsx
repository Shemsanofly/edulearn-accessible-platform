import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeftRight, CheckCircle2, ChevronDown, Download, FileDown, FileSpreadsheet, FileText, FileUp, Info, KeyRound,
  RefreshCw, Sheet, Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { Assessment, FileFormat, ImportPreview, ImportPreviewRow, ImportResult, PeopleKind, Term } from '../../../shared/types';
import { api, ApiError, errorMessage } from '../lib/api';
import { downloadCsv } from '../lib/export';
import { useT } from '../lib/i18n';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { Alert, Badge, Button, Field, Input, Select, StatCard, StatGroup, useDismiss } from './ui';

const todayIso = () => new Date().toISOString().slice(0, 10);

const M = {
  en: {
    menu: 'Import/Export',
    importGroup: 'Import from file', importCsv: 'Import from CSV', importExcel: 'Import from Excel',
    exportGroup: 'Export {what}', exportCsv: 'Export to CSV', exportExcel: 'Export to Excel', exportPdf: 'Export to PDF',
    templateGroup: 'Download templates', templateCsv: 'CSV template', templateExcel: 'Excel template',
    what_marks: 'marks', what_attendance: 'attendance', what_students: 'students', what_teachers: 'teachers', what_parents: 'parents',
    templateTitle: 'Download a template', templateMarksDesc: 'A file with this class’s students and any marks already saved.',
    templateAttDesc: 'A file with this class’s students and any statuses already saved for the date.',
    term: 'Term', allTerms: 'All terms', assessment: 'Assessment', noAssessments: 'Add an assessment first, then download its template.',
    maxMark: 'Maximum mark {max}', date: 'Date', download: 'Download template', downloaded: 'Template downloaded',
    downloadedHint: 'Fill it in, save it in the same format, then use Import.',
    exportTitle: 'Export attendance', from: 'From', to: 'To', exportBtn: 'Download export', exported: 'Export downloaded',
    importTitle: 'Import from {format}', importDesc: 'Upload a completed EduLearn template or an exported file. You’ll see every change before anything is saved.',
    importPeopleDesc: 'Upload a completed template, or an exported list you edited. New people get accounts; existing people are matched by {key}.',
    key_students: 'admission number (or email)', key_teachers: 'employee number (or email)', key_parents: 'email',
    file: 'Completed file ({format})', fileHint: 'Use a file from Download templates or Export. Other spreadsheets can’t be matched safely.',
    chooseFile: 'Choose a file to upload', check: 'Check file',
    review: 'Review import', newRecords: 'New', changed: 'Will change', unchanged: 'Unchanged', errors: 'Errors',
    notInFile: '{n} students in the class aren’t in the file. They are left as they are.',
    fixTitle: 'Fix {n} problems, then upload the file again', fixTitleOne: 'Fix 1 problem, then upload the file again',
    fixBody: 'Nothing has been saved. Each problem shows the row in your file, the person and the column to correct.',
    row: 'Row {n}', errorReport: 'Download error report', another: 'Choose another file',
    changesTitle: 'Changes to save', skippedTitle: 'Skipped rows', unchangedTitle: 'Show {n} unchanged rows',
    newBadge: 'New', updateBadge: 'Change', more: 'and {n} more',
    confirmOverwrite: 'Replace {n} saved values with the values in this file',
    confirmOverwriteOne: 'Replace 1 saved value with the value in this file',
    save: 'Save import', cancel: 'Cancel', back: 'Back', close: 'Close',
    staleTitle: 'Records changed since your review', staleBody: 'Someone saved changes after you checked the file. Here is the updated review.',
    doneTitle: 'Import saved', done: 'Done', nothingSaved: 'Nothing needed saving: the file matches what is already saved.',
    accountsTitle: 'Sign-in details for {n} new accounts', accountsTitleOne: 'Sign-in details for 1 new account',
    accountsBody: 'Each new account has a temporary password. Download the list now and share each password privately: it won’t be shown again.',
    downloadAccounts: 'Download sign-in details',
    csvRow: 'Row', csvId: 'Identifier', csvName: 'Name', csvColumn: 'Column', csvProblem: 'Problem',
    csvEmail: 'Email', csvPassword: 'Temporary password',
  },
  sw: {
    menu: 'Leta/Hamisha',
    importGroup: 'Leta kutoka faili', importCsv: 'Leta kutoka CSV', importExcel: 'Leta kutoka Excel',
    exportGroup: 'Hamisha {what}', exportCsv: 'Hamisha kwa CSV', exportExcel: 'Hamisha kwa Excel', exportPdf: 'Hamisha kwa PDF',
    templateGroup: 'Pakua violezo', templateCsv: 'Kiolezo cha CSV', templateExcel: 'Kiolezo cha Excel',
    what_marks: 'alama', what_attendance: 'mahudhurio', what_students: 'wanafunzi', what_teachers: 'walimu', what_parents: 'wazazi',
    templateTitle: 'Pakua kiolezo', templateMarksDesc: 'Faili lenye wanafunzi wa darasa hili na alama zilizokwisha hifadhiwa.',
    templateAttDesc: 'Faili lenye wanafunzi wa darasa hili na mahudhurio yaliyokwisha hifadhiwa kwa tarehe hiyo.',
    term: 'Muhula', allTerms: 'Mihula yote', assessment: 'Tathmini', noAssessments: 'Ongeza tathmini kwanza, kisha pakua kiolezo chake.',
    maxMark: 'Alama za juu {max}', date: 'Tarehe', download: 'Pakua kiolezo', downloaded: 'Kiolezo kimepakuliwa',
    downloadedHint: 'Kijaze, kihifadhi kwa muundo uleule, kisha tumia Leta.',
    exportTitle: 'Hamisha mahudhurio', from: 'Kuanzia', to: 'Hadi', exportBtn: 'Pakua', exported: 'Faili limepakuliwa',
    importTitle: 'Leta kutoka {format}', importDesc: 'Pakia kiolezo cha EduLearn kilichojazwa au faili lililohamishwa. Utaona kila badiliko kabla ya kuhifadhi.',
    importPeopleDesc: 'Pakia kiolezo kilichojazwa, au orodha uliyohamisha na kuhariri. Watu wapya wanafunguliwa akaunti; waliopo wanalinganishwa kwa {key}.',
    key_students: 'namba ya usajili (au barua pepe)', key_teachers: 'namba ya mfanyakazi (au barua pepe)', key_parents: 'barua pepe',
    file: 'Faili lililojazwa ({format})', fileHint: 'Tumia faili kutoka Pakua violezo au Hamisha. Majedwali mengine hayawezi kulinganishwa kwa usalama.',
    chooseFile: 'Chagua faili la kupakia', check: 'Kagua faili',
    review: 'Kagua uletaji', newRecords: 'Mpya', changed: 'Yatabadilika', unchanged: 'Hayabadiliki', errors: 'Makosa',
    notInFile: 'Wanafunzi {n} wa darasa hawamo kwenye faili. Taarifa zao hazitaguswa.',
    fixTitle: 'Rekebisha matatizo {n}, kisha pakia faili tena', fixTitleOne: 'Rekebisha tatizo 1, kisha pakia faili tena',
    fixBody: 'Hakuna kilichohifadhiwa. Kila tatizo linaonyesha safu ya faili, mhusika na safu wima ya kurekebisha.',
    row: 'Safu {n}', errorReport: 'Pakua ripoti ya makosa', another: 'Chagua faili jingine',
    changesTitle: 'Mabadiliko ya kuhifadhi', skippedTitle: 'Safu zilizorukwa', unchangedTitle: 'Onyesha safu {n} zisizobadilika',
    newBadge: 'Mpya', updateBadge: 'Badiliko', more: 'na mengine {n}',
    confirmOverwrite: 'Badilisha taarifa {n} zilizohifadhiwa kwa zilizo kwenye faili hili',
    confirmOverwriteOne: 'Badilisha taarifa 1 iliyohifadhiwa kwa iliyo kwenye faili hili',
    save: 'Hifadhi uletaji', cancel: 'Ghairi', back: 'Rudi', close: 'Funga',
    staleTitle: 'Taarifa zimebadilika tangu ukaguzi wako', staleBody: 'Mtu amehifadhi mabadiliko baada ya wewe kukagua faili. Huu ni ukaguzi mpya.',
    doneTitle: 'Uletaji umehifadhiwa', done: 'Nimemaliza', nothingSaved: 'Hakuna cha kuhifadhi: faili linalingana na kilichohifadhiwa.',
    accountsTitle: 'Taarifa za kuingia za akaunti mpya {n}', accountsTitleOne: 'Taarifa za kuingia za akaunti mpya 1',
    accountsBody: 'Kila akaunti mpya ina nenosiri la muda. Pakua orodha sasa na mpe kila mtu nenosiri lake kwa siri: halitaonyeshwa tena.',
    downloadAccounts: 'Pakua taarifa za kuingia',
    csvRow: 'Safu', csvId: 'Namba', csvName: 'Jina', csvColumn: 'Safu wima', csvProblem: 'Tatizo',
    csvEmail: 'Barua pepe', csvPassword: 'Nenosiri la muda',
  },
};
type T = ReturnType<typeof useT<keyof typeof M.en>>;
type UploadFormat = 'xlsx' | 'csv';

export type ExcelTarget =
  | { kind: 'marks'; courseId: number; label: string; assessments: Assessment[]; canEdit: boolean; defaultAssessmentId?: number | null }
  | { kind: 'attendance'; classId: number; className: string; date: string }
  | { kind: PeopleKind };

const isPeople = (t: ExcelTarget): t is { kind: PeopleKind } => t.kind === 'students' || t.kind === 'teachers' || t.kind === 'parents';
const FORMAT_NAME: Record<FileFormat, string> = { xlsx: 'Excel', csv: 'CSV', pdf: 'PDF' };
const ACCEPT: Record<UploadFormat, string> = {
  xlsx: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: '.csv,text/csv',
};

type Open = { what: 'template'; format: UploadFormat } | { what: 'import'; format: UploadFormat } | { what: 'export'; format: FileFormat } | null;

/**
 * One "Import/Export" button with a menu: import from CSV or Excel, export to CSV, Excel or PDF, and download a CSV or
 * Excel template. Used on the gradebook, attendance, students, teachers and parents pages.
 */
export function ImportExportMenu({ target }: { target: ExcelTarget }) {
  const t = useT(M);
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useDismiss(menuOpen, () => setMenuOpen(false), wrap, button);
  const canEdit = target.kind !== 'marks' || target.canEdit;

  const run = async (next: Exclude<Open, null>) => {
    setMenuOpen(false);
    // Files that need no further choices download straight away.
    const direct =
      (next.what === 'export' && (target.kind === 'marks' || isPeople(target))) ||
      (next.what === 'template' && isPeople(target));
    if (!direct) return setOpen(next);
    try {
      if (target.kind === 'marks') await api.download('/imports/marks/export', { courseId: target.courseId, format: next.format });
      else await api.download(`/imports/${target.kind}/${next.what}`, { format: next.format });
      toast.success(next.what === 'export' ? t('exported') : t('downloaded'), next.what === 'template' ? t('downloadedHint') : undefined);
    } catch (err) {
      toast.error(err);
    }
  };

  const item = (icon: React.ReactNode, label: string, next: Exclude<Open, null>) => (
    <button type="button" role="menuitem" className="menu-item" onClick={() => run(next)}>{icon}{label}</button>
  );

  return (
    <div ref={wrap} className="ie-menu-wrap">
      <Button
        ref={button}
        icon={<ArrowLeftRight size={17} />}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        className="ie-menu-button"
      >
        {t('menu')} <ChevronDown size={15} aria-hidden />
      </Button>
      {menuOpen && (
        <div className="popover ie-menu" role="menu" aria-label={t('menu')}>
          {canEdit && (
            <>
              <div className="popover-label">{t('importGroup')}</div>
              {item(<FileText size={17} aria-hidden />, t('importCsv'), { what: 'import', format: 'csv' })}
              {item(<FileSpreadsheet size={17} aria-hidden />, t('importExcel'), { what: 'import', format: 'xlsx' })}
              <div className="menu-divider" />
            </>
          )}
          <div className="popover-label">{t('exportGroup', { what: t(`what_${target.kind}`) })}</div>
          {item(<FileText size={17} aria-hidden />, t('exportCsv'), { what: 'export', format: 'csv' })}
          {item(<FileSpreadsheet size={17} aria-hidden />, t('exportExcel'), { what: 'export', format: 'xlsx' })}
          {item(<FileDown size={17} aria-hidden />, t('exportPdf'), { what: 'export', format: 'pdf' })}
          {canEdit && (
            <>
              <div className="menu-divider" />
              <div className="popover-label">{t('templateGroup')}</div>
              {item(<Download size={17} aria-hidden />, t('templateCsv'), { what: 'template', format: 'csv' })}
              {item(<Sheet size={17} aria-hidden />, t('templateExcel'), { what: 'template', format: 'xlsx' })}
            </>
          )}
        </div>
      )}
      {open?.what === 'template' && !isPeople(target) && <TemplateDialog target={target} format={open.format} onClose={() => setOpen(null)} />}
      {open?.what === 'import' && <ImportDialog target={target} format={open.format} onClose={() => setOpen(null)} />}
      {open?.what === 'export' && target.kind === 'attendance' && <ExportDialog target={target} format={open.format} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Choose the assessment (by term) for a marks file, or the date for an attendance file. */
function ContextFields({ target, assessmentId, setAssessmentId, date, setDate, t }: {
  target: ExcelTarget; assessmentId: number | null; setAssessmentId: (id: number | null) => void; date: string; setDate: (d: string) => void; t: T;
}) {
  const terms = useQuery({ queryKey: ['terms'], queryFn: () => api.get<Term[]>('/terms'), enabled: target.kind === 'marks' });
  const [termId, setTermId] = useState<string>('');
  if (isPeople(target)) return null;
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
  const query: Record<string, string | number | null> = target.kind === 'marks' ? { assessmentId }
    : target.kind === 'attendance' ? { classId: target.classId, date } : {};
  const ready = target.kind === 'marks' ? assessmentId !== null : target.kind === 'attendance' ? !!date : true;
  return { assessmentId, setAssessmentId, date, setDate, query, ready };
}

function TemplateDialog({ target, format, onClose }: { target: Exclude<ExcelTarget, { kind: PeopleKind }>; format: UploadFormat; onClose: () => void }) {
  const t = useT(M);
  const toast = useToast();
  const ctx = useContextState(target);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await api.download(`/imports/${target.kind}/template`, { ...ctx.query, format });
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
      title={`${t('templateTitle')} · ${FORMAT_NAME[format]}`}
      description={target.kind === 'marks' ? `${target.label} · ${t('templateMarksDesc')}` : `${target.className} · ${t('templateAttDesc')}`}
      onSubmit={download}
      footer={<><Button onClick={onClose}>{t('cancel')}</Button><Button type="submit" variant="primary" icon={<Download size={17} />} loading={busy} disabled={!ctx.ready}>{t('download')}</Button></>}
    >
      <ContextFields target={target} {...ctx} t={t} />
    </Modal>
  );
}

function ExportDialog({ target, format, onClose }: { target: Extract<ExcelTarget, { kind: 'attendance' }>; format: FileFormat; onClose: () => void }) {
  const t = useT(M);
  const toast = useToast();
  const [to, setTo] = useState(target.date);
  const [from, setFrom] = useState(() => new Date(Date.parse(target.date) - 30 * 864e5).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api.download('/imports/attendance/export', { classId: target.classId, from, to, format });
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
      title={`${t('exportTitle')} · ${FORMAT_NAME[format]}`}
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

function ImportDialog({ target, format, onClose }: { target: ExcelTarget; format: UploadFormat; onClose: () => void }) {
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

  const mime = (f: File) => f.type || (f.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const url = (step: 'preview' | 'commit', extra: Record<string, string> = {}) => {
    const params = Object.fromEntries(Object.entries(ctx.query).filter(([, v]) => v !== null && v !== '').map(([k, v]) => [k, String(v)]));
    return `/imports/${target.kind}/${step}?${new URLSearchParams({ ...params, ...extra })}`;
  };

  const check = async (refresh = false) => {
    if (!file) { setFileError(t('chooseFile')); return; }
    setBusy('check');
    setFileError(null);
    try {
      const p = await api.upload<ImportPreview>('POST', url('preview'), file, mime(file));
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
      }), file, mime(file));
      setResult(res);
      // Totals, averages, lists, dashboards and reports all read from what was just saved.
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

  if (result) return <ImportDone result={result} onClose={onClose} t={t} />;

  const peopleKey = isPeople(target) ? t(`key_${target.kind}`) : '';
  const body = !preview ? (
    <div className="stack">
      <ContextFields target={target} {...ctx} t={t} />
      <Field label={t('file', { format: FORMAT_NAME[format] })} hint={t('fileHint')} error={fileError ?? undefined}>
        <Input ref={fileRef} type="file" accept={ACCEPT[format]} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFileError(null); }} />
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
      title={preview ? t('review') : t('importTitle', { format: FORMAT_NAME[format] })}
      description={preview ? preview.title : isPeople(target) ? t('importPeopleDesc', { key: peopleKey }) : t('importDesc')}
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

function ImportDone({ result, onClose, t }: { result: ImportResult; onClose: () => void; t: T }) {
  const nothing = result.created + result.updated === 0;
  const accounts = result.accounts ?? [];
  const downloadAccounts = () => downloadCsv(
    `sign-in-details-${new Date().toISOString().slice(0, 10)}`,
    [t('csvName'), t('csvEmail'), t('csvId'), t('csvPassword')],
    accounts.map((a) => [a.name, a.email, a.identifier, a.temporaryPassword]),
  );
  return (
    <Modal open onClose={onClose} title={t('doneTitle')} size={accounts.length ? 'lg' : 'md'} footer={<Button variant="primary" onClick={onClose}>{t('done')}</Button>}>
      <div role="status" className="stack">
        <span className="empty-icon" style={{ margin: 0, background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden><CheckCircle2 size={24} /></span>
        <p className="bold">{result.title}</p>
        {nothing ? <p className="muted">{t('nothingSaved')}</p> : (
          <StatGroup>
            <StatCard icon={<CheckCircle2 size={16} />} label={t('newRecords')} value={result.created} tone="success" />
            <StatCard icon={<RefreshCw size={16} />} label={t('changed')} value={result.updated} tone="info" />
            <StatCard icon={<Info size={16} />} label={t('unchanged')} value={result.unchanged} tone="primary" />
          </StatGroup>
        )}
        {accounts.length > 0 && (
          <Alert tone="warning" icon={<KeyRound size={20} />} title={accounts.length === 1 ? t('accountsTitleOne') : t('accountsTitle', { n: accounts.length })}>
            <p>{t('accountsBody')}</p>
            <div className="mt-1"><Button size="sm" icon={<Download size={15} />} onClick={downloadAccounts}>{t('downloadAccounts')}</Button></div>
          </Alert>
        )}
      </div>
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
    [t('csvRow'), t('csvId'), t('csvName'), t('csvColumn'), t('csvProblem')],
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
            <div className="title small">{r.studentName} {r.admissionNo && <span className="muted">· {r.admissionNo}</span>}</div>
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
