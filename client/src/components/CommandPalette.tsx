import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, GraduationCap, School, Search, UserRound, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { SearchResults } from '../../../shared/types';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { NAV, SETTINGS_ITEM } from './nav';
import { useDebounced } from './ui';

interface Item {
  group: string;
  label: string;
  detail?: string;
  icon: ReactNode;
  to: string;
}

/** Ctrl/⌘+K: jump to any page, or find a student, teacher, parent or class. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useUser();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(q, 200);
  const canSearchPeople = user.role === 'admin' || user.role === 'teacher';

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResults>('/search', { q: debounced }),
    enabled: open && canSearchPeople && debounced.trim().length >= 2,
  });

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const pages = [...NAV[user.role].flatMap((g) => g.items), SETTINGS_ITEM]
      .filter((p) => !needle || `${p.label} ${p.keywords ?? ''}`.toLowerCase().includes(needle))
      .map((p) => ({ group: 'Pages', label: p.label, icon: <p.icon size={18} />, to: p.to }));
    const people: Item[] = [];
    if (data && needle.length >= 2) {
      data.students.forEach((s) => people.push({ group: 'Students', label: s.name, detail: s.detail, icon: <GraduationCap size={18} />, to: `/students/${s.id}` }));
      data.classes.forEach((c) => people.push({ group: 'Classes', label: c.name, detail: c.detail, icon: <School size={18} />, to: `/classes/${c.id}` }));
      if (user.role === 'admin') {
        data.teachers.forEach((t) => people.push({ group: 'Teachers', label: t.name, detail: t.detail, icon: <UserRound size={18} />, to: `/teachers?focus=${t.id}` }));
        data.parents.forEach((p) => people.push({ group: 'Parents', label: p.name, detail: p.detail, icon: <Users size={18} />, to: `/parents?search=${encodeURIComponent(p.name)}` }));
      }
    }
    return [...people, ...pages].slice(0, 30);
  }, [q, data, user.role]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  let lastGroup = '';
  return createPortal(
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Search size={20} aria-hidden className="subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={canSearchPeople ? 'Search people, classes or pages…' : 'Search pages…'}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={items[active] ? `palette-item-${active}` : undefined}
            aria-label="Search"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
              if (e.key === 'Escape') onClose();
            }}
          />
          {isFetching && <span className="spinner" style={{ width: 16, height: 16 }} aria-hidden />}
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="palette-results" id="palette-results" role="listbox" aria-label="Results">
          {items.length === 0 && <div className="empty small">No matches for “{q}”</div>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? <div className="palette-group" role="presentation">{item.group}</div> : null;
            lastGroup = item.group;
            return (
              <div key={`${item.group}-${item.to}-${i}`}>
                {header}
                <button
                  type="button"
                  id={`palette-item-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="palette-item"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  tabIndex={-1}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span className="bold">{item.label}</span>
                  {item.detail && <span className="detail">{item.detail}</span>}
                  {i === active && !item.detail && <CornerDownLeft size={15} className="detail" aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
