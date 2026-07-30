import { ID } from '#root/shared/interfaces/models.js';
import { Expose, Transform, Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';
import { ObjectIdToString, StringToObjectId } from '#root/shared/constants/transformerConstants.js';

export class BattleSession {
  @Expose()
  @JSONSchema({ title: 'Battle ID', type: 'string' })
  @Transform(ObjectIdToString.transformer, { toPlainOnly: true })
  @Transform(StringToObjectId.transformer, { toClassOnly: true })
  _id?: ID;

  @Expose()
  @JSONSchema({ title: 'User ID', type: 'string' })
  userId: string;

  @Expose()
  @JSONSchema({ title: 'Course ID', type: 'string' })
  courseId: string;

  @Expose()
  @JSONSchema({ title: 'Total Points', type: 'number' })
  totalPoints: number;

  @Expose()
  @JSONSchema({ title: 'Computer Score', type: 'number' })
  computerScore: number;

  @Expose()
  @JSONSchema({ title: 'HP Milestone Progress', type: 'number' })
  hpMilestoneProgress: number;

  @Expose()
  @JSONSchema({ title: 'Power-Up Milestone Progress', type: 'number' })
  powerUpMilestoneProgress: number;

  @Expose()
  @JSONSchema({ title: 'Last Power Card Milestone Achieved', type: 'number' })
  lastPowerCardMilestoneAchieved: number;

  @Expose()
  @JSONSchema({ title: 'Inventory', type: 'array', items: { type: 'string' } })
  inventory: string[];

  @Expose()
  @JSONSchema({ title: 'Active Power-Ups', type: 'array', items: { type: 'string' } })
  activePowerUps: string[];

  @Expose()
  @JSONSchema({ title: 'Permanent Multiplier', type: 'number' })
  permanentMultiplier: number;

  @Expose()
  @JSONSchema({ title: 'Consecutive Wins', type: 'number' })
  consecutiveWins: number;

  @Expose()
  @JSONSchema({ title: 'Turn Number', type: 'number' })
  turnNumber: number;

  @Expose()
  @JSONSchema({ title: 'Current Round', type: 'number' })
  currentRound: number;

  @Expose()
  @JSONSchema({ title: 'Max Rounds', type: 'number' })
  maxRounds: number;

  @Expose()
  @JSONSchema({ title: 'Extended', type: 'boolean' })
  extended: boolean;

  @Expose()
  @JSONSchema({ title: 'Status', type: 'string' })
  status: string;

  @Expose()
  @JSONSchema({ title: 'Is Active', type: 'boolean' })
  isActive: boolean;

  @Expose()
  @JSONSchema({ title: 'Current Question', type: 'object' })
  currentQuestion?: any;

  @Expose()
  @JSONSchema({ title: 'Cached Questions', type: 'array', items: { type: 'object' } })
  cachedQuestions?: any[];

  @Expose()
  @Type(() => Date)
  @JSONSchema({ title: 'Created At', type: 'string', format: 'date-time' })
  createdAt: Date;

  constructor(partial?: Partial<BattleSession>) {
    this.userId = partial?.userId || '';
    this.courseId = partial?.courseId || '';
    this.totalPoints = partial?.totalPoints ?? 0;
    this.computerScore = partial?.computerScore ?? 0;
    this.hpMilestoneProgress = partial?.hpMilestoneProgress ?? 0;
    this.powerUpMilestoneProgress = partial?.powerUpMilestoneProgress ?? 0;
    this.lastPowerCardMilestoneAchieved = partial?.lastPowerCardMilestoneAchieved ?? 0;
    this.inventory = partial?.inventory ?? [];
    this.activePowerUps = partial?.activePowerUps ?? [];
    this.permanentMultiplier = partial?.permanentMultiplier ?? 1.0;
    this.consecutiveWins = partial?.consecutiveWins ?? 0;
    this.turnNumber = partial?.turnNumber ?? 1;
    this.currentRound = partial?.currentRound ?? 1;
    this.maxRounds = partial?.maxRounds ?? 5;
    this.extended = partial?.extended ?? false;
    this.status = partial?.status || 'ACTIVE';
    this.isActive = partial?.isActive ?? true;
    this.currentQuestion = partial?.currentQuestion || null;
    this.cachedQuestions = partial?.cachedQuestions ?? [];
    this.createdAt = new Date();
  }
}
