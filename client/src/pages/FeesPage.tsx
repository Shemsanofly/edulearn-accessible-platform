import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, CheckCircle2, ChevronDown, ChevronUp, CreditCard, FilePlus2, Info, Landmark, Receipt, Smartphone,
  Trash2, Wallet, X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ClassListItem, FeeSummary, Invoice, InvoiceDetail, InvoiceInput, Paginated, PaymentInput, PaymentMethod, StudentListItem,
} from '../../../shared/types';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, PersonCell,
  ProgressBar, SearchInput, Segmented, Select, StatCard, Textarea, useDebounced,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { daysUntil, formatDate, fullName, INVOICE_META, money, percent, plural, relativeTime, todayIso } from '../lib/format';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'other', label: 'Other' },
];
const methodLabel = (m: PaymentMethod) => METHODS.find((x) => x.value === m)?.label ?? m;

export function FeesPage() {
  const user = useUser();
  return user.role === 'admin' ? <AdminFees /> : <FamilyFees />;
}

// ================================================================ Admin
type StatusFilter = 'all' | 'open' | 'overdue' | 'paid';

function AdminFees() {
  const [params, setParams] = useSearchParams();
  const status = (['all', 'open', 'overdue', 'paid'].includes(params.get('status') ?? '') ? params.get('status') : 'all') as StatusFilter;
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const creating = params.get('new') === '1';
  const debounced = useDebounced(search);

  useEffect(() => setPage(1), [status, classId, debounced]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const summary = useQuery({ queryKey: ['fees', 'summary'], queryFn: () => api.get<FeeSummary>('/fees/summary') });
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<ClassListItem[]>('/classes') });
  const list = useQuery({
    queryKey: ['fees', 'invoices', { status, classId, search: debounced, page }],
    queryFn: () =>
      api.get<Paginated<Invoice>>('/fees/invoices', {
        status: status === 'all' ? undefined : status,
        classId: classId || undefined,
        search: debounced,
        page,
        pageSize: 15,
      }),
    placeholderData: (prev) => prev,
  });

  const s = summary.data;
  const collectedRate = s && s.billed ? (s.collected / s.billed) * 100 : null;

  return (
    <>
      <PageHeader
        title="Fees & payments"
        description="Bill students, record payments and follow up on overdue balances."
        actions={<Button variant="primary" icon={<FilePlus2 size={17} />} onClick={() => setParam('new', '1')}>Create invoices</Button>}
      />

      <div className="grid grid-4 mb-3">
        <StatCard icon={<Receipt size={22} />} label="Billed" value={s ? money(s.billed) : '…'} hint="All invoices" />
        <StatCard icon={<CheckCircle2 size={22} />} label="Collected" value={s ? money(s.collected) : '…'} tone="success" hint={collectedRate !== null ? `${percent(collectedRate)} of billed` : undefined} />
        <StatCard icon={<Wallet size={22} />} label="Outstanding" value={s ? money(s.outstanding) : '…'} tone="warning" />
        <StatCard icon={<AlertTriangle size={22} />} label="Overdue" value={s ? money(s.overdueAmount) : '…'} tone="danger" hint={s ? plural(s.overdueCount, 'invoice') : undefined} />
      </div>

      <Card>
        <div className="toolbar">
          <Segmented<StatusFilter>
            label="Filter by status"
            value={status}
            onChange={(v) => setParam('status', v === 'all' ? null : v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Unpaid' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
          <Select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder="Student, admission no. or invoice" label="Search invoices" />
        </div>

        {list.isLoading ? (
          <div className="card-body"><CardSkeleton rows={8} /></div>
        ) : list.error ? (
          <div className="card-body"><ErrorState error={list.error} onRetry={list.refetch} /></div>
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={<Receipt size={26} />}
            title={debounced || classId || status !== 'all' ? 'No invoices match these filters' : 'No invoices yet'}
            action={!debounced && !classId && status === 'all' ? <Button variant="primary" icon={<FilePlus2 size={17} />} onClick={() => setParam('new', '1')}>Create invoices</Button> : undefined}
          />
        ) : (
          <div className="table-wrap" style={{ opacity: list.isFetching ? 0.7 : 1, transition: 'opacity 150ms' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Invoice</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col" className="num">Balance</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((inv) => (
                  <tr
                    key={inv.id}
                    className="clickable"
                    tabIndex={0}
                    aria-label={`Open invoice ${inv.title} for ${inv.studentName}`}
                    onClick={() => setOpenId(inv.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpenId(inv.id))}
                  >
                    <td><PersonCell name={inv.studentName} sub={`${inv.admissionNo}${inv.className ? ` · ${inv.className}` : ''}`} /></td>
                    <td className="bold">{inv.title}</td>
                    <td>
                      <div>{formatDate(inv.dueDate)}</div>
                      {inv.status !== 'paid' && <div className="tiny muted">{relativeTime(inv.dueDate)}</div>}
                    </td>
                    <td className="num">{money(inv.amount)}</td>
                    <td className="num bold">{inv.balance > 0 ? money(inv.balance) : <span className="text-success">—</span>}</td>
                    <td><Badge tone={INVOICE_META[inv.status].tone} dot>{INVOICE_META[inv.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > 0 && <Pagination page={page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
      </Card>

      {openId !== null && <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(null)} />}
      {creating && <CreateInvoicesModal classes={classes.data ?? []} onClose={() => setParam('new', null)} />}
    </>
  );
}

// ---------------------------------------------------------------- Invoice drawer
function InvoiceDrawer({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['fees', 'invoice', invoiceId], queryFn: () => api.get<InvoiceDetail>(`/fees/invoices/${invoiceId}`) });
  const inv = q.data;

  const [form, setForm] = useState({ amount: '', method: 'cash' as PaymentMethod, reference: '', paidOn: todayIso() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (inv) setForm((f) => ({ ...f, amount: inv.balance > 0 ? String(inv.balance) : '' }));
  }, [inv?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (data?: InvoiceDetail) => {
    if (data) qc.setQueryData(['fees', 'invoice', invoiceId], data);
    qc.invalidateQueries({ queryKey: ['fees', 'invoices'] });
    qc.invalidateQueries({ queryKey: ['fees', 'summary'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const pay = useMutation({
    mutationFn: (body: PaymentInput) => api.post<InvoiceDetail>(`/fees/invoices/${invoiceId}/payments`, body),
    onSuccess: (data, body) => {
      refresh(data);
      setForm((f) => ({ ...f, reference: '' }));
      toast.success(`Payment of ${money(body.amount)} recorded`, data.balance > 0 ? `${money(data.balance)} still to pay.` : 'This invoice is now fully paid.');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error(err);
    },
  });

  const removePayment = useMutation({
    mutationFn: (id: number) => api.del<InvoiceDetail>(`/fees/payments/${id}`),
    onSuccess: (data) => {
      refresh(data);
      toast.success('Payment removed');
    },
    onError: (err) => toast.error(err),
  });

  const removeInvoice = useMutation({
    mutationFn: () => api.del(`/fees/invoices/${invoiceId}`),
    onSuccess: () => {
      refresh();
      toast.success('Invoice deleted');
      onClose();
    },
    onError: (err) => toast.error(err),
  });

  const submit = () => {
    if (!inv) return;
    const amount = Number(form.amount);
    const errs: Record<string, string> = {};
    if (!form.amount || Number.isNaN(amount) || amount <= 0) errs.amount = 'Enter an amount above 0';
    else if (amount > inv.balance) errs.amount = `The balance is ${money(inv.balance)}`;
    if (!form.paidOn) errs.paidOn = 'Choose the payment date';
    else if (form.paidOn > todayIso()) errs.paidOn = 'Can’t be in the future';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    pay.mutate({ amount, method: form.method, reference: form.reference.trim() || null, paidOn: form.paidOn });
  };

  const paidPct = inv ? (inv.amountPaid / inv.amount) * 100 : 0;

  return (
    <Modal
      open
      variant="drawer"
      onClose={onClose}
      title={inv ? inv.title : 'Invoice'}
      description={inv ? `${inv.studentName} · ${inv.admissionNo}${inv.className ? ` · ${inv.className}` : ''}` : undefined}
      onSubmit={inv && inv.balance > 0 ? submit : undefined}
      footer={
        inv && (
          <>
            {inv.payments.length === 0 && (
              <Button
                variant="ghost"
                style={{ marginRight: 'auto', color: 'var(--danger)' }}
                icon={<Trash2 size={16} />}
                loading={removeInvoice.isPending}
                onClick={async () => {
                  if (await confirm({ title: 'Delete this invoice?', message: `${inv.title} for ${inv.studentName} (${money(inv.amount)}) will be removed.`, confirmLabel: 'Delete invoice', danger: true })) removeInvoice.mutate();
                }}
              >
                Delete invoice
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
            {inv.balance > 0 && <Button type="submit" variant="primary" icon={<Banknote size={17} />} loading={pay.isPending}>Record payment</Button>}
          </>
        )
      }
    >
      {q.isLoading ? (
        <CardSkeleton rows={6} />
      ) : q.error || !inv ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <div className="stack" style={{ gap: 24 }}>
          <div className="stack-sm">
            <div className="row between">
              <Badge tone={INVOICE_META[inv.status].tone} dot>{INVOICE_META[inv.status].label}</Badge>
              <span className="small muted">Due {formatDate(inv.dueDate)}</span>
            </div>
            <div className="row between mt-1">
              <span className="muted small">Paid {money(inv.amountPaid)} of {money(inv.amount)}</span>
              <strong className="num">{percent(paidPct)}</strong>
            </div>
            <ProgressBar value={paidPct} tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'primary'} label="Amount paid" />
            <dl className="kv mt-1">
              <dt>Amount</dt><dd className="num">{money(inv.amount)}</dd>
              <dt>Balance</dt><dd className={`num bold ${inv.balance > 0 ? 'text-danger' : 'text-success'}`}>{money(inv.balance)}</dd>
              {inv.notes && (<><dt>Notes</dt><dd>{inv.notes}</dd></>)}
            </dl>
          </div>

          <div>
            <h3 className="mb-2">Payments</h3>
            {inv.payments.length === 0 ? (
              <p className="muted small">No payments recorded yet.</p>
            ) : (
              <ul className="list card">
                {inv.payments.map((p) => (
                  <li key={p.id} className="list-item">
                    <div className="grow">
                      <div className="bold num">{money(p.amount)}</div>
                      <div className="meta">{methodLabel(p.method)} · {formatDate(p.paidOn)}{p.reference && ` · Ref ${p.reference}`}{p.recordedByName && ` · by ${p.recordedByName}`}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Remove payment of ${money(p.amount)} on ${formatDate(p.paidOn)}`}
                      icon={<Trash2 size={15} />}
                      onClick={async () => {
                        if (await confirm({ title: 'Remove this payment?', message: `${money(p.amount)} paid on ${formatDate(p.paidOn)} will be removed and the balance increased.`, confirmLabel: 'Remove payment', danger: true })) removePayment.mutate(p.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {inv.balance > 0 && (
            <div>
              <h3 className="mb-2">Record a payment</h3>
              <div className="form-grid">
                <Field label="Amount" required error={errors.amount} hint={`Balance: ${money(inv.balance)}`}>
                  <Input type="number" min={0.01} step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
                <Field label="Method" required error={errors.method}>
                  <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </Field>
                <Field label="Date paid" required error={errors.paidOn}>
                  <Input type="date" max={todayIso()} value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} />
                </Field>
                <Field label="Reference" error={errors.reference} hint="Receipt or transaction no.">
                  <Input value={form.reference} maxLength={80} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Create invoices
function CreateInvoicesModal({ classes, onClose }: { classes: ClassListItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'class' | 'students'>('class');
  const [classId, setClassId] = useState('');
  const [picked, setPicked] = useState<StudentListItem[]>([]);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [form, setForm] = useState({ title: '', amount: '', dueDate: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const results = useQuery({
    queryKey: ['students', 'picker', debounced],
    queryFn: () => api.get<Paginated<StudentListItem>>('/students', { search: debounced, pageSize: 8, status: 'active' }),
    enabled: mode === 'students' && debounced.trim().length >= 2,
  });

  const selectedClass = classes.find((c) => String(c.id) === classId);
  const recipients = mode === 'class' ? selectedClass?.studentCount ?? 0 : picked.length;

  const create = useMutation({
    mutationFn: (body: InvoiceInput) => api.post<{ created: number }>('/fees/invoices', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['fees'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Created ${plural(res.created, 'invoice')}`, `${form.title} · ${money(Number(form.amount))} each`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error(err);
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (mode === 'class' && !classId) errs.classId = 'Choose a class';
    if (mode === 'students' && picked.length === 0) errs.students = 'Add at least one student';
    if (!form.title.trim()) errs.title = 'What is this invoice for?';
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) errs.amount = 'Enter an amount above 0';
    if (!form.dueDate) errs.dueDate = 'Choose a due date';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate({
      ...(mode === 'class' ? { classId: Number(classId) } : { studentIds: picked.map((p) => p.id) }),
      title: form.title.trim(),
      amount,
      dueDate: form.dueDate,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <Modal
      open
      variant="drawer"
      onClose={onClose}
      title="Create invoices"
      description="Bill a whole class at once, or pick individual students."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={<FilePlus2 size={17} />} loading={create.isPending}>
            {recipients > 0 ? `Create ${plural(recipients, 'invoice')}` : 'Create invoices'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>
          <span className="field-label" id="bill-who">Who should be billed?</span>
          <div className="mt-1">
            <Segmented label="Who should be billed" value={mode} onChange={setMode} options={[{ value: 'class', label: 'A whole class' }, { value: 'students', label: 'Chosen students' }]} />
          </div>
        </div>

        {mode === 'class' ? (
          <Field label="Class" required error={errors.classId} hint={selectedClass ? `${plural(selectedClass.studentCount, 'student')} will each get an invoice` : undefined}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Choose a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.studentCount})</option>)}
            </Select>
          </Field>
        ) : (
          <div className="field">
            <span className="field-label">Students <span className="req" aria-hidden>*</span></span>
            <SearchInput value={search} onChange={setSearch} placeholder="Type a name or admission number" label="Find students" />
            {errors.students && <span className="field-error"><AlertTriangle size={14} aria-hidden /> {errors.students}</span>}
            {picked.length > 0 && (
              <div className="row row-wrap" style={{ gap: 6 }} aria-label="Selected students">
                {picked.map((p) => (
                  <span key={p.id} className="chip">
                    {fullName(p)}
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ width: 22, height: 22 }} aria-label={`Remove ${fullName(p)}`} onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {debounced.trim().length >= 2 && (
              <div className="card" style={{ maxHeight: 240, overflowY: 'auto' }}>
                {results.isLoading ? (
                  <div className="card-body small muted">Searching…</div>
                ) : !results.data?.items.length ? (
                  <div className="card-body small muted">No students match “{debounced}”.</div>
                ) : (
                  <ul className="list">
                    {results.data.items.map((s) => {
                      const on = picked.some((p) => p.id === s.id);
                      return (
                        <li key={s.id} className="list-item" style={{ padding: '8px 14px' }}>
                          <label className="checkbox w-full">
                            <input type="checkbox" checked={on} onChange={() => setPicked((x) => (on ? x.filter((y) => y.id !== s.id) : [...x, s]))} />
                            <span className="grow">
                              <span className="bold">{fullName(s)}</span>
                              <span className="small muted"> · {s.admissionNo}{s.className ? ` · ${s.className}` : ''}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="form-grid">
          <Field label="Invoice title" required error={errors.title} className="span-2">
            <Input value={form.title} maxLength={120} placeholder="e.g. Term 2 tuition" onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Amount per student" required error={errors.amount}>
            <Input type="number" min={0.01} step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Due date" required error={errors.dueDate}>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label="Notes" hint="Optional — visible to families" error={errors.notes} className="span-2">
            <Textarea value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ minHeight: 80 }} />
          </Field>
        </div>
        {recipients > 0 && form.amount && Number(form.amount) > 0 && (
          <Alert tone="info" icon={<Info size={20} />}>
            Total billed: <strong>{money(recipients * Number(form.amount))}</strong> across {plural(recipients, 'student')}.
          </Alert>
        )}
      </div>
    </Modal>
  );
}

// ================================================================ Student / parent
function FamilyFees() {
  const user = useUser();
  const { school } = useAuth();
  const q = useQuery({
    queryKey: ['fees', 'invoices', 'family'],
    queryFn: () => api.get<Paginated<Invoice>>('/fees/invoices', { pageSize: 100 }),
  });

  const groups = useMemo(() => {
    const map = new Map<number, { name: string; className: string | null; items: Invoice[] }>();
    for (const inv of q.data?.items ?? []) {
      if (!map.has(inv.studentId)) map.set(inv.studentId, { name: inv.studentName, className: inv.className, items: [] });
      map.get(inv.studentId)!.items.push(inv);
    }
    return [...map.entries()];
  }, [q.data]);

  const items = q.data?.items ?? [];
  const balance = items.reduce((s, i) => s + i.balance, 0);
  const overdue = items.filter((i) => i.status === 'overdue');
  const nextDue = items.filter((i) => i.balance > 0 && daysUntil(i.dueDate) >= 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <>
      <PageHeader
        title={user.role === 'parent' ? 'Fees & payments' : 'My fees'}
        description={user.role === 'parent' ? 'School invoices for your children and what you’ve paid so far.' : 'Your school invoices and payments.'}
      />
      {q.isLoading ? (
        <CardSkeleton rows={6} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <>
          <div className="grid grid-3 mb-3">
            <StatCard icon={<Wallet size={22} />} label="Total balance" value={money(balance)} tone={balance > 0 ? 'warning' : 'success'} hint={balance > 0 ? 'Outstanding' : 'Everything is paid — thank you!'} />
            <StatCard icon={<AlertTriangle size={22} />} label="Overdue" value={money(overdue.reduce((s, i) => s + i.balance, 0))} tone={overdue.length ? 'danger' : 'success'} hint={overdue.length ? plural(overdue.length, 'invoice') : 'Nothing overdue'} />
            <StatCard icon={<Receipt size={22} />} label="Next due" value={nextDue ? money(nextDue.balance) : '—'} tone="info" hint={nextDue ? `${nextDue.title} · ${formatDate(nextDue.dueDate)}` : 'No upcoming payments'} />
          </div>

          {overdue.length > 0 && (
            <div className="mb-3">
              <Alert tone="danger" icon={<AlertTriangle size={20} />} title={`${plural(overdue.length, 'invoice is', 'invoices are')} past the due date`}>
                If you’re having trouble paying, please contact the school office — we’re happy to agree a payment plan.
              </Alert>
            </div>
          )}

          <div className="grid grid-main">
            <div className="stack" style={{ gap: 20 }}>
              {groups.length === 0 ? (
                <Card><EmptyState icon={<Receipt size={26} />} title="No invoices yet">When the school bills you, invoices will appear here.</EmptyState></Card>
              ) : (
                groups.map(([studentId, g]) => (
                  <Card key={studentId}>
                    <CardHeader
                      title={user.role === 'parent' ? g.name : 'Invoices'}
                      subtitle={user.role === 'parent' ? g.className ?? undefined : undefined}
                      action={<span className="small muted">Balance <strong className="num" style={{ color: 'var(--text)' }}>{money(g.items.reduce((s, i) => s + i.balance, 0))}</strong></span>}
                    />
                    <ul className="list">
                      {g.items.map((inv) => <FamilyInvoice key={inv.id} inv={inv} />)}
                    </ul>
                  </Card>
                ))
              )}
            </div>
            <Card>
              <CardHeader title="How to pay" />
              <div className="card-body stack">
                <p className="small muted">Please quote the student’s admission number as your payment reference so we can match it quickly.</p>
                <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Landmark size={20} className="subtle" aria-hidden />
                  <div><div className="bold">Bank transfer</div><div className="small muted">Use the school account details on your fee letter.</div></div>
                </div>
                <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Smartphone size={20} className="subtle" aria-hidden />
                  <div><div className="bold">Mobile money</div><div className="small muted">Pay to the school’s merchant number and keep the SMS receipt.</div></div>
                </div>
                <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <CreditCard size={20} className="subtle" aria-hidden />
                  <div><div className="bold">Card or cash</div><div className="small muted">At the {school.name} office, weekdays 8:00–15:00.</div></div>
                </div>
                <p className="small muted">Payments usually show here within one working day of being received.</p>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function FamilyInvoice({ inv }: { inv: Invoice }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['fees', 'invoice', inv.id],
    queryFn: () => api.get<InvoiceDetail>(`/fees/invoices/${inv.id}`),
    enabled: open,
  });
  const pct = (inv.amountPaid / inv.amount) * 100;
  const panelId = `invoice-${inv.id}-payments`;
  return (
    <li style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="list-item" style={{ borderBottom: 0, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="grow" style={{ minWidth: 200 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="title">{inv.title}</span>
            <Badge tone={INVOICE_META[inv.status].tone} dot>{INVOICE_META[inv.status].label}</Badge>
          </div>
          <div className="meta">Due {formatDate(inv.dueDate)}{inv.status !== 'paid' && ` (${relativeTime(inv.dueDate)})`}</div>
          {inv.notes && <div className="small muted mt-1">{inv.notes}</div>}
          <div className="mt-1" style={{ maxWidth: 360 }}>
            <ProgressBar value={pct} tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'primary'} label={`${inv.title} paid`} />
            <div className="tiny muted mt-1">{money(inv.amountPaid)} of {money(inv.amount)} paid</div>
          </div>
        </div>
        <div className="text-right">
          <div className="tiny muted">Balance</div>
          <div className="bold num" style={{ fontSize: '1.1rem' }}>{money(inv.balance)}</div>
          <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={panelId} icon={open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} onClick={() => setOpen(!open)}>
            Payment history
          </Button>
        </div>
      </div>
      {open && (
        <div id={panelId} style={{ padding: '0 20px 14px' }}>
          {detail.isLoading ? (
            <span className="small muted">Loading…</span>
          ) : detail.error ? (
            <span className="small text-danger">Couldn’t load payments.</span>
          ) : !detail.data?.payments.length ? (
            <span className="small muted">No payments yet.</span>
          ) : (
            <table className="table" style={{ background: 'var(--surface-2)', borderRadius: 8 }}>
              <thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col">Reference</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>
                {detail.data.payments.map((p) => (
                  <tr key={p.id}><td>{formatDate(p.paidOn)}</td><td>{methodLabel(p.method)}</td><td className="mono">{p.reference ?? '—'}</td><td className="num bold">{money(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}
