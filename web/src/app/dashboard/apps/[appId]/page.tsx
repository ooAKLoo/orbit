'use client';

import { useApp } from '@/lib/app-context';
import { Copy, Key, Check, ArrowLeft, Trash2, Plus, Package, Loader2, X, Github, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getAppVersions, createVersion, updateApp, syncGitHubReleases, Version } from '@/lib/api';

type Platform = 'swift' | 'kotlin' | 'typescript';

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { apps, deleteApp } = useApp();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('swift');
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [isEditingRepo, setIsEditingRepo] = useState(false);
  const [isSavingRepo, setIsSavingRepo] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const app = apps.find((a) => a.app_id === params.appId);

  // Initialize github repo from app
  useEffect(() => {
    if (app?.github_repo) {
      setGithubRepo(app.github_repo);
    }
  }, [app?.github_repo]);

  // Fetch versions
  useEffect(() => {
    if (!app) return;

    const fetchVersions = async () => {
      try {
        setIsLoadingVersions(true);
        const data = await getAppVersions(app.app_id);
        setVersions(data);
      } catch (err) {
        console.error('Failed to load versions:', err);
      } finally {
        setIsLoadingVersions(false);
      }
    };

    fetchVersions();
  }, [app]);

  const handleDelete = async () => {
    if (!app) return;
    if (!confirm(`确定要删除应用 "${app.app_name}" 吗？此操作不可撤销。`)) return;

    setIsDeleting(true);
    try {
      await deleteApp(app.app_id);
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to delete app:', err);
      alert('删除失败，请重试');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveRepo = async () => {
    if (!app) return;

    setIsSavingRepo(true);
    try {
      // Extract owner/repo from GitHub URL if needed
      let repoPath = githubRepo.trim();
      if (repoPath.includes('github.com/')) {
        const match = repoPath.match(/github\.com\/([^\/]+\/[^\/]+)/);
        if (match) {
          repoPath = match[1].replace(/\.git$/, '');
        }
      }

      await updateApp(app.app_id, { github_repo: repoPath || null });
      setIsEditingRepo(false);
    } catch (err) {
      console.error('Failed to save repo:', err);
      alert('保存失败，请重试');
    } finally {
      setIsSavingRepo(false);
    }
  };

  const handleSyncGitHub = async () => {
    if (!app) return;

    setIsSyncing(true);
    try {
      const result = await syncGitHubReleases(app.app_id);
      // Refresh versions
      const data = await getAppVersions(app.app_id);
      setVersions(data);
      if (result.synced > 0) {
        alert(`成功同步 ${result.synced} 个新版本`);
      } else {
        alert('没有新版本需要同步');
      }
    } catch (err) {
      console.error('Failed to sync:', err);
      alert('同步失败，请检查 GitHub 仓库地址是否正确');
    } finally {
      setIsSyncing(false);
    }
  };

  const getSwiftCode = (appId: string) => `// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: 添加依赖
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Xcode → File → Add Package Dependencies
// 输入: https://github.com/ooAKLoo/orbit.git


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: 初始化 SDK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import Orbit

@main
struct MyApp: App {
    init() {
        // 默认自动追踪下载量和日活
        Orbit.configure(appId: "${appId}")

        // 网站/仅反馈模式 - 关闭自动追踪
        // Orbit.configure(appId: "${appId}", autoTrack: false)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: 检查更新 (可选)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Orbit.checkUpdate { result in
    if result.hasUpdate {
        print("新版本: \\(result.latestVersion)")
        print("更新说明: \\(result.releaseNotes)")
        print("强制更新: \\(result.forceUpdate)")
        print("下载地址: \\(result.downloadUrl)")
    }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 4: 用户反馈 (可选)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Orbit.sendFeedback(
    content: "用户反馈内容",
    contact: "user@example.com"   // 可选
)`;

  const getKotlinCode = (appId: string) => `// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: 添加 JitPack 仓库
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        maven { url = uri("https://jitpack.io") }
    }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: 添加依赖
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// build.gradle.kts
dependencies {
    implementation("com.github.ooAKLoo:orbit:0.1.0")
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: 初始化 SDK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import com.orbit.Orbit

class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()

        // 默认自动追踪下载量和日活
        Orbit.configure(this, "${appId}")

        // 网站/仅反馈模式 - 关闭自动追踪
        // Orbit.configure(this, "${appId}", autoTrack = false)
    }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 4: 检查更新 (可选)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Orbit.checkUpdate { result ->
    if (result.hasUpdate) {
        println("新版本: \${result.latestVersion}")
        println("更新说明: \${result.releaseNotes}")
        println("强制更新: \${result.forceUpdate}")
        println("下载地址: \${result.downloadUrl}")
    }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 5: 用户反馈 (可选)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Orbit.sendFeedback(
    content = "用户反馈内容",
    contact = "user@example.com"   // 可选
)`;

  const getTypeScriptCode = (appId: string) => `// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: 安装依赖
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
npm install @ooakloowj/orbit


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: 初始化 SDK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { Orbit } from '@ooakloowj/orbit';

// 桌面应用 (Electron/Tauri) - 自动追踪下载量和日活
Orbit.configure({
    appId: '${appId}',
});

// 网站/仅反馈模式 - 关闭自动追踪
Orbit.configure({
    appId: '${appId}',
    autoTrack: false,
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: 检查更新 (可选)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const result = await Orbit.checkUpdate();

if (result.hasUpdate) {
    console.log('新版本:', result.latestVersion);
    console.log('更新说明:', result.releaseNotes);
    console.log('强制更新:', result.forceUpdate);
    console.log('下载地址:', result.downloadUrl);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 4: 用户反馈 (可选)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
await Orbit.sendFeedback({
    content: '用户反馈内容',
    contact: 'user@example.com',   // 可选
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
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Trash2 className="w-5 h-5" />
          )}
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

          {/* GitHub 仓库配置 */}
          <div className="bg-white rounded-2xl p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-3">
              <Github className="w-4 h-4" />
              <span>GitHub 仓库</span>
            </div>
            <p className="text-sm text-neutral-500 mb-3">
              配置后可自动同步 GitHub Releases 作为版本（每小时自动同步）
            </p>
            {isEditingRepo || !app.github_repo ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  placeholder="owner/repo 或 https://github.com/owner/repo"
                  className="w-full px-4 py-3 bg-[#f8f8f8] rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveRepo}
                    disabled={isSavingRepo}
                    className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSavingRepo && <Loader2 className="w-4 h-4 animate-spin" />}
                    保存
                  </button>
                  {app.github_repo && (
                    <button
                      onClick={() => {
                        setGithubRepo(app.github_repo || '');
                        setIsEditingRepo(false);
                      }}
                      className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
                    >
                      取消
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 bg-[#f8f8f8] rounded-xl text-sm font-mono text-neutral-600 truncate">
                  {app.github_repo}
                </code>
                <button
                  onClick={() => setIsEditingRepo(true)}
                  className="px-4 py-3 bg-[#f8f8f8] rounded-xl text-sm text-neutral-600 hover:text-neutral-900 transition-colors shrink-0"
                >
                  编辑
                </button>
                <button
                  onClick={handleSyncGitHub}
                  disabled={isSyncing}
                  className="px-4 py-3 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  {isSyncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  同步
                </button>
              </div>
            )}
          </div>

          {/* 版本管理 */}
          <div className="bg-white rounded-2xl p-6 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-neutral-900" />
                <span className="text-sm font-medium text-neutral-900">版本管理</span>
              </div>
              <button
                onClick={() => setShowNewVersionModal(true)}
                className="px-3 py-1.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                发布新版本
              </button>
            </div>

            {/* 版本列表 */}
            <div className="space-y-3 lg:flex-1 lg:overflow-y-auto">
              {isLoadingVersions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : versions.length > 0 ? (
                versions.map((version, index) => (
                  <div key={version.id} className="p-4 bg-[#f8f8f8] rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {index === 0 && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                            最新
                          </span>
                        )}
                        <span className="font-mono text-sm font-medium text-neutral-900">
                          v{version.version}
                        </span>
                        <span className="text-xs text-neutral-400 bg-neutral-200 px-1.5 py-0.5 rounded">
                          {version.platform}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-400">
                        {new Date(version.created_at * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    {version.changelog && (
                      <p className="text-sm text-neutral-500 mt-2">{version.changelog}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-neutral-400">
                      <span>强制更新: {version.force_update ? '是' : '否'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-neutral-300">
                  <Package className="w-8 h-8 mb-2" />
                  <p className="text-sm">暂无版本</p>
                </div>
              )}
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

      {/* New Version Modal */}
      {showNewVersionModal && (
        <NewVersionModal
          appId={app.app_id}
          onClose={() => setShowNewVersionModal(false)}
          onSuccess={async () => {
            setShowNewVersionModal(false);
            const data = await getAppVersions(app.app_id);
            setVersions(data);
          }}
        />
      )}
    </div>
  );
}

// New Version Modal Component
function NewVersionModal({
  appId,
  onClose,
  onSuccess,
}: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [platform, setPlatform] = useState('ios');
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!version.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createVersion(appId, {
        platform,
        version,
        changelog: changelog || undefined,
        download_url: downloadUrl || undefined,
        force_update: forceUpdate,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create version');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-900">发布新版本</h2>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-2">
              平台
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-4 py-3 bg-[#f8f8f8] rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="ios">iOS</option>
              <option value="macos">macOS</option>
              <option value="android">Android</option>
              <option value="windows">Windows</option>
            </select>
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-2">
              版本号
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.2.0"
              className="w-full px-4 py-3 bg-[#f8f8f8] rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 font-mono"
            />
          </div>

          {/* Changelog */}
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-2">
              更新说明
            </label>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="描述本次更新的内容..."
              rows={3}
              className="w-full px-4 py-3 bg-[#f8f8f8] rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 resize-none"
            />
          </div>

          {/* Download URL */}
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-2">
              下载链接 <span className="text-neutral-400 font-normal">(可选)</span>
            </label>
            <input
              type="text"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-3 bg-[#f8f8f8] rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>

          {/* Force Update */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="forceUpdate"
              checked={forceUpdate}
              onChange={(e) => setForceUpdate(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300"
            />
            <label htmlFor="forceUpdate" className="text-sm text-neutral-700">
              强制更新
            </label>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!version.trim() || isSubmitting}
              className="px-5 py-2 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? '发布中...' : '发布'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
