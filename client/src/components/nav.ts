import {
  Award, BarChart3, BookOpen, Building2, Calendar, CalendarClock, ClipboardCheck, FileText, GraduationCap, History, Home,
  Inbox, Layers, MailPlus, Megaphone, MessageSquare, NotebookPen, School, Settings, UserRound, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import type { Role } from '../../../shared/types';
import type { CommonKey } from '../lib/i18n';

export interface NavItem {
  to: string;
  /** Translation key for the label (see COMMON in lib/i18n). */
  label: CommonKey;
  /** Shorter label for the phone tab bar. */
  short?: CommonKey;
  icon: LucideIcon;
  badge?: 'messages';
  /** Extra words that help the command palette find this page. */
  keywords?: string;
}
export interface NavGroup {
  label?: CommonKey;
  items: NavItem[];
}

const item = {
  dashboard: { to: '/', label: 'dashboard', short: 'home', icon: Home },
  announcements: { to: '/announcements', label: 'announcements', short: 'news', icon: Megaphone, keywords: 'news notices matangazo' },
  calendar: { to: '/calendar', label: 'calendar', icon: Calendar, keywords: 'events holidays dates kalenda' },
  messages: { to: '/messages', label: 'messages', icon: MessageSquare, badge: 'messages', keywords: 'inbox mail chat ujumbe' },
  settings: { to: '/settings', label: 'settings', icon: Settings, keywords: 'profile password language accessibility theme lugha' },
  timetable: { to: '/timetable', label: 'timetable', icon: CalendarClock, keywords: 'schedule lessons periods ratiba' },
  reportCards: { to: '/report-cards', label: 'reportCards', short: 'results', icon: Award, keywords: 'results exams matokeo ripoti' },
  assignments: { to: '/assignments', label: 'assignments', short: 'assignmentsShort', icon: BookOpen, keywords: 'homework due kazi' },
  fees: { to: '/fees', label: 'fees', short: 'feesShort', icon: Wallet, keywords: 'invoices payments receipts ada malipo' },
} satisfies Record<string, NavItem>;

export const NAV: Record<Role, NavGroup[]> = {
  admin: [
    { items: [item.dashboard] },
    {
      label: 'people',
      items: [
        { to: '/students', label: 'students', icon: GraduationCap, keywords: 'pupils learners enrol wanafunzi' },
        { to: '/teachers', label: 'teachers', icon: UserRound, keywords: 'staff walimu' },
        { to: '/parents', label: 'parents', icon: Users, keywords: 'guardians families wazazi' },
        { to: '/invitations', label: 'invitations', icon: MailPlus, keywords: 'invite register account mwaliko' },
      ],
    },
    {
      label: 'academics',
      items: [
        { to: '/classes', label: 'classes', icon: School, keywords: 'forms streams madarasa' },
        item.timetable,
        { to: '/attendance', label: 'attendance', icon: ClipboardCheck, keywords: 'register roll call absent mahudhurio' },
        { to: '/gradebook', label: 'gradebook', icon: NotebookPen, keywords: 'marks scores assessments alama' },
        { to: '/exams', label: 'exams', icon: Award, keywords: 'examinations results report cards mitihani' },
        { to: '/academics', label: 'subjectsTerms', icon: Layers, keywords: 'curriculum grading academic year masomo' },
      ],
    },
    { label: 'finance', items: [item.fees] },
    { label: 'communication', items: [item.announcements, item.calendar, item.messages] },
    {
      label: 'administration',
      items: [
        { to: '/reports', label: 'reports', icon: BarChart3, keywords: 'export excel pdf analytics ripoti' },
        { to: '/enquiries', label: 'enquiries', icon: Inbox, keywords: 'contact messages questions website' },
        { to: '/audit-log', label: 'auditLog', icon: History, keywords: 'activity history security' },
        { to: '/school-settings', label: 'schoolSettings', icon: Building2, keywords: 'school name logo currency' },
      ],
    },
  ],
  teacher: [
    { items: [item.dashboard] },
    {
      label: 'teaching',
      items: [
        { to: '/my-classes', label: 'myClasses', short: 'classes', icon: BookOpen, keywords: 'courses subjects' },
        { to: '/attendance', label: 'attendance', icon: ClipboardCheck, keywords: 'register roll call mahudhurio' },
        { to: '/gradebook', label: 'gradebook', icon: NotebookPen, keywords: 'marks scores assessments assignments alama' },
        { to: '/exams', label: 'exams', icon: Award, keywords: 'examinations results report cards mitihani' },
        item.timetable,
        { to: '/students', label: 'students', icon: GraduationCap, keywords: 'pupils wanafunzi' },
        { to: '/reports', label: 'reports', icon: BarChart3, keywords: 'export excel attendance ripoti' },
      ],
    },
    { label: 'school', items: [item.announcements, item.calendar, item.messages] },
  ],
  student: [
    { items: [item.dashboard] },
    {
      label: 'learning',
      items: [
        item.timetable,
        { to: '/progress', label: 'gradesAttendance', short: 'grades', icon: NotebookPen, keywords: 'marks results report alama' },
        item.reportCards,
        item.assignments,
        item.fees,
      ],
    },
    { label: 'school', items: [item.announcements, item.calendar, item.messages] },
  ],
  parent: [
    { items: [{ ...item.dashboard, label: 'myChildren', keywords: 'children kids watoto' }] },
    { label: 'family', items: [item.reportCards, item.assignments, item.timetable, item.fees] },
    { label: 'school', items: [item.announcements, item.calendar, item.messages] },
  ],
};

export const SETTINGS_ITEM = item.settings;
export const NOTIFICATIONS_ITEM: NavItem = { to: '/notifications', label: 'notifications', icon: FileText, keywords: 'alerts arifa' };
