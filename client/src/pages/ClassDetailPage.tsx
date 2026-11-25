import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accessibility, BookOpen, CalendarClock, ClipboardCheck, NotebookPen, Pencil, Plus, Trash, UserPlus, UserRound, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ClassDetail, Course, Paginated, StudentListItem, Subject, TeacherListItem } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Badge, Button, ButtonLink, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, PageHeader, PersonCell, SearchInput,
  Select, Spinner, StatCard, Tabs, useDebounced,
} from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { fullName, plural } from '../lib/format';
import { ClassFormModal } from './ClassesPage';
import { StudentFormDrawer } from './StudentsPage';

type TabId = 'students' | 'subjects';

export function ClassDetailPage() {
  const { id } = useParams();
  const classId = Number(id);
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState<TabId>('students');
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
  if (error || !data) return <ErrorState error={error ?? new Error('That class link is not valid.')} onRetry={refetch} />;

  const needs = data.students.filter((s) => s.accessibilityNeeds.length > 0).length;
  const students = filter
    ? data.students.filter((s) => `${fullName(s)} ${s.admissionNo}`.toLowerCase().includes(filter.toLowerCase()))
    : data.students;
  const canGrade = (c: Course) => isAdmin || c.teacherId === user.id || data.homeroomTeacherId === user.id;

  return (
    <>
      <PageHeader
        breadcrumb={<>{isAdmin ? <Link to="/classes">Classes</Link> : <Link to="/my-classes">My classes</Link>}<span aria-hidden>/</span><span>{data.name}</span></>}
        title={data.name}
        description={[data.room ? `Room ${data.room}` : null, data.homeroomTeacherName ? `Class teacher: ${data.homeroomTeacherName}` : 'No class teacher assigned'].filter(Boolean).join(' · ')}
        actions={
          <>
            <ButtonLink to={`/attendance?classId=${data.id}`} icon={<ClipboardCheck size={17} />}>Attendance</ButtonLink>
            <ButtonLink to={`/timetable?classId=${data.id}`} icon={<CalendarClock size={17} />}>Timetable</ButtonLink>
            {isAdmin && <Button icon={<Pencil size={17} />} onClick={() => setEditOpen(true)}>Edit class</Button>}
          </>
        }
      />
      <div className="grid grid-4 mb-3">
        <StatCard icon={<Users size={22} />} label="Students" value={`${data.studentCount} / ${data.capacity}`} tone={data.studentCount >= data.capacity ? 'warning' : 'primary'} hint={data.studentCount >= data.capacity ? 'Class is full' : `${data.capacity - data.studentCount} places free`} />
        <StatCard icon={<BookOpen size={22} />} label="Subjects" value={data.courses.length} tone="accent" hint={`${data.courses.filter((c) => !c.teacherId).length} without a teacher`} />
        <StatCard icon={<UserRound size={22} />} label="Class teacher" value={data.homeroomTeacherName ?? '—'} tone="info" />
        <StatCard icon={<Accessibility size={22} />} label="Support plans" value={needs} tone="success" hint={needs ? 'Students with accessibility needs' : 'None recorded'} />
      </div>

      <Tabs
        label="Class sections"
        value={tab}
        onChange={setTab}
        tabs={[{ id: 'students', label: 'Students', count: data.students.length }, { id: 'subjects', label: 'Subjects & teachers', count: data.courses.length }]}
      />

      {tab === 'students' && (
        <Card>
          <div className="toolbar">
            <SearchInput value={filter} onChange={setFilter} placeholder="Filter this class" label="Filter students in this class" />
            {isAdmin && (
              <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
                <Button icon={<Users size={16} />} onClick={() => setMoveOpen(true)}>Move students in</Button>
                <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setEnrolOpen(true)}>Enrol new</Button>
              </div>
            )}
          </div>
          {students.length === 0 ? (
            <EmptyState icon={<Users size={26} />} title={filter ? 'No students match' : 'No students in this class yet'}>
              {!filter && isAdmin && 'Enrol new students or move existing ones into this class.'}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Admission no.</th>
                    <th scope="col">Gender</th>
                    <th scope="col">Support</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td><PersonCell name={fullName(s)} sub={s.email} to={`/students/${s.id}`} /></td>
                      <td className="mono">{s.admissionNo}</td>
                      <td style={{ textTransform: 'capitalize' }}>{s.gender === 'unspecified' ? '—' : s.gender}</td>
                      <td>
                        {s.accessibilityNeeds.length
                          ? <div className="row row-wrap" style={{ gap: 4 }}>{s.accessibilityNeeds.map((n) => <Badge key={n} tone="info">{n}</Badge>)}</div>
                          : <span className="subtle">—</span>}
                      </td>
                      <td>{s.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Deactivated</Badge>}</td>
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
  const isAdmin = user.role === 'admin';
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const { data: subjects } = useQuery({ queryKey: ['subjects'], queryFn: () => api.get<Subject[]>('/subjects'), enabled: isAdmin });
  const { data: teachers } = useQuery({ queryKey: ['teachers', ''], queryFn: () => api.get<TeacherListItem[]>('/teachers'), enabled: isAdmin });
  const available = subjects?.filter((s) => !cls.courses.some((c) => c.subjectId === s.id)) ?? [];
  const activeTeachers = teachers?.filter((t) => t.isActive) ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['class', cls.id] });
    qc.invalidateQueries({ queryKey: ['classes'] });
    qc.invalidateQueries({ queryKey: ['courses'] });
    qc.invalidateQueries({ queryKey: ['teachers'] });
  };

  const add = useMutation({
    mutationFn: () => api.post<Course>('/courses', { classId: cls.id, subjectId: Number(subjectId), teacherId: teacherId ? Number(teacherId) : null }),
    onSuccess: (c) => {
      toast.success(`${c.subjectName} added to ${cls.name}`);
      setSubjectId('');
      setTeacherId('');
      refresh();
    },
    onError: (err) => toast.error(err),
  });

  const changeTeacher = async (c: Course, value: string) => {
    try {
      const updated = await api.patch<Course>(`/courses/${c.id}`, { teacherId: value ? Number(value) : null });
      toast.success(updated.teacherName ? `${updated.teacherName} now teaches ${c.subjectName}` : `${c.subjectName} has no teacher now`);
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (c: Course) => {
    const ok = await confirm({
      title: `Remove ${c.subjectName} from ${cls.name}?`,
      message: 'Its timetable lessons, assessments and grades for this class will be deleted. This can’t be undone.',
      confirmLabel: 'Remove subject',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/courses/${c.id}`);
      toast.success(`${c.subjectName} removed`);
      refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card>
      <CardHeader title="Subjects taught" subtitle="Each subject has one teacher for this class" />
      {cls.courses.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} title="No subjects yet">{isAdmin ? 'Add the subjects this class studies below.' : 'The school office hasn’t added subjects yet.'}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Teacher</th>
                <th scope="col" className="actions"><span className="sr-only">Actions</span></th>
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
                      <Select className="input-sm" style={{ maxWidth: 260 }} aria-label={`Teacher for ${c.subjectName}`} value={c.teacherId ?? ''} onChange={(e) => changeTeacher(c, e.target.value)}>
                        <option value="">No teacher</option>
                        {activeTeachers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}{t.specialization ? ` · ${t.specialization}` : ''}</option>)}
                        {c.teacherId && !activeTeachers.some((t) => t.id === c.teacherId) && <option value={c.teacherId}>{c.teacherName}</option>}
                      </Select>
                    ) : c.teacherName ?? <Badge tone="warning">No teacher</Badge>}
                  </td>
                  <td className="actions">
                    {canGrade(c) && <ButtonLink to={`/gradebook/${c.id}`} size="sm" variant="ghost" icon={<NotebookPen size={15} />}>Gradebook</ButtonLink>}
                    {isAdmin && <Button variant="ghost" size="sm" iconOnly aria-label={`Remove ${c.subjectName}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(c)} />}
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
              toast.error('Choose a subject to add');
              return;
            }
            add.mutate();
          }}
        >
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject to add" style={{ width: 'auto', minWidth: 200 }} disabled={available.length === 0}>
            <option value="">{available.length ? 'Add a subject…' : 'All subjects added'}</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label="Teacher for the new subject" style={{ width: 'auto', minWidth: 220 }}>
            <option value="">Teacher (optional)</option>
            {activeTeachers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}{t.specialization ? ` · ${t.specialization}` : ''}</option>)}
          </Select>
          <Button type="submit" variant="primary" icon={<Plus size={16} />} loading={add.isPending} disabled={!subjectId}>Add subject</Button>
          {subjects && subjects.length === 0 && <span className="small muted">Create subjects first in <Link to="/academics">Subjects & terms</Link>.</span>}
        </form>
      )}
    </Card>
  );
}

function MoveStudentsModal({ open, onClose, cls }: { open: boolean; onClose: () => void; cls: ClassDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
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
      toast.success(`${plural(selected.size, 'student')} moved into ${cls.name}`);
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
      title={`Move students into ${cls.name}`}
      description={`${plural(Math.max(0, free), 'place')} free. Students leave their current class.`}
      footer={
        <>
          <span className="small muted" style={{ marginRight: 'auto' }} aria-live="polite">{plural(selected.size, 'student')} selected</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={selected.size === 0 || selected.size > free} loading={move.isPending} onClick={() => move.mutate()}>
            Move {selected.size || ''} {selected.size === 1 ? 'student' : 'students'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <SearchInput value={q} onChange={setQ} placeholder="Search students by name or admission no." label="Search students to move" />
        {selected.size > free && <p className="field-error">This class only has room for {free} more.</p>}
        {isFetching && !data ? (
          <div className="page-loading" style={{ minHeight: 120 }}><Spinner /></div>
        ) : candidates.length === 0 ? (
          <p className="muted small">No students found outside this class.</p>
        ) : (
          <ul className="list card" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {candidates.map((s) => (
              <li key={s.id} className="list-item" style={{ padding: '8px 14px' }}>
                <label className="checkbox grow">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s)} />
                  <span>
                    <span className="bold">{fullName(s)}</span>
                    <span className="tiny muted" style={{ display: 'block' }}>{s.admissionNo} · {s.className ? `currently in ${s.className}` : 'no class'}</span>
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
