import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, EyeOff, Inbox, RefreshCw, Search } from 'lucide-react';
import {
  cloneElement, forwardRef, isValidElement, useEffect, useId, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { colorFor, initials, type Tone } from '../lib/format';
import { useI18n } from '../lib/i18n';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ---------------------------------------------------------------- Button
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, block, iconOnly, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, iconOnly && 'btn-icon', block && 'btn-block', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" style={{ width: 16, height: 16 }} aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ to, variant = 'secondary', size = 'md', icon, children }: { to: string; variant?: ButtonProps['variant']; size?: ButtonProps['size']; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link to={to} className={cx('btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`)}>
      {icon}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- Card
export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; 'aria-labelledby'?: string }) {
  return <As className={cx('card', className)} {...rest}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="card-header">
      <div>
        <h2 id={id}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Badge, Avatar
export function Badge({ tone = 'neutral', dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return <span className={cx('badge', tone !== 'neutral' && `tone-${tone}`, dot && 'badge-dot')} title={title}>{children}</span>;
}

/** A person's photo, or their initials on a colour when there's no photo (or it fails to load). */
export function Avatar({ name, size = 'md', color, photoUrl }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; color?: string; photoUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photoUrl && !failed;
  return (
    <span className={cx('avatar', size !== 'md' && `avatar-${size}`, showPhoto && 'has-photo')} style={{ background: color ?? colorFor(name) }} aria-hidden>
      {showPhoto ? <img src={photoUrl!} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

export function PersonCell({ name, sub, to, color, photoUrl }: { name: string; sub?: ReactNode; to?: string; color?: string; photoUrl?: string | null }) {
  const body = (
    <div className="cell-person">
      <Avatar name={name} color={color} photoUrl={photoUrl} />
      <div className="truncate">
        <div className="name truncate">{name}</div>
        {sub && <div className="sub truncate">{sub}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} style={{ color: 'inherit' }}>{body}</Link> : body;
}

// ---------------------------------------------------------------- Stats & progress
export function StatCard({ icon, label, value, hint, tone = 'primary', to }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; to?: string }) {
  const body = (
    <div className={cx('stat', `tone-${tone}`)}>
      <div className="stat-icon" aria-hidden>{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className={cx('stat-value', typeof value === 'string' && value.length > 11 && 'long')}>{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="card stat-link">{body}</Link> : <div className="card">{body}</div>;
}

export function ProgressBar({ value, tone = 'primary', label }: { value: number | null; tone?: Tone; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cx('progress', `tone-${tone}`)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- Page states
export function PageHeader({ title, description, actions, breadcrumb }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {breadcrumb && <nav className="breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function PageLoading() {
  return (
    <div className="page-loading">
      <Spinner label="Loading page" />
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden />;
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card card-body stack" aria-busy="true" aria-label="Loading">
      <Skeleton height={20} width="40%" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={14} width={`${90 - i * 12}%`} />)}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon ?? <Inbox size={26} />}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card">
      <EmptyState
        icon={<AlertCircle size={26} />}
        title={t('couldNotLoad')}
        action={onRetry && <Button icon={<RefreshCw size={16} />} onClick={onRetry}>{t('tryAgain')}</Button>}
      >
        {error instanceof Error ? error.message : 'Something went wrong.'}
      </EmptyState>
    </div>
  );
}

export function Alert({ tone = 'info', icon, title, children }: { tone?: Tone; icon?: ReactNode; title?: string; children?: ReactNode }) {
  return (
    <div className={cx('alert', `tone-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      {icon ?? <AlertCircle size={20} />}
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Tabs & segmented
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          className="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.id === value);
            if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length]!.id);
            if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length]!.id);
          }}
        >
          {t.label}
          {t.count !== undefined && <Badge>{t.count}</Badge>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Form fields
export function Field({ label, hint, error, required, children, className }: { label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactElement<Record<string, unknown>>; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        required,
      })
    : children;
  return (
    <div className={cx('field', className)}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden>*</span>}
      </label>
      {control}
      {hint && !error && <span className="field-hint" id={hintId}>{hint}</span>}
      {error && (
        <span className="field-error" id={errorId}>
          <AlertCircle size={14} aria-hidden /> {error}
        </span>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx('input', className)} {...p} />;
});
/**
 * Password field with an accessible show/hide toggle. Takes the same props as Input, so it works inside
 * <Field> (which passes id and aria attributes through to the real input).
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { showLabel?: string; hideLabel?: string }>(
  function PasswordInput({ showLabel = 'Show password', hideLabel = 'Hide password', className, ...p }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="password-wrap">
        <input ref={ref} type={visible ? 'text' : 'password'} className={cx('input', className)} autoCapitalize="none" spellCheck={false} {...p} />
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon toggle-visibility"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          aria-controls={p.id}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
        </button>
      </div>
    );
  },
);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cx('select', className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx('textarea', className)} {...p} />;
});

export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <div className="input-icon">
      <Search size={17} aria-hidden />
      <input className="input" type="search" value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="card-footer">
      <span className="small muted" aria-live="polite">
        {total === 0 ? t('noResults') : t('showing', { from, to, total })}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" iconOnly aria-label={t('previous')} disabled={page <= 1} onClick={() => onChange(page - 1)} icon={<ChevronLeft size={16} />} />
        <span className="small num">{t('page', { page, pages })}</span>
        <Button size="sm" iconOnly aria-label={t('next')} disabled={page >= pages} onClick={() => onChange(page + 1)} icon={<ChevronRight size={16} />} />
      </div>
    </div>
  );
}

/** Debounce a fast-changing value, e.g. a search box. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// ---------------------------------------------------------------- Sortable tables
export type SortDir = 'asc' | 'desc';
export interface SortState {
  sort: string | null;
  dir: SortDir;
  /** Click handler for a column: first click sorts ascending, second descending. */
  toggle: (field: string) => void;
  /** Query parameters to send to the API. */
  params: { sort?: string; dir?: SortDir };
}

/** Sorting kept in the URL (?sort=&dir=) so the back button and shared links keep the order. */
export function useSort(defaultSort: string | null = null, defaultDir: SortDir = 'asc'): SortState {
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort') ?? defaultSort;
  const dir: SortDir = params.get('dir') === 'desc' ? 'desc' : params.get('dir') === 'asc' ? 'asc' : defaultDir;
  const toggle = (field: string) => {
    const next = new URLSearchParams(params);
    next.set('sort', field);
    next.set('dir', sort === field && dir === 'asc' ? 'desc' : 'asc');
    next.delete('page');
    setParams(next, { replace: true });
  };
  return { sort, dir, toggle, params: sort ? { sort, dir } : {} };
}

/** A table header cell that sorts its column. Announces the current order to screen readers. */
export function SortHeader({ label, field, state, numeric, className }: { label: ReactNode; field: string; state: SortState; numeric?: boolean; className?: string }) {
  const active = state.sort === field;
  const Icon = !active ? ArrowUpDown : state.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cx(numeric && 'num', className)} aria-sort={active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" data-active={active || undefined} onClick={() => state.toggle(field)}>
        {label}
        <Icon size={13} aria-hidden />
      </button>
    </th>
  );
}

/** Sort an array already in memory (for lists the API returns in full). */
export function sortRows<T>(rows: T[], state: SortState, getters: Record<string, (row: T) => string | number | null | undefined>): T[] {
  const get = state.sort ? getters[state.sort] : undefined;
  if (!get) return rows;
  const factor = state.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })) * factor;
  });
}

/** Close a popover on outside click or Escape, returning focus to its trigger. */
export function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>, triggerRef?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef?.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, ref, triggerRef]);
}
