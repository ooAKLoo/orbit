-- Orbit Database Schema
-- 应用表
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT UNIQUE NOT NULL,       -- 客户端用的标识，如 "com.example.app"
    app_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,      -- 管理端密钥
    created_at INTEGER DEFAULT (unixepoch())
);

-- 版本表
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    platform TEXT NOT NULL,            -- ios / android / macos / windows
    version TEXT NOT NULL,             -- 如 "1.2.0"
    version_code INTEGER,              -- 如 120
    download_url TEXT,
    changelog TEXT,
    force_update INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (app_id) REFERENCES applications(app_id)
);

-- 事件表（核心：只存 first_launch 和 app_open）
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    distinct_id TEXT NOT NULL,         -- 设备唯一标识
    event TEXT NOT NULL,               -- 只有两种: first_launch / app_open
    platform TEXT,                     -- ios / android / macos / windows
    app_version TEXT,
    timestamp INTEGER NOT NULL,        -- 事件时间（毫秒）
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (app_id) REFERENCES applications(app_id)
);

-- 反馈表
CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    content TEXT NOT NULL,
    contact TEXT,
    device_info TEXT,                  -- JSON
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (app_id) REFERENCES applications(app_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_events_query ON events(app_id, event, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_distinct ON events(app_id, distinct_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_versions_app_platform ON versions(app_id, platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_app ON feedbacks(app_id, created_at DESC);
