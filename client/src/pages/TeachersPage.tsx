import { RecordExcelPanel } from '../components/ExcelTools';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, KeyRound, Mail, MailPlus, Pencil, Phone, Power, PowerOff, Settings2, Trash, UserPlus, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Course, CreatedAccount, TeacherDetail, TeacherInput, TeacherListItem } from '../../../shared/types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, ButtonLink, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader,
  SearchInput, SortHeader, sortRows, Spinner, useDebounced, useSort,
} from '../components/ui';
import { api } from '../lib/api';
import { formatDate, fullName, todayIso } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { apiFieldErrors, isEmail, PhotoPicker, RowAction, savePhoto, useAccountActions } from './StudentsPage';

const M = {
  en: {
    title: 'Teachers', desc: 'Your teaching staff, the subjects and classes they teach, and their accounts.', add: 'Add teacher',
    editTitle: 'Edit {name}', addTitle: 'Add a teacher', editDesc: 'Update this teacher’s details and photo.',
    addDesc: 'Create a staff account. Required fields are marked *.', firstName: 'First name', lastName: 'Last name', email: 'Email',
    emailHint: 'Used to sign in', phone: 'Phone', phoneHint: 'e.g. 0777 123 456', specialisation: 'Subject specialisation',
    specHint: 'e.g. Mathematics', qualification: 'Qualification', qualHint: 'e.g. BSc Education (Mathematics)', employeeNo: 'Employee number',
    employeeHint: 'Leave blank to generate one', startDate: 'Start date', password: 'Password',
    passwordHint: 'Leave blank and we’ll create a temporary password you can share.', photo: 'Photo',
    errFirst: 'Enter a first name', errLast: 'Enter a last name', errEmail: 'Enter an email address for signing in',
    errEmailBad: 'That doesn’t look like an email address', errPassword: 'Use at least 8 characters',
    added: '{name} has been added', signInInfo: 'Sign-in: {email} · temporary password', shareInfo: 'Share it privately — it won’t be shown again.',
    savedChanges: 'Saved changes to {name}', photoFailed: 'The details were saved, but the photo could not be uploaded',
    teacher: 'Teacher', viewTimetable: 'View timetable', deactivated: 'Deactivated', started: 'Started', classTeacherOf: 'Class teacher of',
    teaching: 'Subjects and classes taught ({n})', notAssigned: 'Not assigned to any subjects yet. Assign teachers from a class page under “Subjects”.',
    students: '{n} students', manageInClass: 'Manage in class', searchPh: 'Search by name, subject or employee no.', searchLabel: 'Search teachers',
    count: '{n} teachers', noMatch: 'No teachers match your search', none: 'No teachers yet', addFirst: 'Add the first teacher',
    colTeacher: 'Teacher', colEmployee: 'Employee no.', colSpec: 'Specialisation', colCourses: 'Subjects taught', colHomeroom: 'Class teacher',
    colStatus: 'Status', actions: 'Actions', editName: 'Edit {name}', resetName: 'Reset password for {name}', deactivateName: 'Deactivate {name}',
    reactivateName: 'Reactivate {name}', deleteName: 'Delete {name}', deleteConsequence: 'Their subjects will be left without a teacher.',
  },
  sw: {
    title: 'Walimu', desc: 'Walimu wako, masomo na madarasa wanayofundisha, na akaunti zao.', add: 'Ongeza mwalimu',
    editTitle: 'Hariri {name}', addTitle: 'Ongeza mwalimu', editDesc: 'Sasisha taarifa na picha ya mwalimu huyu.',
    addDesc: 'Fungua akaunti ya mfanyakazi. Sehemu za lazima zimewekwa alama *.', firstName: 'Jina la kwanza', lastName: 'Jina la ukoo', email: 'Barua pepe',
    emailHint: 'Hutumika kuingia', phone: 'Simu', phoneHint: 'mf. 0777 123 456', specialisation: 'Somo la utaalamu',
    specHint: 'mf. Hisabati', qualification: 'Kiwango cha elimu', qualHint: 'mf. Shahada ya Elimu (Hisabati)', employeeNo: 'Namba ya mfanyakazi',
    employeeHint: 'Acha wazi ili itengenezwe yenyewe', startDate: 'Tarehe ya kuanza kazi', password: 'Nenosiri',
    passwordHint: 'Acha wazi tutaunda nenosiri la muda utakalompa.', photo: 'Picha',
    errFirst: 'Andika jina la kwanza', errLast: 'Andika jina la ukoo', errEmail: 'Andika barua pepe ya kuingia',
    errEmailBad: 'Hii haionekani kuwa barua pepe sahihi', errPassword: 'Tumia angalau herufi 8',
    added: '{name} ameongezwa', signInInfo: 'Kuingia: {email} · nenosiri la muda', shareInfo: 'Mpe kwa siri — halitaonyeshwa tena.',
    savedChanges: 'Mabadiliko ya {name} yamehifadhiwa', photoFailed: 'Taarifa zimehifadhiwa, lakini picha haikuweza kupakiwa',
    teacher: 'Mwalimu', viewTimetable: 'Tazama ratiba', deactivated: 'Imesimamishwa', started: 'Alianza kazi', classTeacherOf: 'Mwalimu wa darasa la',
    teaching: 'Masomo na madarasa anayofundisha ({n})', notAssigned: 'Bado hajapangiwa somo. Wapange walimu kutoka ukurasa wa darasa chini ya “Masomo”.',
    students: 'Wanafunzi {n}', manageInClass: 'Simamia darasani', searchPh: 'Tafuta kwa jina, somo au namba ya mfanyakazi', searchLabel: 'Tafuta walimu',
    count: 'Walimu {n}', noMatch: 'Hakuna mwalimu anayelingana na utafutaji wako', none: 'Bado hakuna walimu', addFirst: 'Ongeza mwalimu wa kwanza',
    colTeacher: 'Mwalimu', colEmployee: 'Namba ya mfanyakazi', colSpec: 'Utaalamu', colCourses: 'Masomo anayofundisha', colHomeroom: 'Mwalimu wa darasa',
    colStatus: 'Hali', actions: 'Vitendo', editName: 'Hariri {name}', resetName: 'Badilisha nenosiri la {name}', deactivateName: 'Simamisha {name}',
    reactivateName: 'Rejesha {name}', deleteName: 'Futa {name}', deleteConsequence: 'Masomo yake yatabaki bila mwalimu.',
  },
};

const SPECIALISATIONS = ['Mathematics', 'English Language', 'Kiswahili', 'Biology', 'Chemistry', 'Physics', 'Geography', 'History', 'Civics',
  'Islamic Knowledge', 'Arabic', 'Computer Studies', 'Book-keeping', 'Commerce', 'Physical Education'];

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
  const { t: tc } = useI18n();
  const t = useT(M);
  const [form, setForm] = useState<FormState>(blank);
  const [photo, setPhoto] = useState<File | 'remove' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = !!teacher;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPhoto(null);
    setForm(teacher ? {
      firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email, phone: teacher.phone ?? '', password: '',
      employeeNo: teacher.employeeNo, qualification: teacher.qualification ?? '', specialization: teacher.specialization ?? '', hiredOn: teacher.hiredOn,
    } : { ...blank, hiredOn: todayIso() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teacher?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const mutation = useMutation({
    mutationFn: async (payload: TeacherInput) => {
      const res: CreatedAccount<TeacherDetail> = editing
        ? { record: await api.patch<TeacherDetail>(`/teachers/${teacher!.id}`, payload), temporaryPassword: null }
        : await api.post<CreatedAccount<TeacherDetail>>('/teachers', payload);
      let photoError = false;
      if (photo) {
        try {
          await savePhoto(res.record.id, photo);
        } catch {
          photoError = true;
        }
      }
      return { ...res, photoError };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['teachers'] });
      qc.invalidateQueries({ queryKey: ['teacher'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      const name = fullName(res.record);
      if (res.temporaryPassword) {
        toast.success(t('added', { name }), <>{t('signInInfo', { email: res.record.email })} <code>{res.temporaryPassword}</code>. {t('shareInfo')}</>, { sticky: true });
      } else {
        toast.success(editing ? t('savedChanges', { name }) : t('added', { name }));
      }
      if (res.photoError) toast.error(t('photoFailed'));
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
      title={editing ? t('editTitle', { name: fullName(teacher!) }) : t('addTitle')}
      description={editing ? t('editDesc') : t('addDesc')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{editing ? tc('saveChanges') : t('add')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="span-2">
          <PhotoPicker name={`${form.firstName} ${form.lastName}`.trim()} currentUrl={teacher?.photoUrl} value={photo} onChange={setPhoto} />
        </div>
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
        <Field label={t('specialisation')} error={errors.specialization} hint={t('specHint')}>
          <Input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} list="teacher-specialisations" />
        </Field>
        <Field label={t('qualification')} error={errors.qualification} hint={t('qualHint')}>
          <Input value={form.qualification} onChange={(e) => set('qualification', e.target.value)} />
        </Field>
        <Field label={t('employeeNo')} error={errors.employeeNo} hint={editing ? undefined : t('employeeHint')}>
          <Input value={form.employeeNo} onChange={(e) => set('employeeNo', e.target.value)} className="mono" />
        </Field>
        <Field label={t('startDate')} error={errors.hiredOn}>
          <Input type="date" value={form.hiredOn} onChange={(e) => set('hiredOn', e.target.value)} />
        </Field>
        {!editing && (
          <Field label={t('password')} className="span-2" error={errors.password} hint={t('passwordHint')}>
            <Input value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}
      </div>
      <datalist id="teacher-specialisations">
        {SPECIALISATIONS.map((s) => <option key={s} value={s} />)}
      </datalist>
    </Modal>
  );
}

/** Courses grouped by class, so it's clear which classes a teacher has and what they teach in each. */
function groupByClass(courses: Course[]) {
  const map = new Map<number, { classId: number; className: string; courses: Course[] }>();
  for (const c of courses) {
    const g = map.get(c.classId) ?? { classId: c.classId, className: c.className, courses: [] };
    g.courses.push(c);
    map.set(c.classId, g);
  }
  return [...map.values()];
}

function TeacherDetailDrawer({ id, onClose, onEdit }: { id: number | null; onClose: () => void; onEdit: (t: TeacherListItem) => void }) {
  const { t: tc } = useI18n();
  const t = useT(M);
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
      title={data ? fullName(data) : t('teacher')}
      description={data?.specialization ?? undefined}
      footer={data && (
        <>
          <ButtonLink to={`/timetable?teacherId=${data.id}`}>{t('viewTimetable')}</ButtonLink>
          <Button variant="primary" icon={<Pencil size={16} />} onClick={() => onEdit(data)}>{tc('edit')}</Button>
        </>
      )}
    >
      {isLoading ? <div className="page-loading"><Spinner /></div> : error || !data ? <ErrorState error={error} onRetry={refetch} /> : (
        <div className="stack">
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={fullName(data)} size="xl" color="var(--role-teacher)" photoUrl={data.photoUrl} />
            <div>
              <div className="row" style={{ gap: 8 }}>
                <span className="bold mono">{data.employeeNo}</span>
                {data.isActive ? <Badge tone="success" dot>{tc('active')}</Badge> : <Badge dot>{t('deactivated')}</Badge>}
              </div>
              <div className="small muted row" style={{ gap: 6 }}><Mail size={14} aria-hidden /><a href={`mailto:${data.email}`}>{data.email}</a></div>
              {data.phone && <div className="small muted row" style={{ gap: 6 }}><Phone size={14} aria-hidden /><a href={`tel:${data.phone.replace(/\s/g, '')}`}>{data.phone}</a></div>}
            </div>
          </div>
          <dl className="kv">
            <dt>{t('qualification')}</dt><dd>{data.qualification ?? '—'}</dd>
            <dt>{t('started')}</dt><dd>{formatDate(data.hiredOn)}</dd>
            <dt>{t('classTeacherOf')}</dt><dd>{data.homeroomClass ?? '—'}</dd>
          </dl>
          <div>
            <h3 className="mb-2">{t('teaching', { n: data.courses.length })}</h3>
            {data.courses.length === 0 ? (
              <p className="muted small">{t('notAssigned')}</p>
            ) : (
              <div className="stack-sm">
                {groupByClass(data.courses).map((g) => (
                  <div key={g.classId} className="card" style={{ padding: '12px 14px' }}>
                    <div className="row between" style={{ gap: 8 }}>
                      <strong>{g.className}</strong>
                      <Link to={`/classes/${g.classId}?tab=subjects`} className="small bold row" style={{ gap: 4 }}>
                        <Settings2 size={14} aria-hidden /> {t('manageInClass')}
                      </Link>
                    </div>
                    <div className="row row-wrap mt-1" style={{ gap: 6 }}>
                      {g.courses.map((c) => (
                        <span key={c.id} className="chip">
                          <span className="color-dot" style={{ background: c.color }} aria-hidden />
                          {c.subjectName}
                        </span>
                      ))}
                      <span className="tiny muted">{t('students', { n: g.courses[0]!.studentCount })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function TeachersPage() {
  const { t: tc } = useI18n();
  const t = useT(M);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherListItem | null>(null);
  const focusId = params.get('focus') ? Number(params.get('focus')) : null;
  const actions = useAccountActions([['teachers'], ['teacher']]);
  const sort = useSort('name');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['teachers', debounced],
    queryFn: () => api.get<TeacherListItem[]>('/teachers', { search: debounced }),
  });

  const openDetail = (id: number | null) => {
    if (id === null) params.delete('focus');
    else params.set('focus', String(id));
    setParams(params, { replace: true });
  };
  const openForm = (teacher: TeacherListItem | null) => {
    openDetail(null);
    setEditing(teacher);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={
          <>
            <ButtonLink to="/invitations?new=1&as=teacher" icon={<MailPlus size={17} />}>{tc('inviteSomeone')}</ButtonLink>
            <Button variant="primary" icon={<UserPlus size={18} />} onClick={() => openForm(null)}>{t('add')}</Button>
          </>
        }
      />
      <RecordExcelPanel areas={[{ resource: 'teachers', label: 'Teachers' }]} />
      <Card>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder={t('searchPh')} label={t('searchLabel')} />
          {data && <span className="small muted">{t('count', { n: data.length })}</span>}
        </div>
        {isLoading ? (
          <div style={{ padding: 20 }}><CardSkeleton rows={5} /></div>
        ) : error ? (
          <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<UserRound size={26} />}
            title={debounced ? t('noMatch') : t('none')}
            action={!debounced && <Button variant="primary" icon={<UserPlus size={17} />} onClick={() => openForm(null)}>{t('addFirst')}</Button>}
          />
        ) : (
          <div className="table-wrap" style={{ opacity: isFetching ? 0.7 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label={t('colTeacher')} field="name" state={sort} />
                  <SortHeader label={t('colEmployee')} field="employee" state={sort} />
                  <SortHeader label={t('colSpec')} field="spec" state={sort} />
                  <SortHeader label={t('colCourses')} field="courses" state={sort} numeric />
                  <SortHeader label={t('colHomeroom')} field="homeroom" state={sort} />
                  <SortHeader label={t('colStatus')} field="status" state={sort} />
                  <th scope="col" className="actions"><span className="sr-only">{t('actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {sortRows(data, sort, {
                  name: (x) => `${x.lastName} ${x.firstName}`,
                  employee: (x) => x.employeeNo,
                  spec: (x) => x.specialization,
                  courses: (x) => x.courseCount,
                  homeroom: (x) => x.homeroomClass,
                  status: (x) => (x.isActive ? 0 : 1),
                }).map((teacher) => {
                  const name = fullName(teacher);
                  return (
                    <tr key={teacher.id} className="clickable" onClick={() => openDetail(teacher.id)}>
                      <td>
                        <div className="cell-person">
                          <Avatar name={name} color="var(--role-teacher)" photoUrl={teacher.photoUrl} />
                          <div className="truncate">
                            <button type="button" className="name" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }} onClick={(e) => { e.stopPropagation(); openDetail(teacher.id); }}>
                              {name}
                            </button>
                            <div className="sub truncate">{teacher.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{teacher.employeeNo}</td>
                      <td>{teacher.specialization ?? <span className="subtle">—</span>}</td>
                      <td className="num">
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><BookOpen size={14} className="subtle" aria-hidden />{teacher.courseCount}</span>
                      </td>
                      <td>{teacher.homeroomClass ?? <span className="subtle">—</span>}</td>
                      <td>{teacher.isActive ? <Badge tone="success" dot>{tc('active')}</Badge> : <Badge dot>{t('deactivated')}</Badge>}</td>
                      <td className="actions">
                        <RowAction label={t('editName', { name })} icon={<Pencil size={16} />} onClick={() => openForm(teacher)} />
                        <RowAction label={t('resetName', { name })} icon={<KeyRound size={16} />} onClick={() => actions.resetPassword(teacher.id, name)} />
                        {teacher.isActive
                          ? <RowAction label={t('deactivateName', { name })} icon={<PowerOff size={16} />} onClick={() => actions.setActive(teacher.id, name, false)} />
                          : <RowAction label={t('reactivateName', { name })} icon={<Power size={16} />} onClick={() => actions.setActive(teacher.id, name, true)} />}
                        <RowAction
                          danger
                          label={t('deleteName', { name })}
                          icon={<Trash size={16} />}
                          onClick={() => actions.remove(`/teachers/${teacher.id}`, name, t('deleteConsequence'))}
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
      <TeacherDetailDrawer id={focusId} onClose={() => openDetail(null)} onEdit={(teacher) => openForm(teacher)} />
      <TeacherFormDrawer open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} teacher={editing} />
    </>
  );
}
