import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock, Link2Off } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { InvitationLookup, RegisterInput, SessionUser } from '../../../shared/types';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, ButtonLink, Field, Input, PasswordInput, Skeleton } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fullName } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    title: 'Create account',
    pasteLede: 'Paste the link from your invitation.',
    linkLabel: 'Invitation link',
    errLink: 'Paste the full invitation link',
    continue: 'Continue',
    noInvite: 'No invitation?',
    askOffice: 'Ask the school office',
    haveAccount: 'Have an account?',
    checking: 'Checking your invitation…',
    invalidTitle: 'Link not valid',
    expiredTitle: 'Link expired',
    tryAgain: 'Try another link',
    joining: 'Joining {school} as {role}.',
    email: 'Email',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone (optional)',
    password: 'Password',
    passwordHint: 'At least 8 characters',
    confirm: 'Confirm password',
    showPw: 'Show password',
    hidePw: 'Hide password',
    errFirst: 'Enter your first name',
    errLast: 'Enter your last name',
    errMin: 'Use at least 8 characters',
    errMatch: 'Passwords don’t match',
    create: 'Create account',
    failed: 'Couldn’t create your account',
    doneTitle: 'You’re all set',
    doneText: 'Welcome, {name}.',
    goDashboard: 'Go to dashboard',
    signedInTitle: 'Already signed in',
    signedInText: 'Signed in as {name}.',
  },
  sw: {
    title: 'Fungua akaunti',
    pasteLede: 'Bandika kiungo kutoka kwenye mwaliko wako.',
    linkLabel: 'Kiungo cha mwaliko',
    errLink: 'Bandika kiungo kamili cha mwaliko',
    continue: 'Endelea',
    noInvite: 'Huna mwaliko?',
    askOffice: 'Uliza ofisi ya shule',
    haveAccount: 'Una akaunti?',
    checking: 'Tunakagua mwaliko wako…',
    invalidTitle: 'Kiungo si sahihi',
    expiredTitle: 'Muda wa kiungo umekwisha',
    tryAgain: 'Jaribu kiungo kingine',
    joining: 'Unajiunga na {school} kama {role}.',
    email: 'Barua pepe',
    firstName: 'Jina la kwanza',
    lastName: 'Jina la ukoo',
    phone: 'Simu (si lazima)',
    password: 'Nenosiri',
    passwordHint: 'Angalau herufi 8',
    confirm: 'Thibitisha nenosiri',
    showPw: 'Onyesha nenosiri',
    hidePw: 'Ficha nenosiri',
    errFirst: 'Andika jina lako la kwanza',
    errLast: 'Andika jina lako la ukoo',
    errMin: 'Tumia angalau herufi 8',
    errMatch: 'Manenosiri hayalingani',
    create: 'Fungua akaunti',
    failed: 'Imeshindikana kufungua akaunti',
    doneTitle: 'Uko tayari',
    doneText: 'Karibu, {name}.',
    goDashboard: 'Nenda kwenye dashibodi',
    signedInTitle: 'Tayari umeingia',
    signedInText: 'Umeingia kama {name}.',
  },
};

/** Accepts a full invitation URL or just the token. */
function extractToken(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const url = new URL(v);
    return url.searchParams.get('token');
  } catch {
    return /^[A-Za-z0-9_-]{20,200}$/.test(v) ? v : null;
  }
}

export function RegisterPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { user } = useAuth();
  const [completed, setCompleted] = useState<{ user: SessionUser } | null>(null);

  if (completed) return <AuthLayout story={false}><Completed user={completed.user} /></AuthLayout>;
  if (user) return <AuthLayout story={false}><AlreadySignedIn user={user} /></AuthLayout>;
  return (
    <AuthLayout story={false}>
      {token ? <InvitationForm key={token} token={token} onDone={setCompleted} /> : <NoToken />}
    </AuthLayout>
  );
}

/** Short footer shared by the states below. */
function Foot({ showNoInvite }: { showNoInvite?: boolean }) {
  const t = useT(M);
  const { t: tc } = useI18n();
  return (
    <div className="auth-foot">
      {showNoInvite && <p>{t('noInvite')} <Link to="/home#contact" className="bold">{t('askOffice')}</Link></p>}
      <p>{t('haveAccount')} <Link to="/login" className="bold">{tc('signIn')}</Link></p>
    </div>
  );
}

function NoToken() {
  const t = useT(M);
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = extractToken(value);
    if (!token) return setError(t('errLink'));
    navigate(`/register?token=${encodeURIComponent(token)}`);
  };
  return (
    <>
      <h1>{t('title')}</h1>
      <p className="lede">{t('pasteLede')}</p>
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t('linkLabel')} error={error}>
          <Input value={value} onChange={(e) => { setValue(e.target.value); setError(undefined); }} placeholder="https://…" autoCapitalize="none" spellCheck={false} autoComplete="off" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block icon={<ArrowRight size={18} />}>{t('continue')}</Button>
      </form>
      <Foot showNoInvite />
    </>
  );
}

function InvitationForm({ token, onDone }: { token: string; onDone: (d: { user: SessionUser }) => void }) {
  const t = useT(M);
  const { t: tc } = useI18n();
  const { setUser } = useAuth();
  const lookup = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get<InvitationLookup>(`/auth/invitation?token=${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });
  const [form, setForm] = useState<{ firstName: string; lastName: string; phone: string; password: string; confirm: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (lookup.isPending) {
    return (
      <div aria-busy="true">
        <h1>{t('title')}</h1>
        <p className="lede" role="status">{t('checking')}</p>
        <div className="stack mt-3"><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></div>
      </div>
    );
  }

  if (lookup.isError) {
    const expired = lookup.error instanceof ApiError && lookup.error.status === 410;
    return (
      <div>
        <span className="empty-icon" style={{ margin: '0 0 16px' }} aria-hidden>{expired ? <Clock size={24} /> : <Link2Off size={24} />}</span>
        <h1>{expired ? t('expiredTitle') : t('invalidTitle')}</h1>
        <p className="lede">{errorMessage(lookup.error)}</p>
        <div className="mt-3"><ButtonLink to="/register" variant="primary" icon={<ArrowRight size={17} />}>{t('tryAgain')}</ButtonLink></div>
        <Foot showNoInvite />
      </div>
    );
  }

  const inv = lookup.data;
  const values = form ?? { firstName: inv.firstName, lastName: inv.lastName, phone: '', password: '', confirm: '' };
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...values, [k]: e.target.value });
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!values.firstName.trim()) errs.firstName = t('errFirst');
    if (!values.lastName.trim()) errs.lastName = t('errLast');
    if (values.password.length < 8) errs.password = t('errMin');
    if (values.confirm !== values.password) errs.confirm = t('errMatch');
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLInputElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: RegisterInput = {
        token,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim() || undefined,
        password: values.password,
      };
      const res = await api.post<{ user: SessionUser }>('/auth/register', body);
      onDone({ user: res.user });
      setUser(res.user);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.details) setErrors(err.details);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>{t('title')}</h1>
      <p className="lede">{t('joining', { school: inv.schoolName, role: tc(inv.role).toLowerCase() })}</p>
      <form onSubmit={submit} noValidate className="stack" aria-busy={busy}>
        {error && <Alert tone="danger" title={t('failed')}>{error}</Alert>}
        <Field label={t('email')}>
          <Input type="email" name="email" value={inv.email} readOnly autoComplete="username" />
        </Field>
        <div className="form-grid">
          <Field label={t('firstName')} error={errors.firstName} required>
            <Input name="firstName" value={values.firstName} onChange={set('firstName')} autoComplete="given-name" />
          </Field>
          <Field label={t('lastName')} error={errors.lastName} required>
            <Input name="lastName" value={values.lastName} onChange={set('lastName')} autoComplete="family-name" />
          </Field>
        </div>
        <Field label={t('phone')} error={errors.phone}>
          <Input name="phone" type="tel" inputMode="tel" value={values.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <Field label={t('password')} hint={t('passwordHint')} error={errors.password} required>
          <PasswordInput name="password" value={values.password} onChange={set('password')} autoComplete="new-password" showLabel={t('showPw')} hideLabel={t('hidePw')} />
        </Field>
        <Field label={t('confirm')} error={errors.confirm} required>
          <PasswordInput name="confirm" value={values.confirm} onChange={set('confirm')} autoComplete="new-password" showLabel={t('showPw')} hideLabel={t('hidePw')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>{t('create')}</Button>
      </form>
      <Foot />
    </>
  );
}

function Completed({ user }: { user: SessionUser }) {
  const t = useT(M);
  return (
    <div role="status">
      <span className="empty-icon" style={{ margin: '0 0 16px', background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden>
        <CheckCircle2 size={26} />
      </span>
      <h1>{t('doneTitle')}</h1>
      <p className="lede">{t('doneText', { name: user.firstName })}</p>
      <div className="mt-3"><ButtonLink to="/" variant="primary" size="lg" icon={<ArrowRight size={18} />}>{t('goDashboard')}</ButtonLink></div>
    </div>
  );
}

function AlreadySignedIn({ user }: { user: SessionUser }) {
  const t = useT(M);
  return (
    <div>
      <h1>{t('signedInTitle')}</h1>
      <p className="lede">{t('signedInText', { name: fullName(user) })}</p>
      <div className="mt-3"><ButtonLink to="/" variant="primary" icon={<ArrowRight size={18} />}>{t('goDashboard')}</ButtonLink></div>
    </div>
  );
}
