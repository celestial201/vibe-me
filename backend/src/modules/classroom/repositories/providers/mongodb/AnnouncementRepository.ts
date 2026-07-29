import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IClassroomAnnouncement } from '#root/shared/interfaces/models.js';

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
export class AnnouncementRepository {
  private announcements!: Collection<IClassroomAnnouncement>;

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private async init() {
    this.announcements = await this.db.getCollection<IClassroomAnnouncement>('classroom_announcements');
    await this.announcements.createIndex({ classroom_id: 1, createdAt: -1 });
  }

  async create(data: Partial<IClassroomAnnouncement>): Promise<IClassroomAnnouncement> {
    await this.init();
    const now = new Date();
    const doc = {
      ...data,
      classroom_id: toObjectId(data.classroom_id as string),
      author_id: toObjectId(data.author_id as string),
      attachments: data.attachments || [],
      status: data.status || 'approved',
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.announcements.insertOne(doc as any);
    return { ...doc, _id: result.insertedId.toString() } as IClassroomAnnouncement;
  }

  async findById(id: string): Promise<IClassroomAnnouncement | null> {
    await this.init();
    const doc = await this.announcements.findOne({ _id: toObjectId(id) as any });
    if (!doc) return null;
    return this._map(doc);
  }

  async findByClassroom(classroomId: string): Promise<IClassroomAnnouncement[]> {
    await this.init();
    const cOid = toObjectId(classroomId);
    const docs = await this.announcements
      .find({
        $and: [
          {
            $or: [
              { classroom_id: classroomId },
              ...(cOid && cOid !== classroomId ? [{ classroom_id: cOid }] : []),
            ],
          },
          { status: 'approved' },
        ],
      } as any)
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(this._map);
  }

  async findPendingByClassroom(classroomId: string): Promise<IClassroomAnnouncement[]> {
    await this.init();
    const cOid = toObjectId(classroomId);
    const docs = await this.announcements
      .find({
        $and: [
          {
            $or: [
              { classroom_id: classroomId },
              ...(cOid && cOid !== classroomId ? [{ classroom_id: cOid }] : []),
            ],
          },
          { status: 'pending' },
        ],
      } as any)
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(this._map);
  }

  async updateStatus(id: string, status: 'approved' | 'rejected'): Promise<IClassroomAnnouncement | null> {
    await this.init();
    const result = await this.announcements.findOneAndUpdate(
      { _id: toObjectId(id) as any },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return this._map(result);
  }

  async delete(id: string): Promise<void> {
    await this.init();
    await this.announcements.deleteOne({ _id: toObjectId(id) as any });
  }

  private _map = (doc: any): IClassroomAnnouncement => ({
    ...doc,
    _id: doc._id?.toString(),
    classroom_id: doc.classroom_id?.toString(),
    author_id: doc.author_id?.toString(),
  });
}
