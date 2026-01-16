# Orbit - 独立开发者的轻量数据服务

> 两个事件，三个指标，解决独立开发者最核心的数据需求。

---

## 一、核心理念

### 1.1 只做你真正需要的

独立开发者需要的数据指标其实很简单：

| 指标 | 回答的问题 |
|------|-----------|
| **Downloads** | 今天有多少人下载了我的 App？ |
| **DAU** | 今天有多少人在用我的 App？ |
| **留存** | 用户会回来吗？D1/D7/D30 留存多少？ |

**不需要**：漏斗分析、用户分群、事件属性、自定义看板... 那些是 PostHog 的事。

### 1.2 两个事件搞定一切

| 事件 | 触发时机 | 计算指标 |
|------|----------|----------|
| `first_launch` | App 首次启动（本地判断 `isFirstLaunch`） | → Downloads / 新增用户 |
| `app_open` | 每次 App 启动 | → DAU / 留存 |

```swift
// 客户端伪代码
if !UserDefaults.hasLaunched {
    Orbit.track("first_launch")
    UserDefaults.hasLaunched = true
}
Orbit.track("app_open")
```

### 1.3 痛点与方案

| 需求 | 传统方案 | 痛点 | Orbit 方案 |
|------|----------|------|-----------|
| 版本检查 | GitHub Releases | 国内慢/超时 | Cloudflare 边缘缓存 |
| 用户反馈 | 自建/Google Forms | 双区部署/国内不可用 | 统一 API |
| 数据统计 | PostHog/Mixpanel | 重、贵、国内不稳 | 两个事件三个指标 |

---

## 二、技术选型

**Cloudflare Workers + D1** 是当前最优解：

| 对比项 | Cloudflare Workers | Vercel Edge | 自建 VPS |
|--------|-------------------|-------------|----------|
| 国内访问 | ✅ 稳定 | ⚠️ 一般 | ❌ 需双区 |
| 免费额度 | 10万请求/天 | 10万请求/月 | 无 |
| 数据库 | D1 (5GB) | 需外接 | 需自建 |
| 运维 | 无 | 无 | 高 |

---

## 三、数据模型

只需要 4 张表：

```sql
-- 应用表
CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT UNIQUE NOT NULL,       -- 客户端用的标识，如 "com.example.app"
    app_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,      -- 管理端密钥
    created_at INTEGER DEFAULT (unixepoch())
);

-- 版本表
CREATE TABLE versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    platform TEXT NOT NULL,            -- ios / android / macos / windows
    version TEXT NOT NULL,             -- 如 "1.2.0"
    version_code INTEGER,              -- 如 120
    download_url TEXT,
    changelog TEXT,
    force_update INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

-- 事件表（核心：只存 first_launch 和 app_open）
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    distinct_id TEXT NOT NULL,         -- 设备唯一标识
    event TEXT NOT NULL,               -- 只有两种: first_launch / app_open
    platform TEXT,                     -- ios / android / macos / windows
    app_version TEXT,
    timestamp INTEGER NOT NULL,        -- 事件时间（毫秒）
    created_at INTEGER DEFAULT (unixepoch())
);

-- 反馈表
CREATE TABLE feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    content TEXT NOT NULL,
    contact TEXT,
    device_info TEXT,                  -- JSON
    created_at INTEGER DEFAULT (unixepoch())
);

-- 索引
CREATE INDEX idx_events_query ON events(app_id, event, timestamp);
CREATE INDEX idx_events_distinct ON events(app_id, distinct_id, timestamp);
```

---

## 四、API 设计

### 4.1 客户端 API（公开）

#### 版本检查
```http
GET /v1/{app_id}/version?platform=ios&current=1.0.0
```
```json
{
    "version": "1.2.0",
    "version_code": 120,
    "download_url": "https://...",
    "changelog": "...",
    "force_update": false,
    "has_update": true
}
```

#### 事件上报（核心）
```http
POST /v1/{app_id}/event
```
```json
{
    "distinct_id": "device-uuid-xxx",
    "event": "first_launch",
    "platform": "ios",
    "app_version": "1.0.0",
    "timestamp": 1705388400000
}
```

#### 反馈提交
```http
POST /v1/{app_id}/feedback
```
```json
{
    "content": "反馈内容",
    "contact": "email@example.com"
}
```

### 4.2 管理端 API（需 X-API-Key）

#### 查看统计
```http
GET /manage/stats?start=2024-01-01&end=2024-01-31
X-API-Key: xxx
```
```json
{
    "downloads": {
        "total": 1234,
        "by_platform": { "ios": 800, "android": 434 },
        "by_date": [{ "date": "2024-01-01", "count": 50 }, ...]
    },
    "dau": {
        "avg": 320,
        "by_date": [{ "date": "2024-01-01", "count": 280 }, ...]
    },
    "retention": {
        "d1": 0.42,
        "d7": 0.25,
        "d30": 0.12
    }
}
```

#### 发布版本
```http
POST /manage/version
X-API-Key: xxx
```
```json
{
    "platform": "ios",
    "version": "1.2.0",
    "version_code": 120,
    "download_url": "https://...",
    "changelog": "...",
    "force_update": false
}
```

#### 查看反馈
```http
GET /manage/feedbacks?page=1&limit=20
X-API-Key: xxx
```

---

## 五、指标计算 SQL

### 5.1 Downloads（新增用户）

```sql
-- 按日期 + 平台统计
SELECT
    DATE(timestamp/1000, 'unixepoch') as date,
    platform,
    COUNT(*) as downloads
FROM events
WHERE app_id = ? AND event = 'first_launch'
  AND timestamp BETWEEN ? AND ?
GROUP BY date, platform
ORDER BY date;
```

### 5.2 DAU（日活跃用户）

```sql
SELECT
    DATE(timestamp/1000, 'unixepoch') as date,
    COUNT(DISTINCT distinct_id) as dau
FROM events
WHERE app_id = ? AND event = 'app_open'
  AND timestamp BETWEEN ? AND ?
GROUP BY date
ORDER BY date;
```

### 5.3 留存率

```sql
-- D1/D7/D30 留存计算
-- 留存 = (第0天 first_launch ∩ 第N天 app_open) / 第0天 first_launch

WITH cohort AS (
    -- 第0天新增用户
    SELECT DISTINCT distinct_id
    FROM events
    WHERE app_id = ? AND event = 'first_launch'
      AND DATE(timestamp/1000, 'unixepoch') = ?  -- cohort_date
),
retained AS (
    -- 第N天回访用户
    SELECT DISTINCT distinct_id
    FROM events
    WHERE app_id = ? AND event = 'app_open'
      AND DATE(timestamp/1000, 'unixepoch') = DATE(?, '+' || ? || ' days')
      AND distinct_id IN (SELECT distinct_id FROM cohort)
)
SELECT
    (SELECT COUNT(*) FROM cohort) as cohort_size,
    (SELECT COUNT(*) FROM retained) as retained_count,
    ROUND(CAST((SELECT COUNT(*) FROM retained) AS FLOAT) /
          NULLIF((SELECT COUNT(*) FROM cohort), 0), 4) as retention_rate;
```

---

## 六、项目结构

```
orbit/
├── src/
│   ├── index.ts          # 路由入口
│   ├── version.ts        # 版本检查
│   ├── event.ts          # 事件上报
│   ├── feedback.ts       # 反馈收集
│   ├── stats.ts          # 统计查询
│   └── auth.ts           # API Key 校验
├── schema.sql            # 数据库结构
└── wrangler.toml         # Cloudflare 配置
```

---

## 七、部署

```bash
# 创建 D1 数据库
wrangler d1 create orbit-db

# 初始化表结构
wrangler d1 execute orbit-db --file=./schema.sql

# 部署
wrangler deploy
```

---

## 八、客户端接入示例

```swift
// Swift - 启动时调用
func applicationDidFinishLaunching() {
    let deviceId = getOrCreateDeviceId()

    // 首次启动
    if !UserDefaults.standard.bool(forKey: "hasLaunched") {
        Orbit.track(event: "first_launch", distinctId: deviceId, platform: "macos")
        UserDefaults.standard.set(true, forKey: "hasLaunched")
    }

    // 每次启动
    Orbit.track(event: "app_open", distinctId: deviceId, platform: "macos")
}
```

---

## 九、总结

| 项目 | 内容 |
|------|------|
| **核心事件** | `first_launch` + `app_open` |
| **核心指标** | Downloads + DAU + 留存 |
| **技术栈** | Cloudflare Workers + D1 |
| **成本** | 免费（10万请求/天） |
| **全球可达** | ✅ 国内外都快 |

**不做**：漏斗、分群、自定义事件、复杂看板... 那是 PostHog 的事。

---

*文档版本: 1.0 | 最后更新: 2025-01-16*
