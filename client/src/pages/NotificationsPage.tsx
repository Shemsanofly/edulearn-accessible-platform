import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification, Paginated } from '../../../shared/types';
import { NotificationIcon } from '../components/NotificationBell';
import { useToast } from '../components/Toast';
import { Button, Card, CardSkeleton, EmptyState, ErrorState, PageHeader, Pagination, Segmented, cx } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, relativeTime } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    desc: 'Absences, results, fee updates, new assignments and school news — all in one place.',
    all: 'All', unread: 'Unread', filter: 'Show', emptyUnread: 'No unread notifications', emptyAll: 'No notifications yet',
    emptyHint: 'You’ll be notified here about attendance, results, fees and announcements.', allRead: 'All notifications marked as read',
    unreadLabel: 'Unread',
  },
  sw: {
    desc: 'Utoro, matokeo, taarifa za ada, kazi mpya na habari za shule — vyote mahali pamoja.',
    all: 'Zote', unread: 'Hazijasomwa', filter: 'Onyesha', emptyUnread: 'Hakuna arifa ambazo hazijasomwa', emptyAll: 'Bado hakuna arifa',
    emptyHint: 'Utapata arifa hapa kuhusu mahudhurio, matokeo, ada na matangazo.', allRead: 'Arifa zote zimewekwa kama zimesomwa',
    unreadLabel: 'Haijasomwa',
  },
};

type Filter = 'all' | 'unread';

export function NotificationsPage() {
  const t = useT(M);
  const { t: tc } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filter]);

  const q = useQuery({
    queryKey: ['notifications', 'page', { filter, page }],
    queryFn: () => api.get<Paginated<AppNotification>>('/notifications', { unread: filter === 'unread' ? 'true' : undefined, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      refresh();
      toast.success(t('allRead'));
    },
    onError: (err) => toast.error(err),
  });

  const open = async (n: AppNotification) => {
    if (!n.readAt) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {});
      refresh();
    }
    if (n.link) navigate(n.link);
  };

  const hasUnread = q.data?.items.some((n) => !n.readAt);

  return (
    <>
      <PageHeader
        title={tc('notifications')}
        description={t('desc')}
        actions={<Button icon={<CheckCheck size={16} />} loading={markAll.isPending} onClick={() => markAll.mutate()} disabled={!hasUnread && filter === 'all'}>{tc('markAllRead')}</Button>}
      />
      <Card>
        <div className="toolbar">
          <Segmented<Filter> label={t('filter')} value={filter} onChange={setFilter} options={[{ value: 'all', label: t('all') }, { value: 'unread', label: t('unread') }]} />
        </div>
        {q.isLoading ? (
          <div className="card-body"><CardSkeleton rows={6} /></div>
        ) : q.error ? (
          <div className="card-body"><ErrorState error={q.error} onRetry={q.refetch} /></div>
        ) : !q.data?.items.length ? (
          <EmptyState icon={<BellOff size={26} />} title={filter === 'unread' ? t('emptyUnread') : t('emptyAll')}>{t('emptyHint')}</EmptyState>
        ) : (
          <ul className="list" style={{ opacity: q.isFetching ? 0.7 : 1, transition: 'opacity 150ms' }}>
            {q.data.items.map((n) => (
              <li key={n.id}>
                <button type="button" className={cx('notif-item', !n.readAt && 'unread')} onClick={() => open(n)}>
                  <NotificationIcon type={n.type} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="title" style={{ display: 'block' }}>{n.title}</span>
                    {n.body && <span className="body" style={{ display: 'block' }}>{n.body}</span>}
                    <span className="time" style={{ display: 'block' }} title={formatDateTime(n.createdAt)}>{relativeTime(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="notif-dot" aria-label={t('unreadLabel')} />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
