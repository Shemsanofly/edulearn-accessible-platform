/**
 * API contract shared by the server and the client.
 * Only types live here — import with `import type` so nothing is emitted at runtime.
 * Dates are ISO strings: `YYYY-MM-DD` for calendar days, full ISO for instants.
 */

export type Role = 'admin' | 'teacher' | 'student' | 'parent';
export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AssessmentType = 'assignment' | 'quiz' | 'test' | 'exam' | 'project';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other';
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue';
export type Audience = 'everyone' | 'staff' | 'students' | 'parents' | 'class';
export type EventType = 'academic' | 'exam' | 'holiday' | 'meeting' | 'sports' | 'other';

export interface Preferences {
  theme?: 'light' | 'dark' | 'system';
  fontScale?: number; // 1, 1.125, 1.25
  highContrast?: boolean;
  reducedMotion?: boolean;
  dyslexiaFont?: boolean;
}

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string | null;
  preferences: Preferences;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  details?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export interface PersonRef {
  id: number;
  firstName: string;
  lastName: string;
}

export interface StudentListItem extends PersonRef {
  email: string;
  phone: string | null;
  isActive: boolean;
  admissionNo: string;
  classId: number | null;
  className: string | null;
  gender: Gender;
  dateOfBirth: string | null;
  accessibilityNeeds: string[];
}

export interface Guardian extends PersonRef {
  email: string;
  phone: string | null;
  relationship: string;
  isPrimary: boolean;
}

export interface StudentDetail extends StudentListItem {
  address: string | null;
  medicalNotes: string | null;
  enrolledOn: string;
  guardians: Guardian[];
}

export interface StudentInput {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phone?: string | null;
  admissionNo?: string;
  classId?: number | null;
  dateOfBirth?: string | null;
  gender?: Gender;
  address?: string | null;
  accessibilityNeeds?: string[];
  medicalNotes?: string | null;
  isActive?: boolean;
}

export interface TeacherListItem extends PersonRef {
  email: string;
  phone: string | null;
  isActive: boolean;
  employeeNo: string;
  qualification: string | null;
  specialization: string | null;
  hiredOn: string;
  courseCount: number;
  homeroomClass: string | null;
}

export interface TeacherDetail extends TeacherListItem {
  courses: Course[];
}

export interface TeacherInput {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phone?: string | null;
  employeeNo?: string;
  qualification?: string | null;
  specialization?: string | null;
  hiredOn?: string;
  isActive?: boolean;
}

export interface ParentChild extends PersonRef {
  relationship: string;
  className: string | null;
}

export interface ParentListItem extends PersonRef {
  email: string;
  phone: string | null;
  isActive: boolean;
  children: ParentChild[];
}

export interface ParentInput {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phone?: string | null;
  isActive?: boolean;
  children?: { studentId: number; relationship: string }[];
}

/** Returned when an account is created or a password reset, so the admin can hand it over. */
export interface CreatedAccount<T> {
  record: T;
  temporaryPassword: string | null;
}

// ---------------------------------------------------------------------------
// Academics
// ---------------------------------------------------------------------------
export interface Term {
  id: number;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  color: string;
  description: string | null;
}

export interface ClassListItem {
  id: number;
  name: string;
  gradeLevel: number;
  section: string;
  room: string | null;
  capacity: number;
  homeroomTeacherId: number | null;
  homeroomTeacherName: string | null;
  studentCount: number;
  subjectCount: number;
}

export interface ClassDetail extends ClassListItem {
  students: StudentListItem[];
  courses: Course[];
}

export interface ClassInput {
  name: string;
  gradeLevel: number;
  section?: string;
  room?: string | null;
  capacity?: number;
  homeroomTeacherId?: number | null;
}

/** A subject taught to a class by a teacher. */
export interface Course {
  id: number;
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  color: string;
  teacherId: number | null;
  teacherName: string | null;
  studentCount: number;
}

export interface TimetableSlot {
  id: number;
  courseId: number;
  dayOfWeek: number; // 1 = Monday … 7 = Sunday
  startsAt: string; // HH:MM
  endsAt: string;
  room: string | null;
  classId: number;
  className: string;
  subjectName: string;
  color: string;
  teacherId: number | null;
  teacherName: string | null;
}

export interface TimetableSlotInput {
  courseId: number;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  room?: string | null;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export interface RegisterEntry extends PersonRef {
  admissionNo: string;
  status: AttendanceStatus | null;
  note: string | null;
}

export interface AttendanceRegister {
  classId: number;
  className: string;
  date: string;
  taken: boolean;
  entries: RegisterEntry[];
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  /** Share of recorded days the student attended (present + late), 0–100, null if nothing recorded */
  rate: number | null;
}

export interface AttendanceRecord {
  date: string;
  status: AttendanceStatus;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Assessments & grades
// ---------------------------------------------------------------------------
export interface Assessment {
  id: number;
  courseId: number;
  className: string;
  subjectName: string;
  color: string;
  termId: number | null;
  title: string;
  description: string | null;
  type: AssessmentType;
  maxScore: number;
  dueDate: string | null;
  gradedCount: number;
  studentCount: number;
  averagePercent: number | null;
}

export interface AssessmentInput {
  courseId: number;
  termId?: number | null;
  title: string;
  description?: string | null;
  type: AssessmentType;
  maxScore: number;
  dueDate?: string | null;
}

export interface GradebookRow extends PersonRef {
  admissionNo: string;
  scores: Record<number, number | null>;
  averagePercent: number | null;
}

export interface Gradebook {
  course: Course;
  assessments: Assessment[];
  rows: GradebookRow[];
}

export interface GradeInput {
  studentId: number;
  score: number | null;
  feedback?: string | null;
}

export interface StudentGrade {
  assessmentId: number;
  title: string;
  type: AssessmentType;
  subjectName: string;
  color: string;
  dueDate: string | null;
  score: number | null;
  maxScore: number;
  percent: number | null;
  feedback: string | null;
}

export interface SubjectAverage {
  subjectName: string;
  color: string;
  averagePercent: number | null;
  teacherName: string | null;
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
export interface Invoice {
  id: number;
  studentId: number;
  studentName: string;
  admissionNo: string;
  className: string | null;
  termId: number | null;
  title: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
}

export interface Payment {
  id: number;
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidOn: string;
  recordedByName: string | null;
}

export interface InvoiceDetail extends Invoice {
  payments: Payment[];
}

export interface InvoiceInput {
  studentIds?: number[];
  classId?: number;
  termId?: number | null;
  title: string;
  amount: number;
  dueDate: string;
  notes?: string | null;
}

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paidOn?: string;
}

export interface FeeSummary {
  billed: number;
  collected: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
}

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------
export interface Announcement {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  classId: number | null;
  className: string | null;
  pinned: boolean;
  authorId: number | null;
  authorName: string | null;
  createdAt: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: Audience;
  classId?: number | null;
  pinned?: boolean;
}

export interface SchoolEvent {
  id: number;
  title: string;
  description: string | null;
  type: EventType;
  startsOn: string;
  endsOn: string;
  location: string | null;
}

export interface EventInput {
  title: string;
  description?: string | null;
  type: EventType;
  startsOn: string;
  endsOn: string;
  location?: string | null;
}

export interface Message {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: Role;
  recipientId: number;
  recipientName: string;
  recipientRole: Role;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Contact extends PersonRef {
  role: Role;
  /** Why this person is reachable, e.g. "Mathematics teacher · Grade 10A" */
  context: string;
}

export interface MessageInput {
  recipientId: number;
  subject: string;
  body: string;
}

export interface Notifications {
  unreadMessages: number;
}

export interface SearchResults {
  students: { id: number; name: string; detail: string }[];
  teachers: { id: number; name: string; detail: string }[];
  parents: { id: number; name: string; detail: string }[];
  classes: { id: number; name: string; detail: string }[];
}

// ---------------------------------------------------------------------------
// Dashboards & overviews
// ---------------------------------------------------------------------------
export interface StudentOverview {
  student: StudentDetail;
  attendance: AttendanceSummary;
  recentAttendance: AttendanceRecord[];
  subjectAverages: SubjectAverage[];
  overallAverage: number | null;
  grades: StudentGrade[];
  upcoming: Assessment[];
  invoices: Invoice[];
  feeBalance: number;
}

export interface AdminDashboard {
  role: 'admin';
  counts: { students: number; teachers: number; parents: number; classes: number };
  attendanceToday: AttendanceSummary & { classesTaken: number; classesTotal: number };
  attendanceTrend: { date: string; rate: number | null }[];
  enrollmentByGrade: { gradeLevel: number; count: number }[];
  fees: FeeSummary;
  upcomingEvents: SchoolEvent[];
  announcements: Announcement[];
}

export interface TeacherDashboard {
  role: 'teacher';
  today: TimetableSlot[];
  courses: (Course & { averagePercent: number | null })[];
  toGrade: Assessment[];
  homeroom: { classId: number; className: string; studentCount: number; attendanceTaken: boolean } | null;
  upcomingEvents: SchoolEvent[];
  announcements: Announcement[];
}

export interface StudentDashboard {
  role: 'student';
  overview: StudentOverview;
  today: TimetableSlot[];
  upcomingEvents: SchoolEvent[];
  announcements: Announcement[];
}

export interface ChildSummary {
  student: StudentListItem;
  relationship: string;
  attendanceRate: number | null;
  overallAverage: number | null;
  feeBalance: number;
  upcomingCount: number;
}

export interface ParentDashboard {
  role: 'parent';
  children: ChildSummary[];
  upcomingEvents: SchoolEvent[];
  announcements: Announcement[];
}

export type Dashboard = AdminDashboard | TeacherDashboard | StudentDashboard | ParentDashboard;
