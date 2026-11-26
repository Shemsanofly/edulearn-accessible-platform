import { useQuery } from '@tanstack/react-query';
import {
  Accessibility, ChevronDown, ClipboardCheck, GraduationCap, Keyboard, LogOut, Megaphone, Menu, MessageSquare, Moon,
  NotebookPen, Plus, Search, Settings, Sun, UserPlus, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { GradingScale, Notifications, Role } from '../../../shared/types';
import { api } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { fullName, ROLE_META, setGradeBands } from '../lib/format';
import { LanguageSwitch, useI18n, type CommonKey } from '../lib/i18n';
import { AccessibilityPanel } from './AccessibilityPanel';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { ShortcutsDialog } from './ShortcutsDialog';
import { NAV, SETTINGS_ITEM } from './nav';
import { Avatar, Badge, Button, cx, useDismiss } from './ui';

/** The few tasks each role does most often, one click away from any page. */
const QUICK_ACTIONS: Partial<Record<Role, { label: CommonKey; to: string; icon: LucideIcon }[]>> = {
  admin: [
    { label: 'inviteSomeone', to: '/invitations?new=1', icon: UserPlus },
    { label: 'enrolStudent', to: '/students?new=1', icon: GraduationCap },
    { label: 'createInvoices', to: '/fees?new=1', icon: Wallet },
    { label: 'postAnnouncement', to: '/announcements?new=1', icon: Megaphone },
    { label: 'takeRegister', to: '/attendance', icon: ClipboardCheck },
  ],
  teacher: [
    { label: 'takeRegister', to: '/attendance', icon: ClipboardCheck },
    { label: 'enterMarks', to: '/gradebook', icon: NotebookPen },
    { label: 'postAnnouncement', to: '/announcements?new=1', icon: Megaphone },
    { label: 'messageParent', to: '/messages?compose=1', icon: MessageSquare },
  ],
};

type MenuName = 'user' | 'a11y' | 'quick' | null;

export function Layout() {
  const user = useUser();
  const { school, signOut, updatePreferences } = useAuth();
  const { t } = useI18n();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [menu, setMenu] = useState<MenuName>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

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

  // The phone drawer behaves like a dialog: focus moves in, Escape closes it and focus returns.
  useEffect(() => {
    if (!navOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
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

  const closeMenu = useCallback(() => setMenu(null), []);
  const toggle = (name: MenuName) => setMenu((m) => (m === name ? null : name));
  const isDark = document.documentElement.dataset.theme === 'dark';
  const role = ROLE_META[user.role];
  const quick = QUICK_ACTIONS[user.role];
  const doSignOut = () => signOut().then(() => navigate('/login'));

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to main content</a>

      <aside ref={sidebarRef} className={cx('sidebar', navOpen && 'open')} aria-label="Main navigation">
        <div className="row between">
          <Link to="/" className="brand">
            <span className="brand-logo">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <GraduationCap size={20} aria-hidden />}</span>
            <span style={{ minWidth: 0 }}>
              <span className="brand-name truncate" style={{ display: 'block' }}>{school.name}</span>
              <span className="brand-sub" style={{ display: 'block' }}>EduLearn</span>
            </span>
          </Link>
          <Button variant="ghost" size="sm" iconOnly className="menu-toggle" aria-label={t('close')} onClick={() => setNavOpen(false)} icon={<X size={18} />} />
        </div>
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
            <Avatar name={fullName(user)} size="sm" color={role.color} photoUrl={user.photoUrl} />
            <div className="who">
              <Link to="/settings" className="truncate" style={{ display: 'block' }}>{fullName(user)}</Link>
              <span>{t(user.role)}</span>
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label={t('signOut')} title={t('signOut')} onClick={doSignOut} icon={<LogOut size={16} />} />
          </div>
        </div>
      </aside>
      <div className={cx('sidebar-backdrop', navOpen && 'open')} onClick={() => setNavOpen(false)} aria-hidden />

      <div className="main">
        <header className="topbar">
          <Button ref={menuToggleRef} variant="ghost" iconOnly className="menu-toggle" aria-label={t('menu')} aria-expanded={navOpen} onClick={() => setNavOpen(true)} icon={<Menu size={20} />} />
          <button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label={`${t('search')} (Ctrl+K)`}>
            <Search size={17} aria-hidden />
            <span className="hint">{user.role === 'admin' || user.role === 'teacher' ? t('searchPlaceholder') : t('jumpPlaceholder')}</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            {quick && (
              <Popover name="quick" open={menu === 'quick'} onToggle={toggle} onClose={closeMenu}
                trigger={(props) => (
                  <Button {...props} variant="primary" size="sm" icon={<Plus size={16} />} aria-haspopup="menu" className="hide-mobile">
                    {t('newItem')} <ChevronDown size={14} aria-hidden />
                  </Button>
                )}
              >
                <div className="popover" role="menu" aria-label={t('quickActions')} style={{ left: 0, right: 'auto' }}>
                  <div className="tiny muted bold" style={{ padding: '6px 12px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('quickActions')}</div>
                  {quick.map((a) => (
                    <Link key={a.to} role="menuitem" to={a.to} className="menu-item" onClick={closeMenu}>
                      <a.icon size={17} aria-hidden /> {t(a.label)}
                    </Link>
                  ))}
                </div>
              </Popover>
            )}
            <span className="hide-mobile"><LanguageSwitch compact /></span>
            <Button variant="ghost" iconOnly aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => updatePreferences({ theme: isDark ? 'light' : 'dark' })} icon={isDark ? <Sun size={19} /> : <Moon size={19} />} />
            <Popover name="a11y" open={menu === 'a11y'} onToggle={toggle} onClose={closeMenu}
              trigger={(props) => <Button {...props} variant="ghost" iconOnly aria-label={t('displayAccessibility')} icon={<Accessibility size={19} />} />}
            >
              <AccessibilityPanel onClose={closeMenu} />
            </Popover>
            <NotificationBell counts={notes} />
            <Popover name="user" open={menu === 'user'} onToggle={toggle} onClose={closeMenu}
              trigger={(props) => (
                <button {...props} type="button" className="btn btn-ghost" style={{ paddingLeft: 6, gap: 10 }} aria-haspopup="menu">
                  <Avatar name={fullName(user)} size="sm" color={role.color} photoUrl={user.photoUrl} />
                  <span className="small user-label" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                    <span className="bold" style={{ display: 'block', color: 'var(--text)' }}>{user.firstName}</span>
                    <span className="tiny muted">{t(user.role)}</span>
                  </span>
                </button>
              )}
            >
              <div className="popover" role="menu">
                <div style={{ padding: '8px 12px 10px' }}>
                  <div className="bold">{fullName(user)}</div>
                  <div className="small muted truncate">{user.email}</div>
                </div>
                <div className="menu-divider" />
                <div className="menu-item show-mobile-flex" style={{ cursor: 'default' }}><LanguageSwitch /></div>
                {quick && quick.map((a) => (
                  <Link key={a.to} role="menuitem" to={a.to} className="menu-item show-mobile-flex" onClick={closeMenu}>
                    <a.icon size={17} aria-hidden /> {t(a.label)}
                  </Link>
                ))}
                <Link role="menuitem" to="/settings" className="menu-item" onClick={closeMenu}><Settings size={17} aria-hidden /> {t('settings')}</Link>
                <button role="menuitem" type="button" className="menu-item" onClick={() => { closeMenu(); setShortcutsOpen(true); }}>
                  <Keyboard size={17} aria-hidden /> {t('keyboardShortcuts')} <kbd className="kbd" style={{ marginLeft: 'auto' }}>?</kbd>
                </button>
                <div className="menu-divider" />
                <button role="menuitem" type="button" className="menu-item" onClick={doSignOut}>
                  <LogOut size={17} aria-hidden /> {t('signOut')}
                </button>
              </div>
            </Popover>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="content">
          {/* Keyed by path so each page gently fades in (turned off by reduced motion). */}
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
        <button type="button" onClick={() => setNavOpen(true)} aria-label={t('menu')} aria-expanded={navOpen}>
          <Menu aria-hidden />
          <span>{t('menu')}</span>
        </button>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

/** A trigger plus its popup. Closes on outside click or Escape and returns focus to the trigger. */
function Popover({ name, open, onToggle, onClose, trigger, children }: {
  name: Exclude<MenuName, null>;
  open: boolean;
  onToggle: (name: MenuName) => void;
  onClose: () => void;
  trigger: (props: { ref: React.RefObject<HTMLButtonElement | null>; onClick: () => void; 'aria-expanded': boolean }) => React.ReactNode;
  children: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useDismiss(open, onClose, wrap, btn);
  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      {trigger({ ref: btn, onClick: () => onToggle(name), 'aria-expanded': open })}
      {open && children}
    </div>
  );
}
