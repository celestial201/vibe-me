import { IClassroomVaultItem } from '#root/shared/interfaces/models.js';

export interface IVaultRepository {
  create(data: IClassroomVaultItem): Promise<IClassroomVaultItem>;
  findByClassroomId(classroomId: string): Promise<IClassroomVaultItem[]>;
  findById(id: string): Promise<IClassroomVaultItem | null>;
  delete(id: string): Promise<void>;
}
