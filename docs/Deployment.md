# Orbit 部署指南

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端 SDK                                │
│              (自动检测时区选择端点)                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
     中国大陆用户                      海外用户
     (Asia/Shanghai)                  (其他时区)
          │                               │
          ▼                               │
   ┌──────────────┐                       │
   │  腾讯云函数   │                       │
   │  (香港节点)   │                       │
   └──────┬───────┘                       │
          │                               │
          └───────────┬───────────────────┘
                      ▼
              ┌──────────────┐
              │ CF Workers   │
              │ (全球边缘)    │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │   CF D1      │
              │  (SQLite)    │
              └──────────────┘
```

## 为什么需要香港中转？

| 直连路径 | 结果 |
|---------|------|
| 中国大陆 → CF Workers | ❌ 超时/失败（被墙） |
| 中国大陆 → 上海云函数 → CF | ❌ 上海也访问不了 CF |
| 中国大陆 → **香港云函数** → CF | ✅ 成功（香港可访问 CF） |
| 海外 → CF Workers | ✅ 直连，延迟低 |

## 部署步骤

### 1. 部署 Cloudflare Worker

```bash
cd worker

# 创建 D1 数据库
wrangler d1 create orbit-db

# 记下返回的 database_id，填入 wrangler.toml
# [[d1_databases]]
# binding = "DB"
# database_name = "orbit-db"
# database_id = "your-database-id"

# 初始化表结构
wrangler d1 execute orbit-db --remote --file=schema.sql

# 部署
wrangler deploy
```

部署后得到 Worker URL: `https://orbit-api.xxx.workers.dev`

### 2. 部署腾讯云函数（香港节点）

> **重要**: 必须选择**香港**节点，上海/北京节点无法访问 Cloudflare

1. 进入[腾讯云函数控制台](https://console.cloud.tencent.com/scf)
2. 选择地域：**香港**
3. 创建函数 → 选择 **Express 框架模版**
4. 替换代码为以下内容：

```javascript
const express = require('express');
const https = require('https');
const app = express();

app.use(express.json());

// CORS 中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 修改为你的 CF Worker 域名
const CF_HOST = 'orbit-api.xxx.workers.dev';

// HTTPS 请求封装
function forwardRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: CF_HOST,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch {
          resolve({ raw: responseData });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// 健康检查
app.get('/health', (req, res) => res.json({ ok: true, source: 'scf-hk' }));

// 埋点事件：同步转发
app.post('/v1/:appId/event', async (req, res) => {
  try {
    const data = await forwardRequest(`/v1/${req.params.appId}/event`, 'POST', req.body);
    res.json(data);
  } catch (err) {
    console.error('Event forward failed:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// 用户反馈：同步转发
app.post('/v1/:appId/feedback', async (req, res) => {
  try {
    const data = await forwardRequest(`/v1/${req.params.appId}/feedback`, 'POST', req.body);
    res.json(data);
  } catch (err) {
    console.error('Feedback forward failed:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// 版本检查：同步转发
app.get('/v1/:appId/version', async (req, res) => {
  try {
    const query = new URLSearchParams(req.query).toString();
    const path = `/v1/${req.params.appId}/version${query ? '?' + query : ''}`;
    const data = await forwardRequest(path, 'GET', null);
    res.json(data);
  } catch (err) {
    console.error('Version check failed:', err.message);
    res.json({ has_update: false });
  }
});

const port = 9000;
app.listen(port, () => console.log(`Orbit proxy running on ${port}`));

module.exports = app;
```

5. **重要配置**：
   - 执行超时时间：**10 秒**（CF 响应可能需要几秒）
   - 内存：512MB（默认即可）

6. 部署后得到函数 URL: `https://xxx.ap-hongkong.tencentscf.com`

### 3. 更新 SDK 端点

在 `packages/sdk-typescript/src/index.ts` 中配置：

```typescript
// Endpoints
const ENDPOINT_GLOBAL = 'https://orbit-api.xxx.workers.dev';
const ENDPOINT_CHINA = 'https://xxx.ap-hongkong.tencentscf.com';
```

SDK 会自动检测用户时区：
- `Asia/Shanghai` 或 `Asia/Chongqing` → 使用香港云函数
- 其他时区 → 直连 CF Workers

## 踩坑记录

### 1. 国内云函数无法访问 CF

**现象**: 上海/北京的云函数调用 CF Workers 超时

**原因**: 大陆云服务出国带宽受限，Cloudflare 域名被墙

**解决**: 使用**香港**节点的云函数中转

### 2. Node.js 12 没有 fetch

**现象**: `ReferenceError: fetch is not defined`

**原因**: Node.js 12 没有内置 `fetch` API（Node.js 18+ 才有）

**解决**: 使用 `https` 模块替代

```javascript
// ❌ 不行
fetch(url, options)

// ✅ 正确
const https = require('https');
https.request(options, callback)
```

### 3. 异步转发不执行

**现象**: 云函数返回成功，但数据没到 CF

**原因**: 云函数在返回响应后立即冻结，异步请求被终止

```javascript
// ❌ 不行 - 异步转发会被终止
app.post('/feedback', (req, res) => {
  res.json({ success: true });  // 返回后函数冻结
  fetch(CF_URL, { ... });       // 这个不会执行
});

// ✅ 正确 - 同步等待
app.post('/feedback', async (req, res) => {
  const result = await fetch(CF_URL, { ... });  // 等待完成
  res.json(result);
});
```

### 4. CORS 问题

**现象**: 浏览器报 `No 'Access-Control-Allow-Origin' header`

**解决**: 云函数添加 CORS 中间件

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});
```

### 5. 云函数超时

**现象**: `Invoking task timed out after 3 seconds`

**原因**: 默认超时 3 秒，CF 响应可能更慢

**解决**: 将执行超时时间改为 10 秒

## 测试命令

```bash
# 测试 CF Workers 直连
curl -X POST 'https://orbit-api.xxx.workers.dev/v1/com.example.app/feedback' \
  -H 'Content-Type: application/json' \
  -d '{"content":"test","contact":"test@test.com"}'

# 测试香港云函数中转
curl -X POST 'https://xxx.ap-hongkong.tencentscf.com/v1/com.example.app/feedback' \
  -H 'Content-Type: application/json' \
  -d '{"content":"test from hk scf","contact":"test@test.com"}'

# 检查数据库
wrangler d1 execute orbit-db --remote --command "SELECT * FROM feedbacks ORDER BY id DESC LIMIT 5"
```

## 成本估算

| 服务 | 免费额度 | 超出价格 |
|------|---------|---------|
| CF Workers | 10万请求/天 | $0.50/百万请求 |
| CF D1 | 5GB 存储，500万行读/天 | 按量计费 |
| 腾讯云函数（香港） | 100万次/月 | ¥0.0133/万次 |

对于独立开发者，免费额度通常够用。

## 监控建议

1. **CF Workers**: 在 Cloudflare Dashboard 查看请求量和错误率
2. **腾讯云函数**: 查看「日志查询」和「监控信息」
3. **D1 数据库**: 定期检查数据量，考虑清理历史数据

---

*最后更新: 2025-01-16*
