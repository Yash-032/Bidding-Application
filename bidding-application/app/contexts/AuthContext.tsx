'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken as storeToken, clearToken, login as apiLogin, signup as apiSignup, type AuthUser } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (email: string, password: string, phone?: string) => Promise<{ user: AuthUser; verificationToken: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function parseJWT(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { id: payload.id, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true });

  useEffect(() => {
    const t = getToken();
    if (t) {
      const user = parseJWT(t);
      setState({ user, token: t, loading: false });
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setState({ user: result.user, token: result.token, loading: false });
    return result.user;
  }, []);

  const signup = useCallback(async (email: string, password: string, phone?: string) => {
    const result = await apiSignup(email, password, phone);
    return result;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ user: null, token: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
