import { injectable, inject } from 'inversify';
import { IVaultRepository } from '../repositories/interfaces/IVaultRepository.js';
import { IClassroomVaultItem } from '#root/shared/interfaces/models.js';
import { CLASSROOM_TYPES } from '../types.js';
import { ObjectId } from 'mongodb';

@injectable()
export class VaultService {
  constructor(
    @inject(CLASSROOM_TYPES.VaultRepository)
    private vaultRepo: IVaultRepository,
  ) {}

  async createVaultItem(data: Omit<IClassroomVaultItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<IClassroomVaultItem> {
    const item: IClassroomVaultItem = {
      ...data,
      classroom_id: new ObjectId(data.classroom_id),
      instructor_id: new ObjectId(data.instructor_id),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return this.vaultRepo.create(item);
  }

  async getVaultItemsByClassroomId(classroomId: string): Promise<IClassroomVaultItem[]> {
    return this.vaultRepo.findByClassroomId(classroomId);
  }

  async deleteVaultItem(itemId: string, instructorId: string): Promise<void> {
    const item = await this.vaultRepo.findById(itemId);
    if (!item) throw new Error('Vault item not found');
    if (item.instructor_id.toString() !== instructorId) throw new Error('Not authorized');
    return this.vaultRepo.delete(itemId);
  }
}
