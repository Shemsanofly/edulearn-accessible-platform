import type { SessionUser } from '../../../shared/types.js';
import { queryOne } from '../db/pool.js';
import { forbidden, notFound } from './http.js';

/** Can this user see a student's record (grades, attendance, fees)? */
export async function canViewStudent(user: SessionUser, studentId: number): Promise<boolean> {
  switch (user.role) {
    case 'admin':
      return true;
    case 'student':
      return user.id === studentId;
    case 'parent':
      return !!(await queryOne('SELECT 1 FROM guardians WHERE parent_id = $1 AND student_id = $2', [user.id, studentId]));
    case 'teacher':
      return !!(await queryOne(
        `SELECT 1 FROM students s
           JOIN classes c ON c.id = s.class_id
          WHERE s.user_id = $2
            AND (c.homeroom_teacher_id = $1
                 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1))`,
        [user.id, studentId],
      ));
  }
}

export async function assertCanViewStudent(user: SessionUser, studentId: number) {
  const exists = await queryOne('SELECT 1 FROM students WHERE user_id = $1', [studentId]);
  if (!exists) throw notFound('Student');
  if (!(await canViewStudent(user, studentId))) throw forbidden("You don't have access to this student");
}

/** Can this user manage assessments and grades for a course? */
export async function assertCanManageCourse(user: SessionUser, courseId: number) {
  const course = await queryOne<{ teacherId: number | null }>('SELECT teacher_id FROM class_subjects WHERE id = $1', [courseId]);
  if (!course) throw notFound('Course');
  if (user.role === 'admin') return;
  if (user.role === 'teacher' && course.teacherId === user.id) return;
  throw forbidden('Only the teacher of this course can do that');
}

/** Teachers may view courses in classes they teach; students the courses of their own class. */
export async function assertCanViewCourse(user: SessionUser, courseId: number) {
  const course = await queryOne<{ teacherId: number | null; classId: number; homeroomTeacherId: number | null }>(
    `SELECT cs.teacher_id, cs.class_id, c.homeroom_teacher_id
       FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE cs.id = $1`,
    [courseId],
  );
  if (!course) throw notFound('Course');
  if (user.role === 'admin') return;
  if (user.role === 'teacher' && (course.teacherId === user.id || course.homeroomTeacherId === user.id)) return;
  throw forbidden("You don't have access to this course");
}

/** Homeroom teachers and anyone teaching the class can take its register. */
export async function assertCanTakeAttendance(user: SessionUser, classId: number) {
  const cls = await queryOne<{ homeroomTeacherId: number | null }>('SELECT homeroom_teacher_id FROM classes WHERE id = $1', [classId]);
  if (!cls) throw notFound('Class');
  if (user.role === 'admin') return;
  if (user.role === 'teacher') {
    if (cls.homeroomTeacherId === user.id) return;
    const teaches = await queryOne('SELECT 1 FROM class_subjects WHERE class_id = $1 AND teacher_id = $2', [classId, user.id]);
    if (teaches) return;
  }
  throw forbidden('Only teachers of this class can take its register');
}
