import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Link2, Pencil, Power, PowerOff, Trash, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CreatedAccount, Paginated, ParentInput, ParentListItem, StudentListItem } from '../../../shared/types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, PersonCell,
  SearchInput, Select, Spinner, useDebounced,
} from '../components/ui';
import { api } from '../lib/api';
import { fullName } from '../lib/format';
import { apiFieldErrors, isEmail, RowAction, useAccountActions } from './StudentsPage';

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'grandparent', 'carer', 'other'];

interface LinkedChild {
  studentId: number;
  name: string;
  className: string | null;
  relationship: string;
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
      <SearchInput value={q} onChange={setQ} placeholder="Type at least 2 letters of a student’s name" label="Find a student to link" />
      {debounced.trim().length >= 2 && (
        <div className="card" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {isFetching && !data ? (
            <div style={{ padding: 16 }}><Spinner /></div>
          ) : results.length === 0 ? (
            <p className="small muted" style={{ padding: 14 }}>No unlinked students match “{debounced}”.</p>
          ) : (
            <ul className="list">
              {results.map((s) => (
                <li key={s.id} className="list-item" style={{ padding: '8px 14px' }}>
                  <Avatar name={fullName(s)} size="sm" />
                  <div className="grow">
                    <div className="title small">{fullName(s)}</div>
                    <div className="meta">{s.admissionNo} · {s.className ?? 'No class'}</div>
                  </div>
                  <Button size="sm" icon={<Link2 size={14} />} onClick={() => { onAdd({ studentId: s.id, name: fullName(s), className: s.className, relationship: 'guardian' }); setQ(''); }}>
                    Link
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
  }, [open, parent]);

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
        toast.success(`${name}’s account is ready`, <>Sign-in: {res.record.email} · temporary password <code>{res.temporaryPassword}</code>. Share it privately — it won’t be shown again.</>, { sticky: true });
      } else {
        toast.success(editing ? `Saved changes to ${name}` : `${name}’s account is ready`);
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
    if (!form.firstName.trim()) e.firstName = 'Enter a first name';
    if (!form.lastName.trim()) e.lastName = 'Enter a last name';
    if (!form.email.trim()) e.email = 'Enter an email address for signing in';
    else if (!isEmail(form.email)) e.email = 'That doesn’t look like an email address';
    if (form.password && form.password.length < 8) e.password = 'Use at least 8 characters';
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
      title={editing ? `Edit ${fullName(parent!)}` : 'Add a parent or guardian'}
      description="Parents can see grades, attendance and fees for the children linked to them."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{editing ? 'Save changes' : 'Create account'}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="First name" required error={errors.firstName}>
          <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} data-autofocus />
        </Field>
        <Field label="Last name" required error={errors.lastName}>
          <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label="Email" required error={errors.email} hint="Used to sign in">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        {!editing && (
          <Field label="Password" className="span-2" error={errors.password} hint="Leave blank and we’ll create a temporary password you can share.">
            <Input value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}

        <div className="form-section-title span-2">Children</div>
        <div className="span-2 stack-sm">
          {form.children.length === 0 ? (
            <p className="small muted">No children linked yet. Search below to link one.</p>
          ) : (
            <ul className="list card">
              {form.children.map((c, i) => (
                <li key={c.studentId} className="list-item" style={{ padding: '10px 14px' }}>
                  <Avatar name={c.name} size="sm" />
                  <div className="grow">
                    <div className="title small">{c.name}</div>
                    <div className="meta">{c.className ?? 'No class'}</div>
                  </div>
                  <Select
                    className="input-sm"
                    style={{ width: 150 }}
                    aria-label={`Relationship to ${c.name}`}
                    value={c.relationship}
                    onChange={(e) => set('children', form.children.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))}
                  >
                    {[...new Set([...RELATIONSHIPS, c.relationship])].map((r) => <option key={r} value={r}>{r[0]!.toUpperCase() + r.slice(1)}</option>)}
                  </Select>
                  <Button variant="ghost" size="sm" iconOnly aria-label={`Unlink ${c.name}`} icon={<X size={16} />} onClick={() => set('children', form.children.filter((x) => x.studentId !== c.studentId))} />
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
        title="Parents & guardians"
        description="Family accounts and the children each one can see."
        actions={<Button variant="primary" icon={<UserPlus size={18} />} onClick={() => openForm(null)}>Add parent</Button>}
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by parent or child name, or email" label="Search parents" />
        </div>
        {isLoading ? (
          <div style={{ padding: 20 }}><CardSkeleton rows={6} /></div>
        ) : error ? (
          <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Users size={26} />}
            title={debounced ? 'No parents match your search' : 'No parent accounts yet'}
            action={!debounced && <Button variant="primary" icon={<UserPlus size={17} />} onClick={() => openForm(null)}>Add a parent</Button>}
          />
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: isFetching && isPlaceholderData ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Parent</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Children</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="actions"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => {
                    const name = fullName(p);
                    return (
                      <tr key={p.id}>
                        <td><PersonCell name={name} sub={p.email} color="var(--role-parent)" /></td>
                        <td>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : <span className="subtle">—</span>}</td>
                        <td>
                          {p.children.length === 0 ? (
                            <Badge tone="warning">No children linked</Badge>
                          ) : (
                            <div className="row row-wrap" style={{ gap: 6 }}>
                              {p.children.map((c) => (
                                <Link key={c.id} to={`/students/${c.id}`} className="chip" title={c.relationship}>
                                  {fullName(c)}{c.className && <span className="muted"> · {c.className}</span>}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>{p.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Deactivated</Badge>}</td>
                        <td className="actions">
                          <RowAction label={`Edit ${name}`} icon={<Pencil size={16} />} onClick={() => openForm(p)} />
                          <RowAction label={`Reset password for ${name}`} icon={<KeyRound size={16} />} onClick={() => actions.resetPassword(p.id, name)} />
                          {p.isActive
                            ? <RowAction label={`Deactivate ${name}`} icon={<PowerOff size={16} />} onClick={() => actions.setActive(p.id, name, false)} />
                            : <RowAction label={`Reactivate ${name}`} icon={<Power size={16} />} onClick={() => actions.setActive(p.id, name, true)} />}
                          <RowAction danger label={`Delete ${name}`} icon={<Trash size={16} />} onClick={() => actions.remove(`/parents/${p.id}`, name, 'Their messages will be deleted; the children’s records are kept.')} />
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
