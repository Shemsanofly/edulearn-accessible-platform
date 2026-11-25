import type { Preferences } from '../../../shared/types';

const KEY = 'edulearn-prefs';

export function loadPreferences(): Preferences {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Preferences;
  } catch {
    return {};
  }
}

export function storePreferences(p: Preferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage may be unavailable (private mode) — preferences still apply for this visit */
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyPreferences(p: Preferences) {
  const root = document.documentElement;
  const theme = p.theme ?? 'system';
  root.dataset.theme = theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme;
  root.style.fontSize = `${(p.fontScale ?? 1) * 100}%`;
  if (p.highContrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
  if (p.reducedMotion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
  if (p.dyslexiaFont) root.dataset.font = 'readable';
  else delete root.dataset.font;
}

// Follow the OS theme live when the user picked "system".
media?.addEventListener('change', () => {
  const p = loadPreferences();
  if (!p.theme || p.theme === 'system') applyPreferences(p);
});
