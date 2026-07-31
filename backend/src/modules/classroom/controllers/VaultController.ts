import { JsonController, Get, Post, Delete, Param, Body, CurrentUser, Authorized } from 'routing-controllers';
import { injectable, inject } from 'inversify';
import { VaultService } from '../services/VaultService.js';
import { CLASSROOM_TYPES } from '../types.js';
import { IsString, IsIn, IsOptional } from 'class-validator';
import { IUser } from '#root/shared/interfaces/models.js';

class CreateVaultItemDto {
  @IsString()
  title: string;

  @IsString()
  @IsIn(['link', 'pdf', 'csv', 'other'])
  type: 'link' | 'pdf' | 'csv' | 'other';

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@JsonController('/classroom/:classroomId/vault')
@Authorized()
@injectable()
export class VaultController {
  constructor(
    @inject(CLASSROOM_TYPES.VaultService) private vaultService: VaultService
  ) {}

  @Get('/')
  async getVaultItems(@Param('classroomId') classroomId: string) {
    return this.vaultService.getVaultItemsByClassroomId(classroomId);
  }

  @Post('/')
  async createVaultItem(
    @Param('classroomId') classroomId: string,
    @Body() body: CreateVaultItemDto,
    @CurrentUser() user: IUser
  ) {
    return this.vaultService.createVaultItem({
      ...body,
      classroom_id: classroomId,
      instructor_id: user._id?.toString() ?? '',
    });
  }

  @Delete('/:itemId')
  async deleteVaultItem(
    @Param('classroomId') classroomId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: IUser
  ) {
    await this.vaultService.deleteVaultItem(itemId, user._id?.toString() ?? '');
    return { success: true };
  }
}
