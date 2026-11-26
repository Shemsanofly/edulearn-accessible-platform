import { ArrowLeft, BarChart3, CalendarCheck, Eye, EyeOff, FlaskConical, GraduationCap, LogIn, ShieldCheck, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../../../shared/types';
import { Alert, Avatar, Button, Field, Input } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { useAuth, useSchool } from '../lib/auth';
import { ROLE_META } from '../lib/format';
import { LanguageSwitch, useI18n, useT } from '../lib/i18n';

const SHELL = {
  en: {
    backWebsite: 'Back to website',
    heroTitle: 'Everything your school runs on, in one friendly place.',
    heroText: 'Attendance, results, timetables, fees and messages for administrators, teachers, parents and students.',
    heroF1: 'Take a class register in under a minute',
    heroF2: 'Live results and attendance for every student',
    heroF3: 'Parents and teachers stay in touch',
    heroF4: 'Each person sees only what they should',
  },
  sw: {
    backWebsite: 'Rudi kwenye tovuti',
    heroTitle: 'Kila kitu shule yako inahitaji, mahali pamoja rahisi.',
    heroText: 'Mahudhurio, matokeo, ratiba, ada na ujumbe kwa wasimamizi, walimu, wazazi na wanafunzi.',
    heroF1: 'Chukua mahudhurio ya darasa chini ya dakika moja',
    heroF2: 'Matokeo na mahudhurio ya kila mwanafunzi papo hapo',
    heroF3: 'Wazazi na walimu wanawasiliana kwa urahisi',
    heroF4: 'Kila mtu anaona taarifa zinazomhusu tu',
  },
};

/** Shared two-panel layout for sign-in, forgot-password and reset-password. */
export function AuthShell({ children }: { children: ReactNode }) {
  const school = useSchool();
  const t = useT(SHELL);
  return (
    <div className="auth-page">
      <section className="auth-hero" aria-hidden>
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-logo" style={{ width: 44, height: 44 }}>
            {school.logoUrl ? <img src={school.logoUrl} alt="" /> : <GraduationCap size={24} />}
          </span>
          <span>
            <strong style={{ fontSize: '1.1rem', display: 'block' }}>{school.name}</strong>
            <span className="small" style={{ opacity: 0.8 }}>EduLearn SMS</span>
          </span>
        </div>
        <div>
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroText')}</p>
          <div className="auth-features">
            <div className="auth-feature"><span><CalendarCheck size={18} /></span> {t('heroF1')}</div>
            <div className="auth-feature"><span><BarChart3 size={18} /></span> {t('heroF2')}</div>
            <div className="auth-feature"><span><Users size={18} /></span> {t('heroF3')}</div>
            <div className="auth-feature"><span><ShieldCheck size={18} /></span> {t('heroF4')}</div>
          </div>
        </div>
        <p className="small" style={{ opacity: 0.75 }}>{school.motto ?? ' '}</p>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form">
          <div className="row between" style={{ marginBottom: 28, flexWrap: 'wrap', gap: 10 }}>
            <Link to="/home" className="row small bold" style={{ gap: 6 }}>
              <ArrowLeft size={16} aria-hidden /> {t('backWebsite')}
            </Link>
            <LanguageSwitch compact />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

const M = {
  en: {
    title: 'Welcome back',
    subtitle: 'Sign in with the account your school gave you.',
    email: 'Email',
    password: 'Password',
    forgot: 'Forgot password?',
    showPw: 'Show password',
    hidePw: 'Hide password',
    errEmail: 'Enter your email address',
    errPassword: 'Enter your password',
    failed: 'Couldn’t sign you in',
    demoTitle: 'Demo accounts',
    demoHint: 'This school uses invented demo data. Every demo account uses the password password123.',
  },
  sw: {
    title: 'Karibu tena',
    subtitle: 'Ingia kwa akaunti uliyopewa na shule yako.',
    email: 'Barua pepe',
    password: 'Nenosiri',
    forgot: 'Umesahau nenosiri?',
    showPw: 'Onyesha nenosiri',
    hidePw: 'Ficha nenosiri',
    errEmail: 'Andika barua pepe yako',
    errPassword: 'Andika nenosiri lako',
    failed: 'Imeshindikana kukuingiza',
    demoTitle: 'Akaunti za majaribio',
    demoHint: 'Shule hii inatumia data za majaribio. Akaunti zote za majaribio zinatumia nenosiri password123.',
  },
};

const DEMO: { role: Role; email: string; name: string }[] = [
  { role: 'admin', email: 'admin@edulearn.school', name: 'Salma Juma' },
  { role: 'teacher', email: 'teacher@edulearn.school', name: 'Zuhura Hamad' },
  { role: 'parent', email: 'parent@edulearn.school', name: 'Mwanaisha Juma' },
  { role: 'student', email: 'student@edulearn.school', name: 'Ali Juma' },
];

export function LoginPage() {
  const { user, signIn } = useAuth();
  const school = useSchool();
  const { t: tc } = useI18n();
  const t = useT(M);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    const c = creds ?? { email, password };
    const errs: Record<string, string> = {};
    if (!c.email.trim()) errs.email = t('errEmail');
    if (!c.password) errs.password = t('errPassword');
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(c.email.trim(), c.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.details) setFieldErrors(err.details);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 style={{ fontSize: '1.7rem' }}>{t('title')}</h1>
      <p className="muted" style={{ margin: '6px 0 24px' }}>{t('subtitle')}</p>

      <form onSubmit={submit} noValidate className="stack">
        {error && <Alert tone="danger" title={t('failed')}>{error}</Alert>}
        <Field label={t('email')} error={fieldErrors.email}>
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.ac.tz" autoFocus />
        </Field>
        <Field label={t('password')} error={fieldErrors.password}>
          <div style={{ position: 'relative' }}>
            <Input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ paddingRight: 46 }}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-label={t('password')}
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={show ? t('hidePw') : t('showPw')}
              aria-pressed={show}
              onClick={() => setShow(!show)}
              icon={show ? <EyeOff size={17} /> : <Eye size={17} />}
              style={{ position: 'absolute', right: 5, top: 5 }}
            />
          </div>
        </Field>
        <div style={{ textAlign: 'right', marginTop: -6 }}>
          <Link to="/forgot-password" className="small bold">{t('forgot')}</Link>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<LogIn size={18} />}>{tc('signIn')}</Button>
      </form>

      {school.isDemo && (
        <div className="mt-3">
          <div className="row" style={{ gap: 10, margin: '8px 0 12px' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="tiny muted bold row" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', gap: 6 }}>
              <FlaskConical size={13} aria-hidden /> {t('demoTitle')}
            </span>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div className="demo-accounts">
            {DEMO.map((d) => (
              <button
                key={d.role}
                type="button"
                className="demo-account"
                disabled={busy}
                onClick={() => {
                  setEmail(d.email);
                  setPassword('password123');
                  submit(undefined, { email: d.email, password: 'password123' });
                }}
              >
                <Avatar name={d.name} size="sm" color={ROLE_META[d.role].color} />
                <span>
                  <strong>{tc(d.role)}</strong>
                  <small>{d.name}</small>
                </span>
              </button>
            ))}
          </div>
          <p className="tiny muted mt-1">{t('demoHint')}</p>
        </div>
      )}
    </AuthShell>
  );
}
