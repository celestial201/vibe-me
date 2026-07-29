import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { INotification } from '#root/shared/interfaces/models.js';

function toObjectId(id: string | ObjectId | undefined | null): ObjectId | string | undefined | null {
  if (!id) return id;
  if (id instanceof ObjectId) return id;
  const str = String(id);
  if (ObjectId.isValid(str) && String(new ObjectId(str)) === str) {
    return new ObjectId(str);
  }
  return str;
}

@injectable()
export class NotificationRepository {
  private notifications!: Collection<INotification>;

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private async init() {
    this.notifications = await this.db.getCollection<INotification>('classroom_notifications');
    await this.notifications.createIndex({ user_id: 1, is_read: 1, createdAt: -1 });
  }

  async create(data: Partial<INotification>): Promise<INotification> {
    await this.init();
    const now = new Date();
    const doc = {
      ...data,
      user_id: toObjectId(data.user_id as string),
      classroom_id: data.classroom_id ? toObjectId(data.classroom_id as string) : undefined,
      is_read: false,
      createdAt: now,
    };
    const result = await this.notifications.insertOne(doc as any);
    return { ...doc, _id: result.insertedId.toString() } as INotification;
  }

  async createBulk(notifications: Partial<INotification>[]): Promise<void> {
    await this.init();
    if (!notifications || notifications.length === 0) return;
    const now = new Date();
    const docs = notifications.map(n => ({
      ...n,
      user_id: toObjectId(n.user_id as string),
      classroom_id: n.classroom_id ? toObjectId(n.classroom_id as string) : undefined,
      is_read: false,
      createdAt: now,
    }));
    await this.notifications.insertMany(docs as any);
  }

  async findUnreadByUser(userId: string, classroomId?: string): Promise<INotification[]> {
    await this.init();
    const uOid = toObjectId(userId);
    const cOid = classroomId ? toObjectId(classroomId) : undefined;

    const queryConditions: any[] = [
      {
        $or: [
          { user_id: userId },
          ...(uOid && uOid !== userId ? [{ user_id: uOid }] : []),
        ],
      },
      { is_read: false },
    ];

    if (classroomId) {
      queryConditions.push({
        $or: [
          { classroom_id: classroomId },
          ...(cOid && cOid !== classroomId ? [{ classroom_id: cOid }] : []),
        ],
      });
    }

    const docs = await this.notifications
      .find({ $and: queryConditions } as any)
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map(this._map);
  }

  async markAsRead(id: string, userId: string): Promise<boolean> {
    await this.init();
    const uOid = toObjectId(userId);
    const nOid = toObjectId(id);

    const result = await this.notifications.updateOne(
      {
        _id: nOid as any,
        $or: [
          { user_id: userId },
          ...(uOid && uOid !== userId ? [{ user_id: uOid }] : []),
        ],
      } as any,
      { $set: { is_read: true } }
    );
    return result.modifiedCount > 0;
  }

  private _map = (doc: any): INotification => ({
    ...doc,
    _id: doc._id?.toString(),
    user_id: doc.user_id?.toString(),
    classroom_id: doc.classroom_id?.toString(),
  });
}
