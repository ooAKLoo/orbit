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
  enableLogging?: boolean;
  flushInterval?: number;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion?: string;
  versionCode?: number;
  downloadUrl?: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

export interface FeedbackOptions {
  content: string;
  contact?: string;
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
  private endpoint = 'https://orbit-api.yangdongjuooakloo.workers.dev';
  private distinctId: string | null = null;
  private enableLogging = false;
  private storage = new Storage();
  private eventQueue: EventPayload[] = [];
  private configured = false;

  /**
   * Initialize the SDK. This automatically tracks first_launch and app_open events.
   *
   * @example
   * ```ts
   * import { Orbit } from '@aspect/orbit';
   *
   * Orbit.configure({
   *   appId: 'com.example.app',
   * });
   * ```
   */
  configure(config: OrbitConfig): void {
    if (this.configured) {
      this.log('SDK already configured');
      return;
    }

    this.appId = config.appId;
    this.endpoint = config.endpoint ?? this.endpoint;
    this.enableLogging = config.enableLogging ?? false;

    // Get or create device ID
    this.distinctId = this.getOrCreateDistinctId();

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

    this.configured = true;
    this.log(`Initialized with appId: ${this.appId}`);
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

    const payload = {
      content: options.content,
      contact: options.contact,
      device_info: {
        platform: this.getPlatform(),
        app_version: this.getAppVersion(),
        distinct_id: this.distinctId,
      },
    };

    try {
      const response = await fetch(`${this.endpoint}/v1/${this.appId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

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
