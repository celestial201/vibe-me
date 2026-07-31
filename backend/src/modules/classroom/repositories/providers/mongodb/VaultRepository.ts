import { injectable, inject } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { IClassroomVaultItem } from '#root/shared/interfaces/models.js';
import { IVaultRepository } from '../../interfaces/IVaultRepository.js';

@injectable()
export class VaultRepository implements IVaultRepository {
  private collectionName = 'classroomVaultItems';

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private getCollection(): Collection<IClassroomVaultItem> {
    if (!this.db.database) throw new Error('Database not connected');
    return this.db.database.collection<IClassroomVaultItem>(this.collectionName);
  }

  async create(data: IClassroomVaultItem): Promise<IClassroomVaultItem> {
    const col = this.getCollection();
    const result = await col.insertOne(data);
    return { ...data, _id: result.insertedId };
  }

  async findByClassroomId(classroomId: string): Promise<IClassroomVaultItem[]> {
    const col = this.getCollection();
    return col
      .find({ classroom_id: new ObjectId(classroomId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async findById(id: string): Promise<IClassroomVaultItem | null> {
    const col = this.getCollection();
    return col.findOne({ _id: new ObjectId(id) });
  }

  async delete(id: string): Promise<void> {
    const col = this.getCollection();
    await col.deleteOne({ _id: new ObjectId(id) });
  }
}
