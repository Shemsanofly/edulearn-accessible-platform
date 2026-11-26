import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Inbox, Mail, PenSquare, Reply, Send, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Contact, Message, MessageInput } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, SearchInput, Segmented,
  Textarea, cx, useDebounced,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDateTime, fullName, relativeTime, ROLE_META } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    deleted: 'Message deleted', onWrote: 'On {date}, {name} wrote:',
    descParent: 'Talk privately with your children’s teachers and the school office.',
    descOther: 'Private messages with staff, students and families.',
    newMessage: 'New message', inbox: 'Inbox', sentMessages: 'Sent messages', sent: 'Sent', mailbox: 'Mailbox',
    inboxEmpty: 'Your inbox is empty', sentEmpty: 'No sent messages',
    inboxEmptyBody: 'Messages from teachers, families and the office will appear here.',
    sentEmptyBody: 'Messages you send will appear here.',
    to: 'To {name}', unreadPrefix: 'Unread: ', select: 'Select a message to read it',
    backInbox: 'Back to inbox', backSent: 'Back to sent', reply: 'Reply', followUp: 'Follow up',
    deleteMessage: 'Delete message', deleteTitle: 'Delete this message?',
    deleteBody: 'It will be removed for both you and the other person.',
    toYou: 'to you', toName: 'to {name}',
    sentToast: 'Message sent',
    eRecipient: 'Choose who to send this to', eSubject: 'Add a subject', eBody: 'Write a message',
    send: 'Send', toLabel: 'To', remove: 'Remove {name}', searchName: 'Search by name', searchPeople: 'Search people to message',
    loadingContacts: 'Loading people you can message…', contactsError: 'Couldn’t load contacts.',
    nobodyMatches: 'Nobody matches “{q}”.', nobody: 'There’s nobody you can message yet.',
    subject: 'Subject', message: 'Message',
  },
  sw: {
    deleted: 'Ujumbe umefutwa', onWrote: 'Tarehe {date}, {name} aliandika:',
    descParent: 'Ongea kwa faragha na walimu wa watoto wako na ofisi ya shule.',
    descOther: 'Ujumbe wa faragha na wafanyakazi, wanafunzi na familia.',
    newMessage: 'Ujumbe mpya', inbox: 'Ujumbe uliopokelewa', sentMessages: 'Ujumbe uliotumwa', sent: 'Uliotumwa', mailbox: 'Sanduku la ujumbe',
    inboxEmpty: 'Huna ujumbe mpya', sentEmpty: 'Hakuna ujumbe uliotumwa',
    inboxEmptyBody: 'Ujumbe kutoka kwa walimu, familia na ofisi utaonekana hapa.',
    sentEmptyBody: 'Ujumbe unaotuma utaonekana hapa.',
    to: 'Kwa {name}', unreadPrefix: 'Haujasomwa: ', select: 'Chagua ujumbe ili kuusoma',
    backInbox: 'Rudi kwenye ujumbe uliopokelewa', backSent: 'Rudi kwenye ujumbe uliotumwa', reply: 'Jibu', followUp: 'Fuatilia',
    deleteMessage: 'Futa ujumbe', deleteTitle: 'Futa ujumbe huu?',
    deleteBody: 'Utaondolewa kwako na kwa mtu mwingine pia.',
    toYou: 'kwako', toName: 'kwa {name}',
    sentToast: 'Ujumbe umetumwa',
    eRecipient: 'Chagua unayemtumia', eSubject: 'Andika kichwa cha ujumbe', eBody: 'Andika ujumbe',
    send: 'Tuma', toLabel: 'Kwa', remove: 'Ondoa {name}', searchName: 'Tafuta kwa jina', searchPeople: 'Tafuta watu wa kuwatumia ujumbe',
    loadingContacts: 'Inapakia watu unaoweza kuwatumia ujumbe…', contactsError: 'Imeshindikana kupakia anwani.',
    nobodyMatches: 'Hakuna anayelingana na “{q}”.', nobody: 'Bado hakuna mtu unayeweza kumtumia ujumbe.',
    subject: 'Kichwa', message: 'Ujumbe',
  },
};

type Box = 'inbox' | 'sent';

function useNarrow(query = '(max-width: 900px)') {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setNarrow(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return narrow;
}

interface ComposeState {
  recipient?: { id: number; name: string; role: Contact['role'] } | null;
  subject?: string;
  body?: string;
}

export function MessagesPage() {
  const user = useUser();
  const t = useT(M);
  const { t: c } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const narrow = useNarrow();
  const [params, setParams] = useSearchParams();
  const [box, setBox] = useState<Box>('inbox');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);

  const q = useQuery({ queryKey: ['messages', box], queryFn: () => api.get<Message[]>('/messages', { box }) });
  const messages = q.data ?? [];
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  // Deep links: ?compose=1 opens the composer, optionally with ?to=<userId>.
  useEffect(() => {
    if (params.get('compose') === '1' || params.get('to')) {
      const to = params.get('to');
      setCompose({ recipient: to ? { id: Number(to), name: '', role: 'teacher' } : null });
      const next = new URLSearchParams(params);
      next.delete('compose');
      next.delete('to');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  // On wide screens, open the newest message automatically.
  useEffect(() => {
    if (!narrow && selectedId === null && messages.length) setSelectedId(messages[0]!.id);
  }, [narrow, selectedId, messages]);

  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/messages/${id}/read`),
    onSuccess: (_d, id) => {
      qc.setQueryData<Message[]>(['messages', 'inbox'], (xs) => xs?.map((m) => (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)));
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    if (selected && box === 'inbox' && !selected.readAt && !markRead.isPending) markRead.mutate(selected.id);
  }, [selected, box]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/messages/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(t('deleted'));
    },
    onError: (err) => toast.error(err),
  });

  const unread = (qc.getQueryData<Message[]>(['messages', 'inbox']) ?? []).filter((m) => !m.readAt).length;
  const showList = !narrow || !selected;
  const showReader = !narrow || !!selected;

  const reply = (m: Message) => {
    const incoming = m.recipientId === user.id;
    setCompose({
      recipient: incoming ? { id: m.senderId, name: m.senderName, role: m.senderRole } : { id: m.recipientId, name: m.recipientName, role: m.recipientRole },
      subject: m.subject.startsWith('Re: ') ? m.subject : `Re: ${m.subject}`,
      body: `\n\n— ${t('onWrote', { date: formatDateTime(m.createdAt), name: m.senderName })}\n${m.body.split('\n').map((l) => `> ${l}`).join('\n')}`,
    });
  };

  return (
    <>
      <PageHeader
        title={c('messages')}
        description={user.role === 'parent' ? t('descParent') : t('descOther')}
        actions={<Button variant="primary" icon={<PenSquare size={17} />} onClick={() => setCompose({})}>{t('newMessage')}</Button>}
      />

      <Card>
        <div className="mail">
          {showList && (
            <div className="mail-list" aria-label={box === 'inbox' ? t('inbox') : t('sentMessages')}>
              <div className="toolbar" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                <Segmented<Box>
                  label={t('mailbox')}
                  value={box}
                  onChange={(b) => { setBox(b); setSelectedId(null); }}
                  options={[
                    { value: 'inbox', label: <><Inbox size={15} aria-hidden /> {t('inbox')}{unread > 0 && <Badge tone="danger">{unread}</Badge>}</> },
                    { value: 'sent', label: <><Send size={15} aria-hidden /> {t('sent')}</> },
                  ]}
                />
              </div>
              {q.isLoading ? (
                <div className="card-body"><CardSkeleton rows={5} /></div>
              ) : q.error ? (
                <div className="card-body"><ErrorState error={q.error} onRetry={q.refetch} /></div>
              ) : messages.length === 0 ? (
                <EmptyState icon={<Mail size={24} />} title={box === 'inbox' ? t('inboxEmpty') : t('sentEmpty')}>
                  {box === 'inbox' ? t('inboxEmptyBody') : t('sentEmptyBody')}
                </EmptyState>
              ) : (
                <ul className="list">
                  {messages.map((m) => {
                    const isUnread = box === 'inbox' && !m.readAt;
                    const who = box === 'inbox' ? m.senderName : t('to', { name: m.recipientName });
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className={cx('mail-item', isUnread && 'unread')}
                          aria-current={m.id === selectedId ? 'true' : undefined}
                          onClick={() => setSelectedId(m.id)}
                        >
                          <div className="row between" style={{ gap: 8 }}>
                            <span className="from small bold truncate">{who}</span>
                            <span className="tiny muted" style={{ flex: 'none' }}>{relativeTime(m.createdAt)}</span>
                          </div>
                          <div className="subject truncate">{isUnread && <span className="sr-only">{t('unreadPrefix')}</span>}{m.subject}</div>
                          <div className="small muted truncate">{m.body.replace(/\s+/g, ' ')}</div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {showReader && (
            <div className="mail-view" aria-live="polite">
              {!selected ? (
                <EmptyState icon={<Mail size={26} />} title={t('select')} />
              ) : (
                <article aria-labelledby="message-subject">
                  {narrow && (
                    <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={() => setSelectedId(null)} style={{ marginBottom: 12 }}>
                      {box === 'inbox' ? t('backInbox') : t('backSent')}
                    </Button>
                  )}
                  <div className="row between row-wrap" style={{ alignItems: 'flex-start' }}>
                    <h2 id="message-subject" style={{ fontSize: '1.25rem' }}>{selected.subject}</h2>
                    <div className="row" style={{ gap: 6 }}>
                      <Button icon={<Reply size={16} />} onClick={() => reply(selected)}>{box === 'inbox' ? t('reply') : t('followUp')}</Button>
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label={t('deleteMessage')}
                        icon={<Trash2 size={17} />}
                        loading={remove.isPending}
                        onClick={async () => {
                          if (await confirm({ title: t('deleteTitle'), message: t('deleteBody'), confirmLabel: c('delete'), danger: true })) remove.mutate(selected.id);
                        }}
                      />
                    </div>
                  </div>
                  <div className="row mt-2" style={{ gap: 12 }}>
                    <Avatar name={selected.senderName} color={ROLE_META[selected.senderRole].color} />
                    <div>
                      <div className="bold">
                        {selected.senderName} <Badge>{c(selected.senderRole)}</Badge>
                      </div>
                      <div className="small muted">
                        {selected.recipientId === user.id ? t('toYou') : t('toName', { name: selected.recipientName })} · {formatDateTime(selected.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="mail-body">{selected.body}</div>
                </article>
              )}
            </div>
          )}
        </div>
      </Card>

      {compose && (
        <ComposeModal
          initial={compose}
          onClose={() => setCompose(null)}
          onSent={() => {
            setBox('sent');
            setSelectedId(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Compose
function ComposeModal({ initial, onClose, onSent }: { initial: ComposeState; onClose: () => void; onSent: () => void }) {
  const t = useT(M);
  const { t: c } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [recipient, setRecipient] = useState(initial.recipient ?? null);
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [body, setBody] = useState(initial.body ?? '');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const contacts = useQuery({
    queryKey: ['contacts', debounced],
    queryFn: () => api.get<Contact[]>('/messages/contacts', { search: debounced }),
    enabled: !recipient || !recipient.name,
  });

  // A deep link only carries the id — fill in the name once contacts load.
  useEffect(() => {
    if (recipient && !recipient.name && contacts.data) {
      const found = contacts.data.find((x) => x.id === recipient.id);
      if (found) setRecipient({ id: found.id, name: fullName(found), role: found.role });
      else if (!debounced) setRecipient(null);
    }
  }, [recipient, contacts.data, debounced]);

  const send = useMutation({
    mutationFn: (m: MessageInput) => api.post<Message>('/messages', m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      toast.success(t('sentToast'), recipient ? t('to', { name: recipient.name }) : undefined);
      onSent();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error(err);
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!recipient) errs.recipientId = t('eRecipient');
    if (!subject.trim()) errs.subject = t('eSubject');
    if (!body.trim()) errs.body = t('eBody');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    send.mutate({ recipientId: recipient!.id, subject: subject.trim(), body: body.trim() });
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t('newMessage')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{c('cancel')}</Button>
          <Button type="submit" variant="primary" icon={<Send size={16} />} loading={send.isPending}>{t('send')}</Button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <span className="field-label" id="recipient-label">{t('toLabel')} <span className="req" aria-hidden>*</span></span>
          {recipient && recipient.name ? (
            <div className="row" style={{ gap: 8 }}>
              <span className="chip" style={{ padding: '6px 6px 6px 8px' }}>
                <Avatar name={recipient.name} size="sm" color={ROLE_META[recipient.role].color} />
                <span className="bold">{recipient.name}</span>
                <span className="muted small">{c(recipient.role)}</span>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ width: 24, height: 24 }} aria-label={t('remove', { name: recipient.name })} onClick={() => setRecipient(null)}>
                  <X size={14} />
                </button>
              </span>
            </div>
          ) : (
            <>
              <SearchInput value={search} onChange={setSearch} placeholder={t('searchName')} label={t('searchPeople')} />
              {errors.recipientId && <span className="field-error">{errors.recipientId}</span>}
              <div className="card" style={{ maxHeight: 220, overflowY: 'auto' }} role="group" aria-labelledby="recipient-label">
                {contacts.isLoading ? (
                  <div className="card-body small muted">{t('loadingContacts')}</div>
                ) : contacts.error ? (
                  <div className="card-body small text-danger">{t('contactsError')}</div>
                ) : !contacts.data?.length ? (
                  <div className="card-body small muted">{debounced ? t('nobodyMatches', { q: debounced }) : t('nobody')}</div>
                ) : (
                  <ul className="list">
                    {contacts.data.map((ct) => (
                      <li key={ct.id}>
                        <button
                          type="button"
                          className="list-item"
                          style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: '8px 14px' }}
                          onClick={() => setRecipient({ id: ct.id, name: fullName(ct), role: ct.role })}
                        >
                          <Avatar name={fullName(ct)} size="sm" color={ROLE_META[ct.role].color} />
                          <span className="grow">
                            <span className="bold">{fullName(ct)}</span> <Badge>{c(ct.role)}</Badge>
                            <span className="small muted truncate" style={{ display: 'block' }}>{ct.context}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
        <Field label={t('subject')} required error={errors.subject}>
          <Input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label={t('message')} required error={errors.body}>
          <Textarea value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 180 }} />
        </Field>
      </div>
    </Modal>
  );
}
