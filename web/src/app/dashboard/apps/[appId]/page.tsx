'use client';

import { useApp } from '@/lib/app-context';
import { Copy, Key, Check, ArrowLeft, Trash2, Plus, Package } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Platform = 'swift' | 'kotlin' | 'typescript';

export default function AppDetailPage() {
  const params = useParams();
  const { apps } = useApp();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('swift');

  const app = apps.find((a) => a.app_id === params.appId);

  const getSwiftCode = (appId: string) => `// 1. 添加 Swift Package
// https://github.com/aspect-build/orbit-swift

// 2. 在 AppDelegate 中初始化
import Orbit

func application(_ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    Orbit.configure(appId: "${appId}")
    return true
}

// ✅ 下载量和日活会自动追踪，无需额外代码

// 3. 检查版本更新
Orbit.checkUpdate { result in
    if result.hasUpdate {
        print("新版本: \\(result.latestVersion)")
        print("更新说明: \\(result.releaseNotes)")
        print("是否强制更新: \\(result.forceUpdate)")
        print("下载地址: \\(result.downloadUrl)")
    }
}

// 4. 提交用户反馈（可选）
Orbit.sendFeedback(
    content: "用户反馈内容",
    contact: "user@example.com"  // 可选
)`;

  const getKotlinCode = (appId: string) => `// 1. 添加依赖
// implementation("com.aspect.orbit:orbit-android:1.0.0")

// 2. 在 Application 中初始化
import com.aspect.orbit.Orbit

class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Orbit.configure(this, "${appId}")
    }
}

// ✅ 下载量和日活会自动追踪，无需额外代码

// 3. 检查版本更新
Orbit.checkUpdate { result ->
    if (result.hasUpdate) {
        println("新版本: \${result.latestVersion}")
        println("更新说明: \${result.releaseNotes}")
        println("是否强制更新: \${result.forceUpdate}")
        println("下载地址: \${result.downloadUrl}")
    }
}

// 4. 提交用户反馈（可选）
Orbit.sendFeedback(
    content = "用户反馈内容",
    contact = "user@example.com"  // 可选
)`;

  const getTypeScriptCode = (appId: string) => `// 1. 安装依赖
// npm install @aspect/orbit

// 2. 在应用入口初始化 (Electron/Tauri)
import { Orbit } from '@aspect/orbit';

Orbit.configure({
  appId: '${appId}',
});

// ✅ 下载量和日活会自动追踪，无需额外代码

// 3. 检查版本更新
const result = await Orbit.checkUpdate();
if (result.hasUpdate) {
  console.log('新版本:', result.latestVersion);
  console.log('更新说明:', result.releaseNotes);
  console.log('是否强制更新:', result.forceUpdate);
  console.log('下载地址:', result.downloadUrl);
}

// 4. 提交用户反馈（可选）
Orbit.sendFeedback({
  content: '用户反馈内容',
  contact: 'user@example.com',  // 可选
});`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!app) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-neutral-400">应用不存在</p>
      </div>
    );
  }

  return (
    <div className="w-full lg:h-full flex flex-col">
      {/* 返回链接 */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回
      </Link>

      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {app.app_name}
          </h1>
          <p className="text-neutral-400 mt-1">{app.app_id}</p>
        </div>
        <button className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* 主体内容 - 左右双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:flex-1 lg:min-h-0">
        {/* 左侧：API Key、App ID、版本管理 */}
        <div className="space-y-6 lg:flex lg:flex-col">
          {/* API Key */}
          <div className="bg-white rounded-2xl p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-3">
              <Key className="w-4 h-4" />
              <span>API Key</span>
            </div>
            <p className="text-sm text-neutral-500 mb-3">用于管理端 API 调用</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-3 bg-[#f8f8f8] rounded-xl text-sm font-mono text-neutral-600 truncate">
                {app.api_key}
              </code>
              <button
                onClick={() => copyToClipboard(app.api_key, 'api-key')}
                className="px-4 py-3 bg-[#f8f8f8] rounded-xl text-sm text-neutral-600 hover:text-neutral-900 transition-colors flex items-center gap-2 shrink-0"
              >
                {copiedId === 'api-key' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copiedId === 'api-key' ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          {/* App ID */}
          <div className="bg-white rounded-2xl p-6">
            <div className="text-sm font-medium text-neutral-900 mb-3">App ID</div>
            <p className="text-sm text-neutral-500 mb-3">用于客户端 SDK 初始化</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-3 bg-[#f8f8f8] rounded-xl text-sm font-mono text-neutral-600 truncate">
                {app.app_id}
              </code>
              <button
                onClick={() => copyToClipboard(app.app_id, 'app-id')}
                className="px-4 py-3 bg-[#f8f8f8] rounded-xl text-sm text-neutral-600 hover:text-neutral-900 transition-colors flex items-center gap-2 shrink-0"
              >
                {copiedId === 'app-id' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copiedId === 'app-id' ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          {/* 版本管理 */}
          <div className="bg-white rounded-2xl p-6 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-neutral-900" />
                <span className="text-sm font-medium text-neutral-900">版本管理</span>
              </div>
              <button className="px-3 py-1.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                发布新版本
              </button>
            </div>

            {/* 版本列表 - Mock 数据 */}
            <div className="space-y-3 lg:flex-1 lg:overflow-y-auto">
              <div className="p-4 bg-[#f8f8f8] rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                      最新
                    </span>
                    <span className="font-mono text-sm font-medium text-neutral-900">v1.2.0</span>
                  </div>
                  <span className="text-xs text-neutral-400">2024-01-15</span>
                </div>
                <p className="text-sm text-neutral-500 mt-2">修复了若干 bug，提升了性能</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-neutral-400">
                  <span>最低版本: v1.0.0</span>
                  <span>强制更新: 否</span>
                </div>
              </div>

              <div className="p-4 bg-[#f8f8f8] rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-neutral-900">v1.1.0</span>
                  <span className="text-xs text-neutral-400">2024-01-01</span>
                </div>
                <p className="text-sm text-neutral-500 mt-2">新增深色模式支持</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-neutral-400">
                  <span>最低版本: v1.0.0</span>
                  <span>强制更新: 否</span>
                </div>
              </div>

              <div className="p-4 bg-[#f8f8f8] rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-neutral-900">v1.0.0</span>
                  <span className="text-xs text-neutral-400">2023-12-15</span>
                </div>
                <p className="text-sm text-neutral-500 mt-2">首次发布</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-neutral-400">
                  <span>最低版本: v1.0.0</span>
                  <span>强制更新: 否</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：SDK 集成代码 */}
        <div className="bg-white rounded-2xl p-6 lg:flex lg:flex-col lg:min-h-0">
          <div className="mb-4 shrink-0">
            <div className="text-sm font-medium text-neutral-900">SDK 集成代码</div>
            <p className="text-sm text-neutral-500 mt-1">复制代码到你的项目中</p>
          </div>
          <div className="flex bg-[#f8f8f8] rounded-lg p-1 mb-4 shrink-0">
            <button
              onClick={() => setSelectedPlatform('swift')}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                selectedPlatform === 'swift'
                  ? 'bg-white text-neutral-900 font-medium'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Swift
            </button>
            <button
              onClick={() => setSelectedPlatform('kotlin')}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                selectedPlatform === 'kotlin'
                  ? 'bg-white text-neutral-900 font-medium'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Kotlin
            </button>
            <button
              onClick={() => setSelectedPlatform('typescript')}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                selectedPlatform === 'typescript'
                  ? 'bg-white text-neutral-900 font-medium'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              TypeScript
            </button>
          </div>
          <div className="relative lg:flex-1 lg:min-h-0">
            <pre className="p-4 bg-[#f8f8f8] rounded-xl text-sm font-mono text-neutral-700 overflow-auto lg:h-full max-h-96 lg:max-h-none">
              {selectedPlatform === 'swift'
                ? getSwiftCode(app.app_id)
                : selectedPlatform === 'kotlin'
                ? getKotlinCode(app.app_id)
                : getTypeScriptCode(app.app_id)}
            </pre>
            <button
              onClick={() =>
                copyToClipboard(
                  selectedPlatform === 'swift'
                    ? getSwiftCode(app.app_id)
                    : selectedPlatform === 'kotlin'
                    ? getKotlinCode(app.app_id)
                    : getTypeScriptCode(app.app_id),
                  'code'
                )
              }
              className="absolute top-3 right-3 px-3 py-1.5 bg-white rounded-lg text-sm text-neutral-600 hover:text-neutral-900 transition-colors flex items-center gap-1.5"
            >
              {copiedId === 'code' ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  复制代码
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
