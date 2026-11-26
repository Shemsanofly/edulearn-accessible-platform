import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Inbox, Mail, Phone, PhoneCall, RotateCcw, School } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ContactRequest, Paginated } from '../../../shared/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, PageHeader, Pagination, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, relativeTime, type Tone } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

type Status = ContactRequest['status'];
type Filter = 'all' | Status;

const M = {
  en: {
    title: 'Website enquiries',
    description: 'Messages sent through the contact form on the public website.',
    filterLabel: 'Filter by status',
    statusNew: 'New',
    statusContacted: 'Contacted',
    statusClosed: 'Closed',
    markContacted: 'Mark contacted',
    markClosed: 'Close',
    reopen: 'Reopen',
    reply: 'Reply by email',
    call: 'Call',
    noSchool: 'School not given',
    emptyTitle: 'No enquiries yet',
    emptyText: 'Messages from the contact form on the public website will appear here.',
    emptyFiltered: 'No enquiries with this status',
    updated: 'Enquiry marked as “{status}”',
  },
  sw: {
    title: 'Maulizo kutoka tovuti',
    description: 'Ujumbe uliotumwa kupitia fomu ya mawasiliano kwenye tovuti.',
    filterLabel: 'Chuja kwa hali',
    statusNew: 'Mapya',
    statusContacted: 'Tumewasiliana',
    statusClosed: 'Yamefungwa',
    markContacted: 'Weka: tumewasiliana',
    markClosed: 'Funga',
    reopen: 'Fungua tena',
    reply: 'Jibu kwa barua pepe',
    call: 'Piga simu',
    noSchool: 'Shule haijatajwa',
    emptyTitle: 'Bado hakuna maulizo',
    emptyText: 'Ujumbe kutoka fomu ya mawasiliano kwenye tovuti utaonekana hapa.',
    emptyFiltered: 'Hakuna maulizo yenye hali hii',
    updated: 'Maulizo yamewekwa “{status}”',
  },
};

const STATUS_TONE: Record<Status, Tone> = { new: 'warning', contacted: 'info', closed: 'neutral' };

export function EnquiriesPage() {
  const t = useT(M);
  const { t: tc } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('new');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filter]);

  const statusLabel = (s: Status) => (s === 'new' ? t('statusNew') : s === 'contacted' ? t('statusContacted') : t('statusClosed'));

  const list = useQuery({
    queryKey: ['enquiries', filter, page],
    queryFn: () => api.get<Paginated<ContactRequest>>('/enquiries', { status: filter === 'all' ? undefined : filter, page, pageSize: 10 }),
    placeholderData: (prev) => prev,
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Status }) => api.patch<ContactRequest>(`/enquiries/${id}`, { status }),
    onSuccess: (row) => {
      toast.success(t('updated', { status: statusLabel(row.status) }));
      qc.invalidateQueries({ queryKey: ['enquiries'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err),
  });

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card>
        <div className="toolbar">
          <Segmented<Filter>
            label={t('filterLabel')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'new', label: t('statusNew') },
              { value: 'contacted', label: t('statusContacted') },
              { value: 'closed', label: t('statusClosed') },
              { value: 'all', label: tc('all') },
            ]}
          />
        </div>
        {list.isLoading ? (
          <div className="card-body"><CardSkeleton rows={5} /></div>
        ) : list.error ? (
          <div className="card-body"><ErrorState error={list.error} onRetry={list.refetch} /></div>
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Inbox size={26} />} title={filter === 'all' ? t('emptyTitle') : t('emptyFiltered')}>
            {filter === 'all' ? t('emptyText') : undefined}
          </EmptyState>
        ) : (
          <>
            <ul className="list">
              {list.data.items.map((e) => (
                <li key={e.id} className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div className="grow" style={{ minWidth: 240 }}>
                    <div className="row row-wrap" style={{ gap: 8 }}>
                      <span className="title">{e.fullName}</span>
                      <Badge tone={STATUS_TONE[e.status]} dot>{statusLabel(e.status)}</Badge>
                    </div>
                    <div className="meta row row-wrap" style={{ gap: 14, marginTop: 4 }}>
                      <span className="row" style={{ gap: 5 }}><School size={14} aria-hidden /> {e.schoolName || t('noSchool')}</span>
                      <a href={`mailto:${e.email}`} className="row" style={{ gap: 5 }}><Mail size={14} aria-hidden /> {e.email}</a>
                      {e.phone && <a href={`tel:${e.phone.replace(/\s/g, '')}`} className="row" style={{ gap: 5 }}><Phone size={14} aria-hidden /> {e.phone}</a>}
                      <span title={formatDateTime(e.createdAt)}>{relativeTime(e.createdAt)}</span>
                    </div>
                    <p className="pre-wrap" style={{ marginTop: 10 }}>{e.message}</p>
                  </div>
                  <div className="row row-wrap" style={{ gap: 6 }}>
                    <a className="btn btn-sm" href={`mailto:${e.email}?subject=${encodeURIComponent('EduLearn')}`}>
                      <Mail size={15} aria-hidden /> {t('reply')}
                    </a>
                    {e.phone && (
                      <a className="btn btn-sm" href={`tel:${e.phone.replace(/\s/g, '')}`}>
                        <PhoneCall size={15} aria-hidden /> {t('call')}
                      </a>
                    )}
                    {e.status === 'new' && (
                      <Button size="sm" variant="primary" icon={<CheckCircle2 size={15} />} loading={update.isPending && update.variables?.id === e.id}
                        onClick={() => update.mutate({ id: e.id, status: 'contacted' })}>{t('markContacted')}</Button>
                    )}
                    {e.status === 'contacted' && (
                      <Button size="sm" icon={<CheckCircle2 size={15} />} loading={update.isPending && update.variables?.id === e.id}
                        onClick={() => update.mutate({ id: e.id, status: 'closed' })}>{t('markClosed')}</Button>
                    )}
                    {e.status === 'closed' && (
                      <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} loading={update.isPending && update.variables?.id === e.id}
                        onClick={() => update.mutate({ id: e.id, status: 'new' })}>{t('reopen')}</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
