import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IDailyJournal } from '#root/shared/interfaces/models.js';

@injectable()
export class JournalRepository {
  private journals!: Collection<IDailyJournal>;

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private async init() {
    this.journals = await this.db.getCollection<IDailyJournal>('classroom_daily_journals');
    await this.journals.createIndex({ classroom_id: 1, day_number: 1 }, { unique: true });
  }

  async findByClassroom(classroomId: string): Promise<IDailyJournal[]> {
    await this.init();
    if (!classroomId) return [];

    const oid = ObjectId.isValid(classroomId) ? new ObjectId(classroomId) : null;
    const docs = await this.journals
      .find({
        $or: [
          { classroom_id: classroomId as any },
          ...(oid ? [{ classroom_id: oid as any }] : []),
        ],
      })
      .toArray();

    return docs.map(d => ({
      ...d,
      _id: d._id?.toString(),
      classroom_id: d.classroom_id?.toString(),
    }));
  }

  async upsertJournal(
    classroomId: string,
    dayNumber: number,
    data: { title?: string; content_link?: string; journal_entry?: string; date?: Date }
  ): Promise<IDailyJournal> {
    await this.init();
    const oid = ObjectId.isValid(classroomId) ? new ObjectId(classroomId) : null;
    const query = {
      $or: [
        { classroom_id: classroomId as any, day_number: dayNumber },
        ...(oid ? [{ classroom_id: oid as any, day_number: dayNumber }] : []),
      ],
    };

    const update = {
      $set: {
        classroom_id: oid || classroomId,
        day_number: dayNumber,
        title: data.title || '',
        content_link: data.content_link || '',
        journal_entry: data.journal_entry || '',
        date: data.date ? new Date(data.date) : new Date(),
        updatedAt: new Date(),
      },
    };

    const result = await this.journals.findOneAndUpdate(
      query as any,
      update as any,
      { upsert: true, returnDocument: 'after' }
    );

    return {
      ...result,
      _id: result?._id?.toString(),
      classroom_id: result?.classroom_id?.toString(),
    } as IDailyJournal;
  }
}
