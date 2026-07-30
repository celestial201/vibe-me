import { inject, injectable } from 'inversify';
import { ArenaRepository } from '../repositories/ArenaRepository.js';
import { CourseRepository } from '#shared/database/providers/mongo/repositories/CourseRepository.js';
import { EnrollmentRepository } from '#shared/database/providers/mongo/repositories/EnrollmentRepository.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { USERS_TYPES } from '#root/modules/users/types.js';
import { SseManager } from './SseManager.js';
import { evaluateArenaEligibility } from './ArenaService.js';

@injectable()
export class ArenaMonitorService {
  constructor(
    @inject('ArenaRepository') private readonly arenaRepo: ArenaRepository,
    @inject(GLOBAL_TYPES.CourseRepo) private readonly courseRepo: CourseRepository,
    @inject(USERS_TYPES.EnrollmentRepo) private readonly enrollmentRepo: EnrollmentRepository,
  ) {}

  public async getTeacherCoursesWithStats(teacherUserId: string): Promise<any[]> {
    const courseCol = await this.arenaRepo.getCollection('newCourse');
    const userCol = await this.arenaRepo.getCollection('user');
    const enrollmentCol = await this.arenaRepo.getCollection('enrollment');
    const { ObjectId } = await import('mongodb');

    // Fetch courses where instructors array contains teacherUserId or all active courses
    let teacherObjId;
    try {
      teacherObjId = new ObjectId(teacherUserId);
    } catch {
      teacherObjId = teacherUserId;
    }

    const courses = await courseCol.find({
      $or: [
        { instructors: { $in: [teacherObjId, teacherUserId] } },
        { createdBy: { $in: [teacherObjId, teacherUserId] } },
        { isDeleted: { $ne: true } }
      ]
    }).toArray();

    const courseStatsPromises = courses.map(async (course: any) => {
      const courseIdStr = course._id.toString();

      // Find enrollments for this course
      const courseObjId = course._id;
      const enrollments = await enrollmentCol.find({
        courseId: { $in: [courseObjId, courseIdStr] },
        status: 'ACTIVE'
      }).toArray();

      const studentPromises = enrollments.map(async (enrollment: any) => {
        const studentUserId = enrollment.userId?.toString();
        let studentUser: any = null;

        if (studentUserId) {
          try {
            studentUser = await userCol.findOne({
              $or: [{ _id: new ObjectId(studentUserId) }, { _id: studentUserId }]
            });
          } catch (e) {
            // ignore invalid ObjectId
          }
        }

        const percentCompleted = Number(enrollment.percentCompleted ?? 0);
        const completedMilestones = enrollment.arenaProgress?.completedMilestones || [];
        const eligibility = evaluateArenaEligibility(percentCompleted, completedMilestones);

        // Count turns / matches played
        const turnsPlayed = completedMilestones.length || 0;

        return {
          userId: studentUserId,
          name: studentUser?.name || studentUser?.displayName || studentUser?.email?.split('@')[0] || 'Student',
          email: studentUser?.email || '',
          progressPercent: percentCompleted,
          completedMilestones,
          availableCredits: course.infiniteArenaEnabled ? 999 : eligibility.availableCredits,
          turnsPlayed,
        };
      });

      const students = await Promise.all(studentPromises);

      return {
        courseId: courseIdStr,
        courseName: course.name || 'Untitled Course',
        description: course.description || '',
        infiniteArenaEnabled: course.infiniteArenaEnabled ?? false,
        totalEnrolled: students.length,
        students,
      };
    });

    return Promise.all(courseStatsPromises);
  }

  public async toggleInfiniteCredits(courseId: string, enabled: boolean): Promise<any> {
    const courseCol = await this.arenaRepo.getCollection('newCourse');
    const { ObjectId } = await import('mongodb');

    let objId;
    try {
      objId = new ObjectId(courseId);
    } catch {
      objId = courseId;
    }

    const result = await courseCol.updateOne(
      { _id: objId },
      { $set: { infiniteArenaEnabled: enabled, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      throw new Error(`Course not found with ID: ${courseId}`);
    }

    // Broadcast SSE update to all connected student clients
    SseManager.getInstance().broadcast({
      type: 'INFINITE_CREDITS_TOGGLED',
      courseId: courseId.toString(),
      infiniteArenaEnabled: enabled,
    });

    return {
      success: true,
      courseId: courseId.toString(),
      infiniteArenaEnabled: enabled,
    };
  }
}
