export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ADMIN_KEY?: string;
}

// Admin key for dashboard access (set in wrangler.toml or secrets)
const DEFAULT_ADMIN_KEY = 'orbit-admin-secret-key';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Admin-Key',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Parse version string to comparable number (e.g., "1.2.3" -> 10203)
function parseVersion(version: string): number {
  const parts = version.split('.').map(Number);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Client APIs: /v1/{app_id}/...
      if (path.startsWith('/v1/')) {
        return handleClientAPI(request, env, path);
      }

      // Management APIs: /manage/...
      if (path.startsWith('/manage/')) {
        return handleManageAPI(request, env, path, url);
      }

      // Admin APIs: /admin/... (for dashboard)
      if (path.startsWith('/admin/')) {
        return handleAdminAPI(request, env, path, url);
      }

      // Health check
      if (path === '/health') {
        return jsonResponse({ status: 'ok', timestamp: Date.now() });
      }

      return errorResponse('Not found', 404);
    } catch (error) {
      console.error('Error:', error);
      return errorResponse('Internal server error', 500);
    }
  },

  // Cron Trigger - Sync GitHub Releases hourly
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron triggered: syncing GitHub releases...');

    // Get all apps with github_repo configured
    const apps = await env.DB.prepare(`
      SELECT app_id, github_repo FROM applications WHERE github_repo IS NOT NULL
    `).all<{ app_id: string; github_repo: string }>();

    if (!apps.results || apps.results.length === 0) {
      console.log('No apps with GitHub repos configured');
      return;
    }

    for (const app of apps.results) {
      try {
        await syncAppGitHubReleases(env, app.app_id, app.github_repo);
        console.log(`Synced releases for ${app.app_id}`);
      } catch (error) {
        console.error(`Failed to sync ${app.app_id}:`, error);
      }
    }
  },
};

// Shared sync function for both cron and manual trigger
async function syncAppGitHubReleases(env: Env, appId: string, githubRepo: string): Promise<number> {
  const releases = await fetchGitHubReleases(githubRepo);

  if (!releases || releases.length === 0) {
    return 0;
  }

  let synced = 0;

  for (const release of releases) {
    if (release.draft || release.prerelease) continue;

    const version = release.tag_name.replace(/^v/, '');
    const platforms = detectPlatformsFromAssets(release.assets);

    for (const platform of platforms) {
      const existing = await env.DB.prepare(`
        SELECT id FROM versions WHERE app_id = ? AND version = ? AND platform = ?
      `).bind(appId, version, platform).first();

      if (existing) continue;

      const downloadUrl = findDownloadUrl(release.assets, platform) || release.html_url;

      await env.DB.prepare(`
        INSERT INTO versions (app_id, platform, version, version_code, download_url, changelog, force_update)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).bind(appId, platform, version, parseVersion(version), downloadUrl, release.body || null).run();

      synced++;
    }
  }

  return synced;
}

// ============ Client APIs ============

async function handleClientAPI(request: Request, env: Env, path: string): Promise<Response> {
  // Extract app_id from path: /v1/{app_id}/...
  const match = path.match(/^\/v1\/([^\/]+)\/(.+)$/);
  if (!match) {
    return errorResponse('Invalid path', 400);
  }

  const [, appId, endpoint] = match;

  // Verify app exists
  const app = await env.DB.prepare('SELECT * FROM applications WHERE app_id = ?').bind(appId).first();
  if (!app) {
    return errorResponse('App not found', 404);
  }

  switch (endpoint) {
    case 'version':
      return handleVersionCheck(request, env, appId);
    case 'event':
      return handleEventTrack(request, env, appId);
    case 'feedback':
      return handleFeedback(request, env, appId);
    default:
      return errorResponse('Unknown endpoint', 404);
  }
}

// GET /v1/{app_id}/version?platform=ios&current=1.0.0
async function handleVersionCheck(request: Request, env: Env, appId: string): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || 'ios';
  const currentVersion = url.searchParams.get('current') || '0.0.0';

  // Get latest version for this platform
  const latest = await env.DB.prepare(`
    SELECT * FROM versions
    WHERE app_id = ? AND platform = ?
    ORDER BY version_code DESC, created_at DESC
    LIMIT 1
  `).bind(appId, platform).first<{
    version: string;
    version_code: number;
    download_url: string | null;
    changelog: string | null;
    force_update: number;
  }>();

  if (!latest) {
    return jsonResponse({
      has_update: false,
      version: currentVersion,
      version_code: 0,
      download_url: null,
      changelog: null,
      force_update: false,
    });
  }

  const hasUpdate = parseVersion(latest.version) > parseVersion(currentVersion);

  return jsonResponse({
    has_update: hasUpdate,
    version: latest.version,
    version_code: latest.version_code,
    download_url: latest.download_url,
    changelog: latest.changelog,
    force_update: hasUpdate && Boolean(latest.force_update),
  });
}

// POST /v1/{app_id}/event
async function handleEventTrack(request: Request, env: Env, appId: string): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const body = await request.json() as {
    distinct_id?: string;
    event?: string;
    platform?: string;
    app_version?: string;
    timestamp?: number;
  };

  const { distinct_id, event, platform, app_version, timestamp } = body;

  // Validate required fields
  if (!distinct_id || !event) {
    return errorResponse('Missing required fields: distinct_id, event');
  }

  // Only allow specific events
  if (!['first_launch', 'app_open'].includes(event)) {
    return errorResponse('Invalid event. Allowed: first_launch, app_open');
  }

  // Insert event
  await env.DB.prepare(`
    INSERT INTO events (app_id, distinct_id, event, platform, app_version, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    appId,
    distinct_id,
    event,
    platform || null,
    app_version || null,
    timestamp || Date.now()
  ).run();

  return jsonResponse({ success: true });
}

// POST /v1/{app_id}/feedback
async function handleFeedback(request: Request, env: Env, appId: string): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const body = await request.json() as {
    content?: string;
    contact?: string;
    device_info?: object;
  };

  const { content, contact, device_info } = body;

  if (!content) {
    return errorResponse('Missing required field: content');
  }

  await env.DB.prepare(`
    INSERT INTO feedbacks (app_id, content, contact, device_info)
    VALUES (?, ?, ?, ?)
  `).bind(
    appId,
    content,
    contact || null,
    device_info ? JSON.stringify(device_info) : null
  ).run();

  return jsonResponse({ success: true });
}

// ============ Management APIs ============

async function handleManageAPI(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  // Verify API key
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey) {
    return errorResponse('Missing X-API-Key header', 401);
  }

  // Get app by API key
  const app = await env.DB.prepare('SELECT * FROM applications WHERE api_key = ?')
    .bind(apiKey)
    .first<{ app_id: string; app_name: string }>();

  if (!app) {
    return errorResponse('Invalid API key', 401);
  }

  const endpoint = path.replace('/manage/', '');

  switch (endpoint) {
    case 'stats':
      return handleStats(request, env, app.app_id, url);
    case 'version':
      return handleVersionManage(request, env, app.app_id);
    case 'feedbacks':
      return handleFeedbacksList(request, env, app.app_id, url);
    case 'app':
      return handleAppInfo(request, env, app);
    default:
      return errorResponse('Unknown endpoint', 404);
  }
}

// GET /manage/stats?start=2024-01-01&end=2024-01-31
async function handleStats(request: Request, env: Env, appId: string, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const startDate = url.searchParams.get('start') || getDateString(-30);
  const endDate = url.searchParams.get('end') || getDateString(0);

  const startTs = new Date(startDate).getTime();
  const endTs = new Date(endDate).getTime() + 86400000; // Include end date

  // Downloads (first_launch events)
  const downloads = await env.DB.prepare(`
    SELECT
      DATE(timestamp/1000, 'unixepoch') as date,
      platform,
      COUNT(*) as count
    FROM events
    WHERE app_id = ? AND event = 'first_launch'
      AND timestamp >= ? AND timestamp < ?
    GROUP BY date, platform
    ORDER BY date
  `).bind(appId, startTs, endTs).all<{ date: string; platform: string; count: number }>();

  // DAU (unique distinct_id per day with app_open)
  const dau = await env.DB.prepare(`
    SELECT
      DATE(timestamp/1000, 'unixepoch') as date,
      COUNT(DISTINCT distinct_id) as count
    FROM events
    WHERE app_id = ? AND event = 'app_open'
      AND timestamp >= ? AND timestamp < ?
    GROUP BY date
    ORDER BY date
  `).bind(appId, startTs, endTs).all<{ date: string; count: number }>();

  // Calculate retention (D1, D7, D30)
  const retention = await calculateRetention(env, appId, startDate);

  // Aggregate downloads
  const downloadsByPlatform: Record<string, number> = {};
  let totalDownloads = 0;
  const downloadsByDate: Array<{ date: string; count: number }> = [];
  const dateDownloads: Record<string, number> = {};

  for (const row of downloads.results || []) {
    downloadsByPlatform[row.platform] = (downloadsByPlatform[row.platform] || 0) + row.count;
    totalDownloads += row.count;
    dateDownloads[row.date] = (dateDownloads[row.date] || 0) + row.count;
  }

  for (const [date, count] of Object.entries(dateDownloads)) {
    downloadsByDate.push({ date, count });
  }

  // Calculate average DAU
  const dauResults = dau.results || [];
  const avgDau = dauResults.length > 0
    ? Math.round(dauResults.reduce((sum, r) => sum + r.count, 0) / dauResults.length)
    : 0;

  return jsonResponse({
    downloads: {
      total: totalDownloads,
      by_platform: downloadsByPlatform,
      by_date: downloadsByDate,
    },
    dau: {
      avg: avgDau,
      by_date: dauResults,
    },
    retention,
  });
}

async function calculateRetention(env: Env, appId: string, cohortDate: string): Promise<{ d1: number; d7: number; d30: number }> {
  const result: { d1: number; d7: number; d30: number } = { d1: 0, d7: 0, d30: 0 };

  for (const [key, days] of [['d1', 1], ['d7', 7], ['d30', 30]] as const) {
    const retention = await env.DB.prepare(`
      WITH cohort AS (
        SELECT DISTINCT distinct_id
        FROM events
        WHERE app_id = ? AND event = 'first_launch'
          AND DATE(timestamp/1000, 'unixepoch') = ?
      ),
      retained AS (
        SELECT DISTINCT distinct_id
        FROM events
        WHERE app_id = ? AND event = 'app_open'
          AND DATE(timestamp/1000, 'unixepoch') = DATE(?, '+' || ? || ' days')
          AND distinct_id IN (SELECT distinct_id FROM cohort)
      )
      SELECT
        (SELECT COUNT(*) FROM cohort) as cohort_size,
        (SELECT COUNT(*) FROM retained) as retained_count
    `).bind(appId, cohortDate, appId, cohortDate, days).first<{ cohort_size: number; retained_count: number }>();

    if (retention && retention.cohort_size > 0) {
      result[key] = Math.round((retention.retained_count / retention.cohort_size) * 10000) / 10000;
    }
  }

  return result;
}

// POST /manage/version
async function handleVersionManage(request: Request, env: Env, appId: string): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const body = await request.json() as {
    platform?: string;
    version?: string;
    version_code?: number;
    download_url?: string;
    changelog?: string;
    force_update?: boolean;
  };

  const { platform, version, version_code, download_url, changelog, force_update } = body;

  if (!platform || !version) {
    return errorResponse('Missing required fields: platform, version');
  }

  await env.DB.prepare(`
    INSERT INTO versions (app_id, platform, version, version_code, download_url, changelog, force_update)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    appId,
    platform,
    version,
    version_code || parseVersion(version),
    download_url || null,
    changelog || null,
    force_update ? 1 : 0
  ).run();

  return jsonResponse({ success: true, version });
}

// GET /manage/feedbacks?page=1&limit=20
async function handleFeedbacksList(request: Request, env: Env, appId: string, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  const feedbacks = await env.DB.prepare(`
    SELECT id, content, contact, device_info, created_at
    FROM feedbacks
    WHERE app_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(appId, limit, offset).all();

  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM feedbacks WHERE app_id = ?')
    .bind(appId)
    .first<{ count: number }>();

  return jsonResponse({
    feedbacks: feedbacks.results,
    pagination: {
      page,
      limit,
      total: total?.count || 0,
      pages: Math.ceil((total?.count || 0) / limit),
    },
  });
}

// GET /manage/app
async function handleAppInfo(request: Request, env: Env, app: { app_id: string; app_name: string }): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  return jsonResponse({
    app_id: app.app_id,
    app_name: app.app_name,
  });
}

// Helper function
function getDateString(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

// Generate a random API key
function generateApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'orb_';
  for (let i = 0; i < 24; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// ============ Admin APIs (for Dashboard) ============

async function handleAdminAPI(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  // Verify admin key
  const adminKey = request.headers.get('X-Admin-Key');
  const validAdminKey = env.ADMIN_KEY || DEFAULT_ADMIN_KEY;

  if (adminKey !== validAdminKey) {
    return errorResponse('Unauthorized', 401);
  }

  const endpoint = path.replace('/admin/', '');

  // Route to handlers
  if (endpoint === 'apps' || endpoint === 'apps/') {
    if (request.method === 'GET') {
      return handleListApps(env);
    }
    if (request.method === 'POST') {
      return handleCreateApp(request, env);
    }
  }

  // /admin/apps/{app_id}/stats
  const statsMatch = endpoint.match(/^apps\/([^\/]+)\/stats$/);
  if (statsMatch) {
    return handleAppStats(request, env, statsMatch[1], url);
  }

  // /admin/apps/{app_id}/feedbacks/{feedback_id}
  const feedbackMatch = endpoint.match(/^apps\/([^\/]+)\/feedbacks\/(\d+)$/);
  if (feedbackMatch) {
    if (request.method === 'DELETE') {
      return handleDeleteFeedback(env, feedbackMatch[1], parseInt(feedbackMatch[2]));
    }
  }

  // /admin/apps/{app_id}/feedbacks
  const feedbacksMatch = endpoint.match(/^apps\/([^\/]+)\/feedbacks$/);
  if (feedbacksMatch) {
    return handleAppFeedbacks(request, env, feedbacksMatch[1], url);
  }

  // /admin/apps/{app_id}/versions
  const versionsMatch = endpoint.match(/^apps\/([^\/]+)\/versions$/);
  if (versionsMatch) {
    if (request.method === 'GET') {
      return handleListVersions(env, versionsMatch[1]);
    }
    if (request.method === 'POST') {
      return handleCreateVersion(request, env, versionsMatch[1]);
    }
  }

  // /admin/apps/{app_id}
  const appMatch = endpoint.match(/^apps\/([^\/]+)$/);
  if (appMatch) {
    if (request.method === 'GET') {
      return handleGetApp(env, appMatch[1]);
    }
    if (request.method === 'DELETE') {
      return handleDeleteApp(env, appMatch[1]);
    }
    if (request.method === 'PATCH') {
      return handleUpdateApp(request, env, appMatch[1]);
    }
  }

  // /admin/apps/{app_id}/sync-github
  const syncMatch = endpoint.match(/^apps\/([^\/]+)\/sync-github$/);
  if (syncMatch && request.method === 'POST') {
    return handleSyncGitHub(env, syncMatch[1]);
  }

  return errorResponse('Not found', 404);
}

// GET /admin/apps
async function handleListApps(env: Env): Promise<Response> {
  const apps = await env.DB.prepare(`
    SELECT id, app_id, app_name, api_key, github_repo, created_at
    FROM applications
    ORDER BY created_at DESC
  `).all();

  return jsonResponse({ apps: apps.results });
}

// POST /admin/apps
async function handleCreateApp(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    app_id?: string;
    app_name?: string;
  };

  const { app_id, app_name } = body;

  if (!app_id || !app_name) {
    return errorResponse('Missing required fields: app_id, app_name');
  }

  // Check if app_id already exists
  const existing = await env.DB.prepare('SELECT id FROM applications WHERE app_id = ?')
    .bind(app_id)
    .first();

  if (existing) {
    return errorResponse('App ID already exists', 409);
  }

  const api_key = generateApiKey();

  await env.DB.prepare(`
    INSERT INTO applications (app_id, app_name, api_key)
    VALUES (?, ?, ?)
  `).bind(app_id, app_name, api_key).run();

  return jsonResponse({
    success: true,
    app: { app_id, app_name, api_key }
  }, 201);
}

// GET /admin/apps/{app_id}
async function handleGetApp(env: Env, appId: string): Promise<Response> {
  const app = await env.DB.prepare(`
    SELECT id, app_id, app_name, api_key, github_repo, created_at
    FROM applications
    WHERE app_id = ?
  `).bind(appId).first();

  if (!app) {
    return errorResponse('App not found', 404);
  }

  return jsonResponse({ app });
}

// PATCH /admin/apps/{app_id}
async function handleUpdateApp(request: Request, env: Env, appId: string): Promise<Response> {
  const body = await request.json() as {
    app_name?: string;
    github_repo?: string | null;
  };

  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (body.app_name !== undefined) {
    updates.push('app_name = ?');
    values.push(body.app_name);
  }

  if (body.github_repo !== undefined) {
    updates.push('github_repo = ?');
    values.push(body.github_repo);
  }

  if (updates.length === 0) {
    return errorResponse('No fields to update');
  }

  values.push(appId);

  await env.DB.prepare(`
    UPDATE applications SET ${updates.join(', ')} WHERE app_id = ?
  `).bind(...values).run();

  return jsonResponse({ success: true });
}

// DELETE /admin/apps/{app_id}
async function handleDeleteApp(env: Env, appId: string): Promise<Response> {
  // Delete related data first
  await env.DB.prepare('DELETE FROM events WHERE app_id = ?').bind(appId).run();
  await env.DB.prepare('DELETE FROM feedbacks WHERE app_id = ?').bind(appId).run();
  await env.DB.prepare('DELETE FROM versions WHERE app_id = ?').bind(appId).run();
  await env.DB.prepare('DELETE FROM applications WHERE app_id = ?').bind(appId).run();

  return jsonResponse({ success: true });
}

// POST /admin/apps/{app_id}/sync-github - Sync versions from GitHub Releases
async function handleSyncGitHub(env: Env, appId: string): Promise<Response> {
  // Get app with github_repo
  const app = await env.DB.prepare('SELECT github_repo FROM applications WHERE app_id = ?')
    .bind(appId)
    .first<{ github_repo: string | null }>();

  if (!app) {
    return errorResponse('App not found', 404);
  }

  if (!app.github_repo) {
    return errorResponse('No GitHub repository configured for this app');
  }

  const synced = await syncAppGitHubReleases(env, appId, app.github_repo);

  return jsonResponse({ success: true, synced });
}

// Fetch releases from GitHub API
async function fetchGitHubReleases(repo: string): Promise<GitHubRelease[] | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Orbit-SDK',
      },
    });

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status}`);
      return null;
    }

    return await response.json() as GitHubRelease[];
  } catch (error) {
    console.error('Failed to fetch GitHub releases:', error);
    return null;
  }
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  assets: GitHubAsset[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

// Detect platforms from release assets
function detectPlatformsFromAssets(assets: GitHubAsset[]): string[] {
  const platforms = new Set<string>();

  for (const asset of assets) {
    const name = asset.name.toLowerCase();

    if (name.includes('mac') || name.includes('darwin') || name.endsWith('.dmg')) {
      platforms.add('macos');
    }
    if (name.includes('win') || name.endsWith('.exe') || name.endsWith('.msi')) {
      platforms.add('windows');
    }
    if (name.includes('linux') || name.endsWith('.appimage') || name.endsWith('.deb')) {
      platforms.add('linux');
    }
    if (name.includes('ios') || name.endsWith('.ipa')) {
      platforms.add('ios');
    }
    if (name.includes('android') || name.endsWith('.apk') || name.endsWith('.aab')) {
      platforms.add('android');
    }
  }

  // If no specific platform detected, mark as 'all'
  if (platforms.size === 0) {
    platforms.add('all');
  }

  return Array.from(platforms);
}

// Find download URL for specific platform
function findDownloadUrl(assets: GitHubAsset[], platform: string): string | null {
  for (const asset of assets) {
    const name = asset.name.toLowerCase();

    switch (platform) {
      case 'macos':
        if (name.includes('mac') || name.includes('darwin') || name.endsWith('.dmg')) {
          return asset.browser_download_url;
        }
        break;
      case 'windows':
        if (name.includes('win') || name.endsWith('.exe') || name.endsWith('.msi')) {
          return asset.browser_download_url;
        }
        break;
      case 'linux':
        if (name.includes('linux') || name.endsWith('.appimage') || name.endsWith('.deb')) {
          return asset.browser_download_url;
        }
        break;
      case 'ios':
        if (name.includes('ios') || name.endsWith('.ipa')) {
          return asset.browser_download_url;
        }
        break;
      case 'android':
        if (name.includes('android') || name.endsWith('.apk') || name.endsWith('.aab')) {
          return asset.browser_download_url;
        }
        break;
    }
  }

  return null;
}

// GET /admin/apps/{app_id}/stats
async function handleAppStats(request: Request, env: Env, appId: string, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  // Verify app exists
  const app = await env.DB.prepare('SELECT app_id FROM applications WHERE app_id = ?')
    .bind(appId)
    .first();

  if (!app) {
    return errorResponse('App not found', 404);
  }

  const startDate = url.searchParams.get('start') || getDateString(-30);
  const endDate = url.searchParams.get('end') || getDateString(0);

  const startTs = new Date(startDate).getTime();
  const endTs = new Date(endDate).getTime() + 86400000;

  // Downloads by date
  const downloads = await env.DB.prepare(`
    SELECT
      DATE(timestamp/1000, 'unixepoch') as date,
      COUNT(*) as count
    FROM events
    WHERE app_id = ? AND event = 'first_launch'
      AND timestamp >= ? AND timestamp < ?
    GROUP BY date
    ORDER BY date
  `).bind(appId, startTs, endTs).all<{ date: string; count: number }>();

  // Downloads by platform
  const platformStats = await env.DB.prepare(`
    SELECT
      platform,
      COUNT(*) as count
    FROM events
    WHERE app_id = ? AND event = 'first_launch'
      AND timestamp >= ? AND timestamp < ?
    GROUP BY platform
  `).bind(appId, startTs, endTs).all<{ platform: string; count: number }>();

  // DAU by date
  const dau = await env.DB.prepare(`
    SELECT
      DATE(timestamp/1000, 'unixepoch') as date,
      COUNT(DISTINCT distinct_id) as count
    FROM events
    WHERE app_id = ? AND event = 'app_open'
      AND timestamp >= ? AND timestamp < ?
    GROUP BY date
    ORDER BY date
  `).bind(appId, startTs, endTs).all<{ date: string; count: number }>();

  // Calculate retention
  const retention = await calculateRetention(env, appId, startDate);

  // Calculate totals
  const downloadResults = downloads.results || [];
  const dauResults = dau.results || [];
  const totalDownloads = downloadResults.reduce((sum, r) => sum + r.count, 0);
  const avgDau = dauResults.length > 0
    ? Math.round(dauResults.reduce((sum, r) => sum + r.count, 0) / dauResults.length)
    : 0;

  return jsonResponse({
    downloads: {
      total: totalDownloads,
      by_date: downloadResults,
    },
    platform_stats: platformStats.results || [],
    dau: {
      avg: avgDau,
      by_date: dauResults,
    },
    retention,
  });
}

// DELETE /admin/apps/{app_id}/feedbacks/{feedback_id}
async function handleDeleteFeedback(env: Env, appId: string, feedbackId: number): Promise<Response> {
  const result = await env.DB.prepare(
    'DELETE FROM feedbacks WHERE id = ? AND app_id = ?'
  ).bind(feedbackId, appId).run();

  if (result.meta.changes === 0) {
    return errorResponse('Feedback not found', 404);
  }

  return jsonResponse({ success: true });
}

// GET /admin/apps/{app_id}/feedbacks
async function handleAppFeedbacks(request: Request, env: Env, appId: string, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  const feedbacks = await env.DB.prepare(`
    SELECT id, content, contact, device_info, created_at
    FROM feedbacks
    WHERE app_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(appId, limit, offset).all();

  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM feedbacks WHERE app_id = ?')
    .bind(appId)
    .first<{ count: number }>();

  return jsonResponse({
    feedbacks: feedbacks.results,
    pagination: {
      page,
      limit,
      total: total?.count || 0,
      pages: Math.ceil((total?.count || 0) / limit),
    },
  });
}

// GET /admin/apps/{app_id}/versions
async function handleListVersions(env: Env, appId: string): Promise<Response> {
  const versions = await env.DB.prepare(`
    SELECT id, platform, version, version_code, download_url, changelog, force_update, created_at
    FROM versions
    WHERE app_id = ?
    ORDER BY created_at DESC
  `).bind(appId).all();

  return jsonResponse({ versions: versions.results });
}

// POST /admin/apps/{app_id}/versions
async function handleCreateVersion(request: Request, env: Env, appId: string): Promise<Response> {
  const body = await request.json() as {
    platform?: string;
    version?: string;
    version_code?: number;
    download_url?: string;
    changelog?: string;
    force_update?: boolean;
  };

  const { platform, version, version_code, download_url, changelog, force_update } = body;

  if (!platform || !version) {
    return errorResponse('Missing required fields: platform, version');
  }

  await env.DB.prepare(`
    INSERT INTO versions (app_id, platform, version, version_code, download_url, changelog, force_update)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    appId,
    platform,
    version,
    version_code || parseVersion(version),
    download_url || null,
    changelog || null,
    force_update ? 1 : 0
  ).run();

  return jsonResponse({ success: true, version }, 201);
}
