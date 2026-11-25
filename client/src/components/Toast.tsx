import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';
import { Button } from './ui';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: Kind;
  title: string;
  detail?: ReactNode;
  sticky?: boolean;
}

interface ToastApi {
  success: (title: string, detail?: ReactNode, opts?: { sticky?: boolean }) => void;
  error: (errOrTitle: unknown, detail?: ReactNode) => void;
  info: (title: string, detail?: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: TriangleAlert };
const TONES = { success: 'success', error: 'danger', info: 'info', warning: 'warning' };

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = nextId++;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      if (!t.sticky) setTimeout(() => dismiss(id), t.kind === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );
  const api: ToastApi = {
    success: (title, detail, opts) => push({ kind: 'success', title, detail, sticky: opts?.sticky }),
    error: (err, detail) => push({ kind: 'error', title: typeof err === 'string' ? err : errorMessage(err), detail }),
    info: (title, detail) => push({ kind: 'info', title, detail }),
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div key={t.id} className={`toast tone-${TONES[t.kind]}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <Icon size={20} aria-hidden />
              <div className="grow">
                <div className="bold">{t.title}</div>
                {t.detail && <div className="detail">{t.detail}</div>}
              </div>
              <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss notification" onClick={() => dismiss(t.id)} icon={<X size={16} />} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
