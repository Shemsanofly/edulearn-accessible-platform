import { useQuery } from '@tanstack/react-query';
import { Download, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AuditEntry, Paginated } from '../../../shared/types';
import {
  Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, PageHeader, Pagination, PersonCell, SearchInput, Select, useDebounced,
} from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, relativeTime, todayIso, type Tone } from '../lib/format';
import { downloadCsv } from '../lib/export';
import { useI18n, useT } from '../lib/i18n';

const ENTITIES = [
  'student', 'teacher', 'parent', 'user', 'class', 'course', 'subject', 'term', 'academic_year', 'grading_scale', 'exam',
  'invoice', 'payment', 'fee_structure', 'timetable', 'announcement', 'school', 'enquiry', 'assessment',
] as const;
const ACTIONS = [
  'create', 'update', 'delete', 'publish', 'unpublish', 'reset_password', 'activate', 'deactivate', 'payment', 'apply', 'remind', 'settings',
] as const;

const M = {
  en: {
    title: 'Audit log', desc: 'A permanent record of important administrative actions: who did what, and when.',
    entity: 'Area', allEntities: 'All areas', action: 'Action', allActions: 'All actions', searchPh: 'Search summaries or people',
    when: 'When', who: 'Who', what: 'What happened', empty: 'No activity matches these filters', emptyAll: 'No activity recorded yet',
    system: 'System', export: 'Export this page (CSV)',
    e_student: 'Students', e_teacher: 'Teachers', e_parent: 'Parents', e_user: 'User accounts', e_class: 'Classes', e_course: 'Class subjects',
    e_subject: 'Subjects', e_term: 'Terms', e_academic_year: 'Academic years', e_grading_scale: 'Grading', e_exam: 'Examinations',
    e_invoice: 'Invoices', e_payment: 'Payments', e_fee_structure: 'Fee structures', e_timetable: 'Timetable', e_announcement: 'Announcements',
    e_school: 'School settings', e_enquiry: 'Enquiries', e_assessment: 'Assessments',
    a_create: 'Created', a_update: 'Updated', a_delete: 'Deleted', a_publish: 'Published', a_unpublish: 'Unpublished',
    a_reset_password: 'Password reset', a_activate: 'Activated', a_deactivate: 'Deactivated', a_payment: 'Payment', a_apply: 'Applied',
    a_remind: 'Reminder', a_settings: 'Settings',
  },
  sw: {
    title: 'Kumbukumbu za shughuli', desc: 'Kumbukumbu ya kudumu ya shughuli muhimu za utawala: nani alifanya nini, na lini.',
    entity: 'Eneo', allEntities: 'Maeneo yote', action: 'Kitendo', allActions: 'Vitendo vyote', searchPh: 'Tafuta muhtasari au watu',
    when: 'Lini', who: 'Nani', what: 'Kilichotokea', empty: 'Hakuna shughuli zinazolingana na vichujio hivi', emptyAll: 'Bado hakuna shughuli zilizorekodiwa',
    system: 'Mfumo', export: 'Hamisha ukurasa huu (CSV)',
    e_student: 'Wanafunzi', e_teacher: 'Walimu', e_parent: 'Wazazi', e_user: 'Akaunti', e_class: 'Madarasa', e_course: 'Masomo ya darasa',
    e_subject: 'Masomo', e_term: 'Mihula', e_academic_year: 'Miaka ya masomo', e_grading_scale: 'Madaraja', e_exam: 'Mitihani',
    e_invoice: 'Ankara', e_payment: 'Malipo', e_fee_structure: 'Muundo wa ada', e_timetable: 'Ratiba', e_announcement: 'Matangazo',
    e_school: 'Mipangilio ya shule', e_enquiry: 'Maulizo', e_assessment: 'Tathmini',
    a_create: 'Imeundwa', a_update: 'Imesasishwa', a_delete: 'Imefutwa', a_publish: 'Imetolewa', a_unpublish: 'Imeondolewa',
    a_reset_password: 'Nenosiri limewekwa upya', a_activate: 'Imewashwa', a_deactivate: 'Imesitishwa', a_payment: 'Malipo', a_apply: 'Imetozwa',
    a_remind: 'Kikumbusho', a_settings: 'Mipangilio',
  },
};

type Key = keyof typeof M.en;
const ACTION_TONE: Record<string, Tone> = {
  create: 'success', update: 'info', delete: 'danger', publish: 'success', unpublish: 'warning', reset_password: 'warning',
  activate: 'success', deactivate: 'danger', payment: 'primary', apply: 'accent', remind: 'accent', settings: 'neutral',
};

export function AuditLogPage() {
  const t = useT(M);
  const { t: tc } = useI18n();
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [entity, action, debounced]);

  const label = (prefix: 'e_' | 'a_', key: string) => {
    const k = `${prefix}${key}` as Key;
    return k in M.en ? t(k) : key;
  };

  const q = useQuery({
    queryKey: ['audit-logs', { entity, action, search: debounced, page }],
    queryFn: () => api.get<Paginated<AuditEntry>>('/audit-logs', { entity, action, search: debounced, page, pageSize: 25 }),
    placeholderData: (prev) => prev,
  });

  const exportCsv = () => {
    if (!q.data) return;
    downloadCsv(`audit-log-${todayIso()}`, [t('when'), t('who'), t('action'), t('entity'), 'ID', t('what')], q.data.items.map((e) => [
      formatDateTime(e.createdAt), e.actorName ?? t('system'), label('a_', e.action), label('e_', e.entity), e.entityId, e.summary,
    ]));
  };

  const filtered = !!(entity || action || debounced);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={<Button icon={<Download size={16} />} onClick={exportCsv} disabled={!q.data?.items.length}>{t('export')}</Button>}
      />
      <Card>
        <div className="toolbar">
          <Select aria-label={t('entity')} value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">{t('allEntities')}</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{label('e_', e)}</option>)}
          </Select>
          <Select aria-label={t('action')} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t('allActions')}</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{label('a_', a)}</option>)}
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder={t('searchPh')} label={tc('search')} />
        </div>
        {q.isLoading ? (
          <div className="card-body"><CardSkeleton rows={8} /></div>
        ) : q.error ? (
          <div className="card-body"><ErrorState error={q.error} onRetry={q.refetch} /></div>
        ) : !q.data?.items.length ? (
          <EmptyState icon={<History size={26} />} title={filtered ? t('empty') : t('emptyAll')} />
        ) : (
          <div className="table-wrap" style={{ opacity: q.isFetching ? 0.7 : 1, transition: 'opacity 150ms' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('when')}</th>
                  <th scope="col">{t('who')}</th>
                  <th scope="col">{t('action')}</th>
                  <th scope="col">{t('entity')}</th>
                  <th scope="col">{t('what')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>{relativeTime(e.createdAt)}</time>
                      <div className="tiny muted">{formatDateTime(e.createdAt)}</div>
                    </td>
                    <td>{e.actorName ? <PersonCell name={e.actorName} /> : <span className="muted">{t('system')}</span>}</td>
                    <td><Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{label('a_', e.action)}</Badge></td>
                    <td className="small">{label('e_', e.entity)}{e.entityId && <span className="tiny muted mono"> #{e.entityId}</span>}</td>
                    <td>{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
