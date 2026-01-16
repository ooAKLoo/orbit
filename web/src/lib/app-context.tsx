'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { App, mockApps } from './mock-data';

interface AppContextType {
  apps: App[];
  selectedApp: App | null;
  selectedAppId: string | null;
  setSelectedAppId: (appId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(
    mockApps[0]?.app_id || null
  );

  const selectedApp = mockApps.find((a) => a.app_id === selectedAppId) || null;

  return (
    <AppContext.Provider
      value={{
        apps: mockApps,
        selectedApp,
        selectedAppId,
        setSelectedAppId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
