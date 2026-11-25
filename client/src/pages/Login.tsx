import { BarChart3, CalendarCheck, Eye, EyeOff, GraduationCap, LogIn, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../../../shared/types';
import { Alert, Avatar, Button, Field, Input } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ROLE_META } from '../lib/format';

const DEMO: { role: Role; email: string; name: string }[] = [
  { role: 'admin', email: 'admin@edulearn.school', name: 'Nadia Bello' },
  { role: 'teacher', email: 'teacher@edulearn.school', name: 'Sarah Johnson' },
  { role: 'student', email: 'student@edulearn.school', name: 'Alex Rivera' },
  { role: 'parent', email: 'parent@edulearn.school', name: 'Maria Rivera' },
];

export function LoginPage() {
  const { user, signIn, school } = useAuth();
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
    if (!c.email.trim()) errs.email = 'Enter your email address';
    if (!c.password) errs.password = 'Enter your password';
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
    <div className="auth-page">
      <section className="auth-hero" aria-hidden>
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-logo" style={{ background: 'rgba(255,255,255,0.18)', boxShadow: 'none' }}><GraduationCap size={22} /></span>
          <strong style={{ fontSize: '1.15rem' }}>EduLearn</strong>
        </div>
        <div>
          <h1>Everything your school runs on, in one friendly place.</h1>
          <p>Attendance, grades, timetables, fees and messages for administrators, teachers, students and families — built to be accessible to everyone.</p>
          <div className="auth-features">
            <div className="auth-feature"><span><CalendarCheck size={18} /></span> Take a class register in under a minute</div>
            <div className="auth-feature"><span><BarChart3 size={18} /></span> Live grades and attendance for every student</div>
            <div className="auth-feature"><span><Users size={18} /></span> Parents and teachers stay in touch</div>
            <div className="auth-feature"><span><ShieldCheck size={18} /></span> Each person sees only what they should</div>
          </div>
        </div>
        <p className="small" style={{ opacity: 0.75 }}>{school.name}</p>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form">
          <h1 style={{ fontSize: '1.7rem' }}>Welcome back</h1>
          <p className="muted" style={{ margin: '6px 0 24px' }}>Sign in with the account your school gave you.</p>

          <form onSubmit={submit} noValidate className="stack">
            {error && <Alert tone="danger" title="Couldn't sign you in">{error}</Alert>}
            <Field label="Email" error={fieldErrors.email}>
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.org" autoFocus />
            </Field>
            <Field label="Password" error={fieldErrors.password}>
              <div style={{ position: 'relative' }}>
                <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 46 }} aria-invalid={fieldErrors.password ? true : undefined} />
                <Button variant="ghost" size="sm" iconOnly aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)} icon={show ? <EyeOff size={17} /> : <Eye size={17} />} style={{ position: 'absolute', right: 5, top: 5 }} />
              </div>
            </Field>
            <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<LogIn size={18} />}>Sign in</Button>
          </form>

          <div className="mt-3">
            <div className="row" style={{ gap: 10, margin: '8px 0 12px' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Try a demo account</span>
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
                    <strong>{ROLE_META[d.role].label}</strong>
                    <small>{d.name}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="tiny muted mt-1">Demo accounts only exist when the database was seeded with sample data.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
