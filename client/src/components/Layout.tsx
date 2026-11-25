import { useQuery } from '@tanstack/react-query';
import { Accessibility, Bell, GraduationCap, LogOut, Menu, Moon, Search, Settings, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Notifications } from '../../../shared/types';
import { api } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { fullName, ROLE_META } from '../lib/format';
import { AccessibilityPanel } from './AccessibilityPanel';
import { CommandPalette } from './CommandPalette';
import { NAV, SETTINGS_ITEM } from './nav';
import { Avatar, Badge, Button, cx } from './ui';

export function Layout() {
  const user = useUser();
  const { school, signOut, updatePreferences } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
          <span className="brand-logo"><GraduationCap size={22} aria-hidden /></span>
          <span>
            <span className="brand-name">EduLearn</span>
            <span className="brand-sub" style={{ display: 'block' }}>{school.name}</span>
          </span>
        </Link>
        <nav>
          {NAV[user.role].map((group, i) => (
            <div className="nav-section" key={i}>
              {group.label && <div className="nav-label">{group.label}</div>}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => cx('nav-link', isActive && 'active')}>
                  <item.icon size={19} aria-hidden />
                  <span>{item.label}</span>
                  {item.badge === 'messages' && unread > 0 && (
                    <Badge tone="danger">
                      {unread}
                      <span className="sr-only"> unread</span>
                    </Badge>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to={SETTINGS_ITEM.to} className={({ isActive }) => cx('nav-link', isActive && 'active')}>
            <Settings size={19} aria-hidden /> Settings
          </NavLink>
        </div>
      </aside>
      <div className={cx('sidebar-backdrop', navOpen && 'open')} onClick={() => setNavOpen(false)} aria-hidden />

      <div className="main">
        <header className="topbar">
          <Button variant="ghost" iconOnly className="menu-toggle" aria-label="Open navigation menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)} icon={<Menu size={22} />} />
          <button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label="Search and jump to pages (Ctrl+K)">
            <Search size={18} aria-hidden />
            <span className="hint">{user.role === 'admin' || user.role === 'teacher' ? 'Search students, classes, pages…' : 'Jump to a page…'}</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <Button variant="ghost" iconOnly aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => updatePreferences({ theme: isDark ? 'light' : 'dark' })} icon={isDark ? <Sun size={20} /> : <Moon size={20} />} />
            <div style={{ position: 'relative' }}>
              <Button variant="ghost" iconOnly aria-label="Accessibility options" aria-expanded={menu === 'a11y'} onClick={() => setMenu(menu === 'a11y' ? null : 'a11y')} icon={<Accessibility size={20} />} />
              {menu === 'a11y' && <AccessibilityPanel onClose={() => setMenu(null)} />}
            </div>
            <span className="icon-badge-wrap">
              <Button variant="ghost" iconOnly aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} onClick={() => navigate('/messages')} icon={<Bell size={20} />} />
              {unread > 0 && <span className="dot-count" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
            </span>
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn btn-ghost" style={{ paddingLeft: 6, gap: 10 }} aria-haspopup="menu" aria-expanded={menu === 'user'} onClick={() => setMenu(menu === 'user' ? null : 'user')}>
                <Avatar name={fullName(user)} size="sm" color={role.color} />
                <span className="small" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <span className="bold" style={{ display: 'block', color: 'var(--text)' }}>{user.firstName}</span>
                  <span className="tiny muted">{role.label}</span>
                </span>
              </button>
              {menu === 'user' && (
                <div className="popover" role="menu">
                  <div style={{ padding: '8px 12px 10px' }}>
                    <div className="bold">{fullName(user)}</div>
                    <div className="small muted truncate">{user.email}</div>
                  </div>
                  <div className="menu-divider" />
                  <Link role="menuitem" to="/settings" className="menu-item"><Settings size={17} aria-hidden /> Settings</Link>
                  <button role="menuitem" type="button" className="menu-item" onClick={() => signOut().then(() => navigate('/login'))}>
                    <LogOut size={17} aria-hidden /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {menu && <div style={{ position: 'fixed', inset: 0, zIndex: 15 }} onClick={() => setMenu(null)} aria-hidden />}
        <main id="main" ref={mainRef} tabIndex={-1} className="content">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
