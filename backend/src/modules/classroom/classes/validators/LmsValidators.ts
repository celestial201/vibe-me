import { Expose, Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import { SubmissionStatus } from '#root/shared/interfaces/models.js';

// ── Announcements ─────────────────────────────────────────────────────────────

export class CreateAnnouncementBody {
  @IsString()
  @IsNotEmpty()
  @JSONSchema({ description: 'Announcement content text', example: 'Welcome to the classroom!' })
  content: string;
}

export class AnnouncementResponse {
  @Expose() _id: string;
  @Expose() classroom_id: string;
  @Expose() author_id: string;
  @Expose() authorName?: string;
  @Expose() content: string;
  @Expose() type?: 'text' | 'assignment' | 'course_invitation';
  @Expose() metadata?: {
    course_id?: string;
    course_title?: string;
    course_thumbnail?: string;
  };
  @Expose() attachments?: string[];
  @Expose() @Type(() => Date) createdAt: Date;
  @Expose() @Type(() => Date) updatedAt: Date;
}

// ── Assignments ─────────────────────────────────────────────────────────────

export class CreateAssignmentBody {
  @IsString()
  @IsNotEmpty()
  @JSONSchema({ description: 'Assignment title', example: 'Homework 1: React Basics' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  @IsNotEmpty()
  @IsDateString()
  due_date: string;
}

export class AssignmentResponse {
  @Expose() _id: string;
  @Expose() classroom_id: string;
  @Expose() instructor_id: string;
  @Expose() title: string;
  @Expose() description?: string;
  @Expose() points: number;
  @Expose() @Type(() => Date) due_date: Date;
  @Expose() attachments?: string[];
  @Expose() @Type(() => Date) createdAt: Date;
  @Expose() @Type(() => Date) updatedAt: Date;
}

// ── Submissions ─────────────────────────────────────────────────────────────

export class GradeSubmissionBody {
  @IsNumber()
  @Min(0)
  @Max(1000)
  grade: number;

  @IsOptional()
  @IsString()
  teacher_feedback?: string;
}

export class SubmissionResponse {
  @Expose() _id: string;
  @Expose() assignment_id: string;
  @Expose() classroom_id: string;
  @Expose() student_id: string;
  @Expose() studentName?: string;
  @Expose() studentEmail?: string;
  @Expose() status: SubmissionStatus;
  @Expose() submitted_files?: string[];
  @Expose() grade?: number;
  @Expose() teacher_feedback?: string;
  @Expose() @Type(() => Date) submitted_at?: Date;
  @Expose() @Type(() => Date) graded_at?: Date;
}

// ── Teacher Student Insights DTO ─────────────────────────────────────────────

export class StudentInsightSubmissionDTO {
  assignmentId: string;
  assignmentTitle: string;
  points: number;
  dueDate: Date;
  status: SubmissionStatus;
  grade?: number;
  submittedAt?: Date;
}

export class StudentInsightsResponse {
  studentId: string;
  studentName: string;
  studentEmail: string;
  totalAssignments: number;
  submittedCount: number;
  missingCount: number;
  gradedCount: number;
  averageGrade: number; // percentage or numerical avg
  submissions: StudentInsightSubmissionDTO[];
}

export class PushCourseBody {
  @IsString()
  @IsNotEmpty()
  @JSONSchema({ description: 'Course ID to push to classroom students', example: '60d5ec49b3f1c8e4a8f8b8c1' })
  courseId: string;

  @IsOptional()
  @IsString()
  versionId?: string;

  @IsOptional()
  sendEmails?: boolean;
}

export class PushCourseToClassroomsBody {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsNotEmpty()
  classroomIds: string[];

  @IsOptional()
  @IsString()
  message?: string;
}

export class StudentAnalyticsRosterDTO {
  studentId: string;
  name: string;
  email: string;
  joiningDate: Date;
  courseAccepted: 'accepted' | 'pending';
  courseProgress: number; // percentage 0-100
  submissionCount: number;
  flaggedCount: number;
  queriesCount: number;
  submissionsList: StudentInsightSubmissionDTO[];
}
