import { ArrowLeft, CheckCircle2, KeyRound, MailCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonLink, Field, Input } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useT } from '../lib/i18n';
import { AuthShell } from './Login';

const M = {
  en: {
    forgotTitle: 'Forgot your password?',
    forgotText: 'Enter the email address you sign in with and we’ll help you reset it.',
    email: 'Email',
    errEmail: 'Enter a valid email address',
    send: 'Send reset instructions',
    sentTitle: 'Request received',
    sentEmail: 'If an account exists for {email}, we’ve sent a link to reset the password. It works for 30 minutes — check your inbox and spam folder.',
    sentOffice: 'If an account exists for {email}, the school office has been notified. They will contact you with a temporary password.',
    backLogin: 'Back to sign in',
    failed: 'We couldn’t send your request',
    resetTitle: 'Choose a new password',
    resetText: 'Use at least 8 characters. You’ll be signed out on your other devices.',
    newPw: 'New password',
    confirmPw: 'Confirm new password',
    errMin: 'Use at least 8 characters',
    errMatch: 'The passwords don’t match',
    savePw: 'Save new password',
    doneTitle: 'Your password has been changed',
    doneText: 'You can now sign in with your new password.',
    goLogin: 'Go to sign in',
    noToken: 'This reset link is incomplete. Please request a new one.',
    expired: 'This reset link is invalid or has expired. Please request a new one.',
    requestNew: 'Request a new link',
    resetFailed: 'Couldn’t change your password',
  },
  sw: {
    forgotTitle: 'Umesahau nenosiri lako?',
    forgotText: 'Andika barua pepe unayotumia kuingia na tutakusaidia kuweka nenosiri jipya.',
    email: 'Barua pepe',
    errEmail: 'Andika barua pepe sahihi',
    send: 'Tuma maelekezo',
    sentTitle: 'Ombi limepokelewa',
    sentEmail: 'Ikiwa kuna akaunti ya {email}, tumetuma kiungo cha kuweka nenosiri jipya. Kinafanya kazi kwa dakika 30 — angalia sanduku la barua na barua taka.',
    sentOffice: 'Ikiwa kuna akaunti ya {email}, ofisi ya shule imejulishwa. Watawasiliana nawe kukupa nenosiri la muda.',
    backLogin: 'Rudi kwenye kuingia',
    failed: 'Imeshindikana kutuma ombi lako',
    resetTitle: 'Chagua nenosiri jipya',
    resetText: 'Tumia angalau herufi 8. Utatolewa kwenye vifaa vyako vingine.',
    newPw: 'Nenosiri jipya',
    confirmPw: 'Thibitisha nenosiri jipya',
    errMin: 'Tumia angalau herufi 8',
    errMatch: 'Manenosiri hayalingani',
    savePw: 'Hifadhi nenosiri jipya',
    doneTitle: 'Nenosiri lako limebadilishwa',
    doneText: 'Sasa unaweza kuingia kwa nenosiri lako jipya.',
    goLogin: 'Nenda kuingia',
    noToken: 'Kiungo hiki si kamili. Tafadhali omba kingine.',
    expired: 'Kiungo hiki si sahihi au muda wake umekwisha. Tafadhali omba kingine.',
    requestNew: 'Omba kiungo kipya',
    resetFailed: 'Imeshindikana kubadili nenosiri',
  },
};

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function BackToLogin({ label }: { label: string }) {
  return (
    <Link to="/login" className="row small bold mt-3" style={{ gap: 6 }}>
      <ArrowLeft size={16} aria-hidden /> {label}
    </Link>
  );
}

export function ForgotPasswordPage() {
  const t = useT(M);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; delivery: 'email' | 'office' } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      setFieldError(t('errEmail'));
      return;
    }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; delivery: 'email' | 'office' }>('/auth/forgot-password', { email: email.trim() });
      setSent({ email: email.trim(), delivery: res.delivery });
    } catch (err) {
      if (err instanceof ApiError && err.details?.email) setFieldError(err.details.email);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div role="status">
          <span className="empty-icon" style={{ margin: '0 0 16px', background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden>
            <MailCheck size={28} />
          </span>
          <h1 style={{ fontSize: '1.6rem' }}>{t('sentTitle')}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {sent.delivery === 'office' ? t('sentOffice', { email: sent.email }) : t('sentEmail', { email: sent.email })}
          </p>
          <BackToLogin label={t('backLogin')} />
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: '1.7rem' }}>{t('forgotTitle')}</h1>
          <p className="muted" style={{ margin: '6px 0 24px' }}>{t('forgotText')}</p>
          <form onSubmit={submit} noValidate className="stack">
            {error && <Alert tone="danger" title={t('failed')}>{error}</Alert>}
            <Field label={t('email')} error={fieldError} required>
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.ac.tz" autoFocus />
            </Field>
            <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<Send size={18} />}>{t('send')}</Button>
          </form>
          <BackToLogin label={t('backLogin')} />
        </>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const t = useT(M);
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (password.length < 8) errs.password = t('errMin');
    if (confirm !== password) errs.confirm = t('errMatch');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.details?.password) setErrors({ password: err.details.password });
      else if (err instanceof ApiError && err.status === 400) setError(t('expired'));
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell>
        <h1 style={{ fontSize: '1.7rem' }}>{t('resetTitle')}</h1>
        <div className="mt-2">
          <Alert tone="danger">{t('noToken')}</Alert>
        </div>
        <div className="mt-2">
          <ButtonLink to="/forgot-password" variant="primary" icon={<KeyRound size={17} />}>{t('requestNew')}</ButtonLink>
        </div>
        <BackToLogin label={t('backLogin')} />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div role="status">
          <span className="empty-icon" style={{ margin: '0 0 16px', background: 'var(--success-soft)', color: 'var(--success)' }} aria-hidden>
            <CheckCircle2 size={28} />
          </span>
          <h1 style={{ fontSize: '1.6rem' }}>{t('doneTitle')}</h1>
          <p className="muted" style={{ margin: '8px 0 20px' }}>{t('doneText')}</p>
          <ButtonLink to="/login" variant="primary">{t('goLogin')}</ButtonLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 style={{ fontSize: '1.7rem' }}>{t('resetTitle')}</h1>
      <p className="muted" style={{ margin: '6px 0 24px' }}>{t('resetText')}</p>
      <form onSubmit={submit} noValidate className="stack">
        {error && (
          <Alert tone="danger" title={t('resetFailed')}>
            {error} <Link to="/forgot-password">{t('requestNew')}</Link>
          </Alert>
        )}
        <Field label={t('newPw')} error={errors.password} required>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label={t('confirmPw')} error={errors.confirm} required>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<KeyRound size={18} />}>{t('savePw')}</Button>
      </form>
      <BackToLogin label={t('backLogin')} />
    </AuthShell>
  );
}
