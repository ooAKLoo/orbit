export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ADMIN_KEY?: string;
  SYNC_SECRET?: string;
  FEEDBACK_FILES?: R2Bucket;
}

// Admin key for dashboard access (set in wrangler.toml or secrets)
const DEFAULT_ADMIN_KEY = 'orbit-admin-secret-key';
const MAX_FEEDBACK_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_FEEDBACK_ATTACHMENT_COUNT = 5;

interface PublicFeedbackAttachment {
  id: number;
  feedback_id: number;
  file_name: string;
  file_type: string | null;
  file_size: number;
  created_at: number;
}

interface FeedbackAttachmentRow extends PublicFeedbackAttachment {
  object_key: string;
}

interface FeedbackRow {
  id: number;
  content: string;
  contact: string | null;
  device_info: string | null;
  created_at: number;
  attachments?: PublicFeedbackAttachment[];
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Admin-Key, X-Sync-Secret, Authorization',
  'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length',
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
        return await handleClientAPI(request, env, path);
      }

      // Management APIs: /manage/...
      if (path.startsWith('/manage/')) {
        return await handleManageAPI(request, env, path, url);
      }

      // Admin APIs: /admin/... (for dashboard)
      if (path.startsWith('/admin/')) {
        return await handleAdminAPI(request, env, path, url);
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

  // Get country from Cloudflare edge
  const country = (request as Request & { cf?: { country?: string } }).cf?.country || null;

  // Insert event
  await env.DB.prepare(`
    INSERT INTO events (app_id, distinct_id, event, platform, app_version, timestamp, country)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    appId,
    distinct_id,
    event,
    platform || null,
    app_version || null,
    timestamp || Date.now(),
    country
  ).run();

  return jsonResponse({ success: true });
}

// POST /v1/{app_id}/feedback
async function handleFeedback(request: Request, env: Env, appId: string): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const { content, contact, device_info, attachments } = await parseFeedbackRequest(request);

  if (!content) {
    return errorResponse('Missing required field: content');
  }

  if (attachments.length > MAX_FEEDBACK_ATTACHMENT_COUNT) {
    return errorResponse(`Too many attachments. Maximum is ${MAX_FEEDBACK_ATTACHMENT_COUNT}`);
  }

  const totalAttachmentSize = attachments.reduce((total, file) => total + file.size, 0);
  if (totalAttachmentSize > MAX_FEEDBACK_ATTACHMENT_BYTES) {
    return errorResponse('Attachment total size exceeds 15MB');
  }

  if (attachments.length > 0 && !env.FEEDBACK_FILES) {
    return errorResponse('Feedback file storage is not configured', 503);
  }

  const insertResult = await env.DB.prepare(`
    INSERT INTO feedbacks (app_id, content, contact, device_info)
    VALUES (?, ?, ?, ?)
  `).bind(
    appId,
    content,
    contact || null,
    device_info ? JSON.stringify(device_info) : null
  ).run();

  const feedbackId = Number((insertResult.meta as { last_row_id?: number }).last_row_id);
  if (!Number.isFinite(feedbackId) || feedbackId <= 0) {
    return errorResponse('Failed to create feedback', 500);
  }

  const storedAttachments: PublicFeedbackAttachment[] = [];

  try {
    for (const file of attachments) {
      const fileName = sanitizeFileName(file.name || 'attachment');
      const objectKey = buildFeedbackObjectKey(appId, feedbackId, fileName);
      const fileType = file.type || 'application/octet-stream';

      await env.FEEDBACK_FILES!.put(objectKey, file.stream(), {
        httpMetadata: { contentType: fileType },
        customMetadata: {
          app_id: appId,
          feedback_id: String(feedbackId),
          file_name: fileName,
        },
      });

      const attachmentResult = await env.DB.prepare(`
        INSERT INTO feedback_attachments (feedback_id, app_id, object_key, file_name, file_type, file_size)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(feedbackId, appId, objectKey, fileName, fileType, file.size).run();

      storedAttachments.push({
        id: Number((attachmentResult.meta as { last_row_id?: number }).last_row_id),
        feedback_id: feedbackId,
        file_name: fileName,
        file_type: fileType,
        file_size: file.size,
        created_at: Math.floor(Date.now() / 1000),
      });
    }
  } catch (error) {
    console.error('Failed to store feedback attachment:', error);
    await deleteFeedbackAttachmentObjects(env, appId, feedbackId);
    await env.DB.prepare('DELETE FROM feedback_attachments WHERE feedback_id = ? AND app_id = ?')
      .bind(feedbackId, appId)
      .run();
    await env.DB.prepare('DELETE FROM feedbacks WHERE id = ? AND app_id = ?')
      .bind(feedbackId, appId)
      .run();
    return errorResponse('Failed to store attachment', 500);
  }

  return jsonResponse({ success: true, feedback_id: feedbackId, attachments: storedAttachments });
}

async function parseFeedbackRequest(request: Request): Promise<{
  content?: string;
  contact?: string;
  device_info?: object;
  attachments: File[];
}> {
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    return {
      content: getFormString(formData.get('content')),
      contact: getFormString(formData.get('contact')),
      device_info: parseDeviceInfo(getFormString(formData.get('device_info'))),
      attachments: (formData.getAll('attachments') as unknown[]).filter(isUploadedFile),
    };
  }

  const body = await request.json() as {
    content?: string;
    contact?: string;
    device_info?: object;
  };

  return {
    content: body.content,
    contact: body.contact,
    device_info: body.device_info,
    attachments: [],
  };
}

function getFormString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isUploadedFile(value: unknown): value is File {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const file = value as { size?: unknown; name?: unknown; stream?: unknown };
  return typeof file.size === 'number' && file.size > 0
    && typeof file.name === 'string'
    && typeof file.stream === 'function';
}

function parseDeviceInfo(value: string | undefined): object | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeFileName(fileName: string): string {
  const backslash = String.fromCharCode(92);
  const sanitized = Array.from(fileName)
    .map((char) => (char === '/' || char === backslash || char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .trim();
  return sanitized || 'attachment';
}

function buildFeedbackObjectKey(appId: string, feedbackId: number, fileName: string): string {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `feedback/${appId}/${feedbackId}/${id}-${fileName}`;
}

function buildContentDisposition(fileName: string): string {
  const fallback = sanitizeFileName(fileName).replace(/"/g, '');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function listFeedbacksWithAttachments(
  env: Env,
  appId: string,
  limit: number,
  offset: number
): Promise<FeedbackRow[]> {
  const feedbacks = await env.DB.prepare(`
    SELECT id, content, contact, device_info, created_at
    FROM feedbacks
    WHERE app_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(appId, limit, offset).all<FeedbackRow>();

  const rows = feedbacks.results || [];
  for (const feedback of rows) {
    feedback.attachments = [];
  }

  if (rows.length === 0) {
    return rows;
  }

  const ids = rows.map((feedback) => feedback.id);
  const placeholders = ids.map(() => '?').join(',');
  const attachments = await env.DB.prepare(`
    SELECT id, feedback_id, file_name, file_type, file_size, created_at
    FROM feedback_attachments
    WHERE app_id = ? AND feedback_id IN (${placeholders})
    ORDER BY created_at ASC
  `).bind(appId, ...ids).all<PublicFeedbackAttachment>();

  const byFeedbackId = new Map<number, PublicFeedbackAttachment[]>();
  for (const attachment of attachments.results || []) {
    const list = byFeedbackId.get(attachment.feedback_id) || [];
    list.push(attachment);
    byFeedbackId.set(attachment.feedback_id, list);
  }

  for (const feedback of rows) {
    feedback.attachments = byFeedbackId.get(feedback.id) || [];
  }

  return rows;
}

async function deleteFeedbackAttachmentObjects(env: Env, appId: string, feedbackId?: number): Promise<void> {
  if (!env.FEEDBACK_FILES) {
    return;
  }

  const query = feedbackId
    ? env.DB.prepare('SELECT object_key FROM feedback_attachments WHERE app_id = ? AND feedback_id = ?').bind(appId, feedbackId)
    : env.DB.prepare('SELECT object_key FROM feedback_attachments WHERE app_id = ?').bind(appId);
  const attachments = await query.all<{ object_key: string }>();

  await Promise.all((attachments.results || []).map((attachment) => (
    env.FEEDBACK_FILES!.delete(attachment.object_key)
  )));
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

  // Downloads (unique devices with first_launch)
  const downloads = await env.DB.prepare(`
    SELECT
      DATE(timestamp/1000, 'unixepoch') as date,
      platform,
      COUNT(DISTINCT distinct_id) as count
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
  const downloadsByDate: Array<{ date: string; count: number }> = [];
  const dateDownloads: Record<string, number> = {};

  for (const row of downloads.results || []) {
    downloadsByPlatform[row.platform] = (downloadsByPlatform[row.platform] || 0) + row.count;
    dateDownloads[row.date] = (dateDownloads[row.date] || 0) + row.count;
  }

  // All-time total downloads (unique devices)
  const allTimeDownloads = await env.DB.prepare(
    `SELECT COUNT(DISTINCT distinct_id) as count FROM events WHERE app_id = ? AND event = 'first_launch'`
  ).bind(appId).first<{ count: number }>();
  const totalDownloads = allTimeDownloads?.count || 0;

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

async function calculateRetention(env: Env, appId: string, startDate: string): Promise<{ d1: number; d7: number; d30: number }> {
  const result: { d1: number; d7: number; d30: number } = { d1: 0, d7: 0, d30: 0 };

  // Average retention across multiple cohort dates (last 7 days before startDate)
  // This gives a more representative retention rate than a single day
  for (const [key, days] of [['d1', 1], ['d7', 7], ['d30', 30]] as const) {
    const retention = await env.DB.prepare(`
      WITH cohort_dates AS (
        SELECT DISTINCT DATE(timestamp/1000, 'unixepoch') as cohort_date
        FROM events
        WHERE app_id = ? AND event = 'first_launch'
          AND DATE(timestamp/1000, 'unixepoch') BETWEEN DATE(?, '-6 days') AND ?
      ),
      cohort AS (
        SELECT cd.cohort_date, e.distinct_id
        FROM cohort_dates cd
        JOIN events e ON DATE(e.timestamp/1000, 'unixepoch') = cd.cohort_date
          AND e.app_id = ? AND e.event = 'first_launch'
        GROUP BY cd.cohort_date, e.distinct_id
      ),
      retained AS (
        SELECT DISTINCT c.cohort_date, c.distinct_id
        FROM cohort c
        JOIN events e ON e.distinct_id = c.distinct_id
          AND e.app_id = ? AND e.event = 'app_open'
          AND DATE(e.timestamp/1000, 'unixepoch') = DATE(c.cohort_date, '+' || ? || ' days')
      )
      SELECT
        (SELECT COUNT(*) FROM cohort) as cohort_size,
        (SELECT COUNT(*) FROM retained) as retained_count
    `).bind(appId, startDate, startDate, appId, appId, days).first<{ cohort_size: number; retained_count: number }>();

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

  const feedbacks = await listFeedbacksWithAttachments(env, appId, limit, offset);

  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM feedbacks WHERE app_id = ?')
    .bind(appId)
    .first<{ count: number }>();

  return jsonResponse({
    feedbacks,
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

// ============ Auth Helpers ============

// Generate auth token for users
function generateAuthToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'oat_';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Authenticate admin requests - returns userId or error response
async function authenticateAdmin(request: Request, env: Env): Promise<{ userId: string } | Response> {
  // Try Bearer token first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = await env.DB.prepare(
      'SELECT user_id FROM users WHERE auth_token = ?'
    ).bind(token).first<{ user_id: string }>();

    if (user) {
      return { userId: user.user_id };
    }
  }

  // Fallback to X-Admin-Key during transition
  const adminKey = request.headers.get('X-Admin-Key');
  const validAdminKey = env.ADMIN_KEY || DEFAULT_ADMIN_KEY;
  if (adminKey === validAdminKey) {
    return { userId: '__admin__' };
  }

  return errorResponse('Unauthorized', 401);
}

// POST /admin/auth/sync - Server-to-server user sync
async function handleAuthSync(request: Request, env: Env): Promise<Response> {
  const syncSecret = request.headers.get('X-Sync-Secret');
  if (!syncSecret || syncSecret !== env.SYNC_SECRET) {
    return errorResponse('Unauthorized', 401);
  }

  const body = await request.json() as {
    provider: string;
    provider_id: string;
    email?: string;
    name?: string;
    avatar_url?: string;
  };

  const { provider, provider_id, email, name, avatar_url } = body;
  if (!provider || !provider_id) {
    return errorResponse('Missing required fields: provider, provider_id');
  }

  const user_id = `${provider}_${provider_id}`;

  // Check if user exists
  const existing = await env.DB.prepare(
    'SELECT auth_token, plan, daily_limit, retention_days FROM users WHERE user_id = ?'
  ).bind(user_id).first<{
    auth_token: string;
    plan: string;
    daily_limit: number;
    retention_days: number;
  }>();

  if (existing) {
    // Update profile info
    await env.DB.prepare(`
      UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = unixepoch()
      WHERE user_id = ?
    `).bind(email || null, name || null, avatar_url || null, user_id).run();

    return jsonResponse({
      user_id,
      auth_token: existing.auth_token,
      plan: existing.plan,
      daily_limit: existing.daily_limit,
      retention_days: existing.retention_days,
    });
  }

  // Create new user
  const auth_token = generateAuthToken();
  await env.DB.prepare(`
    INSERT INTO users (user_id, provider, provider_id, email, name, avatar_url, auth_token)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(user_id, provider, provider_id, email || null, name || null, avatar_url || null, auth_token).run();

  return jsonResponse({
    user_id,
    auth_token,
    plan: 'free',
    daily_limit: 2000,
    retention_days: 30,
  });
}

// ============ Admin APIs (for Dashboard) ============

async function handleAdminAPI(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  const endpoint = path.replace('/admin/', '');

  // Auth sync is server-to-server, uses X-Sync-Secret
  if (endpoint === 'auth/sync' && request.method === 'POST') {
    return handleAuthSync(request, env);
  }

  // Authenticate admin user
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }
  const { userId } = authResult;

  // GET /admin/usage - today's request count
  if (endpoint === 'usage' && request.method === 'GET') {
    return handleUsage(env, userId);
  }

  // List/Create apps
  if (endpoint === 'apps' || endpoint === 'apps/') {
    if (request.method === 'GET') {
      return handleListApps(env, userId);
    }
    if (request.method === 'POST') {
      return handleCreateApp(request, env, userId);
    }
  }

  // All routes below require an app_id - extract and verify ownership
  const appIdMatch = endpoint.match(/^apps\/([^\/]+)/);
  if (appIdMatch) {
    const appId = appIdMatch[1];

    // Verify app ownership (skip for legacy __admin__)
    if (userId !== '__admin__') {
      const ownsApp = await env.DB.prepare(
        'SELECT app_id FROM applications WHERE app_id = ? AND user_id = ?'
      ).bind(appId, userId).first();

      if (!ownsApp) {
        return errorResponse('App not found', 404);
      }
    }

    // Determine sub-path after app_id
    const subPath = endpoint.slice(`apps/${appId}`.length).replace(/^\//, '');

    if (subPath === 'stats') {
      return handleAppStats(request, env, appId, url);
    }

    const attachmentDownloadMatch = subPath.match(/^feedbacks\/(\d+)\/attachments\/(\d+)$/);
    if (attachmentDownloadMatch) {
      return handleDownloadFeedbackAttachment(
        request,
        env,
        appId,
        parseInt(attachmentDownloadMatch[1]),
        parseInt(attachmentDownloadMatch[2])
      );
    }

    const feedbackDeleteMatch = subPath.match(/^feedbacks\/(\d+)$/);
    if (feedbackDeleteMatch && request.method === 'DELETE') {
      return handleDeleteFeedback(env, appId, parseInt(feedbackDeleteMatch[1]));
    }

    if (subPath === 'feedbacks') {
      return handleAppFeedbacks(request, env, appId, url);
    }

    if (subPath === 'versions') {
      if (request.method === 'GET') return handleListVersions(env, appId);
      if (request.method === 'POST') return handleCreateVersion(request, env, appId);
    }

    if (subPath === 'sync-github' && request.method === 'POST') {
      return handleSyncGitHub(env, appId);
    }

    // /admin/apps/{app_id} (no sub-path)
    if (subPath === '') {
      if (request.method === 'GET') return handleGetApp(env, appId);
      if (request.method === 'DELETE') return handleDeleteApp(env, appId);
      if (request.method === 'PATCH') return handleUpdateApp(request, env, appId);
    }
  }

  return errorResponse('Not found', 404);
}

// GET /admin/usage
async function handleUsage(env: Env, userId: string): Promise<Response> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const result = userId === '__admin__'
    ? await env.DB.prepare(
        `SELECT COUNT(*) as count FROM events WHERE timestamp >= ?`
      ).bind(todayTs).first<{ count: number }>()
    : await env.DB.prepare(
        `SELECT COUNT(*) as count FROM events
         WHERE app_id IN (SELECT app_id FROM applications WHERE user_id = ?)
         AND timestamp >= ?`
      ).bind(userId, todayTs).first<{ count: number }>();

  return jsonResponse({ today: result?.count || 0 });
}

// GET /admin/apps
async function handleListApps(env: Env, userId: string): Promise<Response> {
  const apps = userId === '__admin__'
    ? await env.DB.prepare(`
        SELECT id, app_id, app_name, api_key, github_repo, created_at
        FROM applications ORDER BY created_at DESC
      `).all()
    : await env.DB.prepare(`
        SELECT id, app_id, app_name, api_key, github_repo, created_at
        FROM applications WHERE user_id = ?
        ORDER BY created_at DESC
      `).bind(userId).all();

  return jsonResponse({ apps: apps.results });
}

// POST /admin/apps
async function handleCreateApp(request: Request, env: Env, userId: string): Promise<Response> {
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
  const effectiveUserId = userId === '__admin__' ? null : userId;

  await env.DB.prepare(`
    INSERT INTO applications (app_id, app_name, api_key, user_id)
    VALUES (?, ?, ?, ?)
  `).bind(app_id, app_name, api_key, effectiveUserId).run();

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
    app_id?: string;
    github_repo?: string | null;
  };

  const newAppId = body.app_id?.trim();

  // Handle app_id change with cascade update
  if (newAppId && newAppId !== appId) {
    if (!newAppId) {
      return errorResponse('App ID cannot be empty');
    }

    // Check uniqueness
    const existing = await env.DB.prepare(
      'SELECT app_id FROM applications WHERE app_id = ?'
    ).bind(newAppId).first();

    if (existing) {
      return errorResponse('App ID already exists', 409);
    }

    // Build applications update with all changed fields
    const appUpdates = ['app_id = ?'];
    const appValues: (string | null)[] = [newAppId];

    if (body.app_name !== undefined) {
      appUpdates.push('app_name = ?');
      appValues.push(body.app_name);
    }
    if (body.github_repo !== undefined) {
      appUpdates.push('github_repo = ?');
      appValues.push(body.github_repo);
    }

    appValues.push(appId);

    // Cascade update all tables in a transaction via batch
    await env.DB.batch([
      env.DB.prepare('UPDATE events SET app_id = ? WHERE app_id = ?').bind(newAppId, appId),
      env.DB.prepare('UPDATE feedbacks SET app_id = ? WHERE app_id = ?').bind(newAppId, appId),
      env.DB.prepare('UPDATE feedback_attachments SET app_id = ? WHERE app_id = ?').bind(newAppId, appId),
      env.DB.prepare('UPDATE versions SET app_id = ? WHERE app_id = ?').bind(newAppId, appId),
      env.DB.prepare(`UPDATE applications SET ${appUpdates.join(', ')} WHERE app_id = ?`).bind(...appValues),
    ]);

    return jsonResponse({ success: true, new_app_id: newAppId });
  }

  // Regular update (no app_id change)
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
  await deleteFeedbackAttachmentObjects(env, appId);
  await env.DB.prepare('DELETE FROM events WHERE app_id = ?').bind(appId).run();
  await env.DB.prepare('DELETE FROM feedback_attachments WHERE app_id = ?').bind(appId).run();
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

  // Downloads by date (unique devices)
  const downloads = await env.DB.prepare(`
    SELECT
      DATE(timestamp/1000, 'unixepoch') as date,
      COUNT(DISTINCT distinct_id) as count
    FROM events
    WHERE app_id = ? AND event = 'first_launch'
      AND timestamp >= ? AND timestamp < ?
    GROUP BY date
    ORDER BY date
  `).bind(appId, startTs, endTs).all<{ date: string; count: number }>();

  // Downloads by platform (unique devices)
  const platformStats = await env.DB.prepare(`
    SELECT
      platform,
      COUNT(DISTINCT distinct_id) as count
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

  // Country stats (unique users by country)
  const countryStats = await env.DB.prepare(`
    SELECT
      country,
      COUNT(DISTINCT distinct_id) as count
    FROM events
    WHERE app_id = ? AND country IS NOT NULL
      AND timestamp >= ? AND timestamp < ?
    GROUP BY country
    ORDER BY count DESC
  `).bind(appId, startTs, endTs).all<{ country: string; count: number }>();

  // Calculate retention
  const retention = await calculateRetention(env, appId, startDate);

  // Calculate totals
  const downloadResults = downloads.results || [];
  const dauResults = dau.results || [];

  // All-time total downloads (unique devices)
  const allTimeDownloads = await env.DB.prepare(
    `SELECT COUNT(DISTINCT distinct_id) as count FROM events WHERE app_id = ? AND event = 'first_launch'`
  ).bind(appId).first<{ count: number }>();
  const totalDownloads = allTimeDownloads?.count || 0;

  const avgDau = dauResults.length > 0
    ? Math.round(dauResults.reduce((sum, r) => sum + r.count, 0) / dauResults.length)
    : 0;

  return jsonResponse({
    downloads: {
      total: totalDownloads,
      by_date: downloadResults,
    },
    platform_stats: platformStats.results || [],
    country_stats: countryStats.results || [],
    dau: {
      avg: avgDau,
      by_date: dauResults,
    },
    retention,
  });
}

// DELETE /admin/apps/{app_id}/feedbacks/{feedback_id}
async function handleDeleteFeedback(env: Env, appId: string, feedbackId: number): Promise<Response> {
  await deleteFeedbackAttachmentObjects(env, appId, feedbackId);
  await env.DB.prepare('DELETE FROM feedback_attachments WHERE feedback_id = ? AND app_id = ?')
    .bind(feedbackId, appId)
    .run();

  const result = await env.DB.prepare(
    'DELETE FROM feedbacks WHERE id = ? AND app_id = ?'
  ).bind(feedbackId, appId).run();

  if (result.meta.changes === 0) {
    return errorResponse('Feedback not found', 404);
  }

  return jsonResponse({ success: true });
}

async function handleDownloadFeedbackAttachment(
  request: Request,
  env: Env,
  appId: string,
  feedbackId: number,
  attachmentId: number
): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  if (!env.FEEDBACK_FILES) {
    return errorResponse('Feedback file storage is not configured', 503);
  }

  const attachment = await env.DB.prepare(`
    SELECT id, feedback_id, object_key, file_name, file_type, file_size, created_at
    FROM feedback_attachments
    WHERE id = ? AND feedback_id = ? AND app_id = ?
  `).bind(attachmentId, feedbackId, appId).first<FeedbackAttachmentRow>();

  if (!attachment) {
    return errorResponse('Attachment not found', 404);
  }

  const object = await env.FEEDBACK_FILES.get(attachment.object_key);
  if (!object) {
    return errorResponse('Attachment file not found', 404);
  }

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', attachment.file_type || 'application/octet-stream');
  headers.set('Content-Length', String(attachment.file_size));
  headers.set('Content-Disposition', buildContentDisposition(attachment.file_name));
  headers.set('Cache-Control', 'private, max-age=60');

  return new Response(object.body, { headers });
}

// GET /admin/apps/{app_id}/feedbacks
async function handleAppFeedbacks(request: Request, env: Env, appId: string, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  const feedbacks = await listFeedbacksWithAttachments(env, appId, limit, offset);

  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM feedbacks WHERE app_id = ?')
    .bind(appId)
    .first<{ count: number }>();

  return jsonResponse({
    feedbacks,
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
