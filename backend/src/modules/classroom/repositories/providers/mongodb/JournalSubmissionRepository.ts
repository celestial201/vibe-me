import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IJournalSubmission } from '#root/shared/interfaces/models.js';

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
export class JournalSubmissionRepository {
  private submissions!: Collection<IJournalSubmission>;

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private async init() {
    this.submissions = await this.db.getCollection<IJournalSubmission>('classroom_journal_submissions');
    await this.submissions.createIndex(
      { student_id: 1, classroom_id: 1, day_number: 1 },
      { unique: true }
    );
  }

  async markCompleted(studentId: string, classroomId: string, dayNumber: number): Promise<IJournalSubmission> {
    await this.init();
    const sOid = toObjectId(studentId);
    const cOid = toObjectId(classroomId);

    const query = {
      student_id: sOid || studentId,
      classroom_id: cOid || classroomId,
      day_number: Number(dayNumber),
    };

    const update = {
      $set: {
        student_id: sOid || studentId,
        classroom_id: cOid || classroomId,
        day_number: Number(dayNumber),
        is_completed: true,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    };

    const result = await this.submissions.findOneAndUpdate(
      query as any,
      update as any,
      { upsert: true, returnDocument: 'after' }
    );

    return {
      ...result,
      _id: result?._id?.toString(),
      student_id: result?.student_id?.toString(),
      classroom_id: result?.classroom_id?.toString(),
    } as IJournalSubmission;
  }

  async findCompletedDays(studentId: string, classroomId: string): Promise<number[]> {
    await this.init();
    const sOid = toObjectId(studentId);
    const cOid = toObjectId(classroomId);

    const docs = await this.submissions
      .find({
        $and: [
          {
            $or: [
              { student_id: studentId },
              ...(sOid && sOid !== studentId ? [{ student_id: sOid }] : []),
            ],
          },
          {
            $or: [
              { classroom_id: classroomId },
              ...(cOid && cOid !== classroomId ? [{ classroom_id: cOid }] : []),
            ],
          },
          { is_completed: true },
        ],
      } as any)
      .toArray();

    return docs.map(d => Number(d.day_number));
  }
}
