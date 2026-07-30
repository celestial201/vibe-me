import { JsonController, Get, Patch, Body, Param, Authorized, CurrentUser } from 'routing-controllers';
import { inject, injectable } from 'inversify';
import { ArenaMonitorService } from '../services/ArenaMonitorService.js';

@JsonController('/arena-monitor')
@injectable()
export class ArenaMonitorController {
  constructor(
    @inject('ArenaMonitorService') private readonly monitorService: ArenaMonitorService
  ) {}

  @Get('/courses')
  @Authorized()
  public async getCourses(@CurrentUser() user: any) {
    if (!user || !user._id) throw new Error('Unauthorized');
    return this.monitorService.getTeacherCoursesWithStats(user._id.toString());
  }

  @Patch('/courses/:courseId/infinite-creds')
  @Authorized()
  public async toggleInfiniteCredits(
    @CurrentUser() user: any,
    @Param('courseId') courseId: string,
    @Body() body: { enabled: boolean }
  ) {
    if (!user || !user._id) throw new Error('Unauthorized');
    return this.monitorService.toggleInfiniteCredits(courseId, body.enabled);
  }
}
