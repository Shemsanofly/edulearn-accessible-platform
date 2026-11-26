import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StudentListItem } from '../../../shared/types';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { fullName } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Avatar } from './ui';

export type Child = StudentListItem & { relationship?: string };

const KEY = 'edulearn-child';

/** The children a parent can see (or the student themself). Cached for the session. */
export function useChildren() {
  const user = useUser();
  return useQuery({
    queryKey: ['my-children', user.id],
    queryFn: () => api.get<Child[]>('/my/children'),
    staleTime: 5 * 60_000,
    enabled: user.role === 'parent' || user.role === 'student',
  });
}

/**
 * Which child a parent is looking at. Kept in the URL (?child=ID) so links can be shared and the
 * back button works, and remembered between pages.
 */
export function useSelectedChild(): { child: Child | null; children: Child[]; setChild: (id: number) => void; isLoading: boolean } {
  const user = useUser();
  const { data = [], isLoading } = useChildren();
  const [params, setParams] = useSearchParams();
  let remembered: number | null = null;
  try {
    remembered = Number(localStorage.getItem(KEY)) || null;
  } catch {
    /* ignore */
  }
  const fromUrl = Number(params.get('child')) || null;
  const child =
    (user.role === 'student' ? data[0] : data.find((c) => c.id === fromUrl) ?? data.find((c) => c.id === remembered) ?? data[0]) ?? null;

  useEffect(() => {
    if (child) {
      try {
        localStorage.setItem(KEY, String(child.id));
      } catch {
        /* ignore */
      }
    }
  }, [child]);

  const setChild = (id: number) => {
    const next = new URLSearchParams(params);
    next.set('child', String(id));
    setParams(next, { replace: true });
  };
  return { child, children: data, setChild, isLoading };
}

/** Big friendly buttons to switch between children. Hidden when there's only one child. */
export function ChildSwitcher({ children, value, onChange }: { children: Child[]; value: number | null; onChange: (id: number) => void }) {
  const { t } = useI18n();
  if (children.length < 2) return null;
  return (
    <div className="child-switcher" role="group" aria-label={t('switchChild')}>
      {children.map((c) => (
        <button key={c.id} type="button" className="child-chip" aria-pressed={c.id === value} onClick={() => onChange(c.id)}>
          <Avatar name={fullName(c)} size="sm" photoUrl={c.photoUrl} />
          <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
            {c.firstName}
            <small>{c.className ?? '—'}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
