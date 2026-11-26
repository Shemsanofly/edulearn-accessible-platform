import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock, Link2Off, MailQuestion, UserPlus } from 'lucide-react';
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
    title: 'Create your account',
    inviteOnlyText: 'EduLearn accounts are created by invitation, so each person joins the school with the right access. Open the link in your invitation email, or paste it below.',
    linkLabel: 'Invitation link or code',
    linkHint: 'It looks like https://…/register?token=… or a long code.',
    errLink: 'Paste the full link or code from your invitation',
    continue: 'Continue',
    noInviteTitle: 'Don’t have an invitation?',
    noInviteParents: 'Parents and students: ask the school office to invite you. They’ll need the email address you want to use.',
    noInviteStaff: 'Teachers and staff: ask a school administrator to send you an invitation.',
    noInviteOther: 'Interested in the school? Send us a message and the office will reply.',
    contact: 'Contact the school',
    haveAccount: 'Already have an account?',
    checking: 'Checking your invitation…',
    invalidTitle: 'This invitation can’t be used',
    expiredTitle: 'This invitation has expired',
    tryAgain: 'Try another link',
    youreInvited: 'You’ve been invited to join {school} as {role}.',
    expires: 'This invitation expires on {date}.',
    email: 'Email address',
    emailHint: 'Set by the school. You’ll use it to sign in.',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone number',
    phoneHint: 'Optional — for example 0777 123 456.',
    password: 'Password',
    passwordHint: 'At least 8 characters. Avoid a password you use elsewhere.',
    confirm: 'Confirm password',
    showPw: 'Show password',
    hidePw: 'Hide password',
    errFirst: 'Enter your first name',
    errLast: 'Enter your last name',
    errMin: 'Use at least 8 characters',
    errMatch: 'The passwords don’t match',
    create: 'Create account',
    failed: 'We couldn’t create your account',
    doneTitle: 'Your account is ready',
    doneText: 'Welcome, {name}. You’re signed in as {role} at {school}. Use {email} and your new password next time.',
    goDashboard: 'Go to your dashboard',
    detailChildren: 'Children', detailClass: 'Class', detailSubject: 'Subject',
    signedInTitle: 'You’re already signed in',
    signedInText: 'You’re signed in as {name}. To use an invitation for someone else, sign out first.',
  },
  sw: {
    title: 'Fungua akaunti yako',
    inviteOnlyText: 'Akaunti za EduLearn hufunguliwa kwa mwaliko, ili kila mtu ajiunge na shule akiwa na ruhusa sahihi. Fungua kiungo kilicho kwenye barua pepe ya mwaliko, au kibandike hapa chini.',
    linkLabel: 'Kiungo au msimbo wa mwaliko',
    linkHint: 'Kinafanana na https://…/register?token=… au msimbo mrefu.',
    errLink: 'Bandika kiungo au msimbo kamili wa mwaliko wako',
    continue: 'Endelea',
    noInviteTitle: 'Huna mwaliko?',
    noInviteParents: 'Wazazi na wanafunzi: omba ofisi ya shule ikualike. Watahitaji barua pepe unayotaka kutumia.',
    noInviteStaff: 'Walimu na wafanyakazi: omba msimamizi wa shule akutumie mwaliko.',
    noInviteOther: 'Unaivutiwa na shule? Tutumie ujumbe na ofisi itakujibu.',
    contact: 'Wasiliana na shule',
    haveAccount: 'Tayari una akaunti?',
    checking: 'Tunakagua mwaliko wako…',
    invalidTitle: 'Mwaliko huu hauwezi kutumika',
    expiredTitle: 'Muda wa mwaliko huu umekwisha',
    tryAgain: 'Jaribu kiungo kingine',
    youreInvited: 'Umealikwa kujiunga na {school} kama {role}.',
    expires: 'Mwaliko huu unaisha tarehe {date}.',
    email: 'Barua pepe',
    emailHint: 'Imewekwa na shule. Utaitumia kuingia.',
    firstName: 'Jina la kwanza',
    lastName: 'Jina la ukoo',
    phone: 'Namba ya simu',
    phoneHint: 'Si lazima — kwa mfano 0777 123 456.',
    password: 'Nenosiri',
    passwordHint: 'Angalau herufi 8. Usitumie nenosiri unalotumia mahali pengine.',
    confirm: 'Thibitisha nenosiri',
    showPw: 'Onyesha nenosiri',
    hidePw: 'Ficha nenosiri',
    errFirst: 'Andika jina lako la kwanza',
    errLast: 'Andika jina lako la ukoo',
    errMin: 'Tumia angalau herufi 8',
    errMatch: 'Manenosiri hayalingani',
    create: 'Fungua akaunti',
    failed: 'Imeshindikana kufungua akaunti yako',
    doneTitle: 'Akaunti yako iko tayari',
    doneText: 'Karibu, {name}. Umeingia kama {role} katika {school}. Tumia {email} na nenosiri lako jipya wakati ujao.',
    goDashboard: 'Nenda kwenye dashibodi',
    detailChildren: 'Watoto', detailClass: 'Darasa', detailSubject: 'Somo',
    signedInTitle: 'Tayari umeingia',
    signedInText: 'Umeingia kama {name}. Ili kutumia mwaliko kwa mtu mwingine, toka kwanza.',
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
  const [completed, setCompleted] = useState<{ user: SessionUser; schoolName: string } | null>(null);

  if (completed) return <AuthLayout story="register"><Completed {...completed} /></AuthLayout>;
  if (user) return <AuthLayout story="register"><AlreadySignedIn user={user} /></AuthLayout>;
  return (
    <AuthLayout story="register">
      {token ? <InvitationForm key={token} token={token} onDone={setCompleted} /> : <NoToken />}
    </AuthLayout>
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
      <p className="lede">{t('inviteOnlyText')}</p>
      <form onSubmit={submit} noValidate className="stack">
        <Field label={t('linkLabel')} hint={t('linkHint')} error={error}>
          <Input value={value} onChange={(e) => { setValue(e.target.value); setError(undefined); }} autoCapitalize="none" spellCheck={false} autoComplete="off" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block icon={<ArrowRight size={18} />}>{t('continue')}</Button>
      </form>
      <section className="auth-foot" aria-labelledby="no-invite">
        <h2 id="no-invite" style={{ color: 'var(--text)', marginBottom: 8 }}>{t('noInviteTitle')}</h2>
        <ul className="plain-list stack-sm">
          <li>{t('noInviteParents')}</li>
          <li>{t('noInviteStaff')}</li>
          <li>{t('noInviteOther')} <Link to="/home#contact" className="bold">{t('contact')}</Link></li>
        </ul>
        <p className="mt-2">{t('haveAccount')} <Link to="/login" className="bold">{useI18n().t('signIn')}</Link></p>
      </section>
    </>
  );
}

function InvitationForm({ token, onDone }: { token: string; onDone: (d: { user: SessionUser; schoolName: string }) => void }) {
  const t = useT(M);
  const { t: tc, lang } = useI18n();
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
        <span className="empty-icon" style={{ margin: '0 0 16px' }} aria-hidden>{expired ? <Clock size={26} /> : <Link2Off size={26} />}</span>
        <h1>{expired ? t('expiredTitle') : t('invalidTitle')}</h1>
        <p className="lede">{errorMessage(lookup.error)}</p>
        <div className="row mt-3" style={{ flexWrap: 'wrap', gap: 10 }}>
          <ButtonLink to="/register" variant="primary" icon={<ArrowRight size={17} />}>{t('tryAgain')}</ButtonLink>
          <ButtonLink to="/home#contact" icon={<MailQuestion size={17} />}>{t('contact')}</ButtonLink>
        </div>
        <p className="auth-foot">{t('haveAccount')} <Link to="/login" className="bold">{tc('signIn')}</Link></p>
      </div>
    );
  }

  const inv = lookup.data;
  const values = form ?? { firstName: inv.firstName, lastName: inv.lastName, phone: '', password: '', confirm: '' };
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...values, [k]: e.target.value });
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };
  const expiresOn = new Date(inv.expiresAt).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

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
      onDone({ user: res.user, schoolName: inv.schoolName });
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
      <p className="lede">
        {t('youreInvited', { school: inv.schoolName, role: tc(inv.role).toLowerCase() })}
      </p>
      {inv.detailSummary && inv.role !== 'admin' && (
        <p className="small" style={{ marginTop: 8 }}>
          <strong>{t(inv.role === 'parent' ? 'detailChildren' : inv.role === 'student' ? 'detailClass' : 'detailSubject')}:</strong> {inv.detailSummary}
        </p>
      )}
      <form onSubmit={submit} noValidate className="stack" aria-busy={busy}>
        {error && <Alert tone="danger" title={t('failed')}>{error}</Alert>}
        <Field label={t('email')} hint={t('emailHint')}>
          <Input type="email" name="email" value={inv.email} readOnly autoComplete="username" />
        </Field>
        <div className="grid grid-2" style={{ gap: 16 }}>
          <Field label={t('firstName')} error={errors.firstName} required>
            <Input name="firstName" value={values.firstName} onChange={set('firstName')} autoComplete="given-name" />
          </Field>
          <Field label={t('lastName')} error={errors.lastName} required>
            <Input name="lastName" value={values.lastName} onChange={set('lastName')} autoComplete="family-name" />
          </Field>
        </div>
        <Field label={t('phone')} hint={t('phoneHint')} error={errors.phone}>
          <Input name="phone" type="tel" inputMode="tel" value={values.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <Field label={t('password')} hint={t('passwordHint')} error={errors.password} required>
          <PasswordInput name="password" value={values.password} onChange={set('password')} autoComplete="new-password" showLabel={t('showPw')} hideLabel={t('hidePw')} />
        </Field>
        <Field label={t('confirm')} error={errors.confirm} required>
          <PasswordInput name="confirm" value={values.confirm} onChange={set('confirm')} autoComplete="new-password" showLabel={t('showPw')} hideLabel={t('hidePw')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<UserPlus size={18} />}>{t('create')}</Button>
        <p className="tiny muted" style={{ textAlign: 'center' }}>{t('expires', { date: expiresOn })}</p>
      </form>
      <p className="auth-foot">{t('haveAccount')} <Link to="/login" className="bold">{tc('signIn')}</Link></p>
    </>
  );
}

function Completed({ user, schoolName }: { user: SessionUser; schoolName: string }) {
  const t = useT(M);
  const { t: tc } = useI18n();
  return (
    <div role="status">
      <span className="empty-icon" style={{ margin: '0 0 16px', background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden>
        <CheckCircle2 size={28} />
      </span>
      <h1>{t('doneTitle')}</h1>
      <p className="lede">{t('doneText', { name: user.firstName, role: tc(user.role).toLowerCase(), school: schoolName, email: user.email })}</p>
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
