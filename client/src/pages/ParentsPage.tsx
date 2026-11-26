import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Link2, Pencil, Power, PowerOff, Trash, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CreatedAccount, Paginated, ParentInput, ParentListItem, StudentListItem } from '../../../shared/types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Avatar, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, PersonCell,
  SearchInput, Select, Spinner, useDebounced,
} from '../components/ui';
import { api } from '../lib/api';
import { fullName } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { apiFieldErrors, isEmail, RowAction, useAccountActions } from './StudentsPage';

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'grandparent', 'carer', 'other'] as const;

const M = {
  en: {
    title: 'Parents & guardians', desc: 'Family accounts and the children each one can see. One parent can be linked to several children.',
    add: 'Add parent', searchPh: 'Search by parent or child name, or email', searchLabel: 'Search parents', noMatch: 'No parents match your search',
    none: 'No parent accounts yet', addFirst: 'Add a parent', colParent: 'Parent / guardian', colPhone: 'Phone', colChildren: 'Children',
    colStatus: 'Status', actions: 'Actions', noChildren: 'No children linked', deactivated: 'Deactivated',
    editName: 'Edit {name}', resetName: 'Reset password for {name}', deactivateName: 'Deactivate {name}', reactivateName: 'Reactivate {name}',
    deleteName: 'Delete {name}', deleteConsequence: 'Their messages will be deleted; the children’s records are kept.',
    editTitle: 'Edit {name}', addTitle: 'Add a parent or guardian',
    formDesc: 'Parents see grades, attendance, report cards and fees for the children linked to them.',
    createAccount: 'Create account', firstName: 'First name', lastName: 'Last name', email: 'Email', emailHint: 'Used to sign in',
    phone: 'Phone', phoneHint: 'e.g. 0777 123 456 — used for school contact', password: 'Password',
    passwordHint: 'Leave blank and we’ll create a temporary password you can share.', children: 'Children ({n})',
    multiChild: 'One account for the whole family', multiChildHint: 'Link every child this parent is responsible for. They switch between children in the app.',
    noLinked: 'No children linked yet. Search below to link one or more children.', noClass: 'No class', relationshipTo: 'Relationship to {name}',
    unlink: 'Unlink {name}', findPh: 'Type at least 2 letters of a student’s name', findLabel: 'Find a student to link',
    noUnlinked: 'No unlinked students match “{q}”.', link: 'Link',
    errFirst: 'Enter a first name', errLast: 'Enter a last name', errEmail: 'Enter an email address for signing in',
    errEmailBad: 'That doesn’t look like an email address', errPassword: 'Use at least 8 characters',
    ready: '{name}’s account is ready', signInInfo: 'Sign-in: {email} · temporary password', shareInfo: 'Share it privately — it won’t be shown again.',
    savedChanges: 'Saved changes to {name}',
    mother: 'Mother', father: 'Father', guardian: 'Guardian', grandparent: 'Grandparent', carer: 'Carer', other: 'Other',
  },
  sw: {
    title: 'Wazazi na walezi', desc: 'Akaunti za familia na watoto ambao kila mmoja anaweza kuwaona. Mzazi mmoja anaweza kuunganishwa na watoto kadhaa.',
    add: 'Ongeza mzazi', searchPh: 'Tafuta kwa jina la mzazi au mtoto, au barua pepe', searchLabel: 'Tafuta wazazi', noMatch: 'Hakuna mzazi anayelingana na utafutaji wako',
    none: 'Bado hakuna akaunti za wazazi', addFirst: 'Ongeza mzazi', colParent: 'Mzazi / mlezi', colPhone: 'Simu', colChildren: 'Watoto',
    colStatus: 'Hali', actions: 'Vitendo', noChildren: 'Hajaunganishwa na mtoto', deactivated: 'Imesimamishwa',
    editName: 'Hariri {name}', resetName: 'Badilisha nenosiri la {name}', deactivateName: 'Simamisha {name}', reactivateName: 'Rejesha {name}',
    deleteName: 'Futa {name}', deleteConsequence: 'Ujumbe wake utafutwa; kumbukumbu za watoto zitabaki.',
    editTitle: 'Hariri {name}', addTitle: 'Ongeza mzazi au mlezi',
    formDesc: 'Wazazi huona alama, mahudhurio, ripoti za matokeo na ada za watoto walioungana nao.',
    createAccount: 'Fungua akaunti', firstName: 'Jina la kwanza', lastName: 'Jina la ukoo', email: 'Barua pepe', emailHint: 'Hutumika kuingia',
    phone: 'Simu', phoneHint: 'mf. 0777 123 456 — hutumika na shule kuwasiliana', password: 'Nenosiri',
    passwordHint: 'Acha wazi tutaunda nenosiri la muda utakalompa.', children: 'Watoto ({n})',
    multiChild: 'Akaunti moja kwa familia nzima', multiChildHint: 'Unganisha kila mtoto ambaye mzazi huyu anamhudumia. Atabadilisha kati ya watoto ndani ya programu.',
    noLinked: 'Bado hajaunganishwa na mtoto. Tafuta hapa chini kuunganisha mtoto mmoja au zaidi.', noClass: 'Hana darasa', relationshipTo: 'Uhusiano na {name}',
    unlink: 'Tenganisha {name}', findPh: 'Andika angalau herufi 2 za jina la mwanafunzi', findLabel: 'Tafuta mwanafunzi wa kuunganisha',
    noUnlinked: 'Hakuna mwanafunzi asiyeunganishwa anayelingana na “{q}”.', link: 'Unganisha',
    errFirst: 'Andika jina la kwanza', errLast: 'Andika jina la ukoo', errEmail: 'Andika barua pepe ya kuingia',
    errEmailBad: 'Hii haionekani kuwa barua pepe sahihi', errPassword: 'Tumia angalau herufi 8',
    ready: 'Akaunti ya {name} iko tayari', signInInfo: 'Kuingia: {email} · nenosiri la muda', shareInfo: 'Mpe kwa siri — halitaonyeshwa tena.',
    savedChanges: 'Mabadiliko ya {name} yamehifadhiwa',
    mother: 'Mama', father: 'Baba', guardian: 'Mlezi', grandparent: 'Bibi / babu', carer: 'Mtunzaji', other: 'Mwingine',
  },
};

type Msg = keyof typeof M.en;
const relLabel = (r: string, t: (k: Msg) => string) => ((RELATIONSHIPS as readonly string[]).includes(r) ? t(r as Msg) : r);

interface LinkedChild {
  studentId: number;
  name: string;
  className: string | null;
  relationship: string;
  photoUrl?: string | null;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  children: LinkedChild[];
}

const blank: FormState = { firstName: '', lastName: '', email: '', phone: '', password: '', children: [] };

/** Search students and link them to the parent being edited. */
function ChildPicker({ linked, onAdd }: { linked: LinkedChild[]; onAdd: (c: LinkedChild) => void }) {
  const t = useT(M);
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 250);
  const { data, isFetching } = useQuery({
    queryKey: ['students', 'picker', debounced],
    queryFn: () => api.get<Paginated<StudentListItem>>('/students', { search: debounced, pageSize: 8 }),
    enabled: debounced.trim().length >= 2,
  });
  const results = (data?.items ?? []).filter((s) => !linked.some((l) => l.studentId === s.id));
  return (
    <div className="stack-sm">
      <SearchInput value={q} onChange={setQ} placeholder={t('findPh')} label={t('findLabel')} />
      {debounced.trim().length >= 2 && (
        <div className="card" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {isFetching && !data ? (
            <div style={{ padding: 16 }}><Spinner /></div>
          ) : results.length === 0 ? (
            <p className="small muted" style={{ padding: 14 }}>{t('noUnlinked', { q: debounced })}</p>
          ) : (
            <ul className="list">
              {results.map((s) => (
                <li key={s.id} className="list-item" style={{ padding: '8px 14px' }}>
                  <Avatar name={fullName(s)} size="sm" photoUrl={s.photoUrl} />
                  <div className="grow">
                    <div className="title small">{fullName(s)}</div>
                    <div className="meta">{s.admissionNo} · {s.className ?? t('noClass')}</div>
                  </div>
                  <Button
                    size="sm"
                    icon={<Link2 size={14} />}
                    onClick={() => {
                      onAdd({ studentId: s.id, name: fullName(s), className: s.className, relationship: 'guardian', photoUrl: s.photoUrl });
                      setQ('');
                    }}
                  >
                    {t('link')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ParentFormDrawer({ open, onClose, parent }: { open: boolean; onClose: () => void; parent: ParentListItem | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { t: tc } = useI18n();
  const t = useT(M);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = !!parent;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(parent ? {
      firstName: parent.firstName, lastName: parent.lastName, email: parent.email, phone: parent.phone ?? '', password: '',
      children: parent.children.map((c) => ({ studentId: c.id, name: fullName(c), className: c.className, relationship: c.relationship })),
    } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parent?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const mutation = useMutation({
    mutationFn: async (payload: ParentInput) => editing
      ? { record: await api.patch<ParentListItem>(`/parents/${parent!.id}`, payload), temporaryPassword: null }
      : api.post<CreatedAccount<ParentListItem>>('/parents', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['parents'] });
      qc.invalidateQueries({ queryKey: ['student-overview'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      const name = fullName(res.record);
      if (res.temporaryPassword) {
        toast.success(t('ready', { name }), <>{t('signInInfo', { email: res.record.email })} <code>{res.temporaryPassword}</code>. {t('shareInfo')}</>, { sticky: true });
      } else {
        toast.success(editing ? t('savedChanges', { name }) : t('ready', { name }));
      }
      onClose();
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = t('errFirst');
    if (!form.lastName.trim()) e.lastName = t('errLast');
    if (!form.email.trim()) e.email = t('errEmail');
    else if (!isEmail(form.email)) e.email = t('errEmailBad');
    if (form.password && form.password.length < 8) e.password = t('errPassword');
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const payload: ParentInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      children: form.children.map((c) => ({ studentId: c.studentId, relationship: c.relationship })),
    };
    if (!editing && form.password) payload.password = form.password;
    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      title={editing ? t('editTitle', { name: fullName(parent!) }) : t('addTitle')}
      description={t('formDesc')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{editing ? tc('saveChanges') : t('createAccount')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('firstName')} required error={errors.firstName}>
          <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} data-autofocus />
        </Field>
        <Field label={t('lastName')} required error={errors.lastName}>
          <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label={t('email')} required error={errors.email} hint={t('emailHint')}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t('phone')} error={errors.phone} hint={t('phoneHint')}>
          <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0777 123 456" />
        </Field>
        {!editing && (
          <Field label={t('password')} className="span-2" error={errors.password} hint={t('passwordHint')}>
            <Input value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}

        <div className="form-section-title span-2">{t('children', { n: form.children.length })}</div>
        <div className="span-2 stack-sm">
          <Alert tone="info" icon={<Users size={20} />} title={t('multiChild')}>{t('multiChildHint')}</Alert>
          {form.children.length === 0 ? (
            <p className="small muted">{t('noLinked')}</p>
          ) : (
            <ul className="list card">
              {form.children.map((c, i) => (
                <li key={c.studentId} className="list-item" style={{ padding: '10px 14px' }}>
                  <Avatar name={c.name} size="sm" photoUrl={c.photoUrl} />
                  <div className="grow">
                    <div className="title small">{c.name}</div>
                    <div className="meta">{c.className ?? t('noClass')}</div>
                  </div>
                  <Select
                    className="input-sm"
                    style={{ width: 150 }}
                    aria-label={t('relationshipTo', { name: c.name })}
                    value={c.relationship}
                    onChange={(e) => set('children', form.children.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))}
                  >
                    {[...new Set([...RELATIONSHIPS, c.relationship])].map((r) => <option key={r} value={r}>{relLabel(r, t)}</option>)}
                  </Select>
                  <Button variant="ghost" size="sm" iconOnly aria-label={t('unlink', { name: c.name })} icon={<X size={16} />} onClick={() => set('children', form.children.filter((x) => x.studentId !== c.studentId))} />
                </li>
              ))}
            </ul>
          )}
          <ChildPicker linked={form.children} onAdd={(c) => set('children', [...form.children, c])} />
        </div>
      </div>
    </Modal>
  );
}

export function ParentsPage() {
  const { t: tc } = useI18n();
  const t = useT(M);
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ParentListItem | null>(null);
  const debounced = useDebounced(search);
  const actions = useAccountActions([['parents']]);

  useEffect(() => setSearch(params.get('search') ?? ''), [params]);
  useEffect(() => setPage(1), [debounced]);

  const { data, isLoading, error, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['parents', { search: debounced, page }],
    queryFn: () => api.get<Paginated<ParentListItem>>('/parents', { search: debounced, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  const openForm = (p: ParentListItem | null) => {
    setEditing(p);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={<Button variant="primary" icon={<UserPlus size={18} />} onClick={() => openForm(null)}>{t('add')}</Button>}
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder={t('searchPh')} label={t('searchLabel')} />
        </div>
        {isLoading ? (
          <div style={{ padding: 20 }}><CardSkeleton rows={6} /></div>
        ) : error ? (
          <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Users size={26} />}
            title={debounced ? t('noMatch') : t('none')}
            action={!debounced && <Button variant="primary" icon={<UserPlus size={17} />} onClick={() => openForm(null)}>{t('addFirst')}</Button>}
          />
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: isFetching && isPlaceholderData ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('colParent')}</th>
                    <th scope="col">{t('colPhone')}</th>
                    <th scope="col">{t('colChildren')}</th>
                    <th scope="col">{t('colStatus')}</th>
                    <th scope="col" className="actions"><span className="sr-only">{t('actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => {
                    const name = fullName(p);
                    return (
                      <tr key={p.id}>
                        <td><PersonCell name={name} sub={p.email} color="var(--role-parent)" photoUrl={p.photoUrl} /></td>
                        <td>{p.phone ? <a href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a> : <span className="subtle">—</span>}</td>
                        <td>
                          {p.children.length === 0 ? (
                            <Badge tone="warning">{t('noChildren')}</Badge>
                          ) : (
                            <div className="row row-wrap" style={{ gap: 6 }}>
                              {p.children.map((c) => (
                                <Link key={c.id} to={`/students/${c.id}`} className="chip" title={relLabel(c.relationship, t)}>
                                  {fullName(c)}{c.className && <span className="muted"> · {c.className}</span>}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>{p.isActive ? <Badge tone="success" dot>{tc('active')}</Badge> : <Badge dot>{t('deactivated')}</Badge>}</td>
                        <td className="actions">
                          <RowAction label={t('editName', { name })} icon={<Pencil size={16} />} onClick={() => openForm(p)} />
                          <RowAction label={t('resetName', { name })} icon={<KeyRound size={16} />} onClick={() => actions.resetPassword(p.id, name)} />
                          {p.isActive
                            ? <RowAction label={t('deactivateName', { name })} icon={<PowerOff size={16} />} onClick={() => actions.setActive(p.id, name, false)} />
                            : <RowAction label={t('reactivateName', { name })} icon={<Power size={16} />} onClick={() => actions.setActive(p.id, name, true)} />}
                          <RowAction danger label={t('deleteName', { name })} icon={<Trash size={16} />} onClick={() => actions.remove(`/parents/${p.id}`, name, t('deleteConsequence'))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      <ParentFormDrawer open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} parent={editing} />
    </>
  );
}
