import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RecordExcelPanel } from '../components/ExcelTools';
import { Ban, Check, Copy, MailPlus, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ClassListItem, Invitation, InvitationInput, InvitationStatus, IssuedInvitation, Paginated, Role,
} from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Avatar, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, PersonCell,
  SearchInput, Segmented, Select, Textarea, useDebounced,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate, ROLE_META, type Tone } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { ChildPicker, RELATIONSHIPS, type LinkedChild } from './ParentsPage';
import { apiFieldErrors, isEmail, RowAction } from './StudentsPage';

const M = {
  en: {
    title: 'Invitations',
    desc: 'Invite parents, students and staff to create their own accounts. The role and access are set here — people can’t change them when they register.',
    invite: 'Invite someone',
    searchPh: 'Search by name or email', searchLabel: 'Search invitations',
    status: 'Status', role: 'Role', anyStatus: 'Any status', anyRole: 'Any role',
    pending: 'Waiting', accepted: 'Account created', expired: 'Expired', revoked: 'Cancelled',
    none: 'No invitations yet', noneText: 'Send an invitation and the person sets up their own account with the access you choose.',
    noMatch: 'No invitations match these filters', clear: 'Clear filters',
    colPerson: 'Invited person', colRole: 'Role', colAccess: 'Access', colStatus: 'Status', colSent: 'Sent', colExpires: 'Expires', actions: 'Actions',
    sentBy: 'by {name}', resendName: 'Send a new link to {name}', cancelName: 'Cancel invitation for {name}',
    cancelTitle: 'Cancel invitation for {name}?', cancelMessage: 'The link they were sent will stop working. You can invite them again later.',
    cancelConfirm: 'Cancel invitation', cancelled: 'Invitation cancelled',
    resendTitle: 'Send a new link to {name}?', resendMessage: 'Their old link will stop working and a new one will be valid for 14 days.',
    resendConfirm: 'Create new link',
    formTitle: 'Invite someone', formDesc: 'They’ll get a link to choose their own password. The link works once.',
    roleLabel: 'They will join as', firstName: 'First name', lastName: 'Last name', email: 'Email address',
    emailHint: 'They’ll sign in with this address. It can’t be changed during registration.',
    klass: 'Class', noClass: 'Not placed in a class yet', specialization: 'Subject or specialisation', specializationHint: 'Optional — for example Mathematics.',
    children: 'Children they can see', childrenHint: 'Link at least one child so the parent sees their records.',
    noChildren: 'No children linked yet.', relationshipTo: 'Relationship to {name}', unlink: 'Unlink {name}',
    adminWarning: 'Administrators can see and change everything, including fees, accounts and school settings. Only invite people who need full access.',
    message: 'Personal note', messageHint: 'Optional — included in the email.',
    expiresIn: 'Link valid for', days: '{n} days',
    send: 'Create invitation',
    errFirst: 'Enter a first name', errLast: 'Enter a last name', errEmail: 'Enter an email address', errEmailBad: 'That doesn’t look like an email address',
    errChildren: 'Link at least one child',
    linkTitle: 'Invitation ready for {name}', linkEmailed: 'We emailed this link to {email}.',
    linkNotEmailed: 'Email isn’t set up for this school, so nothing was sent. Share this link with {name} privately — by SMS or WhatsApp, for example.',
    linkOnce: 'For security the link is only shown now. If it’s lost, send a new one from this page.',
    linkLabel: 'Invitation link', copy: 'Copy link', copied: 'Copied', done: 'Done', expiresOn: 'Expires {date}.',
    mother: 'Mother', father: 'Father', guardian: 'Guardian', grandparent: 'Grandparent', carer: 'Carer', other: 'Other',
  },
  sw: {
    title: 'Mialiko',
    desc: 'Alika wazazi, wanafunzi na wafanyakazi wafungue akaunti zao. Nafasi na ruhusa zinawekwa hapa — hawawezi kuzibadilisha wakijisajili.',
    invite: 'Alika mtu',
    searchPh: 'Tafuta kwa jina au barua pepe', searchLabel: 'Tafuta mialiko',
    status: 'Hali', role: 'Nafasi', anyStatus: 'Hali yoyote', anyRole: 'Nafasi yoyote',
    pending: 'Inasubiri', accepted: 'Akaunti imefunguliwa', expired: 'Muda umekwisha', revoked: 'Umefutwa',
    none: 'Bado hakuna mialiko', noneText: 'Tuma mwaliko na mhusika atafungua akaunti yake mwenyewe akiwa na ruhusa unazochagua.',
    noMatch: 'Hakuna mwaliko unaolingana na vichujio hivi', clear: 'Ondoa vichujio',
    colPerson: 'Aliyealikwa', colRole: 'Nafasi', colAccess: 'Ruhusa', colStatus: 'Hali', colSent: 'Ulitumwa', colExpires: 'Unaisha', actions: 'Vitendo',
    sentBy: 'na {name}', resendName: 'Tuma kiungo kipya kwa {name}', cancelName: 'Futa mwaliko wa {name}',
    cancelTitle: 'Futa mwaliko wa {name}?', cancelMessage: 'Kiungo alichotumiwa hakitafanya kazi tena. Unaweza kumwalika tena baadaye.',
    cancelConfirm: 'Futa mwaliko', cancelled: 'Mwaliko umefutwa',
    resendTitle: 'Tuma kiungo kipya kwa {name}?', resendMessage: 'Kiungo cha zamani hakitafanya kazi na kipya kitadumu siku 14.',
    resendConfirm: 'Unda kiungo kipya',
    formTitle: 'Alika mtu', formDesc: 'Atapata kiungo cha kuchagua nenosiri lake. Kiungo kinatumika mara moja.',
    roleLabel: 'Atajiunga kama', firstName: 'Jina la kwanza', lastName: 'Jina la ukoo', email: 'Barua pepe',
    emailHint: 'Ataingia kwa barua pepe hii. Haiwezi kubadilishwa wakati wa usajili.',
    klass: 'Darasa', noClass: 'Bado hajapangiwa darasa', specialization: 'Somo au utaalamu', specializationHint: 'Si lazima — kwa mfano Hisabati.',
    children: 'Watoto atakaowaona', childrenHint: 'Unganisha angalau mtoto mmoja ili mzazi aone kumbukumbu zao.',
    noChildren: 'Bado hajaunganishwa na mtoto.', relationshipTo: 'Uhusiano na {name}', unlink: 'Tenganisha {name}',
    adminWarning: 'Wasimamizi wanaweza kuona na kubadili kila kitu, zikiwemo ada, akaunti na mipangilio ya shule. Alika tu watu wanaohitaji ruhusa kamili.',
    message: 'Ujumbe binafsi', messageHint: 'Si lazima — utaongezwa kwenye barua pepe.',
    expiresIn: 'Kiungo kitadumu', days: 'Siku {n}',
    send: 'Unda mwaliko',
    errFirst: 'Andika jina la kwanza', errLast: 'Andika jina la ukoo', errEmail: 'Andika barua pepe', errEmailBad: 'Hii haionekani kuwa barua pepe sahihi',
    errChildren: 'Unganisha angalau mtoto mmoja',
    linkTitle: 'Mwaliko wa {name} uko tayari', linkEmailed: 'Tumetuma kiungo hiki kwa {email}.',
    linkNotEmailed: 'Barua pepe haijawekwa kwa shule hii, kwa hiyo hakuna kilichotumwa. Mpe {name} kiungo hiki kwa siri — kwa SMS au WhatsApp, kwa mfano.',
    linkOnce: 'Kwa usalama kiungo kinaonyeshwa sasa tu. Kikipotea, tuma kipya kutoka ukurasa huu.',
    linkLabel: 'Kiungo cha mwaliko', copy: 'Nakili kiungo', copied: 'Kimenakiliwa', done: 'Nimemaliza', expiresOn: 'Kinaisha {date}.',
    mother: 'Mama', father: 'Baba', guardian: 'Mlezi', grandparent: 'Bibi / babu', carer: 'Mtunzaji', other: 'Mwingine',
  },
};
type Msg = keyof typeof M.en;

const ROLES: Role[] = ['parent', 'student', 'teacher', 'admin'];
const STATUSES: InvitationStatus[] = ['pending', 'accepted', 'expired', 'revoked'];
const STATUS_TONE: Record<InvitationStatus, Tone> = { pending: 'info', accepted: 'success', expired: 'warning', revoked: 'neutral' };

interface FormState {
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  classId: string;
  specialization: string;
  children: LinkedChild[];
  message: string;
  expiresInDays: number;
}
const blank = (role: Role): FormState => ({
  role, firstName: '', lastName: '', email: '', classId: '', specialization: '', children: [], message: '', expiresInDays: 14,
});

function InviteDialog({ open, initialRole, onClose, onIssued }: {
  open: boolean;
  initialRole: Role;
  onClose: () => void;
  onIssued: (issued: IssuedInvitation) => void;
}) {
  const t = useT(M);
  const { t: tc } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(blank(initialRole));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: () => api.get<ClassListItem[]>('/classes'), enabled: open });

  useEffect(() => {
    if (open) {
      setForm(blank(initialRole));
      setErrors({});
    }
  }, [open, initialRole]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const mutation = useMutation({
    mutationFn: (payload: InvitationInput) => api.post<IssuedInvitation>('/invitations', payload),
    onSuccess: (issued) => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      onIssued(issued);
    },
    onError: (err) => {
      // A clash (account or open invitation for this email) belongs next to the email field.
      if (err instanceof ApiError && err.status === 409) setErrors({ email: err.message });
      else {
        setErrors(apiFieldErrors(err));
        toast.error(err);
      }
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = t('errFirst');
    if (!form.lastName.trim()) e.lastName = t('errLast');
    if (!form.email.trim()) e.email = t('errEmail');
    else if (!isEmail(form.email)) e.email = t('errEmailBad');
    if (form.role === 'parent' && form.children.length === 0) e.children = t('errChildren');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({
      role: form.role,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      message: form.message.trim() || undefined,
      expiresInDays: form.expiresInDays,
      details:
        form.role === 'student' ? { classId: form.classId ? Number(form.classId) : undefined }
        : form.role === 'parent' ? { children: form.children.map((c) => ({ studentId: c.studentId, relationship: c.relationship })) }
        : form.role === 'teacher' ? { specialization: form.specialization.trim() || undefined }
        : {},
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      title={t('formTitle')}
      description={t('formDesc')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} icon={<MailPlus size={17} />}>{t('send')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="span-2 field">
          <span className="field-label" aria-hidden>{t('roleLabel')}</span>
          <Segmented label={t('roleLabel')} value={form.role} onChange={(r) => set('role', r)} options={ROLES.map((r) => ({ value: r, label: tc(r) }))} />
        </div>
        {form.role === 'admin' && (
          <div className="span-2"><Alert tone="warning" icon={<ShieldAlert size={20} />}>{t('adminWarning')}</Alert></div>
        )}
        <Field label={t('firstName')} required error={errors.firstName}>
          <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} data-autofocus />
        </Field>
        <Field label={t('lastName')} required error={errors.lastName}>
          <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label={t('email')} required error={errors.email} hint={t('emailHint')} className="span-2">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
        </Field>

        {form.role === 'student' && (
          <Field label={t('klass')} error={errors.classId} className="span-2">
            <Select value={form.classId} onChange={(e) => set('classId', e.target.value)}>
              <option value="">{t('noClass')}</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        {form.role === 'teacher' && (
          <Field label={t('specialization')} hint={t('specializationHint')} error={errors.specialization} className="span-2">
            <Input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} />
          </Field>
        )}
        {form.role === 'parent' && (
          <div className="span-2 stack-sm">
            <div className="form-section-title">{t('children')}</div>
            <p className="small muted">{t('childrenHint')}</p>
            {form.children.length === 0 ? (
              <p className={errors.children ? 'field-error' : 'small muted'} role={errors.children ? 'alert' : undefined}>
                {errors.children || t('noChildren')}
              </p>
            ) : (
              <ul className="list card">
                {form.children.map((c, i) => (
                  <li key={c.studentId} className="list-item" style={{ padding: '10px 14px' }}>
                    <Avatar name={c.name} size="sm" photoUrl={c.photoUrl} />
                    <div className="grow">
                      <div className="title small">{c.name}</div>
                      <div className="meta">{c.className ?? '—'}</div>
                    </div>
                    <Select
                      className="input-sm"
                      style={{ width: 150 }}
                      aria-label={t('relationshipTo', { name: c.name })}
                      value={c.relationship}
                      onChange={(e) => set('children', form.children.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))}
                    >
                      {RELATIONSHIPS.map((r) => <option key={r} value={r}>{t(r as Msg)}</option>)}
                    </Select>
                    <Button variant="ghost" size="sm" iconOnly aria-label={t('unlink', { name: c.name })} icon={<X size={16} />} onClick={() => set('children', form.children.filter((x) => x.studentId !== c.studentId))} />
                  </li>
                ))}
              </ul>
            )}
            <ChildPicker linked={form.children} onAdd={(c) => set('children', [...form.children, c])} />
          </div>
        )}

        <Field label={t('message')} hint={t('messageHint')} error={errors.message} className="span-2">
          <Textarea rows={3} maxLength={500} value={form.message} onChange={(e) => set('message', e.target.value)} />
        </Field>
        <Field label={t('expiresIn')} error={errors.expiresInDays}>
          <Select value={form.expiresInDays} onChange={(e) => set('expiresInDays', Number(e.target.value))}>
            {[3, 7, 14, 30].map((n) => <option key={n} value={n}>{t('days', { n })}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/** Shows a freshly issued link once, with a copy button and whether it was emailed. */
function IssuedDialog({ issued, onClose }: { issued: IssuedInvitation | null; onClose: () => void }) {
  const t = useT(M);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [issued]);
  if (!issued) return null;
  const inv = issued.invitation;
  const name = `${inv.firstName} ${inv.lastName}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
    } catch {
      (document.getElementById('issued-link') as HTMLInputElement | null)?.select();
    }
  };
  return (
    <Modal open onClose={onClose} title={t('linkTitle', { name })} footer={<Button variant="primary" onClick={onClose}>{t('done')}</Button>}>
      <div className="stack">
        {issued.emailed
          ? <Alert tone="success">{t('linkEmailed', { email: inv.email })}</Alert>
          : <Alert tone="info">{t('linkNotEmailed', { name: inv.firstName })}</Alert>}
        <div className="field">
          <label className="field-label" htmlFor="issued-link">{t('linkLabel')}</label>
          <div className="row" style={{ gap: 8 }}>
            <Input id="issued-link" readOnly value={issued.link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.82rem' }} />
            <Button onClick={copy} icon={copied ? <Check size={16} /> : <Copy size={16} />} aria-live="polite">{copied ? t('copied') : t('copy')}</Button>
          </div>
          <span className="field-hint">{t('expiresOn', { date: formatDate(inv.expiresAt) })} {t('linkOnce')}</span>
        </div>
      </div>
    </Modal>
  );
}

export function InvitationsPage() {
  const t = useT(M);
  const { t: tc } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const status = (params.get('status') ?? '') as InvitationStatus | '';
  const role = (params.get('role') ?? '') as Role | '';
  const page = Number(params.get('page') ?? 1) || 1;
  const formOpen = params.get('new') === '1';
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);

  const setParam = (key: string, value: string | null) => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: key === 'new' ? false : true });
  };
  useEffect(() => { if (debounced !== '') setParam('page', null); /* back to page 1 on a new search */ }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, error, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['invitations', { search: debounced, status, role, page }],
    queryFn: () => api.get<Paginated<Invitation>>('/invitations', { search: debounced, status: status || undefined, role: role || undefined, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  const resend = async (inv: Invitation) => {
    const name = `${inv.firstName} ${inv.lastName}`;
    if (!(await confirm({ title: t('resendTitle', { name }), message: t('resendMessage'), confirmLabel: t('resendConfirm') }))) return;
    try {
      const res = await api.post<IssuedInvitation>(`/invitations/${inv.id}/resend`);
      qc.invalidateQueries({ queryKey: ['invitations'] });
      setIssued(res);
    } catch (err) {
      toast.error(err);
    }
  };
  const cancel = async (inv: Invitation) => {
    const name = `${inv.firstName} ${inv.lastName}`;
    if (!(await confirm({ title: t('cancelTitle', { name }), message: t('cancelMessage'), confirmLabel: t('cancelConfirm'), danger: true }))) return;
    try {
      await api.del(`/invitations/${inv.id}`);
      qc.invalidateQueries({ queryKey: ['invitations'] });
      toast.success(t('cancelled'));
    } catch (err) {
      toast.error(err);
    }
  };

  const filtered = !!(debounced || status || role);
  const initialRole = (ROLES as string[]).includes(params.get('as') ?? '') ? (params.get('as') as Role) : 'parent';

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={<Button variant="primary" icon={<MailPlus size={18} />} onClick={() => setParam('new', '1')}>{t('invite')}</Button>}
      />
      <RecordExcelPanel areas={[{ resource: 'invitations', label: 'Invitations' }]} />
      <Card>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder={t('searchPh')} label={t('searchLabel')} />
          <Select aria-label={t('status')} value={status} onChange={(e) => setParam('status', e.target.value || null)} style={{ width: 'auto' }}>
            <option value="">{t('anyStatus')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </Select>
          <Select aria-label={t('role')} value={role} onChange={(e) => setParam('role', e.target.value || null)} style={{ width: 'auto' }}>
            <option value="">{t('anyRole')}</option>
            {ROLES.map((r) => <option key={r} value={r}>{tc(r)}</option>)}
          </Select>
        </div>
        {isLoading ? (
          <div style={{ padding: 20 }}><CardSkeleton rows={5} /></div>
        ) : error ? (
          <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<MailPlus size={26} />}
            title={filtered ? t('noMatch') : t('none')}
            action={filtered
              ? <Button onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>{t('clear')}</Button>
              : <Button variant="primary" icon={<MailPlus size={17} />} onClick={() => setParam('new', '1')}>{t('invite')}</Button>}
          >
            {!filtered && t('noneText')}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: isFetching && isPlaceholderData ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('colPerson')}</th>
                    <th scope="col">{t('colRole')}</th>
                    <th scope="col">{t('colAccess')}</th>
                    <th scope="col">{t('colStatus')}</th>
                    <th scope="col">{t('colSent')}</th>
                    <th scope="col">{t('colExpires')}</th>
                    <th scope="col" className="actions"><span className="sr-only">{t('actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((inv) => {
                    const name = `${inv.firstName} ${inv.lastName}`;
                    const open = inv.status === 'pending' || inv.status === 'expired';
                    return (
                      <tr key={inv.id}>
                        <td><PersonCell name={name} sub={inv.email} color={ROLE_META[inv.role].color} /></td>
                        <td>{tc(inv.role)}</td>
                        <td className="small">{inv.detailSummary ?? <span className="subtle">—</span>}</td>
                        <td><Badge tone={STATUS_TONE[inv.status]} dot>{t(inv.status)}</Badge></td>
                        <td className="small">
                          {formatDate(inv.createdAt)}
                          {inv.invitedByName && <div className="tiny muted">{t('sentBy', { name: inv.invitedByName })}</div>}
                        </td>
                        <td className="small">{inv.status === 'accepted' ? formatDate(inv.acceptedAt) : formatDate(inv.expiresAt)}</td>
                        <td className="actions">
                          {open && <RowAction label={t('resendName', { name })} icon={<RefreshCw size={16} />} onClick={() => resend(inv)} />}
                          {inv.status === 'pending' && <RowAction danger label={t('cancelName', { name })} icon={<Ban size={16} />} onClick={() => cancel(inv)} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => setParam('page', p > 1 ? String(p) : null)} />
          </>
        )}
      </Card>
      <InviteDialog
        open={formOpen}
        initialRole={initialRole}
        onClose={() => setParam('new', null)}
        onIssued={(res) => { setParam('new', null); setIssued(res); }}
      />
      <IssuedDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}
