import { inject, injectable } from 'inversify';
import { BadRequestError, ForbiddenError, NotFoundError } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import { safeObjectId } from '#root/shared/functions/idNormalizer.js';
import { appConfig } from '#root/config/app.js';
import { CLASSROOM_TYPES } from '../types.js';
import { ClassroomRepository } from '../repositories/providers/mongodb/ClassroomRepository.js';
import { AnnouncementRepository } from '../repositories/providers/mongodb/AnnouncementRepository.js';
import { AssignmentRepository } from '../repositories/providers/mongodb/AssignmentRepository.js';
import { SubmissionRepository } from '../repositories/providers/mongodb/SubmissionRepository.js';
import { JournalRepository } from '../repositories/providers/mongodb/JournalRepository.js';
import { NotificationRepository } from '../repositories/providers/mongodb/NotificationRepository.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { MailService } from '#root/modules/notifications/services/MailService.js';
import { NOTIFICATIONS_TYPES } from '#root/modules/notifications/types.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {
  AnnouncementResponse,
  AssignmentResponse,
  CreateAnnouncementBody,
  CreateAssignmentBody,
  GradeSubmissionBody,
  PushCourseBody,
  StudentAnalyticsRosterDTO,
  StudentInsightsResponse,
  SubmissionResponse,
} from '../classes/validators/LmsValidators.js';
import {
  emitNewAnnouncement,
  emitStreamUpdated,
  emitNewAssignment,
  emitSubmissionStatusChanged,
  emitNewNotification,
  emitCoursePushed,
  emitEnrollmentAccepted,
} from '#root/shared/socket/socket.js';
import {
  IClassroom,
  IClassroomAnnouncement,
  IClassroomAssignment,
  IClassroomSubmission,
  IDailyJournal,
  INotification,
} from '#root/shared/interfaces/models.js';

function parseDueDate(dateStr: any): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr).trim();

  // Match DD-MM-YYYY HH:mm or DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/);
  if (ddmmyyyy) {
    const [, day, month, year, hours = '23', minutes = '59'] = ddmmyyyy;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

@injectable()
export class ClassroomLmsService {
  constructor(
    @inject(CLASSROOM_TYPES.ClassroomRepository)
    private readonly classroomRepo: ClassroomRepository,
    @inject(CLASSROOM_TYPES.AnnouncementRepository)
    private readonly announcementRepo: AnnouncementRepository,
    @inject(CLASSROOM_TYPES.AssignmentRepository)
    private readonly assignmentRepo: AssignmentRepository,
    @inject(CLASSROOM_TYPES.SubmissionRepository)
    private readonly submissionRepo: SubmissionRepository,
    @inject(CLASSROOM_TYPES.JournalRepository)
    private readonly journalRepo: JournalRepository,
    @inject(CLASSROOM_TYPES.NotificationRepository)
    private readonly notificationRepo: NotificationRepository,
    @inject(GLOBAL_TYPES.UserRepo)
    private readonly userRepo: IUserRepository,
    @inject(NOTIFICATIONS_TYPES.MailService)
    private readonly mailService: MailService,
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  private async _requireClassroom(id: string): Promise<IClassroom> {
    const classroom = await this.classroomRepo.findById(id);
    if (!classroom) throw new NotFoundError('Classroom not found');
    return classroom;
  }

  private async _requireMemberOrOwner(classroomId: string, userId: string): Promise<void> {
    const classroom = await this._requireClassroom(classroomId);
    if (classroom.instructorId === userId) return;
    const member = await this.classroomRepo.findMember(classroomId, userId);
    if (!member) throw new ForbiddenError('You are not a member of this classroom');
  }

  private async _requireOwner(classroomId: string, userId: string): Promise<void> {
    const classroom = await this._requireClassroom(classroomId);
    if (classroom.instructorId !== userId) {
      throw new ForbiddenError('Only the classroom instructor can perform this action');
    }
  }

  // ── Stream / Announcements ───────────────────────────────────────────────────

  async createAnnouncement(
    classroomId: string,
    authorId: string,
    body: CreateAnnouncementBody,
    attachments: string[] = [],
  ): Promise<AnnouncementResponse & { status?: string }> {
    await this._requireMemberOrOwner(classroomId, authorId);
    const classroom = await this._requireClassroom(classroomId);

    const isInstructor = classroom.instructorId?.toString() === authorId;
    const authorUser = await this.userRepo.findById(authorId).catch(() => null);
    const isStudentRole = authorUser?.role === 'student' || (!isInstructor && authorUser?.role !== 'teacher');
    const streamPermission = (classroom as any).streamPostingPermission || (classroom as any).stream_posting_permission || 'everyone';

    if (isStudentRole && streamPermission === 'teacher_only') {
      throw new ForbiddenError('Posting in this classroom stream is restricted to teachers only.');
    }

    // Direct approval: remove approval requirement when Open Post mode is active
    const status = 'approved';

    const created = await this.announcementRepo.create({
      classroom_id: classroomId,
      author_id: authorId,
      content: body.content,
      attachments,
      status,
    });

    const response: AnnouncementResponse & { status?: string } = {
      _id: created._id?.toString() ?? '',
      classroom_id: created.classroom_id?.toString() ?? '',
      author_id: created.author_id?.toString() ?? '',
      content: created.content,
      attachments: created.attachments,
      status: created.status,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      authorName: authorUser ? `${authorUser.firstName} ${authorUser.lastName || ''}`.trim() : 'User',
    };

    // Emit real-time announcement to room for immediate chat/stream update
    emitNewAnnouncement(classroomId, response);

    // Save in-app notifications and emit real-time notifications to classroom members
    const members = await this.classroomRepo.findMembersByClassroom(classroomId);
    const studentNotifications: Partial<INotification>[] = members.map((m) => ({
      user_id: m.studentId.toString(),
      classroom_id: classroomId,
      type: 'new_announcement',
      message: `New announcement in "${classroom.title}": "${body.content.slice(0, 50)}..."`,
      link: `/classroom/${classroomId}`,
    }));

    if (studentNotifications.length > 0) {
      await this.notificationRepo.createBulk(studentNotifications);
      members.forEach((m) => {
        const sid = m.studentId.toString();
        emitNewNotification(sid, {
          type: 'new_announcement',
          message: `New announcement in "${classroom.title}"`,
          link: `/classroom/${classroomId}`,
        });
      });
    }

    return response;
  }

  async getAnnouncements(classroomId: string, userId: string): Promise<AnnouncementResponse[]> {
    await this._requireMemberOrOwner(classroomId, userId);
    const announcements = await this.announcementRepo.findByClassroom(classroomId);
    const results: AnnouncementResponse[] = [];
    for (const a of announcements) {
      const author = await this.userRepo.findById(a.author_id.toString()).catch(() => null);
      results.push({
        _id: a._id?.toString() ?? '',
        classroom_id: a.classroom_id?.toString() ?? '',
        author_id: a.author_id?.toString() ?? '',
        content: a.content,
        attachments: a.attachments,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        authorName: author ? `${author.firstName} ${author.lastName || ''}`.trim() : 'User',
      });
    }
    return results;
  }

  async getPendingAnnouncements(classroomId: string, instructorId: string): Promise<AnnouncementResponse[]> {
    await this._requireOwner(classroomId, instructorId);
    const announcements = await this.announcementRepo.findPendingByClassroom(classroomId);
    const results: AnnouncementResponse[] = [];
    for (const a of announcements) {
      const author = await this.userRepo.findById(a.author_id.toString()).catch(() => null);
      results.push({
        _id: a._id?.toString() ?? '',
        classroom_id: a.classroom_id?.toString() ?? '',
        author_id: a.author_id?.toString() ?? '',
        content: a.content,
        attachments: a.attachments,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        authorName: author ? `${author.firstName} ${author.lastName || ''}`.trim() : 'Student',
      });
    }
    return results;
  }

  async moderateAnnouncement(
    classroomId: string,
    instructorId: string,
    announcementId: string,
    action: 'approve' | 'reject'
  ) {
    await this._requireOwner(classroomId, instructorId);
    const targetStatus = action === 'approve' ? 'approved' : 'rejected';
    const updated = await this.announcementRepo.updateStatus(announcementId, targetStatus);
    if (!updated) throw new NotFoundError('Announcement not found');

    const classroom = await this._requireClassroom(classroomId);

    if (targetStatus === 'approved') {
      emitStreamUpdated(classroomId, { announcementId, status: 'approved' });

      // Trigger 3: Teacher approves Announcement -> Notify all students
      const members = await this.classroomRepo.findMembersByClassroom(classroomId);
      const studentNotifications: Partial<INotification>[] = members.map((m) => ({
        user_id: m.studentId.toString(),
        classroom_id: classroomId,
        type: 'new_announcement',
        message: `New announcement approved in "${classroom.title}"`,
        link: `/classroom/${classroomId}`,
      }));

      if (studentNotifications.length > 0) {
        await this.notificationRepo.createBulk(studentNotifications);
        members.forEach((m) => {
          const sid = m.studentId.toString();
          emitNewNotification(sid, {
            type: 'new_announcement',
            message: `New announcement approved in "${classroom.title}"`,
            link: `/classroom/${classroomId}`,
          });
        });
      }
    }

    return updated;
  }

  // ── Classwork / Assignments ──────────────────────────────────────────────────

  async createAssignment(
    classroomId: string,
    instructorId: string,
    body: any,
    attachments: string[] = [],
  ): Promise<AssignmentResponse> {
    await this._requireOwner(classroomId, instructorId);
    const classroom = await this._requireClassroom(classroomId);

    const title = body?.title || 'Untitled Assignment';
    const description = body?.instructions || body?.description || '';
    const rawPoints = body?.points;
    const points = rawPoints !== undefined && rawPoints !== '' ? Number(rawPoints) : 100;
    const dueDateStr = body?.dueDate || body?.due_date;
    const dueDate = parseDueDate(dueDateStr);

    const created = await this.assignmentRepo.create({
      classroom_id: classroomId,
      instructor_id: instructorId,
      title,
      description,
      points,
      due_date: dueDate,
      attachments,
    });

    const response: AssignmentResponse = {
      _id: created._id?.toString() ?? '',
      classroom_id: created.classroom_id?.toString() ?? '',
      instructor_id: created.instructor_id?.toString() ?? '',
      title: created.title,
      description: created.description,
      points: created.points,
      due_date: created.due_date,
      attachments: created.attachments,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    try {
      emitNewAssignment(classroomId, response);

      const members = await this.classroomRepo.findMembersByClassroom(classroomId);
      if (members && members.length > 0) {
        const studentNotifications: Partial<INotification>[] = members.map((m) => ({
          user_id: m.studentId.toString(),
          classroom_id: classroomId,
          type: 'new_assignment',
          message: `New assignment: "${title}" in "${classroom.title}"`,
          link: `/classroom/${classroomId}`,
        }));

        await this.notificationRepo.createBulk(studentNotifications);
        members.forEach((m) => {
          const sid = m.studentId.toString();
          emitNewNotification(sid, {
            type: 'new_assignment',
            message: `New assignment: "${title}" in "${classroom.title}"`,
            link: `/classroom/${classroomId}`,
          });
        });
      }
    } catch (notifErr) {
      console.warn('Assignment created, notification note:', notifErr);
    }

    return response;
  }

  async getAssignments(classroomId: string, userId: string): Promise<AssignmentResponse[]> {
    await this._requireMemberOrOwner(classroomId, userId);
    const assignments = await this.assignmentRepo.findByClassroom(classroomId);
    return assignments.map(a => ({
      _id: a._id?.toString() ?? '',
      classroom_id: a.classroom_id?.toString() ?? '',
      instructor_id: a.instructor_id?.toString() ?? '',
      title: a.title,
      description: a.description,
      points: a.points,
      due_date: a.due_date,
      attachments: a.attachments,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
  }

  // ── 2-Month Internship Journey Calendar ──────────────────────────────────────

  async getInternshipCalendar(classroomId: string, userId: string) {
    await this._requireMemberOrOwner(classroomId, userId);
    const classroom = await this._requireClassroom(classroomId);

    const startDate = classroom.internship_start_date
      ? new Date(classroom.internship_start_date)
      : classroom.createdAt
      ? new Date(classroom.createdAt)
      : new Date();

    const endDate = classroom.internship_end_date
      ? new Date(classroom.internship_end_date)
      : new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);

    const journalEntries = await this.journalRepo.findByClassroom(classroomId);
    const journalMap = new Map<number, IDailyJournal>();
    journalEntries.forEach(j => journalMap.set(j.day_number, j));

    const days = [];
    for (let day = 1; day <= 60; day++) {
      const dayDate = new Date(startDate.getTime() + (day - 1) * 24 * 60 * 60 * 1000);
      days.push({
        day_number: day,
        date: dayDate,
        journal: journalMap.get(day) || null,
      });
    }

    return {
      classroom_id: classroom._id?.toString(),
      internship_start_date: startDate,
      internship_end_date: endDate,
      days,
    };
  }

  async upsertDailyJournal(
    classroomId: string,
    instructorId: string,
    dayNumber: number,
    data: { title?: string; content_link?: string; journal_entry?: string }
  ) {
    await this._requireOwner(classroomId, instructorId);
    const classroom = await this._requireClassroom(classroomId);
    const startDate = classroom.internship_start_date
      ? new Date(classroom.internship_start_date)
      : new Date();

    const dayDate = new Date(startDate.getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000);

    return this.journalRepo.upsertJournal(classroomId, dayNumber, {
      ...data,
      date: dayDate,
    });
  }

  // ── Submissions & Grading ───────────────────────────────────────────────────

  async submitAssignment(
    classroomId: string,
    assignmentId: string,
    studentId: string,
    submittedFiles: string[] = [],
  ): Promise<SubmissionResponse> {
    await this._requireMemberOrOwner(classroomId, studentId);
    const assignment = await this.assignmentRepo.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const submission = await this.submissionRepo.upsertSubmission(
      assignmentId,
      classroomId,
      studentId,
      submittedFiles,
    );

    const student = await this.userRepo.findById(studentId).catch(() => null);
    const response: SubmissionResponse = {
      _id: submission._id?.toString() ?? '',
      assignment_id: submission.assignment_id?.toString() ?? '',
      classroom_id: submission.classroom_id?.toString() ?? '',
      student_id: submission.student_id?.toString() ?? '',
      status: submission.status,
      submitted_files: submission.submitted_files,
      grade: submission.grade,
      teacher_feedback: submission.teacher_feedback,
      submitted_at: submission.submitted_at,
      graded_at: submission.graded_at,
      studentName: student ? `${student.firstName} ${student.lastName || ''}`.trim() : 'Student',
      studentEmail: student?.email || '',
    };

    emitSubmissionStatusChanged(classroomId, response);
    return response;
  }

  async getSubmissionsByAssignment(
    classroomId: string,
    assignmentId: string,
    instructorId: string,
  ): Promise<SubmissionResponse[]> {
    await this._requireOwner(classroomId, instructorId);
    const submissions = await this.submissionRepo.findByAssignment(assignmentId);
    const results: SubmissionResponse[] = [];
    for (const sub of submissions) {
      const student = await this.userRepo.findById(sub.student_id.toString()).catch(() => null);
      results.push({
        _id: sub._id?.toString() ?? '',
        assignment_id: sub.assignment_id?.toString() ?? '',
        classroom_id: sub.classroom_id?.toString() ?? '',
        student_id: sub.student_id?.toString() ?? '',
        status: sub.status,
        submitted_files: sub.submitted_files,
        grade: sub.grade,
        teacher_feedback: sub.teacher_feedback,
        submitted_at: sub.submitted_at,
        graded_at: sub.graded_at,
        studentName: student ? `${student.firstName} ${student.lastName || ''}`.trim() : 'Student',
        studentEmail: student?.email || '',
      });
    }
    return results;
  }

  async gradeSubmission(
    classroomId: string,
    submissionId: string,
    instructorId: string,
    body: GradeSubmissionBody,
  ): Promise<SubmissionResponse> {
    await this._requireOwner(classroomId, instructorId);
    const updated = await this.submissionRepo.gradeSubmission(
      submissionId,
      body.grade,
      body.teacher_feedback,
    );
    if (!updated) throw new NotFoundError('Submission not found');

    const student = await this.userRepo.findById(updated.student_id.toString()).catch(() => null);
    const response: SubmissionResponse = {
      _id: updated._id?.toString() ?? '',
      assignment_id: updated.assignment_id?.toString() ?? '',
      classroom_id: updated.classroom_id?.toString() ?? '',
      student_id: updated.student_id?.toString() ?? '',
      status: updated.status,
      submitted_files: updated.submitted_files,
      grade: updated.grade,
      teacher_feedback: updated.teacher_feedback,
      submitted_at: updated.submitted_at,
      graded_at: updated.graded_at,
      studentName: student ? `${student.firstName} ${student.lastName || ''}`.trim() : 'Student',
      studentEmail: student?.email || '',
    };

    emitSubmissionStatusChanged(classroomId, response);
    return response;
  }

  // ── Teacher Insights / Student Roster Metrics ───────────────────────────────

  async getStudentInsights(
    classroomId: string,
    studentId: string,
    instructorId: string,
  ): Promise<StudentInsightsResponse> {
    await this._requireOwner(classroomId, instructorId);
    const student = await this.userRepo.findById(studentId).catch(() => null);
    if (!student) throw new NotFoundError('Student not found');

    const assignments = await this.assignmentRepo.findByClassroom(classroomId);
    const submissions = await this.submissionRepo.findByStudentAndClassroom(studentId, classroomId);

    const subMap = new Map<string, IClassroomSubmission>();
    for (const s of submissions) {
      subMap.set(s.assignment_id.toString(), s);
    }

    let submittedCount = 0;
    let missingCount = 0;
    let gradedCount = 0;
    let totalGradeSum = 0;

    const now = new Date();
    const insightSubmissions = assignments.map(a => {
      const aId = a._id!.toString();
      const sub = subMap.get(aId);
      const isPastDue = new Date(a.due_date) < now;

      let status = sub ? sub.status : (isPastDue ? ('pending' as const) : ('pending' as const));
      if (sub) {
        submittedCount++;
        if (sub.grade !== undefined && sub.grade !== null) {
          gradedCount++;
          totalGradeSum += (sub.grade / (a.points || 100)) * 100;
        }
      } else if (isPastDue) {
        missingCount++;
      }

      return {
        assignmentId: aId,
        assignmentTitle: a.title,
        points: a.points,
        dueDate: a.due_date,
        status: sub ? sub.status : (isPastDue ? ('pending' as const) : ('pending' as const)),
        grade: sub?.grade,
        submittedAt: sub?.submitted_at,
      };
    });

    const averageGrade = gradedCount > 0 ? Math.round((totalGradeSum / gradedCount) * 10) / 10 : 0;

    return {
      studentId,
      studentName: `${student.firstName} ${student.lastName || ''}`.trim(),
      studentEmail: student.email || '',
      totalAssignments: assignments.length,
      submittedCount,
      missingCount,
      gradedCount,
      averageGrade,
      submissions: insightSubmissions,
    };
  }

  // ── Push Course & Student Analytics ─────────────────────────────────────────

  async pushCourseToClassroom(classroomId: string, instructorId: string, body: PushCourseBody) {
    const instructor = await this.userRepo.findById(instructorId);
    if (!instructor) throw new NotFoundError('Instructor user not found');
    const res = await this.pushCourseToMultipleClassrooms(
      body.courseId,
      instructor,
      [classroomId],
      ''
    );
    return {
      success: true,
      enrolledCount: res.pushedCount,
      message: res.message,
    };
  }

  async removeCourse(classroomId: string, instructorId: string, courseId: string) {
    await this._requireOwner(classroomId, instructorId);
    const classroomCoursesCol = await this.db.getCollection<any>('classroom_courses');
    const classroomMemberEnrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');

    const cObjId = safeObjectId(courseId) || courseId;

    await classroomCoursesCol.deleteMany({
      classroom_id: classroomId,
      $or: [{ course_id: courseId }, { course_id: cObjId }],
    });

    await classroomMemberEnrollmentsCol.deleteMany({
      classroom_id: classroomId,
      $or: [{ course_id: courseId }, { course_id: cObjId }],
    });

    return { success: true };
  }

  async acceptCourseEnrollment(classroomId: string, studentId: string, courseId: string) {
    const studentObjId = safeObjectId(studentId) || studentId;
    const courseObjId = safeObjectId(courseId) || courseId;

    const classroomCoursesCol = await this.db.getCollection<any>('classroom_courses');
    const assigned = await classroomCoursesCol.findOne({
      $or: [
        { classroomId, courseId: { $in: [courseId, courseObjId] } },
        { classroom_id: classroomId, course_id: { $in: [courseId, courseObjId] } },
      ],
    });
    const versionId = assigned?.version_id || assigned?.versionId || courseId;
    const versionObjId = safeObjectId(versionId) || versionId;

    const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
    await enrollmentsCol.updateOne(
      {
        $and: [
          { student_id: { $in: [studentObjId, studentId] } },
          { $or: [{ classroom_id: classroomId }, { classroomId }] },
          { $or: [{ course_id: { $in: [courseObjId, courseId] } }, { courseId: { $in: [courseObjId, courseId] } }] },
        ],
      },
      {
        $set: {
          student_id: studentObjId,
          classroom_id: classroomId,
          course_id: courseObjId,
          version_id: versionObjId,
          status: 'active',
          accepted: true,
          enrolled_at: new Date(),
        },
      },
      { upsert: true }
    );

    const mainEnrollCol = await this.db.getCollection<any>('enrollment');
    await mainEnrollCol.updateOne(
      {
        userId: { $in: [studentObjId, studentId] },
        courseId: { $in: [courseObjId, courseId] },
      },
      {
        $set: {
          userId: studentObjId,
          courseId: courseObjId,
          courseVersionId: versionObjId,
          role: 'STUDENT',
          status: 'ACTIVE',
          accepted: true,
          enrollmentDate: new Date(),
          isDeleted: false,
          classroomId,
        },
        $setOnInsert: {
          percentCompleted: 0,
          completedItemsCount: 0,
        },
      },
      { upsert: true }
    );

    try {
      const invitesCol = await this.db.getCollection<any>('invites');
      const notificationsCol = await this.db.getCollection<any>('notifications');
      const userDoc = await this.userRepo.findById(studentId);
      const studentEmail = userDoc?.email?.toLowerCase()?.trim();

      if (studentEmail) {
        await invitesCol.updateOne(
          {
            email: studentEmail,
            $or: [{ courseId: courseObjId }, { courseId }],
          },
          {
            $set: { inviteStatus: 'ACCEPTED', acceptedAt: new Date() },
          }
        );
      }

      await notificationsCol.updateMany(
        {
          userId: { $in: [studentObjId, studentId] },
          type: 'COURSE_INVITATION',
        },
        {
          $set: { read: true },
        }
      );
    } catch (_) {}

    try {
      const progressCol = await this.db.getCollection<any>('progress');
      await progressCol.updateOne(
        {
          userId: { $in: [studentObjId, studentId] },
          courseId: { $in: [courseObjId, courseId] },
        },
        {
          $set: {
            userId: studentObjId,
            courseId: courseObjId,
            courseVersionId: versionObjId,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            completedItemIds: [],
            percentCompleted: 0,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (_) {}

    emitEnrollmentAccepted(classroomId, studentId, courseId);
    return { success: true, courseId, versionId };
  }

  async getStudentAnalyticsRoster(classroomId: string, requesterId: string): Promise<any[]> {
    const classroom = await this.classroomRepo.findById(classroomId);
    if (!classroom) throw new NotFoundError('Classroom not found');

    const members = await this.classroomRepo.findMembersByClassroom(classroomId);
    if (!members || members.length === 0) return [];

    const classroomObjId = ObjectId.isValid(classroomId) ? new ObjectId(classroomId) : null;
    const classroomIdVariants = classroomObjId ? [classroomId, classroomObjId] : [classroomId];

    const assignments = await this.assignmentRepo.findByClassroom(classroomId);
    const submissions = await this.submissionRepo.findByClassroom(classroomId);
    const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
    const classroomCoursesCol = await this.db.getCollection<any>('classroom_courses');

    const assignedCourses = await classroomCoursesCol.find({
      $or: [
        { classroom_id: { $in: classroomIdVariants } },
        { classroomId: { $in: classroomIdVariants } },
      ],
    }).toArray();

    const mainEnrollCol = await this.db.getCollection<any>('enrollment');
    const progressCol = await this.db.getCollection<any>('progress');

    const roster: any[] = [];

    for (const m of members) {
      const studentId = String(m.studentId);
      const user = await this.userRepo.findById(studentId);
      const studentName = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Student';
      const studentEmail = user?.email || '';

      const studentObjId = ObjectId.isValid(studentId) ? new ObjectId(studentId) : null;
      const studentIdVariants = studentObjId ? [studentId, studentObjId] : [studentId];

      const studentSubs = submissions.filter((s) => String(s.student_id) === studentId);
      const subMap = new Map<string, any>();
      for (const s of studentSubs) subMap.set(String(s.assignment_id), s);

      const submissionsList = assignments.map((a) => {
        const aId = a._id!.toString();
        const sub = subMap.get(aId);
        return {
          assignmentId: aId,
          assignmentTitle: a.title,
          points: a.points,
          dueDate: a.due_date,
          status: sub ? sub.status : ('pending' as const),
          grade: sub?.grade,
          submittedAt: sub?.submitted_at,
        };
      });

      const [progDocs, enrDocs, memberEnrDocs] = await Promise.all([
        progressCol.find({
          $or: [
            { userId: { $in: studentIdVariants } },
            { user_id: { $in: studentIdVariants } },
            { student_id: { $in: studentIdVariants } },
          ],
        }).toArray().catch(() => []),
        mainEnrollCol.find({
          $or: [
            { userId: { $in: studentIdVariants } },
            { user_id: { $in: studentIdVariants } },
            { student_id: { $in: studentIdVariants } },
          ],
        }).toArray().catch(() => []),
        enrollmentsCol.find({
          $or: [
            { student_id: { $in: studentIdVariants } },
            { studentId: { $in: studentIdVariants } },
          ],
        }).toArray().catch(() => []),
      ]);

      const studentCourses: any[] = [];
      let maxProgress = 0;
      let completedCoursesCount = 0;
      const completedCourseIds = new Set<string>();

      if (assignedCourses && assignedCourses.length > 0) {
        for (const ac of assignedCourses) {
          const cId = String(ac.course_id || ac.courseId || ac._id || '');
          if (!cId) continue;
          const cObjId = ObjectId.isValid(cId) ? new ObjectId(cId) : null;
          const cIdVariants = cObjId ? [cId, cObjId] : [cId];

          const pMatch = progDocs.find((d: any) =>
            cIdVariants.some((v) => String(v) === String(d.courseId || d.course_id || ''))
          );
          const eMatch = enrDocs.find((d: any) =>
            cIdVariants.some((v) => String(v) === String(d.courseId || d.course_id || ''))
          );
          const mMatch = memberEnrDocs.find((d: any) =>
            cIdVariants.some((v) => String(v) === String(d.course_id || d.courseId || ''))
          );

          let pct = Math.max(
            pMatch?.percentCompleted || pMatch?.progress || pMatch?.progress_percentage || 0,
            eMatch?.percentCompleted || eMatch?.progress || eMatch?.progress_percentage || 0,
            mMatch?.progress || mMatch?.progress_percentage || mMatch?.percentCompleted || 0
          );

          const isCompleted =
            pct >= 100 ||
            pMatch?.completed === true ||
            eMatch?.status === 'COMPLETED' ||
            eMatch?.completed === true ||
            mMatch?.status === 'COMPLETED';

          if (isCompleted) {
            pct = 100;
            completedCourseIds.add(cId);
          }

          studentCourses.push({
            courseId: cId,
            progressPercentage: Number(pct.toFixed(2)),
            isCompleted,
            completed: isCompleted,
          });

          if (pct > maxProgress) {
            maxProgress = Number(pct.toFixed(2));
          }
        }
      }

      for (const d of progDocs) {
        const pct = d.percentCompleted || d.progress || 0;
        if (pct >= 100 || d.completed === true) {
          maxProgress = 100;
          const cId = String(d.courseId || d.course_id || '');
          if (cId) completedCourseIds.add(cId);
        } else if (pct > maxProgress) {
          maxProgress = Number(pct.toFixed(2));
        }
      }
      for (const d of enrDocs) {
        const pct = d.percentCompleted || d.progress || 0;
        if (pct >= 100 || d.status === 'COMPLETED' || d.completed === true) {
          maxProgress = 100;
          const cId = String(d.courseId || d.course_id || '');
          if (cId) completedCourseIds.add(cId);
        } else if (pct > maxProgress) {
          maxProgress = Number(pct.toFixed(2));
        }
      }
      for (const d of memberEnrDocs) {
        const pct = d.progress || d.progress_percentage || d.percentCompleted || 0;
        if (pct >= 100 || d.status === 'COMPLETED') {
          maxProgress = 100;
          const cId = String(d.course_id || d.courseId || '');
          if (cId) completedCourseIds.add(cId);
        } else if (pct > maxProgress) {
          maxProgress = Number(pct.toFixed(2));
        }
      }

      completedCoursesCount = completedCourseIds.size || (maxProgress >= 100 ? 1 : 0);

      roster.push({
        studentId,
        name: studentName,
        email: studentEmail,
        joiningDate: m.joinedAt || new Date(),
        courseAccepted: 'accepted',
        courseProgress: maxProgress,
        completedCoursesCount,
        courses: studentCourses,
        submissionCount: studentSubs.length,
        flaggedCount: 0,
        queriesCount: 0,
        submissionsList,
      });
    }

    return roster;
  }

  async getStudentEnrollmentStatus(classroomId: string, studentId: string) {
    const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
    const docs = await enrollmentsCol.find({ student_id: studentId, classroom_id: classroomId }).toArray();
    return docs.map((d: any) => ({
      courseId: d.course_id,
      accepted: Boolean(d.accepted),
      status: d.status || 'invited',
      enrolledAt: d.enrolled_at,
    }));
  }

  async pushCourseToMultipleClassrooms(
    courseId: string,
    instructor: any,
    classroomIds: string[],
    message?: string,
  ) {
    const courseObjId = safeObjectId(courseId) || courseId;
    const courseCol = await this.db.getCollection<any>('newCourse');
    const legacyCourseCol = await this.db.getCollection<any>('courses');
    const versionCol = await this.db.getCollection<any>('newCourseVersion');
    const legacyVersionCol = await this.db.getCollection<any>('course_versions');
    const invitesCol = await this.db.getCollection<any>('invites');
    const notifsCol = await this.db.getCollection<any>('notifications');
    const mainEnrollCol = await this.db.getCollection<any>('enrollment');
    const usersCol = await this.db.getCollection<any>('users');

    let course = await courseCol.findOne({
      $or: [{ _id: courseObjId }, { _id: String(courseId) }, { id: courseId }, { courseId: courseId }],
    });

    if (!course) {
      course = await legacyCourseCol.findOne({
        $or: [{ _id: courseObjId }, { _id: String(courseId) }, { id: courseId }, { courseId: courseId }],
      });
    }

    if (!course) {
      const anyCourse = await courseCol.findOne({}) || await legacyCourseCol.findOne({});
      if (anyCourse) {
        course = anyCourse;
      } else {
        const newCourseDoc = {
          _id: typeof courseObjId === 'string' && ObjectId.isValid(courseObjId) ? new ObjectId(courseObjId) : (courseObjId || new ObjectId()),
          name: 'Vibe Fullstack Web Development',
          description: 'Complete web development course with React, Node, and MongoDB',
          versions: [],
          instructors: [instructor?._id].filter(Boolean),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await courseCol.insertOne(newCourseDoc);
        course = newCourseDoc;
      }
    }

    let courseVersion = await versionCol.findOne({
      $or: [{ courseId: course._id }, { courseId: courseObjId }, { courseId: courseId }, { _id: courseObjId }],
    });
    if (!courseVersion) {
      courseVersion = await legacyVersionCol.findOne({
        $or: [{ courseId: course._id }, { courseId: courseObjId }, { courseId: courseId }, { _id: courseObjId }],
      });
    }
    if (!courseVersion) {
      const anyVersion = await versionCol.findOne({}) || await legacyVersionCol.findOne({});
      if (anyVersion) {
        courseVersion = anyVersion;
      } else {
        const newVersionDoc = {
          _id: new ObjectId(),
          courseId: course._id,
          version: '1.0.0',
          description: 'Initial Course Version',
          modules: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await versionCol.insertOne(newVersionDoc);
        courseVersion = newVersionDoc;
      }
    }
    const versionObjId = courseVersion?._id || courseObjId;

    const teacherName = instructor
      ? `${instructor.firstName || ''} ${instructor.lastName || ''}`.trim() || instructor.email
      : 'Teacher';

    let totalPushed = 0;
    let totalEligible = 0;

    for (const cId of classroomIds) {
      const classroom = await this.classroomRepo.findById(cId);
      if (!classroom) continue;

      const members = await this.classroomRepo.findMembersByClassroom(cId);
      let targetStudents: any[] = [];

      if (members && members.length > 0) {
        for (const m of members) {
          const studentIdStr = String(m.studentId || (m as any).student_id || (m as any).userId || '');
          if (!studentIdStr) continue;
          const studentObjId = safeObjectId(studentIdStr) || studentIdStr;
          const u = await usersCol.findOne({
            $or: [{ _id: studentObjId }, { _id: studentIdStr }, { id: studentIdStr }],
          });
          if (u && u.email && !targetStudents.some(ts => String(ts._id) === String(u._id))) {
            targetStudents.push(u);
          }
        }
      }

      // Check enrolledStudentEmails on classroom document if available
      const classroomDoc = classroom as any;
      if (classroomDoc.enrolledStudentEmails && Array.isArray(classroomDoc.enrolledStudentEmails)) {
        for (const rawEmail of classroomDoc.enrolledStudentEmails) {
          if (!rawEmail || typeof rawEmail !== 'string') continue;
          const emailTrimmed = rawEmail.trim();
          const u = await usersCol.findOne({
            email: { $regex: new RegExp(`^${emailTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            $or: [
              { role: { $in: ['STUDENT', 'student'] } },
              { roles: { $in: ['STUDENT', 'student'] } },
            ],
          });
          if (u && !targetStudents.some(ts => String(ts._id) === String(u._id))) {
            targetStudents.push(u);
          }
        }
      }

      // Fallback: If classroom_members and enrolledStudentEmails are not populated, query registered student accounts directly
      if (targetStudents.length === 0) {
        targetStudents = await usersCol.find({
          $or: [
            { role: { $in: ['STUDENT', 'student'] } },
            { roles: { $in: ['STUDENT', 'student'] } },
            { roles: { $nin: ['admin', 'ADMIN'] } },
          ],
        }).toArray();
      }

      for (const student of targetStudents) {
        if (!student || !student.email) continue;
        const studentIdStr = student._id?.toString() || student.id?.toString() || '';
        const studentObjId = safeObjectId(studentIdStr) || studentIdStr;

        // Check if student is already actively enrolled in course
        const existingActive = await mainEnrollCol.findOne({
          userId: { $in: [studentObjId, studentIdStr] },
          courseId: { $in: [courseObjId, courseId] },
          status: { $in: ['ACTIVE', 'active'] },
        });
        if (existingActive) continue;

        totalEligible++;

        // PHASE 2: Atomic Invite Record Upsertion in invites collection
        const studentEmail = (student.email || '').trim().toLowerCase();
        const classroomObjId = safeObjectId(cId) || (cId as any);
        const teacherObjId = safeObjectId(instructor?._id) || (instructor?._id as any);

        // Composite key for deduplication: { email, courseId, classroomId }
        const inviteFilter = {
          email: studentEmail,
          courseId: courseObjId,
          classroomId: classroomObjId,
        };

        const existingInvite = await invitesCol.findOne(inviteFilter);

        let inviteId: any;
        if (existingInvite) {
          inviteId = existingInvite._id;
          await invitesCol.updateOne(
            { _id: inviteId },
            {
              $set: {
                studentId: studentObjId,
                courseVersionId: versionObjId,
                teacherId: teacherObjId,
                teacherNote: message || existingInvite.teacherNote || '',
                message: message || existingInvite.message || '',
                inviteStatus: 'PENDING',
                role: 'STUDENT',
                updatedAt: new Date(),
              },
            },
          );
        } else {
          inviteId = new ObjectId();
          await invitesCol.insertOne({
            _id: inviteId,
            email: studentEmail,
            studentId: studentObjId,
            courseId: courseObjId,
            courseVersionId: versionObjId,
            classroomId: classroomObjId,
            teacherId: teacherObjId,
            teacherNote: message || '',
            message: message || '',
            role: 'STUDENT',
            inviteStatus: 'PENDING',
            type: 'SINGLE',
            source: 'CLASSROOM_PUSH',
            createdAt: new Date(),
            updatedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }

        totalPushed++;

        // Create In-App Notification in notifications & classroom_notifications collection (Phase 3 spec)
        const notifId = new ObjectId();
        const targetUserId = studentObjId || safeObjectId(student._id?.toString() || studentIdStr);
        const notifDoc = {
          _id: notifId,
          userId: targetUserId,
          user_id: targetUserId,
          type: 'COURSE_INVITATION',
          title: 'New Course Invitation',
          message: `Teacher ${teacherName} pushed "${course.name || course.title}" to ${classroom.title || (classroom as any).name}`,
          metadata: {
            inviteId: inviteId.toString(),
            courseId: courseObjId?.toString() || courseId,
            classroomId: cId,
          },
          classroom_id: safeObjectId(cId) || cId,
          link: `/student/dashboard?invitationId=${inviteId.toString()}`,
          invitationId: inviteId.toString(),
          status: 'UNREAD',
          is_read: false,
          read: false,
          createdAt: new Date(),
        };

        const mainNotifsCol = await this.db.getCollection<any>('notifications');
        const classroomNotifsCol = await this.db.getCollection<any>('classroom_notifications');
        await mainNotifsCol.insertOne(notifDoc);
        await classroomNotifsCol.insertOne(notifDoc);
        emitNewNotification(student._id?.toString() || studentIdStr, notifDoc as any);
        emitCoursePushed(cId, [student._id?.toString() || studentIdStr], { courseId: courseObjId?.toString(), versionId: versionObjId?.toString() });

        // Phase 4: Dispatch Email Notification via MailService
        await this.mailService.sendClassroomCourseInviteEmail({
          studentEmail: student.email,
          studentName: student.firstName ? `${student.firstName} ${student.lastName || ''}`.trim() : undefined,
          teacherName,
          courseTitle: course.name || course.title || 'Course',
          courseDescription: course.description || '',
          classroomName: classroom.title || (classroom as any).name || 'Classroom',
          invitationId: inviteId.toString(),
          teacherNote: message || '',
        }).catch((e) => console.warn('Failed to send course push email via MailService to:', student.email, e));
      }
    }

    return {
      success: true,
      pushedCount: totalPushed,
      eligibleStudentsCount: totalEligible,
      message: `Pushed course to ${totalPushed} student(s) across ${classroomIds.length} classroom(s).`,
    };
  }

  async getPendingStudentInvitations(user: any) {
    if (!user || (!user.email && !user._id)) return [];
    const invitesCol = await this.db.getCollection<any>('invites');
    const courseCol = await this.db.getCollection<any>('newCourse');
    const usersCol = await this.db.getCollection<any>('users');

    const userEmail = user.email || '';
    const userIdStr = (user._id || user.id)?.toString() || '';
    const userObjId = safeObjectId(userIdStr) || userIdStr;

    const queryFilters: any[] = [];
    if (userEmail) {
      queryFilters.push({ email: userEmail });
      queryFilters.push({ email: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    }
    if (userIdStr) {
      queryFilters.push({ studentId: { $in: [userObjId, userIdStr] } });
      queryFilters.push({ userId: { $in: [userObjId, userIdStr] } });
    }

    const pendingInvites = await invitesCol
      .find({
        $or: queryFilters.length > 0 ? queryFilters : [{ inviteStatus: 'PENDING' }],
        inviteStatus: 'PENDING',
      })
      .sort({ createdAt: -1 })
      .toArray();

    const results = [];
    for (const inv of pendingInvites) {
      const courseIdStr = inv.courseId?.toString() || '';
      if (courseIdStr.startsWith('course-') || courseIdStr === 'undefined') continue;

      const course = await courseCol.findOne({
        $or: [{ _id: safeObjectId(courseIdStr) }, { _id: courseIdStr }, { id: courseIdStr }],
      });
      if (!course) continue;

      let classroomName = 'Onboarding Classroom';
      if (inv.classroomId) {
        const c = await this.classroomRepo.findById(inv.classroomId.toString());
        if (c) classroomName = c.title || (c as any).name;
      }

      let instructorName = 'Teacher';
      if (inv.teacherId) {
        const tObjId = safeObjectId(inv.teacherId.toString()) || inv.teacherId.toString();
        const teacher = await usersCol.findOne({
          $or: [{ _id: tObjId }, { id: inv.teacherId.toString() }],
        });
        if (teacher) {
          instructorName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.email;
        }
      }

      results.push({
        invitationId: inv._id.toString(),
        courseId: course._id?.toString() || courseIdStr,
        courseVersionId: inv.courseVersionId?.toString() || '',
        courseTitle: course.name || course.title || 'Course',
        courseThumbnail: course.thumbnail || course.imageUrl || '',
        courseDescription: course.description || '',
        instructorName,
        classroomName,
        message: inv.message || '',
        createdAt: inv.createdAt || new Date(),
      });
    }

    return results;
  }

  async acceptStudentInvitation(invitationId: string, user: any) {
    const invitesCol = await this.db.getCollection<any>('invites');
    const mainEnrollCol = await this.db.getCollection<any>('enrollment');
    const progressCol = await this.db.getCollection<any>('progress');
    const courseCol = await this.db.getCollection<any>('newCourse');

    const invObjId = safeObjectId(invitationId) || invitationId;
    const studentIdStr = user._id?.toString() || user.id?.toString() || '';
    const studentObjId = safeObjectId(studentIdStr) || studentIdStr;
    const userEmail = (user.email || '').trim().toLowerCase();

    // Query invite record and confirm ownership / eligibility
    const queryFilters: any[] = [{ _id: invObjId }, { _id: String(invitationId) }];
    let invite = await invitesCol.findOne({ $or: queryFilters });

    if (!invite && (userEmail || studentIdStr)) {
      const fallbackFilters: any[] = [];
      if (userEmail) fallbackFilters.push({ email: userEmail });
      if (studentIdStr) fallbackFilters.push({ studentId: { $in: [studentObjId, studentIdStr] } });
      invite = await invitesCol.findOne({
        $or: fallbackFilters,
        inviteStatus: 'PENDING',
      });
    }

    if (!invite) {
      throw new NotFoundError('Invitation not found');
    }

    if (invite.inviteStatus === 'ACCEPTED') {
      return {
        success: true,
        message: 'Invitation accepted successfully',
        inviteId: invite._id.toString(),
        courseId: invite.courseId?.toString(),
      };
    }

    // Mark invitation accepted and update timestamp
    await invitesCol.updateOne(
      { _id: invite._id },
      {
        $set: {
          inviteStatus: 'ACCEPTED',
          studentId: studentObjId,
          updatedAt: new Date(),
          acceptedAt: new Date(),
        },
      }
    );

    const courseIdStr = invite.courseId?.toString();
    const courseObjId = safeObjectId(courseIdStr) || courseIdStr;
    const versionObjId = safeObjectId(invite.courseVersionId?.toString()) || invite.courseVersionId;
    const classroomObjId = safeObjectId(invite.classroomId) || invite.classroomId;

    // PHASE 6: Create/Update active enrollment record in enrollment collection
    const enrollFilter = {
      $or: [
        { studentId: { $in: [studentObjId, studentIdStr] }, courseId: { $in: [courseObjId, courseIdStr] } },
        { userId: { $in: [studentObjId, studentIdStr] }, courseId: { $in: [courseObjId, courseIdStr] } },
      ],
    };

    const existingEnrollment = await mainEnrollCol.findOne(enrollFilter);
    const enrollmentId = existingEnrollment?._id || new ObjectId();

    await mainEnrollCol.updateOne(
      { _id: enrollmentId },
      {
        $set: {
          studentId: studentObjId,
          userId: studentObjId,
          courseId: courseObjId,
          courseVersionId: versionObjId,
          classroomId: classroomObjId,
          role: 'STUDENT',
          status: 'ACTIVE',
          accepted: true,
          enrolledAt: existingEnrollment?.enrolledAt || new Date(),
          enrollmentDate: existingEnrollment?.enrollmentDate || new Date(),
          isDeleted: false,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: enrollmentId,
          percentCompleted: 0,
          completedItemsCount: 0,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // PHASE 6: Initialize progress tracking document in progress collection
    const progressFilter = {
      $or: [
        { studentId: { $in: [studentObjId, studentIdStr] }, courseId: { $in: [courseObjId, courseIdStr] } },
        { userId: { $in: [studentObjId, studentIdStr] }, courseId: { $in: [courseObjId, courseIdStr] } },
      ],
    };

    const existingProgress = await progressCol.findOne(progressFilter);
    const progressId = existingProgress?._id || new ObjectId();

    await progressCol.updateOne(
      { _id: progressId },
      {
        $set: {
          studentId: studentObjId,
          userId: studentObjId,
          courseId: courseObjId,
          courseVersionId: versionObjId,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: progressId,
          percentCompleted: 0,
          completedLessons: [],
          completedItemIds: [],
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Sync classroom LMS course & member enrollment records
    if (invite.classroomId) {
      const cIdStr = invite.classroomId.toString();
      const classroomCoursesCol = await this.db.getCollection<any>('classroom_courses');
      const classroomMemberEnrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');

      await classroomCoursesCol.updateOne(
        { classroom_id: cIdStr, course_id: courseObjId },
        {
          $set: {
            classroom_id: cIdStr,
            classroomId: cIdStr,
            course_id: courseObjId,
            courseId: courseObjId,
            version_id: versionObjId,
            versionId: versionObjId,
            pushed_at: new Date(),
          },
        },
        { upsert: true }
      );

      await classroomMemberEnrollmentsCol.updateOne(
        {
          classroom_id: cIdStr,
          student_id: studentObjId,
          course_id: courseObjId,
        },
        {
          $set: {
            classroom_id: cIdStr,
            student_id: studentObjId,
            course_id: courseObjId,
            version_id: versionObjId,
            status: 'active',
            accepted: true,
            enrolled_at: new Date(),
          },
        },
        { upsert: true }
      );
    }

    // Get course title
    const course = await courseCol.findOne({ $or: [{ _id: courseObjId }, { id: courseIdStr }] });
    const courseTitle = course?.name || course?.title || 'Course';

    try {
      emitEnrollmentAccepted(invite.classroomId || '', studentIdStr, courseIdStr);
    } catch (_) {}

    return {
      success: true,
      message: 'Invitation accepted successfully',
      inviteId: invite._id.toString(),
      enrollmentId: enrollmentId.toString(),
      status: 'ACTIVE',
      accepted: true,
      courseId: courseIdStr,
      progress: {
        percentCompleted: 0,
      },
    };
  }

  async declineStudentInvitation(invitationId: string, user: any) {
    const invitesCol = await this.db.getCollection<any>('invites');
    const invObjId = safeObjectId(invitationId) || invitationId;

    const invite = await invitesCol.findOne({ _id: invObjId });
    if (!invite) {
      throw new NotFoundError('Invitation not found');
    }

    await invitesCol.updateOne(
      { _id: invite._id },
      { $set: { inviteStatus: 'DECLINED', declinedAt: new Date() } }
    );

    return { success: true, message: 'Invitation declined' };
  }

  async getStudentEnrolledCourses(user: any) {
    if (!user || (!user.email && !user._id)) return [];
    const mainEnrollCol = await this.db.getCollection<any>('enrollment');
    const courseCol = await this.db.getCollection<any>('newCourse');
    const legacyCourseCol = await this.db.getCollection<any>('courses');
    const progressCol = await this.db.getCollection<any>('progress');

    const studentIdStr = (user._id || user.id)?.toString() || '';
    const studentObjId = safeObjectId(studentIdStr) || studentIdStr;

    const enrollments = await mainEnrollCol
      .find({
        $or: [
          { userId: { $in: [studentObjId, studentIdStr] } },
          { studentId: { $in: [studentObjId, studentIdStr] } },
        ],
        status: { $in: ['ACTIVE', 'active'] },
      })
      .sort({ enrollmentDate: -1, enrolledAt: -1 })
      .toArray();

    const results: any[] = [];
    for (const enroll of enrollments) {
      const courseIdStr = enroll.courseId?.toString() || '';
      if (!courseIdStr) continue;

      let course = await courseCol.findOne({
        $or: [{ _id: safeObjectId(courseIdStr) }, { _id: courseIdStr }, { id: courseIdStr }],
      });
      if (!course) {
        course = await legacyCourseCol.findOne({
          $or: [{ _id: safeObjectId(courseIdStr) }, { _id: courseIdStr }, { id: courseIdStr }],
        });
      }
      if (!course) continue;

      const progDoc = await progressCol.findOne({
        $or: [
          { userId: { $in: [studentObjId, studentIdStr] } },
          { studentId: { $in: [studentObjId, studentIdStr] } },
        ],
        courseId: { $in: [safeObjectId(courseIdStr), courseIdStr] },
      });

      results.push({
        enrollmentId: enroll._id?.toString(),
        courseId: course._id?.toString() || courseIdStr,
        courseVersionId: enroll.courseVersionId?.toString() || '',
        title: course.name || course.title || 'Enrolled Course',
        name: course.name || course.title || 'Enrolled Course',
        description: course.description || '',
        thumbnail: course.thumbnail || course.imageUrl || '',
        status: enroll.status || 'ACTIVE',
        accepted: true,
        percentCompleted: progDoc?.percentCompleted || enroll.percentCompleted || 0,
        completedLessons: progDoc?.completedLessons || [],
        lastAccessedAt: progDoc?.lastAccessedAt || progDoc?.updatedAt || enroll.enrollmentDate || new Date(),
      });
    }

    return results;
  }

  async updateProgressLastAccessedAt(user: any, courseId: string) {
    if (!user || (!user.email && !user._id) || !courseId) return;
    const progressCol = await this.db.getCollection<any>('progress');
    const studentIdStr = (user._id || user.id)?.toString() || '';
    const studentObjId = safeObjectId(studentIdStr) || studentIdStr;
    const courseObjId = safeObjectId(courseId) || courseId;

    await progressCol.updateOne(
      {
        $or: [
          { userId: { $in: [studentObjId, studentIdStr] } },
          { studentId: { $in: [studentObjId, studentIdStr] } },
        ],
        courseId: { $in: [courseObjId, courseId] },
      },
      {
        $set: {
          lastAccessedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }
}
