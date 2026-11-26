import { Modal } from './Modal';
import { Button } from './ui';

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: 'Everywhere',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Search people, classes and pages' },
      { keys: ['?'], label: 'Show this list' },
      { keys: ['Esc'], label: 'Close a dialog or menu' },
      { keys: ['Tab'], label: 'Move to the next button or field' },
    ],
  },
  {
    title: 'Attendance register',
    items: [
      { keys: ['P'], label: 'Mark the focused student present' },
      { keys: ['L'], label: 'Mark late' },
      { keys: ['A'], label: 'Mark absent' },
      { keys: ['E'], label: 'Mark excused' },
      { keys: ['↑', '↓'], label: 'Move between students' },
    ],
  },
  {
    title: 'Gradebook',
    items: [
      { keys: ['Enter'], label: 'Next student in the same column' },
      { keys: ['↑', '↓'], label: 'Move up or down a column' },
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Work faster without reaching for the mouse. On a Mac, use ⌘ instead of Ctrl."
      footer={<Button variant="primary" onClick={onClose} data-autofocus>Got it</Button>}
    >
      <div className="stack">
        {GROUPS.map((g) => (
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
