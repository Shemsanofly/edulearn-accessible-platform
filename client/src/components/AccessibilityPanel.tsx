import { Check, Palette, Type } from 'lucide-react';
import type { Accent } from '../../../shared/types';
import { useAuth } from '../lib/auth';
import { loadPreferences } from '../lib/preferences';
import { LanguageSwitch, useI18n, useT } from '../lib/i18n';

const M = {
  en: { colour: 'Colour theme', mode: 'Mode', light: 'Light', dark: 'Dark', auto: 'Auto', text: 'Text size', contrast: 'High contrast', contrastHint: 'Stronger colours and borders', font: 'Readable font', fontHint: 'Atkinson Hyperlegible, designed for low vision', motion: 'Reduce motion', motionHint: 'Turn off animations', language: 'Language', title: 'Display & accessibility' },
  sw: { colour: 'Rangi', mode: 'Mwonekano', light: 'Mwanga', dark: 'Giza', auto: 'Kiotomatiki', text: 'Ukubwa wa maandishi', contrast: 'Utofautishaji mkubwa', contrastHint: 'Rangi na mipaka iliyo wazi zaidi', font: 'Herufi rahisi kusoma', fontHint: 'Atkinson Hyperlegible, kwa wenye uoni hafifu', motion: 'Punguza miondoko', motionHint: 'Zima michoro inayosogea', language: 'Lugha', title: 'Mwonekano na ufikivu' },
};
import { Segmented, Toggle } from './ui';

export const FONT_SCALES = [
  { value: 1, label: 'A' },
  { value: 1.125, label: 'A+' },
  { value: 1.25, label: 'A++' },
];

/**
 * Colour themes chosen for schools; Ocean teal is the default. Each has a short reason so people can pick one
 * that suits their school's own colours.
 */
export const ACCENTS: { id: Accent; swatch: string; en: string; sw: string }[] = [
  { id: 'teal', swatch: '#0e6672', en: 'Ocean teal', sw: 'Bahari' },
  { id: 'navy', swatch: '#1b3a6b', en: 'Academic navy', sw: 'Bluu ya kitaaluma' },
  { id: 'ocean', swatch: '#1d4ed8', en: 'Royal blue', sw: 'Bluu angavu' },
  { id: 'forest', swatch: '#276234', en: 'School green', sw: 'Kijani' },
  { id: 'rose', swatch: '#8c1d40', en: 'Maroon', sw: 'Damu ya mzee' },
  { id: 'purple', swatch: '#5b21b6', en: 'Royal purple', sw: 'Zambarau' },
  { id: 'sunset', swatch: '#a8401b', en: 'Terracotta', sw: 'Udongo' },
  { id: 'indigo', swatch: '#4338ca', en: 'Indigo', sw: 'Nili' },
];

export function ColourPicker() {
  const { user, updatePreferences } = useAuth();
  const p = user?.preferences && Object.keys(user.preferences).length ? user.preferences : loadPreferences();
  const { lang } = useI18n();
  const current = p.accent ?? 'teal';
  return (
    <div className="swatches" role="radiogroup" aria-label="Colour theme">
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={current === a.id}
          className="swatch"
          onClick={() => updatePreferences({ accent: a.id })}
        >
          <span className="dot" style={{ background: a.swatch }} aria-hidden />
          {lang === 'sw' ? a.sw : a.en}
          {current === a.id && <Check size={14} style={{ marginLeft: 'auto' }} aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/** Settings that make the app easier to read and use. Shared by the top-bar popover and the Settings page. */
export function AccessibilitySettings() {
  const { user, updatePreferences } = useAuth();
  const t = useT(M);
  const p = user?.preferences && Object.keys(user.preferences).length ? user.preferences : loadPreferences();
  return (
    <div>
      <div style={{ padding: '6px 0 14px' }}>
        <div className="row bold" style={{ gap: 8, marginBottom: 10 }}><Palette size={18} aria-hidden /> {t('colour')}</div>
        <ColourPicker />
      </div>
      <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <span className="bold">{t('language')}</span>
        <LanguageSwitch />
      </div>
      <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <span className="bold">{t('mode')}</span>
        <Segmented
          label={t('mode')}
          options={[{ value: 'light', label: t('light') }, { value: 'dark', label: t('dark') }, { value: 'system', label: t('auto') }]}
          value={p.theme ?? 'system'}
          onChange={(v) => updatePreferences({ theme: v })}
        />
      </div>
      <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <span className="row bold" style={{ gap: 8 }}><Type size={18} aria-hidden /> {t('text')}</span>
        <Segmented label={t('text')} options={FONT_SCALES} value={p.fontScale ?? 1} onChange={(v) => updatePreferences({ fontScale: v })} />
      </div>
      <Toggle label={t('contrast')} description={t('contrastHint')} checked={!!p.highContrast} onChange={(v) => updatePreferences({ highContrast: v })} />
      <Toggle label={t('font')} description={t('fontHint')} checked={!!p.dyslexiaFont} onChange={(v) => updatePreferences({ dyslexiaFont: v })} />
      <Toggle label={t('motion')} description={t('motionHint')} checked={!!p.reducedMotion} onChange={(v) => updatePreferences({ reducedMotion: v })} />
    </div>
  );
}

export function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  const t = useT(M);
  return (
    <div className="popover" style={{ width: 360, padding: '16px 18px', zIndex: 40, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' }} role="dialog" aria-label={t('title')} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>{t('title')}</h2>
      <AccessibilitySettings />
    </div>
  );
}
