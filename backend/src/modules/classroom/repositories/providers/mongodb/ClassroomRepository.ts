import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IClassroom, IClassroomCourse, IClassroomMember } from '#root/shared/interfaces/models.js';
import { IClassroomRepository } from '../../interfaces/IClassroomRepository.js';

function toObjectId(id: string | ObjectId | undefined | null): ObjectId | string | undefined | null {
  if (!id) return id;
  if (id instanceof ObjectId) return id;
  const str = String(id);
  if (ObjectId.isValid(str) && String(new ObjectId(str)) === str) {
    return new ObjectId(str);
  }
  return str;
}

function idQuery(id: string) {
  if (!id) return { _id: null };
  const oid = toObjectId(id);
  return {
    $or: [
      { _id: id },
      ...(oid && oid !== id ? [{ _id: oid }] : []),
    ],
  };
}

function fieldQuery(field: string, id: string) {
  if (!id) return { [field]: null };
  const oid = toObjectId(id);
  return {
    $or: [
      { [field]: id },
      ...(oid && oid !== id ? [{ [field]: oid }] : []),
    ],
  };
}

@injectable()
export class ClassroomRepository implements IClassroomRepository {
  private classrooms!: Collection<IClassroom>;
  private members!: Collection<IClassroomMember>;
  private courses!: Collection<IClassroomCourse>;

  constructor(@inject(GLOBAL_TYPES.Database) private db: MongoDatabase) {}

  private async init() {
    this.classrooms = await this.db.getCollection<IClassroom>('classrooms');
    this.members = await this.db.getCollection<IClassroomMember>('classroom_members');
    this.courses = await this.db.getCollection<IClassroomCourse>('classroom_courses');

    // Indexes
    await this.classrooms.createIndex({ code: 1 }, { unique: true });
    await this.classrooms.createIndex({ instructorId: 1 });
    await this.members.createIndex({ classroomId: 1, studentId: 1 }, { unique: true });
    await this.members.createIndex({ studentId: 1 });
    await this.courses.createIndex({ classroomId: 1, courseId: 1 }, { unique: true });
    await this.courses.createIndex({ classroomId: 1 });

    // Clean up any corrupt empty-studentId records from earlier bug
    try {
      await this.members.deleteMany({
        $or: [{ studentId: '' }, { studentId: null }, { studentId: 'undefined' }],
      } as any);
    } catch {
      // Ignore cleanup error
    }
  }

  // ── Classroom CRUD ──────────────────────────────────────────────────────────

  async create(data: IClassroom): Promise<IClassroom> {
    await this.init();
    const startDateRaw = data.start_date || data.internship_start_date;
    const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
    const endDateRaw = data.end_date || data.internship_end_date;
    const endDate = endDateRaw
      ? new Date(endDateRaw)
      : new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);

    const doc = {
      ...data,
      instructorId: toObjectId(data.instructorId as string),
      start_date: startDate,
      end_date: endDate,
      internship_start_date: startDate,
      internship_end_date: endDate,
    };
    const result = await this.classrooms.insertOne(doc as any);
    return { ...doc, _id: result.insertedId.toString() };
  }

  async findById(id: string): Promise<IClassroom | null> {
    await this.init();
    if (!id) return null;
    const doc = await this.classrooms.findOne(idQuery(id) as any);
    if (!doc) return null;
    return this._mapClassroom(doc);
  }

  async findByCode(code: string): Promise<IClassroom | null> {
    await this.init();
    const doc = await this.classrooms.findOne({ code: code.toUpperCase() });
    if (!doc) return null;
    return this._mapClassroom(doc);
  }

  async findByInstructorId(instructorId: string): Promise<IClassroom[]> {
    await this.init();
    const docs = await this.classrooms
      .find(fieldQuery('instructorId', instructorId) as any)
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(this._mapClassroom);
  }

  async update(id: string, data: Partial<IClassroom>): Promise<IClassroom | null> {
    await this.init();
    const { _id, ...rest } = data as any;
    rest.updatedAt = new Date();
    const result = await this.classrooms.findOneAndUpdate(
      idQuery(id) as any,
      { $set: rest },
      { returnDocument: 'after' },
    );
    if (!result) return null;
    return this._mapClassroom(result);
  }

  async delete(id: string): Promise<void> {
    await this.init();
    await this.classrooms.deleteOne(idQuery(id) as any);
  }

  // ── Members ─────────────────────────────────────────────────────────────────

  async addMember(member: IClassroomMember): Promise<IClassroomMember> {
    await this.init();
    const sIdStr = member.studentId ? String(member.studentId).trim() : '';
    const cIdStr = member.classroomId ? String(member.classroomId).trim() : '';
    if (!sIdStr || sIdStr === 'undefined' || sIdStr === 'null' || !cIdStr || cIdStr === 'undefined' || cIdStr === 'null') {
      throw new Error('Invalid studentId or classroomId provided for addMember');
    }
    const doc = {
      ...member,
      classroomId: toObjectId(cIdStr),
      studentId: toObjectId(sIdStr),
    };
    try {
      const result = await this.members.insertOne(doc as any);
      return { ...member, _id: result.insertedId.toString() };
    } catch (err: any) {
      if (err?.code === 11000) {
        const existing = await this.findMember(cIdStr, sIdStr);
        if (existing) return existing;
      }

      throw err;
    }
  }


  async findMember(classroomId: string, studentId: string): Promise<IClassroomMember | null> {
    await this.init();
    if (!classroomId || !studentId) return null;
    const doc = await this.members.findOne({
      $and: [
        fieldQuery('classroomId', classroomId),
        fieldQuery('studentId', studentId),
      ],
    } as any);
    if (!doc) return null;
    return this._mapMember(doc);
  }

  async findMembersByClassroom(classroomId: string): Promise<IClassroomMember[]> {
    await this.init();
    const docs = await this.members
      .find(fieldQuery('classroomId', classroomId) as any)
      .sort({ joinedAt: -1 })
      .toArray();
    return docs.map(this._mapMember);
  }

  async findClassroomsByStudent(
    studentId: string,
  ): Promise<{ classroom: IClassroom; joinedAt: Date }[]> {
    await this.init();
    if (!studentId) return [];

    const oid = toObjectId(studentId);
    const studentMatch = {
      $or: [
        { studentId: studentId },
        ...(oid && oid !== studentId ? [{ studentId: oid }] : []),
      ],
    };

    const pipeline = [
      { $match: studentMatch },
      { $sort: { joinedAt: -1 } },
      {
        $lookup: {
          from: 'classrooms',
          let: { classId: '$classroomId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$classId'] },
                    { $eq: [{ $toString: '$_id' }, { $toString: '$$classId' }] },
                  ],
                },
              },
            },
          ],
          as: 'classroomDoc',
        },
      },
      { $unwind: '$classroomDoc' },
    ];

    const aggregated = await this.members.aggregate(pipeline).toArray();

    if (aggregated.length > 0) {
      return aggregated.map((doc: any) => ({
        classroom: this._mapClassroom(doc.classroomDoc),
        joinedAt: doc.joinedAt,
      }));
    }

    // Fallback lookup if aggregate pipeline returned 0 results
    const memberDocs = await this.members
      .find(fieldQuery('studentId', studentId) as any)
      .sort({ joinedAt: -1 })
      .toArray();

    const results: { classroom: IClassroom; joinedAt: Date }[] = [];
    for (const m of memberDocs) {
      const cId = m.classroomId ? m.classroomId.toString() : '';
      if (cId) {
        const classroom = await this.findById(cId);
        if (classroom) results.push({ classroom, joinedAt: m.joinedAt });
      }
    }
    return results;
  }

  // ── Courses ─────────────────────────────────────────────────────────────────

  async assignCourse(data: IClassroomCourse): Promise<IClassroomCourse> {
    await this.init();
    const doc = {
      ...data,
      classroomId: toObjectId(data.classroomId as string),
      courseId: toObjectId(data.courseId as string),
      versionId: toObjectId(data.versionId as string),
    };
    const result = await this.courses.insertOne(doc as any);
    return { ...data, _id: result.insertedId.toString() };
  }

  async findCourseAssignment(classroomId: string, courseId: string): Promise<IClassroomCourse | null> {
    await this.init();
    const cObjId = ObjectId.isValid(classroomId) ? new ObjectId(classroomId) : classroomId;
    const crsObjId = ObjectId.isValid(courseId) ? new ObjectId(courseId) : courseId;
    const doc = await this.courses.findOne({
      $or: [
        { classroomId: cObjId as any, courseId: crsObjId as any },
        { classroomId: classroomId as any, courseId: courseId as any },
        { classroomId: cObjId as any, courseId: courseId as any },
        { classroomId: classroomId as any, courseId: crsObjId as any },
      ],
    });
    if (!doc) return null;
    return this._mapCourse(doc);
  }

  async findCoursesByClassroom(classroomId: string): Promise<IClassroomCourse[]> {
    await this.init();
    const docs = await this.courses
      .find({ classroomId: toObjectId(classroomId) as any })
      .sort({ assignedAt: -1 })
      .toArray();
    return docs.map(this._mapCourse);
  }

  async removeCourse(classroomId: string, courseId: string): Promise<void> {
    await this.init();
    const cObj = toObjectId(classroomId);
    const crObj = toObjectId(courseId);
    
    // Delete matching course assignments from classroom_courses
    await this.courses.deleteMany({
      $and: [
        {
          $or: [
            { classroomId: cObj as any },
            { classroomId: classroomId as any },
            { classroom_id: cObj as any },
            { classroom_id: classroomId as any },
          ],
        },
        {
          $or: [
            { courseId: crObj as any },
            { courseId: courseId as any },
            { course_id: crObj as any },
            { course_id: courseId as any },
          ],
        },
      ],
    });

    // Also clean up any legacy course-0 dummy assignments
    try {
      await this.courses.deleteMany({
        $or: [
          { courseId: 'course-0' },
          { course_id: 'course-0' },
          { courseId: /^course-\d+$/ },
          { course_id: /^course-\d+$/ },
        ],
      });
    } catch (_) {}
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  async deleteMembersByClassroom(classroomId: string): Promise<void> {
    await this.init();
    await this.members.deleteMany({ classroomId: toObjectId(classroomId) as any });
  }

  async deleteCoursesByClassroom(classroomId: string): Promise<void> {
    await this.init();
    await this.courses.deleteMany({ classroomId: toObjectId(classroomId) as any });
  }

  async deleteMemberEnrollmentsByClassroom(classroomId: string): Promise<void> {
    await this.init();
    const cObjId = toObjectId(classroomId);

    // 1. Delete classroom_member_enrollments
    try {
      const memberEnrollCol = await this.db.getCollection<any>('classroom_member_enrollments');
      await memberEnrollCol.deleteMany({
        $or: [
          { classroom_id: classroomId },
          { classroom_id: cObjId },
          { source_classroom_id: classroomId },
          { source_classroom_id: cObjId },
        ],
      });
    } catch (e) {
      console.error('Failed to cascade delete classroom_member_enrollments:', e);
    }

    // 2. Delete main enrollments specifically granted by this classroom (leaving self-enrolled untouched)
    try {
      const mainEnrollCol = await this.db.getCollection<any>('enrollments');
      await mainEnrollCol.deleteMany({
        $or: [
          { classroomId: classroomId },
          { classroomId: cObjId },
          { sourceClassroomId: classroomId },
          { sourceClassroomId: cObjId },
          { source_classroom_id: classroomId },
          { source_classroom_id: cObjId },
        ],
      });
    } catch (e) {
      console.error('Failed to cascade delete classroom main enrollments:', e);
    }

    // 3. Delete classroom announcements, assignments, and submissions
    try {
      const annCol = await this.db.getCollection<any>('classroom_announcements');
      await annCol.deleteMany({
        $or: [{ classroom_id: classroomId }, { classroom_id: cObjId }],
      });
      const assignCol = await this.db.getCollection<any>('classroom_assignments');
      await assignCol.deleteMany({
        $or: [{ classroom_id: classroomId }, { classroom_id: cObjId }],
      });
      const subCol = await this.db.getCollection<any>('classroom_submissions');
      await subCol.deleteMany({
        $or: [{ classroom_id: classroomId }, { classroom_id: cObjId }],
      });
    } catch (e) {
      console.error('Failed to cascade delete classroom LMS artifacts:', e);
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  async codeExists(code: string): Promise<boolean> {
    await this.init();
    const count = await this.classrooms.countDocuments({ code });
    return count > 0;
  }

  // ── Private mappers ─────────────────────────────────────────────────────────

  private _mapClassroom = (doc: any): IClassroom => {
    const startDate = doc.start_date
      ? new Date(doc.start_date)
      : doc.internship_start_date
      ? new Date(doc.internship_start_date)
      : doc.createdAt
      ? new Date(doc.createdAt)
      : new Date();

    const endDate = doc.end_date
      ? new Date(doc.end_date)
      : doc.internship_end_date
      ? new Date(doc.internship_end_date)
      : new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);

    return {
      ...doc,
      _id: doc._id?.toString(),
      instructorId: doc.instructorId?.toString(),
      start_date: startDate,
      end_date: endDate,
      internship_start_date: startDate,
      internship_end_date: endDate,
    };
  };

  private _mapMember = (doc: any): IClassroomMember => ({
    ...doc,
    _id: doc._id?.toString(),
    classroomId: doc.classroomId?.toString(),
    studentId: doc.studentId?.toString(),
  });

  private _mapCourse = (doc: any): IClassroomCourse => ({
    ...doc,
    _id: doc._id?.toString(),
    classroomId: doc.classroomId?.toString(),
    courseId: doc.courseId?.toString(),
    versionId: doc.versionId?.toString(),
  });
}
