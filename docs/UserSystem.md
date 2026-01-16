# Orbit 用户体系设计

> 支持 Google/GitHub 登录，免费/付费分层，全部在 Cloudflare 生态内实现。

---

## 一、产品定价

| 层级 | 价格 | 请求限制 | 数据保留 | 应用数量 |
|------|------|----------|----------|----------|
| **Free** | $0 | 2,000 次/天 | 30 天 | 1 个 |
| **Pro** | $9/月 | 50,000 次/天 | 360 天 | 无限 |

---

## 二、技术选型

### 2.1 方案对比

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **Cloudflare Zero Trust** | 原生集成、免费 | 功能有限、定制性差 | ❌ |
| **Auth.js (NextAuth)** | 成熟、多 Provider | 需要 Node 运行时 | ❌ |
| **Lucia Auth** | 轻量、灵活 | 需要自己实现 | ⚠️ |
| **自建 OAuth + D1** | 完全可控、无依赖 | 工作量大 | ⚠️ |
| **Clerk** | 开箱即用、UI 好 | 有成本、外部依赖 | ⚠️ |
| **WorkOS** | 企业级、SSO | 贵、过重 | ❌ |

### 2.2 推荐方案：自建 OAuth + D1

**理由：**
1. Cloudflare Workers 原生支持
2. 无外部依赖，全部数据在 D1
3. Google/GitHub OAuth 实现简单
4. 完全可控，不受第三方限制

**复杂度评估：**
- OAuth 流程：~200 行代码
- Session 管理：~100 行代码
- 用量统计：~100 行代码

---

## 三、数据模型

```sql
-- 用户表
CREATE TABLE users (
    id TEXT PRIMARY KEY,               -- uuid
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    provider TEXT NOT NULL,            -- 'google' | 'github'
    provider_id TEXT NOT NULL,         -- OAuth 提供商的用户 ID
    plan TEXT DEFAULT 'free',          -- 'free' | 'pro'
    plan_expires_at INTEGER,           -- Pro 到期时间
    daily_limit INTEGER DEFAULT 2000,  -- 每日请求限制
    retention_days INTEGER DEFAULT 30, -- 数据保留天数
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(provider, provider_id)
);

-- 会话表
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,               -- session token
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 应用表（更新）
CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,             -- 关联用户
    app_id TEXT UNIQUE NOT NULL,
    app_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 每日用量统计
CREATE TABLE daily_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,                -- '2024-01-15'
    request_count INTEGER DEFAULT 0,
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_applications_user ON applications(user_id);
CREATE INDEX idx_daily_usage_user_date ON daily_usage(user_id, date);
```

---

## 四、OAuth 流程

### 4.1 整体流程

```
用户点击登录
      ↓
选择 Google / GitHub
      ↓
跳转 OAuth 授权页
      ↓
用户授权
      ↓
回调到 /auth/callback
      ↓
获取用户信息
      ↓
创建/更新用户 → 创建 Session → 设置 Cookie
      ↓
跳转到 Dashboard
```

### 4.2 API 设计

```http
# 发起登录
GET /auth/login?provider=google
GET /auth/login?provider=github
→ 302 重定向到 OAuth 授权页

# OAuth 回调
GET /auth/callback?code=xxx&state=xxx
→ 302 重定向到 Dashboard（设置 session cookie）

# 获取当前用户
GET /auth/me
Cookie: orbit_session=xxx
→ { user, plan, usage }

# 登出
POST /auth/logout
→ 清除 session
```

### 4.3 实现代码

```typescript
// src/auth.ts

interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

// Google OAuth 配置
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// GitHub OAuth 配置
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USERINFO_URL = 'https://api.github.com/user';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  const redirectUri = `${url.origin}/auth/callback`;

  // 生成 state 防止 CSRF
  const state = crypto.randomUUID();

  let authUrl: string;

  if (provider === 'google') {
    authUrl = `${GOOGLE_AUTH_URL}?` + new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email profile',
      state: `google:${state}`,
    });
  } else if (provider === 'github') {
    authUrl = `${GITHUB_AUTH_URL}?` + new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'user:email',
      state: `github:${state}`,
    });
  } else {
    return new Response('Invalid provider', { status: 400 });
  }

  return Response.redirect(authUrl, 302);
}

export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  const [provider] = state.split(':');
  const redirectUri = `${url.origin}/auth/callback`;

  let userInfo: { id: string; email: string; name: string; avatar: string };

  if (provider === 'google') {
    userInfo = await getGoogleUser(code, redirectUri, env);
  } else if (provider === 'github') {
    userInfo = await getGitHubUser(code, redirectUri, env);
  } else {
    return new Response('Invalid provider', { status: 400 });
  }

  // 创建或更新用户
  const userId = await upsertUser(env.DB, {
    email: userInfo.email,
    name: userInfo.name,
    avatar_url: userInfo.avatar,
    provider,
    provider_id: userInfo.id,
  });

  // 创建 session
  const sessionToken = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 天

  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionToken, userId, expiresAt).run();

  // 设置 cookie 并重定向
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/dashboard',
      'Set-Cookie': `orbit_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
    },
  });
}

async function getGoogleUser(code: string, redirectUri: string, env: Env) {
  // 换取 token
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const { access_token } = await tokenRes.json() as { access_token: string };

  // 获取用户信息
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const user = await userRes.json() as { id: string; email: string; name: string; picture: string };

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.picture,
  };
}

async function getGitHubUser(code: string, redirectUri: string, env: Env) {
  // 换取 token
  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      code,
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });
  const { access_token } = await tokenRes.json() as { access_token: string };

  // 获取用户信息
  const userRes = await fetch(GITHUB_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      'User-Agent': 'Orbit',
    },
  });
  const user = await userRes.json() as { id: number; email: string; name: string; avatar_url: string };

  // GitHub 可能没有公开 email，需要额外请求
  let email = user.email;
  if (!email) {
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'User-Agent': 'Orbit',
      },
    });
    const emails = await emailRes.json() as { email: string; primary: boolean }[];
    email = emails.find(e => e.primary)?.email || emails[0]?.email;
  }

  return {
    id: String(user.id),
    email,
    name: user.name || email.split('@')[0],
    avatar: user.avatar_url,
  };
}

async function upsertUser(db: D1Database, data: {
  email: string;
  name: string;
  avatar_url: string;
  provider: string;
  provider_id: string;
}): Promise<string> {
  // 查找现有用户
  const existing = await db.prepare(
    'SELECT id FROM users WHERE provider = ? AND provider_id = ?'
  ).bind(data.provider, data.provider_id).first<{ id: string }>();

  if (existing) {
    // 更新
    await db.prepare(
      'UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = unixepoch() WHERE id = ?'
    ).bind(data.email, data.name, data.avatar_url, existing.id).run();
    return existing.id;
  }

  // 创建
  const userId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO users (id, email, name, avatar_url, provider, provider_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, data.email, data.name, data.avatar_url, data.provider, data.provider_id).run();

  return userId;
}

// Session 验证中间件
export async function getSession(request: Request, env: Env): Promise<{
  user: User;
  session: Session;
} | null> {
  const cookie = request.headers.get('Cookie');
  const sessionToken = cookie?.match(/orbit_session=([^;]+)/)?.[1];

  if (!sessionToken) return null;

  const result = await env.DB.prepare(`
    SELECT s.id as session_id, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > unixepoch()
  `).bind(sessionToken).first();

  if (!result) return null;

  return {
    user: result as unknown as User,
    session: { id: result.session_id, expires_at: result.expires_at } as Session,
  };
}
```

---

## 五、用量限制

### 5.1 限流逻辑

```typescript
// src/ratelimit.ts

export async function checkRateLimit(
  db: D1Database,
  userId: string,
  dailyLimit: number
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const today = new Date().toISOString().split('T')[0]; // '2024-01-15'

  // 获取今日用量
  const usage = await db.prepare(
    'SELECT request_count FROM daily_usage WHERE user_id = ? AND date = ?'
  ).bind(userId, today).first<{ request_count: number }>();

  const currentCount = usage?.request_count || 0;

  if (currentCount >= dailyLimit) {
    // 计算重置时间（明天 0 点 UTC）
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    return {
      allowed: false,
      remaining: 0,
      reset: Math.floor(tomorrow.getTime() / 1000),
    };
  }

  // 增加计数
  await db.prepare(`
    INSERT INTO daily_usage (user_id, date, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET request_count = request_count + 1
  `).bind(userId, today).run();

  return {
    allowed: true,
    remaining: dailyLimit - currentCount - 1,
    reset: 0,
  };
}
```

### 5.2 事件上报接口更新

```typescript
// src/event.ts

export async function handleEvent(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const appId = url.pathname.split('/')[2]; // /v1/{app_id}/event

  // 查找应用及其所有者
  const app = await env.DB.prepare(`
    SELECT a.*, u.id as user_id, u.daily_limit, u.plan
    FROM applications a
    JOIN users u ON a.user_id = u.id
    WHERE a.app_id = ?
  `).bind(appId).first();

  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404 });
  }

  // 检查限流
  const rateLimit = await checkRateLimit(env.DB, app.user_id, app.daily_limit);

  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', reset: rateLimit.reset },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.reset),
        },
      }
    );
  }

  // 正常处理事件...
  const body = await request.json();

  await env.DB.prepare(`
    INSERT INTO events (app_id, distinct_id, event, platform, app_version, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(appId, body.distinct_id, body.event, body.platform, body.app_version, body.timestamp).run();

  return Response.json(
    { success: true },
    {
      headers: {
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      },
    }
  );
}
```

---

## 六、数据清理

### 6.1 定时任务（Cron Trigger）

```typescript
// src/scheduled.ts

export async function handleScheduled(env: Env): Promise<void> {
  // 每天凌晨运行

  // 1. 清理过期 session
  await env.DB.prepare(
    'DELETE FROM sessions WHERE expires_at < unixepoch()'
  ).run();

  // 2. 清理过期事件数据
  // Free 用户：30 天
  // Pro 用户：360 天
  await env.DB.prepare(`
    DELETE FROM events
    WHERE id IN (
      SELECT e.id FROM events e
      JOIN applications a ON e.app_id = a.app_id
      JOIN users u ON a.user_id = u.id
      WHERE e.timestamp < (unixepoch() - u.retention_days * 86400) * 1000
    )
  `).run();

  // 3. 清理过期的用量统计（保留 90 天）
  await env.DB.prepare(`
    DELETE FROM daily_usage
    WHERE date < date('now', '-90 days')
  `).run();
}
```

### 6.2 wrangler.toml 配置

```toml
[triggers]
crons = ["0 0 * * *"]  # 每天 UTC 0 点执行
```

---

## 七、支付集成（可选）

### 7.1 方案选择

| 方案 | 适合 | 费率 | 国内支持 |
|------|------|------|----------|
| **Stripe** | 海外用户 | 2.9% + $0.30 | ❌ |
| **Paddle** | 全球（含税） | 5% + $0.50 | ⚠️ |
| **LemonSqueezy** | 独立开发者 | 5% + $0.50 | ⚠️ |
| **支付宝/微信** | 国内用户 | 0.6% | ✅ |

**推荐**：先用 LemonSqueezy（最简单），后续按需加支付宝。

### 7.2 Webhook 处理

```typescript
// src/payment.ts

export async function handlePaymentWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json();

  // 验证签名...

  if (body.event === 'subscription_created' || body.event === 'subscription_updated') {
    const email = body.data.attributes.user_email;

    await env.DB.prepare(`
      UPDATE users
      SET plan = 'pro',
          daily_limit = 50000,
          retention_days = 360,
          plan_expires_at = ?
      WHERE email = ?
    `).bind(body.data.attributes.renews_at, email).run();
  }

  if (body.event === 'subscription_cancelled') {
    const email = body.data.attributes.user_email;

    await env.DB.prepare(`
      UPDATE users
      SET plan = 'free',
          daily_limit = 2000,
          retention_days = 30,
          plan_expires_at = NULL
      WHERE email = ?
    `).bind(email).run();
  }

  return new Response('OK');
}
```

---

## 八、项目结构更新

```
orbit/
├── src/
│   ├── index.ts          # 路由入口
│   ├── auth.ts           # OAuth 登录
│   ├── session.ts        # Session 管理
│   ├── ratelimit.ts      # 用量限制
│   ├── event.ts          # 事件上报
│   ├── version.ts        # 版本检查
│   ├── feedback.ts       # 反馈收集
│   ├── stats.ts          # 统计查询
│   ├── payment.ts        # 支付 Webhook
│   └── scheduled.ts      # 定时任务
├── schema.sql
└── wrangler.toml
```

---

## 九、环境变量

```toml
# wrangler.toml

[vars]
FRONTEND_URL = "https://orbit.example.com"

# 敏感信息用 secrets
# wrangler secret put GOOGLE_CLIENT_ID
# wrangler secret put GOOGLE_CLIENT_SECRET
# wrangler secret put GITHUB_CLIENT_ID
# wrangler secret put GITHUB_CLIENT_SECRET
```

---

## 十、总结

| 项目 | 方案 |
|------|------|
| **认证** | 自建 OAuth（Google + GitHub） |
| **Session** | D1 存储 + Cookie |
| **限流** | D1 计数 + 每日重置 |
| **数据清理** | Cron Trigger 定时任务 |
| **支付** | LemonSqueezy（后续） |
| **外部依赖** | 无（全 Cloudflare 生态） |

**工作量预估**：
- OAuth + Session：1 天
- 限流 + 数据清理：0.5 天
- 支付集成：0.5 天（可后期）

---

*文档版本: 1.0 | 最后更新: 2025-01-16*
