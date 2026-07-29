import { inject, injectable } from 'inversify';
import {
  Authorized,
  Body,
  CurrentUser,
  Delete,
  Get,
  HttpCode,
  JsonController,
  NotFoundError,
  Params,
  Post,
  Put,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { IUser } from '#root/shared/interfaces/models.js';
import { CLASSROOM_TYPES } from '../types.js';
import { ClassroomService } from '../services/ClassroomService.js';
import {
  AssignCourseBody,
  ClassroomCourseResponse,
  ClassroomMemberResponse,
  ClassroomResponse,
  CreateClassroomBody,
  JoinClassroomBody,
  UpdateClassroomBody,
} from '../classes/validators/ClassroomValidators.js';

// Param helper
class ClassroomIdParams {
  id: string;
}
class ClassroomCourseParams {
  id: string;
  courseId: string;
}

@OpenAPI({ tags: ['Classroom'], description: 'Onboarding Classroom operations' })
@injectable()
@Authorized()
@JsonController('/classroom')
export class ClassroomController {
  constructor(
    @inject(CLASSROOM_TYPES.ClassroomService)
    private readonly classroomService: ClassroomService,
  ) {}

  // ── Instructor ────────────────────────────────────────────────────────────

  @OpenAPI({ summary: 'Create a new classroom' })
  @Post('/')
  @HttpCode(201)
  async create(
    @Body() body: CreateClassroomBody,
    @CurrentUser() user: IUser,
  ): Promise<ClassroomResponse> {
    const instructorId = user._id?.toString() ?? '';
    return this.classroomService.createClassroom(instructorId, body);
  }

  @OpenAPI({ summary: "Get instructor's own classrooms" })
  @Get('/my')
  async getMyClassrooms(@CurrentUser() user: IUser): Promise<ClassroomResponse[]> {
    return this.classroomService.getMyClassrooms(user._id?.toString() ?? '');
  }

  @OpenAPI({ summary: "Get all classrooms the student has joined" })
  @Get('/joined')
  async getJoined(@CurrentUser() user: IUser): Promise<ClassroomResponse[]> {
    return this.classroomService.getJoinedClassrooms(user._id?.toString() ?? '');
  }

  @OpenAPI({ summary: 'Get a classroom by ID' })
  @Get('/:id')
  async getOne(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<ClassroomResponse> {
    return this.classroomService.getClassroomById(params.id, user._id?.toString() ?? '');
  }

  @OpenAPI({ summary: 'Update a classroom' })
  @Put('/:id')
  async update(
    @Params() params: ClassroomIdParams,
    @Body() body: UpdateClassroomBody,
    @CurrentUser() user: IUser,
  ): Promise<ClassroomResponse> {
    return this.classroomService.updateClassroom(params.id, user._id?.toString() ?? '', body);
  }

  @OpenAPI({ summary: 'Delete a classroom (cascades members and courses)' })
  @Delete('/:id')
  @HttpCode(204)
  async delete(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<void> {
    return this.classroomService.deleteClassroom(params.id, user._id?.toString() ?? '');
  }

  @OpenAPI({ summary: 'List students in a classroom' })
  @Get('/:id/students')
  async getStudents(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<ClassroomMemberResponse[]> {
    return this.classroomService.getStudents(params.id, user._id?.toString() ?? '');
  }

  // ── Student ───────────────────────────────────────────────────────────────

  @OpenAPI({ summary: 'Join a classroom using its code' })
  @Post('/join')
  @HttpCode(200)
  async join(
    @Body() body: JoinClassroomBody,
    @CurrentUser() user: IUser,
  ): Promise<ClassroomResponse> {
    return this.classroomService.joinClassroom(body.code, user._id?.toString() ?? '');
  }

  // ── Courses ───────────────────────────────────────────────────────────────

  @OpenAPI({ summary: 'List courses assigned to a classroom' })
  @Get('/:id/courses')
  async getCourses(
    @Params() params: ClassroomIdParams,
    @CurrentUser() user: IUser,
  ): Promise<ClassroomCourseResponse[]> {
    return this.classroomService.getClassroomCourses(params.id, user._id?.toString() ?? '');
  }

  @OpenAPI({ summary: 'Assign a course to a classroom' })
  @Post('/:id/courses')
  @HttpCode(201)
  async assignCourse(
    @Params() params: ClassroomIdParams,
    @Body() body: AssignCourseBody,
    @CurrentUser() user: IUser,
  ): Promise<ClassroomCourseResponse> {
    return this.classroomService.assignCourse(params.id, body, user._id?.toString() ?? '');
  }

  @OpenAPI({ summary: 'Remove a course from a classroom' })
  @Delete('/:id/courses/:courseId')
  @HttpCode(204)
  async removeCourse(
    @Params() params: ClassroomCourseParams,
    @CurrentUser() user: IUser,
  ): Promise<void> {
    return this.classroomService.removeCourse(
      params.id,
      params.courseId,
      user._id?.toString() ?? '',
    );
  }
}
