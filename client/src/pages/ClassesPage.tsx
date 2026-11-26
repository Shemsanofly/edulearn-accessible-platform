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
import { useSchool } from '../lib/auth';
import { fullName, levelName, type Tone } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';
import { apiFieldErrors } from './StudentsPage';

const M = {
  en: {
    title: 'Classes', desc: 'Class streams, their class teachers and how full they are.', newClass: 'New class',
    noneTitle: 'No classes yet', createFirst: 'Create the first class', noneHint: 'Create classes, then enrol students and assign subjects.',
    statClasses: 'Classes', statLevels: '{n} levels', statPlaces: 'Places filled', statCapacity: '{pct}% of capacity',
    statNoTeacher: 'Without a class teacher', assignOne: 'Assign one so registers get taken', allCovered: 'Every class is covered',
    room: 'Room {room}', noRoom: 'No room set', students: 'Students', capacityOf: '{name} capacity', noClassTeacher: 'No class teacher',
    subjects: '{n} subjects', full: 'Full', openClass: 'Open class', editName: 'Edit {name}', deleteName: 'Delete {name}',
    deleteTitle: 'Delete {name}?', stillHas: '{name} still has {n} students. Move them to another class first.',
    deleteWarn: 'Its subjects, timetable and assessments will be deleted too. This can’t be undone.', deleteClass: 'Delete class',
    deleted: '{name} was deleted', saved: 'Saved {name}', created: '{name} created',
    editTitle: 'Edit {name}', createTitle: 'Create a class', formDesc: 'A class (stream) is a group of students who share a class teacher and timetable.',
    createClass: 'Create class', level: 'Level', choose: 'Choose…', section: 'Section / stream', className: 'Class name', classNameHint: 'Shown everywhere in the app',
    roomLabel: 'Room', roomPh: 'e.g. Block B · 01', capacity: 'Capacity', classTeacher: 'Class teacher', classTeacherHint: 'Takes the daily register and writes report-card remarks',
    noTeacherYet: 'No class teacher yet', already: 'already {cls}',
    errName: 'Give the class a name', errLevel: 'Choose a level', errSection: 'Enter a section, e.g. A', errCapacity: 'Capacity must be at least 1',
    errCapacityStudents: 'There are already {n} students in this class',
  },
  sw: {
    title: 'Madarasa', desc: 'Mikondo ya madarasa, walimu wa darasa na idadi ya wanafunzi.', newClass: 'Darasa jipya',
    noneTitle: 'Bado hakuna madarasa', createFirst: 'Unda darasa la kwanza', noneHint: 'Unda madarasa, kisha sajili wanafunzi na panga masomo.',
    statClasses: 'Madarasa', statLevels: 'Ngazi {n}', statPlaces: 'Nafasi zilizojazwa', statCapacity: '{pct}% ya uwezo',
    statNoTeacher: 'Bila mwalimu wa darasa', assignOne: 'Mpange mmoja ili mahudhurio yachukuliwe', allCovered: 'Kila darasa lina mwalimu',
    room: 'Chumba {room}', noRoom: 'Hakuna chumba', students: 'Wanafunzi', capacityOf: 'Uwezo wa {name}', noClassTeacher: 'Hakuna mwalimu wa darasa',
    subjects: 'Masomo {n}', full: 'Limejaa', openClass: 'Fungua darasa', editName: 'Hariri {name}', deleteName: 'Futa {name}',
    deleteTitle: 'Futa {name}?', stillHas: '{name} bado lina wanafunzi {n}. Wahamishe darasa jingine kwanza.',
    deleteWarn: 'Masomo, ratiba na tathmini zake zitafutwa pia. Hatua hii haiwezi kurudishwa.', deleteClass: 'Futa darasa',
    deleted: '{name} limefutwa', saved: '{name} limehifadhiwa', created: '{name} limeundwa',
    editTitle: 'Hariri {name}', createTitle: 'Unda darasa', formDesc: 'Darasa (mkondo) ni kundi la wanafunzi wenye mwalimu wa darasa na ratiba moja.',
    createClass: 'Unda darasa', level: 'Ngazi', choose: 'Chagua…', section: 'Mkondo', className: 'Jina la darasa', classNameHint: 'Huonekana kila mahali kwenye programu',
    roomLabel: 'Chumba', roomPh: 'mf. Jengo B · 01', capacity: 'Uwezo', classTeacher: 'Mwalimu wa darasa', classTeacherHint: 'Huchukua mahudhurio ya kila siku na kuandika maoni ya ripoti',
    noTeacherYet: 'Bado hakuna mwalimu wa darasa', already: 'tayari ana {cls}',
    errName: 'Lipe darasa jina', errLevel: 'Chagua ngazi', errSection: 'Andika mkondo, mf. A', errCapacity: 'Uwezo lazima uwe angalau 1',
    errCapacityStudents: 'Tayari kuna wanafunzi {n} katika darasa hili',
  },
};

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
  const school = useSchool();
  const { t: tc } = useI18n();
  const t = useT(M);
  const editing = !!cls;
  const [form, setForm] = useState<FormState>({ name: '', gradeLevel: '', section: 'A', room: '', capacity: '45', homeroomTeacherId: '' });
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
    } : { name: '', gradeLevel: '', section: 'A', room: '', capacity: '45', homeroomTeacherId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cls?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Suggest a name like "Form 2B" (using the school's level label) until the user types their own.
      if (!nameTouched && (k === 'gradeLevel' || k === 'section') && next.gradeLevel) {
        next.name = `${school.levelLabel} ${next.gradeLevel}${next.section.trim()}`;
      }
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
      toast.success(editing ? t('saved', { name: saved.name }) : t('created', { name: saved.name }));
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
    if (!form.name.trim()) e.name = t('errName');
    if (!form.gradeLevel || !Number.isInteger(grade) || grade < 1 || grade > 13) e.gradeLevel = t('errLevel');
    if (!form.section.trim()) e.section = t('errSection');
    if (!Number.isInteger(capacity) || capacity < 1) e.capacity = t('errCapacity');
    else if (cls && capacity < cls.studentCount) e.capacity = t('errCapacityStudents', { n: cls.studentCount });
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
      title={editing ? t('editTitle', { name: cls!.name }) : t('createTitle')}
      description={t('formDesc')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{editing ? tc('saveChanges') : t('createClass')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('level')} required error={errors.gradeLevel}>
          <Select value={form.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} data-autofocus>
            <option value="">{t('choose')}</option>
            {Array.from({ length: 13 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{levelName(g, school.levelLabel)}</option>)}
          </Select>
        </Field>
        <Field label={t('section')} required error={errors.section}>
          <Input value={form.section} onChange={(e) => set('section', e.target.value)} maxLength={10} />
        </Field>
        <Field label={t('className')} required error={errors.name} className="span-2" hint={t('classNameHint')}>
          <Input value={form.name} onChange={(e) => { setNameTouched(true); set('name', e.target.value); }} />
        </Field>
        <Field label={t('roomLabel')} error={errors.room}>
          <Input value={form.room} onChange={(e) => set('room', e.target.value)} placeholder={t('roomPh')} />
        </Field>
        <Field label={t('capacity')} required error={errors.capacity}>
          <Input type="number" min={1} max={200} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
        </Field>
        <Field label={t('classTeacher')} className="span-2" error={errors.homeroomTeacherId} hint={t('classTeacherHint')}>
          <Select value={form.homeroomTeacherId} onChange={(e) => set('homeroomTeacherId', e.target.value)}>
            <option value="">{t('noTeacherYet')}</option>
            {teachers?.filter((x) => x.isActive).map((x) => (
              <option key={x.id} value={x.id}>
                {fullName(x)}{x.specialization ? ` · ${x.specialization}` : ''}{x.homeroomClass && x.id !== cls?.homeroomTeacherId ? ` (${t('already', { cls: x.homeroomClass })})` : ''}
              </option>
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
  const school = useSchool();
  const t = useT(M);
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
      title: t('deleteTitle', { name: c.name }),
      message: c.studentCount ? t('stillHas', { name: c.name, n: c.studentCount }) : t('deleteWarn'),
      confirmLabel: t('deleteClass'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/classes/${c.id}`);
      toast.success(t('deleted', { name: c.name }));
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
        title={t('title')}
        description={t('desc')}
        actions={<Button variant="primary" icon={<Plus size={18} />} onClick={() => { setEditing(null); setOpen(true); }}>{t('newClass')}</Button>}
      />
      {isLoading ? (
        <div className="grid grid-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} rows={3} />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState icon={<School size={26} />} title={t('noneTitle')} action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setOpen(true)}>{t('createFirst')}</Button>}>
            {t('noneHint')}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-3 mb-3">
            <StatCard icon={<School size={22} />} label={t('statClasses')} value={data.length} hint={t('statLevels', { n: byGrade.length })} />
            <StatCard icon={<Users size={22} />} label={t('statPlaces')} value={`${totalStudents} / ${totalCapacity}`} tone="accent" hint={t('statCapacity', { pct: Math.round((totalStudents / Math.max(1, totalCapacity)) * 100) })} />
            <StatCard icon={<UserRound size={22} />} label={t('statNoTeacher')} value={noTeacher} tone={noTeacher ? 'warning' : 'success'} hint={noTeacher ? t('assignOne') : t('allCovered')} />
          </div>
          {byGrade.map(([grade, classes]) => (
            <section key={grade} className="mb-3" aria-labelledby={`grade-${grade}`}>
              <h2 id={`grade-${grade}`} className="mb-2" style={{ fontSize: '1rem' }}>{levelName(grade, school.levelLabel)}</h2>
              <div className="grid grid-3">
                {classes.map((c) => (
                  <Card key={c.id} as="article" className="card-hover">
                    <div className="card-body stack" style={{ gap: 14 }}>
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ fontSize: '1.1rem' }}><Link to={`/classes/${c.id}`} style={{ color: 'inherit' }}>{c.name}</Link></h3>
                          <div className="small muted row" style={{ gap: 6 }}><DoorOpen size={14} aria-hidden />{c.room ? t('room', { room: c.room }) : t('noRoom')}</div>
                        </div>
                        <div className="row" style={{ gap: 2 }}>
                          <Button variant="ghost" size="sm" iconOnly aria-label={t('editName', { name: c.name })} icon={<Pencil size={16} />} onClick={() => { setEditing(c); setOpen(true); }} />
                          <Button variant="ghost" size="sm" iconOnly aria-label={t('deleteName', { name: c.name })} icon={<Trash size={16} />} className="text-danger" onClick={() => remove(c)} />
                        </div>
                      </div>
                      <div>
                        <div className="row between small">
                          <span className="muted">{t('students')}</span>
                          <strong className="num">{c.studentCount} / {c.capacity}</strong>
                        </div>
                        <div className="mt-1"><ProgressBar value={(c.studentCount / c.capacity) * 100} tone={fillTone(c.studentCount, c.capacity)} label={t('capacityOf', { name: c.name })} /></div>
                      </div>
                      <div className="row row-wrap small" style={{ gap: 8 }}>
                        {c.homeroomTeacherName
                          ? <Badge tone="accent"><UserRound size={12} aria-hidden /> {c.homeroomTeacherName}</Badge>
                          : <Badge tone="warning">{t('noClassTeacher')}</Badge>}
                        <Badge><BookOpen size={12} aria-hidden /> {t('subjects', { n: c.subjectCount })}</Badge>
                        {c.studentCount >= c.capacity && <Badge tone="danger">{t('full')}</Badge>}
                      </div>
                      <ButtonLink to={`/classes/${c.id}`} size="sm" icon={<ArrowRight size={15} />}>{t('openClass')}</ButtonLink>
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
