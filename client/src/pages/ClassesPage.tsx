import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, DoorOpen, Pencil, Plus, School, Trash, UserRound, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClassInput, ClassListItem, TeacherListItem } from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Badge, Button, ButtonLink, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, ProgressBar, Select,
  StatCard,
} from '../components/ui';
import { api } from '../lib/api';
import { fullName, plural, type Tone } from '../lib/format';
import { apiFieldErrors } from './StudentsPage';

interface FormState {
  name: string;
  gradeLevel: string;
  section: string;
  room: string;
  capacity: string;
  homeroomTeacherId: string;
}

export function ClassFormModal({ open, onClose, cls }: { open: boolean; onClose: () => void; cls: ClassListItem | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const editing = !!cls;
  const [form, setForm] = useState<FormState>({ name: '', gradeLevel: '', section: 'A', room: '', capacity: '30', homeroomTeacherId: '' });
  const [nameTouched, setNameTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: teachers } = useQuery({ queryKey: ['teachers', ''], queryFn: () => api.get<TeacherListItem[]>('/teachers'), enabled: open });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setNameTouched(!!cls);
    setForm(cls ? {
      name: cls.name, gradeLevel: String(cls.gradeLevel), section: cls.section, room: cls.room ?? '',
      capacity: String(cls.capacity), homeroomTeacherId: cls.homeroomTeacherId ? String(cls.homeroomTeacherId) : '',
    } : { name: '', gradeLevel: '', section: 'A', room: '', capacity: '30', homeroomTeacherId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cls?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Suggest a name like "Grade 10B" until the user types their own.
      if (!nameTouched && (k === 'gradeLevel' || k === 'section') && next.gradeLevel) next.name = `Grade ${next.gradeLevel}${next.section.trim()}`;
      return next;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const mutation = useMutation({
    mutationFn: (payload: ClassInput) => (editing ? api.patch<ClassListItem>(`/classes/${cls!.id}`, payload) : api.post<ClassListItem>('/classes', payload)),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['classes'] });
      qc.invalidateQueries({ queryKey: ['class'] });
      qc.invalidateQueries({ queryKey: ['teachers'] });
      toast.success(editing ? `Saved ${saved.name}` : `${saved.name} created`);
      onClose();
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    const grade = Number(form.gradeLevel);
    const capacity = Number(form.capacity);
    if (!form.name.trim()) e.name = 'Give the class a name';
    if (!form.gradeLevel || !Number.isInteger(grade) || grade < 1 || grade > 13) e.gradeLevel = 'Choose a grade from 1 to 13';
    if (!form.section.trim()) e.section = 'Enter a section, e.g. A';
    if (!Number.isInteger(capacity) || capacity < 1) e.capacity = 'Capacity must be at least 1';
    else if (cls && capacity < cls.studentCount) e.capacity = `There are already ${cls.studentCount} students in this class`;
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    mutation.mutate({
      name: form.name.trim(),
      gradeLevel: grade,
      section: form.section.trim(),
      room: form.room.trim() || null,
      capacity,
      homeroomTeacherId: form.homeroomTeacherId ? Number(form.homeroomTeacherId) : null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${cls!.name}` : 'Create a class'}
      description="A class is a homeroom group of students who share a timetable."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{editing ? 'Save changes' : 'Create class'}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Grade" required error={errors.gradeLevel}>
          <Select value={form.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} data-autofocus>
            <option value="">Choose…</option>
            {Array.from({ length: 13 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </Select>
        </Field>
        <Field label="Section" required error={errors.section}>
          <Input value={form.section} onChange={(e) => set('section', e.target.value)} maxLength={10} />
        </Field>
        <Field label="Class name" required error={errors.name} className="span-2" hint="Shown everywhere in the app">
          <Input value={form.name} onChange={(e) => { setNameTouched(true); set('name', e.target.value); }} />
        </Field>
        <Field label="Room" error={errors.room}>
          <Input value={form.room} onChange={(e) => set('room', e.target.value)} placeholder="e.g. B-204" />
        </Field>
        <Field label="Capacity" required error={errors.capacity}>
          <Input type="number" min={1} max={200} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
        </Field>
        <Field label="Class teacher" className="span-2" error={errors.homeroomTeacherId} hint="Takes the daily register">
          <Select value={form.homeroomTeacherId} onChange={(e) => set('homeroomTeacherId', e.target.value)}>
            <option value="">No class teacher yet</option>
            {teachers?.filter((t) => t.isActive).map((t) => (
              <option key={t.id} value={t.id}>{fullName(t)}{t.specialization ? ` · ${t.specialization}` : ''}{t.homeroomClass && t.id !== cls?.homeroomTeacherId ? ` (already ${t.homeroomClass})` : ''}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

const fillTone = (n: number, cap: number): Tone => (n >= cap ? 'danger' : n / cap >= 0.9 ? 'warning' : 'success');

export function ClassesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ClassListItem | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['classes'], queryFn: () => api.get<ClassListItem[]>('/classes') });

  const byGrade = useMemo(() => {
    const map = new Map<number, ClassListItem[]>();
    data?.forEach((c) => map.set(c.gradeLevel, [...(map.get(c.gradeLevel) ?? []), c]));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [data]);

  const remove = async (c: ClassListItem) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: c.studentCount
        ? `${c.name} still has ${plural(c.studentCount, 'student')}. Move them to another class first.`
        : 'Its subjects, timetable and assessments will be deleted too. This can’t be undone.',
      confirmLabel: 'Delete class',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/classes/${c.id}`);
      toast.success(`${c.name} was deleted`);
      qc.invalidateQueries({ queryKey: ['classes'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(err);
    }
  };

  const totalStudents = data?.reduce((s, c) => s + c.studentCount, 0) ?? 0;
  const totalCapacity = data?.reduce((s, c) => s + c.capacity, 0) ?? 0;
  const noTeacher = data?.filter((c) => !c.homeroomTeacherId).length ?? 0;

  return (
    <>
      <PageHeader
        title="Classes"
        description="Homeroom groups, their class teachers and how full they are."
        actions={<Button variant="primary" icon={<Plus size={18} />} onClick={() => { setEditing(null); setOpen(true); }}>New class</Button>}
      />
      {isLoading ? (
        <div className="grid grid-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} rows={3} />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState icon={<School size={26} />} title="No classes yet" action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setOpen(true)}>Create the first class</Button>}>
            Create classes, then enrol students and assign subjects.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-3 mb-3">
            <StatCard icon={<School size={22} />} label="Classes" value={data.length} hint={`${byGrade.length} grade levels`} />
            <StatCard icon={<Users size={22} />} label="Places filled" value={`${totalStudents} / ${totalCapacity}`} tone="accent" hint={`${Math.round((totalStudents / Math.max(1, totalCapacity)) * 100)}% of capacity`} />
            <StatCard icon={<UserRound size={22} />} label="Without a class teacher" value={noTeacher} tone={noTeacher ? 'warning' : 'success'} hint={noTeacher ? 'Assign one so registers get taken' : 'Every class is covered'} />
          </div>
          {byGrade.map(([grade, classes]) => (
            <section key={grade} className="mb-3" aria-labelledby={`grade-${grade}`}>
              <h2 id={`grade-${grade}`} className="mb-2" style={{ fontSize: '1rem' }}>Grade {grade}</h2>
              <div className="grid grid-3">
                {classes.map((c) => (
                  <Card key={c.id} as="article">
                    <div className="card-body stack" style={{ gap: 14 }}>
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ fontSize: '1.1rem' }}><Link to={`/classes/${c.id}`} style={{ color: 'inherit' }}>{c.name}</Link></h3>
                          <div className="small muted row" style={{ gap: 6 }}><DoorOpen size={14} aria-hidden />{c.room ? `Room ${c.room}` : 'No room set'}</div>
                        </div>
                        <div className="row" style={{ gap: 2 }}>
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Edit ${c.name}`} icon={<Pencil size={16} />} onClick={() => { setEditing(c); setOpen(true); }} />
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${c.name}`} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(c)} />
                        </div>
                      </div>
                      <div>
                        <div className="row between small">
                          <span className="muted">Students</span>
                          <strong className="num">{c.studentCount} / {c.capacity}</strong>
                        </div>
                        <div className="mt-1"><ProgressBar value={(c.studentCount / c.capacity) * 100} tone={fillTone(c.studentCount, c.capacity)} label={`${c.name} capacity`} /></div>
                      </div>
                      <div className="row row-wrap small" style={{ gap: 8 }}>
                        {c.homeroomTeacherName
                          ? <Badge tone="accent"><UserRound size={12} aria-hidden /> {c.homeroomTeacherName}</Badge>
                          : <Badge tone="warning">No class teacher</Badge>}
                        <Badge><BookOpen size={12} aria-hidden /> {plural(c.subjectCount, 'subject')}</Badge>
                        {c.studentCount >= c.capacity && <Badge tone="danger">Full</Badge>}
                      </div>
                      <ButtonLink to={`/classes/${c.id}`} size="sm" icon={<ArrowRight size={15} />}>Open class</ButtonLink>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      <ClassFormModal open={open} onClose={() => setOpen(false)} cls={editing} />
    </>
  );
}
