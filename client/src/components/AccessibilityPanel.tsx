import { Check, Palette, Type } from 'lucide-react';
import type { Accent } from '../../../shared/types';
import { useAuth } from '../lib/auth';
import { loadPreferences } from '../lib/preferences';
import { Segmented, Toggle } from './ui';

export const FONT_SCALES = [
  { value: 1, label: 'A' },
  { value: 1.125, label: 'A+' },
  { value: 1.25, label: 'A++' },
];

/** The colour themes a person can choose. `swatch` previews the theme's own gradient. */
export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'indigo', label: 'Indigo', swatch: 'linear-gradient(135deg, #4338ca, #9333ea)' },
  { id: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg, #075985, #0d9488)' },
  { id: 'forest', label: 'Forest', swatch: 'linear-gradient(135deg, #065f46, #65a30d)' },
  { id: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg, #c2410c, #db2777)' },
  { id: 'grape', label: 'Grape', swatch: 'linear-gradient(135deg, #6b21a8, #c026d3)' },
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg, #be123c, #ea580c)' },
];

export function ColourPicker() {
  const { user, updatePreferences } = useAuth();
  const p = user?.preferences && Object.keys(user.preferences).length ? user.preferences : loadPreferences();
  const current = p.accent ?? 'indigo';
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
          {a.label}
          {current === a.id && <Check size={14} style={{ marginLeft: 'auto' }} aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/** Settings that make the app easier to read and use. Shared by the top-bar popover and the Settings page. */
export function AccessibilitySettings() {
  const { user, updatePreferences } = useAuth();
  const p = user?.preferences && Object.keys(user.preferences).length ? user.preferences : loadPreferences();
  return (
    <div>
      <div style={{ padding: '6px 0 14px' }}>
        <div className="row bold" style={{ gap: 8, marginBottom: 10 }}><Palette size={18} aria-hidden /> Colour theme</div>
        <ColourPicker />
      </div>
      <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <span className="bold">Mode</span>
        <Segmented
          label="Light or dark mode"
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Auto' }]}
          value={p.theme ?? 'system'}
          onChange={(v) => updatePreferences({ theme: v })}
        />
      </div>
      <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <span className="row bold" style={{ gap: 8 }}><Type size={18} aria-hidden /> Text size</span>
        <Segmented label="Text size" options={FONT_SCALES} value={p.fontScale ?? 1} onChange={(v) => updatePreferences({ fontScale: v })} />
      </div>
      <Toggle label="High contrast" description="Stronger colours and borders" checked={!!p.highContrast} onChange={(v) => updatePreferences({ highContrast: v })} />
      <Toggle label="Readable font" description="Atkinson Hyperlegible, designed for low vision" checked={!!p.dyslexiaFont} onChange={(v) => updatePreferences({ dyslexiaFont: v })} />
      <Toggle label="Reduce motion" description="Turn off animations" checked={!!p.reducedMotion} onChange={(v) => updatePreferences({ reducedMotion: v })} />
    </div>
  );
}

export function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="popover" style={{ width: 360, padding: '16px 18px', zIndex: 40, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' }} role="dialog" aria-label="Display and accessibility" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>Display &amp; accessibility</h2>
      <AccessibilitySettings />
    </div>
  );
}
