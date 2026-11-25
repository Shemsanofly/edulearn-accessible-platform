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
import { apiFieldErrors } from './StudentsPage';

const AUDIENCE: Record<Audience, { label: string; tone: Tone }> = {
  everyone: { label: 'Everyone', tone: 'primary' },
  staff: { label: 'Staff', tone: 'accent' },
  students: { label: 'Students', tone: 'info' },
  parents: { label: 'Parents', tone: 'success' },
  class: { label: 'Class', tone: 'warning' },
};

type Filter = 'all' | Audience;

export function AnnouncementsPage() {
  const user = useUser();
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
    return [{ value: 'all' as Filter, label: 'All' }, ...(Object.keys(AUDIENCE) as Audience[]).filter((a) => present.has(a)).map((a) => ({ value: a as Filter, label: AUDIENCE[a].label }))];
  }, [data]);

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
      toast.success(a.pinned ? 'Unpinned' : 'Pinned to the top');
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (a: Announcement) => {
    const ok = await confirm({ title: 'Delete this announcement?', message: `“${a.title}” will be removed for everyone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.del(`/announcements/${a.id}`);
      toast.success('Announcement deleted');
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Announcements"
        description={canPost ? 'News and notices for the school community.' : 'News and notices from your school.'}
        actions={canPost && <Button variant="primary" icon={<Plus size={18} />} onClick={() => setComposeOpen(true)}>New announcement</Button>}
      />
      <div className="row row-wrap between mb-2">
        {filters.length > 2 ? <Segmented label="Filter by audience" options={filters} value={filter} onChange={setFilter} /> : <span />}
        <div style={{ minWidth: 240, flex: '0 1 320px' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search announcements" label="Search announcements" />
        </div>
      </div>

      {isLoading ? (
        <div className="stack">{[0, 1, 2].map((i) => <CardSkeleton key={i} rows={3} />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone size={26} />} title={data?.length ? 'Nothing matches that filter' : 'No announcements yet'} action={canPost && !data?.length && <Button variant="primary" icon={<Plus size={17} />} onClick={() => setComposeOpen(true)}>Post the first one</Button>}>
            {data?.length ? 'Try another audience or search term.' : 'When the school posts news, it will appear here.'}
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
                    <Avatar name={a.authorName ?? 'School Office'} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row row-wrap" style={{ gap: 8 }}>
                        {a.pinned && <Badge tone="warning"><Pin size={12} aria-hidden /> Pinned</Badge>}
                        <Badge tone={meta.tone}>{a.audience === 'class' ? a.className ?? 'Class' : meta.label}</Badge>
                      </div>
                      <h2 id={`ann-${a.id}`} className="mt-1" style={{ fontSize: '1.1rem' }}>{a.title}</h2>
                      <div className="tiny muted">
                        {a.authorName ?? 'School office'} · <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>{relativeTime(a.createdAt)}</time>
                      </div>
                      <p className="pre-wrap mt-1">{a.body}</p>
                    </div>
                    <div className="row" style={{ gap: 2 }}>
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" iconOnly aria-label={a.pinned ? 'Unpin announcement' : 'Pin announcement'} title={a.pinned ? 'Unpin' : 'Pin to top'} icon={a.pinned ? <PinOff size={16} /> : <Pin size={16} />} onClick={() => togglePin(a)} />
                      )}
                      {canDelete && <Button variant="ghost" size="sm" iconOnly aria-label="Delete announcement" title="Delete" icon={<Trash size={16} />} className="text-danger" onClick={() => remove(a)} />}
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
      toast.success('Announcement posted');
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
    if (!form.title.trim()) e.title = 'Add a short headline';
    if (!form.body.trim()) e.body = 'Write the announcement';
    if (form.audience === 'class' && !form.classId) e.classId = 'Choose which class should see this';
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
      title="New announcement"
      description={isAdmin ? 'Choose who should see it.' : 'Teachers post announcements to their own classes. Students and their parents will see it.'}
      onSubmit={submit}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<Megaphone size={16} />} loading={mutation.isPending}>Post announcement</Button></>}
    >
      <div className="form-grid">
        {isAdmin ? (
          <Field label="Audience" required error={errors.audience}>
            <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as Audience })}>
              <option value="everyone">Everyone</option>
              <option value="staff">Staff only</option>
              <option value="students">All students</option>
              <option value="parents">All parents</option>
              <option value="class">One class</option>
            </Select>
          </Field>
        ) : null}
        {form.audience === 'class' && (
          <Field label="Class" required error={errors.classId} className={isAdmin ? undefined : 'span-2'}>
            <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">{classes?.length === 0 ? 'You have no classes' : 'Choose a class…'}</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Headline" required error={errors.title} className="span-2">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} data-autofocus />
        </Field>
        <Field label="Message" required error={errors.body} className="span-2" hint={`${form.body.length}/5000`}>
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={7} maxLength={5000} />
        </Field>
        {isAdmin && (
          <div className="span-2">
            <Toggle label="Pin to the top" description="Pinned announcements stay first on everyone’s dashboard" checked={form.pinned} onChange={(v) => setForm({ ...form, pinned: v })} />
          </div>
        )}
      </div>
    </Modal>
  );
}
