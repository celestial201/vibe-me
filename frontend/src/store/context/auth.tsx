import React, { createContext, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { logout, loginWithGoogle, loginWithEmail, refreshFirebaseToken } from '@/utils/auth';
import { setTokenRefreshFunction } from '@/lib/openapi';

import type { Role, AuthContextType } from '@/types/auth.types';


// Create a context with default values
export const AuthContext = createContext<AuthContextType>({
  role: null,
  isAuthenticated: false,
  login: () => { },
  loginWithGoogle: async () => { },
  loginWithEmail: async () => { },
  logout: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, setUser, clearUser, setAuthReady } = useAuthStore();
  const tokenRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Logout function that clears the user from the store
  const handleLogout = useCallback(() => {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }
    logout();
    clearUser();
  }, [clearUser]);

  // Auth initialization and token management
  useEffect(() => {
    // Register the token refresh function with the API client
    setTokenRefreshFunction(refreshFirebaseToken);
    setAuthReady(true);

    return () => {
      if (tokenRefreshIntervalRef.current) {
        clearInterval(tokenRefreshIntervalRef.current);
      }
    };
  }, [setAuthReady]);

  // Login function that sets the user in the store
  const login = (selectedRole: Role, uid: string, email: string, name?: string) => {
    if (selectedRole) {
      setUser({
        uid,
        email,
        name,
        role: selectedRole,
      });
    }
  };

  return (
    <AuthContext.Provider value={{
      role: user?.role || null,
      isAuthenticated,
      login,
      loginWithGoogle,
      loginWithEmail,
      logout: handleLogout
    }}>
      {children}
    </AuthContext.Provider>
  );
}
