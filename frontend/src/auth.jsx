import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, [logout]);

  const authenticate = async (promise) => {
    const { token, user: u } = await promise;
    setToken(token);
    setUser(u);
    return u;
  };

  const value = {
    user, loading, logout, setUser,
    login: (email, password) => authenticate(api.login(email, password)),
    register: (body) => authenticate(api.register(body)),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
