/**
 * API contract shared by the server and the client.
 * Only types live here — import with `import type` so nothing is emitted at runtime.
 * Dates are ISO strings: `YYYY-MM-DD` for calendar days, full ISO for instants.
 */

export type Role = 'admin' | 'teacher' | 'student' | 'parent';
export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
/** A grade recorded without a score: the student missed it, or was excused from it. */
export type GradeStatus = 'absent' | 'exempt';
export type AssessmentType = 'assignment' | 'quiz' | 'test' | 'exam' | 'project';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'other';
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue';
export type Audience = 'everyone' | 'staff' | 'students' | 'parents' | 'class';
export type EventType = 'academic' | 'exam' | 'holiday' | 'meeting' | 'sports' | 'other';

export type Accent = 'teal' | 'navy' | 'ocean' | 'forest' | 'rose' | 'purple' | 'sunset' | 'indigo' | 'grape';
export type Language = 'en' | 'sw';

export interface Preferences {
  theme?: 'light' | 'dark' | 'system';
  accent?: Accent;
  language?: Language;
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
  photoUrl: string | null;
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
  photoUrl: string | null;
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
  photoUrl: string | null;
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
  photoUrl: string | null;
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
  academicYearId: number | null;
  academicYearName: string | null;
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
  examId: number | null;
  examName: string | null;
  fileCount: number;
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
  /** Assessments where the student is marked absent or exempt instead of having a score. */
  statuses: Record<number, GradeStatus>;
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
  status?: GradeStatus | null;
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
  status: GradeStatus | null;
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
  feeStructureId: number | null;
}

export interface Payment {
  id: number;
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidOn: string;
  recordedByName: string | null;
  receiptNo: string;
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
  unreadNotifications: number;
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
  /** Average % per subject in the latest published exam, for the performance overview. */
  performance: { examName: string | null; subjects: { subjectName: string; color: string; averagePercent: number | null }[] };
  recentActivity: AuditEntry[];
  newEnquiries: number;
  fees: FeeSummary;
  /** Counts used by the "Getting started" checklist for a new school. */
  setup: { terms: number; subjects: number; courses: number; lessons: number };
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

// ---------------------------------------------------------------------------
// School settings & public site
// ---------------------------------------------------------------------------
export interface SchoolSettings {
  name: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  currency: string;
  defaultLanguage: Language;
  /** What a class level is called, e.g. "Form" or "Standard". */
  levelLabel: string;
  logoUrl: string | null;
}

export type SchoolSettingsInput = Partial<Omit<SchoolSettings, 'logoUrl'>>;

export interface ContactRequestInput {
  /** Older records may be 'demo'; the website now only sends general enquiries. */
  kind?: 'contact' | 'demo';
  fullName: string;
  schoolName?: string | null;
  email: string;
  phone?: string | null;
  message: string;
}

export interface ContactRequest extends Required<Omit<ContactRequestInput, 'kind'>> {
  kind: 'contact' | 'demo';
  id: number;
  status: 'new' | 'contacted' | 'closed';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Academic years & grading
// ---------------------------------------------------------------------------
export interface AcademicYear {
  id: number;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  termCount: number;
}

export interface GradeBand {
  grade: string;
  minPercent: number;
  maxPercent: number;
  points: number | null;
  remark: string | null;
}

export interface GradingScale {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  bands: GradeBand[];
}

export interface GradingScaleInput {
  name: string;
  description?: string | null;
  isDefault?: boolean;
  bands: GradeBand[];
}

// ---------------------------------------------------------------------------
// Examinations & report cards
// ---------------------------------------------------------------------------
export interface Exam {
  id: number;
  name: string;
  termId: number | null;
  termName: string | null;
  gradingScaleId: number | null;
  gradingScaleName: string | null;
  startsOn: string;
  endsOn: string;
  maxMarks: number;
  publishedAt: string | null;
  classes: { id: number; name: string }[];
  /** Marks entered so far vs. expected (students × subjects). */
  marksEntered: number;
  marksExpected: number;
}

export interface ExamInput {
  name: string;
  termId?: number | null;
  gradingScaleId?: number | null;
  startsOn: string;
  endsOn: string;
  maxMarks?: number;
  classIds: number[];
}

export interface ExamPaper {
  assessmentId: number;
  courseId: number;
  classId: number;
  className: string;
  subjectName: string;
  color: string;
  teacherName: string | null;
  graded: number;
  students: number;
  averagePercent: number | null;
}

export interface ExamDetail extends Exam {
  papers: ExamPaper[];
}

export interface ReportCardSubject {
  subjectName: string;
  teacherName: string | null;
  marks: number | null;
  /** Set when the student was absent from, or exempt from, this paper. */
  status: GradeStatus | null;
  maxMarks: number;
  percent: number | null;
  grade: string | null;
  points: number | null;
  remark: string | null;
  classAverage: number | null;
}

export interface ReportCard {
  school: SchoolSettings;
  exam: Exam;
  student: StudentListItem;
  subjects: ReportCardSubject[];
  total: number;
  averagePercent: number | null;
  grade: string | null;
  position: number | null;
  classSize: number;
  attendance: AttendanceSummary;
  remark: string | null;
  bands: GradeBand[];
  /** Whether the viewer may write the class-teacher remark (admins and the student's class teacher). */
  canEditRemark: boolean;
}

export interface ReportCardSummary {
  examId: number;
  examName: string;
  termName: string | null;
  publishedAt: string;
  averagePercent: number | null;
  grade: string | null;
  position: number | null;
  classSize: number;
}

export interface ClassPerformance {
  exam: Exam;
  classId: number;
  className: string;
  subjects: { subjectName: string; color: string; averagePercent: number | null; graded: number; distribution: Record<string, number> }[];
  ranking: { studentId: number; name: string; admissionNo: string; total: number; averagePercent: number | null; grade: string | null; position: number; subjectsGraded: number }[];
  bands: GradeBand[];
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------
export interface FeeStructure {
  id: number;
  name: string;
  amount: number;
  level: number | null;
  termId: number | null;
  termName: string | null;
  dueDate: string;
  description: string | null;
  isActive: boolean;
  invoiceCount: number;
  collected: number;
}

export interface FeeStructureInput {
  name: string;
  amount: number;
  level?: number | null;
  termId?: number | null;
  dueDate: string;
  description?: string | null;
  isActive?: boolean;
}

export interface Receipt {
  school: SchoolSettings;
  payment: Payment;
  invoice: Invoice;
  balanceAfter: number;
}

// ---------------------------------------------------------------------------
// Assignments, notifications, audit
// ---------------------------------------------------------------------------
export interface AttachmentInfo {
  id: number;
  filename: string;
  mime: string;
  size: number;
  url: string;
  createdAt: string;
}

export type AssignmentStatus = 'marked' | 'overdue' | 'due_soon' | 'upcoming' | 'no_deadline';

export interface StudentAssignment extends Assessment {
  status: AssignmentStatus;
  score: number | null;
  percent: number | null;
  feedback: string | null;
  teacherName: string | null;
  files: AttachmentInfo[];
}

export type NotificationType = 'attendance' | 'results' | 'fees' | 'announcement' | 'assignment' | 'message' | 'system';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export interface AttendanceReportRow {
  studentId: number;
  name: string;
  admissionNo: string;
  className: string | null;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  rate: number | null;
}

export interface AttendanceReport {
  from: string;
  to: string;
  rows: AttendanceReportRow[];
  daily: { date: string; present: number; late: number; absent: number; excused: number; rate: number | null }[];
}

export interface FinancialReport {
  from: string;
  to: string;
  summary: FeeSummary;
  collectedInPeriod: number;
  byMonth: { month: string; collected: number }[];
  byMethod: { method: PaymentMethod; collected: number; count: number }[];
  byClass: { className: string; billed: number; collected: number; outstanding: number }[];
  payments: (Payment & { studentName: string; admissionNo: string; className: string | null; invoiceTitle: string })[];
}

export interface TeacherReportRow {
  id: number;
  name: string;
  employeeNo: string;
  specialization: string | null;
  homeroomClass: string | null;
  courses: number;
  classes: number;
  lessonsPerWeek: number;
  students: number;
  averagePercent: number | null;
  ungradedAssessments: number;
}

export interface StudentReportRow extends StudentListItem {
  guardians: string;
  guardianPhones: string;
  attendanceRate: number | null;
  averagePercent: number | null;
  feeBalance: number;
}

// ---------------------------------------------------------------------------
// Invitations & registration
// ---------------------------------------------------------------------------
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface InvitationDetails {
  classId?: number | null;
  children?: { studentId: number; relationship: string }[];
  specialization?: string | null;
}

export interface Invitation {
  id: number;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  details: InvitationDetails;
  /** Human-readable summary of the details, e.g. "Form 2A" or "Parent of Ali Juma". */
  detailSummary: string | null;
  message: string | null;
  status: InvitationStatus;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface InvitationInput {
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  details?: InvitationDetails;
  message?: string | null;
  /** Days until the link expires (1–30, default 14). */
  expiresInDays?: number;
}

/** Returned once when an invitation is created or re-sent: the only time the link is visible. */
export interface IssuedInvitation {
  invitation: Invitation;
  link: string;
  emailed: boolean;
}

/** What the registration page may show about an invitation before the account exists. */
export interface InvitationLookup {
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  schoolName: string;
  expiresAt: string;
  detailSummary: string | null;
}

export interface RegisterInput {
  token: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  password: string;
}

// ---------------------------------------------------------------------------
// Excel templates, import and export
// ---------------------------------------------------------------------------
export type ImportKind = 'marks' | 'attendance';
/** What saving would do to one row of the uploaded file. */
export type ImportAction = 'create' | 'update' | 'unchanged' | 'skip' | 'error';

/** A problem with the file, located by Excel row and column. */
export interface ImportIssue {
  row: number | null;
  column: string | null;
  admissionNo: string | null;
  studentName: string | null;
  message: string;
}

export interface ImportPreviewRow {
  row: number;
  studentId: number | null;
  admissionNo: string;
  studentName: string;
  action: ImportAction;
  /** The value now stored, and the value the import would store, as readable text. */
  before: string | null;
  after: string | null;
  /** Why the row is skipped or unchanged, when that isn't obvious. */
  note: string | null;
}

export interface ImportPreview {
  kind: ImportKind;
  /** One-line description of what the file is for, plus the details shown in the review. */
  title: string;
  details: { label: string; value: string }[];
  rows: ImportPreviewRow[];
  issues: ImportIssue[];
  /** Things worth knowing that don't block saving. */
  notices: string[];
  counts: { create: number; update: number; unchanged: number; skip: number; error: number };
  /** Students in the class who aren't in the file (they're left as they are). */
  notInFile: number;
  /** Identifies this exact review; saving refuses if the data changed since. */
  fingerprint: string;
  canSave: boolean;
  needsOverwriteConfirm: boolean;
}

export interface ImportResult {
  importId: number | null;
  created: number;
  updated: number;
  unchanged: number;
  title: string;
}
