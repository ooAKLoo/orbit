// Orbit API Client

const API_BASE = 'https://orbit-api.yangdongjuooakloo.workers.dev';
const ADMIN_KEY = 'orbit-admin-secret-key';

// Types
export interface App {
  id: number;
  app_id: string;
  app_name: string;
  api_key: string;
  github_repo?: string | null;
  created_at: number;
}

export interface DailyStats {
  date: string;
  count: number;
}

export interface PlatformStats {
  platform: string;
  count: number;
}

export interface RetentionStats {
  d1: number;
  d7: number;
  d30: number;
}

export interface AppStats {
  downloads: {
    total: number;
    by_date: DailyStats[];
  };
  platform_stats: PlatformStats[];
  dau: {
    avg: number;
    by_date: DailyStats[];
  };
  retention: RetentionStats;
}

export interface Feedback {
  id: number;
  content: string;
  contact: string | null;
  device_info: string | null;
  created_at: number;
}

export interface Version {
  id: number;
  platform: string;
  version: string;
  version_code: number;
  download_url: string | null;
  changelog: string | null;
  force_update: number;
  created_at: number;
}

// API Error
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Fetch helper
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY,
      ...options?.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.error || 'Unknown error');
  }

  return data as T;
}

// ============ Apps API ============

export async function listApps(): Promise<App[]> {
  const data = await fetchApi<{ apps: App[] }>('/admin/apps');
  return data.apps;
}

export async function createApp(appId: string, appName: string): Promise<App> {
  const data = await fetchApi<{ app: App }>('/admin/apps', {
    method: 'POST',
    body: JSON.stringify({ app_id: appId, app_name: appName }),
  });
  return data.app;
}

export async function getApp(appId: string): Promise<App> {
  const data = await fetchApi<{ app: App }>(`/admin/apps/${appId}`);
  return data.app;
}

export async function deleteApp(appId: string): Promise<void> {
  await fetchApi(`/admin/apps/${appId}`, { method: 'DELETE' });
}

// ============ Stats API ============

export async function getAppStats(appId: string, days: number = 30): Promise<AppStats> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  return fetchApi<AppStats>(`/admin/apps/${appId}/stats?start=${startStr}&end=${endStr}`);
}

// ============ Feedbacks API ============

export async function getAppFeedbacks(
  appId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ feedbacks: Feedback[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
  return fetchApi(`/admin/apps/${appId}/feedbacks?page=${page}&limit=${limit}`);
}

// ============ Versions API ============

export async function getAppVersions(appId: string): Promise<Version[]> {
  const data = await fetchApi<{ versions: Version[] }>(`/admin/apps/${appId}/versions`);
  return data.versions;
}

export async function createVersion(
  appId: string,
  version: {
    platform: string;
    version: string;
    version_code?: number;
    download_url?: string;
    changelog?: string;
    force_update?: boolean;
  }
): Promise<void> {
  await fetchApi(`/admin/apps/${appId}/versions`, {
    method: 'POST',
    body: JSON.stringify(version),
  });
}

// ============ App Update API ============

export async function updateApp(
  appId: string,
  updates: {
    app_name?: string;
    github_repo?: string | null;
  }
): Promise<void> {
  await fetchApi(`/admin/apps/${appId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ GitHub Sync API ============

export async function syncGitHubReleases(appId: string): Promise<{ synced: number }> {
  return fetchApi(`/admin/apps/${appId}/sync-github`, {
    method: 'POST',
  });
}
