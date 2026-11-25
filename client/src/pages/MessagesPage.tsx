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
      toast.success('Message deleted');
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
      body: `\n\n— On ${formatDateTime(m.createdAt)}, ${m.senderName} wrote:\n${m.body.split('\n').map((l) => `> ${l}`).join('\n')}`,
    });
  };

  return (
    <>
      <PageHeader
        title="Messages"
        description={user.role === 'parent' ? 'Talk privately with your children’s teachers and the school office.' : 'Private messages with staff, students and families.'}
        actions={<Button variant="primary" icon={<PenSquare size={17} />} onClick={() => setCompose({})}>New message</Button>}
      />

      <Card>
        <div className="mail">
          {showList && (
            <div className="mail-list" aria-label={box === 'inbox' ? 'Inbox' : 'Sent messages'}>
              <div className="toolbar" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                <Segmented<Box>
                  label="Mailbox"
                  value={box}
                  onChange={(b) => { setBox(b); setSelectedId(null); }}
                  options={[
                    { value: 'inbox', label: <><Inbox size={15} aria-hidden /> Inbox{unread > 0 && <Badge tone="danger">{unread}</Badge>}</> },
                    { value: 'sent', label: <><Send size={15} aria-hidden /> Sent</> },
                  ]}
                />
              </div>
              {q.isLoading ? (
                <div className="card-body"><CardSkeleton rows={5} /></div>
              ) : q.error ? (
                <div className="card-body"><ErrorState error={q.error} onRetry={q.refetch} /></div>
              ) : messages.length === 0 ? (
                <EmptyState icon={<Mail size={24} />} title={box === 'inbox' ? 'Your inbox is empty' : 'No sent messages'}>
                  {box === 'inbox' ? 'Messages from teachers, families and the office will appear here.' : 'Messages you send will appear here.'}
                </EmptyState>
              ) : (
                <ul className="list">
                  {messages.map((m) => {
                    const isUnread = box === 'inbox' && !m.readAt;
                    const who = box === 'inbox' ? m.senderName : `To ${m.recipientName}`;
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
                          <div className="subject truncate">{isUnread && <span className="sr-only">Unread: </span>}{m.subject}</div>
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
                <EmptyState icon={<Mail size={26} />} title="Select a message to read it" />
              ) : (
                <article aria-labelledby="message-subject">
                  {narrow && (
                    <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={() => setSelectedId(null)} style={{ marginBottom: 12 }}>
                      Back to {box === 'inbox' ? 'inbox' : 'sent'}
                    </Button>
                  )}
                  <div className="row between row-wrap" style={{ alignItems: 'flex-start' }}>
                    <h2 id="message-subject" style={{ fontSize: '1.25rem' }}>{selected.subject}</h2>
                    <div className="row" style={{ gap: 6 }}>
                      <Button icon={<Reply size={16} />} onClick={() => reply(selected)}>{box === 'inbox' ? 'Reply' : 'Follow up'}</Button>
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label="Delete message"
                        icon={<Trash2 size={17} />}
                        loading={remove.isPending}
                        onClick={async () => {
                          if (await confirm({ title: 'Delete this message?', message: 'It will be removed for both you and the other person.', confirmLabel: 'Delete', danger: true })) remove.mutate(selected.id);
                        }}
                      />
                    </div>
                  </div>
                  <div className="row mt-2" style={{ gap: 12 }}>
                    <Avatar name={selected.senderName} color={ROLE_META[selected.senderRole].color} />
                    <div>
                      <div className="bold">
                        {selected.senderName} <Badge>{ROLE_META[selected.senderRole].label}</Badge>
                      </div>
                      <div className="small muted">
                        to {selected.recipientId === user.id ? 'you' : selected.recipientName} · {formatDateTime(selected.createdAt)}
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
      const c = contacts.data.find((x) => x.id === recipient.id);
      if (c) setRecipient({ id: c.id, name: fullName(c), role: c.role });
      else if (!debounced) setRecipient(null);
    }
  }, [recipient, contacts.data, debounced]);

  const send = useMutation({
    mutationFn: (m: MessageInput) => api.post<Message>('/messages', m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Message sent', recipient ? `To ${recipient.name}` : undefined);
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
    if (!recipient) errs.recipientId = 'Choose who to send this to';
    if (!subject.trim()) errs.subject = 'Add a subject';
    if (!body.trim()) errs.body = 'Write a message';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    send.mutate({ recipientId: recipient!.id, subject: subject.trim(), body: body.trim() });
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="New message"
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={<Send size={16} />} loading={send.isPending}>Send</Button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <span className="field-label" id="recipient-label">To <span className="req" aria-hidden>*</span></span>
          {recipient && recipient.name ? (
            <div className="row" style={{ gap: 8 }}>
              <span className="chip" style={{ padding: '6px 6px 6px 8px' }}>
                <Avatar name={recipient.name} size="sm" color={ROLE_META[recipient.role].color} />
                <span className="bold">{recipient.name}</span>
                <span className="muted small">{ROLE_META[recipient.role].label}</span>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ width: 24, height: 24 }} aria-label={`Remove ${recipient.name}`} onClick={() => setRecipient(null)}>
                  <X size={14} />
                </button>
              </span>
            </div>
          ) : (
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search by name" label="Search people to message" />
              {errors.recipientId && <span className="field-error">{errors.recipientId}</span>}
              <div className="card" style={{ maxHeight: 220, overflowY: 'auto' }} role="group" aria-labelledby="recipient-label">
                {contacts.isLoading ? (
                  <div className="card-body small muted">Loading people you can message…</div>
                ) : contacts.error ? (
                  <div className="card-body small text-danger">Couldn’t load contacts.</div>
                ) : !contacts.data?.length ? (
                  <div className="card-body small muted">{debounced ? `Nobody matches “${debounced}”.` : 'There’s nobody you can message yet.'}</div>
                ) : (
                  <ul className="list">
                    {contacts.data.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="list-item"
                          style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: '8px 14px' }}
                          onClick={() => setRecipient({ id: c.id, name: fullName(c), role: c.role })}
                        >
                          <Avatar name={fullName(c)} size="sm" color={ROLE_META[c.role].color} />
                          <span className="grow">
                            <span className="bold">{fullName(c)}</span> <Badge>{ROLE_META[c.role].label}</Badge>
                            <span className="small muted truncate" style={{ display: 'block' }}>{c.context}</span>
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
        <Field label="Subject" required error={errors.subject}>
          <Input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" required error={errors.body}>
          <Textarea value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 180 }} />
        </Field>
      </div>
    </Modal>
  );
}
