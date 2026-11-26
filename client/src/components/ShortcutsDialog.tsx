import { useI18n } from '../lib/i18n';
import { Modal } from './Modal';
import { Button } from './ui';

const GROUPS = {
  en: [
    { title: 'Everywhere', items: [
      { keys: ['Ctrl', 'K'], label: 'Search people, classes and pages' }, { keys: ['?'], label: 'Show this list' },
      { keys: ['Esc'], label: 'Close a dialog or menu' }, { keys: ['Tab'], label: 'Move to the next button or field' }] },
    { title: 'Attendance register', items: [
      { keys: ['P'], label: 'Mark the focused student present' }, { keys: ['L'], label: 'Mark late' },
      { keys: ['A'], label: 'Mark absent' }, { keys: ['E'], label: 'Mark excused' }, { keys: ['↑', '↓'], label: 'Move between students' }] },
    { title: 'Gradebook', items: [
      { keys: ['Enter'], label: 'Next student in the same column' }, { keys: ['↑', '↓'], label: 'Move up or down a column' }] },
  ],
  sw: [
    { title: 'Kila mahali', items: [
      { keys: ['Ctrl', 'K'], label: 'Tafuta watu, madarasa na kurasa' }, { keys: ['?'], label: 'Onyesha orodha hii' },
      { keys: ['Esc'], label: 'Funga dirisha au menyu' }, { keys: ['Tab'], label: 'Nenda kwenye kitufe au sehemu inayofuata' }] },
    { title: 'Daftari la mahudhurio', items: [
      { keys: ['P'], label: 'Mweke mwanafunzi kuwa yupo' }, { keys: ['L'], label: 'Amechelewa' },
      { keys: ['A'], label: 'Hayupo' }, { keys: ['E'], label: 'Ana ruhusa' }, { keys: ['↑', '↓'], label: 'Hamia mwanafunzi mwingine' }] },
    { title: 'Daftari la alama', items: [
      { keys: ['Enter'], label: 'Mwanafunzi anayefuata kwenye safu hiyo' }, { keys: ['↑', '↓'], label: 'Panda au shuka kwenye safu' }] },
  ],
};

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('keyboardShortcuts')}
      description={lang === 'sw' ? 'Fanya kazi haraka bila kipanya. Kwenye Mac tumia ⌘ badala ya Ctrl.' : 'Work faster without reaching for the mouse. On a Mac, use ⌘ instead of Ctrl.'}
      footer={<Button variant="primary" onClick={onClose} data-autofocus>{lang === 'sw' ? 'Sawa' : 'Got it'}</Button>}
    >
      <div className="stack">
        {GROUPS[lang].map((g) => (
          <section key={g.title}>
            <h3 className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{g.title}</h3>
            <div className="shortcuts">
              {g.items.map((i) => (
                <div className="shortcut" key={i.label}>
                  <span>{i.label}</span>
                  <span className="keys">{i.keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
