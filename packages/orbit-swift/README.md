# Orbit Swift SDK

Lightweight analytics SDK for iOS/macOS apps. Auto-track downloads, DAU, and retention with one line of code.

## Installation

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/ooAKLoo/orbit.git", from: "0.1.0")
]
```

Or in Xcode: **File → Add Package Dependencies** → Enter:
```
https://github.com/ooAKLoo/orbit.git
```

## Quick Start

```swift
import Orbit

@main
struct MyApp: App {
    init() {
        Orbit.configure(appId: "com.example.app")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

That's it! Downloads and DAU are automatically tracked.

## Features

- **One-line initialization** - Zero configuration required
- **Auto-tracking** - `first_launch` and `app_open` events tracked automatically
- **Privacy-friendly** - Device ID stored in Keychain, no IDFA required
- **Offline support** - Failed events queued and retried on next launch
- **Lightweight** - Pure Swift, no dependencies

## API

### `Orbit.configure(appId:options:)`

Initialize the SDK. Call once at app startup.

```swift
Orbit.configure(
    appId: "com.example.app",
    options: OrbitConfig(
        endpoint: "https://custom-endpoint.com",  // Optional
        enableLogging: true                        // Optional
    )
)
```

### `Orbit.checkForUpdate()`

Check for app updates (async).

```swift
let update = await Orbit.checkForUpdate()

if update.hasUpdate {
    print("New version: \(update.version ?? "")")
    print("Changelog: \(update.changelog ?? "")")
    print("Download: \(update.downloadUrl ?? "")")

    if update.forceUpdate {
        // Show force update dialog
    }
}
```

### `Orbit.submitFeedback(content:contact:)`

Submit user feedback.

```swift
Orbit.submitFeedback(
    content: "Love this app! Would like dark mode.",
    contact: "user@email.com"  // Optional
)
```

## Platform Support

- iOS 13.0+
- macOS 10.15+
- watchOS 6.0+
- tvOS 13.0+

## License

MIT
