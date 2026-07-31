import { inject, injectable } from 'inversify';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from 'routing-controllers';
import { CLASSROOM_TYPES } from '../types.js';
import type { IClassroomRepository } from '../repositories/interfaces/IClassroomRepository.js';
import { ObjectId } from 'mongodb';
import {
  AssignCourseBody,
  BatchAssignCourseBody,
  BatchAssignCourseResponse,
  ClassroomCourseResponse,
  ClassroomCourseStudentResponse,
  ClassroomMemberResponse,
  ClassroomResponse,
  CreateClassroomBody,
  StudentProgressItem,
  UpdateClassroomBody,
} from '../classes/validators/ClassroomValidators.js';
import { IClassroom, IClassroomCourse, IClassroomMember } from '#root/shared/interfaces/models.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { USERS_TYPES } from '#root/modules/users/types.js';
import { ICourseRepository } from '#root/shared/database/interfaces/ICourseRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { EnrollmentService } from '#root/modules/users/services/EnrollmentService.js';
import { EnrollmentRepository } from '#shared/database/providers/mongo/repositories/EnrollmentRepository.js';

import { AnnouncementRepository } from '../repositories/providers/mongodb/AnnouncementRepository.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { emitNewAnnouncement } from '#root/shared/socket/socket.js';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

@injectable()
export class ClassroomService {
  constructor(
    @inject(CLASSROOM_TYPES.ClassroomRepository)
    private readonly repo: IClassroomRepository,
    @inject(GLOBAL_TYPES.CourseRepo)
    private readonly courseRepo: ICourseRepository,
    @inject(USERS_TYPES.EnrollmentService)
    private readonly enrollmentService: EnrollmentService,
    @inject(USERS_TYPES.EnrollmentRepo)
    private readonly enrollmentRepo: EnrollmentRepository,
    @inject(GLOBAL_TYPES.UserRepo)
    private readonly userRepo: IUserRepository,
    @inject(CLASSROOM_TYPES.AnnouncementRepository)
    private readonly announcementRepo: AnnouncementRepository,
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}


  // ── Instructor ────────────────────────────────────────────────────────────

  async createClassroom(instructorId: string, body: CreateClassroomBody): Promise<ClassroomResponse> {
    // Generate a unique code (retry up to 5 times on collision)
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
      if (attempts > 5) throw new BadRequestError('Failed to generate unique code. Please try again.');
    } while (await this.repo.codeExists(code));

    const now = new Date();
    const classroom: IClassroom = {
      title: body.title,
      description: body.description,
      start_date: body.start_date ? new Date(body.start_date) : undefined,
      end_date: body.end_date ? new Date(body.end_date) : undefined,
      code,
      instructorId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repo.create(classroom);
    return this._toClassroomResponse(created);
  }

  async getMyClassrooms(instructorId: string): Promise<ClassroomResponse[]> {
    const classrooms = await this.repo.findByInstructorId(instructorId);
    return classrooms.map(this._toClassroomResponse);
  }

  async getClassroomById(id: string, requesterId: string): Promise<ClassroomResponse> {
    const classroom = await this._requireClassroom(id);
    // Allow owner or member
    if (classroom.instructorId !== requesterId) {
      const member = await this.repo.findMember(id, requesterId);
      if (!member) throw new ForbiddenError('Access denied to this classroom');
    }
    return this._toClassroomResponse(classroom);
  }

  async updateClassroom(
    id: string,
    instructorId: string,
    body: UpdateClassroomBody,
  ): Promise<ClassroomResponse> {
    await this._requireOwner(id, instructorId);
    const updateData: Partial<IClassroom> = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.streamPostingPermission !== undefined ? { streamPostingPermission: body.streamPostingPermission } : {}),
      ...(body.start_date !== undefined ? { start_date: new Date(body.start_date) } : {}),
      ...(body.end_date !== undefined ? { end_date: new Date(body.end_date) } : {}),
    };
    const updated = await this.repo.update(id, updateData);
    if (!updated) throw new NotFoundError('Classroom not found');
    return this._toClassroomResponse(updated);
  }

  async resetJoinCode(id: string, instructorId: string): Promise<ClassroomResponse> {
    await this._requireOwner(id, instructorId);
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
      if (attempts > 5) throw new BadRequestError('Failed to generate unique code. Please try again.');
    } while (await this.repo.codeExists(code));

    const updated = await this.repo.update(id, { code, updatedAt: new Date() });
    if (!updated) throw new NotFoundError('Classroom not found');
    return this._toClassroomResponse(updated);
  }

  async deleteClassroom(id: string, instructorId: string): Promise<void> {
    await this._requireOwner(id, instructorId);
    // Cascade delete members, courses, member enrollments, and artifacts
    await this.repo.deleteMembersByClassroom(id);
    await this.repo.deleteCoursesByClassroom(id);
    await this.repo.deleteMemberEnrollmentsByClassroom(id);
    await this.repo.delete(id);
  }

  async getStudents(classroomId: string, instructorId: string): Promise<ClassroomMemberResponse[]> {
    await this._requireOwner(classroomId, instructorId);
    const members = await this.repo.findMembersByClassroom(classroomId);
    return members.map(this._toMemberResponse);
  }

  // ── Student ───────────────────────────────────────────────────────────────

  async joinClassroom(code: string, studentId: string): Promise<ClassroomResponse> {
    if (!studentId || !studentId.trim()) {
      throw new UnauthorizedError('Invalid user session. Please log in again.');
    }
    const classroom = await this.repo.findByCode(code.toUpperCase());
    if (!classroom) throw new NotFoundError('Classroom not found. Check the code and try again.');

    const existing = await this.repo.findMember(classroom._id!.toString(), studentId);
    if (existing) {
      return this._toClassroomResponse(classroom);
    }

    const member: IClassroomMember = {
      classroomId: classroom._id!.toString(),
      studentId,
      joinedAt: new Date(),
    };
    try {
      await this.repo.addMember(member);
    } catch (err: any) {
      if (err?.code !== 11000) {
        throw err;
      }
    }
    return this._toClassroomResponse(classroom);
  }


  async getJoinedClassrooms(studentId: string): Promise<ClassroomResponse[]> {
    const entries = await this.repo.findClassroomsByStudent(studentId);
    return entries.map(({ classroom }) => this._toClassroomResponse(classroom));
  }

  // ── Courses ───────────────────────────────────────────────────────────────

  async assignCourse(
    classroomId: string,
    body: AssignCourseBody,
    instructorId: string,
  ): Promise<ClassroomCourseResponse> {
    await this._requireOwner(classroomId, instructorId);

    const existing = await this.repo.findCourseAssignment(classroomId, body.courseId);
    if (existing) throw new BadRequestError('Course is already assigned to this classroom.');

    const data: IClassroomCourse = {
      classroomId,
      courseId: body.courseId,
      versionId: body.versionId,
      assignedAt: new Date(),
    };
    const created = await this.repo.assignCourse(data);

    try {
      const courseDoc = await this.courseRepo.read(body.courseId);
      const courseTitle = courseDoc?.name || (courseDoc as any)?.title || 'New Course';

      const members = await this.repo.findMembersByClassroom(classroomId);
      if (members && members.length > 0) {
        const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
        const bulkOps = members.map((m) => ({
          updateOne: {
            filter: {
              student_id: m.studentId,
              classroom_id: classroomId,
              course_id: body.courseId,
            },
            update: {
              $set: {
                student_id: m.studentId,
                classroom_id: classroomId,
                course_id: body.courseId,
                version_id: body.versionId,
                source_classroom_id: classroomId,
                status: 'pending_acceptance',
                accepted: false,
                progress: 0,
                progress_percentage: 0,
                enrolled_at: new Date(),
              },
            },
            upsert: true,
          },
        }));
        await enrollmentsCol.bulkWrite(bulkOps);
      }

      const createdAnn = await this.announcementRepo.create({
        classroom_id: classroomId,
        author_id: instructorId,
        content: `🎉 Course Invitation: ${courseTitle}. Open the Courses tab to view and accept your enrollment!`,
        type: 'course_invitation',
        metadata: {
          course_id: body.courseId,
          courseId: body.courseId,
          course_title: courseTitle,
          courseTitle: courseTitle,
        },
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      emitNewAnnouncement(classroomId, createdAnn);
    } catch (err) {
      console.warn('Failed to post announcement for assignCourse:', err);
    }

    return this._toCourseResponse(created);
  }

  async removeCourse(classroomId: string, courseId: string, instructorId: string): Promise<void> {
    await this._requireOwner(classroomId, instructorId);
    await this.repo.removeCourse(classroomId, courseId);
  }

  async getClassroomCourses(
    classroomId: string,
    requesterId: string,
  ): Promise<ClassroomCourseResponse[]> {
    const classroom = await this._requireClassroom(classroomId);
    // Allow owner or member
    if (classroom.instructorId !== requesterId) {
      const member = await this.repo.findMember(classroomId, requesterId);
      if (!member) throw new ForbiddenError('Access denied to this classroom');
    }
    const courses = await this.repo.findCoursesByClassroom(classroomId);
    return courses.map(this._toCourseResponse);
  }

  // ── Multi-Classroom Course Assignment & Student Delivery ───────────────────

  async batchAssignCourse(
    instructorId: string,
    body: BatchAssignCourseBody,
  ): Promise<BatchAssignCourseResponse> {
    const { courseId, classroomIds } = body;
    if (!courseId || !Array.isArray(classroomIds) || classroomIds.length === 0) {
      throw new BadRequestError('courseId and a non-empty classroomIds array are required.');
    }

    const course = await this.courseRepo.read(courseId);
    if (!course) {
      throw new NotFoundError('Course not found.');
    }

    let versionId: string = '';
    if (course.versions && course.versions.length > 0) {
      try {
        const activeVersions = await this.courseRepo.getActiveVersions(
          course.versions.map(v => v ? v.toString() : '')
        );
        if (activeVersions && activeVersions.length > 0) {
          versionId = activeVersions[activeVersions.length - 1]._id?.toString() || '';
        } else {
          versionId = course.versions[course.versions.length - 1]?.toString() || '';
        }
      } catch {
        versionId = course.versions[course.versions.length - 1]?.toString() || '';
      }
    }
    if (!versionId) {
      throw new BadRequestError('Course has no published versions available.');
    }

    const assigned: Array<{ classroomId: string; courseId: string; versionId: string }> = [];
    const alreadyAssigned: Array<{ classroomId: string; courseId: string }> = [];
    const failed: Array<{ classroomId: string; reason: string }> = [];

    for (const classroomId of classroomIds) {
      try {
        const classroom = await this.repo.findById(classroomId);
        if (!classroom) {
          failed.push({ classroomId, reason: 'Classroom not found' });
          continue;
        }

        if (classroom.instructorId?.toString() !== instructorId) {
          failed.push({ classroomId, reason: 'Only classroom owner can assign courses' });
          continue;
        }

        const existing = await this.repo.findCourseAssignment(classroomId, courseId);
        if (existing) {
          alreadyAssigned.push({ classroomId, courseId });
          continue;
        }

        const data: IClassroomCourse = {
          classroomId,
          courseId,
          versionId,
          assignedAt: new Date(),
        };
        await this.repo.assignCourse(data);

        // Update classroom_member_enrollments for students in classroom
        try {
          const members = await this.repo.findMembersByClassroom(classroomId);
          if (members && members.length > 0) {
            const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
            const bulkOps = members.map((m) => ({
              updateOne: {
                filter: {
                  student_id: m.studentId,
                  classroom_id: classroomId,
                  course_id: courseId,
                },
                update: {
                  $set: {
                    student_id: m.studentId,
                    classroom_id: classroomId,
                    course_id: courseId,
                    version_id: versionId,
                    source_classroom_id: classroomId,
                    status: 'pending_acceptance',
                    accepted: false,
                    progress: 0,
                    progress_percentage: 0,
                    enrolled_at: new Date(),
                  },
                },
                upsert: true,
              },
            }));
            await enrollmentsCol.bulkWrite(bulkOps);
          }
        } catch (mErr) {
          console.warn('Failed to update classroom member enrollments:', mErr);
        }

        // Auto-create stream announcement for course invitation
        try {
          const realCourseId = course._id ? course._id.toString() : String(courseId);
          const courseTitle = course?.name || (course as any)?.title || 'Pushed Course';
          const createdAnn = await this.announcementRepo.create({
            classroom_id: classroomId,
            author_id: instructorId,
            content: `🎉 Course Invitation: ${courseTitle}. Open the Courses tab to view and accept your enrollment!`,
            type: 'course_invitation',
            referenceId: realCourseId,
            metadata: {
              course_id: realCourseId,
              courseId: realCourseId,
              course_title: courseTitle,
              courseTitle: courseTitle,
            },
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          emitNewAnnouncement(classroomId, createdAnn);
        } catch (annErr) {
          console.warn('Failed to auto-create stream announcement:', annErr);
        }

        assigned.push({ classroomId, courseId, versionId });
      } catch (err: any) {
        failed.push({ classroomId, reason: err.message || 'Failed to assign course' });
      }
    }

    return {
      success: true,
      assigned,
      alreadyAssigned,
      failed,
    };
  }

  async getStudentClassroomCoursesWithDetails(
    classroomId: string,
    requesterId: string,
  ): Promise<ClassroomCourseStudentResponse[]> {
    const classroom = await this._requireClassroom(classroomId);
    if (classroom.instructorId?.toString() !== requesterId) {
      const member = await this.repo.findMember(classroomId, requesterId);
      if (!member) throw new ForbiddenError('Access denied to this classroom');
    }

    const assignedCourses = await this.repo.findCoursesByClassroom(classroomId);
    const results: ClassroomCourseStudentResponse[] = [];

    for (const c of assignedCourses) {
      const courseIdStr = c.courseId?.toString() || '';
      const versionIdStr = c.versionId?.toString() || '';

      let courseName = 'Assigned Course';
      let courseDescription = '';

      if (courseIdStr) {
        try {
          const courseDoc = await this.courseRepo.read(courseIdStr);
          if (courseDoc) {
            courseName = courseDoc.name || courseName;
            courseDescription = courseDoc.description || '';
          }
        } catch {
          // ignore read failure
        }
      }

      let isEnrolled = false;
      let progressPercentage = 0;

      if (requesterId && courseIdStr && versionIdStr) {
        try {
          const enrollment = await this.enrollmentRepo.findEnrollment(
            requesterId,
            courseIdStr,
            versionIdStr,
          );
          if (enrollment && enrollment.status === 'ACTIVE') {
            isEnrolled = true;
            progressPercentage = enrollment.percentCompleted ?? enrollment.progress_percentage ?? 0;
          }
        } catch {
          // ignore
        }
      }

      results.push({
        _id: c._id?.toString(),
        classroomId: c.classroomId?.toString() ?? '',
        courseId: courseIdStr,
        versionId: versionIdStr,
        courseName,
        courseDescription,
        assignedAt: c.assignedAt,
        isEnrolled,
        progressPercentage,
      });
    }

    return results;
  }

  async startClassroomCourse(
    classroomId: string,
    studentId: string,
    courseId: string,
  ): Promise<{ success: boolean; courseId: string; versionId: string }> {
    const member = await this.repo.findMember(classroomId, studentId);
    if (!member) {
      throw new ForbiddenError('You are not a member of this classroom.');
    }

    let assignment = await this.repo.findCourseAssignment(classroomId, courseId);
    if (!assignment) {
      const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
      const studentObjId = ObjectId.isValid(studentId) ? new ObjectId(studentId) : studentId;
      const courseObjId = ObjectId.isValid(courseId) ? new ObjectId(courseId) : courseId;
      const cDoc = await enrollmentsCol.findOne({
        student_id: { $in: [studentId, studentObjId] },
        classroom_id: { $in: [classroomId, ObjectId.isValid(classroomId) ? new ObjectId(classroomId) : classroomId] },
        course_id: { $in: [courseId, courseObjId] },
      });
      if (cDoc) {
        assignment = {
          classroomId,
          courseId,
          versionId: cDoc.version_id || courseId,
          assignedAt: cDoc.enrolled_at || new Date(),
        };
      }
    }

    if (!assignment) {
      throw new NotFoundError('Course is not assigned to this classroom.');
    }

    const versionId = assignment.versionId ? assignment.versionId.toString() : courseId;

    await this.enrollmentService.enrollUser(
      studentId,
      courseId,
      versionId,
      'STUDENT',
    );

    try {
      const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
      await enrollmentsCol.updateOne(
        { student_id: studentId, classroom_id: classroomId, course_id: courseId },
        { $set: { status: 'accepted', accepted: true, accepted_at: new Date() } },
        { upsert: true }
      );
    } catch (eErr) {
      console.warn('Failed to update classroom member enrollment status:', eErr);
    }

    return {
      success: true,
      courseId,
      versionId,
    };
  }

  async getClassroomCourseProgress(
    classroomId: string,
    instructorId: string,
    courseId: string,
  ): Promise<StudentProgressItem[]> {
    await this._requireOwner(classroomId, instructorId);

    const assignment = await this.repo.findCourseAssignment(classroomId, courseId);
    if (!assignment) {
      throw new NotFoundError('Course is not assigned to this classroom.');
    }

    const versionId = assignment.versionId.toString();
    const members = await this.repo.findMembersByClassroom(classroomId);
    const progressList: StudentProgressItem[] = [];

    for (const member of members) {
      const sId = member.studentId.toString();
      let studentName = 'Student';
      let studentEmail = '';

      if (sId) {
        try {
          const userDoc = await this.userRepo.findById(sId);
          if (userDoc) {
            studentName = `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || userDoc.email || 'Student';
            studentEmail = userDoc.email || '';
          }
        } catch {
          // ignore error
        }
      }

      let isEnrolled = false;
      let progressPercentage = 0;
      let completedItemsCount = 0;

      try {
        const enrollment = await this.enrollmentRepo.findEnrollment(sId, courseId, versionId);
        if (enrollment && enrollment.status === 'ACTIVE') {
          isEnrolled = true;
          progressPercentage = enrollment.percentCompleted ?? enrollment.progress_percentage ?? 0;
          completedItemsCount = enrollment.completedItemsCount ?? 0;
        }
      } catch {
        // ignore
      }

      progressList.push({
        studentId: sId,
        studentName,
        studentEmail,
        isEnrolled,
        progressPercentage,
        completedItemsCount,
      });
    }

    return progressList;
  }


  // ── Helpers ───────────────────────────────────────────────────────────────

  private async _requireClassroom(id: string): Promise<IClassroom> {
    const classroom = await this.repo.findById(id);
    if (!classroom) throw new NotFoundError('Classroom not found');
    return classroom;
  }

  private async _requireOwner(id: string, instructorId: string): Promise<IClassroom> {
    const classroom = await this._requireClassroom(id);
    if (classroom.instructorId?.toString() !== instructorId) {
      throw new ForbiddenError('Only the classroom owner can perform this action');
    }
    return classroom;
  }

  private _toClassroomResponse = (c: IClassroom): ClassroomResponse => ({
    _id: c._id?.toString() ?? '',
    title: c.title,
    description: c.description,
    code: c.code,
    instructorId: c.instructorId?.toString() ?? '',
    status: c.status,
    streamPostingPermission: c.streamPostingPermission || 'everyone',
    start_date: c.start_date,
    end_date: c.end_date,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });

  private _toMemberResponse = (m: IClassroomMember): ClassroomMemberResponse => ({
    _id: m._id?.toString(),
    classroomId: m.classroomId?.toString() ?? '',
    studentId: m.studentId?.toString() ?? '',
    joinedAt: m.joinedAt,
  });

  private _toCourseResponse = (c: IClassroomCourse): ClassroomCourseResponse => ({
    _id: c._id?.toString(),
    classroomId: c.classroomId?.toString() ?? '',
    courseId: c.courseId?.toString() ?? '',
    versionId: c.versionId?.toString() ?? '',
    assignedAt: c.assignedAt,
  });
}
