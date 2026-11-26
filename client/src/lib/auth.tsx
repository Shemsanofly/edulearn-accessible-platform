import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Preferences, SchoolSettings, SessionUser } from '../../../shared/types';
import { api, setUnauthorizedHandler } from './api';
import { setCurrency } from './format';
import { applyPreferences, storePreferences } from './preferences';

type School = SchoolSettings;

const DEFAULT_SCHOOL: School = {
  name: 'EduLearn', motto: null, address: null, phone: null, email: null, website: null, currency: 'TZS',
  defaultLanguage: 'en', levelLabel: 'Form', isDemo: false, logoUrl: null,
};

interface AuthState {
  user: SessionUser | null;
  school: School;
  setSchool: (s: School) => void;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  updatePreferences: (p: Preferences) => Promise<void>;
  setUser: (u: SessionUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [school, setSchoolState] = useState<School>(DEFAULT_SCHOOL);
  const setSchool = useCallback((s: School) => {
    setSchoolState(s);
    setCurrency(s.currency);
  }, []);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const setUser = useCallback((u: SessionUser) => {
    setUserState(u);
    // Server-stored preferences follow the user across devices; local ones are the fallback.
    if (Object.keys(u.preferences ?? {}).length) {
      storePreferences(u.preferences);
      applyPreferences(u.preferences);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUserState(null);
      queryClient.clear();
    });
    api
      .get<{ user: SessionUser | null; school: School }>('/auth/me')
      .then((res) => {
        if (res.user) setUser(res.user);
        setSchool(res.school);
      })
      .catch(() => setUserState(null))
      .finally(() => setLoading(false));
  }, [queryClient, setUser, setSchool]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ user: SessionUser }>('/auth/login', { email, password });
      const me = await api.get<{ user: SessionUser; school: School }>('/auth/me');
      setSchool(me.school);
      setUser(res.user);
      return res.user;
    },
    [setUser, setSchool],
  );

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUserState(null);
    queryClient.clear();
  }, [queryClient]);

  const updatePreferences = useCallback(
    async (p: Preferences) => {
      const merged = { ...(user?.preferences ?? {}), ...p };
      storePreferences(merged);
      applyPreferences(merged);
      if (user) {
        setUserState({ ...user, preferences: merged });
        await api.patch('/auth/profile', { preferences: p }).catch(() => {});
      }
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, school, setSchool, loading, signIn, signOut, updatePreferences, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user — only use inside authenticated routes. */
export function useUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('Not signed in');
  return user;
}

/** The school's settings (name, currency, level label…). Available on public pages too. */
export const useSchool = () => useAuth().school;
