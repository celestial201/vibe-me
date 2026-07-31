import { JsonController, Get, Post, Body, Req, Res, Param, Authorized, CurrentUser } from 'routing-controllers';
import { inject, injectable } from 'inversify';
import { ArenaService, BattleService, SseManager } from '../services/index.js';
import { Request, Response } from 'express';

@JsonController('/arena')
@injectable()
export class ArenaController {
  constructor(
    @inject('ArenaService') private readonly arenaService: ArenaService,
    @inject('BattleService') private readonly battleService: BattleService
  ) {}

  @Get('/events/stream')
  public streamEvents(@Req() req: Request, @Res() res: Response) {
    req.socket.setTimeout(0);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Arena Event Stream Established' })}\n\n`);

    const sseManager = SseManager.getInstance();
    sseManager.addClient(res);

    req.on('close', () => {
      sseManager.removeClient(res);
    });

    return res;
  }

  @Get('/courses')
  @Authorized()
  public async getCourses(@CurrentUser() user: any) {
    if (!user || !user._id) throw new Error('Unauthorized');
    return this.arenaService.getStudentCourses(user._id.toString());
  }

  @Get('/:courseId/collection')
  @Authorized()
  public async getCollection(@CurrentUser() user: any, @Param('courseId') courseId: string) {
    return this.arenaService.getUserCollection(user._id.toString(), courseId);
  }

  @Get('/:courseId/deck')
  @Authorized()
  public async getDeck(@CurrentUser() user: any, @Param('courseId') courseId: string) {
    return this.arenaService.getUserDeck(user._id.toString(), courseId);
  }

  @Post('/:courseId/deck')
  @Authorized()
  public async saveDeck(
    @CurrentUser() user: any,
    @Param('courseId') courseId: string,
    @Body() body: { cards: string[] }
  ) {
    return this.arenaService.saveUserDeck(user._id.toString(), courseId, body.cards);
  }

  @Post('/:courseId/battle/start')
  @Authorized()
  public async startBattle(@CurrentUser() user: any, @Param('courseId') courseId: string) {
    return this.battleService.startBattle(user._id.toString(), courseId);
  }

  @Post('/battle/:battleId/question')
  @Authorized()
  public async generateQuestion(@Param('battleId') battleId: string) {
    return this.battleService.generateQuestion(battleId);
  }

  @Post('/battle/:battleId/submit')
  @Authorized()
  public async submitAnswer(
    @Param('battleId') battleId: string,
    @Body() body: { cards: string[], powerUp?: string, powerUpSlotIndex?: number }
  ) {
    return this.battleService.submitAnswer(battleId, body.cards, body.powerUp, body.powerUpSlotIndex);
  }

  @Post('/battle/:battleId/extend')
  @Authorized()
  public async extendBattle(@Param('battleId') battleId: string) {
    return this.battleService.extendBattle(battleId);
  }

  @Post('/battle/:battleId/conclude')
  @Authorized()
  public async concludeBattle(@Param('battleId') battleId: string) {
    return this.battleService.concludeBattle(battleId);
  }

  @Get('/status/:courseId')
  @Authorized()
  public async getStatus(@CurrentUser() user: any, @Param('courseId') courseId: string) {
    if (!user || !user._id) throw new Error('Unauthorized');
    return this.arenaService.getArenaStatus(user._id.toString(), courseId);
  }

  @Get('/progress/:courseId')
  @Authorized()
  public async getProgress(@CurrentUser() user: any, @Param('courseId') courseId: string) {
    if (!user || !user._id) throw new Error('Unauthorized');
    return this.arenaService.getCourseProgress(user._id.toString(), courseId);
  }

  @Post('/complete-milestone')
  @Authorized()
  public async completeMilestone(
    @CurrentUser() user: any,
    @Body() body: { courseId: string; milestoneThreshold: number }
  ) {
    if (!user || !user._id) throw new Error('Unauthorized');
    return this.arenaService.completeMilestone(user._id.toString(), body.courseId, body.milestoneThreshold);
  }

  @Post('/consume-credit')
  @Authorized()
  public async consumeCredit(
    @CurrentUser() user: any,
    @Body() body: { courseId: string; milestoneThreshold?: number; baitHp?: number }
  ) {
    if (!user || !user._id) throw new Error('Unauthorized');
    return this.arenaService.consumeCredit(user._id.toString(), body.courseId, body.milestoneThreshold, body.baitHp);
  }

  @Post('/record-turn')
  @Authorized()
  public async recordTurn(
    @CurrentUser() user: any,
    @Body() body: { courseId: string; activeThreshold?: number; milestoneThreshold?: number; baitHp?: number }
  ) {
    if (!user || !user._id) throw new Error('Unauthorized');
    const threshold = body.activeThreshold || body.milestoneThreshold;
    return this.arenaService.recordTurn(user._id.toString(), body.courseId, threshold, body.baitHp);
  }
}
