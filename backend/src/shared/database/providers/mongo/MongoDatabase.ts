import { GLOBAL_TYPES } from '#root/types.js';
import { IDatabase } from '#shared/database/interfaces/IDatabase.js';
import { injectable, inject } from 'inversify';
import { Db, MongoClient, Document, Collection } from 'mongodb';
import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

/**
 * @class MongoDatabase
 * @implements {IDatabase<Db>}
 * @description A service class for managing MongoDB connections and operations.
 *
 * @example
 * const mongoDatabase = new MongoDatabase('mongodb://localhost:27017', 'myDatabase');
 *
 * @template Db
 */
@injectable()
export class MongoDatabase implements IDatabase<Db> {
  private client: MongoClient | null;
  public database: Db | null;
  private connectingPromise: Promise<Db> | null = null;
  private memoryServer: any = null;

  /**
   * Creates an instance of MongoDatabase.
   * @param {string} uri - The MongoDB connection URI.
   * @param {string} dbName - The name of the database to connect to.
   */
  constructor(
    @inject(GLOBAL_TYPES.uri)
    private readonly uri: string,
    @inject(GLOBAL_TYPES.dbName)
    private readonly dbName: string,
  ) {
    // Skip database connection if environment variable is set
    if (process.env.SKIP_DB_CONNECTION === 'true') {
      this.client = null;
      this.database = null;
      console.log(
        'Database connection skipped due to SKIP_DB_CONNECTION environment variable',
      );
      return;
    }

    if (process.env.USE_MEMORY_DB === 'true' || !uri) {
      this.client = null; // Will initialize dynamically inside connect()
    } else {
      const useTls = uri.startsWith('mongodb+srv://') || uri.includes('ssl=true') || uri.includes('tls=true');
      this.client = new MongoClient(uri, {
        ...(useTls ? {
          ssl: true,
          tls: true,
          tlsAllowInvalidCertificates: false,
          tlsAllowInvalidHostnames: false,
        } : {}),
        retryWrites: true,
        maxPoolSize: 50,
        minPoolSize: 10,
        maxIdleTimeMS: 60000,
        connectTimeoutMS: 20000,
        socketTimeoutMS: 30000,
      });
    }
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.database) return;

    const auditCollection = this.database.collection("auditTrails");

    await auditCollection.createIndex({
      actor: 1,
      "context.courseId": 1,
      "context.courseVersionId": 1,
      createdAt: -1,
    });

    console.log("AuditTrails indexes ensured");
  }

  /**
   * Connects to the MongoDB database.
   * @returns {Promise<Db>} The connected database instance.
   */
  public async connect(): Promise<Db> {
    if (this.database) {
      return this.database;
    }

    if (!this.connectingPromise) {
      this.connectingPromise = (async () => {
        if (process.env.SKIP_DB_CONNECTION === 'true') {
          return null as unknown as Db;
        }

        const startPersistentLocalMongo = async () => {
          const { MongoMemoryServer } = await import('mongodb-memory-server');
          const fs = await import('fs');
          const path = await import('path');
          const dbDir = path.resolve(process.cwd(), '.data/mongo_db');
          if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
          
          const lockFile = path.join(dbDir, 'mongod.lock');
          if (fs.existsSync(lockFile)) {
            console.log('🧹 Removing stale mongod.lock file...');
            fs.unlinkSync(lockFile);
          }
          
          this.memoryServer = await MongoMemoryServer.create({
            instance: {
              dbPath: dbDir,
              storageEngine: 'wiredTiger',
              launchTimeout: 60000,
            },
          });
          
          const cleanup = async () => {
            if (this.memoryServer) {
              console.log('🛑 Gracefully stopping MongoMemoryServer...');
              await this.memoryServer.stop();
              this.memoryServer = null;
            }
            process.exit();
          };
          process.once('SIGINT', cleanup);
          process.once('SIGTERM', cleanup);
          process.once('SIGUSR2', cleanup);
          
          const memoryUri = this.memoryServer.getUri();
          console.log(`✅ Local persistent MongoDB running at ${memoryUri} (Data saved in ${dbDir})`);
          this.client = new MongoClient(memoryUri, { retryWrites: true });
          await this.client.connect();
        };

        if (process.env.USE_MEMORY_DB === 'true' && !this.client) {
          console.log('🚀 Starting local persistent MongoDB (USE_MEMORY_DB=true)...');
          await startPersistentLocalMongo();
        } else {
          try {
            await this.client?.connect();
          } catch (err: any) {
            console.error(`⚠️ Cloud MongoDB connection failed (${err.message || err.code}). Falling back to local persistent MongoDB...`);
            await startPersistentLocalMongo();
          }
        }

        this.database = this.client?.db(this.dbName) || null;

        if (this.database) {
          // 🔥 Ensure indexes after connection
          await this.ensureIndexes();
          
          // 🔥 Auto-seed local accounts if missing
          if (process.env.USE_MEMORY_DB === 'true' || !this.uri) {
            const usersCol = this.database.collection('users');
            const bcrypt = await import('bcrypt');
            
            const defaultUsers = [
              { email: 'admin@vibe.com', passwordRaw: 'admin123', firstName: 'Admin', lastName: 'User', roles: 'admin' },
              { email: 'teacher@vibe.com', passwordRaw: 'teacher123', firstName: 'Teacher', lastName: 'User', roles: 'teacher' },
              { email: 'student@vibe.com', passwordRaw: 'student123', firstName: 'Student', lastName: 'User', roles: 'student' }
            ];

            for (const u of defaultUsers) {
              const userExists = await usersCol.findOne({ email: u.email });
              if (!userExists) {
                const hash = await bcrypt.hash(u.passwordRaw, 10);
                await usersCol.insertOne({
                  email: u.email,
                  password: hash,
                  firstName: u.firstName,
                  lastName: u.lastName,
                  roles: u.roles,
                  authProvider: 'local',
                  firebaseUID: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  createdAt: new Date(),
                  updatedAt: new Date()
                });
                console.log(`✅ Auto-seeded ${u.email} (password: ${u.passwordRaw})`);
              }
            }
          }
        }

        return this.database as Db;
      })();
    }

    return this.connectingPromise;
  }

  /**
   * Disconnects from the MongoDB database.
   * @returns {Promise<Db | null>} The disconnected database instance, or null if already disconnected.
   */
  public async disconnect(): Promise<Db | null> {
    if (this.client) {
      await this.client.close();
      this.database = null;
    }
    return this.database;
  }

  /**
   * Checks if the database is connected.
   * @returns {boolean} True if the database is connected, false otherwise.
   */
  public isConnected(): boolean {
    return this.database !== null;
  }

  /**
   * Retrieves the client.
   * @returns {Promise<MongoClient>} The connected database instance.
   */
  public async getClient(): Promise<MongoClient> {
    return this.client;
  }

  /**
   * Retrieves a collection from the connected database.
   * @template T
   * @param {string} name - The name of the collection to retrieve.
   * @returns {Promise<Collection<T>>} The MongoDB collection.
   * @throws Will throw an error if the database is not connected.
   */
  public async getCollection<T extends Document>(
    name: string,
  ): Promise<Collection<T>> {
    // if (!this.database) {
    //   await this.connect();
    // }
    if (!this.database) {
      throw new Error('Database is not connected');
    }
    return this.database.collection<T>(name);
  }
}
