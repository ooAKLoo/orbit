'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, mockUser } from './mock-data';

// 硬编码的用户名密码
const CREDENTIALS = {
  username: 'admin',
  password: 'orbit123',
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (provider: 'google' | 'github') => void;
  loginWithPassword: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 模拟检查登录状态
    const checkAuth = () => {
      const isLoggedIn = localStorage.getItem('orbit_logged_in');
      if (isLoggedIn === 'true') {
        setUser(mockUser);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = (provider: 'google' | 'github') => {
    // Mock 登录 - 实际会跳转 OAuth
    console.log(`Login with ${provider}`);
    localStorage.setItem('orbit_logged_in', 'true');
    setUser(mockUser);
  };

  const loginWithPassword = (username: string, password: string): boolean => {
    if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
      localStorage.setItem('orbit_logged_in', 'true');
      setUser(mockUser);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('orbit_logged_in');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
