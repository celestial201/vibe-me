const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const url = process.env.DB_URL || "mongodb+srv://Sulagna:KojarH6Ba3luOmqw@vibe-pro.onsskxv.mongodb.net/?appName=vibe-pro";
  const dbName = process.env.DB_NAME || "vibe";
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db(dbName);

    console.log('=== USERS ===');
    const users = await db.collection('users').find({}).toArray();
    console.log(`Found ${users.length} users:`);
    users.forEach(u => console.log({ _id: u._id, email: u.email, name: `${u.firstName} ${u.lastName}`, roles: u.roles }));

    console.log('\n=== REAL COURSES (newCourse) ===');
    const courses = await db.collection('newCourse').find({}).toArray();
    console.log(`Found ${courses.length} courses:`);
    courses.forEach(c => console.log({ _id: c._id, name: c.name || c.title, id: c.id }));

    console.log('\n=== REAL COURSE VERSIONS (newCourseVersion) ===');
    const versions = await db.collection('newCourseVersion').find({}).toArray();
    console.log(`Found ${versions.length} versions:`);
    versions.forEach(v => console.log({ _id: v._id, courseId: v.courseId, versionStatus: v.versionStatus }));

    console.log('\n=== CLASSROOMS ===');
    const classrooms = await db.collection('classrooms').find({}).toArray();
    console.log(`Found ${classrooms.length} classrooms:`);
    classrooms.forEach(cl => console.log({ _id: cl._id, title: cl.title, teacher_id: cl.teacher_id }));

    console.log('\n=== PENDING INVITES IN DB ===');
    const invites = await db.collection('invites').find({ inviteStatus: 'PENDING' }).toArray();
    console.log(`Found ${invites.length} pending invites:`);
    invites.forEach(inv => console.log(inv));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run();
