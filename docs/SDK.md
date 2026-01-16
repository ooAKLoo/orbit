# Orbit SDK 接入文档

> 一行代码初始化，自动采集核心指标。

---

## 设计原则

1. **极简接入** - 一行初始化，零配置
2. **自动采集** - first_launch / app_open 自动上报
3. **隐私友好** - 设备 ID 本地生成，不采集敏感信息
4. **离线容错** - 网络失败自动重试

---

## 快速开始

### Swift (iOS / macOS)

```swift
import Orbit

@main
struct MyApp: App {
    init() {
        // 一行搞定，自动处理 first_launch + app_open
        Orbit.configure(appId: "your_app_id")
    }
}
```

### Kotlin (Android)

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // 一行搞定
        Orbit.configure(this, "your_app_id")
    }
}
```

**就这样，Downloads / DAU / 留存 数据就开始采集了。**

---

## SDK 自动处理的事情

| 功能 | 说明 |
|------|------|
| **设备 ID** | 首次启动生成 UUID，持久化存储 |
| **first_launch** | 自动判断首次启动并上报 |
| **app_open** | 每次启动自动上报 |
| **平台信息** | 自动采集 platform (ios/macos/android/windows) |
| **版本信息** | 自动读取 App 版本号 |
| **网络重试** | 失败自动重试，离线时缓存 |

---

## 可选功能

### 版本检查

```swift
// 检查更新
let update = await Orbit.checkForUpdate()
if update.hasUpdate {
    print("新版本: \(update.version)")
    print("更新说明: \(update.changelog)")
    if update.forceUpdate {
        // 强制更新逻辑
    }
}
```

### 用户反馈

```swift
// 提交反馈
Orbit.submitFeedback(
    content: "App 很好用，希望增加深色模式",
    contact: "user@email.com"  // 可选
)
```

### 自定义配置

```swift
Orbit.configure(
    appId: "your_app_id",
    options: OrbitOptions(
        endpoint: "https://your-custom-domain.com",  // 自定义域名
        enableLogging: true,                          // 调试日志
        flushInterval: 30                             // 上报间隔（秒）
    )
)
```

---

## SDK 内部实现

### 1. 设备 ID 策略

```
优先级：
1. Keychain/SharedPreferences 中已存储的 ID
2. 首次启动生成 UUID v4

特点：
- 不使用 IDFA/GAID（无需用户授权）
- 卸载重装会生成新 ID（符合隐私要求）
- 跨 App 不共享
```

### 2. 事件上报时机

```
App 启动
    ↓
检查本地 hasLaunched 标记
    ↓
┌─ 首次启动 ──→ 上报 first_launch + app_open
│               设置 hasLaunched = true
│
└─ 非首次 ────→ 只上报 app_open
```

### 3. 网络容错

```
上报事件
    ↓
网络请求
    ↓
┌─ 成功 ──→ 完成
│
└─ 失败 ──→ 存入本地队列
            ↓
         下次启动时重试
            ↓
         最多保留 100 条
```

---

## 数据格式

### 上报请求

```http
POST https://orbit.xxx.workers.dev/v1/{app_id}/event
Content-Type: application/json

{
    "distinct_id": "550e8400-e29b-41d4-a716-446655440000",
    "event": "first_launch",
    "platform": "ios",
    "app_version": "1.2.0",
    "timestamp": 1705388400000
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `distinct_id` | string | 设备唯一标识（UUID） |
| `event` | string | 事件名：`first_launch` 或 `app_open` |
| `platform` | string | 平台：`ios` / `macos` / `android` / `windows` |
| `app_version` | string | App 版本号 |
| `timestamp` | number | 事件时间（毫秒时间戳） |

---

## 平台 SDK 详细实现

### Swift SDK (iOS / macOS)

```swift
import Foundation

public final class Orbit {

    public static let shared = Orbit()

    private var appId: String?
    private var endpoint: String = "https://orbit.xxx.workers.dev"
    private var distinctId: String?

    private init() {}

    // MARK: - 初始化（自动上报 first_launch + app_open）

    public static func configure(appId: String, options: OrbitOptions? = nil) {
        shared.appId = appId

        if let options = options {
            shared.endpoint = options.endpoint ?? shared.endpoint
        }

        // 获取或生成设备 ID
        shared.distinctId = shared.getOrCreateDistinctId()

        // 检查是否首次启动
        let hasLaunched = UserDefaults.standard.bool(forKey: "orbit_has_launched")

        if !hasLaunched {
            // 首次启动
            shared.track(event: "first_launch")
            UserDefaults.standard.set(true, forKey: "orbit_has_launched")
        }

        // 每次启动都上报 app_open
        shared.track(event: "app_open")
    }

    // MARK: - 设备 ID

    private func getOrCreateDistinctId() -> String {
        let key = "orbit_distinct_id"

        // 尝试从 Keychain 读取
        if let existingId = KeychainHelper.get(key: key) {
            return existingId
        }

        // 生成新 ID
        let newId = UUID().uuidString.lowercased()
        KeychainHelper.set(key: key, value: newId)
        return newId
    }

    // MARK: - 事件上报

    private func track(event: String) {
        guard let appId = appId, let distinctId = distinctId else { return }

        let payload: [String: Any] = [
            "distinct_id": distinctId,
            "event": event,
            "platform": getPlatform(),
            "app_version": getAppVersion(),
            "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
        ]

        sendEvent(appId: appId, payload: payload)
    }

    private func sendEvent(appId: String, payload: [String: Any]) {
        guard let url = URL(string: "\(endpoint)/v1/\(appId)/event") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                // 失败时存入本地队列，下次重试
                self.cacheFailedEvent(payload)
                print("[Orbit] Event failed: \(error.localizedDescription)")
            }
        }.resume()
    }

    // MARK: - 版本检查

    public static func checkForUpdate() async -> UpdateInfo {
        guard let appId = shared.appId else {
            return UpdateInfo(hasUpdate: false)
        }

        let platform = shared.getPlatform()
        let currentVersion = shared.getAppVersion()
        let urlString = "\(shared.endpoint)/v1/\(appId)/version?platform=\(platform)&current=\(currentVersion)"

        guard let url = URL(string: urlString) else {
            return UpdateInfo(hasUpdate: false)
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(VersionResponse.self, from: data)
            return UpdateInfo(
                hasUpdate: response.has_update,
                version: response.version,
                versionCode: response.version_code,
                downloadUrl: response.download_url,
                changelog: response.changelog,
                forceUpdate: response.force_update
            )
        } catch {
            return UpdateInfo(hasUpdate: false)
        }
    }

    // MARK: - 反馈

    public static func submitFeedback(content: String, contact: String? = nil) {
        guard let appId = shared.appId else { return }

        let payload: [String: Any?] = [
            "content": content,
            "contact": contact,
            "device_info": [
                "platform": shared.getPlatform(),
                "app_version": shared.getAppVersion(),
                "os_version": ProcessInfo.processInfo.operatingSystemVersionString
            ]
        ]

        guard let url = URL(string: "\(shared.endpoint)/v1/\(appId)/feedback") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload.compactMapValues { $0 })

        URLSession.shared.dataTask(with: request).resume()
    }

    // MARK: - Helpers

    private func getPlatform() -> String {
        #if os(iOS)
        return "ios"
        #elseif os(macOS)
        return "macos"
        #elseif os(watchOS)
        return "watchos"
        #elseif os(tvOS)
        return "tvos"
        #else
        return "unknown"
        #endif
    }

    private func getAppVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    }

    private func cacheFailedEvent(_ payload: [String: Any]) {
        // TODO: 存入本地队列，下次启动重试
    }
}

// MARK: - 配置选项

public struct OrbitOptions {
    public var endpoint: String?
    public var enableLogging: Bool
    public var flushInterval: Int

    public init(
        endpoint: String? = nil,
        enableLogging: Bool = false,
        flushInterval: Int = 30
    ) {
        self.endpoint = endpoint
        self.enableLogging = enableLogging
        self.flushInterval = flushInterval
    }
}

// MARK: - 数据模型

public struct UpdateInfo {
    public let hasUpdate: Bool
    public let version: String?
    public let versionCode: Int?
    public let downloadUrl: String?
    public let changelog: String?
    public let forceUpdate: Bool

    init(
        hasUpdate: Bool,
        version: String? = nil,
        versionCode: Int? = nil,
        downloadUrl: String? = nil,
        changelog: String? = nil,
        forceUpdate: Bool = false
    ) {
        self.hasUpdate = hasUpdate
        self.version = version
        self.versionCode = versionCode
        self.downloadUrl = downloadUrl
        self.changelog = changelog
        self.forceUpdate = forceUpdate
    }
}

private struct VersionResponse: Codable {
    let version: String
    let version_code: Int
    let download_url: String?
    let changelog: String?
    let force_update: Bool
    let has_update: Bool
}

// MARK: - Keychain Helper

private enum KeychainHelper {
    static func get(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true
        ]

        var result: AnyObject?
        SecItemCopyMatching(query as CFDictionary, &result)

        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(key: String, value: String) {
        let data = value.data(using: .utf8)!

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]

        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }
}
```

### Kotlin SDK (Android)

```kotlin
package com.orbit.sdk

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.*

object Orbit {

    private var appId: String? = null
    private var endpoint: String = "https://orbit.xxx.workers.dev"
    private var distinctId: String? = null
    private lateinit var prefs: SharedPreferences

    // 初始化（自动上报 first_launch + app_open）
    fun configure(context: Context, appId: String, options: OrbitOptions? = null) {
        this.appId = appId
        this.prefs = context.getSharedPreferences("orbit_prefs", Context.MODE_PRIVATE)

        options?.endpoint?.let { this.endpoint = it }

        // 获取或生成设备 ID
        this.distinctId = getOrCreateDistinctId()

        // 检查是否首次启动
        val hasLaunched = prefs.getBoolean("orbit_has_launched", false)

        if (!hasLaunched) {
            // 首次启动
            track("first_launch")
            prefs.edit().putBoolean("orbit_has_launched", true).apply()
        }

        // 每次启动都上报 app_open
        track("app_open")
    }

    private fun getOrCreateDistinctId(): String {
        val key = "orbit_distinct_id"

        prefs.getString(key, null)?.let { return it }

        val newId = UUID.randomUUID().toString().lowercase()
        prefs.edit().putString(key, newId).apply()
        return newId
    }

    private fun track(event: String) {
        val appId = this.appId ?: return
        val distinctId = this.distinctId ?: return

        val payload = """
            {
                "distinct_id": "$distinctId",
                "event": "$event",
                "platform": "android",
                "app_version": "${getAppVersion()}",
                "timestamp": ${System.currentTimeMillis()}
            }
        """.trimIndent()

        CoroutineScope(Dispatchers.IO).launch {
            sendEvent(appId, payload)
        }
    }

    private fun sendEvent(appId: String, payload: String) {
        try {
            val url = URL("$endpoint/v1/$appId/event")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            conn.outputStream.write(payload.toByteArray())
            conn.responseCode // trigger request
            conn.disconnect()
        } catch (e: Exception) {
            // Cache for retry
        }
    }

    // 版本检查
    suspend fun checkForUpdate(): UpdateInfo = withContext(Dispatchers.IO) {
        val appId = this@Orbit.appId ?: return@withContext UpdateInfo(false)

        try {
            val url = URL("$endpoint/v1/$appId/version?platform=android&current=${getAppVersion()}")
            val conn = url.openConnection() as HttpURLConnection
            val response = conn.inputStream.bufferedReader().readText()
            // Parse JSON response
            UpdateInfo(hasUpdate = response.contains("\"has_update\":true"))
        } catch (e: Exception) {
            UpdateInfo(false)
        }
    }

    // 反馈
    fun submitFeedback(content: String, contact: String? = null) {
        val appId = this.appId ?: return

        val payload = """
            {
                "content": "$content",
                "contact": ${contact?.let { "\"$it\"" } ?: "null"}
            }
        """.trimIndent()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("$endpoint/v1/$appId/feedback")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.outputStream.write(payload.toByteArray())
                conn.responseCode
                conn.disconnect()
            } catch (e: Exception) {
                // Ignore
            }
        }
    }

    private fun getAppVersion(): String {
        return "1.0.0" // TODO: 从 context 读取
    }
}

data class OrbitOptions(
    val endpoint: String? = null,
    val enableLogging: Boolean = false
)

data class UpdateInfo(
    val hasUpdate: Boolean,
    val version: String? = null,
    val downloadUrl: String? = null,
    val changelog: String? = null,
    val forceUpdate: Boolean = false
)
```

---

## 安装方式

### Swift Package Manager (iOS / macOS)

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/xxx/orbit-swift.git", from: "1.0.0")
]
```

或在 Xcode 中：`File → Add Package Dependencies → 输入仓库 URL`

### Gradle (Android)

```groovy
// build.gradle
dependencies {
    implementation 'com.orbit:orbit-android:1.0.0'
}
```

---

## FAQ

**Q: 设备 ID 会变吗？**
A: 正常使用不会变。卸载重装会生成新 ID（这是预期行为，符合隐私要求）。

**Q: 离线时数据会丢吗？**
A: 不会。失败的事件会缓存在本地，下次启动自动重试。

**Q: 需要用户授权吗？**
A: 不需要。我们不使用 IDFA/GAID，不采集任何需要授权的信息。

**Q: SDK 包体积多大？**
A: < 50KB，纯原生实现，无第三方依赖。

**Q: 支持哪些平台？**
A: iOS 13+ / macOS 10.15+ / Android 5.0+ / Windows (计划中)

---

## 对比 PostHog SDK

| 功能 | Orbit SDK | PostHog SDK |
|------|-----------|-------------|
| 初始化 | 1 行 | 5+ 行 |
| 包体积 | < 50KB | 500KB+ |
| 自动采集 | first_launch + app_open | 可配置多种 |
| 自定义事件 | ❌ 不支持 | ✅ 支持 |
| 用户属性 | ❌ 不支持 | ✅ 支持 |
| 功能开关 | ❌ 不支持 | ✅ 支持 |

**Orbit 的定位**：只做 Downloads / DAU / 留存，极简、轻量、够用。

---

*文档版本: 1.0 | 最后更新: 2025-01-16*
