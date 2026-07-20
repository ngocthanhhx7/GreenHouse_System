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
  const [token, setToken] = useState(authService.getToken());
  const [loading, setLoading] = useState(Boolean(authService.getToken()));

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    authService
      .me()
      .then((data) => {
        if (active) setUser(normalizeUser(data.user));
      })
      .catch(() => {
        authService.logout();
        if (active) {
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    setToken(result.token);
    setUser(normalizeUser(result.user));
    return result;
  }, []);

  const register = useCallback((input) => authService.register(input), []);

  const logout = useCallback(() => {
    authService.logout();
    setToken(null);
    setUser(null);
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
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      updateUser,
      refreshUser,
      getDashboardPath: authService.getDashboardPath,
    }),
    [loading, login, logout, refreshUser, register, token, updateUser, user]
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
