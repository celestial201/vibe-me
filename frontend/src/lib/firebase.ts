import { useAuthStore } from "../store/auth-store";

// Firebase initialization is completely disabled in local JWT mode.
const app: any = null;
const auth: any = null;
const provider: any = null;
const analytics: any = null;

export { auth, provider, analytics };

// Authentication functions operating in local JWT mode
export const loginWithGoogle = async () => {
  throw new Error("Google Sign-In requires Firebase configuration. Please sign in using Email & Password.");
};

export const loginWithEmail = async (email: string, password: string) => {
  const baseUrl = import.meta.env.VITE_BASE_URL;
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, recaptchaToken: "NO_CAPTCHA" }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Invalid email or password.');
  }

  const result = await response.json();
  const idToken = result.idToken || result.token;
  if (!idToken) {
    throw new Error('Login failed: No token received.');
  }

  localStorage.setItem('auth-provider', 'local');
  useAuthStore.getState().setToken(idToken);

  const userObj = result.user || {};
  const displayName = result.displayName || `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim();

  const appUser = {
    uid: result.localId || userObj._id || '',
    email: result.email || email,
    name: displayName,
    firstName: userObj.firstName || '',
    lastName: userObj.lastName || '',
    role: useAuthStore.getState().user?.role || 'student',
    avatar: userObj.profileImage || '',
  };
  useAuthStore.getState().setUser(appUser as any);

  return {
    user: {
      uid: result.localId || userObj._id || '',
      email: result.email || email,
      displayName: displayName,
      photoURL: userObj.profileImage || '',
      getIdToken: async () => idToken,
    },
    ...result,
  };
};

export const createUserWithEmail = async (email: string, password: string, displayName?: string) => {
  return {
    user: {
      uid: 'local_' + Date.now(),
      email,
      displayName: displayName || '',
      getIdToken: async () => useAuthStore.getState().token || '',
    }
  };
};

export const sendPasswordResetEmail = async (email: string) => {
  return {
    success: true,
    message: 'Password reset link sent (bypassed in local mode).',
  };
};

export const verifyResetCode = async (code: string) => {
  return { valid: true, email: 'local@vibe.com' };
};

export const resetPassword = async (code: string, newPassword: string) => {
  return {
    success: true,
    message: 'Password reset successfully (local mode)!',
  };
};

export const logout = () => {
  localStorage.removeItem('auth-provider');
  useAuthStore.getState().clearUser();
};