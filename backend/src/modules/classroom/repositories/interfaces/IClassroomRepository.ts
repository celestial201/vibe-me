import { IClassroom, IClassroomCourse, IClassroomMember } from '#root/shared/interfaces/models.js';

export interface IClassroomRepository {
  // ── Classroom CRUD ──────────────────────────────────────────────────────────
  create(data: IClassroom): Promise<IClassroom>;
  findById(id: string): Promise<IClassroom | null>;
  findByCode(code: string): Promise<IClassroom | null>;
  findByInstructorId(instructorId: string): Promise<IClassroom[]>;
  update(id: string, data: Partial<IClassroom>): Promise<IClassroom | null>;
  delete(id: string): Promise<void>;

  // ── Members ─────────────────────────────────────────────────────────────────
  addMember(member: IClassroomMember): Promise<IClassroomMember>;
  findMember(classroomId: string, studentId: string): Promise<IClassroomMember | null>;
  findMembersByClassroom(classroomId: string): Promise<IClassroomMember[]>;
  findClassroomsByStudent(studentId: string): Promise<{ classroom: IClassroom; joinedAt: Date }[]>;

  // ── Courses ─────────────────────────────────────────────────────────────────
  assignCourse(data: IClassroomCourse): Promise<IClassroomCourse>;
  findCourseAssignment(classroomId: string, courseId: string): Promise<IClassroomCourse | null>;
  findCoursesByClassroom(classroomId: string): Promise<IClassroomCourse[]>;
  removeCourse(classroomId: string, courseId: string): Promise<void>;

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  deleteMembersByClassroom(classroomId: string): Promise<void>;
  deleteCoursesByClassroom(classroomId: string): Promise<void>;

  // ── Utility ─────────────────────────────────────────────────────────────────
  codeExists(code: string): Promise<boolean>;
}
