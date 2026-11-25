import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, KeyRound, Mail, Pencil, Phone, Power, PowerOff, Trash, UserPlus, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CreatedAccount, TeacherDetail, TeacherInput, TeacherListItem } from '../../../shared/types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, ButtonLink, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader,
  SearchInput, Spinner, useDebounced,
} from '../components/ui';
import { api } from '../lib/api';
import { formatDate, fullName, plural, todayIso } from '../lib/format';
import { apiFieldErrors, isEmail, RowAction, useAccountActions } from './StudentsPage';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  employeeNo: string;
  qualification: string;
  specialization: string;
  hiredOn: string;
}

const blank: FormState = { firstName: '', lastName: '', email: '', phone: '', password: '', employeeNo: '', qualification: '', specialization: '', hiredOn: '' };

function TeacherFormDrawer({ open, onClose, teacher }: { open: boolean; onClose: () => void; teacher: TeacherListItem | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = !!teacher;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(teacher ? {
      firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email, phone: teacher.phone ?? '', password: '',
      employeeNo: teacher.employeeNo, qualification: teacher.qualification ?? '', specialization: teacher.specialization ?? '', hiredOn: teacher.hiredOn,
    } : { ...blank, hiredOn: todayIso() });
  }, [open, teacher]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const mutation = useMutation({
    mutationFn: async (payload: TeacherInput) => editing
      ? { record: await api.patch<TeacherDetail>(`/teachers/${teacher!.id}`, payload), temporaryPassword: null }
      : api.post<CreatedAccount<TeacherDetail>>('/teachers', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['teachers'] });
      qc.invalidateQueries({ queryKey: ['teacher'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      const name = fullName(res.record);
      if (res.temporaryPassword) {
        toast.success(`${name} has been added`, <>Sign-in: {res.record.email} · temporary password <code>{res.temporaryPassword}</code>. Share it privately — it won’t be shown again.</>, { sticky: true });
      } else {
        toast.success(editing ? `Saved changes to ${name}` : `${name} has been added`);
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
    const payload: TeacherInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      qualification: form.qualification.trim() || null,
      specialization: form.specialization.trim() || null,
    };
    if (form.employeeNo.trim()) payload.employeeNo = form.employeeNo.trim();
    if (form.hiredOn) payload.hiredOn = form.hiredOn;
    if (!editing && form.password) payload.password = form.password;
    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      title={editing ? `Edit ${fullName(teacher!)}` : 'Add a teacher'}
      description={editing ? 'Update this teacher’s details.' : 'Create a staff account. Required fields are marked *.'}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{editing ? 'Save changes' : 'Add teacher'}</Button>
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
        <Field label="Subject specialisation" error={errors.specialization} hint="e.g. Mathematics">
          <Input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} list="teacher-specialisations" />
        </Field>
        <Field label="Qualification" error={errors.qualification} hint="e.g. BSc Mathematics, PGCE">
          <Input value={form.qualification} onChange={(e) => set('qualification', e.target.value)} />
        </Field>
        <Field label="Employee number" error={errors.employeeNo} hint={editing ? undefined : 'Leave blank to generate one'}>
          <Input value={form.employeeNo} onChange={(e) => set('employeeNo', e.target.value)} className="mono" />
        </Field>
        <Field label="Start date" error={errors.hiredOn}>
          <Input type="date" value={form.hiredOn} onChange={(e) => set('hiredOn', e.target.value)} />
        </Field>
        {!editing && (
          <Field label="Password" className="span-2" error={errors.password} hint="Leave blank and we’ll create a temporary password you can share.">
            <Input value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}
      </div>
      <datalist id="teacher-specialisations">
        {['Mathematics', 'English Language', 'Physics', 'Biology', 'Chemistry', 'History', 'Geography', 'Computer Science', 'Art', 'Music', 'Physical Education'].map((s) => <option key={s} value={s} />)}
      </datalist>
    </Modal>
  );
}

function TeacherDetailDrawer({ id, onClose, onEdit }: { id: number | null; onClose: () => void; onEdit: (t: TeacherListItem) => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['teacher', id],
    queryFn: () => api.get<TeacherDetail>(`/teachers/${id}`),
    enabled: id !== null,
  });
  return (
    <Modal
      open={id !== null}
      onClose={onClose}
      variant="drawer"
      title={data ? fullName(data) : 'Teacher'}
      description={data?.specialization ?? undefined}
      footer={data && (
        <>
          <ButtonLink to={`/timetable?teacherId=${data.id}`}>View timetable</ButtonLink>
          <Button variant="primary" icon={<Pencil size={16} />} onClick={() => onEdit(data)}>Edit</Button>
        </>
      )}
    >
      {isLoading ? <div className="page-loading"><Spinner /></div> : error || !data ? <ErrorState error={error} onRetry={refetch} /> : (
        <div className="stack">
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={fullName(data)} size="lg" color="var(--role-teacher)" />
            <div>
              <div className="row" style={{ gap: 8 }}>
                <span className="bold">{data.employeeNo}</span>
                {data.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Deactivated</Badge>}
              </div>
              <div className="small muted row" style={{ gap: 6 }}><Mail size={14} aria-hidden /><a href={`mailto:${data.email}`}>{data.email}</a></div>
              {data.phone && <div className="small muted row" style={{ gap: 6 }}><Phone size={14} aria-hidden /><a href={`tel:${data.phone}`}>{data.phone}</a></div>}
            </div>
          </div>
          <dl className="kv">
            <dt>Qualification</dt><dd>{data.qualification ?? '—'}</dd>
            <dt>Started</dt><dd>{formatDate(data.hiredOn)}</dd>
            <dt>Class teacher of</dt><dd>{data.homeroomClass ?? '—'}</dd>
          </dl>
          <div>
            <h3 className="mb-2">Courses ({data.courses.length})</h3>
            {data.courses.length === 0 ? (
              <p className="muted small">Not assigned to any courses yet. Assign teachers from a class page.</p>
            ) : (
              <ul className="list card">
                {data.courses.map((c) => (
                  <li key={c.id}>
                    <Link to={`/classes/${c.classId}`} className="list-item">
                      <span className="color-dot" style={{ background: c.color }} aria-hidden />
                      <div className="grow">
                        <div className="title">{c.subjectName}</div>
                        <div className="meta">{c.className} · {plural(c.studentCount, 'student')}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function TeachersPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherListItem | null>(null);
  const focusId = params.get('focus') ? Number(params.get('focus')) : null;
  const actions = useAccountActions([['teachers'], ['teacher']]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['teachers', debounced],
    queryFn: () => api.get<TeacherListItem[]>('/teachers', { search: debounced }),
  });

  const openDetail = (id: number | null) => {
    if (id === null) params.delete('focus');
    else params.set('focus', String(id));
    setParams(params, { replace: true });
  };
  const openForm = (t: TeacherListItem | null) => {
    openDetail(null);
    setEditing(t);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Your teaching staff, their courses and accounts."
        actions={<Button variant="primary" icon={<UserPlus size={18} />} onClick={() => openForm(null)}>Add teacher</Button>}
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, subject or employee no." label="Search teachers" />
          {data && <span className="small muted">{plural(data.length, 'teacher')}</span>}
        </div>
        {isLoading ? (
          <div style={{ padding: 20 }}><CardSkeleton rows={5} /></div>
        ) : error ? (
          <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<UserRound size={26} />}
            title={debounced ? 'No teachers match your search' : 'No teachers yet'}
            action={!debounced && <Button variant="primary" icon={<UserPlus size={17} />} onClick={() => openForm(null)}>Add the first teacher</Button>}
          />
        ) : (
          <div className="table-wrap" style={{ opacity: isFetching ? 0.7 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Teacher</th>
                  <th scope="col">Employee no.</th>
                  <th scope="col">Specialisation</th>
                  <th scope="col" className="num">Courses</th>
                  <th scope="col">Class teacher</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => {
                  const name = fullName(t);
                  return (
                    <tr key={t.id} className="clickable" onClick={() => openDetail(t.id)}>
                      <td>
                        <div className="cell-person">
                          <Avatar name={name} color="var(--role-teacher)" />
                          <div className="truncate">
                            <button type="button" className="name" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); openDetail(t.id); }}>
                              {name}
                            </button>
                            <div className="sub truncate">{t.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{t.employeeNo}</td>
                      <td>{t.specialization ?? <span className="subtle">—</span>}</td>
                      <td className="num">
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><BookOpen size={14} className="subtle" aria-hidden />{t.courseCount}</span>
                      </td>
                      <td>{t.homeroomClass ?? <span className="subtle">—</span>}</td>
                      <td>{t.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Deactivated</Badge>}</td>
                      <td className="actions">
                        <RowAction label={`Edit ${name}`} icon={<Pencil size={16} />} onClick={() => openForm(t)} />
                        <RowAction label={`Reset password for ${name}`} icon={<KeyRound size={16} />} onClick={() => actions.resetPassword(t.id, name)} />
                        {t.isActive
                          ? <RowAction label={`Deactivate ${name}`} icon={<PowerOff size={16} />} onClick={() => actions.setActive(t.id, name, false)} />
                          : <RowAction label={`Reactivate ${name}`} icon={<Power size={16} />} onClick={() => actions.setActive(t.id, name, true)} />}
                        <RowAction
                          danger
                          label={`Delete ${name}`}
                          icon={<Trash size={16} />}
                          onClick={() => actions.remove(`/teachers/${t.id}`, name, 'Their courses will be left without a teacher.')}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <TeacherDetailDrawer id={focusId} onClose={() => openDetail(null)} onEdit={(t) => openForm(t)} />
      <TeacherFormDrawer open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} teacher={editing} />
    </>
  );
}
