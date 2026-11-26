import { GraduationCap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSchool } from '../lib/auth';
import { LanguageSwitch, useI18n, useT } from '../lib/i18n';

/**
 * The classroom photo used on the sign-in, registration and public pages.
 * Licence: CC BY-SA 4.0 — the credit must stay visible next to the photo. See public/images/CREDITS.md.
 */
export const PHOTO_CREDIT = {
  title: 'Students in classroom Tanzania',
  author: 'Seemannaufland',
  source: 'https://commons.wikimedia.org/wiki/File:Students_in_classroom_Tanzania.JPG',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};

const M = {
  en: {
    home: 'Home',
    photoAlt: 'Secondary school students in uniform sitting at their desks in a Tanzanian classroom.',
    photoBy: 'Photo: “{title}” by {author}, {license}, cropped.',
  },
  sw: {
    home: 'Mwanzo',
    photoAlt: 'Wanafunzi wa sekondari waliovaa sare wakiwa wamekaa kwenye madawati darasani Tanzania.',
    photoBy: 'Picha: “{title}” na {author}, {license}, imekatwa.',
  },
};

/** Public header used on the website, sign-in and registration pages. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const school = useSchool();
  const { t: tc } = useI18n();
  const t = useT(M);
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/home" className="brand" style={{ padding: 0 }}>
          <span className="brand-logo">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <GraduationCap size={20} aria-hidden />}</span>
          <span style={{ minWidth: 0 }}>
            <span className="brand-name truncate" style={{ display: 'block', maxWidth: '40vw' }}>{school.name}</span>
            <span className="brand-sub" style={{ display: 'block' }}>EduLearn</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Site">
          {children ?? (
            <>
              <NavLink to="/home" className="nav-pill optional">{t('home')}</NavLink>
              <NavLink to="/login" className="nav-pill">{tc('signIn')}</NavLink>
              <NavLink to="/register" className="nav-pill optional">{tc('createAccount')}</NavLink>
            </>
          )}
          <LanguageSwitch compact />
        </nav>
      </div>
    </header>
  );
}

/** The licensed classroom photo with its credit. Falls back to a plain tinted panel if it can't load. */
export function ClassroomPhoto({ variant = 'portrait', className }: { variant?: 'portrait' | 'wide'; className?: string }) {
  const t = useT(M);
  const [failed, setFailed] = useState(false);
  const sizes = variant === 'portrait' ? [640, 960, 1280] : [960, 1600];
  const srcset = (ext: string) => sizes.map((w) => `/images/classroom-${variant}-${w}.${ext} ${w}w`).join(', ');
  const fallback = `/images/classroom-${variant}-${sizes[1]}.jpg`;
  const sizeHint = variant === 'portrait' ? '(max-width: 1200px) 46vw, 560px' : '(max-width: 960px) 100vw, 640px';
  return (
    <figure className={className ?? 'auth-photo'}>
      <div className="frame">
        {!failed && (
          <picture>
            <source type="image/webp" srcSet={srcset('webp')} sizes={sizeHint} />
            <img
              src={fallback}
              srcSet={srcset('jpg')}
              sizes={sizeHint}
              alt={t('photoAlt')}
              decoding="async"
              loading={variant === 'portrait' ? 'eager' : 'lazy'}
              onError={() => setFailed(true)}
            />
          </picture>
        )}
      </div>
      <figcaption>
        {t('photoBy', { title: PHOTO_CREDIT.title, author: PHOTO_CREDIT.author, license: PHOTO_CREDIT.license })}{' '}
        <a href={PHOTO_CREDIT.source} target="_blank" rel="noreferrer noopener">Wikimedia Commons</a>
        {' · '}
        <a href={PHOTO_CREDIT.licenseUrl} target="_blank" rel="noreferrer noopener">{PHOTO_CREDIT.license}</a>
      </figcaption>
    </figure>
  );
}

/**
 * Shared layout for sign-in, registration and password pages: a focused form on the left and the
 * classroom photo on the right. On tablets and phones the photo is dropped so the form comes first.
 */
/** True when the screen is wide enough for the photo, so phones never download it. */
function useWideScreen() {
  const query = '(min-width: 961px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function AuthLayout({ children, photo = true }: { children: ReactNode; photo?: boolean }) {
  const school = useSchool();
  const wide = useWideScreen();
  return (
    <div className="auth-shell">
      <a href="#auth-main" className="skip-link">Skip to main content</a>
      <SiteHeader />
      <main id="auth-main" className={photo ? 'auth-main' : 'auth-main single'}>
        <div className="auth-card">{children}</div>
        {photo && wide && <ClassroomPhoto />}
      </main>
      <footer className="site-footer">
        © {new Date().getFullYear()} {school.name}
        {school.motto ? ` · ${school.motto}` : ''}
      </footer>
    </div>
  );
}
