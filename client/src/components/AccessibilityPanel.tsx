import { Type } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { loadPreferences } from '../lib/preferences';
import { Segmented, Toggle } from './ui';

export const FONT_SCALES = [
  { value: 1, label: 'A' },
  { value: 1.125, label: 'A+' },
  { value: 1.25, label: 'A++' },
];

/** Settings that make the app easier to read and use. Shared by the top-bar popover and the Settings page. */
export function AccessibilitySettings() {
  const { user, updatePreferences } = useAuth();
  const p = user?.preferences && Object.keys(user.preferences).length ? user.preferences : loadPreferences();
  return (
    <div>
      <div className="row between" style={{ padding: '6px 0 12px' }}>
        <span className="row bold" style={{ gap: 8 }}><Type size={18} aria-hidden /> Text size</span>
        <Segmented label="Text size" options={FONT_SCALES} value={p.fontScale ?? 1} onChange={(v) => updatePreferences({ fontScale: v })} />
      </div>
      <div className="row between" style={{ padding: '6px 0 12px', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <span className="bold">Theme</span>
        <Segmented
          label="Theme"
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Auto' }]}
          value={p.theme ?? 'system'}
          onChange={(v) => updatePreferences({ theme: v })}
        />
      </div>
      <Toggle label="High contrast" description="Stronger colours and borders" checked={!!p.highContrast} onChange={(v) => updatePreferences({ highContrast: v })} />
      <Toggle label="Readable font" description="Atkinson Hyperlegible, designed for low vision" checked={!!p.dyslexiaFont} onChange={(v) => updatePreferences({ dyslexiaFont: v })} />
      <Toggle label="Reduce motion" description="Turn off animations" checked={!!p.reducedMotion} onChange={(v) => updatePreferences({ reducedMotion: v })} />
    </div>
  );
}

export function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="popover" style={{ width: 340, padding: '14px 18px', zIndex: 40 }} role="dialog" aria-label="Accessibility options" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Accessibility</h2>
      <AccessibilitySettings />
    </div>
  );
}
