import { useMutation } from '@tanstack/react-query';
import { Camera, Eye, EyeOff, Lock, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SessionUser } from '../../../shared/types';
import { AccessibilitySettings } from '../components/AccessibilityPanel';
import { useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { fullName, ROLE_META } from '../lib/format';
import { LanguageSwitch, useI18n, useT } from '../lib/i18n';
import { resizeImage } from '../lib/export';

const M = {
  en: {
    desc: 'Your profile, password, language and how EduLearn looks for you.',
    profile: 'Profile', firstName: 'First name', lastName: 'Last name', phone: 'Phone', phoneHint: 'So the school can reach you, e.g. 0777 123 456',
    emailNote: 'Need to change your email address? Ask the school office.', saveProfile: 'Save profile', profileSaved: 'Profile saved',
    firstErr: 'Enter your first name', lastErr: 'Enter your last name',
    photo: 'Photo', uploadPhoto: 'Upload photo', changePhoto: 'Change photo', removePhoto: 'Remove photo', photoSaved: 'Photo updated',
    photoRemoved: 'Photo removed', removePhotoTitle: 'Remove your photo?', removePhotoMsg: 'Your initials will be shown instead.',
    badType: 'Choose a JPEG, PNG or WebP image', photoHint: 'A clear, recent photo helps teachers and parents recognise you.',
    language: 'Language', languageDesc: 'Choose the language EduLearn uses for you. Saved to your account.',
    password: 'Change password', show: 'Show passwords', hide: 'Hide passwords', current: 'Current password', newPassword: 'New password',
    confirm: 'Confirm new password', change: 'Change password', changed: 'Password changed',
    changedDetail: 'You stay signed in here; any other devices have been signed out. Use your new password next time.',
    currentErr: 'Enter your current password', shortErr: 'Use at least 8 characters', sameErr: 'Choose a password you haven’t used here',
    matchErr: 'The passwords don’t match', strength: 'Strength: {s}. Longer is better — try a short phrase.',
    strengthHint: 'At least 8 characters. A short phrase is easy to remember.', tooShort: 'Too short', ok: 'OK', strong: 'Strong',
    display: 'Display & accessibility', displayDesc: 'Saved to your account, so they follow you to any device.',
  },
  sw: {
    desc: 'Wasifu wako, nenosiri, lugha na jinsi EduLearn inavyoonekana kwako.',
    profile: 'Wasifu', firstName: 'Jina la kwanza', lastName: 'Jina la ukoo', phone: 'Simu', phoneHint: 'Ili shule iweze kukupata, mf. 0777 123 456',
    emailNote: 'Unahitaji kubadilisha barua pepe? Wasiliana na ofisi ya shule.', saveProfile: 'Hifadhi wasifu', profileSaved: 'Wasifu umehifadhiwa',
    firstErr: 'Weka jina lako la kwanza', lastErr: 'Weka jina lako la ukoo',
    photo: 'Picha', uploadPhoto: 'Pakia picha', changePhoto: 'Badilisha picha', removePhoto: 'Ondoa picha', photoSaved: 'Picha imesasishwa',
    photoRemoved: 'Picha imeondolewa', removePhotoTitle: 'Ondoa picha yako?', removePhotoMsg: 'Herufi za mwanzo za jina lako zitaonyeshwa badala yake.',
    badType: 'Chagua picha ya JPEG, PNG au WebP', photoHint: 'Picha safi ya hivi karibuni huwasaidia walimu na wazazi kukutambua.',
    language: 'Lugha', languageDesc: 'Chagua lugha ambayo EduLearn itatumia kwako. Huhifadhiwa kwenye akaunti yako.',
    password: 'Badilisha nenosiri', show: 'Onyesha manenosiri', hide: 'Ficha manenosiri', current: 'Nenosiri la sasa', newPassword: 'Nenosiri jipya',
    confirm: 'Thibitisha nenosiri jipya', change: 'Badilisha nenosiri', changed: 'Nenosiri limebadilishwa',
    changedDetail: 'Bado umeingia hapa; vifaa vingine vyote vimetolewa. Tumia nenosiri jipya wakati ujao.',
    currentErr: 'Weka nenosiri lako la sasa', shortErr: 'Tumia angalau herufi 8', sameErr: 'Chagua nenosiri ambalo hujalitumia hapa',
    matchErr: 'Manenosiri hayalingani', strength: 'Uimara: {s}. Refu ni bora — jaribu sentensi fupi.',
    strengthHint: 'Angalau herufi 8. Sentensi fupi ni rahisi kukumbuka.', tooShort: 'Fupi mno', ok: 'Linafaa', strong: 'Imara',
    display: 'Mwonekano na ufikivu', displayDesc: 'Huhifadhiwa kwenye akaunti yako, hivyo hukufuata kwenye kifaa chochote.',
  },
};

const fieldErrors = (err: unknown) => (err instanceof ApiError && err.details ? err.details : {});

export function SettingsPage() {
  const t = useT(M);
  const { t: tc } = useI18n();
  return (
    <>
      <PageHeader title={tc('settings')} description={t('desc')} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 20 }}>
          <ProfileCard />
          <PasswordCard />
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <CardHeader title={t('language')} subtitle={t('languageDesc')} />
            <div className="card-body"><LanguageSwitch /></div>
          </Card>
          <Card>
            <CardHeader title={t('display')} subtitle={t('displayDesc')} />
            <div className="card-body" style={{ paddingTop: 8 }}>
              <AccessibilitySettings />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function PhotoControls() {
  const t = useT(M);
  const user = useUser();
  const { setUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await resizeImage(file, 480, 0.85);
      return api.upload<{ photoUrl: string }>('PUT', `/users/${user.id}/photo`, blob, 'image/jpeg');
    },
    onSuccess: (res) => {
      setUser({ ...user, photoUrl: res.photoUrl });
      toast.success(t('photoSaved'));
    },
    onError: (err) => toast.error(err),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/users/${user.id}/photo`),
    onSuccess: () => {
      setUser({ ...user, photoUrl: null });
      toast.success(t('photoRemoved'));
    },
    onError: (err) => toast.error(err),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.error(t('badType'));
    upload.mutate(file);
  };

  return (
    <div className="stack-sm">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} aria-label={t('uploadPhoto')} tabIndex={-1} />
      <div className="row row-wrap" style={{ gap: 8 }}>
        <Button size="sm" icon={<Camera size={15} />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
          {user.photoUrl ? t('changePhoto') : t('uploadPhoto')}
        </Button>
        {user.photoUrl && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={15} />}
            loading={remove.isPending}
            onClick={async () => {
              if (await confirm({ title: t('removePhotoTitle'), message: t('removePhotoMsg'), confirmLabel: t('removePhoto'), danger: true })) remove.mutate();
            }}
          >
            {t('removePhoto')}
          </Button>
        )}
      </div>
      <span className="tiny muted">{t('photoHint')}</span>
    </div>
  );
}

function ProfileCard() {
  const t = useT(M);
  const { t: tc } = useI18n();
  const user = useUser();
  const { setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '' });
  }, [user.firstName, user.lastName, user.phone]);

  const dirty = form.firstName !== user.firstName || form.lastName !== user.lastName || form.phone !== (user.phone ?? '');

  const mutation = useMutation({
    mutationFn: () => api.patch<{ user: SessionUser }>('/auth/profile', {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || null,
    }),
    onSuccess: (res) => {
      setUser(res.user);
      setErrors({});
      toast.success(t('profileSaved'));
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = t('firstErr');
    if (!form.lastName.trim()) errs.lastName = t('lastErr');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate();
  };

  const role = ROLE_META[user.role];
  return (
    <Card>
      <CardHeader title={t('profile')} />
      <form className="card-body stack" onSubmit={submit} noValidate>
        <div className="row row-wrap" style={{ gap: 16, alignItems: 'center' }}>
          <Avatar name={fullName(user)} size="xl" color={role.color} photoUrl={user.photoUrl} />
          <div className="stack-sm" style={{ minWidth: 0 }}>
            <div>
              <div className="bold" style={{ fontSize: '1.1rem' }}>{fullName(user)}</div>
              <div className="small muted truncate">{user.email}</div>
              <div className="mt-1"><Badge tone="primary">{tc(user.role)}</Badge></div>
            </div>
            <PhotoControls />
          </div>
        </div>
        <div className="form-grid">
          <Field label={t('firstName')} required error={errors.firstName}>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" />
          </Field>
          <Field label={t('lastName')} required error={errors.lastName}>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" />
          </Field>
          <Field label={t('phone')} error={errors.phone} className="span-2" hint={t('phoneHint')}>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
          </Field>
        </div>
        <p className="tiny muted">{t('emailNote')}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" icon={<Save size={16} />} loading={mutation.isPending} disabled={!dirty}>{t('saveProfile')}</Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const t = useT(M);
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      toast.success(t('changed'), t('changedDetail'));
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setErrors({});
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.currentPassword) errs.currentPassword = t('currentErr');
    if (form.newPassword.length < 8) errs.newPassword = t('shortErr');
    else if (form.newPassword === form.currentPassword) errs.newPassword = t('sameErr');
    if (form.confirm !== form.newPassword) errs.confirm = t('matchErr');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate();
  };

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const strength = form.newPassword.length === 0 ? null : form.newPassword.length < 8 ? t('tooShort') : form.newPassword.length < 12 ? t('ok') : t('strong');

  return (
    <Card>
      <CardHeader
        title={t('password')}
        action={<Button variant="ghost" size="sm" icon={show ? <EyeOff size={15} /> : <Eye size={15} />} aria-pressed={show} onClick={() => setShow(!show)}>{show ? t('hide') : t('show')}</Button>}
      />
      <form className="card-body stack" onSubmit={submit} noValidate>
        <Field label={t('current')} required error={errors.currentPassword}>
          <Input type={show ? 'text' : 'password'} value={form.currentPassword} onChange={(e) => set('currentPassword', e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label={t('newPassword')} required error={errors.newPassword} hint={strength ? t('strength', { s: strength }) : t('strengthHint')}>
          <Input type={show ? 'text' : 'password'} value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label={t('confirm')} required error={errors.confirm}>
          <Input type={show ? 'text' : 'password'} value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" icon={<Lock size={16} />} loading={mutation.isPending}>{t('change')}</Button>
        </div>
      </form>
    </Card>
  );
}
