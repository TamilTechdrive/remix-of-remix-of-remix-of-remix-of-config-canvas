import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, setAccessToken, getAccessToken } from '../services/api';
import { apiConfig } from '@/config/apiConfig';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isDemoMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: () => void;
  register: (email: string, username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasPermission: (perm: string) => boolean;
  updateProfile: (updates: Partial<User>) => void;
}

const DEMO_USER: User = {
  id: 'demo-001',
  email: 'admin@configflow.dev',
  username: 'admin',
  displayName: 'Demo Admin',
  roles: ['admin', 'editor', 'viewer'],
  permissions: ['config:read', 'config:write', 'config:delete', 'user:manage', 'audit:read'],
  avatar: '',
};

// No-auth user when security is disabled
const NO_AUTH_USER: User = {
  id: 'noauth-001',
  email: 'user@configflow.dev',
  username: 'user',
  displayName: 'Open User',
  roles: ['admin', 'editor', 'viewer'],
  permissions: ['config:read', 'config:write', 'config:delete', 'user:manage', 'audit:read'],
  avatar: '',
};

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Normalize login response from Node vs PHP backend.
 * Node: res.data = { accessToken, user: { id, email, username, displayName, roles } }
 * PHP:  res.data = { accessToken, user: { id, email, username, displayName, roles } }
 * Both should be the same shape now, but we handle edge cases.
 */
function extractLoginData(resData: any): { accessToken: string; user: any } {
  // Handle nested data.data wrapper (some Node responses)
  const d = resData.data || resData;
  return {
    accessToken: d.accessToken || d.access_token || '',
    user: d.user || {},
  };
}

/**
 * Normalize /auth/me response.
 * Node: { id, email, username, display_name, roles, permissions }
 * PHP:  { id, email, username, display_name, roles }
 */
function extractMeData(resData: any): User {
  const d = resData.data || resData;
  return {
    id: d.id,
    email: d.email,
    username: d.username,
    displayName: d.display_name || d.displayName || d.username,
    roles: d.roles || [],
    permissions: d.permissions || [],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const securityEnabled = apiConfig.securityEnabled;

  const refreshUser = useCallback(async () => {
    if (!securityEnabled) return;
    try {
      const res = await authApi.me();
      setUser(extractMeData(res.data));
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, [securityEnabled]);

  useEffect(() => {
    // If security is disabled, auto-authenticate
    if (!securityEnabled) {
      setUser(NO_AUTH_USER);
      setIsDemoMode(false);
      setIsLoading(false);
      return;
    }

    // Check demo mode first
    const demoFlag = localStorage.getItem('cf_demo');
    if (demoFlag === 'true') {
      setUser(DEMO_USER);
      setIsDemoMode(true);
      setIsLoading(false);
      return;
    }
    const token = getAccessToken();
    if (token) {
      refreshUser().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshUser, securityEnabled]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    const { accessToken, user: userData } = extractLoginData(res.data);
    
    if (securityEnabled && accessToken) {
      setAccessToken(accessToken);
    }
    
    setUser({
      id: userData.id,
      email: userData.email,
      username: userData.username,
      displayName: userData.displayName || userData.display_name || userData.username,
      roles: userData.roles || [],
      permissions: userData.permissions || [],
    });
    setIsDemoMode(false);
    
    if (securityEnabled) {
      await refreshUser();
    }
  }, [refreshUser, securityEnabled]);

  const loginDemo = useCallback(() => {
    localStorage.setItem('cf_demo', 'true');
    setUser(DEMO_USER);
    setIsDemoMode(true);
  }, []);

  const register = useCallback(async (email: string, username: string, password: string, displayName?: string) => {
    await authApi.register({ email, username, password, displayName });
  }, []);

  const logout = useCallback(async () => {
    if (!isDemoMode && securityEnabled) {
      try { await authApi.logout(); } catch { /* ignore */ }
    }
    setAccessToken(null);
    localStorage.removeItem('cf_demo');
    if (!securityEnabled) {
      // When security is off, just reset to NO_AUTH_USER
      setUser(NO_AUTH_USER);
    } else {
      setUser(null);
    }
    setIsDemoMode(false);
  }, [isDemoMode, securityEnabled]);

  const updateProfile = useCallback((updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  const hasRole = useCallback((role: string) => user?.roles.includes(role) ?? false, [user]);
  const hasPermission = useCallback((perm: string) => user?.permissions.includes(perm) ?? false, [user]);

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated: !!user, isDemoMode,
      login, loginDemo, register, logout, refreshUser, hasRole, hasPermission, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
