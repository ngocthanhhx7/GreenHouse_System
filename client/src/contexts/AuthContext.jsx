import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    role: typeof user.role === 'string' ? user.role : user.role?.roleName,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authService
      .me()
      .then((data) => {
        if (active) setUser(normalizeUser(data.user));
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    setUser(normalizeUser(result.user));
    return result;
  }, []);

  const requestRegistrationChallenge = useCallback((email) => authService.requestRegistrationChallenge(email), []);
  const completeRegistration = useCallback((input) => authService.completeRegistration(input), []);

  const logout = useCallback(async () => {
    const result = await authService.logout();
    setUser(null);
    return result;
  }, []);

  const updateUser = useCallback((nextUser) => {
    setUser((current) => normalizeUser({ ...current, ...nextUser }));
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await authService.me();
    const nextUser = normalizeUser(data.user);
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      requestRegistrationChallenge,
      completeRegistration,
      logout,
      updateUser,
      refreshUser,
      getDashboardPath: authService.getDashboardPath,
    }),
    [completeRegistration, loading, login, logout, refreshUser, requestRegistrationChallenge, updateUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuthContext must be used inside AuthProvider');
  }
  return value;
}
