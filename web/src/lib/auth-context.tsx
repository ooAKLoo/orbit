'use client';

import { SessionProvider, useSession, signIn, signOut } from 'next-auth/react';
import { MotionConfig } from 'framer-motion';
import { createContext, useContext, useEffect, ReactNode } from 'react';
import { setAuthToken } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  plan: 'free' | 'pro';
  daily_limit: number;
  retention_days: number;
  auth_token: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (provider: 'google' | 'github') => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthContextInner({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';

  const user: User | null = session?.authToken
    ? {
        id: session.userId || '',
        email: session.user?.email || '',
        name: session.user?.name || '',
        avatar_url: session.user?.image || '',
        plan: (session.plan as 'free' | 'pro') || 'free',
        daily_limit: session.dailyLimit || 2000,
        retention_days: session.retentionDays || 30,
        auth_token: session.authToken,
      }
    : null;

  useEffect(() => {
    if (user?.auth_token) {
      setAuthToken(user.auth_token);
    } else {
      setAuthToken(null);
    }
  }, [user?.auth_token]);

  const login = (provider: 'google' | 'github') => {
    signIn(provider, { callbackUrl: '/dashboard' });
  };

  const logout = () => {
    setAuthToken(null);
    signOut({ callbackUrl: '/login' });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <MotionConfig reducedMotion="user">
        <AuthContextInner>{children}</AuthContextInner>
      </MotionConfig>
    </SessionProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
