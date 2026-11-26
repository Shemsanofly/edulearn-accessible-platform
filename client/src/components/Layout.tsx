import { useQuery } from '@tanstack/react-query';
import { Accessibility, FlaskConical, GraduationCap, Keyboard, LogOut, Menu, Moon, Search, Settings, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { GradingScale, Notifications } from '../../../shared/types';
import { api } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { fullName, ROLE_META, setGradeBands } from '../lib/format';
import { LanguageSwitch, useI18n } from '../lib/i18n';
import { NotificationBell } from './NotificationBell';
import { AccessibilityPanel } from './AccessibilityPanel';
import { CommandPalette } from './CommandPalette';
import { ShortcutsDialog } from './ShortcutsDialog';
import { NAV, SETTINGS_ITEM } from './nav';
import { Avatar, Badge, Button, cx } from './ui';

export function Layout() {
  const user = useUser();
  const { school, signOut, updatePreferences } = useAuth();
  const { t } = useI18n();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [menu, setMenu] = useState<'user' | 'a11y' | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);

  const { data: notes } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notifications>('/auth/notifications'),
    refetchInterval: 60_000,
  });
  const unread = notes?.unreadMessages ?? 0;

  // Letter grades everywhere follow the school's default grading scale.
  const { data: scales } = useQuery({ queryKey: ['grading-scales'], queryFn: () => api.get<GradingScale[]>('/grading-scales'), staleTime: 10 * 60_000 });
  const defaultScale = scales?.find((s) => s.isDefault) ?? scales?.[0];
  if (defaultScale) setGradeBands(defaultScale.bands);

  // Close the mobile drawer and move focus to the page on navigation (helps screen reader users).
  useEffect(() => {
    setNavOpen(false);
    setMenu(null);
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === 'Escape') setMenu(null);
      // "?" opens the shortcut list, unless the person is typing.
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isDark = document.documentElement.dataset.theme === 'dark';
  const role = ROLE_META[user.role];

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to main content</a>

      <aside className={cx('sidebar', navOpen && 'open')} aria-label="Main navigation">
        <Link to="/" className="brand">
          <span className="brand-logo">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <GraduationCap size={22} aria-hidden />}</span>
          <span style={{ minWidth: 0 }}>
            <span className="brand-name truncate" style={{ display: 'block' }}>{school.name}</span>
            <span className="brand-sub" style={{ display: 'block' }}>EduLearn SMS</span>
          </span>
        </Link>
        <nav>
          {NAV[user.role].map((group, i) => (
            <div className="nav-section" key={i}>
              {group.label && <div className="nav-label">{t(group.label)}</div>}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => cx('nav-link', isActive && 'active')}>
                  <span className="nav-icon" aria-hidden><item.icon size={18} /></span>
                  <span>{t(item.label)}</span>
                  {item.badge === 'messages' && unread > 0 && (
                    <Badge tone="danger">
                      {unread}
                      <span className="sr-only"> {t('unread', { n: '' })}</span>
                    </Badge>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to={SETTINGS_ITEM.to} className={({ isActive }) => cx('nav-link', isActive && 'active')}>
            <span className="nav-icon" aria-hidden><Settings size={18} /></span> {t('settings')}
          </NavLink>
          <div className="sidebar-user">
            <Avatar name={fullName(user)} color={role.color} photoUrl={user.photoUrl} />
            <div className="who">
              <Link to="/settings" className="truncate" style={{ display: 'block' }}>{fullName(user)}</Link>
              <span>{t(user.role)}</span>
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label={t('signOut')} title={t('signOut')} onClick={() => signOut().then(() => navigate('/login'))} icon={<LogOut size={17} />} />
          </div>
        </div>
      </aside>
      <div className={cx('sidebar-backdrop', navOpen && 'open')} onClick={() => setNavOpen(false)} aria-hidden />

      <div className="main">
        <header className="topbar">
          <Button variant="ghost" iconOnly className="menu-toggle" aria-label="Open navigation menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)} icon={<Menu size={22} />} />
          <button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label={`${t('search')} (Ctrl+K)`}>
            <Search size={18} aria-hidden />
            <span className="hint">{user.role === 'admin' || user.role === 'teacher' ? t('searchPlaceholder') : t('jumpPlaceholder')}</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            {school.isDemo && (
              <span className="demo-ribbon hide-mobile" title="This school uses invented demonstration data">
                <FlaskConical size={13} aria-hidden /> {t('demoData')}
              </span>
            )}
            <span className="hide-mobile"><LanguageSwitch compact /></span>
            <Button variant="ghost" iconOnly aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => updatePreferences({ theme: isDark ? 'light' : 'dark' })} icon={isDark ? <Sun size={20} /> : <Moon size={20} />} />
            <div style={{ position: 'relative' }}>
              <Button variant="ghost" iconOnly aria-label={t('displayAccessibility')} aria-expanded={menu === 'a11y'} onClick={() => setMenu(menu === 'a11y' ? null : 'a11y')} icon={<Accessibility size={20} />} />
              {menu === 'a11y' && <AccessibilityPanel onClose={() => setMenu(null)} />}
            </div>
            <NotificationBell counts={notes} />
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn btn-ghost" style={{ paddingLeft: 6, gap: 10 }} aria-haspopup="menu" aria-expanded={menu === 'user'} onClick={() => setMenu(menu === 'user' ? null : 'user')}>
                <Avatar name={fullName(user)} size="sm" color={role.color} photoUrl={user.photoUrl} />
                <span className="small user-label" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <span className="bold" style={{ display: 'block', color: 'var(--text)' }}>{user.firstName}</span>
                  <span className="tiny muted">{t(user.role)}</span>
                </span>
              </button>
              {menu === 'user' && (
                <div className="popover" role="menu">
                  <div style={{ padding: '8px 12px 10px' }}>
                    <div className="bold">{fullName(user)}</div>
                    <div className="small muted truncate">{user.email}</div>
                  </div>
                  <div className="menu-divider" />
                  <div className="menu-item show-mobile-flex" style={{ cursor: 'default' }}><LanguageSwitch /></div>
                  <Link role="menuitem" to="/settings" className="menu-item"><Settings size={17} aria-hidden /> {t('settings')}</Link>
                  <button role="menuitem" type="button" className="menu-item" onClick={() => { setMenu(null); setShortcutsOpen(true); }}>
                    <Keyboard size={17} aria-hidden /> {t('keyboardShortcuts')} <kbd className="kbd" style={{ marginLeft: 'auto' }}>?</kbd>
                  </button>
                  <button role="menuitem" type="button" className="menu-item" onClick={() => signOut().then(() => navigate('/login'))}>
                    <LogOut size={17} aria-hidden /> {t('signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {menu && <div style={{ position: 'fixed', inset: 0, zIndex: 15 }} onClick={() => setMenu(null)} aria-hidden />}
        <main id="main" ref={mainRef} tabIndex={-1} className="content">
          {/* Keyed by path so each page gently fades in. */}
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Phones: the four most-used pages one tap away, plus the full menu. */}
      <nav className="bottom-nav" aria-label="Quick navigation">
        {NAV[user.role].flatMap((g) => g.items).slice(0, 4).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => cx(isActive && 'active')}>
            <item.icon aria-hidden />
            <span>{t(item.short ?? item.label)}</span>
            {item.badge === 'messages' && unread > 0 && <span className="dot-count" aria-label={`${unread} unread`}>{unread}</span>}
          </NavLink>
        ))}
        <button type="button" onClick={() => setNavOpen(true)} aria-label={t('menu')}>
          <Menu aria-hidden />
          <span>{t('menu')}</span>
        </button>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
