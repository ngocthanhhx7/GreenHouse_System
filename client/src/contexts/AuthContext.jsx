import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { authService } from '../services/authService.js';
import {
  clearCsrfToken,
  subscribeToSessionExpiration,
} from '../services/apiClient.js';

const AuthContext = createContext(null);

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    role: typeof user.role === 'string' ? user.role : user.role?.roleName,
  };
}

export function AuthProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState('');

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

  useEffect(() => {
    return subscribeToSessionExpiration(() => {
      if (!user) return;
      const message = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      setSessionNotice(message);
      clearCsrfToken();
      setUser(null);
      navigate('/login', {
        replace: true,
        state: {
          from: location.pathname,
          message,
        },
      });
    });
  }, [location.pathname, navigate, user]);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    setSessionNotice('');
    setUser(normalizeUser(result.user));
    return result;
  }, []);

  const requestRegistrationChallenge = useCallback((email) => authService.requestRegistrationChallenge(email), []);
  const completeRegistration = useCallback((input) => authService.completeRegistration(input), []);

  const logout = useCallback(async () => {
    const result = await authService.logout();
    setSessionNotice('');
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
      sessionNotice,
      isAuthenticated: Boolean(user),
      login,
      requestRegistrationChallenge,
      completeRegistration,
      logout,
      updateUser,
      refreshUser,
      getDashboardPath: authService.getDashboardPath,
    }),
    [completeRegistration, loading, login, logout, refreshUser, requestRegistrationChallenge, sessionNotice, updateUser, user]
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
