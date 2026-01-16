# @aspect/orbit

Lightweight analytics SDK for Electron/Tauri apps. Auto-track downloads, DAU, and retention with one line of code.

## Installation

```bash
npm install @aspect/orbit
```

## Quick Start

```typescript
import { Orbit } from '@aspect/orbit';

// Initialize in your app entry point
Orbit.configure({
  appId: 'com.example.app',
});

// That's it! Downloads and DAU are automatically tracked.
```

## Features

- **One-line initialization** - Zero configuration required
- **Auto-tracking** - `first_launch` and `app_open` events are automatically tracked
- **Privacy-friendly** - Device ID generated locally, no sensitive data collected
- **Offline support** - Failed events are queued and retried on next launch
- **Lightweight** - < 5KB minified

## API

### `Orbit.configure(config)`

Initialize the SDK. Call this once at app startup.

```typescript
Orbit.configure({
  appId: 'com.example.app',      // Required: Your app ID from Orbit dashboard
  endpoint: 'https://...',       // Optional: Custom API endpoint
  enableLogging: true,           // Optional: Enable debug logging
});
```

### `Orbit.checkUpdate()`

Check for app updates.

```typescript
const result = await Orbit.checkUpdate();

if (result.hasUpdate) {
  console.log('New version:', result.latestVersion);
  console.log('Release notes:', result.releaseNotes);
  console.log('Download URL:', result.downloadUrl);
  console.log('Force update:', result.forceUpdate);
}
```

### `Orbit.sendFeedback(options)`

Submit user feedback.

```typescript
await Orbit.sendFeedback({
  content: 'Great app! Would love to see dark mode.',
  contact: 'user@example.com',  // Optional
});
```

## Platform Support

- Electron (Windows, macOS, Linux)
- Tauri (Windows, macOS, Linux)

## License

MIT
