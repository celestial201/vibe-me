import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IClassroomAssignment } from '#root/shared/interfaces/models.js';

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
export class AssignmentRepository {
  private assignments!: Collection<IClassroomAssignment>;

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private async init() {
    this.assignments = await this.db.getCollection<IClassroomAssignment>('classroom_assignments');
    await this.assignments.createIndex({ classroom_id: 1, due_date: 1 });
  }

  async create(data: Partial<IClassroomAssignment>): Promise<IClassroomAssignment> {
    await this.init();
    const now = new Date();
    const doc = {
      ...data,
      classroom_id: toObjectId(data.classroom_id as string),
      instructor_id: toObjectId(data.instructor_id as string),
      points: data.points ?? 100,
      due_date: new Date(data.due_date!),
      attachments: data.attachments || [],
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.assignments.insertOne(doc as any);
    return { ...doc, _id: result.insertedId.toString() } as IClassroomAssignment;
  }

  async findById(id: string): Promise<IClassroomAssignment | null> {
    await this.init();
    const doc = await this.assignments.findOne({ _id: toObjectId(id) as any });
    if (!doc) return null;
    return this._map(doc);
  }

  async findByClassroom(classroomId: string): Promise<IClassroomAssignment[]> {
    await this.init();
    const cOid = toObjectId(classroomId);
    const docs = await this.assignments
      .find({
        $or: [
          { classroom_id: classroomId },
          ...(cOid && cOid !== classroomId ? [{ classroom_id: cOid }] : []),
        ],
      } as any)
      .sort({ due_date: 1 })
      .toArray();
    return docs.map(this._map);
  }

  async update(id: string, data: Partial<IClassroomAssignment>): Promise<IClassroomAssignment | null> {
    await this.init();
    const { _id, ...rest } = data as any;
    if (rest.due_date) rest.due_date = new Date(rest.due_date);
    rest.updatedAt = new Date();
    const result = await this.assignments.findOneAndUpdate(
      { _id: toObjectId(id) as any },
      { $set: rest },
      { returnDocument: 'after' },
    );
    if (!result) return null;
    return this._map(result);
  }

  async delete(id: string): Promise<void> {
    await this.init();
    await this.assignments.deleteOne({ _id: toObjectId(id) as any });
  }

  private _map = (doc: any): IClassroomAssignment => ({
    ...doc,
    _id: doc._id?.toString(),
    classroom_id: doc.classroom_id?.toString(),
    instructor_id: doc.instructor_id?.toString(),
    due_date: doc.due_date ? new Date(doc.due_date) : new Date(),
  });
}
