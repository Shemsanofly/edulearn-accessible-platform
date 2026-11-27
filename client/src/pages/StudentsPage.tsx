import { RecordExcelPanel } from '../components/ExcelTools';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Download, GraduationCap, KeyRound, MailPlus, Pencil, Plus, Power, PowerOff, Trash, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  ClassListItem, CreatedAccount, Gender, Paginated, StudentDetail, StudentInput, StudentListItem,
} from '../../../shared/types';
import { useConfirm, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Avatar, Badge, Button, ButtonLink, Card, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, PersonCell,
  SearchInput, Select, SortHeader, Textarea, useDebounced, useSort,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useSchool, useUser } from '../lib/auth';
import { downloadCsv, resizeImage, slug } from '../lib/export';
import { formatDate, fullName, levelName, todayIso } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

export const ACCESSIBILITY_SUGGESTIONS = [
  'Sign language support',
  'Extra time in exams',
  'Large print materials',
  'Screen reader',
  'Hearing loop',
  'Wheelchair access',
  'Quiet space',
];
const ACCESSIBILITY_SUGGESTIONS_SW = [
  'Msaada wa lugha ya alama',
  'Muda wa ziada kwenye mitihani',
  'Maandishi makubwa',
  'Kisoma skrini',
  'Kifaa cha kusikia',
  'Njia ya kiti cha magurudumu',
  'Mahali patulivu',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());
export const apiFieldErrors = (err: unknown): Record<string, string> =>
  err instanceof ApiError && err.details ? err.details : {};

const ACTIONS = {
  en: {
    resetTitle: 'Reset {name}’s password?',
    resetMessage: 'A new temporary password will be created. Their current password stops working straight away.',
    resetConfirm: 'Reset password',
    newPassword: 'New password for {name}',
    tempPassword: 'Temporary password:',
    sharePrivately: '— share it privately. It won’t be shown again.',
    deactivateTitle: 'Deactivate {name}?',
    deactivateMessage: 'They won’t be able to sign in until the account is reactivated. Their records are kept.',
    deactivate: 'Deactivate',
    reactivated: '{name} can sign in again',
    deactivated: '{name} has been deactivated',
    deleteTitle: 'Delete {name}?',
    deleteSuffix: 'This can’t be undone — consider deactivating instead.',
    deletePermanently: 'Delete permanently',
    wasDeleted: '{name} was deleted',
  },
  sw: {
    resetTitle: 'Badilisha nenosiri la {name}?',
    resetMessage: 'Nenosiri jipya la muda litaundwa. Nenosiri la sasa litaacha kufanya kazi mara moja.',
    resetConfirm: 'Badilisha nenosiri',
    newPassword: 'Nenosiri jipya la {name}',
    tempPassword: 'Nenosiri la muda:',
    sharePrivately: '— mpe kwa siri. Halitaonyeshwa tena.',
    deactivateTitle: 'Simamisha akaunti ya {name}?',
    deactivateMessage: 'Hataweza kuingia hadi akaunti irejeshwe. Kumbukumbu zake zitabaki.',
    deactivate: 'Simamisha',
    reactivated: '{name} anaweza kuingia tena',
    deactivated: 'Akaunti ya {name} imesimamishwa',
    deleteTitle: 'Futa {name}?',
    deleteSuffix: 'Hatua hii haiwezi kurudishwa — fikiria kusimamisha akaunti badala yake.',
    deletePermanently: 'Futa kabisa',
    wasDeleted: '{name} amefutwa',
  },
};

// ---------------------------------------------------------------------------
// Account actions shared by the student, teacher and parent admin pages
// ---------------------------------------------------------------------------
export function useAccountActions(invalidate: unknown[][]) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const t = useT(ACTIONS);
  const refresh = () => {
    invalidate.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return {
    async resetPassword(id: number, name: string) {
      const ok = await confirm({ title: t('resetTitle', { name }), message: t('resetMessage'), confirmLabel: t('resetConfirm') });
      if (!ok) return;
      try {
        const res = await api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`);
        toast.success(
          t('newPassword', { name }),
          <>{t('tempPassword')} <code>{res.temporaryPassword}</code> {t('sharePrivately')}</>,
          { sticky: true },
        );
      } catch (err) {
        toast.error(err);
      }
    },
    async setActive(id: number, name: string, isActive: boolean) {
      if (!isActive) {
        const ok = await confirm({ title: t('deactivateTitle', { name }), message: t('deactivateMessage'), confirmLabel: t('deactivate'), danger: true });
        if (!ok) return;
      }
      try {
        await api.patch(`/users/${id}/status`, { isActive });
        toast.success(isActive ? t('reactivated', { name }) : t('deactivated', { name }));
        refresh();
      } catch (err) {
        toast.error(err);
      }
    },
    async remove(path: string, name: string, consequence: string): Promise<boolean> {
      const ok = await confirm({
        title: t('deleteTitle', { name }),
        message: `${consequence} ${t('deleteSuffix')}`,
        confirmLabel: t('deletePermanently'),
        danger: true,
      });
      if (!ok) return false;
      try {
        await api.del(path);
        toast.success(t('wasDeleted', { name }));
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

/** Photo chooser with preview; returns the chosen file (or 'remove') to the parent form. */
export function PhotoPicker({ name, currentUrl, value, onChange }: {
  name: string;
  currentUrl: string | null | undefined;
  value: File | 'remove' | null;
  onChange: (v: File | 'remove' | null) => void;
}) {
  const t = useT(FORM);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (value instanceof File) {
      const url = URL.createObjectURL(value);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [value]);
  const shown = value === 'remove' ? null : preview ?? currentUrl ?? null;
  return (
    <div className="row" style={{ gap: 16 }}>
      <Avatar name={name || '?'} size="lg" photoUrl={shown} />
      <div className="stack-sm">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={t('choosePhoto')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange(f);
            e.target.value = '';
          }}
        />
        <div className="row row-wrap" style={{ gap: 8 }}>
          <Button size="sm" icon={<Camera size={15} />} onClick={() => inputRef.current?.click()}>
            {shown ? t('changePhoto') : t('choosePhoto')}
          </Button>
          {shown && (
            <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => onChange(value instanceof File && !currentUrl ? null : 'remove')}>
              {t('removePhoto')}
            </Button>
          )}
        </div>
        <span className="field-hint">{t('photoHint')}</span>
      </div>
    </div>
  );
}

/** Upload or remove a person's photo after their record is saved. */
export async function savePhoto(userId: number, photo: File | 'remove' | null) {
  if (photo === 'remove') await api.del(`/users/${userId}/photo`);
  else if (photo instanceof File) await api.upload('PUT', `/users/${userId}/photo`, await resizeImage(photo), 'image/jpeg');
}

// ---------------------------------------------------------------------------
// Student form (create + edit) — also used on the profile page
// ---------------------------------------------------------------------------
const FORM = {
  en: {
    editTitle: 'Edit {name}', newTitle: 'Enrol a new student',
    editDesc: 'Update the student’s details, photo and class.', newDesc: 'Create the student’s account. Required fields are marked *.',
    enrol: 'Enrol student', personal: 'Personal details', firstName: 'First name', lastName: 'Last name', dob: 'Date of birth',
    gender: 'Gender', preferNot: 'Prefer not to say', female: 'Female', male: 'Male', other: 'Other', address: 'Home address',
    addressPh: 'e.g. Mwanakwerekwe, Zanzibar', photo: 'Photo', school: 'School', classLabel: 'Class', classHint: 'You can change this later',
    notAssigned: 'Not assigned yet', full: 'full', admissionNo: 'Admission number', admissionHint: 'Leave blank to generate one',
    signIn: 'Sign-in & contact', email: 'Email', emailHint: 'Used to sign in', phone: 'Phone', phoneHint: 'e.g. 0777 123 456',
    password: 'Password', passwordHint: 'Leave blank and we’ll create a temporary password you can share.',
    support: 'Support & wellbeing', needs: 'Accessibility needs', currentNeeds: 'Current accessibility needs', removeNeed: 'Remove {need}',
    needPh: 'Type a need and press Enter', suggestions: 'Suggestions:', needsHint: 'Teachers see these so they can plan support.',
    medical: 'Medical notes', medicalHint: 'Allergies, medication or conditions staff should know about',
    errFirst: 'Enter a first name', errLast: 'Enter a last name', errEmail: 'Enter an email address for signing in',
    errEmailBad: 'That doesn’t look like an email address', errPassword: 'Use at least 8 characters', errDob: 'Date of birth can’t be in the future',
    enrolled: '{name} is enrolled', signInInfo: 'Sign-in: {email} · temporary password', shareInfo: 'Share it privately — it won’t be shown again.',
    savedChanges: 'Saved changes to {name}', photoFailed: 'The details were saved, but the photo could not be uploaded',
    choosePhoto: 'Choose photo', changePhoto: 'Change photo', removePhoto: 'Remove photo', photoHint: 'JPEG, PNG or WebP. It will be resized automatically.',
  },
  sw: {
    editTitle: 'Hariri {name}', newTitle: 'Sajili mwanafunzi mpya',
    editDesc: 'Sasisha taarifa, picha na darasa la mwanafunzi.', newDesc: 'Fungua akaunti ya mwanafunzi. Sehemu za lazima zimewekwa alama *.',
    enrol: 'Sajili mwanafunzi', personal: 'Taarifa binafsi', firstName: 'Jina la kwanza', lastName: 'Jina la ukoo', dob: 'Tarehe ya kuzaliwa',
    gender: 'Jinsia', preferNot: 'Sipendi kusema', female: 'Ke', male: 'Me', other: 'Nyingine', address: 'Anwani ya nyumbani',
    addressPh: 'mf. Mwanakwerekwe, Zanzibar', photo: 'Picha', school: 'Shule', classLabel: 'Darasa', classHint: 'Unaweza kubadilisha baadaye',
    notAssigned: 'Bado hajapangiwa', full: 'limejaa', admissionNo: 'Namba ya usajili', admissionHint: 'Acha wazi ili itengenezwe yenyewe',
    signIn: 'Kuingia na mawasiliano', email: 'Barua pepe', emailHint: 'Hutumika kuingia', phone: 'Simu', phoneHint: 'mf. 0777 123 456',
    password: 'Nenosiri', passwordHint: 'Acha wazi tutaunda nenosiri la muda utakalompa.',
    support: 'Msaada na ustawi', needs: 'Mahitaji maalum', currentNeeds: 'Mahitaji maalum yaliyopo', removeNeed: 'Ondoa {need}',
    needPh: 'Andika hitaji kisha bonyeza Enter', suggestions: 'Mapendekezo:', needsHint: 'Walimu huyaona ili wapange msaada.',
    medical: 'Taarifa za afya', medicalHint: 'Mzio, dawa au hali ambazo wafanyakazi wanapaswa kujua',
    errFirst: 'Andika jina la kwanza', errLast: 'Andika jina la ukoo', errEmail: 'Andika barua pepe ya kuingia',
    errEmailBad: 'Hii haionekani kuwa barua pepe sahihi', errPassword: 'Tumia angalau herufi 8', errDob: 'Tarehe ya kuzaliwa haiwezi kuwa ya baadaye',
    enrolled: '{name} amesajiliwa', signInInfo: 'Kuingia: {email} · nenosiri la muda', shareInfo: 'Mpe kwa siri — halitaonyeshwa tena.',
    savedChanges: 'Mabadiliko ya {name} yamehifadhiwa', photoFailed: 'Taarifa zimehifadhiwa, lakini picha haikuweza kupakiwa',
    choosePhoto: 'Chagua picha', changePhoto: 'Badilisha picha', removePhoto: 'Ondoa picha', photoHint: 'JPEG, PNG au WebP. Itapunguzwa ukubwa yenyewe.',
  },
};

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

/** Classes grouped by level ("Form 1", "Form 2"…) for <optgroup>s. */
export function groupClassesByLevel(classes: ClassListItem[] | undefined, label: string) {
  const groups = new Map<number, ClassListItem[]>();
  for (const c of classes ?? []) groups.set(c.gradeLevel, [...(groups.get(c.gradeLevel) ?? []), c]);
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([level, items]) => ({ level, label: levelName(level, label), items }));
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
  const school = useSchool();
  const { t: tc, lang } = useI18n();
  const t = useT(FORM);
  const [form, setForm] = useState<FormState>(blank);
  const [photo, setPhoto] = useState<File | 'remove' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [needDraft, setNeedDraft] = useState('');
  const editing = !!student;

  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: () => api.get<ClassListItem[]>('/classes'), enabled: open });

  useEffect(() => {
    if (!open) return;
    setForm(student ? fromStudent(student) : { ...blank, classId: defaultClassId ? String(defaultClassId) : '' });
    setPhoto(null);
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
      const res: CreatedAccount<StudentDetail> = editing
        ? { record: await api.patch<StudentDetail>(`/students/${student!.id}`, payload), temporaryPassword: null }
        : await api.post<CreatedAccount<StudentDetail>>('/students', payload);
      let photoError = false;
      if (photo) {
        try {
          await savePhoto(res.record.id, photo);
          res.record = await api.get<StudentDetail>(`/students/${res.record.id}`);
        } catch {
          photoError = true;
        }
      }
      return { ...res, photoError };
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
          t('enrolled', { name }),
          <>{t('signInInfo', { email: res.record.email })} <code>{res.temporaryPassword}</code>. {t('shareInfo')}</>,
          { sticky: true },
        );
      } else {
        toast.success(editing ? t('savedChanges', { name }) : t('enrolled', { name }));
      }
      if (res.photoError) toast.error(t('photoFailed'));
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
    if (!form.firstName.trim()) e.firstName = t('errFirst');
    if (!form.lastName.trim()) e.lastName = t('errLast');
    if (!form.email.trim()) e.email = t('errEmail');
    else if (!isEmail(form.email)) e.email = t('errEmailBad');
    if (form.password && form.password.length < 8) e.password = t('errPassword');
    if (form.dateOfBirth && form.dateOfBirth > todayIso()) e.dateOfBirth = t('errDob');
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

  const suggestions = (lang === 'sw' ? ACCESSIBILITY_SUGGESTIONS_SW : ACCESSIBILITY_SUGGESTIONS).filter((s) => !form.accessibilityNeeds.includes(s));
  const groups = groupClassesByLevel(classes, school.levelLabel);
  const displayName = `${form.firstName} ${form.lastName}`.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      title={editing ? t('editTitle', { name: fullName(student!) }) : t('newTitle')}
      description={editing ? t('editDesc') : t('newDesc')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} icon={editing ? undefined : <UserPlus size={17} />}>
            {editing ? tc('saveChanges') : t('enrol')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-section-title span-2">{t('personal')}</div>
        <div className="span-2">
          <PhotoPicker name={displayName} currentUrl={student?.photoUrl} value={photo} onChange={setPhoto} />
        </div>
        <Field label={t('firstName')} required error={errors.firstName}>
          <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" data-autofocus />
        </Field>
        <Field label={t('lastName')} required error={errors.lastName}>
          <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t('dob')} error={errors.dateOfBirth}>
          <Input type="date" value={form.dateOfBirth} max={todayIso()} onChange={(e) => set('dateOfBirth', e.target.value)} />
        </Field>
        <Field label={t('gender')} error={errors.gender}>
          <Select value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
            <option value="unspecified">{t('preferNot')}</option>
            <option value="female">{t('female')}</option>
            <option value="male">{t('male')}</option>
            <option value="other">{t('other')}</option>
          </Select>
        </Field>
        <Field label={t('address')} className="span-2" error={errors.address}>
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder={t('addressPh')} />
        </Field>

        <div className="form-section-title span-2">{t('school')}</div>
        <Field label={t('classLabel')} hint={t('classHint')} error={errors.classId}>
          <Select value={form.classId} onChange={(e) => set('classId', e.target.value)}>
            <option value="">{t('notAssigned')}</option>
            {groups.map((g) => (
              <optgroup key={g.level} label={g.label}>
                {g.items.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.studentCount >= c.capacity && String(c.id) !== form.classId}>
                    {c.name} ({c.studentCount}/{c.capacity}{c.studentCount >= c.capacity ? `, ${t('full')}` : ''})
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label={t('admissionNo')} hint={editing ? undefined : t('admissionHint')} error={errors.admissionNo}>
          <Input value={form.admissionNo} onChange={(e) => set('admissionNo', e.target.value)} placeholder="ADM-2026-0001" className="mono" />
        </Field>

        <div className="form-section-title span-2">{t('signIn')}</div>
        <Field label={t('email')} required error={errors.email} hint={t('emailHint')}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t('phone')} error={errors.phone} hint={t('phoneHint')}>
          <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0777 123 456" />
        </Field>
        {!editing && (
          <Field label={t('password')} className="span-2" error={errors.password} hint={t('passwordHint')}>
            <Input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}

        <div className="form-section-title span-2">{t('support')}</div>
        <div className="field span-2">
          <label className="field-label" htmlFor="need-input">{t('needs')}</label>
          {form.accessibilityNeeds.length > 0 && (
            <ul className="row row-wrap list" style={{ gap: 6 }} aria-label={t('currentNeeds')}>
              {form.accessibilityNeeds.map((n) => (
                <li key={n} className="chip">
                  {n}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    style={{ width: 22, height: 22 }}
                    aria-label={t('removeNeed', { need: n })}
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
              placeholder={t('needPh')}
              onChange={(e) => setNeedDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNeed(needDraft);
                }
              }}
            />
            <Button onClick={() => addNeed(needDraft)} disabled={!needDraft.trim()} icon={<Plus size={16} />}>{tc('add')}</Button>
          </div>
          {suggestions.length > 0 && (
            <div className="row row-wrap" style={{ gap: 6 }}>
              <span className="tiny muted">{t('suggestions')}</span>
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip" style={{ cursor: 'pointer' }} onClick={() => addNeed(s)}>
                  <Plus size={12} aria-hidden /> {s}
                </button>
              ))}
            </div>
          )}
          <span className="field-hint">{t('needsHint')}</span>
        </div>
        <Field label={t('medical')} className="span-2" hint={t('medicalHint')} error={errors.medicalNotes}>
          <Textarea value={form.medicalNotes} onChange={(e) => set('medicalNotes', e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Students list
// ---------------------------------------------------------------------------
const LIST = {
  en: {
    descAdmin: 'Enrol students, keep their details up to date and manage their accounts.', descTeacher: 'Students in the classes you teach.',
    enrol: 'Enrol student', searchPh: 'Search by name, email or admission no.', searchLabel: 'Search students', allClasses: 'All classes',
    byClass: 'Filter by class', byStatus: 'Filter by account status', anyStatus: 'Any status', deactivated: 'Deactivated',
    clear: 'Clear filters', noMatch: 'No students match those filters', none: 'No students yet', enrolFirst: 'Enrol the first student',
    tryDifferent: 'Try a different name or class.', emptyAdmin: 'Enrol students to start tracking attendance, grades and fees.',
    emptyTeacher: 'You’ll see students here once you’re assigned to a class.', student: 'Student', admissionNo: 'Admission no.',
    classCol: 'Class', dob: 'Date of birth', support: 'Support', status: 'Status', actions: 'Actions', unassigned: 'Unassigned',
    needsCount: '{n} needs', editName: 'Edit {name}', resetName: 'Reset password for {name}', deactivateName: 'Deactivate {name}',
    reactivateName: 'Reactivate {name}', deleteName: 'Delete {name}',
    deleteConsequence: 'All of their grades, attendance and invoices will be deleted too.',
    exporting: 'Preparing export…', exported: 'Exported {n} students', guardians: 'Parents / guardians', guardianPhones: 'Parent phones',
    attendanceRate: 'Attendance %', average: 'Average %', gender: 'Gender', email: 'Email', phone: 'Phone',
  },
  sw: {
    descAdmin: 'Sajili wanafunzi, sasisha taarifa zao na simamia akaunti zao.', descTeacher: 'Wanafunzi wa madarasa unayofundisha.',
    enrol: 'Sajili mwanafunzi', searchPh: 'Tafuta kwa jina, barua pepe au namba ya usajili', searchLabel: 'Tafuta wanafunzi', allClasses: 'Madarasa yote',
    byClass: 'Chuja kwa darasa', byStatus: 'Chuja kwa hali ya akaunti', anyStatus: 'Hali yoyote', deactivated: 'Imesimamishwa',
    clear: 'Futa vichujio', noMatch: 'Hakuna mwanafunzi anayelingana na vichujio hivyo', none: 'Bado hakuna wanafunzi', enrolFirst: 'Sajili mwanafunzi wa kwanza',
    tryDifferent: 'Jaribu jina au darasa jingine.', emptyAdmin: 'Sajili wanafunzi ili kuanza kufuatilia mahudhurio, alama na ada.',
    emptyTeacher: 'Utawaona wanafunzi hapa ukishapangiwa darasa.', student: 'Mwanafunzi', admissionNo: 'Namba ya usajili',
    classCol: 'Darasa', dob: 'Tarehe ya kuzaliwa', support: 'Msaada', status: 'Hali', actions: 'Vitendo', unassigned: 'Hajapangiwa',
    needsCount: 'Mahitaji {n}', editName: 'Hariri {name}', resetName: 'Badilisha nenosiri la {name}', deactivateName: 'Simamisha {name}',
    reactivateName: 'Rejesha {name}', deleteName: 'Futa {name}',
    deleteConsequence: 'Alama, mahudhurio na ankara zake zote zitafutwa pia.',
    exporting: 'Inaandaa faili…', exported: 'Wanafunzi {n} wamehamishwa', guardians: 'Wazazi / walezi', guardianPhones: 'Simu za wazazi',
    attendanceRate: 'Mahudhurio %', average: 'Wastani %', gender: 'Jinsia', email: 'Barua pepe', phone: 'Simu',
  },
};

export function StudentsPage() {
  const user = useUser();
  const school = useSchool();
  const isAdmin = user.role === 'admin';
  const navigate = useNavigate();
  const { t: tc } = useI18n();
  const t = useT(LIST);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [classId, setClassId] = useState(params.get('classId') ?? '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StudentDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounced(search);
  const actions = useAccountActions([['students']]);
  const toast = useToast();

  const sort = useSort('name');
  useEffect(() => setPage(1), [debounced, classId, status, sort.sort, sort.dir]);

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
    queryKey: ['students', { search: debounced, classId, status, page, ...sort.params }],
    queryFn: () => api.get<Paginated<StudentListItem>>('/students', { search: debounced, classId, status, page, pageSize: 20, ...sort.params }),
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

  /** Export every student matching the current filters (not just this page). */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: StudentListItem[] = [];
      for (let p = 1; p <= 10; p++) {
        const res = await api.get<Paginated<StudentListItem>>('/students', { search: debounced, classId, status, page: p, pageSize: 100, ...sort.params });
        all.push(...res.items);
        if (all.length >= res.total || res.items.length === 0) break;
      }
      downloadCsv(
        `${slug(school.name)}-students`,
        [t('admissionNo'), tc('students'), t('email'), t('phone'), t('classCol'), t('dob'), t('gender'), t('support'), t('status')],
        all.map((s) => [
          s.admissionNo, fullName(s), s.email, s.phone, s.className, s.dateOfBirth, s.gender, s.accessibilityNeeds.join('; '),
          s.isActive ? tc('active') : t('deactivated'),
        ]),
      );
      toast.success(t('exported', { n: all.length }));
    } catch (err) {
      toast.error(err);
    } finally {
      setExporting(false);
    }
  };

  const data = query.data;
  const filtered = !!(debounced || classId || status);
  const clear = () => { setSearch(''); setClassId(''); setStatus(''); };
  const groups = groupClassesByLevel(classes, school.levelLabel);

  return (
    <>
      <PageHeader
        title={tc('students')}
        description={isAdmin ? t('descAdmin') : t('descTeacher')}
        actions={
          <>
            <Button icon={<Download size={17} />} onClick={exportCsv} loading={exporting} disabled={!data?.total}>
              {tc('exportCsv')}
            </Button>
            {isAdmin && <ButtonLink to="/invitations?new=1&as=student" icon={<MailPlus size={17} />}>{tc('inviteSomeone')}</ButtonLink>}
            {isAdmin && (
              <Button variant="primary" icon={<UserPlus size={18} />} onClick={() => { setEditing(null); setFormOpen(true); }}>
                {t('enrol')}
              </Button>
            )}
          </>
        }
      />
      <RecordExcelPanel areas={[{ resource: 'students', label: 'Students', canEdit: isAdmin }]} />
      <Card>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder={t('searchPh')} label={t('searchLabel')} />
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t('byClass')}>
            <option value="">{t('allClasses')}</option>
            {groups.map((g) => (
              <optgroup key={g.level} label={g.label}>
                {g.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </Select>
          {isAdmin && (
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('byStatus')}>
              <option value="">{t('anyStatus')}</option>
              <option value="active">{tc('active')}</option>
              <option value="inactive">{t('deactivated')}</option>
            </Select>
          )}
          {filtered && <Button variant="ghost" size="sm" onClick={clear}>{t('clear')}</Button>}
        </div>

        {query.isLoading ? (
          <div style={{ padding: 20 }}><CardSkeleton rows={6} /></div>
        ) : query.error ? (
          <div style={{ padding: 20 }}><ErrorState error={query.error} onRetry={query.refetch} /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={26} />}
            title={filtered ? t('noMatch') : t('none')}
            action={filtered
              ? <Button onClick={clear}>{t('clear')}</Button>
              : isAdmin && <Button variant="primary" icon={<UserPlus size={17} />} onClick={() => setFormOpen(true)}>{t('enrolFirst')}</Button>}
          >
            {filtered ? t('tryDifferent') : isAdmin ? t('emptyAdmin') : t('emptyTeacher')}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: query.isFetching && query.isPlaceholderData ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <SortHeader label={t('student')} field="name" state={sort} />
                    <SortHeader label={t('admissionNo')} field="admission" state={sort} />
                    <SortHeader label={t('classCol')} field="class" state={sort} />
                    <SortHeader label={t('dob')} field="dob" state={sort} numeric />
                    <th scope="col">{t('support')}</th>
                    {isAdmin ? <SortHeader label={t('status')} field="status" state={sort} /> : <th scope="col">{t('status')}</th>}
                    {isAdmin && <th scope="col" className="actions"><span className="sr-only">{t('actions')}</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => {
                    const name = fullName(s);
                    return (
                      <tr key={s.id} className="clickable" onClick={() => navigate(`/students/${s.id}`)}>
                        <td><PersonCell name={name} sub={s.email} to={`/students/${s.id}`} photoUrl={s.photoUrl} /></td>
                        <td className="mono">{s.admissionNo}</td>
                        <td>{s.className ?? <span className="subtle">{t('unassigned')}</span>}</td>
                        <td className="num">{formatDate(s.dateOfBirth)}</td>
                        <td>
                          {s.accessibilityNeeds.length ? (
                            <Badge tone="info" title={s.accessibilityNeeds.join(', ')}>
                              {s.accessibilityNeeds.length === 1 ? s.accessibilityNeeds[0] : t('needsCount', { n: s.accessibilityNeeds.length })}
                            </Badge>
                          ) : <span className="subtle">—</span>}
                        </td>
                        <td>{s.isActive ? <Badge tone="success" dot>{tc('active')}</Badge> : <Badge dot>{t('deactivated')}</Badge>}</td>
                        {isAdmin && (
                          <td className="actions">
                            <RowAction label={t('editName', { name })} icon={<Pencil size={16} />} onClick={() => openEdit(s.id)} />
                            <RowAction label={t('resetName', { name })} icon={<KeyRound size={16} />} onClick={() => actions.resetPassword(s.id, name)} />
                            {s.isActive
                              ? <RowAction label={t('deactivateName', { name })} icon={<PowerOff size={16} />} onClick={() => actions.setActive(s.id, name, false)} />
                              : <RowAction label={t('reactivateName', { name })} icon={<Power size={16} />} onClick={() => actions.setActive(s.id, name, true)} />}
                            <RowAction
                              danger
                              label={t('deleteName', { name })}
                              icon={<Trash size={16} />}
                              onClick={() => actions.remove(`/students/${s.id}`, name, t('deleteConsequence'))}
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
