import { LogIn } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, Field, Input, PasswordInput } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    title: 'Sign in',
    subtitle: 'Use the email address and password for your school account.',
    email: 'Email address',
    password: 'Password',
    forgot: 'Forgot password?',
    showPw: 'Show password',
    hidePw: 'Hide password',
    errEmail: 'Enter your email address',
    errEmailFormat: 'Enter an email address like name@example.com',
    errPassword: 'Enter your password',
    failed: 'We couldn’t sign you in',
    newHere: 'New to EduLearn?',
    newHereText: 'Accounts are created by invitation from the school office.',
    haveInvite: 'Have an invitation? Create your account',
  },
  sw: {
    title: 'Ingia',
    subtitle: 'Tumia barua pepe na nenosiri la akaunti yako ya shule.',
    email: 'Barua pepe',
    password: 'Nenosiri',
    forgot: 'Umesahau nenosiri?',
    showPw: 'Onyesha nenosiri',
    hidePw: 'Ficha nenosiri',
    errEmail: 'Andika barua pepe yako',
    errEmailFormat: 'Andika barua pepe kama jina@mfano.com',
    errPassword: 'Andika nenosiri lako',
    failed: 'Imeshindikana kukuingiza',
    newHere: 'Mgeni kwenye EduLearn?',
    newHereText: 'Akaunti hufunguliwa kwa mwaliko kutoka ofisi ya shule.',
    haveInvite: 'Una mwaliko? Fungua akaunti yako',
  },
};

export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function LoginPage() {
  const { user, signIn } = useAuth();
  const { t: tc } = useI18n();
  const t = useT(M);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = t('errEmail');
    else if (!looksLikeEmail(email)) errs.email = t('errEmailFormat');
    if (!password) errs.password = t('errPassword');
    return errs;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (errs.email) return emailRef.current?.focus();
    if (errs.password) return passwordRef.current?.focus();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.details) setFieldErrors(err.details);
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  // Once a field has shown an error, re-check it as the person types so the message clears promptly.
  const recheck = (field: 'email' | 'password') => {
    if (!fieldErrors[field]) return;
    setTimeout(() => setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    }), 0);
  };

  return (
    <AuthLayout>
      <h1>{t('title')}</h1>
      <p className="lede">{t('subtitle')}</p>

      <form onSubmit={submit} noValidate className="stack" aria-busy={busy}>
        {error && <Alert tone="danger" title={t('failed')}>{error}</Alert>}
        <Field label={t('email')} error={fieldErrors.email}>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => { setEmail(e.target.value); recheck('email'); }}
            onBlur={() => email && !looksLikeEmail(email) && setFieldErrors((p) => ({ ...p, email: t('errEmailFormat') }))}
            autoFocus
          />
        </Field>
        <Field label={t('password')} error={fieldErrors.password}>
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); recheck('password'); }}
            showLabel={t('showPw')}
            hideLabel={t('hidePw')}
          />
        </Field>
        <div style={{ textAlign: 'right', marginTop: -8 }}>
          <Link to="/forgot-password" className="small bold">{t('forgot')}</Link>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<LogIn size={18} />}>{tc('signIn')}</Button>
      </form>

      <div className="auth-foot">
        <strong style={{ color: 'var(--text)' }}>{t('newHere')}</strong> {t('newHereText')}{' '}
        <Link to="/register" className="bold">{t('haveInvite')}</Link>
      </div>
    </AuthLayout>
  );
}
