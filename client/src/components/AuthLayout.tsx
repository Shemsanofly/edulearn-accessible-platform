import { BellRing, ClipboardCheck, GraduationCap, LockKeyhole, MailCheck, Menu, ShieldCheck, Wallet, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth, useSchool } from '../lib/auth';
import { LanguageSwitch, useI18n, useT } from '../lib/i18n';
import { Button } from './ui';

const M = {
  en: {
    home: 'Home', features: 'Features', how: 'How it works', access: 'Getting access', contact: 'Contact',
    goDashboard: 'Go to dashboard', openMenu: 'Open menu', closeMenu: 'Close menu', siteNav: 'Site',
    footerTag: 'School management for administrators, teachers, parents and students in Zanzibar and Tanzania.',
    explore: 'Explore', account: 'Account', reach: 'Contact the school', forgot: 'Forgot password', rights: 'All rights reserved.',
    // Story panels beside the forms
    signinEyebrow: 'Welcome back', signinTitle: 'Your school day,', signinTitleEm: 'in one place.',
    signinText: 'Sign in to see what needs your attention today.',
    signin1: 'Registers, marks and report cards for your classes',
    signin2: 'Results, attendance and fees for your children',
    signin3: 'Announcements and messages from the school office',
    passwordEyebrow: 'Account help', passwordTitle: 'Get back into', passwordTitleEm: 'your account.',
    passwordText: 'Reset links work once and expire after 30 minutes.',
    password1: 'We send a reset link to the email you sign in with',
    password2: 'Without email, the school office can help you',
    password3: 'Changing your password signs you out on other devices',
  },
  sw: {
    home: 'Mwanzo', features: 'Huduma', how: 'Jinsi inavyofanya kazi', access: 'Kupata akaunti', contact: 'Mawasiliano',
    goDashboard: 'Nenda kwenye dashibodi', openMenu: 'Fungua menyu', closeMenu: 'Funga menyu', siteNav: 'Tovuti',
    footerTag: 'Usimamizi wa shule kwa wasimamizi, walimu, wazazi na wanafunzi Zanzibar na Tanzania.',
    explore: 'Gundua', account: 'Akaunti', reach: 'Wasiliana na shule', forgot: 'Umesahau nenosiri', rights: 'Haki zote zimehifadhiwa.',
    signinEyebrow: 'Karibu tena', signinTitle: 'Siku yako ya shule,', signinTitleEm: 'mahali pamoja.',
    signinText: 'Ingia uone mambo yanayohitaji umakini wako leo.',
    signin1: 'Mahudhurio, alama na ripoti za madarasa yako',
    signin2: 'Matokeo, mahudhurio na ada za watoto wako',
    signin3: 'Matangazo na ujumbe kutoka ofisi ya shule',
    passwordEyebrow: 'Msaada wa akaunti', passwordTitle: 'Rudi kwenye', passwordTitleEm: 'akaunti yako.',
    passwordText: 'Viungo vya kubadili nenosiri vinatumika mara moja na huisha baada ya dakika 30.',
    password1: 'Tunatuma kiungo kwa barua pepe unayoingia nayo',
    password2: 'Bila barua pepe, ofisi ya shule itakusaidia',
    password3: 'Kubadili nenosiri kunakutoa kwenye vifaa vingine',
  },
};
type Key = keyof typeof M.en;

export type AuthStory = 'signin' | 'password';
const STORIES: Record<AuthStory, { icons: [LucideIcon, LucideIcon, LucideIcon] }> = {
  signin: { icons: [ClipboardCheck, Wallet, BellRing] },
  password: { icons: [MailCheck, ShieldCheck, LockKeyhole] },
};

export function BrandMark({ to = '/home' }: { to?: string }) {
  const school = useSchool();
  return (
    <Link to={to} className="brand">
      <span className="brand-logo">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <GraduationCap size={19} aria-hidden />}</span>
      <span style={{ minWidth: 0 }}>
        <span className="brand-name truncate" style={{ display: 'block' }}>{school.name}</span>
        <span className="brand-sub" style={{ display: 'block' }}>EduLearn</span>
      </span>
    </Link>
  );
}

export interface SiteLink { id: string; label: string }

/**
 * Floating site header. On the website the links scroll to sections (onSection); on other public pages they
 * go to the website's sections.
 */
export function SiteHeader({ links, onSection }: { links?: SiteLink[]; onSection?: (id: string) => (e: React.MouseEvent) => void }) {
  const { t: tc } = useI18n();
  const t = useT(M);
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  const items: SiteLink[] = links ?? [
    { id: 'features', label: t('features') }, { id: 'how', label: t('how') }, { id: 'access', label: t('access') }, { id: 'contact', label: t('contact') },
  ];

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); burger.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const link = (l: SiteLink) => (
    <a key={l.id} href={`/home#${l.id}`} onClick={onSection ? (e) => { setOpen(false); onSection(l.id)(e); } : undefined}>{l.label}</a>
  );

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <BrandMark />
        <nav className="site-links" aria-label={t('siteNav')}>{items.map(link)}</nav>
        <div className="site-actions">
          <span className="site-hide-sm"><LanguageSwitch compact /></span>
          {user ? (
            <Link to="/" className="btn btn-sm btn-ink">{t('goDashboard')}</Link>
          ) : (
            <>
              {pathname !== '/login' && pathname !== '/register' && <NavLink to="/login" className="btn btn-sm btn-ghost site-hide-sm">{tc('signIn')}</NavLink>}
              <Link to={pathname === '/register' ? '/login' : '/register'} className="btn btn-sm btn-ink">
                {pathname === '/register' ? tc('signIn') : tc('createAccount')}
              </Link>
            </>
          )}
          <Button
            ref={burger}
            variant="ghost"
            iconOnly
            className="site-burger"
            aria-label={open ? t('closeMenu') : t('openMenu')}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
            icon={open ? <X size={20} /> : <Menu size={20} />}
          />
        </div>
      </div>
      <nav id="site-menu" className={`site-menu${open ? ' open' : ''}`} aria-label={t('siteNav')} hidden={!open}>
        {items.map(link)}
        {!user && <Link to="/login">{tc('signIn')}</Link>}
        <div className="row"><LanguageSwitch /></div>
      </nav>
    </header>
  );
}

/** Dark footer shared by the website and the sign-in pages. */
export function PublicFooter({ onSection }: { onSection?: (id: string) => (e: React.MouseEvent) => void }) {
  const school = useSchool();
  const { t: tc } = useI18n();
  const t = useT(M);
  const section = (id: string, label: Key) => (
    <li><a href={`/home#${id}`} onClick={onSection ? onSection(id) : undefined}>{t(label)}</a></li>
  );
  return (
    <footer className="public-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <BrandMark />
            <p>{t('footerTag')}</p>
          </div>
          <nav aria-label={t('explore')}>
            <h2>{t('explore')}</h2>
            <ul>{section('features', 'features')}{section('how', 'how')}{section('access', 'access')}{section('contact', 'contact')}</ul>
          </nav>
          <nav aria-label={t('account')}>
            <h2>{t('account')}</h2>
            <ul>
              <li><Link to="/login">{tc('signIn')}</Link></li>
              <li><Link to="/register">{tc('createAccount')}</Link></li>
              <li><Link to="/forgot-password">{t('forgot')}</Link></li>
            </ul>
          </nav>
          <div>
            <h2>{t('reach')}</h2>
            <ul>
              {school.phone && <li><a href={`tel:${school.phone.replace(/\s/g, '')}`}>{school.phone}</a></li>}
              {school.email && <li><a href={`mailto:${school.email}`}>{school.email}</a></li>}
              {school.address && <li>{school.address}</li>}
              {section('contact', 'contact')}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {school.name}{school.motto ? ` · ${school.motto}` : ''}. {t('rights')}</span>
          <LanguageSwitch compact />
        </div>
      </div>
    </footer>
  );
}

/**
 * Sign-in, registration and password pages: a dark story panel explaining what the page is for, beside the form.
 * On tablets and phones the story panel is dropped so the form is the first thing on screen.
 */
export function AuthLayout({ children, story = 'signin' }: { children: ReactNode; story?: AuthStory | false }) {
  const t = useT(M);
  if (!story) {
    // Compact: just the form, centred.
    return (
      <div className="public">
        <a href="#auth-main" className="skip-link">Skip to main content</a>
        <SiteHeader />
        <main id="auth-main" className="auth-stage">
          <div className="auth-panel compact"><div className="auth-form">{children}</div></div>
        </main>
        <PublicFooter />
      </div>
    );
  }
  const [a, b, c] = STORIES[story].icons;
  const k = (s: string) => `${story}${s}` as Key;
  return (
    <div className="public">
      <a href="#auth-main" className="skip-link">Skip to main content</a>
      <SiteHeader />
      <main id="auth-main" className="auth-stage">
        <div className="auth-panel">
          <aside className="auth-story" aria-label={t(k('Eyebrow'))}>
            <p className="eyebrow ruled">{t(k('Eyebrow'))}</p>
            <h2>{t(k('Title'))} <em>{t(k('TitleEm'))}</em></h2>
            <p>{t(k('Text'))}</p>
            <ul className="auth-points">
              {[a, b, c].map((Icon, i) => (
                <li key={i}><span className="icon" aria-hidden><Icon size={17} /></span>{t(k(String(i + 1)))}</li>
              ))}
            </ul>
          </aside>
          <div className="auth-form">{children}</div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
