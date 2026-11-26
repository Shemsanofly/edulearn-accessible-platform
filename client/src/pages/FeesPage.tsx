import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, BellRing, CheckCircle2, ChevronDown, ChevronUp, FilePlus2, FileText, Info, Landmark, Layers, Pencil,
  Play, Plus, Receipt, Smartphone, Trash2, Wallet, X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  ClassListItem, FeeStructure, FeeStructureInput, FeeSummary, Invoice, InvoiceDetail, InvoiceInput, Paginated, PaymentInput,
  PaymentMethod, StudentListItem, Term,
} from '../../../shared/types';
import { ChildSwitcher, useChildren } from '../components/ChildSwitcher';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  Alert, Badge, Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, PersonCell,
  ProgressBar, SearchInput, Segmented, Select, SortHeader, StatCard, Tabs, Textarea, Toggle, useDebounced, useSort,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { daysUntil, formatDate, fullName, INVOICE_META, levelName, money, percent, relativeTime, todayIso } from '../lib/format';
import { useI18n, useT } from '../lib/i18n';

const M = {
  en: {
    title: 'Fees & payments', adminDesc: 'Bill students, record payments, issue receipts and follow up on overdue balances.',
    myFees: 'My fees', parentDesc: 'School invoices for your children and what you’ve paid so far.', studentDesc: 'Your school invoices and payments.',
    createInvoices: 'Create invoices', sendReminders: 'Send reminders', invoices: 'Invoices', structures: 'Fee structures',
    billed: 'Billed', allInvoices: 'All invoices', collected: 'Collected', ofBilled: '{pct} of billed', outstanding: 'Outstanding', overdue: 'Overdue',
    invoicesN: '{n} invoice(s)', filterStatus: 'Filter by status', open: 'Unpaid', allClasses: 'All classes', filterClass: 'Filter by class',
    searchPh: 'Student, admission no. or invoice', searchLabel: 'Search invoices', onlyStudent: 'Only {name}', oneStudent: 'One student only',
    showAll: 'Show all students', noMatch: 'No invoices match these filters', noInvoices: 'No invoices yet', student: 'Student', invoice: 'Invoice',
    due: 'Due', amount: 'Amount', balance: 'Balance', status: 'Status', openInvoice: 'Open invoice {title} for {name}',
    remindTitle: 'Send fee reminders?', remindMsg: 'Every family with an overdue invoice gets a reminder notification with the amount outstanding.',
    remindConfirm: 'Send reminders', remindDone: 'Reminders sent for {n} invoice(s)', remindNone: 'No overdue invoices — nobody needed a reminder.',
    // drawer
    dueOn: 'Due {date}', paidOf: 'Paid {paid} of {amount}', amountPaid: 'Amount paid', notes: 'Notes', payments: 'Payments',
    noPayments: 'No payments recorded yet.', recordedBy: 'by {name}', ref: 'Ref {ref}', receipt: 'Receipt', receiptNo: 'Receipt {no}',
    removePayment: 'Remove payment of {amount} on {date}', removePaymentTitle: 'Remove this payment?',
    removePaymentMsg: '{amount} paid on {date} will be removed and the balance increased. The receipt {no} will no longer be valid.',
    removePaymentConfirm: 'Remove payment', paymentRemoved: 'Payment removed', recordPayment: 'Record payment', recordAPayment: 'Record a payment',
    balanceHint: 'Balance: {amount}', method: 'Method', datePaid: 'Date paid', reference: 'Reference', referenceHint: 'M-Pesa / bank transaction no.',
    amountRequired: 'Enter an amount above 0', amountTooHigh: 'The balance is {amount}', dateRequired: 'Choose the payment date', noFuture: 'Can’t be in the future',
    paymentRecorded: 'Payment of {amount} recorded', stillToPay: '{amount} still to pay.', fullyPaid: 'This invoice is now fully paid.',
    viewReceipt: 'View receipt', deleteInvoice: 'Delete invoice', deleteInvoiceTitle: 'Delete this invoice?',
    deleteInvoiceMsg: '{title} for {name} ({amount}) will be removed.', invoiceDeleted: 'Invoice deleted',
    // create
    createDesc: 'Bill a whole class at once, or pick individual students.', whoBilled: 'Who should be billed?', wholeClass: 'A whole class',
    chosenStudents: 'Chosen students', class: 'Class', chooseClass: 'Choose a class…', classHint: '{n} student(s) will each get an invoice',
    students: 'Students', findStudents: 'Find students', findPh: 'Type a name or admission number', selected: 'Selected students',
    removeName: 'Remove {name}', searching: 'Searching…', noStudentMatch: 'No students match “{q}”.', invoiceTitle: 'Invoice title',
    titlePh: 'e.g. Uniform fee', amountEach: 'Amount per student', dueDate: 'Due date', notesHint: 'Optional — visible to families',
    totalBilled: 'Total billed: {amount} across {n} student(s).', createN: 'Create {n} invoice(s)', chooseClassErr: 'Choose a class',
    addStudentErr: 'Add at least one student', titleErr: 'What is this invoice for?', dueErr: 'Choose a due date', created: 'Created {n} invoice(s)',
    createdEach: '{title} · {amount} each',
    // structures
    structuresDesc: 'Standard fees such as tuition per level. Apply one to bill every matching student — students already billed are skipped.',
    newStructure: 'New fee structure', editStructure: 'Edit fee structure', noStructures: 'No fee structures yet',
    noStructuresHint: 'Create one for each fee you charge regularly, e.g. “Term 1 tuition · Form 1”.',
    allLevels: 'All levels', level: 'Level', term: 'Term', noTerm: 'No term', description: 'Description', active: 'Active',
    activeHint: 'Inactive structures can’t be applied', inactive: 'Inactive', invoicesIssued: '{n} invoice(s) issued', collectedAmt: '{amount} collected',
    apply: 'Apply', applyTitle: 'Bill students for {name}?',
    applyMsg: 'Every active student in {level} who hasn’t been billed for this yet will get an invoice of {amount}, due {date}. Families are notified.',
    applyConfirm: 'Create invoices', applied: '{n} invoice(s) created', appliedNone: 'Everyone in {level} has already been billed for this.',
    deleteStructure: 'Delete fee structure', deleteStructureTitle: 'Delete {name}?', deleteStructureMsg: 'This removes the fee structure. Existing invoices are not affected.',
    structureDeleted: 'Fee structure deleted', deleteBlocked: 'Invoices were issued from it — mark it inactive instead.',
    structureSaved: 'Fee structure saved', name: 'Name', namePh: 'e.g. Term 1 tuition · Form 1', nameErr: 'Give the fee a name',
    amountLocked: 'Invoices were already issued, so the amount can’t change.', edit: 'Edit {name}', applyLabel: 'Apply {name}',
    // family
    totalBalance: 'Total balance', allPaid: 'Everything is paid — thank you!', nothingOverdue: 'Nothing overdue', nextDue: 'Next due',
    noUpcoming: 'No upcoming payments', pastDue: '{n} invoice(s) past the due date',
    planHelp: 'If you’re having trouble paying, please contact the school office — we’re happy to agree a payment plan.',
    noInvoicesFamily: 'When the school bills you, invoices will appear here.', allChildren: 'All children',
    howToPay: 'How to pay', quoteRef: 'Quote the student’s admission number as your payment reference so the bursar can match it.',
    bank: 'Bank', bankHint: 'Pay into the school account shown on your fee letter and keep the bank slip.',
    mobile: 'Mobile money (M-Pesa, Tigo Pesa, Airtel Money, HaloPesa)', mobileHint: 'Pay to the school’s number on your fee letter and keep the SMS confirmation.',
    office: 'At the school office', officeHint: 'Cash payments at the {school} bursar’s office during school hours.',
    recordedNote: 'Payments are recorded by the bursar. Once recorded, you can download an official receipt here.',
    noOnline: 'Fees can’t be paid online in this app.', paidOfAmount: '{paid} of {amount} paid', paymentHistory: 'Payment history',
    couldNotLoadPayments: 'Couldn’t load payments.', noPaymentsYet: 'No payments yet.', date: 'Date', downloadReceipt: 'Download receipt',
  },
  sw: {
    title: 'Ada na malipo', adminDesc: 'Toa ankara, rekodi malipo, toa stakabadhi na fuatilia madeni yaliyopitwa na muda.',
    myFees: 'Ada zangu', parentDesc: 'Ankara za shule za watoto wako na ulicholipa hadi sasa.', studentDesc: 'Ankara na malipo yako ya shule.',
    createInvoices: 'Toa ankara', sendReminders: 'Tuma vikumbusho', invoices: 'Ankara', structures: 'Muundo wa ada',
    billed: 'Kiasi kilichotozwa', allInvoices: 'Ankara zote', collected: 'Kilichokusanywa', ofBilled: '{pct} ya kilichotozwa', outstanding: 'Salio linalodaiwa', overdue: 'Imepitwa na muda',
    invoicesN: 'Ankara {n}', filterStatus: 'Chuja kwa hali', open: 'Hazijalipwa', allClasses: 'Madarasa yote', filterClass: 'Chuja kwa darasa',
    searchPh: 'Mwanafunzi, namba ya usajili au ankara', searchLabel: 'Tafuta ankara', onlyStudent: '{name} pekee', oneStudent: 'Mwanafunzi mmoja tu',
    showAll: 'Onyesha wanafunzi wote', noMatch: 'Hakuna ankara zinazolingana na vichujio hivi', noInvoices: 'Bado hakuna ankara', student: 'Mwanafunzi', invoice: 'Ankara',
    due: 'Mwisho wa kulipa', amount: 'Kiasi', balance: 'Salio', status: 'Hali', openInvoice: 'Fungua ankara {title} ya {name}',
    remindTitle: 'Tuma vikumbusho vya ada?', remindMsg: 'Kila familia yenye ankara iliyopitwa na muda itapokea arifa ya kukumbushwa pamoja na kiasi kinachodaiwa.',
    remindConfirm: 'Tuma vikumbusho', remindDone: 'Vikumbusho vimetumwa kwa ankara {n}', remindNone: 'Hakuna ankara zilizopitwa na muda — hakuna aliyehitaji kukumbushwa.',
    dueOn: 'Mwisho {date}', paidOf: 'Imelipwa {paid} kati ya {amount}', amountPaid: 'Kiasi kilicholipwa', notes: 'Maelezo', payments: 'Malipo',
    noPayments: 'Bado hakuna malipo yaliyorekodiwa.', recordedBy: 'na {name}', ref: 'Kumb. {ref}', receipt: 'Stakabadhi', receiptNo: 'Stakabadhi {no}',
    removePayment: 'Ondoa malipo ya {amount} ya tarehe {date}', removePaymentTitle: 'Ondoa malipo haya?',
    removePaymentMsg: '{amount} yaliyolipwa tarehe {date} yataondolewa na salio litaongezeka. Stakabadhi {no} haitakuwa halali tena.',
    removePaymentConfirm: 'Ondoa malipo', paymentRemoved: 'Malipo yameondolewa', recordPayment: 'Rekodi malipo', recordAPayment: 'Rekodi malipo',
    balanceHint: 'Salio: {amount}', method: 'Njia ya malipo', datePaid: 'Tarehe ya malipo', reference: 'Kumbukumbu', referenceHint: 'Namba ya muamala ya M-Pesa / benki',
    amountRequired: 'Weka kiasi kikubwa kuliko 0', amountTooHigh: 'Salio ni {amount}', dateRequired: 'Chagua tarehe ya malipo', noFuture: 'Haiwezi kuwa tarehe ijayo',
    paymentRecorded: 'Malipo ya {amount} yamerekodiwa', stillToPay: 'Bado {amount} kulipwa.', fullyPaid: 'Ankara hii imelipwa yote.',
    viewReceipt: 'Tazama stakabadhi', deleteInvoice: 'Futa ankara', deleteInvoiceTitle: 'Futa ankara hii?',
    deleteInvoiceMsg: '{title} ya {name} ({amount}) itaondolewa.', invoiceDeleted: 'Ankara imefutwa',
    createDesc: 'Toza darasa zima kwa mara moja, au chagua wanafunzi mmoja mmoja.', whoBilled: 'Nani atozwe?', wholeClass: 'Darasa zima',
    chosenStudents: 'Wanafunzi waliochaguliwa', class: 'Darasa', chooseClass: 'Chagua darasa…', classHint: 'Wanafunzi {n} kila mmoja atapata ankara',
    students: 'Wanafunzi', findStudents: 'Tafuta wanafunzi', findPh: 'Andika jina au namba ya usajili', selected: 'Wanafunzi waliochaguliwa',
    removeName: 'Mwondoe {name}', searching: 'Inatafuta…', noStudentMatch: 'Hakuna mwanafunzi anayelingana na “{q}”.', invoiceTitle: 'Jina la ankara',
    titlePh: 'mf. Ada ya sare', amountEach: 'Kiasi kwa kila mwanafunzi', dueDate: 'Mwisho wa kulipa', notesHint: 'Si lazima — wazazi wataona',
    totalBilled: 'Jumla itakayotozwa: {amount} kwa wanafunzi {n}.', createN: 'Toa ankara {n}', chooseClassErr: 'Chagua darasa',
    addStudentErr: 'Ongeza angalau mwanafunzi mmoja', titleErr: 'Ankara hii ni ya nini?', dueErr: 'Chagua tarehe ya mwisho', created: 'Ankara {n} zimetolewa',
    createdEach: '{title} · {amount} kila mmoja',
    structuresDesc: 'Ada za kawaida kama karo kwa kila kidato. Tumia muundo kutoza kila mwanafunzi anayehusika — waliokwisha tozwa hurukwa.',
    newStructure: 'Muundo mpya wa ada', editStructure: 'Hariri muundo wa ada', noStructures: 'Bado hakuna muundo wa ada',
    noStructuresHint: 'Unda muundo kwa kila ada unayotoza mara kwa mara, mf. “Karo ya muhula wa 1 · Kidato cha 1”.',
    allLevels: 'Vidato vyote', level: 'Kidato / Darasa', term: 'Muhula', noTerm: 'Hakuna muhula', description: 'Maelezo', active: 'Inatumika',
    activeHint: 'Muundo usiotumika hauwezi kutozwa', inactive: 'Haitumiki', invoicesIssued: 'Ankara {n} zimetolewa', collectedAmt: '{amount} zimekusanywa',
    apply: 'Toza', applyTitle: 'Toza wanafunzi {name}?',
    applyMsg: 'Kila mwanafunzi hai wa {level} ambaye bado hajatozwa atapata ankara ya {amount}, mwisho wa kulipa {date}. Wazazi watapewa taarifa.',
    applyConfirm: 'Toa ankara', applied: 'Ankara {n} zimetolewa', appliedNone: 'Wote wa {level} wameshatozwa ada hii.',
    deleteStructure: 'Futa muundo wa ada', deleteStructureTitle: 'Futa {name}?', deleteStructureMsg: 'Muundo huu wa ada utaondolewa. Ankara zilizopo hazitaathirika.',
    structureDeleted: 'Muundo wa ada umefutwa', deleteBlocked: 'Ankara zimeshatolewa kutoka muundo huu — badala yake uweke kuwa hautumiki.',
    structureSaved: 'Muundo wa ada umehifadhiwa', name: 'Jina', namePh: 'mf. Karo ya muhula wa 1 · Kidato cha 1', nameErr: 'Ipe ada jina',
    amountLocked: 'Ankara zimeshatolewa, kwa hiyo kiasi hakiwezi kubadilishwa.', edit: 'Hariri {name}', applyLabel: 'Toza {name}',
    totalBalance: 'Jumla ya salio', allPaid: 'Kila kitu kimelipwa — asante!', nothingOverdue: 'Hakuna kilichopitwa na muda', nextDue: 'Malipo yajayo',
    noUpcoming: 'Hakuna malipo yanayokuja', pastDue: 'Ankara {n} zimepita tarehe ya mwisho',
    planHelp: 'Ikiwa una changamoto ya kulipa, tafadhali wasiliana na ofisi ya shule — tuko tayari kukubaliana mpango wa malipo.',
    noInvoicesFamily: 'Shule itakapokutoza, ankara zitaonekana hapa.', allChildren: 'Watoto wote',
    howToPay: 'Jinsi ya kulipa', quoteRef: 'Tumia namba ya usajili ya mwanafunzi kama kumbukumbu ya malipo ili mhasibu ayatambue.',
    bank: 'Benki', bankHint: 'Lipa kwenye akaunti ya shule iliyo kwenye barua ya ada na uhifadhi risiti ya benki.',
    mobile: 'Pesa kwa simu (M-Pesa, Tigo Pesa, Airtel Money, HaloPesa)', mobileHint: 'Lipa kwenye namba ya shule iliyo kwenye barua ya ada na uhifadhi ujumbe wa uthibitisho.',
    office: 'Ofisini shuleni', officeHint: 'Malipo ya taslimu katika ofisi ya mhasibu ya {school} wakati wa saa za shule.',
    recordedNote: 'Malipo hurekodiwa na mhasibu. Yakishakurekodiwa, unaweza kupakua stakabadhi rasmi hapa.',
    noOnline: 'Ada haziwezi kulipwa mtandaoni kupitia programu hii.', paidOfAmount: '{paid} kati ya {amount} zimelipwa', paymentHistory: 'Historia ya malipo',
    couldNotLoadPayments: 'Imeshindikana kupakia malipo.', noPaymentsYet: 'Bado hakuna malipo.', date: 'Tarehe', downloadReceipt: 'Pakua stakabadhi',
  },
};

const METHODS: PaymentMethod[] = ['cash', 'mobile_money', 'bank_transfer', 'card', 'other'];
const METHOD_LABEL: Record<'en' | 'sw', Record<PaymentMethod, string>> = {
  en: { cash: 'Cash', card: 'Card', bank_transfer: 'Bank transfer', mobile_money: 'Mobile money', other: 'Other' },
  sw: { cash: 'Taslimu', card: 'Kadi', bank_transfer: 'Benki', mobile_money: 'Pesa kwa simu', other: 'Nyingine' },
};

export function useMethodLabel() {
  const { lang } = useI18n();
  return (m: PaymentMethod) => METHOD_LABEL[lang][m] ?? m;
}

const fieldErrors = (err: unknown) => (err instanceof ApiError && err.details ? err.details : {});

export function FeesPage() {
  const user = useUser();
  return user.role === 'admin' ? <AdminFees /> : <FamilyFees />;
}

// ================================================================ Admin
type StatusFilter = 'all' | 'open' | 'overdue' | 'paid';
type AdminTab = 'invoices' | 'structures';

function AdminFees() {
  const t = useT(M);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: AdminTab = params.get('tab') === 'structures' ? 'structures' : 'invoices';
  const creating = params.get('new') === '1';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const summary = useQuery({ queryKey: ['fees', 'summary'], queryFn: () => api.get<FeeSummary>('/fees/summary') });
  const classes = useQuery({ queryKey: ['classes', 'all'], queryFn: () => api.get<ClassListItem[]>('/classes') });

  const remind = useMutation({
    mutationFn: () => api.post<{ reminded: number }>('/fees/reminders', {}),
    onSuccess: (res) => {
      if (res.reminded > 0) toast.success(t('remindDone', { n: res.reminded }));
      else toast.info(t('remindNone'));
    },
    onError: (err) => toast.error(err),
  });

  const s = summary.data;
  const collectedRate = s && s.billed ? (s.collected / s.billed) * 100 : null;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('adminDesc')}
        actions={
          <>
            <Button
              icon={<BellRing size={17} />}
              loading={remind.isPending}
              onClick={async () => {
                if (await confirm({ title: t('remindTitle'), message: t('remindMsg'), confirmLabel: t('remindConfirm') })) remind.mutate();
              }}
            >
              {t('sendReminders')}
            </Button>
            <Button variant="primary" icon={<FilePlus2 size={17} />} onClick={() => setParam('new', '1')}>{t('createInvoices')}</Button>
          </>
        }
      />

      <div className="grid grid-4 mb-3">
        <StatCard icon={<Receipt size={22} />} label={t('billed')} value={s ? money(s.billed) : '…'} hint={t('allInvoices')} />
        <StatCard icon={<CheckCircle2 size={22} />} label={t('collected')} value={s ? money(s.collected) : '…'} tone="success" hint={collectedRate !== null ? t('ofBilled', { pct: percent(collectedRate) }) : undefined} />
        <StatCard icon={<Wallet size={22} />} label={t('outstanding')} value={s ? money(s.outstanding) : '…'} tone="warning" />
        <StatCard icon={<AlertTriangle size={22} />} label={t('overdue')} value={s ? money(s.overdueAmount) : '…'} tone="danger" hint={s ? t('invoicesN', { n: s.overdueCount }) : undefined} />
      </div>

      <Tabs<AdminTab>
        label={t('title')}
        value={tab}
        onChange={(v) => setParam('tab', v === 'invoices' ? null : v)}
        tabs={[
          { id: 'invoices', label: <><Receipt size={16} aria-hidden /> {t('invoices')}</> },
          { id: 'structures', label: <><Layers size={16} aria-hidden /> {t('structures')}</> },
        ]}
      />
      <div role="tabpanel">
        {tab === 'invoices' ? <InvoicesTab classes={classes.data ?? []} onCreate={() => setParam('new', '1')} /> : <StructuresTab />}
      </div>

      {creating && (
        <CreateInvoicesModal
          classes={classes.data ?? []}
          onClose={() => {
            setParam('new', null);
            qc.invalidateQueries({ queryKey: ['fees'] });
          }}
        />
      )}
    </>
  );
}

function InvoicesTab({ classes, onCreate }: { classes: ClassListItem[]; onCreate: () => void }) {
  const t = useT(M);
  const { t: tc } = useI18n();
  const [params, setParams] = useSearchParams();
  const status = (['all', 'open', 'overdue', 'paid'].includes(params.get('status') ?? '') ? params.get('status') : 'all') as StatusFilter;
  const studentId = params.get('studentId');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const debounced = useDebounced(search);

  const sort = useSort('due', 'desc');
  useEffect(() => setPage(1), [status, classId, debounced, studentId, sort.sort, sort.dir]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const list = useQuery({
    queryKey: ['fees', 'invoices', { status, classId, search: debounced, page, studentId, ...sort.params }],
    queryFn: () =>
      api.get<Paginated<Invoice>>('/fees/invoices', {
        studentId: studentId || undefined,
        status: status === 'all' ? undefined : status,
        classId: classId || undefined,
        search: debounced,
        page,
        pageSize: 15,
        ...sort.params,
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <Card>
      <div className="toolbar">
        <Segmented<StatusFilter>
          label={t('filterStatus')}
          value={status}
          onChange={(v) => setParam('status', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: tc('all') },
            { value: 'open', label: t('open') },
            { value: 'overdue', label: tc('overdue') },
            { value: 'paid', label: tc('paid') },
          ]}
        />
        <Select aria-label={t('filterClass')} value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t('allClasses')}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder={t('searchPh')} label={t('searchLabel')} />
        {studentId && (
          <span className="chip">
            {list.data?.items[0]?.studentName ? t('onlyStudent', { name: list.data.items[0].studentName }) : t('oneStudent')}
            <button type="button" className="btn btn-ghost btn-sm" style={{ height: 22, padding: '0 6px' }} onClick={() => setParam('studentId', null)} aria-label={t('showAll')}>
              <X size={13} aria-hidden />
            </button>
          </span>
        )}
      </div>

      {list.isLoading ? (
        <div className="card-body"><CardSkeleton rows={8} /></div>
      ) : list.error ? (
        <div className="card-body"><ErrorState error={list.error} onRetry={list.refetch} /></div>
      ) : !list.data?.items.length ? (
        <EmptyState
          icon={<Receipt size={26} />}
          title={debounced || classId || status !== 'all' || studentId ? t('noMatch') : t('noInvoices')}
          action={!debounced && !classId && status === 'all' && !studentId ? <Button variant="primary" icon={<FilePlus2 size={17} />} onClick={onCreate}>{t('createInvoices')}</Button> : undefined}
        />
      ) : (
        <div className="table-wrap" style={{ opacity: list.isFetching ? 0.7 : 1, transition: 'opacity 150ms' }}>
          <table className="table">
            <thead>
              <tr>
                <SortHeader label={t('student')} field="student" state={sort} />
                <SortHeader label={t('invoice')} field="invoice" state={sort} />
                <SortHeader label={t('due')} field="due" state={sort} />
                <SortHeader label={t('amount')} field="amount" state={sort} numeric />
                <SortHeader label={t('balance')} field="balance" state={sort} numeric />
                <SortHeader label={t('status')} field="status" state={sort} />
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((inv) => (
                <tr
                  key={inv.id}
                  className="clickable"
                  tabIndex={0}
                  aria-label={t('openInvoice', { title: inv.title, name: inv.studentName })}
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
                  <td><Badge tone={INVOICE_META[inv.status].tone} dot>{tc(inv.status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && list.data.total > 0 && <Pagination page={page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
      {openId !== null && <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------- Invoice drawer
function InvoiceDrawer({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const t = useT(M);
  const { t: tc } = useI18n();
  const methodLabel = useMethodLabel();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['fees', 'invoice', invoiceId], queryFn: () => api.get<InvoiceDetail>(`/fees/invoices/${invoiceId}`) });
  const inv = q.data;

  const [form, setForm] = useState({ amount: '', method: 'mobile_money' as PaymentMethod, reference: '', paidOn: todayIso() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (inv) setForm((f) => ({ ...f, amount: inv.balance > 0 ? String(inv.balance) : '' }));
  }, [inv?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (data?: InvoiceDetail) => {
    if (data) qc.setQueryData(['fees', 'invoice', invoiceId], data);
    qc.invalidateQueries({ queryKey: ['fees', 'invoices'] });
    qc.invalidateQueries({ queryKey: ['fees', 'summary'] });
    qc.invalidateQueries({ queryKey: ['fees', 'structures'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const pay = useMutation({
    mutationFn: (body: PaymentInput) => api.post<InvoiceDetail>(`/fees/invoices/${invoiceId}/payments`, body),
    onSuccess: (data, body) => {
      refresh(data);
      setForm((f) => ({ ...f, reference: '' }));
      const latest = [...data.payments].sort((a, b) => b.id - a.id)[0];
      toast.success(
        t('paymentRecorded', { amount: money(body.amount) }),
        <>
          {data.balance > 0 ? t('stillToPay', { amount: money(data.balance) }) : t('fullyPaid')}{' '}
          {latest && <Link to={`/receipts/${latest.id}`}>{t('viewReceipt')} ({latest.receiptNo})</Link>}
        </>,
      );
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const removePayment = useMutation({
    mutationFn: (id: number) => api.del<InvoiceDetail>(`/fees/payments/${id}`),
    onSuccess: (data) => {
      refresh(data);
      toast.success(t('paymentRemoved'));
    },
    onError: (err) => toast.error(err),
  });

  const removeInvoice = useMutation({
    mutationFn: () => api.del(`/fees/invoices/${invoiceId}`),
    onSuccess: () => {
      refresh();
      toast.success(t('invoiceDeleted'));
      onClose();
    },
    onError: (err) => toast.error(err),
  });

  const submit = () => {
    if (!inv) return;
    const amount = Number(form.amount);
    const errs: Record<string, string> = {};
    if (!form.amount || Number.isNaN(amount) || amount <= 0) errs.amount = t('amountRequired');
    else if (amount > inv.balance) errs.amount = t('amountTooHigh', { amount: money(inv.balance) });
    if (!form.paidOn) errs.paidOn = t('dateRequired');
    else if (form.paidOn > todayIso()) errs.paidOn = t('noFuture');
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
      title={inv ? inv.title : t('invoice')}
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
                  if (await confirm({ title: t('deleteInvoiceTitle'), message: t('deleteInvoiceMsg', { title: inv.title, name: inv.studentName, amount: money(inv.amount) }), confirmLabel: t('deleteInvoice'), danger: true })) removeInvoice.mutate();
                }}
              >
                {t('deleteInvoice')}
              </Button>
            )}
            <Button onClick={onClose}>{tc('close')}</Button>
            {inv.balance > 0 && <Button type="submit" variant="primary" icon={<Banknote size={17} />} loading={pay.isPending}>{t('recordPayment')}</Button>}
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
              <Badge tone={INVOICE_META[inv.status].tone} dot>{tc(inv.status)}</Badge>
              <span className="small muted">{t('dueOn', { date: formatDate(inv.dueDate) })}</span>
            </div>
            <div className="row between mt-1">
              <span className="muted small">{t('paidOf', { paid: money(inv.amountPaid), amount: money(inv.amount) })}</span>
              <strong className="num">{percent(paidPct)}</strong>
            </div>
            <ProgressBar value={paidPct} tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'primary'} label={t('amountPaid')} />
            <dl className="kv mt-1">
              <dt>{t('amount')}</dt><dd className="num">{money(inv.amount)}</dd>
              <dt>{t('balance')}</dt><dd className={`num bold ${inv.balance > 0 ? 'text-danger' : 'text-success'}`}>{money(inv.balance)}</dd>
              {inv.notes && (<><dt>{t('notes')}</dt><dd>{inv.notes}</dd></>)}
            </dl>
          </div>

          <div>
            <h3 className="mb-2">{t('payments')}</h3>
            {inv.payments.length === 0 ? (
              <p className="muted small">{t('noPayments')}</p>
            ) : (
              <ul className="list card">
                {inv.payments.map((p) => (
                  <li key={p.id} className="list-item">
                    <div className="grow">
                      <div className="row" style={{ gap: 8 }}>
                        <span className="bold num">{money(p.amount)}</span>
                        <span className="tiny muted mono">{p.receiptNo}</span>
                      </div>
                      <div className="meta">
                        {methodLabel(p.method)} · {formatDate(p.paidOn)}
                        {p.reference && ` · ${t('ref', { ref: p.reference })}`}
                        {p.recordedByName && ` · ${t('recordedBy', { name: p.recordedByName })}`}
                      </div>
                    </div>
                    <Link to={`/receipts/${p.id}`} className="btn btn-sm btn-ghost" aria-label={t('receiptNo', { no: p.receiptNo })}>
                      <FileText size={15} aria-hidden /> {t('receipt')}
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={t('removePayment', { amount: money(p.amount), date: formatDate(p.paidOn) })}
                      icon={<Trash2 size={15} />}
                      onClick={async () => {
                        if (await confirm({ title: t('removePaymentTitle'), message: t('removePaymentMsg', { amount: money(p.amount), date: formatDate(p.paidOn), no: p.receiptNo }), confirmLabel: t('removePaymentConfirm'), danger: true })) removePayment.mutate(p.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {inv.balance > 0 && (
            <div>
              <h3 className="mb-2">{t('recordAPayment')}</h3>
              <div className="form-grid">
                <Field label={t('amount')} required error={errors.amount} hint={t('balanceHint', { amount: money(inv.balance) })}>
                  <Input type="number" min={1} step="any" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
                <Field label={t('method')} required error={errors.method}>
                  <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
                    {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
                  </Select>
                </Field>
                <Field label={t('datePaid')} required error={errors.paidOn}>
                  <Input type="date" max={todayIso()} value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} />
                </Field>
                <Field label={t('reference')} error={errors.reference} hint={t('referenceHint')}>
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
  const t = useT(M);
  const { t: tc } = useI18n();
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
      toast.success(t('created', { n: res.created }), t('createdEach', { title: form.title, amount: money(Number(form.amount)) }));
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (mode === 'class' && !classId) errs.classId = t('chooseClassErr');
    if (mode === 'students' && picked.length === 0) errs.students = t('addStudentErr');
    if (!form.title.trim()) errs.title = t('titleErr');
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) errs.amount = t('amountRequired');
    if (!form.dueDate) errs.dueDate = t('dueErr');
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
      title={t('createInvoices')}
      description={t('createDesc')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" icon={<FilePlus2 size={17} />} loading={create.isPending}>
            {recipients > 0 ? t('createN', { n: recipients }) : t('createInvoices')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>
          <span className="field-label">{t('whoBilled')}</span>
          <div className="mt-1">
            <Segmented label={t('whoBilled')} value={mode} onChange={setMode} options={[{ value: 'class', label: t('wholeClass') }, { value: 'students', label: t('chosenStudents') }]} />
          </div>
        </div>

        {mode === 'class' ? (
          <Field label={t('class')} required error={errors.classId} hint={selectedClass ? t('classHint', { n: selectedClass.studentCount }) : undefined}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('chooseClass')}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.studentCount})</option>)}
            </Select>
          </Field>
        ) : (
          <div className="field">
            <span className="field-label">{t('students')} <span className="req" aria-hidden>*</span></span>
            <SearchInput value={search} onChange={setSearch} placeholder={t('findPh')} label={t('findStudents')} />
            {errors.students && <span className="field-error"><AlertTriangle size={14} aria-hidden /> {errors.students}</span>}
            {picked.length > 0 && (
              <div className="row row-wrap" style={{ gap: 6 }} aria-label={t('selected')}>
                {picked.map((p) => (
                  <span key={p.id} className="chip">
                    {fullName(p)}
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ width: 22, height: 22 }} aria-label={t('removeName', { name: fullName(p) })} onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {debounced.trim().length >= 2 && (
              <div className="card" style={{ maxHeight: 240, overflowY: 'auto' }}>
                {results.isLoading ? (
                  <div className="card-body small muted">{t('searching')}</div>
                ) : !results.data?.items.length ? (
                  <div className="card-body small muted">{t('noStudentMatch', { q: debounced })}</div>
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
          <Field label={t('invoiceTitle')} required error={errors.title} className="span-2">
            <Input value={form.title} maxLength={120} placeholder={t('titlePh')} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t('amountEach')} required error={errors.amount}>
            <Input type="number" min={1} step="any" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label={t('dueDate')} required error={errors.dueDate}>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label={t('notes')} hint={t('notesHint')} error={errors.notes} className="span-2">
            <Textarea value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ minHeight: 80 }} />
          </Field>
        </div>
        {recipients > 0 && form.amount && Number(form.amount) > 0 && (
          <Alert tone="info" icon={<Info size={20} />}>
            {t('totalBilled', { amount: money(recipients * Number(form.amount)), n: recipients })}
          </Alert>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Fee structures
function StructuresTab() {
  const t = useT(M);
  const { t: tc } = useI18n();
  const { school } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FeeStructure | 'new' | null>(null);
  const q = useQuery({ queryKey: ['fees', 'structures'], queryFn: () => api.get<FeeStructure[]>('/fees/structures') });

  const levelText = (level: number | null) => (level === null ? t('allLevels') : levelName(level, school.levelLabel));

  const apply = useMutation({
    mutationFn: (fs: FeeStructure) => api.post<{ created: number }>(`/fees/structures/${fs.id}/apply`, {}),
    onSuccess: (res, fs) => {
      qc.invalidateQueries({ queryKey: ['fees'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (res.created > 0) toast.success(t('applied', { n: res.created }), `${fs.name} · ${money(fs.amount)}`);
      else toast.info(t('appliedNone', { level: levelText(fs.level) }));
    },
    onError: (err) => toast.error(err),
  });

  const remove = useMutation({
    mutationFn: (fs: FeeStructure) => api.del(`/fees/structures/${fs.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fees', 'structures'] });
      toast.success(t('structureDeleted'));
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) toast.error(err.message, t('deleteBlocked'));
      else toast.error(err);
    },
  });

  return (
    <Card>
      <CardHeader
        title={t('structures')}
        subtitle={t('structuresDesc')}
        action={<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('newStructure')}</Button>}
      />
      {q.isLoading ? (
        <div className="card-body"><CardSkeleton rows={5} /></div>
      ) : q.error ? (
        <div className="card-body"><ErrorState error={q.error} onRetry={q.refetch} /></div>
      ) : !q.data?.length ? (
        <EmptyState
          icon={<Layers size={26} />}
          title={t('noStructures')}
          action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('newStructure')}</Button>}
        >
          {t('noStructuresHint')}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('name')}</th>
                <th scope="col">{t('level')}</th>
                <th scope="col">{t('term')}</th>
                <th scope="col">{t('due')}</th>
                <th scope="col" className="num">{t('amount')}</th>
                <th scope="col">{t('invoices')}</th>
                <th scope="col" className="actions"><span className="sr-only">{tc('edit')}</span></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((fs) => (
                <tr key={fs.id} style={{ opacity: fs.isActive ? 1 : 0.6 }}>
                  <td>
                    <div className="bold">{fs.name}</div>
                    {fs.description && <div className="tiny muted">{fs.description}</div>}
                    {!fs.isActive && <Badge>{t('inactive')}</Badge>}
                  </td>
                  <td>{levelText(fs.level)}</td>
                  <td>{fs.termName ?? '—'}</td>
                  <td>{formatDate(fs.dueDate)}</td>
                  <td className="num bold">{money(fs.amount)}</td>
                  <td>
                    <div className="small">{t('invoicesIssued', { n: fs.invoiceCount })}</div>
                    {fs.invoiceCount > 0 && <div className="tiny muted">{t('collectedAmt', { amount: money(fs.collected) })}</div>}
                  </td>
                  <td className="actions">
                    <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Play size={14} />}
                        disabled={!fs.isActive}
                        aria-label={t('applyLabel', { name: fs.name })}
                        loading={apply.isPending && apply.variables?.id === fs.id}
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('applyTitle', { name: fs.name }),
                            message: t('applyMsg', { level: levelText(fs.level), amount: money(fs.amount), date: formatDate(fs.dueDate) }),
                            confirmLabel: t('applyConfirm'),
                          });
                          if (ok) apply.mutate(fs);
                        }}
                      >
                        {t('apply')}
                      </Button>
                      <Button size="sm" variant="ghost" iconOnly aria-label={t('edit', { name: fs.name })} icon={<Pencil size={15} />} onClick={() => setEditing(fs)} />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        aria-label={t('deleteStructure')}
                        icon={<Trash2 size={15} />}
                        onClick={async () => {
                          if (await confirm({ title: t('deleteStructureTitle', { name: fs.name }), message: t('deleteStructureMsg'), confirmLabel: tc('delete'), danger: true })) remove.mutate(fs);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <StructureModal structure={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function StructureModal({ structure, onClose }: { structure: FeeStructure | null; onClose: () => void }) {
  const t = useT(M);
  const { t: tc } = useI18n();
  const { school } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const terms = useQuery({ queryKey: ['terms'], queryFn: () => api.get<Term[]>('/terms') });
  const currentTerm = terms.data?.find((x) => x.isCurrent);
  const [form, setForm] = useState({
    name: structure?.name ?? '',
    amount: structure ? String(structure.amount) : '',
    level: structure?.level != null ? String(structure.level) : '',
    termId: structure?.termId != null ? String(structure.termId) : '',
    dueDate: structure?.dueDate ?? '',
    description: structure?.description ?? '',
    isActive: structure?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const amountLocked = !!structure && structure.invoiceCount > 0;

  useEffect(() => {
    if (!structure && currentTerm && !form.termId) setForm((f) => ({ ...f, termId: String(currentTerm.id) }));
  }, [currentTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (body: FeeStructureInput) =>
      structure ? api.patch<FeeStructure>(`/fees/structures/${structure.id}`, body) : api.post<FeeStructure>('/fees/structures', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fees', 'structures'] });
      toast.success(t('structureSaved'));
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = t('nameErr');
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) errs.amount = t('amountRequired');
    if (!form.dueDate) errs.dueDate = t('dueErr');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: FeeStructureInput = {
      name: form.name.trim(),
      amount,
      level: form.level ? Number(form.level) : null,
      termId: form.termId ? Number(form.termId) : null,
      dueDate: form.dueDate,
      description: form.description.trim() || null,
      isActive: form.isActive,
    };
    if (amountLocked) delete (body as Partial<FeeStructureInput>).amount;
    save.mutate(body);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={structure ? t('editStructure') : t('newStructure')}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{tc('save')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('name')} required error={errors.name} className="span-2">
          <Input value={form.name} maxLength={120} placeholder={t('namePh')} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />
        </Field>
        <Field label={`${t('amount')} (${school.currency})`} required error={errors.amount} hint={amountLocked ? t('amountLocked') : undefined}>
          <Input type="number" min={1} step="any" inputMode="decimal" value={form.amount} disabled={amountLocked} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label={t('dueDate')} required error={errors.dueDate}>
          <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
        <Field label={t('level')} error={errors.level}>
          <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
            <option value="">{t('allLevels')}</option>
            {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>{levelName(l, school.levelLabel)}</option>)}
          </Select>
        </Field>
        <Field label={t('term')} error={errors.termId}>
          <Select value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
            <option value="">{t('noTerm')}</option>
            {terms.data?.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
          </Select>
        </Field>
        <Field label={t('description')} error={errors.description} className="span-2">
          <Textarea value={form.description} maxLength={500} style={{ minHeight: 70 }} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="span-2">
          <Toggle label={t('active')} description={t('activeHint')} checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
        </div>
      </div>
    </Modal>
  );
}

// ================================================================ Student / parent
function FamilyFees() {
  const t = useT(M);
  const user = useUser();
  const { school } = useAuth();
  const children = useChildren();
  const [params, setParams] = useSearchParams();
  const focusChild = Number(params.get('child')) || null;
  const q = useQuery({
    queryKey: ['fees', 'invoices', 'family'],
    queryFn: () => api.get<Paginated<Invoice>>('/fees/invoices', { pageSize: 100 }),
  });

  const setFocus = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('child');
    else next.set('child', String(id));
    setParams(next, { replace: true });
  };

  const items = useMemo(
    () => (q.data?.items ?? []).filter((i) => user.role !== 'parent' || !focusChild || i.studentId === focusChild),
    [q.data, focusChild, user.role],
  );

  const groups = useMemo(() => {
    const map = new Map<number, { name: string; className: string | null; items: Invoice[] }>();
    for (const inv of items) {
      if (!map.has(inv.studentId)) map.set(inv.studentId, { name: inv.studentName, className: inv.className, items: [] });
      map.get(inv.studentId)!.items.push(inv);
    }
    return [...map.entries()];
  }, [items]);

  const balance = items.reduce((s, i) => s + i.balance, 0);
  const overdue = items.filter((i) => i.status === 'overdue');
  const nextDue = items.filter((i) => i.balance > 0 && daysUntil(i.dueDate) >= 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const kids = children.data ?? [];

  return (
    <>
      <PageHeader title={user.role === 'parent' ? t('title') : t('myFees')} description={user.role === 'parent' ? t('parentDesc') : t('studentDesc')} />
      {user.role === 'parent' && kids.length > 1 && (
        <div className="row row-wrap mb-3" style={{ gap: 8 }}>
          <button type="button" className="child-chip" aria-pressed={!focusChild} onClick={() => setFocus(null)} style={{ paddingLeft: 14 }}>
            {t('allChildren')}
          </button>
          <ChildSwitcher children={kids} value={focusChild} onChange={(id) => setFocus(id)} />
        </div>
      )}
      {q.isLoading ? (
        <CardSkeleton rows={6} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <>
          <div className="grid grid-3 mb-3">
            <StatCard icon={<Wallet size={22} />} label={t('totalBalance')} value={money(balance)} tone={balance > 0 ? 'warning' : 'success'} hint={balance > 0 ? t('outstanding') : t('allPaid')} />
            <StatCard icon={<AlertTriangle size={22} />} label={t('overdue')} value={money(overdue.reduce((s, i) => s + i.balance, 0))} tone={overdue.length ? 'danger' : 'success'} hint={overdue.length ? t('invoicesN', { n: overdue.length }) : t('nothingOverdue')} />
            <StatCard icon={<Receipt size={22} />} label={t('nextDue')} value={nextDue ? money(nextDue.balance) : '—'} tone="info" hint={nextDue ? `${nextDue.title} · ${formatDate(nextDue.dueDate)}` : t('noUpcoming')} />
          </div>

          {overdue.length > 0 && (
            <div className="mb-3">
              <Alert tone="danger" icon={<AlertTriangle size={20} />} title={t('pastDue', { n: overdue.length })}>
                {t('planHelp')}
              </Alert>
            </div>
          )}

          <div className="grid grid-main">
            <div className="stack" style={{ gap: 20 }}>
              {groups.length === 0 ? (
                <Card><EmptyState icon={<Receipt size={26} />} title={t('noInvoices')}>{t('noInvoicesFamily')}</EmptyState></Card>
              ) : (
                groups.map(([studentId, g]) => (
                  <Card key={studentId}>
                    <CardHeader
                      title={user.role === 'parent' ? g.name : t('invoices')}
                      subtitle={user.role === 'parent' ? g.className ?? undefined : undefined}
                      action={<span className="small muted">{t('balance')} <strong className="num" style={{ color: 'var(--text)' }}>{money(g.items.reduce((s, i) => s + i.balance, 0))}</strong></span>}
                    />
                    <ul className="list">
                      {g.items.map((inv) => <FamilyInvoice key={inv.id} inv={inv} />)}
                    </ul>
                  </Card>
                ))
              )}
            </div>
            <Card>
              <CardHeader title={t('howToPay')} />
              <div className="card-body stack">
                <p className="small muted">{t('quoteRef')}</p>
                <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Smartphone size={20} className="subtle" aria-hidden style={{ flex: 'none' }} />
                  <div><div className="bold">{t('mobile')}</div><div className="small muted">{t('mobileHint')}</div></div>
                </div>
                <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Landmark size={20} className="subtle" aria-hidden style={{ flex: 'none' }} />
                  <div><div className="bold">{t('bank')}</div><div className="small muted">{t('bankHint')}</div></div>
                </div>
                <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Banknote size={20} className="subtle" aria-hidden style={{ flex: 'none' }} />
                  <div><div className="bold">{t('office')}</div><div className="small muted">{t('officeHint', { school: school.name })}</div></div>
                </div>
                <Alert tone="info" icon={<Info size={18} />}>
                  {t('recordedNote')} {t('noOnline')}
                </Alert>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function FamilyInvoice({ inv }: { inv: Invoice }) {
  const t = useT(M);
  const { t: tc } = useI18n();
  const methodLabel = useMethodLabel();
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
          <div className="row row-wrap" style={{ gap: 8 }}>
            <span className="title">{inv.title}</span>
            <Badge tone={INVOICE_META[inv.status].tone} dot>{tc(inv.status)}</Badge>
          </div>
          <div className="meta">{t('dueOn', { date: formatDate(inv.dueDate) })}{inv.status !== 'paid' && ` (${relativeTime(inv.dueDate)})`}</div>
          {inv.notes && <div className="small muted mt-1">{inv.notes}</div>}
          <div className="mt-1" style={{ maxWidth: 360 }}>
            <ProgressBar value={pct} tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'primary'} label={t('amountPaid')} />
            <div className="tiny muted mt-1">{t('paidOfAmount', { paid: money(inv.amountPaid), amount: money(inv.amount) })}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="tiny muted">{t('balance')}</div>
          <div className="bold num" style={{ fontSize: '1.1rem' }}>{money(inv.balance)}</div>
          <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={panelId} icon={open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} onClick={() => setOpen(!open)}>
            {t('paymentHistory')}
          </Button>
        </div>
      </div>
      {open && (
        <div id={panelId} style={{ padding: '0 20px 14px' }}>
          {detail.isLoading ? (
            <span className="small muted">{tc('loading')}</span>
          ) : detail.error ? (
            <span className="small text-danger">{t('couldNotLoadPayments')}</span>
          ) : !detail.data?.payments.length ? (
            <span className="small muted">{t('noPaymentsYet')}</span>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ background: 'var(--surface-2)', borderRadius: 8 }}>
                <thead>
                  <tr>
                    <th scope="col">{t('date')}</th>
                    <th scope="col">{t('method')}</th>
                    <th scope="col" className="num">{t('amount')}</th>
                    <th scope="col"><span className="sr-only">{t('receipt')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.paidOn)}</td>
                      <td>
                        {methodLabel(p.method)}
                        {p.reference && <div className="tiny muted mono">{p.reference}</div>}
                      </td>
                      <td className="num bold">{money(p.amount)}</td>
                      <td className="text-right">
                        <Link to={`/receipts/${p.id}`} className="btn btn-sm" aria-label={`${t('downloadReceipt')} ${p.receiptNo}`}>
                          <FileText size={14} aria-hidden /> {t('downloadReceipt')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
