import { inject, injectable } from 'inversify';
import { BadRequestError, ForbiddenError, NotFoundError } from 'routing-controllers';
import { ObjectId } from 'mongodb';
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

    const status = isStudentRole ? 'pending' : 'approved';

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

    if (status === 'pending') {
      // Trigger 2: Notify instructor of approval request
      const instructorId = classroom.instructorId?.toString();
      if (instructorId) {
        const notif: Partial<INotification> = {
          user_id: instructorId,
          classroom_id: classroomId,
          type: 'approval_request',
          message: `A student requested an announcement approval in "${classroom.title}"`,
          link: `/classroom/${classroomId}`,
        };
        const savedNotif = await this.notificationRepo.create(notif);
        emitNewNotification(instructorId, savedNotif);
      }
    } else {
      // Approved post by teacher: notify room & bulk notify students
      emitNewAnnouncement(classroomId, response);

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

    emitNewAssignment(classroomId, response);

    // Trigger 1: Bulk insert Notifications for all students
    const members = await this.classroomRepo.findMembersByClassroom(classroomId);
    const studentNotifications: Partial<INotification>[] = members.map((m) => ({
      user_id: m.studentId.toString(),
      classroom_id: classroomId,
      type: 'new_assignment',
      message: `New assignment: "${title}" in "${classroom.title}"`,
      link: `/classroom/${classroomId}`,
    }));

    if (studentNotifications.length > 0) {
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
    const classroom = await this.classroomRepo.findById(classroomId);
    if (!classroom) throw new NotFoundError('Classroom not found');

    const classInstId = classroom.instructorId?.toString() ||
                        (classroom as any).instructor_id?.toString() ||
                        (classroom as any).owner_id?.toString() ||
                        (classroom as any).created_by?.toString();

    if (classInstId && classInstId !== String(instructorId)) {
      throw new ForbiddenError('Only the classroom instructor can push courses.');
    }

    const members = await this.classroomRepo.findMembersByClassroom(classroomId);
    if (!members || members.length === 0) {
      return { success: true, enrolledCount: 0 };
    }

    let versionId = body.versionId;
    if (!versionId) {
      try {
        const courseRepoCol = await this.db.getCollection<any>('newCourse');
        const cObjId = ObjectId.isValid(body.courseId) ? new ObjectId(body.courseId) : body.courseId;
        const courseDoc = await courseRepoCol.findOne({ _id: cObjId as any });
        versionId = courseDoc?.versions?.[0]?._id?.toString() ||
                    courseDoc?.versions?.[0]?.versionId?.toString() ||
                    courseDoc?.defaultVersionId?.toString() ||
                    body.courseId;
      } catch (_) {
        versionId = body.courseId;
      }
    }

    // 1. Assign course in classroom_courses collection
    try {
      await this.classroomRepo.assignCourse({
        classroomId,
        courseId: body.courseId,
        versionId: versionId || body.courseId,
        assignedAt: new Date(),
      });
    } catch (assignErr) {
      console.warn('Classroom course assignment already exists or failed:', assignErr);
    }

    // 2. Perform bulk enrollment updates in classroom_member_enrollments
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
            version_id: versionId || body.courseId,
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

    // 3. Auto-create stream announcement for course invitation
    try {
      const courseIdStr = typeof body.courseId === 'object'
        ? (body.courseId as any)?._id?.toString() || (body.courseId as any)?.toString()
        : String(body.courseId || '');

      let courseTitle = 'Course';
      try {
        const courseRepoCol = await this.db.getCollection<any>('newCourse');
        const cObjId = ObjectId.isValid(courseIdStr) ? new ObjectId(courseIdStr) : courseIdStr;
        const courseDoc = await courseRepoCol.findOne({
          $or: [{ _id: cObjId as any }, { _id: courseIdStr as any }]
        });
        courseTitle = courseDoc?.name || courseDoc?.title || 'Course';
      } catch (_) {}

      const createdAnn = await this.announcementRepo.create({
        classroom_id: classroomId,
        author_id: instructorId,
        content: `🎉 Course Invitation: ${courseTitle}. Open the Courses tab to view and accept your enrollment!`,
        type: 'course_invitation',
        referenceId: courseIdStr,
        metadata: {
          course_id: courseIdStr,
          courseId: courseIdStr,
          course_title: courseTitle,
          courseTitle: courseTitle,
        },
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      emitNewAnnouncement(classroomId, createdAnn);
      emitStreamUpdated(classroomId, createdAnn);
    } catch (err) {
      console.error('Failed to post stream announcement for course push:', err);
    }

    // 4. Dispatch real-time socket notifications & emails
    const studentIds = members.map(m => String(m.studentId));
    emitCoursePushed(classroomId, studentIds, {
      classroomId,
      courseId: body.courseId,
      versionId: versionId || body.courseId,
      message: `New course invitation pushed to classroom`,
    });

    if (body.sendEmails) {
      for (const m of members) {
        try {
          const user = await this.userRepo.findById(m.studentId);
          if (user?.email && this.mailService) {
            const subject = `Course Enrollment: ${classroom.title}`;
            const html = `<p>Hello ${user.firstName || 'Student'},</p><p>Your instructor has pushed a new course to your classroom: <strong>${classroom.title}</strong>.</p><p>Log in to Vibe to accept your course enrollment and start learning.</p>`;
            await this.mailService.sendMail({ to: user.email, subject, html }).catch(() => null);
          }
        } catch (e) {
          console.error(`Failed to send email to student ${m.studentId}:`, e);
        }
      }
    }

    return { success: true, enrolledCount: members.length };
  }

  async getStudentAnalyticsRoster(classroomId: string, requesterId: string): Promise<any[]> {
    const classroom = await this.classroomRepo.findById(classroomId);
    if (!classroom) throw new NotFoundError('Classroom not found');

    const members = await this.classroomRepo.findMembersByClassroom(classroomId);
    if (!members || members.length === 0) return [];

    const isTeacher = classroom.instructorId?.toString() === requesterId;

    if (!isTeacher) {
      const studentRoster = [];
      for (const m of members) {
        const studentId = String(m.studentId);
        const user = await this.userRepo.findById(studentId);
        const classmateName = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Classmate';
        studentRoster.push({
          studentId,
          classmateName,
          joiningDate: m.joinedAt || new Date(),
        });
      }
      return studentRoster;
    }


    const assignments = await this.assignmentRepo.findByClassroom(classroomId);
    const submissions = await this.submissionRepo.findByClassroom(classroomId);
    const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
    const enrollments = await enrollmentsCol.find({ classroom_id: classroomId }).toArray();

    const enrollmentMap = new Map<string, any>();
    for (const e of enrollments) {
      enrollmentMap.set(String(e.student_id), e);
    }

    const roster: StudentAnalyticsRosterDTO[] = [];

    for (const m of members) {
      const studentId = String(m.studentId);
      const user = await this.userRepo.findById(studentId);
      const studentName = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Student';
      const studentEmail = user?.email || '';

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

      const enrollDoc = enrollmentMap.get(studentId);
      let courseAccepted: 'accepted' | 'pending' =
        enrollDoc?.accepted || enrollDoc?.status === 'accepted' || enrollDoc?.status === 'active'
          ? 'accepted'
          : 'pending';
      let courseProgress: number = enrollDoc?.progress || enrollDoc?.progress_percentage || 0;

      try {
        const mainEnrollCol = await this.db.getCollection<any>('enrollments');
        const progressCol = await this.db.getCollection<any>('progress');
        const userObjId = ObjectId.isValid(studentId) ? new ObjectId(studentId) : studentId;

        const activeEnr = await mainEnrollCol.findOne({
          userId: { $in: [userObjId, studentId] },
          status: 'active',
        });

        if (activeEnr) {
          courseAccepted = 'accepted';
          if (typeof activeEnr.percentCompleted === 'number') {
            courseProgress = Math.max(courseProgress, Number(activeEnr.percentCompleted.toFixed(2)));
          }
        }

        const progDoc = await progressCol.findOne({
          userId: { $in: [userObjId, studentId] },
        });

        if (progDoc && typeof progDoc.percentCompleted === 'number') {
          courseProgress = Math.max(courseProgress, Number(progDoc.percentCompleted.toFixed(2)));
        }
      } catch (_) {}


      roster.push({
        studentId,
        name: studentName,
        email: studentEmail,
        joiningDate: m.joinedAt || new Date(),
        courseAccepted,
        courseProgress,
        submissionCount: studentSubs.length,
        flaggedCount: 0,
        queriesCount: 0,
        submissionsList,
      });
    }

    return roster;
  }

  async acceptCourseEnrollment(classroomId: string, studentId: string, courseId: string) {
    const enrollmentsCol = await this.db.getCollection<any>('classroom_member_enrollments');
    
    const studentObjId = ObjectId.isValid(studentId) ? new ObjectId(studentId) : studentId;
    const classroomObjId = ObjectId.isValid(classroomId) ? new ObjectId(classroomId) : classroomId;
    const courseObjId = ObjectId.isValid(courseId) ? new ObjectId(courseId) : courseId;
    
    const enrollDoc = await enrollmentsCol.findOne({
      student_id: { $in: [studentId, studentObjId] },
      classroom_id: { $in: [classroomId, classroomObjId] },
      course_id: { $in: [courseId, courseObjId] },
    });

    if (enrollDoc) {
      await enrollmentsCol.updateOne(
        { _id: enrollDoc._id },
        { $set: { accepted: true, acceptedAt: new Date(), status: 'active', push_status: 'accepted', enrollmentStatus: 'active' } }
      );
    }

    let versionId = enrollDoc?.version_id;
    if (!versionId) {
      try {
        const courseRepoCol = await this.db.getCollection<any>('newCourse');
        const cObjId = ObjectId.isValid(courseId) ? new ObjectId(courseId) : courseId;
        const courseDoc = await courseRepoCol.findOne({ _id: cObjId as any });
        versionId = courseDoc?.versions?.[0]?._id?.toString() ||
                    courseDoc?.versions?.[0]?.versionId?.toString() ||
                    courseDoc?.defaultVersionId?.toString() ||
                    courseId;
      } catch (_) {
        versionId = courseId;
      }
    }

    try {
      const mainEnrollCol = await this.db.getCollection<any>('enrollments');
      const userObjId = ObjectId.isValid(studentId) ? new ObjectId(studentId) : studentId;
      const courseObjId = ObjectId.isValid(courseId) ? new ObjectId(courseId) : courseId;
      const versionObjId = ObjectId.isValid(versionId) ? new ObjectId(versionId) : versionId;

      await mainEnrollCol.updateOne(
        {
          userId: { $in: [userObjId, studentId] },
          courseId: { $in: [courseObjId, courseId] },
        },
        {
          $set: {
            userId: userObjId,
            courseId: courseObjId,
            courseVersionId: versionObjId,
            role: 'STUDENT',
            status: 'active',
            accepted: true,
            enrollmentDate: new Date(),
            isDeleted: false,
            classroomId: classroomId, // Save classroom origin for the UI
          },
          $setOnInsert: {
            percentCompleted: 0,
            completedItemsCount: 0,
          },
        },
        { upsert: true }
      );
    } catch (e) {
      console.error('Failed to create main enrollment on classroom course acceptance:', e);
    }

    emitEnrollmentAccepted(classroomId, studentId, courseId);
    return { success: true };
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
}
