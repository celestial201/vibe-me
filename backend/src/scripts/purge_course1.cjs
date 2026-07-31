const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const url = process.env.DB_URL || "mongodb+srv://Sulagna:KojarH6Ba3luOmqw@vibe-pro.onsskxv.mongodb.net/?appName=vibe-pro";
  const dbName = process.env.DB_NAME || "vibe";
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db(dbName);

    console.log('Purging any invites with courseId starting with course-...');
    const result = await db.collection('invites').deleteMany({
      $or: [
        { courseId: 'course-1' },
        { courseId: /^course-/ },
        { courseVersionId: 'course-1' },
        { courseVersionId: /^course-/ }
      ]
    });

    console.log(`Deleted ${result.deletedCount} dummy invite(s) from Mongo Atlas.`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run();
