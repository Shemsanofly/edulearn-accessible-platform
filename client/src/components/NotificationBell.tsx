import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BookOpen, CheckCheck, ClipboardCheck, Info, Megaphone, MessageSquare, NotebookPen, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification, Notifications, NotificationType, Paginated } from '../../../shared/types';
import { api } from '../lib/api';
import { relativeTime, type Tone } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Button, cx } from './ui';

export const NOTIFICATION_STYLE: Record<NotificationType, { icon: typeof Bell; tone: Tone }> = {
  attendance: { icon: ClipboardCheck, tone: 'warning' },
  results: { icon: NotebookPen, tone: 'success' },
  fees: { icon: Wallet, tone: 'info' },
  announcement: { icon: Megaphone, tone: 'primary' },
  assignment: { icon: BookOpen, tone: 'accent' },
  message: { icon: MessageSquare, tone: 'primary' },
  system: { icon: Info, tone: 'neutral' },
};

export function NotificationIcon({ type }: { type: NotificationType }) {
  const { icon: Icon, tone } = NOTIFICATION_STYLE[type];
  return (
    <span className={cx('icon', tone !== 'neutral' && `tone-${tone}`)} aria-hidden>
      <Icon size={17} />
    </span>
  );
}

/** Bell in the top bar: unread count, the latest notifications, and quick "mark all read". */
export function NotificationBell({ counts }: { counts: Notifications | undefined }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const unread = counts?.unreadNotifications ?? 0;

  const list = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: () => api.get<Paginated<AppNotification>>('/notifications', { pageSize: 8 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => {});
    refresh();
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await api.post('/notifications/read-all');
    refresh();
  };

  return (
    <div ref={ref} className="icon-badge-wrap" style={{ position: 'relative' }}>
      <Button
        variant="ghost"
        iconOnly
        aria-label={unread ? `${t('notifications')}, ${t('unread', { n: unread })}` : t('notifications')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        icon={<Bell size={20} />}
      />
      {unread > 0 && <span className="dot-count" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
      {open && (
        <div className="popover notif-panel" role="dialog" aria-label={t('notifications')}>
          <div className="notif-head">
            <strong>{t('notifications')}</strong>
            {unread > 0 && <Button size="sm" variant="ghost" icon={<CheckCheck size={15} />} onClick={markAll}>{t('markAllRead')}</Button>}
          </div>
          <div className="notif-list">
            {list.isLoading && <div className="empty small">{t('loading')}</div>}
            {list.data?.items.length === 0 && <div className="empty small">{t('noNotifications')}</div>}
            {list.data?.items.map((n) => (
              <button key={n.id} type="button" className={cx('notif-item', !n.readAt && 'unread')} onClick={() => openItem(n)}>
                <NotificationIcon type={n.type} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="title" style={{ display: 'block' }}>{n.title}</span>
                  {n.body && <span className="body" style={{ display: 'block' }}>{n.body}</span>}
                  <span className="time" style={{ display: 'block' }}>{relativeTime(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="notif-dot" aria-label="Unread" />}
              </button>
            ))}
          </div>
          <div style={{ padding: 8 }}>
            <Button block variant="ghost" onClick={() => { setOpen(false); navigate('/notifications'); }}>{t('viewAll')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
