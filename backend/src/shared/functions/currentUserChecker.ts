import { FirebaseAuthService } from "#root/modules/auth/services/FirebaseAuthService.js";
import { getFromContainer } from "routing-controllers";
import { CurrentUserChecker } from "routing-controllers";
import { Request } from "express";
import { IUser } from "../interfaces/models.js";
import { DevAuthAdapter } from "../middleware/DevAuthAdapter.js";

export const currentUserChecker: CurrentUserChecker = async (action): Promise<IUser> => {
  const request = action.request as Request;

  if (process.env.NODE_ENV !== 'production') {
    const testUserId = (request.headers['x-test-user-id'] || request.headers['X-Test-User-Id']) as string;
    const testUserRole = (request.headers['x-test-user-role'] || request.headers['X-Test-User-Role']) as string;
    if (testUserId) {
      const devUser = await DevAuthAdapter.resolveUser(testUserId, testUserRole);
      if (devUser) {
        return devUser;
      }
    }
    if ((request as any).user) {
      return (request as any).user;
    }
  }

  const authService = getFromContainer(FirebaseAuthService);
  const token = request.headers.authorization?.split(' ')[1];

  const user = await authService.getCurrentUserFromToken(token || 'local-dev-token');
  return user;
}