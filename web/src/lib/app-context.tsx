'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { App, listApps, createApp as apiCreateApp, deleteApp as apiDeleteApp } from './api';

interface AppContextType {
  apps: App[];
  selectedApp: App | null;
  selectedAppId: string | null;
  setSelectedAppId: (appId: string) => void;
  isLoading: boolean;
  error: string | null;
  refreshApps: () => Promise<void>;
  createApp: (appId: string, appName: string) => Promise<App>;
  deleteApp: (appId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshApps = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedApps = await listApps();
      setApps(fetchedApps);

      // Auto-select first app if none selected
      if (!selectedAppId && fetchedApps.length > 0) {
        setSelectedAppId(fetchedApps[0].app_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apps');
      console.error('Failed to load apps:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAppId]);

  useEffect(() => {
    refreshApps();
  }, []);

  const createApp = async (appId: string, appName: string): Promise<App> => {
    const newApp = await apiCreateApp(appId, appName);
    await refreshApps();
    setSelectedAppId(appId);
    return newApp;
  };

  const deleteApp = async (appId: string): Promise<void> => {
    await apiDeleteApp(appId);
    await refreshApps();
    if (selectedAppId === appId) {
      setSelectedAppId(apps.length > 1 ? apps.find(a => a.app_id !== appId)?.app_id || null : null);
    }
  };

  const selectedApp = apps.find((a) => a.app_id === selectedAppId) || null;

  return (
    <AppContext.Provider
      value={{
        apps,
        selectedApp,
        selectedAppId,
        setSelectedAppId,
        isLoading,
        error,
        refreshApps,
        createApp,
        deleteApp,
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
