import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '../../shared/types';
import { Layout } from './components/Layout';
import { PageLoading } from './components/ui';
import { useAuth } from './lib/auth';

// Pages are split into separate chunks so the first load stays small.
const page = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

// Public
const LandingPage = page(() => import('./pages/Landing'), 'LandingPage');
const LoginPage = page(() => import('./pages/Login'), 'LoginPage');
const ForgotPasswordPage = page(() => import('./pages/ForgotPassword'), 'ForgotPasswordPage');
const ResetPasswordPage = page(() => import('./pages/ForgotPassword'), 'ResetPasswordPage');

// Everyone signed in
const DashboardPage = page(() => import('./pages/Dashboard'), 'DashboardPage');
const TimetablePage = page(() => import('./pages/TimetablePage'), 'TimetablePage');
const AnnouncementsPage = page(() => import('./pages/AnnouncementsPage'), 'AnnouncementsPage');
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage');
const MessagesPage = page(() => import('./pages/MessagesPage'), 'MessagesPage');
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');
const NotificationsPage = page(() => import('./pages/NotificationsPage'), 'NotificationsPage');
const StudentProfilePage = page(() => import('./pages/StudentProfilePage'), 'StudentProfilePage');
const ReportCardPage = page(() => import('./pages/ReportCardsPage'), 'ReportCardPage');
const NotFoundPage = page(() => import('./pages/NotFound'), 'NotFoundPage');

// Students & parents
const MyProgressPage = page(() => import('./pages/StudentProfilePage'), 'MyProgressPage');
const ReportCardsPage = page(() => import('./pages/ReportCardsPage'), 'ReportCardsPage');
const AssignmentsPage = page(() => import('./pages/AssignmentsPage'), 'AssignmentsPage');
const ReceiptPage = page(() => import('./pages/ReceiptPage'), 'ReceiptPage');
const FeesPage = page(() => import('./pages/FeesPage'), 'FeesPage');

// Staff
const StudentsPage = page(() => import('./pages/StudentsPage'), 'StudentsPage');
const ClassDetailPage = page(() => import('./pages/ClassDetailPage'), 'ClassDetailPage');
const MyClassesPage = page(() => import('./pages/MyClassesPage'), 'MyClassesPage');
const AttendancePage = page(() => import('./pages/AttendancePage'), 'AttendancePage');
const GradebookPage = page(() => import('./pages/GradebookPage'), 'GradebookPage');
const ExamsPage = page(() => import('./pages/ExamsPage'), 'ExamsPage');
const ExamDetailPage = page(() => import('./pages/ExamsPage'), 'ExamDetailPage');
const ReportsPage = page(() => import('./pages/ReportsPage'), 'ReportsPage');

// Administrators
const TeachersPage = page(() => import('./pages/TeachersPage'), 'TeachersPage');
const ParentsPage = page(() => import('./pages/ParentsPage'), 'ParentsPage');
const ClassesPage = page(() => import('./pages/ClassesPage'), 'ClassesPage');
const AcademicsPage = page(() => import('./pages/AcademicsPage'), 'AcademicsPage');
const EnquiriesPage = page(() => import('./pages/EnquiriesPage'), 'EnquiriesPage');
const AuditLogPage = page(() => import('./pages/AuditLogPage'), 'AuditLogPage');
const SchoolSettingsPage = page(() => import('./pages/SchoolSettingsPage'), 'SchoolSettingsPage');

/** Signed-out visitors to "/" see the public website; everywhere else sends them to sign in. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) {
    if (location.pathname === '/') return <LandingPage />;
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

/** Hide a route from roles that shouldn't see it (the server enforces the same rules). */
function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <NotFoundPage />;
  return children;
}

const ADMIN: Role[] = ['admin'];
const STAFF: Role[] = ['admin', 'teacher'];
const FAMILY: Role[] = ['student', 'parent'];

export function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/home" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route index element={<DashboardPage />} />
                  {/* Everyone */}
                  <Route path="timetable" element={<TimetablePage />} />
                  <Route path="announcements" element={<AnnouncementsPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="messages" element={<MessagesPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="students/:id" element={<StudentProfilePage />} />
                  <Route path="report-cards/:examId/:studentId" element={<ReportCardPage />} />
                  {/* Students & parents */}
                  <Route path="progress" element={<Only roles={['student']}><MyProgressPage /></Only>} />
                  <Route path="report-cards" element={<Only roles={FAMILY}><ReportCardsPage /></Only>} />
                  <Route path="assignments" element={<Only roles={FAMILY}><AssignmentsPage /></Only>} />
                  <Route path="receipts/:paymentId" element={<Only roles={['admin', 'student', 'parent']}><ReceiptPage /></Only>} />
                  <Route path="fees" element={<Only roles={['admin', 'student', 'parent']}><FeesPage /></Only>} />
                  {/* Staff */}
                  <Route path="students" element={<Only roles={STAFF}><StudentsPage /></Only>} />
                  <Route path="classes/:id" element={<Only roles={STAFF}><ClassDetailPage /></Only>} />
                  <Route path="my-classes" element={<Only roles={['teacher']}><MyClassesPage /></Only>} />
                  <Route path="attendance" element={<Only roles={STAFF}><AttendancePage /></Only>} />
                  <Route path="gradebook" element={<Only roles={STAFF}><GradebookPage /></Only>} />
                  <Route path="gradebook/:courseId" element={<Only roles={STAFF}><GradebookPage /></Only>} />
                  <Route path="exams" element={<Only roles={STAFF}><ExamsPage /></Only>} />
                  <Route path="exams/:id" element={<Only roles={STAFF}><ExamDetailPage /></Only>} />
                  <Route path="reports" element={<Only roles={STAFF}><ReportsPage /></Only>} />
                  {/* Administrators */}
                  <Route path="teachers" element={<Only roles={ADMIN}><TeachersPage /></Only>} />
                  <Route path="parents" element={<Only roles={ADMIN}><ParentsPage /></Only>} />
                  <Route path="classes" element={<Only roles={ADMIN}><ClassesPage /></Only>} />
                  <Route path="academics" element={<Only roles={ADMIN}><AcademicsPage /></Only>} />
                  <Route path="enquiries" element={<Only roles={ADMIN}><EnquiriesPage /></Only>} />
                  <Route path="audit-log" element={<Only roles={ADMIN}><AuditLogPage /></Only>} />
                  <Route path="school-settings" element={<Only roles={ADMIN}><SchoolSettingsPage /></Only>} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
