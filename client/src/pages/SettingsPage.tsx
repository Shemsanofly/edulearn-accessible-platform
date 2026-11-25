import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SessionUser } from '../../../shared/types';
import { AccessibilitySettings } from '../components/AccessibilityPanel';
import { useToast } from '../components/Toast';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { fullName, ROLE_META } from '../lib/format';
import { apiFieldErrors } from './StudentsPage';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile, password and how EduLearn looks for you." />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 20 }}>
          <ProfileCard />
          <PasswordCard />
        </div>
        <Card>
          <CardHeader title="Accessibility & display" subtitle="Saved to your account, so they follow you to any device." />
          <div className="card-body" style={{ paddingTop: 8 }}>
            <AccessibilitySettings />
          </div>
        </Card>
      </div>
    </>
  );
}

function ProfileCard() {
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
      toast.success('Profile saved');
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = 'Enter your first name';
    if (!form.lastName.trim()) errs.lastName = 'Enter your last name';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate();
  };

  const role = ROLE_META[user.role];
  return (
    <Card>
      <CardHeader title="Profile" />
      <form className="card-body stack" onSubmit={submit} noValidate>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={fullName(user)} size="lg" color={role.color} />
          <div>
            <div className="bold" style={{ fontSize: '1.1rem' }}>{fullName(user)}</div>
            <div className="small muted">{user.email}</div>
            <div className="mt-1"><Badge tone="primary">{role.label}</Badge></div>
          </div>
        </div>
        <div className="form-grid">
          <Field label="First name" required error={errors.firstName}>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" />
          </Field>
          <Field label="Phone" error={errors.phone} className="span-2" hint="So the school can reach you">
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
          </Field>
        </div>
        <p className="tiny muted">Need to change your email address? Ask the school office.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" icon={<Save size={16} />} loading={mutation.isPending} disabled={!dirty}>Save profile</Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      toast.success('Password changed', 'Use your new password next time you sign in.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setErrors({});
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(err);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.currentPassword) errs.currentPassword = 'Enter your current password';
    if (form.newPassword.length < 8) errs.newPassword = 'Use at least 8 characters';
    else if (form.newPassword === form.currentPassword) errs.newPassword = 'Choose a password you haven’t used here';
    if (form.confirm !== form.newPassword) errs.confirm = 'The passwords don’t match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate();
  };

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const strength = form.newPassword.length === 0 ? null : form.newPassword.length < 8 ? 'Too short' : form.newPassword.length < 12 ? 'OK' : 'Strong';

  return (
    <Card>
      <CardHeader
        title="Change password"
        action={<Button variant="ghost" size="sm" icon={show ? <EyeOff size={15} /> : <Eye size={15} />} aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'} passwords</Button>}
      />
      <form className="card-body stack" onSubmit={submit} noValidate>
        <Field label="Current password" required error={errors.currentPassword}>
          <Input type={show ? 'text' : 'password'} value={form.currentPassword} onChange={(e) => set('currentPassword', e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" required error={errors.newPassword} hint={strength ? `Strength: ${strength}. Longer is better — try a short phrase.` : 'At least 8 characters. A short phrase is easy to remember.'}>
          <Input type={show ? 'text' : 'password'} value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" required error={errors.confirm}>
          <Input type={show ? 'text' : 'password'} value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" icon={<Lock size={16} />} loading={mutation.isPending}>Change password</Button>
        </div>
      </form>
    </Card>
  );
}
