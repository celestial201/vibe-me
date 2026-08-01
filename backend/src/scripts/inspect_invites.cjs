const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const url = process.env.DB_URL || "mongodb+srv://Sulagna:KojarH6Ba3luOmqw@vibe-pro.onsskxv.mongodb.net/?appName=vibe-pro";
  const dbName = process.env.DB_NAME || "vibe";
  console.log('Connecting to Mongo URL:', url.split('@')[1] || url, 'DB:', dbName);

  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(dbName);

    console.log('\n=== INVITES COLLECTION ===');
    const invites = await db.collection('invites').find({}).toArray();
    console.log('Total Invites in DB:', invites.length);
    for (const inv of invites) {
      console.log('\n--- Invite ---');
      console.log('_id:', inv._id);
      console.log('email:', inv.email);
      console.log('inviteStatus:', inv.inviteStatus);
      console.log('courseId:', inv.courseId);
      console.log('courseVersionId:', inv.courseVersionId);
      console.log('type:', inv.type);

      const course = await db.collection('newCourse').findOne({
        $or: [{ _id: inv.courseId }, { id: String(inv.courseId) }]
      });
      console.log('Course Found?', Boolean(course), course ? (course.name || course.title) : 'NULL/DELETED');

      const version = await db.collection('newCourseVersion').findOne({
        $or: [{ _id: inv.courseVersionId }, { id: String(inv.courseVersionId) }]
      });
      console.log('Version Found?', Boolean(version));
    }

    console.log('\n=== RECENT NOTIFICATIONS ===');
    const notifs = await db.collection('notifications').find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log('Total Notifications in DB:', notifs.length);
    for (const n of notifs) {
      console.log('Notif:', { _id: n._id, type: n.type, title: n.title, message: n.message, link: n.link, user_id: n.user_id, status: n.status });
    }

  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.close();
  }
}

run();
