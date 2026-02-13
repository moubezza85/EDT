import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMe, login as apiLogin, type UserRole } from "@/api/authApi";

export type AuthUser = {
  id: string;
  name?: string;
  role: UserRole;
  modules?: string[];
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

function getStoredToken(): string {
  return (localStorage.getItem("token") || "").trim();
}

function setStoredToken(token: string) {
  const t = (token || "").trim();
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const me = await getMe();
      setUser(me.user as AuthUser);
    } catch (e: any) {
      // token invalide/expiré => on le supprime
      setStoredToken("");
      setUser(null);
      setError(e?.body?.message || e?.message || "Session expirée");
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiLogin(username, password);
      setStoredToken(res.token);
      setUser(res.user as AuthUser);
      return true;
    } catch (e: any) {
      setStoredToken("");
      setUser(null);
      setError(e?.body?.message || e?.message || "Identifiants invalides");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setStoredToken("");
    setUser(null);
    setError(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: !!user,
      login,
      logout,
      refresh,
    }),
    [user, loading, error, login, logout, refresh]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
