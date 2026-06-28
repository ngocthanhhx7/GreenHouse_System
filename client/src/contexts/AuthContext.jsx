import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

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
        if (active) setUser(data.user);
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
    setUser({
      ...result.user,
      role: result.user.role.roleName,
    });
    return result;
  }, []);

  const register = useCallback((input) => authService.register(input), []);

  const logout = useCallback(() => {
    authService.logout();
    setToken(null);
    setUser(null);
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
      getDashboardPath: authService.getDashboardPath,
    }),
    [loading, login, logout, register, token, user]
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
