import { Expose, Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsDateString, Length } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

// ── Request bodies ────────────────────────────────────────────────────────────

export class CreateClassroomBody {
  @IsString()
  @IsNotEmpty()
  @JSONSchema({ description: 'Classroom title', example: 'Web Dev Bootcamp 2026' })
  title: string;

  @IsOptional()
  @IsString()
  @JSONSchema({ description: 'Optional description', example: 'Intro to full-stack dev' })
  description?: string;

  @IsOptional()
  @IsDateString()
  @JSONSchema({ description: 'Start date of the classroom timeline', example: '2026-06-01' })
  start_date?: string;

  @IsOptional()
  @IsDateString()
  @JSONSchema({ description: 'End date of the classroom timeline', example: '2026-07-31' })
  end_date?: string;
}

export class UpdateClassroomBody {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}

export class JoinClassroomBody {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @JSONSchema({ description: '6-character classroom join code', example: 'AB12CD' })
  code: string;
}

export class AssignCourseBody {
  @IsString()
  @IsNotEmpty()
  @JSONSchema({ description: 'Course ID to assign', example: '60d5ec49b3f1c8e4a8f8b8c1' })
  courseId: string;

  @IsString()
  @IsNotEmpty()
  @JSONSchema({ description: 'Course version ID', example: '60d5ec49b3f1c8e4a8f8b8c2' })
  versionId: string;
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class ClassroomResponse {
  @Expose() _id: string;
  @Expose() title: string;
  @Expose() description?: string;
  @Expose() code: string;
  @Expose() instructorId: string;
  @Expose() status: string;
  @Expose() @Type(() => Date) start_date?: Date;
  @Expose() @Type(() => Date) end_date?: Date;
  @Expose() @Type(() => Date) createdAt: Date;
  @Expose() @Type(() => Date) updatedAt: Date;
  @Expose() memberCount?: number;
}

export class ClassroomListResponse {
  @Expose() classrooms: ClassroomResponse[];
}

export class ClassroomMemberResponse {
  @Expose() _id?: string;
  @Expose() classroomId: string;
  @Expose() studentId: string;
  @Expose() studentName?: string;
  @Expose() studentEmail?: string;
  @Expose() @Type(() => Date) joinedAt: Date;
}

export class ClassroomCourseResponse {
  @Expose() _id?: string;
  @Expose() classroomId: string;
  @Expose() courseId: string;
  @Expose() versionId: string;
  @Expose() courseName?: string;
  @Expose() versionName?: string;
  @Expose() @Type(() => Date) assignedAt: Date;
}
