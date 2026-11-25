import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Preferences, SessionUser } from '../../../shared/types';
import { api, setUnauthorizedHandler } from './api';
import { setCurrency } from './format';
import { applyPreferences, storePreferences } from './preferences';

interface School {
  name: string;
  currency: string;
}

interface AuthState {
  user: SessionUser | null;
  school: School;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  updatePreferences: (p: Preferences) => Promise<void>;
  setUser: (u: SessionUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [school, setSchool] = useState<School>({ name: 'EduLearn Academy', currency: 'USD' });
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
      .get<{ user: SessionUser; school: School }>('/auth/me')
      .then((res) => {
        setUser(res.user);
        setSchool(res.school);
        setCurrency(res.school.currency);
      })
      .catch(() => setUserState(null))
      .finally(() => setLoading(false));
  }, [queryClient, setUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ user: SessionUser }>('/auth/login', { email, password });
      const me = await api.get<{ user: SessionUser; school: School }>('/auth/me');
      setSchool(me.school);
      setCurrency(me.school.currency);
      setUser(res.user);
      return res.user;
    },
    [setUser],
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
    <AuthContext.Provider value={{ user, school, loading, signIn, signOut, updatePreferences, setUser }}>
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
