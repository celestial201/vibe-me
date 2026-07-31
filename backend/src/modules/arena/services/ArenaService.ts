import { inject, injectable } from 'inversify';
import { ArenaRepository } from '../repositories/ArenaRepository.js';
import { UserCard } from '../classes/transformers/UserCard.js';
import { Deck } from '../classes/transformers/Deck.js';
import { EnrollmentRepository } from '#shared/database/providers/mongo/repositories/EnrollmentRepository.js';
import { ProgressRepository } from '#shared/database/providers/mongo/repositories/ProgressRepository.js';
import { CourseRepository } from '#shared/database/providers/mongo/repositories/CourseRepository.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { USERS_TYPES } from '#root/modules/users/types.js';
import { COURSES_TYPES } from '#root/modules/courses/types.js';

export interface MilestoneTier {
  level: number;
  threshold: number;
  bait: number;
}

export const MILESTONE_TIERS: MilestoneTier[] = [
  { level: 1, threshold: 30, bait: 4 },
  { level: 2, threshold: 50, bait: 8 },
  { level: 3, threshold: 70, bait: 12 },
  { level: 4, threshold: 90, bait: 16 },
  { level: 5, threshold: 100, bait: 20 },
];

export function evaluateArenaEligibility(currentProgress: number, completedMilestones: number[] = []) {
  const unlockedTiers = MILESTONE_TIERS.filter(tier => currentProgress >= tier.threshold);
  const playableTiers = unlockedTiers.filter(tier => !completedMilestones.includes(tier.threshold));
  const nextLockedTier = MILESTONE_TIERS.find(tier => currentProgress < tier.threshold) || null;

  return {
    currentProgress,
    completedMilestones,
    unlockedTiers,
    playableTiers,
    availableCredits: playableTiers.length,
    activeTier: playableTiers.length > 0 ? playableTiers[0] : null,
    nextLockedTier,
    isFullyCompleted: completedMilestones.length === 5,
  };
}

export const evaluateDynamicArenaState = evaluateArenaEligibility;

@injectable()
export class ArenaService {
  constructor(
    @inject('ArenaRepository') private readonly arenaRepo: ArenaRepository,
    @inject(USERS_TYPES.EnrollmentRepo) private readonly enrollmentRepo: EnrollmentRepository,
    @inject(GLOBAL_TYPES.CourseRepo) private readonly courseRepo: CourseRepository,
  ) {}

  public async getStudentCourses(userId: string): Promise<any[]> {
    // Return courses that the user is enrolled in
    const enrollments = await this.enrollmentRepo.getAllEnrollments(userId);
    const coursePromises = enrollments.map(async (enrollment: any) => {
      const courseIdStr = enrollment.courseId?.toString() || enrollment.course?.toString();
      const versionIdStr = enrollment.courseVersionId?.toString();
      const course = await this.courseRepo.read(courseIdStr);

      let progressPercent = 0;
      let completedCount = 0;
      let totalCount = 0;
      const completedMilestones = enrollment.arenaProgress?.completedMilestones || [];

      try {
        const livePercent = Number(enrollment.percentCompleted ?? 0);
        totalCount = enrollment.contentCounts?.totalItems || 0;
        completedCount = enrollment.contentCounts?.completedItems || 0;
        progressPercent = livePercent;
      } catch (err) {
        console.error('Error calculating progress percent for arena:', err);
      }

      const eligibility = evaluateArenaEligibility(progressPercent, completedMilestones);
      const isInfinite = course?.infiniteArenaEnabled ?? false;
      if (isInfinite) {
        eligibility.availableCredits = 999;
      }

      return {
        courseId: courseIdStr,
        courseName: course?.name || 'Unknown Course',
        versionId: versionIdStr,
        role: enrollment.role,
        status: enrollment.status,
        progressPercent: progressPercent,
        completedCount: completedCount,
        totalCount: totalCount,
        completedMilestones,
        infiniteArenaEnabled: isInfinite,
        eligibility,
      };
    });
    return Promise.all(coursePromises);
  }

  public async getArenaStatus(userId: string, courseId: string): Promise<any> {
    const enrollments = await this.enrollmentRepo.getAllEnrollments(userId);
    const enrollment = enrollments.find(
      (e: any) => (e.courseId?.toString() === courseId || e.course?.toString() === courseId) && e.status === 'ACTIVE'
    );

    const course = await this.courseRepo.read(courseId);
    const isInfinite = course?.infiniteArenaEnabled ?? false;

    const percentCompleted = Number(enrollment?.percentCompleted ?? 0);
    const completedMilestones: number[] = enrollment?.arenaProgress?.completedMilestones || [];

    const eligibility = evaluateArenaEligibility(percentCompleted, completedMilestones);
    if (isInfinite) {
      eligibility.availableCredits = 999;
    }

    return {
      percentCompleted,
      completedMilestones,
      infiniteArenaEnabled: isInfinite,
      availableCredits: isInfinite ? 999 : eligibility.availableCredits,
      activeTier: eligibility.activeTier,
      nextLockedTier: eligibility.nextLockedTier,
      unlockedTiers: eligibility.unlockedTiers,
      playableTiers: eligibility.playableTiers,
      isFullyCompleted: eligibility.isFullyCompleted,
    };
  }

  public async getCourseProgress(userId: string, courseId: string): Promise<any> {
    return this.getArenaStatus(userId, courseId);
  }

  public async completeMilestone(userId: string, courseId: string, milestoneThreshold: number): Promise<any> {
    const enrollments = await this.enrollmentRepo.getAllEnrollments(userId);
    const enrollment = enrollments.find(
      (e: any) => (e.courseId?.toString() === courseId || e.course?.toString() === courseId) && e.status === 'ACTIVE'
    );

    if (!enrollment || !enrollment._id) {
      throw new Error('Active enrollment not found for this course.');
    }

    const validThresholds = [30, 50, 70, 90, 100];
    if (!validThresholds.includes(milestoneThreshold)) {
      throw new Error(`Invalid milestone threshold: ${milestoneThreshold}. Must be one of [30, 50, 70, 90, 100].`);
    }

    await this.enrollmentRepo.addCompletedMilestone(enrollment._id.toString(), milestoneThreshold);

    return this.getArenaStatus(userId, courseId);
  }

  public async consumeCredit(userId: string, courseId: string, milestoneThreshold?: number, baitHp?: number): Promise<any> {
    return this.recordTurn(userId, courseId, milestoneThreshold, baitHp);
  }

  public async recordTurn(userId: string, courseId: string, activeThreshold?: number, baitHp?: number): Promise<any> {
    const enrollments = await this.enrollmentRepo.getAllEnrollments(userId);
    const enrollment = enrollments.find(
      (e: any) => (e.courseId?.toString() === courseId || e.course?.toString() === courseId) && e.status === 'ACTIVE'
    );

    if (!enrollment || !enrollment._id) {
      throw new Error('Active enrollment not found for this course.');
    }

    const percentCompleted = Number(enrollment.percentCompleted ?? 0);
    const completedMilestones: number[] = enrollment.arenaProgress?.completedMilestones || [];
    const eligibility = evaluateArenaEligibility(percentCompleted, completedMilestones);

    const thresholdToRecord = activeThreshold || eligibility.activeTier?.threshold;
    if (!thresholdToRecord) {
      throw new Error('No active milestone tier available to play.');
    }

    const updatedDoc = await this.enrollmentRepo.recordTurn(enrollment._id.toString(), thresholdToRecord);
    const freshStatus = await this.getArenaStatus(userId, courseId);

    return {
      success: true,
      arenaProgress: updatedDoc?.arenaProgress || freshStatus.arenaProgress,
      status: freshStatus,
    };
  }

  public async getUserCollection(userId: string, courseId: string): Promise<UserCard[]> {
    return this.arenaRepo.getUserCards(userId, courseId);
  }

  public async getUserDeck(userId: string, courseId: string): Promise<Deck | null> {
    return this.arenaRepo.getDeck(userId, courseId);
  }

  public async saveUserDeck(userId: string, courseId: string, cards: string[]): Promise<Deck> {
    if (cards.length < 20 || cards.length > 30) {
      throw new Error('Deck must contain between 20 and 30 cards.');
    }
    
    const deck = new Deck({ userId, courseId, cards });
    await this.arenaRepo.saveDeck(deck);
    return deck;
  }
}
