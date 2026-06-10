/**
 * Orbit SDK for TypeScript (Electron/Tauri)
 *
 * Lightweight analytics SDK that auto-tracks downloads, DAU, and retention.
 * One-line initialization, zero configuration.
 */

// ============================================================================
// Types
// ============================================================================

export interface OrbitConfig {
  appId: string;
  endpoint?: string;
  /** Optional endpoint for feedback requests with attachments. Defaults to a file-capable endpoint. */
  attachmentEndpoint?: string;
  /** Force use China endpoint (Tencent Cloud Function) */
  forceChina?: boolean;
  /** Enable debug logging (default: false) */
  enableLogging?: boolean;
  /** Auto-track downloads and DAU (default: true). Set to false for web/feedback-only usage. */
  autoTrack?: boolean;
  flushInterval?: number;
}

// Endpoints
const ENDPOINT_GLOBAL = 'https://orbit-api.yangdongjuooakloo.workers.dev';
const ENDPOINT_CHINA = 'https://1301188123-5qkxnan435.ap-hongkong.tencentscf.com';

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion?: string;
  versionCode?: number;
  downloadUrl?: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

export type FeedbackAttachmentInput = File | Blob | {
  file: Blob;
  filename?: string;
  contentType?: string;
};

export interface FeedbackOptions {
  content: string;
  contact?: string;
  /** Optional files submitted with feedback. Total upload size is limited by the API. */
  attachments?: FeedbackAttachmentInput[];
}

interface EventPayload {
  distinct_id: string;
  event: string;
  platform: string;
  app_version: string;
  timestamp: number;
}

// ============================================================================
// Storage abstraction (works in both Electron and Tauri)
// ============================================================================

class Storage {
  private prefix = 'orbit_';

  get(key: string): string | null {
    try {
      return localStorage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(this.prefix + key, value);
    } catch {
      // Ignore storage errors
    }
  }

  getJSON<T>(key: string): T | null {
    const value = this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  setJSON(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }
}

// ============================================================================
// Orbit SDK
// ============================================================================

class OrbitSDK {
  private appId: string | null = null;
  private endpoint = ENDPOINT_GLOBAL;
  private attachmentEndpoint: string | null = null;
  private distinctId: string | null = null;
  private enableLogging = false;
  private autoTrack = true;
  private storage = new Storage();
  private eventQueue: EventPayload[] = [];
  private configured = false;

  /**
   * Initialize the SDK.
   *
   * @example
   * ```ts
   * // Full tracking (Electron/Tauri apps)
   * Orbit.configure({
   *   appId: 'com.example.app',
   * });
   *
   * // Feedback only (websites)
   * Orbit.configure({
   *   appId: 'com.example.app',
   *   autoTrack: false,
   * });
   * ```
   */
  configure(config: OrbitConfig): void {
    if (this.configured) {
      this.log('SDK already configured');
      return;
    }

    this.appId = config.appId;
    this.enableLogging = config.enableLogging ?? false;
    this.autoTrack = config.autoTrack ?? true;
    this.attachmentEndpoint = config.attachmentEndpoint ?? null;

    // Determine endpoint: explicit > forceChina > auto-detect
    if (config.endpoint) {
      this.endpoint = config.endpoint;
    } else if (config.forceChina) {
      this.endpoint = ENDPOINT_CHINA;
    } else {
      this.endpoint = this.detectEndpoint();
    }

    this.log(`Using endpoint: ${this.endpoint}`);

    // Get or create device ID
    this.distinctId = this.getOrCreateDistinctId();

    // Auto-track downloads and DAU (can be disabled for web/feedback-only)
    if (this.autoTrack) {
      // Restore failed events from storage
      this.restoreEventQueue();

      // Check if first launch
      const hasLaunched = this.storage.get('has_launched') === 'true';

      if (!hasLaunched) {
        // First launch
        this.track('first_launch');
        this.storage.set('has_launched', 'true');
      }

      // Track app open on every launch
      this.track('app_open');

      // Flush queued events
      this.flushEventQueue();
    }

    this.configured = true;
    this.log(`Initialized with appId: ${this.appId}, autoTrack: ${this.autoTrack}`);
  }

  /**
   * Check for app updates.
   *
   * @example
   * ```ts
   * const result = await Orbit.checkUpdate();
   * if (result.hasUpdate) {
   *   console.log('New version:', result.latestVersion);
   * }
   * ```
   */
  async checkUpdate(): Promise<UpdateInfo> {
    if (!this.appId) {
      this.log('SDK not configured');
      return { hasUpdate: false };
    }

    const platform = this.getPlatform();
    const currentVersion = this.getAppVersion();

    try {
      const response = await fetch(
        `${this.endpoint}/v1/${this.appId}/version?platform=${platform}&current=${currentVersion}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        hasUpdate: data.has_update ?? false,
        latestVersion: data.version,
        versionCode: data.version_code,
        downloadUrl: data.download_url,
        releaseNotes: data.changelog,
        forceUpdate: data.force_update ?? false,
      };
    } catch (error) {
      this.log('Failed to check update:', error);
      return { hasUpdate: false };
    }
  }

  /**
   * Submit user feedback.
   *
   * @example
   * ```ts
   * Orbit.sendFeedback({
   *   content: 'Great app!',
   *   contact: 'user@example.com',
   * });
   * ```
   */
  async sendFeedback(options: FeedbackOptions): Promise<boolean> {
    if (!this.appId) {
      this.log('SDK not configured');
      return false;
    }

    const deviceInfo = {
      platform: this.getPlatform(),
      app_version: this.getAppVersion(),
      distinct_id: this.distinctId,
    };
    const attachments = options.attachments?.filter(Boolean) ?? [];

    try {
      const endpoint = this.getFeedbackEndpoint(attachments.length > 0);
      const response = attachments.length > 0
        ? await this.sendFeedbackFormData(endpoint, options, deviceInfo, attachments)
        : await this.sendFeedbackJson(endpoint, options, deviceInfo);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.log('Feedback submitted');
      return true;
    } catch (error) {
      this.log('Failed to submit feedback:', error);
      return false;
    }
  }

  private sendFeedbackJson(
    endpoint: string,
    options: FeedbackOptions,
    deviceInfo: { platform: string; app_version: string; distinct_id: string | null }
  ): Promise<Response> {
    return fetch(`${endpoint}/v1/${this.appId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: options.content,
        contact: options.contact,
        device_info: deviceInfo,
      }),
    });
  }

  private sendFeedbackFormData(
    endpoint: string,
    options: FeedbackOptions,
    deviceInfo: { platform: string; app_version: string; distinct_id: string | null },
    attachments: FeedbackAttachmentInput[]
  ): Promise<Response> {
    const formData = new FormData();
    formData.append('content', options.content);
    if (options.contact) {
      formData.append('contact', options.contact);
    }
    formData.append('device_info', JSON.stringify(deviceInfo));

    for (const attachment of attachments) {
      const { file, filename } = this.normalizeFeedbackAttachment(attachment);
      formData.append('attachments', file, filename);
    }

    return fetch(`${endpoint}/v1/${this.appId}/feedback`, {
      method: 'POST',
      body: formData,
    });
  }

  private getFeedbackEndpoint(hasAttachments: boolean): string {
    if (!hasAttachments) {
      return this.endpoint;
    }

    if (this.attachmentEndpoint) {
      return this.attachmentEndpoint;
    }

    // The China endpoint currently accepts JSON feedback only. Keep attachment
    // uploads transparent for SDK users by routing files to the file-capable endpoint.
    if (this.endpoint === ENDPOINT_CHINA) {
      this.log('China endpoint does not support attachments yet; using global file endpoint');
      return ENDPOINT_GLOBAL;
    }

    return this.endpoint;
  }

  private normalizeFeedbackAttachment(attachment: FeedbackAttachmentInput): { file: Blob; filename: string } {
    if (attachment instanceof File) {
      return { file: attachment, filename: attachment.name };
    }

    if (attachment instanceof Blob) {
      return { file: attachment, filename: 'attachment' };
    }

    const file = attachment.contentType && !attachment.file.type
      ? new Blob([attachment.file], { type: attachment.contentType })
      : attachment.file;

    return { file, filename: attachment.filename || 'attachment' };
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  private getOrCreateDistinctId(): string {
    const key = 'distinct_id';
    let id = this.storage.get(key);

    if (!id) {
      id = this.generateUUID();
      this.storage.set(key, id);
    }

    return id;
  }

  private generateUUID(): string {
    // Use crypto.randomUUID if available (modern browsers/Node)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback to manual UUID v4 generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private track(event: string): void {
    if (!this.appId || !this.distinctId) {
      return;
    }

    const payload: EventPayload = {
      distinct_id: this.distinctId,
      event,
      platform: this.getPlatform(),
      app_version: this.getAppVersion(),
      timestamp: Date.now(),
    };

    this.sendEvent(payload);
  }

  private async sendEvent(payload: EventPayload): Promise<void> {
    if (!this.appId) return;

    try {
      const response = await fetch(`${this.endpoint}/v1/${this.appId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.log(`Event sent: ${payload.event}`);
    } catch (error) {
      this.log(`Event failed, queuing: ${payload.event}`, error);
      this.queueEvent(payload);
    }
  }

  private queueEvent(payload: EventPayload): void {
    this.eventQueue.push(payload);

    // Limit queue size
    if (this.eventQueue.length > 100) {
      this.eventQueue.shift();
    }

    // Persist queue
    this.storage.setJSON('event_queue', this.eventQueue);
  }

  private restoreEventQueue(): void {
    const queue = this.storage.getJSON<EventPayload[]>('event_queue');
    if (queue && Array.isArray(queue)) {
      this.eventQueue = queue;
    }
  }

  private async flushEventQueue(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const queue = [...this.eventQueue];
    this.eventQueue = [];
    this.storage.setJSON('event_queue', []);

    for (const payload of queue) {
      await this.sendEvent(payload);
    }
  }

  private getPlatform(): string {
    // Detect platform based on user agent and environment
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof process !== 'undefined' && process?.platform) {
      // Node.js / Electron main process
      const platform = process.platform;
      switch (platform) {
        case 'darwin':
          return 'macos';
        case 'win32':
          return 'windows';
        case 'linux':
          return 'linux';
        default:
          return platform;
      }
    }

    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('win')) return 'windows';
      if (ua.includes('mac')) return 'macos';
      if (ua.includes('linux')) return 'linux';
    }

    return 'unknown';
  }

  private getAppVersion(): string {
    // Try to get version from various sources

    // 1. Electron / Node.js environment
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof process !== 'undefined' && process?.env?.npm_package_version) {
      return process.env.npm_package_version;
    }

    // 2. Check for __APP_VERSION__ (common build-time injection)
    if (typeof (globalThis as Record<string, unknown>).__APP_VERSION__ === 'string') {
      return (globalThis as Record<string, unknown>).__APP_VERSION__ as string;
    }

    // 3. Fallback
    return 'unknown';
  }

  /**
   * Detect if running in China and choose appropriate endpoint.
   * Uses timezone as the only heuristic (Asia/Shanghai = China mainland).
   * Language is not used because overseas Chinese may use zh-CN.
   */
  private detectEndpoint(): string {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Only Asia/Shanghai and Asia/Chongqing are used in mainland China
      // Hong Kong (Asia/Hong_Kong), Taiwan (Asia/Taipei), Singapore (Asia/Singapore) use global endpoint
      if (timezone === 'Asia/Shanghai' || timezone === 'Asia/Chongqing') {
        this.log('Detected China timezone, using China endpoint');
        return ENDPOINT_CHINA;
      }
    } catch {
      // Ignore detection errors
    }

    return ENDPOINT_GLOBAL;
  }

  private log(...args: unknown[]): void {
    if (this.enableLogging) {
      console.log('[Orbit]', ...args);
    }
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const Orbit = new OrbitSDK();

// Also export the class for testing
export { OrbitSDK };
