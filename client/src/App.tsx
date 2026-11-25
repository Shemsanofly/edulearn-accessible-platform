import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '../../shared/types';
import { Layout } from './components/Layout';
import { PageLoading } from './components/ui';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/Login';

// Pages are split into separate chunks so the first load stays small.
const page = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const DashboardPage = page(() => import('./pages/Dashboard'), 'DashboardPage');
const StudentsPage = page(() => import('./pages/StudentsPage'), 'StudentsPage');
const StudentProfilePage = page(() => import('./pages/StudentProfilePage'), 'StudentProfilePage');
const MyProgressPage = page(() => import('./pages/StudentProfilePage'), 'MyProgressPage');
const TeachersPage = page(() => import('./pages/TeachersPage'), 'TeachersPage');
const ParentsPage = page(() => import('./pages/ParentsPage'), 'ParentsPage');
const ClassesPage = page(() => import('./pages/ClassesPage'), 'ClassesPage');
const ClassDetailPage = page(() => import('./pages/ClassDetailPage'), 'ClassDetailPage');
const AcademicsPage = page(() => import('./pages/AcademicsPage'), 'AcademicsPage');
const MyClassesPage = page(() => import('./pages/MyClassesPage'), 'MyClassesPage');
const TimetablePage = page(() => import('./pages/TimetablePage'), 'TimetablePage');
const AttendancePage = page(() => import('./pages/AttendancePage'), 'AttendancePage');
const GradebookPage = page(() => import('./pages/GradebookPage'), 'GradebookPage');
const AssignmentsPage = page(() => import('./pages/AssignmentsPage'), 'AssignmentsPage');
const FeesPage = page(() => import('./pages/FeesPage'), 'FeesPage');
const AnnouncementsPage = page(() => import('./pages/AnnouncementsPage'), 'AnnouncementsPage');
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage');
const MessagesPage = page(() => import('./pages/MessagesPage'), 'MessagesPage');
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');
const NotFoundPage = page(() => import('./pages/NotFound'), 'NotFoundPage');

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Hide a route from roles that shouldn't see it. */
function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <NotFoundPage />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
                <Route path="students" element={<Only roles={['admin', 'teacher']}><StudentsPage /></Only>} />
                <Route path="students/:id" element={<StudentProfilePage />} />
                <Route path="progress" element={<Only roles={['student']}><MyProgressPage /></Only>} />
                <Route path="assignments" element={<Only roles={['student']}><AssignmentsPage /></Only>} />
                <Route path="teachers" element={<Only roles={['admin']}><TeachersPage /></Only>} />
                <Route path="parents" element={<Only roles={['admin']}><ParentsPage /></Only>} />
                <Route path="classes" element={<Only roles={['admin']}><ClassesPage /></Only>} />
                <Route path="classes/:id" element={<Only roles={['admin', 'teacher']}><ClassDetailPage /></Only>} />
                <Route path="academics" element={<Only roles={['admin']}><AcademicsPage /></Only>} />
                <Route path="my-classes" element={<Only roles={['teacher']}><MyClassesPage /></Only>} />
                <Route path="timetable" element={<TimetablePage />} />
                <Route path="attendance" element={<Only roles={['admin', 'teacher']}><AttendancePage /></Only>} />
                <Route path="gradebook" element={<Only roles={['admin', 'teacher']}><GradebookPage /></Only>} />
                <Route path="gradebook/:courseId" element={<Only roles={['admin', 'teacher']}><GradebookPage /></Only>} />
                <Route path="fees" element={<Only roles={['admin', 'student', 'parent']}><FeesPage /></Only>} />
                <Route path="announcements" element={<AnnouncementsPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="messages" element={<MessagesPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
