const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const url = process.env.DB_URL || "mongodb+srv://Sulagna:KojarH6Ba3luOmqw@vibe-pro.onsskxv.mongodb.net/?appName=vibe-pro";
  const dbName = process.env.DB_NAME || "vibe";
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db(dbName);

    console.log('--- Cleaning Dummy & Orphan Invites ---');
    const invites = await db.collection('invites').find({}).toArray();
    let removedCount = 0;

    for (const inv of invites) {
      const courseIdStr = String(inv.courseId || '');
      const isDummyId = courseIdStr.startsWith('course-') || courseIdStr === 'undefined' || courseIdStr === 'null';

      const course = await db.collection('newCourse').findOne({
        $or: [{ _id: inv.courseId }, { id: courseIdStr }]
      });

      if (isDummyId || (!course && inv.inviteStatus === 'PENDING')) {
        console.log(`Deleting orphan/dummy invite _id: ${inv._id}, courseId: ${inv.courseId}, status: ${inv.inviteStatus}`);
        await db.collection('invites').deleteOne({ _id: inv._id });
        removedCount++;
      }
    }

    console.log(`Successfully removed ${removedCount} orphan/dummy invite(s) from MongoDB!`);
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await client.close();
  }
}

run();
