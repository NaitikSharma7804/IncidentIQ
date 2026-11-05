import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { UserProfile } from '../api/client';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password?: string) => Promise<void>;
  logout: () => void;
  canInvestigate: boolean;
  canApprove: boolean;
  canExecute: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('incidentiq_token'));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const profile = await api.getMe();
        setUser(profile);
      } catch {
        // Token invalid or expired
        localStorage.removeItem('incidentiq_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [token]);

  const login = async (username: string, password: string = 'demo-only') => {
    setLoading(true);
    try {
      const data = await api.login(username, password);
      localStorage.setItem('incidentiq_token', data.access_token);
      setToken(data.access_token);
      const profile = await api.getMe();
      setUser(profile);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('incidentiq_token');
    setToken(null);
    setUser(null);
  };

  const role = user?.role;
  const canInvestigate = role === 'engineer' || role === 'incident_commander' || role === 'admin';
  const canApprove = role === 'incident_commander' || role === 'admin';
  const canExecute = role === 'engineer' || role === 'incident_commander' || role === 'admin';
  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        canInvestigate,
        canApprove,
        canExecute,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
