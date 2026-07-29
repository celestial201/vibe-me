import { useAuthStore } from '../store/auth-store';
import { queryClient } from '../lib/client';

export const refreshFirebaseToken = async (): Promise<void> => {
  return;
};

// Login with Google in a popup
export const loginWithGoogle = async () => {
  throw new Error("Google Sign-In is not supported in local JWT mode.");
};

// Login with email/password
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

// Logout
export function logout() {
  localStorage.removeItem('isAuth');
  localStorage.removeItem('firebase-auth-token');
  localStorage.removeItem('auth-provider');
  useAuthStore.getState().clearUser();
  queryClient.clear();
}

// Check if user is authenticated
export function checkAuth() {
  const token = localStorage.getItem('firebase-auth-token') || useAuthStore.getState().token;
  return !!token;
}

// API-specific functions
export { useLogin } from '../hooks/hooks';

