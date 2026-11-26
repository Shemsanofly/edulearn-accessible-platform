import {
  BookOpen, Calendar, CalendarClock, ClipboardCheck, GraduationCap, Home, Layers, Megaphone, MessageSquare,
  NotebookPen, Settings, School, UserRound, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import type { Role } from '../../../shared/types';

export interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  short?: string;
  icon: LucideIcon;
  badge?: 'messages';
  /** Extra words that help the command palette find this page. */
  keywords?: string;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const common = {
  announcements: { to: '/announcements', label: 'Announcements', short: 'News', icon: Megaphone, keywords: 'news notices' },
  calendar: { to: '/calendar', label: 'Calendar', icon: Calendar, keywords: 'events holidays dates' },
  messages: { to: '/messages', label: 'Messages', icon: MessageSquare, badge: 'messages', keywords: 'inbox mail chat' },
  settings: { to: '/settings', label: 'Settings', icon: Settings, keywords: 'profile password accessibility theme' },
} satisfies Record<string, NavItem>;

export const NAV: Record<Role, NavGroup[]> = {
  admin: [
    { items: [{ to: '/', label: 'Dashboard', short: 'Home', icon: Home }] },
    {
      label: 'People',
      items: [
        { to: '/students', label: 'Students', icon: GraduationCap, keywords: 'pupils learners enrol' },
        { to: '/teachers', label: 'Teachers', icon: UserRound, keywords: 'staff' },
        { to: '/parents', label: 'Parents', icon: Users, keywords: 'guardians families' },
      ],
    },
    {
      label: 'Academics',
      items: [
        { to: '/classes', label: 'Classes', icon: School, keywords: 'homeroom grades sections' },
        { to: '/timetable', label: 'Timetable', icon: CalendarClock, keywords: 'schedule lessons periods' },
        { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, keywords: 'register roll call absent' },
        { to: '/gradebook', label: 'Gradebook', icon: NotebookPen, keywords: 'marks scores assessments exams' },
        { to: '/academics', label: 'Subjects & terms', icon: Layers, keywords: 'curriculum setup' },
      ],
    },
    { label: 'Office', items: [{ to: '/fees', label: 'Fees & payments', short: 'Fees', icon: Wallet, keywords: 'invoices billing finance money' }, common.announcements, common.calendar, common.messages] },
  ],
  teacher: [
    { items: [{ to: '/', label: 'Dashboard', short: 'Home', icon: Home }] },
    {
      label: 'Teaching',
      items: [
        { to: '/my-classes', label: 'My classes', short: 'Classes', icon: BookOpen, keywords: 'courses subjects' },
        { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, keywords: 'register roll call' },
        { to: '/gradebook', label: 'Gradebook', icon: NotebookPen, keywords: 'marks scores assessments' },
        { to: '/timetable', label: 'Timetable', icon: CalendarClock, keywords: 'schedule lessons' },
        { to: '/students', label: 'Students', icon: GraduationCap, keywords: 'pupils' },
      ],
    },
    { label: 'School', items: [common.announcements, common.calendar, common.messages] },
  ],
  student: [
    { items: [{ to: '/', label: 'Dashboard', short: 'Home', icon: Home }] },
    {
      label: 'Learning',
      items: [
        { to: '/timetable', label: 'Timetable', icon: CalendarClock, keywords: 'schedule lessons' },
        { to: '/progress', label: 'Grades & attendance', short: 'Grades', icon: NotebookPen, keywords: 'marks results report' },
        { to: '/assignments', label: 'Assignments', icon: BookOpen, keywords: 'homework due tests exams' },
        { to: '/fees', label: 'Fees', icon: Wallet, keywords: 'invoices payments' },
      ],
    },
    { label: 'School', items: [common.announcements, common.calendar, common.messages] },
  ],
  parent: [
    { items: [{ to: '/', label: 'Dashboard', short: 'Home', icon: Home, keywords: 'children kids' }] },
    { label: 'Family', items: [{ to: '/fees', label: 'Fees & payments', short: 'Fees', icon: Wallet, keywords: 'invoices balance' }] },
    { label: 'School', items: [common.announcements, common.calendar, common.messages] },
  ],
};

export const SETTINGS_ITEM = common.settings;
