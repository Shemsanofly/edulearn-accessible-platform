import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Language } from '../../../shared/types';
import { useAuth } from './auth';
import { setFormatLocale } from './format';

/**
 * English / Kiswahili support.
 *
 * - Shared words (navigation, buttons, statuses) live in COMMON below: use `useI18n().t('save')`.
 * - Each page keeps its own wording next to its code with `useT({ en: {...}, sw: {...} })`,
 *   so translations stay with the screen they belong to.
 * - `{name}` placeholders are filled from the second argument: t('hello', { name: 'Asha' }).
 */

const STORAGE_KEY = 'edulearn-lang';

export const LOCALES: Record<Language, string> = { en: 'en-GB', sw: 'sw-TZ' };

export const LANGUAGES: { id: Language; label: string; short: string }[] = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'sw', label: 'Kiswahili', short: 'SW' },
];

type Vars = Record<string, string | number | null | undefined>;

export function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

export const COMMON = {
  en: {
    // Navigation
    dashboard: 'Dashboard', students: 'Students', teachers: 'Teachers', parents: 'Parents', classes: 'Classes',
    timetable: 'Timetable', attendance: 'Attendance', gradebook: 'Gradebook', exams: 'Examinations', subjectsTerms: 'Subjects & terms',
    fees: 'Fees & payments', feesShort: 'Fees', announcements: 'Announcements', news: 'News', calendar: 'Calendar', messages: 'Messages',
    reports: 'Reports', enquiries: 'Enquiries', auditLog: 'Audit log', schoolSettings: 'School settings', settings: 'Settings',
    myClasses: 'My classes', gradesAttendance: 'Grades & attendance', grades: 'Grades', reportCards: 'Report cards', results: 'Results',
    assignments: 'Assignments', assignmentsShort: 'Assignments', notifications: 'Notifications', invitations: 'Invitations',
    createAccount: 'Create account', getStarted: 'Get started', contactUs: 'Contact us', quickActions: 'Quick actions', newItem: 'New',
    inviteSomeone: 'Invite someone', enrolStudent: 'Enrol a student', createInvoices: 'Create invoices', postAnnouncement: 'Post an announcement',
    takeRegister: 'Take the register', enterMarks: 'Enter marks', messageTeacher: 'Message a teacher', messageParent: 'Message a parent', sortBy: 'Sort by', home: 'Home', menu: 'Menu', myChildren: 'My children',
    // Navigation groups
    people: 'People', academics: 'Academics', finance: 'Finance', communication: 'Communication', administration: 'Administration',
    teaching: 'Teaching', learning: 'Learning', school: 'School', family: 'Family',
    // Roles
    admin: 'Administrator', teacher: 'Teacher', student: 'Student', parent: 'Parent',
    // Actions
    save: 'Save', saveChanges: 'Save changes', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', add: 'Add', create: 'Create',
    close: 'Close', back: 'Back', next: 'Next', previous: 'Previous', search: 'Search', filter: 'Filter', all: 'All',
    view: 'View', open: 'Open', download: 'Download', print: 'Print', printPdf: 'Print / save as PDF', exportCsv: 'Export to Excel (CSV)',
    tryAgain: 'Try again', confirm: 'Confirm', yes: 'Yes', no: 'No', signOut: 'Sign out', signIn: 'Sign in', upload: 'Upload',
    remove: 'Remove', markAllRead: 'Mark all as read', viewAll: 'View all', keyboardShortcuts: 'Keyboard shortcuts',
    // States
    loading: 'Loading…', noResults: 'No results', nothingYet: 'Nothing here yet', couldNotLoad: 'We couldn’t load this',
    saved: 'Saved', deleted: 'Deleted', required: 'Required', optional: 'optional',
    // Statuses
    present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused',
    paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', overdue: 'Overdue', active: 'Active', inactive: 'Inactive',
    published: 'Published', draft: 'Not published',
    // Misc
    today: 'Today', language: 'Language', displayAccessibility: 'Display & accessibility', searchPlaceholder: 'Search students, classes, pages…',
    jumpPlaceholder: 'Jump to a page…', unread: '{n} unread', noNotifications: 'You’re all caught up', class: 'Class', term: 'Term',
    child: 'Child', switchChild: 'Choose child', page: 'Page {page} of {pages}', showing: 'Showing {from}–{to} of {total}',
    goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening',
  },
  sw: {
    dashboard: 'Dashibodi', students: 'Wanafunzi', teachers: 'Walimu', parents: 'Wazazi', classes: 'Madarasa',
    timetable: 'Ratiba', attendance: 'Mahudhurio', gradebook: 'Daftari la alama', exams: 'Mitihani', subjectsTerms: 'Masomo na mihula',
    fees: 'Ada na malipo', feesShort: 'Ada', announcements: 'Matangazo', news: 'Habari', calendar: 'Kalenda', messages: 'Ujumbe',
    reports: 'Ripoti', enquiries: 'Maulizo', auditLog: 'Kumbukumbu za shughuli', schoolSettings: 'Mipangilio ya shule', settings: 'Mipangilio',
    myClasses: 'Madarasa yangu', gradesAttendance: 'Alama na mahudhurio', grades: 'Alama', reportCards: 'Ripoti za matokeo', results: 'Matokeo',
    assignments: 'Kazi za nyumbani', assignmentsShort: 'Kazi', notifications: 'Arifa', invitations: 'Mialiko',
    createAccount: 'Fungua akaunti', getStarted: 'Anza sasa', contactUs: 'Wasiliana nasi', quickActions: 'Vitendo vya haraka', newItem: 'Mpya',
    inviteSomeone: 'Alika mtu', enrolStudent: 'Sajili mwanafunzi', createInvoices: 'Toa ankara', postAnnouncement: 'Weka tangazo',
    takeRegister: 'Chukua mahudhurio', enterMarks: 'Ingiza alama', messageTeacher: 'Mtumie mwalimu ujumbe', messageParent: 'Mtumie mzazi ujumbe', sortBy: 'Panga kwa', home: 'Nyumbani', menu: 'Menyu', myChildren: 'Watoto wangu',
    people: 'Watu', academics: 'Taaluma', finance: 'Fedha', communication: 'Mawasiliano', administration: 'Utawala',
    teaching: 'Ufundishaji', learning: 'Masomo', school: 'Shule', family: 'Familia',
    admin: 'Msimamizi', teacher: 'Mwalimu', student: 'Mwanafunzi', parent: 'Mzazi',
    save: 'Hifadhi', saveChanges: 'Hifadhi mabadiliko', cancel: 'Ghairi', delete: 'Futa', edit: 'Hariri', add: 'Ongeza', create: 'Unda',
    close: 'Funga', back: 'Rudi', next: 'Mbele', previous: 'Nyuma', search: 'Tafuta', filter: 'Chuja', all: 'Zote',
    view: 'Tazama', open: 'Fungua', download: 'Pakua', print: 'Chapisha', printPdf: 'Chapisha / hifadhi PDF', exportCsv: 'Hamisha kwa Excel (CSV)',
    tryAgain: 'Jaribu tena', confirm: 'Thibitisha', yes: 'Ndiyo', no: 'Hapana', signOut: 'Toka', signIn: 'Ingia', upload: 'Pakia',
    remove: 'Ondoa', markAllRead: 'Weka zote kama zimesomwa', viewAll: 'Tazama zote', keyboardShortcuts: 'Njia za mkato za kibodi',
    loading: 'Inapakia…', noResults: 'Hakuna matokeo', nothingYet: 'Bado hakuna kitu hapa', couldNotLoad: 'Imeshindikana kupakia',
    saved: 'Imehifadhiwa', deleted: 'Imefutwa', required: 'Inahitajika', optional: 'si lazima',
    present: 'Yupo', absent: 'Hayupo', late: 'Amechelewa', excused: 'Ana ruhusa',
    paid: 'Imelipwa', partial: 'Imelipwa sehemu', unpaid: 'Haijalipwa', overdue: 'Imepitwa na muda', active: 'Hai', inactive: 'Imesitishwa',
    published: 'Yametolewa', draft: 'Hayajatolewa',
    today: 'Leo', language: 'Lugha', displayAccessibility: 'Mwonekano na ufikivu', searchPlaceholder: 'Tafuta wanafunzi, madarasa, kurasa…',
    jumpPlaceholder: 'Nenda kwenye ukurasa…', unread: 'Hazijasomwa {n}', noNotifications: 'Huna arifa mpya', class: 'Darasa', term: 'Muhula',
    child: 'Mtoto', switchChild: 'Chagua mtoto', page: 'Ukurasa {page} kati ya {pages}', showing: 'Inaonyesha {from}–{to} kati ya {total}',
    goodMorning: 'Habari za asubuhi', goodAfternoon: 'Habari za mchana', goodEvening: 'Habari za jioni',
  },
} as const satisfies Record<Language, Record<string, string>>;

export type CommonKey = keyof typeof COMMON.en;

interface I18nState {
  lang: Language;
  locale: string;
  setLang: (lang: Language) => void;
  t: (key: CommonKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nState | null>(null);

function storedLang(): Language | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'sw' ? v : null;
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, school, updatePreferences } = useAuth();
  const [local, setLocal] = useState<Language | null>(storedLang);
  const lang: Language = user?.preferences.language ?? local ?? school.defaultLanguage ?? 'en';
  const locale = LOCALES[lang];

  useEffect(() => {
    setFormatLocale(locale, lang);
    document.documentElement.lang = lang;
  }, [locale, lang]);

  const setLang = useCallback(
    (next: Language) => {
      setLocal(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* private mode: the choice still applies for this visit */
      }
      if (user) void updatePreferences({ language: next });
    },
    [user, updatePreferences],
  );

  const t = useCallback((key: CommonKey, vars?: Vars) => interpolate(COMMON[lang][key] ?? COMMON.en[key], vars), [lang]);
  const value = useMemo(() => ({ lang, locale, setLang, t }), [lang, locale, setLang, t]);
  // Set synchronously too, so the first render already formats dates in the right language.
  setFormatLocale(locale, lang);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/**
 * Page-level translations. Kiswahili must provide every English key (checked by TypeScript).
 *
 *   const MESSAGES = { en: { title: 'Fees' }, sw: { title: 'Ada' } };
 *   const t = useT(MESSAGES);  t('title')
 */
export function useT<K extends string>(messages: { en: Record<K, string>; sw: Record<K, string> }) {
  const { lang } = useI18n();
  return useCallback((key: K, vars?: Vars) => interpolate(messages[lang][key] ?? messages.en[key] ?? key, vars), [lang, messages]);
}

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={compact ? 'segmented lang-switch' : 'segmented'} role="group" aria-label="Language / Lugha">
      {LANGUAGES.map((l) => (
        <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => setLang(l.id)} lang={l.id}>
          {compact ? l.short : l.label}
        </button>
      ))}
    </div>
  );
}
