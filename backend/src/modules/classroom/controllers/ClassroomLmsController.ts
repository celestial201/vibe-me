import { inject, injectable } from 'inversify';
import {
  Authorized,
  Body,
  CurrentUser,
  Delete,
  Get,
  HttpCode,
  JsonController,
  Param,
  Params,
  Patch,
  Post,
  Req,
  UseBefore,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { IUser } from '#root/shared/interfaces/models.js';
import { CLASSROOM_TYPES } from '../types.js';
import { ClassroomLmsService } from '../services/ClassroomLmsService.js';
import {
  AnnouncementResponse,
  AssignmentResponse,
  CreateAnnouncementBody,
  CreateAssignmentBody,
  GradeSubmissionBody,
  PushCourseBody,
  PushCourseToClassroomsBody,
  StudentAnalyticsRosterDTO,
  StudentInsightsResponse,
  SubmissionResponse,
} from '../classes/validators/LmsValidators.js';
import { upload } from '#root/shared/middleware/upload.middleware.js';

import { JournalSubmissionRepository } from '../repositories/providers/mongodb/JournalSubmissionRepository.js';

class ClassroomIdParams {
  id: string;
}

class ClassroomAssignmentParams {
  id: string;
  assignmentId: string;
}

class AssignmentCommentParams {
  id: string;
  assignmentId: string;
  commentId: string;
}

class ClassroomSubmissionParams {
  id: string;
  submissionId: string;
}

class ClassroomStudentInsightParams {
  id: string;
  studentId: string;
}

@OpenAPI({ tags: ['Classroom LMS'], description: 'LMS Operations (Stream, Classwork, Submissions, Insights)' })
@injectable()
@Authorized()
@JsonController('/classroom')
export class ClassroomLmsController {
  constructor(
    @inject(CLASSROOM_TYPES.ClassroomLmsService)
    private readonly lmsService: ClassroomLmsService,
    @inject(CLASSROOM_TYPES.JournalSubmissionRepository)
    private readonly journalSubmissionRepo: JournalSubmissionRepository,
  ) {}

  // ── Stream / Announcements ───────────────────────────────────────────────────

  @OpenAPI({ summary: 'Post an announcement to classroom stream' })
  @Post('/:id/announcements')
  @HttpCode(201)
  @UseBefore(upload.array('files', 5))
  async createAnnouncement(
    @Params() params: ClassroomIdParams,
    @Body() body: CreateAnnouncementBody,
    @CurrentUser() user: IUser,
    @Req() req: any,
  ): Promise<AnnouncementResponse> {
    const files = (req.files as Express.Multer.File[]) || [];
    const attachments = files.map(f => `/uploads/${f.filename}`);
    const authorId = user._id?.toString() ?? '';
    return this.lmsService.createAnnouncement(params.id, authorId, body, attachments);
  }

  @OpenAPI({ summary: 'Get announcements for classroom stream' })
  @Get('/:id/announcements')
  async getAnnouncements(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<AnnouncementResponse[]> {
    const userId = user._id?.toString() ?? '';
    return this.lmsService.getAnnouncements(params.id, userId);
  }

  @OpenAPI({ summary: 'Get pending announcement requests (Teacher)' })
  @Get('/:id/announcements/pending')
  async getPendingAnnouncements(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<AnnouncementResponse[]> {
    const userId = user._id?.toString() ?? '';
    return this.lmsService.getPendingAnnouncements(params.id, userId);
  }

  @OpenAPI({ summary: 'Moderate an announcement request (Approve/Reject)' })
  @Patch('/:id/announcements/:announcementId/moderate')
  async moderateAnnouncement(
    @Params() params: ClassroomIdParams,
    @Param('announcementId') announcementId: string,
    @Body() body: { action: 'approve' | 'reject' },
    @CurrentUser() user: IUser,
  ) {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.moderateAnnouncement(
      params.id,
      instructorId,
      announcementId,
      body.action
    );
  }

  // ── Classwork / Assignments ──────────────────────────────────────────────────

  @OpenAPI({ summary: 'Create an assignment (Teacher)' })
  @Post('/:id/assignments')
  @HttpCode(201)
  @UseBefore(upload.any())
  async createAssignment(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
    @Req() req: any,
  ): Promise<AssignmentResponse> {
    const files = (req.files as Express.Multer.File[]) || [];
    const attachments = files.map(f => `/uploads/${f.filename}`);
    const instructorId = user._id?.toString() ?? '';
    const body = req.body || {};
    return this.lmsService.createAssignment(params.id, instructorId, body, attachments);
  }

  @OpenAPI({ summary: 'Get assignments for a classroom' })
  @Get('/:id/assignments')
  async getAssignments(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<AssignmentResponse[]> {
    const userId = user._id?.toString() ?? '';
    return this.lmsService.getAssignments(params.id, userId);
  }

  @OpenAPI({ summary: 'Get Q&A discussion comments for an assignment' })
  @Get('/:id/assignments/:assignmentId/comments')
  async getAssignmentComments(
    @Params() params: ClassroomAssignmentParams,
    @CurrentUser() user: IUser,
  ) {
    const userId = user._id?.toString() ?? '';
    return this.lmsService.getAssignmentComments(params.id, params.assignmentId, userId);
  }

  @OpenAPI({ summary: 'Add a Q&A discussion comment to an assignment' })
  @Post('/:id/assignments/:assignmentId/comments')
  @HttpCode(201)
  async addAssignmentComment(
    @Params() params: ClassroomAssignmentParams,
    @Body() body: { content: string },
    @CurrentUser() user: IUser,
  ) {
    const userId = user._id?.toString() ?? '';
    return this.lmsService.addAssignmentComment(params.id, params.assignmentId, userId, body.content);
  }

  @OpenAPI({ summary: 'Toggle verified answer flag on Q&A comment (Teacher)' })
  @Patch('/:id/assignments/:assignmentId/comments/:commentId/toggle-verify')
  async toggleVerifyComment(
    @Params() params: AssignmentCommentParams,
    @CurrentUser() user: IUser,
  ) {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.toggleVerifyComment(params.id, params.assignmentId, params.commentId, instructorId);
  }

  // ── Internship Journey Calendar ─────────────────────────────────────────────

  @OpenAPI({ summary: 'Get 60-day Internship Journey calendar & journals' })
  @Get('/:id/calendar')
  async getCalendar(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ) {
    const userId = user._id?.toString() ?? '';
    return this.lmsService.getInternshipCalendar(params.id, userId);
  }

  @OpenAPI({ summary: 'Add/edit daily journal prompt for a specific day (Teacher)' })
  @Post('/:id/calendar/journal')
  async upsertJournal(
    @Params() params: ClassroomIdParams,
    @Body() body: { day_number: number; title?: string; content_link?: string; journal_entry?: string },
    @CurrentUser() user: IUser,
  ) {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.upsertDailyJournal(
      params.id,
      instructorId,
      Number(body.day_number),
      body
    );
  }

  @OpenAPI({ summary: 'Mark daily journal as filled/completed (Student)' })
  @Post('/:id/journal/:day/complete')
  async markJournalComplete(
    @Params() params: ClassroomIdParams,
    @Param('day') day: number,
    @CurrentUser() user: IUser,
  ) {
    const studentId = user._id?.toString() ?? '';
    const submission = await this.journalSubmissionRepo.markCompleted(
      studentId,
      params.id,
      Number(day)
    );
    return { success: true, submission };
  }

  @OpenAPI({ summary: 'Get list of completed journal day numbers for current student' })
  @Get('/:id/journal/completed')
  async getCompletedJournals(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ) {
    const studentId = user._id?.toString() ?? '';
    const completedDays = await this.journalSubmissionRepo.findCompletedDays(studentId, params.id);
    return { completedDays };
  }

  // ── Submissions & Grading ───────────────────────────────────────────────────

  @OpenAPI({ summary: 'Submit an assignment (Student Turn In)' })
  @Post('/:id/assignments/:assignmentId/submit')
  @HttpCode(201)
  @UseBefore(upload.array('files', 5))
  async submitAssignment(
    @Params() params: ClassroomAssignmentParams,
    @CurrentUser() user: IUser,
    @Req() req: any,
  ): Promise<SubmissionResponse> {
    const files = (req.files as Express.Multer.File[]) || [];
    const submittedFiles = files.map(f => `/uploads/${f.filename}`);
    const studentId = user._id?.toString() ?? '';
    return this.lmsService.submitAssignment(
      params.id,
      params.assignmentId,
      studentId,
      submittedFiles,
    );
  }

  @OpenAPI({ summary: 'Get submissions for an assignment (Teacher)' })
  @Get('/:id/assignments/:assignmentId/submissions')
  async getSubmissionsByAssignment(
    @Params() params: ClassroomAssignmentParams,
    @CurrentUser() user: IUser,
  ): Promise<SubmissionResponse[]> {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.getSubmissionsByAssignment(
      params.id,
      params.assignmentId,
      instructorId,
    );
  }

  @OpenAPI({ summary: 'Grade & Return a student submission (Teacher)' })
  @Patch('/:id/submissions/:submissionId/grade')
  async gradeSubmission(
    @Params() params: ClassroomSubmissionParams,
    @Body() body: GradeSubmissionBody,
    @CurrentUser() user: IUser,
  ): Promise<SubmissionResponse> {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.gradeSubmission(
      params.id,
      params.submissionId,
      instructorId,
      body,
    );
  }

  // ── Teacher Insights ─────────────────────────────────────────────────────────

  @OpenAPI({ summary: 'Get student drill-down insight metrics (Teacher)' })
  @Get('/:id/students/:studentId/insights')
  async getStudentInsights(
    @Params() params: ClassroomStudentInsightParams,
    @CurrentUser() user: IUser,
  ): Promise<StudentInsightsResponse> {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.getStudentInsights(
      params.id,
      params.studentId,
      instructorId,
    );
  }

  // ── Push Course & Student Analytics Roster ──────────────────────────────────

  @OpenAPI({ summary: 'Bulk push course to classroom students and send emails' })
  @Post('/:id/push-course')
  async pushCourseToClassroom(
    @Params() params: ClassroomIdParams,
    @Body() body: PushCourseBody,
    @CurrentUser() user: IUser,
  ) {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.pushCourseToClassroom(params.id, instructorId, body);
  }

  @OpenAPI({ summary: 'Remove a course from classroom' })
  @Delete('/:id/courses/:courseId')
  async removeCourse(
    @Params() params: { id: string; courseId: string },
    @CurrentUser() user: IUser,
  ) {
    const instructorId = user._id?.toString() ?? '';
    return this.lmsService.removeCourse(params.id, instructorId, params.courseId);
  }

  @OpenAPI({ summary: 'Get full student analytics roster table (Teacher)' })
  @Get('/:id/students/analytics')
  async getStudentAnalyticsRoster(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<StudentAnalyticsRosterDTO[]> {
    const instructorId = (user?._id || (user as any)?.id)?.toString() ?? '';
    const roster = await this.lmsService.getStudentAnalyticsRoster(params.id, instructorId);
    console.log('Roster Array Length:', roster.length);
    return roster;
  }


  @OpenAPI({ summary: 'Student accepts course enrollment' })
  @Post('/:id/courses/:courseId/accept')
  @Patch('/:id/courses/:courseId/accept')
  async acceptCourseEnrollment(
    @Params() params: { id: string; courseId: string },
    @CurrentUser() user: IUser,
  ) {
    const studentId = user._id?.toString() ?? '';
    return this.lmsService.acceptCourseEnrollment(params.id, studentId, params.courseId);
  }

  @OpenAPI({ summary: 'Get student enrollment status for classroom courses' })
  @Get('/:id/enrollment-status')
  async getStudentEnrollmentStatus(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ) {
    const studentId = user._id?.toString() ?? '';
    return this.lmsService.getStudentEnrollmentStatus(params.id, studentId);
  }

  @OpenAPI({ summary: 'Push a course to multiple classrooms' })
  @Post('/teacher/courses/push-classroom')
  @Post('/courses/push-classroom')
  @Post('/teacher/courses/:courseId/push-classroom')
  @Post('/courses/:courseId/push-classroom')
  async pushCourseToMultipleClassrooms(
    @Param('courseId') courseId: string,
    @Body() body: PushCourseToClassroomsBody,
    @CurrentUser() user: IUser,
  ) {
    const targetCourseId = courseId || body.courseId || '';
    const note = body.teacherNote || body.message;
    return this.lmsService.pushCourseToMultipleClassrooms(
      targetCourseId,
      user,
      body.classroomIds || [],
      note,
    );
  }

  @OpenAPI({ summary: 'Get pending course invitations for current student' })
  @Get('/student/invitations')
  @Get('/student/invitations/pending')
  async getPendingStudentInvitations(@CurrentUser() user: IUser) {
    return this.lmsService.getPendingStudentInvitations(user);
  }

  @OpenAPI({ summary: 'Student accepts course invitation' })
  @Post('/student/invitations/:invitationId/accept')
  @Post('/student/invitations/:inviteId/accept')
  @Post('/invitations/:inviteId/accept')
  async acceptStudentInvitation(
    @Param('invitationId') invitationId: string,
    @Param('inviteId') inviteIdParam: string,
    @CurrentUser() user: IUser,
  ) {
    const targetId = invitationId || inviteIdParam || '';
    return this.lmsService.acceptStudentInvitation(targetId, user);
  }

  @OpenAPI({ summary: 'Student declines course invitation' })
  @Post('/student/invitations/:invitationId/decline')
  async declineStudentInvitation(
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: IUser,
  ) {
    return this.lmsService.declineStudentInvitation(invitationId, user);
  }

  @OpenAPI({ summary: 'Get enrolled courses for current student' })
  @Get('/student/enrolled-courses')
  async getStudentEnrolledCourses(@CurrentUser() user: IUser) {
    return this.lmsService.getStudentEnrolledCourses(user);
  }

  @OpenAPI({ summary: 'Update lastAccessedAt timestamp when Course Player initializes lessons' })
  @Post('/student/courses/:courseId/access')
  async updateCoursePlayerAccess(
    @Param('courseId') courseId: string,
    @CurrentUser() user: IUser,
  ) {
    await this.lmsService.updateProgressLastAccessedAt(user, courseId);
    return { success: true, timestamp: new Date().toISOString() };
  }
}
