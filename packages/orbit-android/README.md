# Orbit Android SDK

Lightweight analytics SDK for Android apps. Auto-track downloads, DAU, and retention with one line of code.

## Installation

### JitPack (Recommended)

Add JitPack repository to your root `build.gradle`:

```groovy
allprojects {
    repositories {
        ...
        maven { url 'https://jitpack.io' }
    }
}
```

Add the dependency:

```groovy
dependencies {
    implementation 'com.github.ooAKLoo:orbit:0.1.0'
}
```

## Quick Start

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Orbit.configure(this, "com.example.app")
    }
}
```

That's it! Downloads and DAU are automatically tracked.

## Features

- **One-line initialization** - Zero configuration required
- **Auto-tracking** - `first_launch` and `app_open` events tracked automatically
- **Privacy-friendly** - Device ID generated locally, no GAID required
- **Offline support** - Failed events queued and retried on next launch
- **Lightweight** - Minimal dependencies

## API

### `Orbit.configure(context, appId, options?)`

Initialize the SDK. Call once in your Application class.

```kotlin
Orbit.configure(
    context = this,
    appId = "com.example.app",
    options = OrbitConfig(
        endpoint = "https://custom-endpoint.com",  // Optional
        enableLogging = true                        // Optional
    )
)
```

### `Orbit.checkForUpdate()`

Check for app updates (suspend function).

```kotlin
lifecycleScope.launch {
    val update = Orbit.checkForUpdate()

    if (update.hasUpdate) {
        Log.d("Update", "New version: ${update.version}")
        Log.d("Update", "Changelog: ${update.changelog}")
        Log.d("Update", "Download: ${update.downloadUrl}")

        if (update.forceUpdate) {
            // Show force update dialog
        }
    }
}
```

### `Orbit.submitFeedback(content, contact?)`

Submit user feedback.

```kotlin
Orbit.submitFeedback(
    content = "Love this app! Would like dark mode.",
    contact = "user@email.com"  // Optional
)
```

## Java Support

The SDK is fully compatible with Java:

```java
public class MyApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Orbit.configure(this, "com.example.app", null);
    }
}

// Submit feedback
Orbit.submitFeedback("Great app!", "user@email.com");
```

## Requirements

- Android SDK 21+ (Android 5.0)
- Internet permission (automatically added)

## License

MIT
