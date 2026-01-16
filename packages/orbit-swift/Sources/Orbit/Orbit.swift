import Foundation
#if canImport(Security)
import Security
#endif

// MARK: - Public Types

public struct OrbitConfig {
    public let appId: String
    public var endpoint: String?
    public var enableLogging: Bool

    public init(
        appId: String,
        endpoint: String? = nil,
        enableLogging: Bool = false
    ) {
        self.appId = appId
        self.endpoint = endpoint
        self.enableLogging = enableLogging
    }
}

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

public struct FeedbackOptions {
    public let content: String
    public let contact: String?

    public init(content: String, contact: String? = nil) {
        self.content = content
        self.contact = contact
    }
}

// MARK: - Orbit SDK

public final class Orbit {

    public static let shared = Orbit()

    private var appId: String?
    private var endpoint = "https://orbit-api.aspect.dev"
    private var distinctId: String?
    private var enableLogging = false
    private var configured = false

    private let userDefaults = UserDefaults.standard
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {}

    // MARK: - Public API

    /// Initialize the SDK with one line. Automatically tracks first_launch and app_open events.
    ///
    /// ```swift
    /// Orbit.configure(appId: "com.example.app")
    /// ```
    public static func configure(appId: String, options: OrbitConfig? = nil) {
        shared.configureInternal(appId: appId, options: options)
    }

    /// Check for app updates.
    ///
    /// ```swift
    /// let update = await Orbit.checkForUpdate()
    /// if update.hasUpdate {
    ///     print("New version: \(update.version ?? "")")
    /// }
    /// ```
    @available(iOS 13.0, macOS 10.15, watchOS 6.0, tvOS 13.0, *)
    public static func checkForUpdate() async -> UpdateInfo {
        await shared.checkForUpdateInternal()
    }

    /// Submit user feedback.
    ///
    /// ```swift
    /// Orbit.submitFeedback(content: "Great app!", contact: "user@email.com")
    /// ```
    public static func submitFeedback(content: String, contact: String? = nil) {
        shared.submitFeedbackInternal(content: content, contact: contact)
    }

    // MARK: - Internal Implementation

    private func configureInternal(appId: String, options: OrbitConfig?) {
        guard !configured else {
            log("SDK already configured")
            return
        }

        self.appId = appId

        if let options = options {
            self.endpoint = options.endpoint ?? self.endpoint
            self.enableLogging = options.enableLogging
        }

        // Get or create device ID
        self.distinctId = getOrCreateDistinctId()

        // Check if first launch
        let hasLaunchedKey = "orbit_has_launched"
        let hasLaunched = userDefaults.bool(forKey: hasLaunchedKey)

        if !hasLaunched {
            // First launch
            track(event: "first_launch")
            userDefaults.set(true, forKey: hasLaunchedKey)
        }

        // Track app open on every launch
        track(event: "app_open")

        // Flush any queued events
        flushEventQueue()

        configured = true
        log("Initialized with appId: \(appId)")
    }

    @available(iOS 13.0, macOS 10.15, watchOS 6.0, tvOS 13.0, *)
    private func checkForUpdateInternal() async -> UpdateInfo {
        guard let appId = appId else {
            log("SDK not configured")
            return UpdateInfo(hasUpdate: false)
        }

        let platform = getPlatform()
        let currentVersion = getAppVersion()

        guard let url = URL(string: "\(endpoint)/v1/\(appId)/version?platform=\(platform)&current=\(currentVersion)") else {
            return UpdateInfo(hasUpdate: false)
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try decoder.decode(VersionResponse.self, from: data)

            return UpdateInfo(
                hasUpdate: response.has_update,
                version: response.version,
                versionCode: response.version_code,
                downloadUrl: response.download_url,
                changelog: response.changelog,
                forceUpdate: response.force_update
            )
        } catch {
            log("Failed to check update: \(error)")
            return UpdateInfo(hasUpdate: false)
        }
    }

    private func submitFeedbackInternal(content: String, contact: String?) {
        guard let appId = appId else {
            log("SDK not configured")
            return
        }

        let payload = FeedbackPayload(
            content: content,
            contact: contact,
            device_info: DeviceInfo(
                platform: getPlatform(),
                app_version: getAppVersion(),
                os_version: ProcessInfo.processInfo.operatingSystemVersionString,
                distinct_id: distinctId
            )
        )

        guard let url = URL(string: "\(endpoint)/v1/\(appId)/feedback") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? encoder.encode(payload)

        URLSession.shared.dataTask(with: request) { [weak self] _, _, error in
            if let error = error {
                self?.log("Failed to submit feedback: \(error)")
            } else {
                self?.log("Feedback submitted")
            }
        }.resume()
    }

    // MARK: - Device ID

    private func getOrCreateDistinctId() -> String {
        let key = "orbit_distinct_id"

        // Try Keychain first
        if let existingId = KeychainHelper.get(key: key) {
            return existingId
        }

        // Try UserDefaults as fallback
        if let existingId = userDefaults.string(forKey: key) {
            // Migrate to Keychain
            KeychainHelper.set(key: key, value: existingId)
            return existingId
        }

        // Generate new UUID
        let newId = UUID().uuidString.lowercased()
        KeychainHelper.set(key: key, value: newId)
        userDefaults.set(newId, forKey: key)

        return newId
    }

    // MARK: - Event Tracking

    private func track(event: String) {
        guard let appId = appId, let distinctId = distinctId else { return }

        let payload = EventPayload(
            distinct_id: distinctId,
            event: event,
            platform: getPlatform(),
            app_version: getAppVersion(),
            timestamp: Int64(Date().timeIntervalSince1970 * 1000)
        )

        sendEvent(appId: appId, payload: payload)
    }

    private func sendEvent(appId: String, payload: EventPayload) {
        guard let url = URL(string: "\(endpoint)/v1/\(appId)/event") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? encoder.encode(payload)

        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            if let error = error {
                self?.log("Event failed: \(error.localizedDescription)")
                self?.queueEvent(payload)
            } else {
                self?.log("Event sent: \(payload.event)")
            }
        }.resume()
    }

    // MARK: - Event Queue

    private func queueEvent(_ payload: EventPayload) {
        var queue = getEventQueue()
        queue.append(payload)

        // Limit queue size
        if queue.count > 100 {
            queue.removeFirst()
        }

        saveEventQueue(queue)
    }

    private func getEventQueue() -> [EventPayload] {
        guard let data = userDefaults.data(forKey: "orbit_event_queue"),
              let queue = try? decoder.decode([EventPayload].self, from: data) else {
            return []
        }
        return queue
    }

    private func saveEventQueue(_ queue: [EventPayload]) {
        if let data = try? encoder.encode(queue) {
            userDefaults.set(data, forKey: "orbit_event_queue")
        }
    }

    private func flushEventQueue() {
        guard let appId = appId else { return }

        let queue = getEventQueue()
        guard !queue.isEmpty else { return }

        // Clear queue
        userDefaults.removeObject(forKey: "orbit_event_queue")

        // Retry sending
        for payload in queue {
            sendEvent(appId: appId, payload: payload)
        }
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

    private func log(_ message: String) {
        if enableLogging {
            print("[Orbit] \(message)")
        }
    }
}

// MARK: - Internal Types

private struct EventPayload: Codable {
    let distinct_id: String
    let event: String
    let platform: String
    let app_version: String
    let timestamp: Int64
}

private struct VersionResponse: Codable {
    let version: String
    let version_code: Int
    let download_url: String?
    let changelog: String?
    let force_update: Bool
    let has_update: Bool
}

private struct FeedbackPayload: Codable {
    let content: String
    let contact: String?
    let device_info: DeviceInfo
}

private struct DeviceInfo: Codable {
    let platform: String
    let app_version: String
    let os_version: String
    let distinct_id: String?
}

// MARK: - Keychain Helper

private enum KeychainHelper {

    static func get(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.orbit.sdk",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }

        return string
    }

    static func set(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        // Delete existing item
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.orbit.sdk"
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.orbit.sdk",
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemAdd(addQuery as CFDictionary, nil)
    }
}
