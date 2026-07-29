import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IClassroomSubmission, SubmissionStatus } from '#root/shared/interfaces/models.js';

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
export class SubmissionRepository {
  private submissions!: Collection<IClassroomSubmission>;

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private async init() {
    this.submissions = await this.db.getCollection<IClassroomSubmission>('classroom_submissions');
    await this.submissions.createIndex({ assignment_id: 1, student_id: 1 }, { unique: true });
    await this.submissions.createIndex({ classroom_id: 1, student_id: 1 });
  }

  async upsertSubmission(
    assignmentId: string,
    classroomId: string,
    studentId: string,
    submittedFiles: string[],
  ): Promise<IClassroomSubmission> {
    await this.init();
    const now = new Date();
    const aOid = toObjectId(assignmentId);
    const cOid = toObjectId(classroomId);
    const sOid = toObjectId(studentId);

    const filter = {
      $or: [
        { assignment_id: assignmentId },
        ...(aOid && aOid !== assignmentId ? [{ assignment_id: aOid }] : []),
      ],
      $and: [
        {
          $or: [
            { student_id: studentId },
            ...(sOid && sOid !== studentId ? [{ student_id: sOid }] : []),
          ],
        },
      ],
    };

    const existing = await this.submissions.findOne(filter as any);

    if (existing) {
      const updateData: Partial<IClassroomSubmission> = {
        submitted_files: submittedFiles,
        status: 'submitted' as SubmissionStatus,
        submitted_at: now,
        updatedAt: now,
      };
      const result = await this.submissions.findOneAndUpdate(
        { _id: existing._id },
        { $set: updateData },
        { returnDocument: 'after' },
      );
      return this._map(result!);
    } else {
      const doc: Partial<IClassroomSubmission> = {
        assignment_id: aOid as any,
        classroom_id: cOid as any,
        student_id: sOid as any,
        status: 'submitted' as SubmissionStatus,
        submitted_files: submittedFiles,
        submitted_at: now,
        createdAt: now,
        updatedAt: now,
      };
      const result = await this.submissions.insertOne(doc as any);
      return { ...doc, _id: result.insertedId.toString() } as IClassroomSubmission;
    }
  }

  async findByAssignment(assignmentId: string): Promise<IClassroomSubmission[]> {
    await this.init();
    const aOid = toObjectId(assignmentId);
    const docs = await this.submissions
      .find({
        $or: [
          { assignment_id: assignmentId },
          ...(aOid && aOid !== assignmentId ? [{ assignment_id: aOid }] : []),
        ],
      } as any)
      .toArray();
    return docs.map(this._map);
  }

  async findByStudentAndClassroom(studentId: string, classroomId: string): Promise<IClassroomSubmission[]> {
    await this.init();
    const cOid = toObjectId(classroomId);
    const sOid = toObjectId(studentId);
    const docs = await this.submissions
      .find({
        $or: [
          { classroom_id: classroomId },
          ...(cOid && cOid !== classroomId ? [{ classroom_id: cOid }] : []),
        ],
        $and: [
          {
            $or: [
              { student_id: studentId },
              ...(sOid && sOid !== studentId ? [{ student_id: sOid }] : []),
            ],
          },
        ],
      } as any)
      .toArray();
    return docs.map(this._map);
  }

  async findByClassroom(classroomId: string): Promise<IClassroomSubmission[]> {
    await this.init();
    const cOid = toObjectId(classroomId);
    const docs = await this.submissions
      .find({
        $or: [
          { classroom_id: classroomId },
          ...(cOid && cOid !== classroomId ? [{ classroom_id: cOid }] : []),
        ],
      } as any)
      .toArray();
    return docs.map(this._map);
  }

  async findById(id: string): Promise<IClassroomSubmission | null> {
    await this.init();
    const doc = await this.submissions.findOne({ _id: toObjectId(id) as any });
    if (!doc) return null;
    return this._map(doc);
  }

  async gradeSubmission(
    submissionId: string,
    grade: number,
    teacherFeedback?: string,
  ): Promise<IClassroomSubmission | null> {
    await this.init();
    const now = new Date();
    const result = await this.submissions.findOneAndUpdate(
      { _id: toObjectId(submissionId) as any },
      {
        $set: {
          grade,
          teacher_feedback: teacherFeedback ?? '',
          status: 'returned' as SubmissionStatus,
          graded_at: now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    if (!result) return null;
    return this._map(result);
  }

  private _map = (doc: any): IClassroomSubmission => ({
    ...doc,
    _id: doc._id?.toString(),
    assignment_id: doc.assignment_id?.toString(),
    classroom_id: doc.classroom_id?.toString(),
    student_id: doc.student_id?.toString(),
    submitted_at: doc.submitted_at ? new Date(doc.submitted_at) : undefined,
    graded_at: doc.graded_at ? new Date(doc.graded_at) : undefined,
  });
}
