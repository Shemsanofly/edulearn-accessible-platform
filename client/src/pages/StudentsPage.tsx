import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, KeyRound, Pencil, Plus, Power, PowerOff, Trash, UserPlus, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  ClassListItem, CreatedAccount, Gender, Paginated, StudentDetail, StudentInput, StudentListItem,
} from '../../../shared/types';
import { useConfirm, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, PersonCell,
  SearchInput, Select, Textarea, useDebounced,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDate, fullName, todayIso } from '../lib/format';

export const ACCESSIBILITY_SUGGESTIONS = [
  'Sign language support',
  'Extra time in exams',
  'Large print materials',
  'Screen reader',
  'Hearing loop',
  'Wheelchair access',
  'Quiet space',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());
export const apiFieldErrors = (err: unknown): Record<string, string> =>
  err instanceof ApiError && err.details ? err.details : {};

// ---------------------------------------------------------------------------
// Account actions shared by the student, teacher and parent admin pages
// ---------------------------------------------------------------------------
export function useAccountActions(invalidate: unknown[][]) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const refresh = () => {
    invalidate.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return {
    async resetPassword(id: number, name: string) {
      const ok = await confirm({
        title: `Reset ${name}'s password?`,
        message: 'A new temporary password will be created. Their current password stops working straight away.',
        confirmLabel: 'Reset password',
      });
      if (!ok) return;
      try {
        const res = await api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`);
        toast.success(
          `New password for ${name}`,
          <>Temporary password: <code>{res.temporaryPassword}</code> — share it privately. It won’t be shown again.</>,
          { sticky: true },
        );
      } catch (err) {
        toast.error(err);
      }
    },
    async setActive(id: number, name: string, isActive: boolean) {
      if (!isActive) {
        const ok = await confirm({
          title: `Deactivate ${name}?`,
          message: 'They won’t be able to sign in until the account is reactivated. Their records are kept.',
          confirmLabel: 'Deactivate',
          danger: true,
        });
        if (!ok) return;
      }
      try {
        await api.patch(`/users/${id}/status`, { isActive });
        toast.success(isActive ? `${name} can sign in again` : `${name} has been deactivated`);
        refresh();
      } catch (err) {
        toast.error(err);
      }
    },
    async remove(path: string, name: string, consequence: string): Promise<boolean> {
      const ok = await confirm({
        title: `Delete ${name}?`,
        message: `${consequence} This can’t be undone — consider deactivating instead.`,
        confirmLabel: 'Delete permanently',
        danger: true,
      });
      if (!ok) return false;
      try {
        await api.del(path);
        toast.success(`${name} was deleted`);
        refresh();
        return true;
      } catch (err) {
        toast.error(err);
        return false;
      }
    },
  };
}

/** Small icon button used in table rows; stops the click from opening the row. */
export function RowAction({ label, icon, onClick, danger }: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={label}
      title={label}
      icon={icon}
      className={danger ? 'text-danger' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Student form (create + edit) — also used on the profile page
// ---------------------------------------------------------------------------
interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  admissionNo: string;
  classId: string;
  dateOfBirth: string;
  gender: Gender;
  address: string;
  medicalNotes: string;
  accessibilityNeeds: string[];
}

const blank: FormState = {
  firstName: '', lastName: '', email: '', phone: '', password: '', admissionNo: '', classId: '', dateOfBirth: '',
  gender: 'unspecified', address: '', medicalNotes: '', accessibilityNeeds: [],
};

function fromStudent(s: StudentDetail): FormState {
  return {
    firstName: s.firstName, lastName: s.lastName, email: s.email, phone: s.phone ?? '', password: '',
    admissionNo: s.admissionNo, classId: s.classId ? String(s.classId) : '', dateOfBirth: s.dateOfBirth ?? '',
    gender: s.gender, address: s.address ?? '', medicalNotes: s.medicalNotes ?? '', accessibilityNeeds: s.accessibilityNeeds,
  };
}

export function StudentFormDrawer({ open, onClose, student, defaultClassId, onSaved }: {
  open: boolean;
  onClose: () => void;
  /** Pass a student to edit; omit to enrol a new one. */
  student?: StudentDetail | null;
  defaultClassId?: number;
  onSaved?: (s: StudentDetail) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [needDraft, setNeedDraft] = useState('');
  const editing = !!student;

  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: () => api.get<ClassListItem[]>('/classes'), enabled: open });

  useEffect(() => {
    if (!open) return;
    setForm(student ? fromStudent(student) : { ...blank, classId: defaultClassId ? String(defaultClassId) : '' });
    setErrors({});
    setNeedDraft('');
    // Reset only when opened or a different student is chosen, so a background refetch never wipes edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student?.id, defaultClassId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const addNeed = (raw: string) => {
    const need = raw.trim();
    if (!need) return;
    if (!form.accessibilityNeeds.some((n) => n.toLowerCase() === need.toLowerCase())) {
      set('accessibilityNeeds', [...form.accessibilityNeeds, need]);
    }
    setNeedDraft('');
  };

  const mutation = useMutation({
    mutationFn: async (payload: StudentInput) => {
      if (editing) return { record: await api.patch<StudentDetail>(`/students/${student!.id}`, payload), temporaryPassword: null };
      return api.post<CreatedAccount<StudentDetail>>('/students', payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student-overview'] });
      qc.invalidateQueries({ queryKey: ['classes'] });
      qc.invalidateQueries({ queryKey: ['class'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      const name = fullName(res.record);
      if (res.temporaryPassword) {
        toast.success(
          `${name} is enrolled`,
          <>Sign-in: {res.record.email} · temporary password <code>{res.temporaryPassword}</code>. Share it privately — it won’t be shown again.</>,
          { sticky: true },
        );
      } else {
        toast.success(editing ? `Saved changes to ${name}` : `${name} is enrolled`);
      }
      onSaved?.(res.record);
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
    if (form.dateOfBirth && form.dateOfBirth > todayIso()) e.dateOfBirth = 'Date of birth can’t be in the future';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const payload: StudentInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      classId: form.classId ? Number(form.classId) : null,
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender,
      address: form.address.trim() || null,
      medicalNotes: form.medicalNotes.trim() || null,
      accessibilityNeeds: form.accessibilityNeeds,
    };
    if (form.admissionNo.trim()) payload.admissionNo = form.admissionNo.trim();
    if (!editing && form.password) payload.password = form.password;
    mutation.mutate(payload);
  };

  const suggestions = ACCESSIBILITY_SUGGESTIONS.filter((s) => !form.accessibilityNeeds.includes(s));

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      title={editing ? `Edit ${fullName(student!)}` : 'Enrol a new student'}
      description={editing ? 'Update the student’s details and class.' : 'Create the student’s account. Required fields are marked *.'}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} icon={editing ? undefined : <UserPlus size={17} />}>
            {editing ? 'Save changes' : 'Enrol student'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-section-title span-2">Personal details</div>
        <Field label="First name" required error={errors.firstName}>
          <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" data-autofocus />
        </Field>
        <Field label="Last name" required error={errors.lastName}>
          <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Date of birth" error={errors.dateOfBirth}>
          <Input type="date" value={form.dateOfBirth} max={todayIso()} onChange={(e) => set('dateOfBirth', e.target.value)} />
        </Field>
        <Field label="Gender" error={errors.gender}>
          <Select value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
            <option value="unspecified">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Home address" className="span-2" error={errors.address}>
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>

        <div className="form-section-title span-2">School</div>
        <Field label="Class" hint="You can change this later" error={errors.classId}>
          <Select value={form.classId} onChange={(e) => set('classId', e.target.value)}>
            <option value="">Not assigned yet</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id} disabled={c.studentCount >= c.capacity && String(c.id) !== form.classId}>
                {c.name} ({c.studentCount}/{c.capacity}{c.studentCount >= c.capacity ? ', full' : ''})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Admission number" hint={editing ? undefined : 'Leave blank to generate one'} error={errors.admissionNo}>
          <Input value={form.admissionNo} onChange={(e) => set('admissionNo', e.target.value)} placeholder="STU-2026-0001" className="mono" />
        </Field>

        <div className="form-section-title span-2">Sign-in & contact</div>
        <Field label="Email" required error={errors.email} hint="Used to sign in">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        {!editing && (
          <Field label="Password" className="span-2" error={errors.password} hint="Leave blank and we’ll create a temporary password you can share.">
            <Input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}

        <div className="form-section-title span-2">Support & wellbeing</div>
        <div className="field span-2">
          <label className="field-label" htmlFor="need-input">Accessibility needs</label>
          {form.accessibilityNeeds.length > 0 && (
            <ul className="row row-wrap list" style={{ gap: 6 }} aria-label="Current accessibility needs">
              {form.accessibilityNeeds.map((n) => (
                <li key={n} className="chip">
                  {n}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    style={{ width: 22, height: 22 }}
                    aria-label={`Remove ${n}`}
                    onClick={() => set('accessibilityNeeds', form.accessibilityNeeds.filter((x) => x !== n))}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ gap: 8 }}>
            <Input
              id="need-input"
              value={needDraft}
              placeholder="Type a need and press Enter"
              onChange={(e) => setNeedDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNeed(needDraft);
                }
              }}
            />
            <Button onClick={() => addNeed(needDraft)} disabled={!needDraft.trim()} icon={<Plus size={16} />}>Add</Button>
          </div>
          {suggestions.length > 0 && (
            <div className="row row-wrap" style={{ gap: 6 }}>
              <span className="tiny muted">Suggestions:</span>
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip" style={{ cursor: 'pointer' }} onClick={() => addNeed(s)}>
                  <Plus size={12} aria-hidden /> {s}
                </button>
              ))}
            </div>
          )}
          <span className="field-hint">Teachers see these so they can plan support.</span>
        </div>
        <Field label="Medical notes" className="span-2" hint="Allergies, medication or conditions staff should know about" error={errors.medicalNotes}>
          <Textarea value={form.medicalNotes} onChange={(e) => set('medicalNotes', e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Students list
// ---------------------------------------------------------------------------
export function StudentsPage() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [classId, setClassId] = useState(params.get('classId') ?? '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StudentDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const debounced = useDebounced(search);
  const actions = useAccountActions([['students']]);
  const toast = useToast();

  useEffect(() => setPage(1), [debounced, classId, status]);

  useEffect(() => {
    if (isAdmin && params.get('new') === '1') {
      setEditing(null);
      setFormOpen(true);
    }
  }, [params, isAdmin]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    if (params.has('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  };

  const { data: classes } = useQuery({
    queryKey: ['classes', user.role === 'teacher' ? 'mine' : 'all'],
    queryFn: () => api.get<ClassListItem[]>('/classes', user.role === 'teacher' ? { mine: true } : undefined),
  });

  const query = useQuery({
    queryKey: ['students', { search: debounced, classId, status, page }],
    queryFn: () => api.get<Paginated<StudentListItem>>('/students', { search: debounced, classId, status, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  const openEdit = async (id: number) => {
    try {
      setEditing(await api.get<StudentDetail>(`/students/${id}`));
      setFormOpen(true);
    } catch (err) {
      toast.error(err);
    }
  };

  const data = query.data;
  const filtered = !!(debounced || classId || status);

  return (
    <>
      <PageHeader
        title="Students"
        description={isAdmin ? 'Enrol students, keep their details up to date and manage their accounts.' : 'Students in the classes you teach.'}
        actions={isAdmin && (
          <Button variant="primary" icon={<UserPlus size={18} />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            Enrol student
          </Button>
        )}
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or admission no." label="Search students" />
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class">
            <option value="">All classes</option>
            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {isAdmin && (
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by account status">
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </Select>
          )}
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setClassId(''); setStatus(''); }}>Clear filters</Button>
          )}
        </div>

        {query.isLoading ? (
          <div style={{ padding: 20 }}><CardSkeleton rows={6} /></div>
        ) : query.error ? (
          <div style={{ padding: 20 }}><ErrorState error={query.error} onRetry={query.refetch} /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={26} />}
            title={filtered ? 'No students match those filters' : 'No students yet'}
            action={filtered
              ? <Button onClick={() => { setSearch(''); setClassId(''); setStatus(''); }}>Clear filters</Button>
              : isAdmin && <Button variant="primary" icon={<UserPlus size={17} />} onClick={() => setFormOpen(true)}>Enrol the first student</Button>}
          >
            {filtered ? 'Try a different name or class.' : isAdmin ? 'Enrol students to start tracking attendance, grades and fees.' : 'You’ll see students here once you’re assigned to a class.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: query.isFetching && query.isPlaceholderData ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Admission no.</th>
                    <th scope="col">Class</th>
                    <th scope="col">Date of birth</th>
                    <th scope="col">Support</th>
                    <th scope="col">Status</th>
                    {isAdmin && <th scope="col" className="actions"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => {
                    const name = fullName(s);
                    return (
                      <tr key={s.id} className="clickable" onClick={() => navigate(`/students/${s.id}`)}>
                        <td><PersonCell name={name} sub={s.email} to={`/students/${s.id}`} /></td>
                        <td className="mono">{s.admissionNo}</td>
                        <td>{s.className ?? <span className="subtle">Unassigned</span>}</td>
                        <td className="num">{formatDate(s.dateOfBirth)}</td>
                        <td>
                          {s.accessibilityNeeds.length ? (
                            <Badge tone="info" title={s.accessibilityNeeds.join(', ')}>
                              {s.accessibilityNeeds.length === 1 ? s.accessibilityNeeds[0] : `${s.accessibilityNeeds.length} needs`}
                            </Badge>
                          ) : <span className="subtle">—</span>}
                        </td>
                        <td>{s.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Deactivated</Badge>}</td>
                        {isAdmin && (
                          <td className="actions">
                            <RowAction label={`Edit ${name}`} icon={<Pencil size={16} />} onClick={() => openEdit(s.id)} />
                            <RowAction label={`Reset password for ${name}`} icon={<KeyRound size={16} />} onClick={() => actions.resetPassword(s.id, name)} />
                            {s.isActive
                              ? <RowAction label={`Deactivate ${name}`} icon={<PowerOff size={16} />} onClick={() => actions.setActive(s.id, name, false)} />
                              : <RowAction label={`Reactivate ${name}`} icon={<Power size={16} />} onClick={() => actions.setActive(s.id, name, true)} />}
                            <RowAction
                              danger
                              label={`Delete ${name}`}
                              icon={<Trash size={16} />}
                              onClick={() => actions.remove(`/students/${s.id}`, name, 'All of their grades, attendance and invoices will be deleted too.')}
                            />
                          </td>
                        )}
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
      {isAdmin && <StudentFormDrawer open={formOpen} onClose={closeForm} student={editing} />}
    </>
  );
}
