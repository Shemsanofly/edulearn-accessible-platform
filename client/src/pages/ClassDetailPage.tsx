import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accessibility, BookOpen, CalendarClock, ClipboardCheck, NotebookPen, Pencil, Plus, Trash, UserPlus, UserRound, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ClassDetail, Course, Gender, Paginated, StudentListItem, Subject, TeacherListItem } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, ButtonLink, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, PageHeader, PersonCell, SearchInput,
  Select, Spinner, StatCard, StatGroup, Tabs, useDebounced,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { fullName } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { ClassFormModal } from './ClassesPage';
import { StudentFormDrawer } from './StudentsPage';

type TabId = 'students' | 'subjects';

const M = {
  en: {
    invalid: 'That class link is not valid.', room: 'Room {room}', classTeacher: 'Class teacher: {name}', noClassTeacher: 'No class teacher assigned',
    editClass: 'Edit class', students: 'Students', classFull: 'Class is full', placesFree: '{n} places free', subjects: 'Subjects',
    withoutTeacher: '{n} without a teacher', classTeacherStat: 'Class teacher', supportPlans: 'Support plans', withNeeds: 'Students with accessibility needs',
    noneRecorded: 'None recorded', sections: 'Class sections', subjectsTeachers: 'Subjects & teachers', filterPh: 'Filter this class',
    filterLabel: 'Filter students in this class', moveIn: 'Move students in', enrolNew: 'Enrol new', noMatch: 'No students match',
    noStudents: 'No students in this class yet', emptyHint: 'Enrol new students or move existing ones into this class.',
    colStudent: 'Student', colAdmission: 'Admission no.', colGender: 'Gender', colSupport: 'Support', colStatus: 'Status', deactivated: 'Deactivated',
    male: 'Male', female: 'Female', other: 'Other',
    subjectsTaught: 'Subjects taught', oneTeacher: 'Each subject has one teacher for this class', noSubjects: 'No subjects yet',
    addBelow: 'Add the subjects this class studies below.', officeHasnt: 'The school office hasn’t added subjects yet.',
    colSubject: 'Subject', colTeacher: 'Teacher', actions: 'Actions', teacherFor: 'Teacher for {subject}', noTeacher: 'No teacher',
    gradebook: 'Gradebook', removeSubject: 'Remove {subject}', addSubjectPh: 'Add a subject…', allAdded: 'All subjects added',
    subjectToAdd: 'Subject to add', teacherNew: 'Teacher for the new subject', teacherOptional: 'Teacher (optional)', addSubject: 'Add subject',
    createFirst: 'Create subjects first in', chooseSubject: 'Choose a subject to add', added: '{subject} added to {cls}',
    nowTeaches: '{teacher} now teaches {subject}', noTeacherNow: '{subject} has no teacher now', removeTitle: 'Remove {subject} from {cls}?',
    removeMsg: 'Its timetable lessons, assessments and grades for this class will be deleted. This can’t be undone.', removeConfirm: 'Remove subject',
    removed: '{subject} removed',
    moveTitle: 'Move students into {cls}', moveDesc: '{n} places free. Students leave their current class.', selected: '{n} selected',
    moveBtn: 'Move {n} students', searchMove: 'Search students by name or admission no.', searchMoveLabel: 'Search students to move',
    roomOnly: 'This class only has room for {n} more.', noneOutside: 'No students found outside this class.', currentlyIn: 'currently in {cls}',
    noClass: 'no class', moved: '{n} students moved into {cls}',
  },
  sw: {
    invalid: 'Kiungo hiki cha darasa si sahihi.', room: 'Chumba {room}', classTeacher: 'Mwalimu wa darasa: {name}', noClassTeacher: 'Hakuna mwalimu wa darasa',
    editClass: 'Hariri darasa', students: 'Wanafunzi', classFull: 'Darasa limejaa', placesFree: 'Nafasi {n} zipo wazi', subjects: 'Masomo',
    withoutTeacher: '{n} bila mwalimu', classTeacherStat: 'Mwalimu wa darasa', supportPlans: 'Mipango ya msaada', withNeeds: 'Wanafunzi wenye mahitaji maalum',
    noneRecorded: 'Hakuna iliyorekodiwa', sections: 'Sehemu za darasa', subjectsTeachers: 'Masomo na walimu', filterPh: 'Chuja darasa hili',
    filterLabel: 'Chuja wanafunzi wa darasa hili', moveIn: 'Hamishia wanafunzi', enrolNew: 'Sajili mpya', noMatch: 'Hakuna mwanafunzi anayelingana',
    noStudents: 'Bado hakuna wanafunzi katika darasa hili', emptyHint: 'Sajili wanafunzi wapya au hamishia waliopo kwenye darasa hili.',
    colStudent: 'Mwanafunzi', colAdmission: 'Namba ya usajili', colGender: 'Jinsia', colSupport: 'Msaada', colStatus: 'Hali', deactivated: 'Imesimamishwa',
    male: 'Me', female: 'Ke', other: 'Nyingine',
    subjectsTaught: 'Masomo yanayofundishwa', oneTeacher: 'Kila somo lina mwalimu mmoja kwa darasa hili', noSubjects: 'Bado hakuna masomo',
    addBelow: 'Ongeza masomo ya darasa hili hapa chini.', officeHasnt: 'Ofisi ya shule bado haijaongeza masomo.',
    colSubject: 'Somo', colTeacher: 'Mwalimu', actions: 'Vitendo', teacherFor: 'Mwalimu wa {subject}', noTeacher: 'Hakuna mwalimu',
    gradebook: 'Daftari la alama', removeSubject: 'Ondoa {subject}', addSubjectPh: 'Ongeza somo…', allAdded: 'Masomo yote yameongezwa',
    subjectToAdd: 'Somo la kuongeza', teacherNew: 'Mwalimu wa somo jipya', teacherOptional: 'Mwalimu (si lazima)', addSubject: 'Ongeza somo',
    createFirst: 'Unda masomo kwanza katika', chooseSubject: 'Chagua somo la kuongeza', added: '{subject} limeongezwa {cls}',
    nowTeaches: '{teacher} sasa anafundisha {subject}', noTeacherNow: '{subject} halina mwalimu sasa', removeTitle: 'Ondoa {subject} kutoka {cls}?',
    removeMsg: 'Vipindi vya ratiba, tathmini na alama za somo hili kwa darasa hili zitafutwa. Hatua hii haiwezi kurudishwa.', removeConfirm: 'Ondoa somo',
    removed: '{subject} limeondolewa',
    moveTitle: 'Hamishia wanafunzi {cls}', moveDesc: 'Nafasi {n} zipo wazi. Wanafunzi wataondoka kwenye darasa lao la sasa.', selected: 'Wamechaguliwa {n}',
    moveBtn: 'Hamisha wanafunzi {n}', searchMove: 'Tafuta wanafunzi kwa jina au namba ya usajili', searchMoveLabel: 'Tafuta wanafunzi wa kuhamisha',
    roomOnly: 'Darasa hili lina nafasi ya wanafunzi {n} tu zaidi.', noneOutside: 'Hakuna wanafunzi nje ya darasa hili.', currentlyIn: 'kwa sasa yuko {cls}',
    noClass: 'hana darasa', moved: 'Wanafunzi {n} wamehamishiwa {cls}',
  },
};

type Msg = keyof typeof M.en;
const genderLabel = (g: Gender, t: (k: Msg) => string) => (g === 'unspecified' ? '—' : t(g));

export function ClassDetailPage() {
  const { id } = useParams();
  const classId = Number(id);
  const user = useUser();
  const { t: tc } = useI18n();
  const t = useT(M);
  const isAdmin = user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'subjects' ? 'subjects' : 'students';
  const setTab = (next: TabId) => {
    if (next === 'students') params.delete('tab');
    else params.set('tab', next);
    setParams(params, { replace: true });
  };
  const [editOpen, setEditOpen] = useState(false);
  const [enrolOpen, setEnrolOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api.get<ClassDetail>(`/classes/${classId}`),
    enabled: Number.isInteger(classId) && classId > 0,
  });

  if (isLoading) {
    return (
      <div className="stack">
        <CardSkeleton rows={1} />
        <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} rows={1} />)}</div>
        <CardSkeleton rows={6} />
      </div>
    );
  }
  if (error || !data) return <ErrorState error={error ?? new Error(t('invalid'))} onRetry={refetch} />;

  const needs = data.students.filter((s) => s.accessibilityNeeds.length > 0).length;
  const students = filter
    ? data.students.filter((s) => `${fullName(s)} ${s.admissionNo}`.toLowerCase().includes(filter.toLowerCase()))
    : data.students;
  const canGrade = (c: Course) => isAdmin || c.teacherId === user.id || data.homeroomTeacherId === user.id;

  return (
    <>
      <PageHeader
        breadcrumb={<>{isAdmin ? <Link to="/classes">{tc('classes')}</Link> : <Link to="/my-classes">{tc('myClasses')}</Link>}<span aria-hidden>/</span><span>{data.name}</span></>}
        title={data.name}
        description={[data.room ? t('room', { room: data.room }) : null, data.homeroomTeacherName ? t('classTeacher', { name: data.homeroomTeacherName }) : t('noClassTeacher')].filter(Boolean).join(' · ')}
        actions={
          <>
            <ButtonLink to={`/attendance?classId=${data.id}`} icon={<ClipboardCheck size={17} />}>{tc('attendance')}</ButtonLink>
            <ButtonLink to={`/timetable?classId=${data.id}`} icon={<CalendarClock size={17} />}>{tc('timetable')}</ButtonLink>
            {isAdmin && <Button icon={<Pencil size={17} />} onClick={() => setEditOpen(true)}>{t('editClass')}</Button>}
          </>
        }
      />
      <StatGroup className="mb-3">
        <StatCard icon={<Users size={16} />} label={t('students')} value={`${data.studentCount} / ${data.capacity}`} tone={data.studentCount >= data.capacity ? 'warning' : 'primary'} hint={data.studentCount >= data.capacity ? t('classFull') : t('placesFree', { n: data.capacity - data.studentCount })} />
        <StatCard icon={<BookOpen size={16} />} label={t('subjects')} value={data.courses.length} tone="accent" hint={t('withoutTeacher', { n: data.courses.filter((c) => !c.teacherId).length })} />
        <StatCard icon={<UserRound size={16} />} label={t('classTeacherStat')} value={data.homeroomTeacherName ?? '—'} tone="info" />
        <StatCard icon={<Accessibility size={16} />} label={t('supportPlans')} value={needs} tone="success" hint={needs ? t('withNeeds') : t('noneRecorded')} />
      </StatGroup>

      <Tabs
        label={t('sections')}
        value={tab}
        onChange={setTab}
        tabs={[{ id: 'students', label: t('students'), count: data.students.length }, { id: 'subjects', label: t('subjectsTeachers'), count: data.courses.length }]}
      />

      {tab === 'students' && (
        <Card>
          <div className="toolbar">
            <SearchInput value={filter} onChange={setFilter} placeholder={t('filterPh')} label={t('filterLabel')} />
            {isAdmin && (
              <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
                <Button icon={<Users size={16} />} onClick={() => setMoveOpen(true)}>{t('moveIn')}</Button>
                <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setEnrolOpen(true)}>{t('enrolNew')}</Button>
              </div>
            )}
          </div>
          {students.length === 0 ? (
            <EmptyState icon={<Users size={26} />} title={filter ? t('noMatch') : t('noStudents')}>
              {!filter && isAdmin && t('emptyHint')}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('colStudent')}</th>
                    <th scope="col">{t('colAdmission')}</th>
                    <th scope="col">{t('colGender')}</th>
                    <th scope="col">{t('colSupport')}</th>
                    <th scope="col">{t('colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td><PersonCell name={fullName(s)} sub={s.email} to={`/students/${s.id}`} photoUrl={s.photoUrl} /></td>
                      <td className="mono">{s.admissionNo}</td>
                      <td>{genderLabel(s.gender, t)}</td>
                      <td>
                        {s.accessibilityNeeds.length
                          ? <div className="row row-wrap" style={{ gap: 4 }}>{s.accessibilityNeeds.map((n) => <Badge key={n} tone="info">{n}</Badge>)}</div>
                          : <span className="subtle">—</span>}
                      </td>
                      <td>{s.isActive ? <Badge tone="success" dot>{tc('active')}</Badge> : <Badge dot>{t('deactivated')}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'subjects' && <SubjectsTab cls={data} canGrade={canGrade} />}

      {isAdmin && (
        <>
          <ClassFormModal open={editOpen} onClose={() => setEditOpen(false)} cls={data} />
          <StudentFormDrawer open={enrolOpen} onClose={() => setEnrolOpen(false)} defaultClassId={data.id} />
          <MoveStudentsModal open={moveOpen} onClose={() => setMoveOpen(false)} cls={data} />
        </>
      )}
    </>
  );
}

function SubjectsTab({ cls, canGrade }: { cls: ClassDetail; canGrade: (c: Course) => boolean }) {
  const user = useUser();
  const t = useT(M);
  const { t: tc } = useI18n();
  const isAdmin = user.role === 'admin';
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const { data: subjects } = useQuery({ queryKey: ['subjects'], queryFn: () => api.get<Subject[]>('/subjects'), enabled: isAdmin });
  const { data: teachers } = useQuery({ queryKey: ['teachers', ''], queryFn: () => api.get<TeacherListItem[]>('/teachers'), enabled: isAdmin });
  const available = subjects?.filter((s) => !cls.courses.some((c) => c.subjectId === s.id)) ?? [];
  const activeTeachers = teachers?.filter((x) => x.isActive) ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['class', cls.id] });
    qc.invalidateQueries({ queryKey: ['classes'] });
    qc.invalidateQueries({ queryKey: ['courses'] });
    qc.invalidateQueries({ queryKey: ['teachers'] });
    qc.invalidateQueries({ queryKey: ['teacher'] });
  };

  const add = useMutation({
    mutationFn: () => api.post<Course>('/courses', { classId: cls.id, subjectId: Number(subjectId), teacherId: teacherId ? Number(teacherId) : null }),
    onSuccess: (c) => {
      toast.success(t('added', { subject: c.subjectName, cls: cls.name }));
      setSubjectId('');
      setTeacherId('');
      refresh();
    },
    onError: (err) => toast.error(err),
  });

  const changeTeacher = async (c: Course, value: string) => {
    try {
      const updated = await api.patch<Course>(`/courses/${c.id}`, { teacherId: value ? Number(value) : null });
      toast.success(updated.teacherName ? t('nowTeaches', { teacher: updated.teacherName, subject: c.subjectName }) : t('noTeacherNow', { subject: c.subjectName }));
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (c: Course) => {
    const ok = await confirm({
      title: t('removeTitle', { subject: c.subjectName, cls: cls.name }),
      message: t('removeMsg'),
      confirmLabel: t('removeConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/courses/${c.id}`);
      toast.success(t('removed', { subject: c.subjectName }));
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card>
      <CardHeader title={t('subjectsTaught')} subtitle={t('oneTeacher')} />
      {cls.courses.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title={t('noSubjects')}>{isAdmin ? t('addBelow') : t('officeHasnt')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('colSubject')}</th>
                <th scope="col">{t('colTeacher')}</th>
                <th scope="col" className="actions"><span className="sr-only">{t('actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {cls.courses.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="row" style={{ gap: 10 }}>
                      <span className="color-dot" style={{ background: c.color }} aria-hidden />
                      <span className="bold">{c.subjectName}</span>
                      <span className="tiny muted mono">{c.subjectCode}</span>
                    </span>
                  </td>
                  <td>
                    {isAdmin ? (
                      <Select className="input-sm" style={{ maxWidth: 260 }} aria-label={t('teacherFor', { subject: c.subjectName })} value={c.teacherId ?? ''} onChange={(e) => changeTeacher(c, e.target.value)}>
                        <option value="">{t('noTeacher')}</option>
                        {activeTeachers.map((x) => <option key={x.id} value={x.id}>{fullName(x)}{x.specialization ? ` · ${x.specialization}` : ''}</option>)}
                        {c.teacherId && !activeTeachers.some((x) => x.id === c.teacherId) && <option value={c.teacherId}>{c.teacherName}</option>}
                      </Select>
                    ) : c.teacherName ?? <Badge tone="warning">{t('noTeacher')}</Badge>}
                  </td>
                  <td className="actions">
                    {canGrade(c) && <ButtonLink to={`/gradebook/${c.id}`} size="sm" variant="ghost" icon={<NotebookPen size={15} />}>{t('gradebook')}</ButtonLink>}
                    {isAdmin && <Button variant="ghost" size="sm" iconOnly aria-label={t('removeSubject', { subject: c.subjectName })} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(c)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isAdmin && (
        <form
          className="card-footer row-wrap"
          style={{ justifyContent: 'flex-start' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!subjectId) {
              toast.error(t('chooseSubject'));
              return;
            }
            add.mutate();
          }}
        >
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label={t('subjectToAdd')} style={{ width: 'auto', minWidth: 200 }} disabled={available.length === 0}>
            <option value="">{available.length ? t('addSubjectPh') : t('allAdded')}</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label={t('teacherNew')} style={{ width: 'auto', minWidth: 220 }}>
            <option value="">{t('teacherOptional')}</option>
            {activeTeachers.map((x) => <option key={x.id} value={x.id}>{fullName(x)}{x.specialization ? ` · ${x.specialization}` : ''}</option>)}
          </Select>
          <Button type="submit" variant="primary" icon={<Plus size={16} />} loading={add.isPending} disabled={!subjectId}>{t('addSubject')}</Button>
          {subjects && subjects.length === 0 && <span className="small muted">{t('createFirst')} <Link to="/academics">{tc('subjectsTerms')}</Link>.</span>}
        </form>
      )}
    </Card>
  );
}

function MoveStudentsModal({ open, onClose, cls }: { open: boolean; onClose: () => void; cls: ClassDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { t: tc } = useI18n();
  const t = useT(M);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Map<number, StudentListItem>>(new Map());
  const debounced = useDebounced(q, 250);

  useEffect(() => {
    if (open) {
      setQ('');
      setSelected(new Map());
    }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ['students', 'move', debounced],
    queryFn: () => api.get<Paginated<StudentListItem>>('/students', { search: debounced, pageSize: 25, status: 'active' }),
    enabled: open,
  });
  const candidates = useMemo(() => (data?.items ?? []).filter((s) => s.classId !== cls.id), [data, cls.id]);
  const free = cls.capacity - cls.studentCount;

  const move = useMutation({
    mutationFn: () => api.post(`/classes/${cls.id}/students`, { studentIds: [...selected.keys()] }),
    onSuccess: () => {
      toast.success(t('moved', { n: selected.size, cls: cls.name }));
      qc.invalidateQueries({ queryKey: ['class'] });
      qc.invalidateQueries({ queryKey: ['classes'] });
      qc.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (err) => toast.error(err),
  });

  const toggle = (s: StudentListItem) => {
    setSelected((m) => {
      const next = new Map(m);
      if (next.has(s.id)) next.delete(s.id);
      else next.set(s.id, s);
      return next;
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('moveTitle', { cls: cls.name })}
      description={t('moveDesc', { n: Math.max(0, free) })}
      footer={
        <>
          <span className="small muted" style={{ marginRight: 'auto' }} aria-live="polite">{t('selected', { n: selected.size })}</span>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button variant="primary" disabled={selected.size === 0 || selected.size > free} loading={move.isPending} onClick={() => move.mutate()}>
            {t('moveBtn', { n: selected.size || '' })}
          </Button>
        </>
      }
    >
      <div className="stack">
        <SearchInput value={q} onChange={setQ} placeholder={t('searchMove')} label={t('searchMoveLabel')} />
        {selected.size > free && <p className="field-error">{t('roomOnly', { n: free })}</p>}
        {isFetching && !data ? (
          <div className="page-loading" style={{ minHeight: 120 }}><Spinner /></div>
        ) : candidates.length === 0 ? (
          <p className="muted small">{t('noneOutside')}</p>
        ) : (
          <ul className="list card" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {candidates.map((s) => (
              <li key={s.id} className="list-item" style={{ padding: '8px 14px' }}>
                <label className="checkbox grow">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s)} />
                  <Avatar name={fullName(s)} size="sm" photoUrl={s.photoUrl} />
                  <span>
                    <span className="bold">{fullName(s)}</span>
                    <span className="tiny muted" style={{ display: 'block' }}>{s.admissionNo} · {s.className ? t('currentlyIn', { cls: s.className }) : t('noClass')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
