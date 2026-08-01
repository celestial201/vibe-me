import { Request, Response, NextFunction } from 'express';
import { getContainer } from '#root/bootstrap/loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { safeObjectId } from '#root/shared/functions/idNormalizer.js';
import { IUser } from '#root/shared/interfaces/models.js';

/**
 * Development Environment Session Provider (DevAuthAdapter)
 * Checks for x-test-user-id and x-test-user-role test headers when process.env.NODE_ENV !== 'production'
 * and resolves the authentic user document directly from the 'users' database collection.
 */
export class DevAuthAdapter {
  static async resolveUser(userIdStr: string, roleHeader?: string): Promise<IUser | null> {
    if (!userIdStr) return null;
    try {
      let usersCol: any;
      try {
        const mongoDb = getContainer().get<MongoDatabase>(GLOBAL_TYPES.Database);
        usersCol = await mongoDb.getCollection<any>('users');
      } catch {
        return null;
      }
      if (!usersCol) return null;

      const objId = safeObjectId(userIdStr);
      const query = objId
        ? { $or: [{ _id: objId }, { _id: userIdStr }, { id: userIdStr }] }
        : { $or: [{ _id: userIdStr }, { id: userIdStr }, { email: userIdStr }] };

      const userDoc = await usersCol.findOne(query);
      if (userDoc) {
        if (roleHeader) {
          const roleStr = roleHeader.toLowerCase();
          userDoc.role = roleStr;
          const upperRole = roleHeader.toUpperCase();
          if (Array.isArray(userDoc.roles)) {
            if (!userDoc.roles.includes(upperRole) && !userDoc.roles.includes(roleStr)) {
              userDoc.roles.push(roleStr);
            }
          } else {
            userDoc.roles = [roleStr];
          }
        }
        return userDoc as unknown as IUser;
      }
    } catch (err) {
      console.error('[DevAuthAdapter] Error resolving user from database:', err);
    }
    return null;
  }

  static middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (process.env.NODE_ENV === 'production') {
        return next();
      }
      const testUserId = (req.headers['x-test-user-id'] || req.headers['X-Test-User-Id']) as string;
      const testUserRole = (req.headers['x-test-user-role'] || req.headers['X-Test-User-Role']) as string;

      if (testUserId) {
        const user = await DevAuthAdapter.resolveUser(testUserId, testUserRole);
        if (user) {
          (req as any).user = user;
        }
      }
      next();
    };
  }
}
