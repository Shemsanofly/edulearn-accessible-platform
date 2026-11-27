import { RecordExcelPanel } from '../components/ExcelTools';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pin, PinOff, Plus, Trash } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Announcement, AnnouncementInput, Audience, ClassListItem } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, SearchInput, Segmented,
  Select, Textarea, Toggle,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDateTime, relativeTime, type Tone } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { apiFieldErrors } from './StudentsPage';

const M = {
  en: {
    aEveryone: 'Everyone', aStaff: 'Staff', aStudents: 'Students', aParents: 'Parents', aClass: 'Class',
    descStaff: 'News and notices for the school community.',
    descFamily: 'News and notices from your school.',
    newAnnouncement: 'New announcement',
    filterAudience: 'Filter by audience',
    searchAnnouncements: 'Search announcements',
    unpinned: 'Unpinned', pinned: 'Pinned to the top',
    deleteTitle: 'Delete this announcement?',
    deleteMessage: '“{title}” will be removed for everyone.',
    deletedToast: 'Announcement deleted',
    noMatch: 'Nothing matches that filter', noneYet: 'No announcements yet',
    postFirst: 'Post the first one',
    noMatchBody: 'Try another audience or search term.',
    noneYetBody: 'When the school posts news, it will appear here.',
    pinnedBadge: 'Pinned', schoolOffice: 'School office',
    unpin: 'Unpin announcement', pin: 'Pin announcement', unpinShort: 'Unpin', pinShort: 'Pin to top',
    deleteAnnouncement: 'Delete announcement',
    posted: 'Announcement posted',
    eTitle: 'Add a short headline', eBody: 'Write the announcement', eClass: 'Choose which class should see this',
    descAdmin: 'Choose who should see it.',
    descTeacher: 'Teachers post announcements to their own classes. Students and their parents will see it.',
    post: 'Post announcement',
    audience: 'Audience', staffOnly: 'Staff only', allStudents: 'All students', allParents: 'All parents', oneClass: 'One class',
    noClasses: 'You have no classes', chooseClass: 'Choose a class…',
    headline: 'Headline', message: 'Message',
    pinTop: 'Pin to the top', pinHint: 'Pinned announcements stay first on everyone’s dashboard',
  },
  sw: {
    aEveryone: 'Wote', aStaff: 'Wafanyakazi', aStudents: 'Wanafunzi', aParents: 'Wazazi', aClass: 'Darasa',
    descStaff: 'Habari na matangazo kwa jumuiya ya shule.',
    descFamily: 'Habari na matangazo kutoka shuleni kwako.',
    newAnnouncement: 'Tangazo jipya',
    filterAudience: 'Chuja kwa walengwa',
    searchAnnouncements: 'Tafuta matangazo',
    unpinned: 'Limeondolewa juu', pinned: 'Limebandikwa juu',
    deleteTitle: 'Futa tangazo hili?',
    deleteMessage: '“{title}” litaondolewa kwa kila mtu.',
    deletedToast: 'Tangazo limefutwa',
    noMatch: 'Hakuna tangazo linalolingana', noneYet: 'Bado hakuna matangazo',
    postFirst: 'Weka tangazo la kwanza',
    noMatchBody: 'Jaribu walengwa wengine au neno lingine la kutafuta.',
    noneYetBody: 'Shule ikitoa habari, zitaonekana hapa.',
    pinnedBadge: 'Limebandikwa', schoolOffice: 'Ofisi ya shule',
    unpin: 'Ondoa tangazo juu', pin: 'Bandika tangazo juu', unpinShort: 'Ondoa juu', pinShort: 'Bandika juu',
    deleteAnnouncement: 'Futa tangazo',
    posted: 'Tangazo limewekwa',
    eTitle: 'Andika kichwa kifupi', eBody: 'Andika tangazo', eClass: 'Chagua darasa litakaloliona',
    descAdmin: 'Chagua nani aone tangazo hili.',
    descTeacher: 'Walimu huweka matangazo kwa madarasa yao. Wanafunzi na wazazi wao wataliona.',
    post: 'Weka tangazo',
    audience: 'Walengwa', staffOnly: 'Wafanyakazi tu', allStudents: 'Wanafunzi wote', allParents: 'Wazazi wote', oneClass: 'Darasa moja',
    noClasses: 'Huna madarasa', chooseClass: 'Chagua darasa…',
    headline: 'Kichwa cha habari', message: 'Ujumbe',
    pinTop: 'Bandika juu', pinHint: 'Matangazo yaliyobandikwa hukaa juu kwenye dashibodi ya kila mtu',
  },
};
type MKey = keyof typeof M.en;

const AUDIENCE: Record<Audience, { label: MKey; tone: Tone }> = {
  everyone: { label: 'aEveryone', tone: 'primary' },
  staff: { label: 'aStaff', tone: 'accent' },
  students: { label: 'aStudents', tone: 'info' },
  parents: { label: 'aParents', tone: 'success' },
  class: { label: 'aClass', tone: 'warning' },
};

type Filter = 'all' | Audience;

export function AnnouncementsPage() {
  const user = useUser();
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const canPost = user.role === 'admin' || user.role === 'teacher';

  useEffect(() => {
    if (canPost && params.get('new') === '1') setComposeOpen(true);
  }, [params, canPost]);

  const closeCompose = () => {
    setComposeOpen(false);
    if (params.has('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  };

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['announcements'], queryFn: () => api.get<Announcement[]>('/announcements') });

  // Only offer filters for audiences that actually appear.
  const filters = useMemo(() => {
    const present = new Set((data ?? []).map((a) => a.audience));
    return [{ value: 'all' as Filter, label: c('all') }, ...(Object.keys(AUDIENCE) as Audience[]).filter((a) => present.has(a)).map((a) => ({ value: a as Filter, label: t(AUDIENCE[a].label) }))];
  }, [data, t, c]);

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data ?? []).filter((a) => (filter === 'all' || a.audience === filter) && (!needle || `${a.title} ${a.body}`.toLowerCase().includes(needle)));
  }, [data, filter, search]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['announcements'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const togglePin = async (a: Announcement) => {
    try {
      await api.patch(`/announcements/${a.id}`, { pinned: !a.pinned });
      toast.success(a.pinned ? t('unpinned') : t('pinned'));
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (a: Announcement) => {
    const ok = await confirm({ title: t('deleteTitle'), message: t('deleteMessage', { title: a.title }), confirmLabel: c('delete'), danger: true });
    if (!ok) return;
    try {
      await api.del(`/announcements/${a.id}`);
      toast.success(t('deletedToast'));
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHeader
        title={c('announcements')}
        description={canPost ? t('descStaff') : t('descFamily')}
        actions={canPost && <Button variant="primary" icon={<Plus size={18} />} onClick={() => setComposeOpen(true)}>{t('newAnnouncement')}</Button>}
      />
      {canPost && <RecordExcelPanel areas={[{ resource: 'announcements', label: 'Announcements' }]} />}
      <div className="row row-wrap between mb-2">
        {filters.length > 2 ? <Segmented label={t('filterAudience')} options={filters} value={filter} onChange={setFilter} /> : <span />}
        <div style={{ minWidth: 240, flex: '0 1 320px' }}>
          <SearchInput value={search} onChange={setSearch} placeholder={t('searchAnnouncements')} label={t('searchAnnouncements')} />
        </div>
      </div>

      {isLoading ? (
        <div className="stack">{[0, 1, 2].map((i) => <CardSkeleton key={i} rows={3} />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone size={26} />} title={data?.length ? t('noMatch') : t('noneYet')} action={canPost && !data?.length && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setComposeOpen(true)}>{t('postFirst')}</Button>}>
            {data?.length ? t('noMatchBody') : t('noneYetBody')}
          </EmptyState>
        </Card>
      ) : (
        <div className="stack" aria-live="polite">
          {items.map((a) => {
            const canDelete = user.role === 'admin' || a.authorId === user.id;
            const meta = AUDIENCE[a.audience];
            return (
              <Card key={a.id} as="article" aria-labelledby={`ann-${a.id}`}>
                <div className="card-body">
                  <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
                    <Avatar name={a.authorName ?? t('schoolOffice')} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row row-wrap" style={{ gap: 8 }}>
                        {a.pinned && <Badge tone="warning"><Pin size={12} aria-hidden /> {t('pinnedBadge')}</Badge>}
                        <Badge tone={meta.tone}>{a.audience === 'class' ? a.className ?? t('aClass') : t(meta.label)}</Badge>
                      </div>
                      <h2 id={`ann-${a.id}`} className="mt-1" style={{ fontSize: '1.1rem' }}>{a.title}</h2>
                      <div className="tiny muted">
                        {a.authorName ?? t('schoolOffice')} · <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>{relativeTime(a.createdAt)}</time>
                      </div>
                      <p className="pre-wrap mt-1">{a.body}</p>
                    </div>
                    <div className="row" style={{ gap: 2 }}>
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" iconOnly aria-label={a.pinned ? t('unpin') : t('pin')} title={a.pinned ? t('unpinShort') : t('pinShort')} icon={a.pinned ? <PinOff size={16} /> : <Pin size={16} />} onClick={() => togglePin(a)} />
                      )}
                      {canDelete && <Button variant="ghost" size="sm" iconOnly aria-label={t('deleteAnnouncement')} title={c('delete')} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(a)} />}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {canPost && <ComposeModal open={composeOpen} onClose={closeCompose} />}
    </>
  );
}

function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const t = useT(M);
  const { t: c } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<{ title: string; body: string; audience: Audience; classId: string; pinned: boolean }>({ title: '', body: '', audience: isAdmin ? 'everyone' : 'class', classId: '', pinned: false });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: classes } = useQuery({
    queryKey: ['classes', isAdmin ? 'all' : 'mine'],
    queryFn: () => api.get<ClassListItem[]>('/classes', isAdmin ? undefined : { mine: true }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({ title: '', body: '', audience: isAdmin ? 'everyone' : 'class', classId: '', pinned: false });
  }, [open, isAdmin]);

  // Teachers with a single class don't need to pick it.
  useEffect(() => {
    if (!isAdmin && classes?.length === 1 && !form.classId) setForm((f) => ({ ...f, classId: String(classes[0]!.id) }));
  }, [classes, isAdmin, form.classId]);

  const mutation = useMutation({
    mutationFn: (payload: AnnouncementInput) => api.post<Announcement>('/announcements', payload),
    onSuccess: () => {
      toast.success(t('posted'));
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = t('eTitle');
    if (!form.body.trim()) e.body = t('eBody');
    if (form.audience === 'class' && !form.classId) e.classId = t('eClass');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      classId: form.audience === 'class' ? Number(form.classId) : null,
      pinned: isAdmin ? form.pinned : false,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('newAnnouncement')}
      description={isAdmin ? t('descAdmin') : t('descTeacher')}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button type="submit" variant="primary" icon={<Megaphone size={16} />} loading={mutation.isPending}>{t('post')}</Button></>}
    >
      <div className="form-grid">
        {isAdmin ? (
          <Field label={t('audience')} required error={errors.audience}>
            <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as Audience })}>
              <option value="everyone">{t('aEveryone')}</option>
              <option value="staff">{t('staffOnly')}</option>
              <option value="students">{t('allStudents')}</option>
              <option value="parents">{t('allParents')}</option>
              <option value="class">{t('oneClass')}</option>
            </Select>
          </Field>
        ) : null}
        {form.audience === 'class' && (
          <Field label={c('class')} required error={errors.classId} className={isAdmin ? undefined : 'span-2'}>
            <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">{classes?.length === 0 ? t('noClasses') : t('chooseClass')}</option>
              {classes?.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('headline')} required error={errors.title} className="span-2">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} data-autofocus />
        </Field>
        <Field label={t('message')} required error={errors.body} className="span-2" hint={`${form.body.length}/5000`}>
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={7} maxLength={5000} />
        </Field>
        {isAdmin && (
          <div className="span-2">
            <Toggle label={t('pinTop')} description={t('pinHint')} checked={form.pinned} onChange={(v) => setForm({ ...form, pinned: v })} />
          </div>
        )}
      </div>
    </Modal>
  );
}
