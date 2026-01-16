package com.orbit.sdk

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.*

/**
 * Orbit SDK for Android
 *
 * Lightweight analytics SDK that auto-tracks downloads, DAU, and retention.
 * One-line initialization, zero configuration.
 *
 * ```kotlin
 * class MyApplication : Application() {
 *     override fun onCreate() {
 *         super.onCreate()
 *         Orbit.configure(this, "com.example.app")
 *     }
 * }
 * ```
 */
object Orbit {

    private var appId: String? = null
    private var endpoint: String = "https://orbit-api.aspect.dev"
    private var distinctId: String? = null
    private var enableLogging: Boolean = false
    private var configured: Boolean = false

    private lateinit var prefs: SharedPreferences
    private lateinit var appContext: Context

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Initialize the SDK. Automatically tracks first_launch and app_open events.
     *
     * @param context Application context
     * @param appId Your app ID from Orbit dashboard
     * @param options Optional configuration
     */
    @JvmStatic
    @JvmOverloads
    fun configure(
        context: Context,
        appId: String,
        options: OrbitConfig? = null
    ) {
        if (configured) {
            log("SDK already configured")
            return
        }

        this.appContext = context.applicationContext
        this.appId = appId
        this.prefs = context.getSharedPreferences("orbit_prefs", Context.MODE_PRIVATE)

        options?.let {
            it.endpoint?.let { ep -> this.endpoint = ep }
            this.enableLogging = it.enableLogging
        }

        // Get or create device ID
        this.distinctId = getOrCreateDistinctId()

        // Check if first launch
        val hasLaunched = prefs.getBoolean("orbit_has_launched", false)

        if (!hasLaunched) {
            // First launch
            track("first_launch")
            prefs.edit().putBoolean("orbit_has_launched", true).apply()
        }

        // Track app open on every launch
        track("app_open")

        // Flush queued events
        flushEventQueue()

        configured = true
        log("Initialized with appId: $appId")
    }

    /**
     * Check for app updates.
     *
     * @return UpdateInfo containing update details
     */
    suspend fun checkForUpdate(): UpdateInfo = withContext(Dispatchers.IO) {
        val appId = this@Orbit.appId ?: run {
            log("SDK not configured")
            return@withContext UpdateInfo(hasUpdate = false)
        }

        try {
            val platform = "android"
            val currentVersion = getAppVersion()
            val url = URL("$endpoint/v1/$appId/version?platform=$platform&current=$currentVersion")

            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().use(BufferedReader::readText)
                val json = JSONObject(response)

                UpdateInfo(
                    hasUpdate = json.optBoolean("has_update", false),
                    version = json.optString("version", null),
                    versionCode = json.optInt("version_code", 0),
                    downloadUrl = json.optString("download_url", null),
                    changelog = json.optString("changelog", null),
                    forceUpdate = json.optBoolean("force_update", false)
                )
            } else {
                UpdateInfo(hasUpdate = false)
            }
        } catch (e: Exception) {
            log("Failed to check update: ${e.message}")
            UpdateInfo(hasUpdate = false)
        }
    }

    /**
     * Submit user feedback.
     *
     * @param content Feedback content
     * @param contact Optional contact info (email, etc.)
     */
    @JvmStatic
    @JvmOverloads
    fun submitFeedback(content: String, contact: String? = null) {
        val appId = this.appId ?: run {
            log("SDK not configured")
            return
        }

        scope.launch {
            try {
                val url = URL("$endpoint/v1/$appId/feedback")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.connectTimeout = 10000

                val payload = JSONObject().apply {
                    put("content", content)
                    contact?.let { put("contact", it) }
                    put("device_info", JSONObject().apply {
                        put("platform", "android")
                        put("app_version", getAppVersion())
                        put("os_version", "Android ${Build.VERSION.RELEASE}")
                        put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
                        put("distinct_id", distinctId)
                    })
                }

                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(payload.toString())
                }

                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    log("Feedback submitted")
                }

                connection.disconnect()
            } catch (e: Exception) {
                log("Failed to submit feedback: ${e.message}")
            }
        }
    }

    // ========================================================================
    // Private methods
    // ========================================================================

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

        val payload = EventPayload(
            distinctId = distinctId,
            event = event,
            platform = "android",
            appVersion = getAppVersion(),
            timestamp = System.currentTimeMillis()
        )

        sendEvent(appId, payload)
    }

    private fun sendEvent(appId: String, payload: EventPayload) {
        scope.launch {
            try {
                val url = URL("$endpoint/v1/$appId/event")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.connectTimeout = 10000

                val json = JSONObject().apply {
                    put("distinct_id", payload.distinctId)
                    put("event", payload.event)
                    put("platform", payload.platform)
                    put("app_version", payload.appVersion)
                    put("timestamp", payload.timestamp)
                }

                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(json.toString())
                }

                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    log("Event sent: ${payload.event}")
                } else {
                    queueEvent(payload)
                }

                connection.disconnect()
            } catch (e: Exception) {
                log("Event failed: ${e.message}")
                queueEvent(payload)
            }
        }
    }

    private fun queueEvent(payload: EventPayload) {
        val queue = getEventQueue().toMutableList()
        queue.add(payload)

        // Limit queue size
        while (queue.size > 100) {
            queue.removeAt(0)
        }

        saveEventQueue(queue)
    }

    private fun getEventQueue(): List<EventPayload> {
        val json = prefs.getString("orbit_event_queue", null) ?: return emptyList()

        return try {
            val array = org.json.JSONArray(json)
            (0 until array.length()).map { i ->
                val obj = array.getJSONObject(i)
                EventPayload(
                    distinctId = obj.getString("distinct_id"),
                    event = obj.getString("event"),
                    platform = obj.getString("platform"),
                    appVersion = obj.getString("app_version"),
                    timestamp = obj.getLong("timestamp")
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun saveEventQueue(queue: List<EventPayload>) {
        val array = org.json.JSONArray()
        queue.forEach { payload ->
            array.put(JSONObject().apply {
                put("distinct_id", payload.distinctId)
                put("event", payload.event)
                put("platform", payload.platform)
                put("app_version", payload.appVersion)
                put("timestamp", payload.timestamp)
            })
        }
        prefs.edit().putString("orbit_event_queue", array.toString()).apply()
    }

    private fun flushEventQueue() {
        val appId = this.appId ?: return
        val queue = getEventQueue()

        if (queue.isEmpty()) return

        // Clear queue
        prefs.edit().remove("orbit_event_queue").apply()

        // Retry sending
        queue.forEach { payload ->
            sendEvent(appId, payload)
        }
    }

    private fun getAppVersion(): String {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appContext.packageManager.getPackageInfo(
                    appContext.packageName,
                    PackageManager.PackageInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                appContext.packageManager.getPackageInfo(appContext.packageName, 0)
            }
            packageInfo.versionName ?: "unknown"
        } catch (e: Exception) {
            "unknown"
        }
    }

    private fun log(message: String) {
        if (enableLogging) {
            android.util.Log.d("Orbit", message)
        }
    }

    // ========================================================================
    // Internal data classes
    // ========================================================================

    private data class EventPayload(
        val distinctId: String,
        val event: String,
        val platform: String,
        val appVersion: String,
        val timestamp: Long
    )
}

/**
 * Configuration options for Orbit SDK
 */
data class OrbitConfig(
    val endpoint: String? = null,
    val enableLogging: Boolean = false
)

/**
 * Update information returned by checkForUpdate()
 */
data class UpdateInfo(
    val hasUpdate: Boolean,
    val version: String? = null,
    val versionCode: Int? = null,
    val downloadUrl: String? = null,
    val changelog: String? = null,
    val forceUpdate: Boolean = false
)
