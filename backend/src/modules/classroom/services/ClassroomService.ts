import { inject, injectable } from 'inversify';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from 'routing-controllers';
import { CLASSROOM_TYPES } from '../types.js';
import type { IClassroomRepository } from '../repositories/interfaces/IClassroomRepository.js';
import {
  AssignCourseBody,
  ClassroomCourseResponse,
  ClassroomMemberResponse,
  ClassroomResponse,
  CreateClassroomBody,
  UpdateClassroomBody,
} from '../classes/validators/ClassroomValidators.js';
import { IClassroom, IClassroomCourse, IClassroomMember } from '#root/shared/interfaces/models.js';

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
      ...(body.start_date !== undefined ? { start_date: new Date(body.start_date) } : {}),
      ...(body.end_date !== undefined ? { end_date: new Date(body.end_date) } : {}),
    };
    const updated = await this.repo.update(id, updateData);
    if (!updated) throw new NotFoundError('Classroom not found');
    return this._toClassroomResponse(updated);
  }

  async deleteClassroom(id: string, instructorId: string): Promise<void> {
    await this._requireOwner(id, instructorId);
    // Cascade
    await this.repo.deleteMembersByClassroom(id);
    await this.repo.deleteCoursesByClassroom(id);
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
    if (existing) throw new BadRequestError('You have already joined this classroom.');

    const member: IClassroomMember = {
      classroomId: classroom._id!.toString(),
      studentId,
      joinedAt: new Date(),
    };
    await this.repo.addMember(member);
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
