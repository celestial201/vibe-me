import { inject, injectable } from 'inversify';
import { Authorized, CurrentUser, Get, JsonController, Param, Patch, QueryParam } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { IUser } from '#root/shared/interfaces/models.js';
import { CLASSROOM_TYPES } from '../types.js';
import { NotificationRepository } from '../repositories/providers/mongodb/NotificationRepository.js';

@Authorized()
@JsonController('/notifications')
@injectable()
export class NotificationController {
  constructor(
    @inject(CLASSROOM_TYPES.NotificationRepository)
    private readonly notificationRepo: NotificationRepository,
  ) {}

  @OpenAPI({ summary: 'Get unread notifications for current user' })
  @Get('')
  async getUnreadNotifications(
    @CurrentUser() user: IUser,
    @QueryParam('classroomId') classroomId?: string,
  ) {
    const userId = user._id?.toString() ?? '';
    return this.notificationRepo.findUnreadByUser(userId, classroomId);
  }

  @OpenAPI({ summary: 'Mark all notifications as read' })
  @Patch('/read-all')
  async markAllAsRead(
    @CurrentUser() user: IUser,
    @QueryParam('classroomId') classroomId?: string,
  ) {
    const userId = user._id?.toString() ?? '';
    const success = await this.notificationRepo.markAllAsRead(userId, classroomId);
    return { success };
  }

  @OpenAPI({ summary: 'Mark notification as read' })
  @Patch('/:id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser() user: IUser) {
    const userId = user._id?.toString() ?? '';
    const success = await this.notificationRepo.markAsRead(id, userId);
    return { success };
  }
}
