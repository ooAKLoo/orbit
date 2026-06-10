// Orbit API Client

const API_BASE = process.env.NEXT_PUBLIC_ORBIT_API_URL || 'https://orbit-api.yangdongjuooakloo.workers.dev';

// Auth token management
let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

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

export interface CountryStats {
  country: string;
  count: number;
}

export interface AppStats {
  downloads: {
    total: number;
    by_date: DailyStats[];
  };
  platform_stats: PlatformStats[];
  country_stats: CountryStats[];
  dau: {
    avg: number;
    by_date: DailyStats[];
  };
  retention: RetentionStats;
}

export interface FeedbackAttachment {
  id: number;
  feedback_id: number;
  file_name: string;
  file_type: string | null;
  file_size: number;
  created_at: number;
}

export interface Feedback {
  id: number;
  content: string;
  contact: string | null;
  device_info: string | null;
  created_at: number;
  attachments?: FeedbackAttachment[];
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

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (_authToken) {
    headers['Authorization'] = `Bearer ${_authToken}`;
  }

  return headers;
}

// Fetch helper
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
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

export async function deleteFeedback(appId: string, feedbackId: number): Promise<void> {
  await fetchApi(`/admin/apps/${appId}/feedbacks/${feedbackId}`, { method: 'DELETE' });
}

export async function downloadFeedbackAttachment(
  appId: string,
  feedbackId: number,
  attachmentId: number
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(
    `${API_BASE}/admin/apps/${appId}/feedbacks/${feedbackId}/attachments/${attachmentId}`,
    { headers: getAuthHeaders() }
  );

  if (!res.ok) {
    let message = 'Failed to download attachment';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new ApiError(res.status, message);
  }

  return {
    blob: await res.blob(),
    filename: getFilenameFromContentDisposition(res.headers.get('Content-Disposition')) || 'attachment',
  };
}

function getFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;

  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  return header.match(/filename="?([^";]+)"?/i)?.[1] || null;
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
    app_id?: string;
    github_repo?: string | null;
  }
): Promise<{ success: boolean; new_app_id?: string }> {
  return fetchApi(`/admin/apps/${appId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ============ Usage API ============

export async function getUsage(): Promise<{ today: number }> {
  return fetchApi('/admin/usage');
}

// ============ GitHub Sync API ============

export async function syncGitHubReleases(appId: string): Promise<{ synced: number }> {
  return fetchApi(`/admin/apps/${appId}/sync-github`, {
    method: 'POST',
  });
}
