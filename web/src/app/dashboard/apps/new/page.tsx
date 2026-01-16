'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';

export default function NewAppPage() {
  const router = useRouter();
  const { createApp } = useApp();
  const [appName, setAppName] = useState('');
  const [appId, setAppId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAppNameChange = (value: string) => {
    setAppName(value);
    // 自动生成 app_id：小写、空格转点号
    const generatedId = value
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '');
    setAppId(`com.example.${generatedId}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim() || !appId.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createApp(appId, appName);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create app');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      {/* 返回链接 */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回
      </Link>

      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">添加应用</h1>
        <p className="text-neutral-400 mt-1">创建一个新的应用来追踪数据</p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6">
        <div className="space-y-5">
          {/* 应用名称 */}
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-2">
              应用名称
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => handleAppNameChange(e.target.value)}
              placeholder="我的应用"
              className="w-full px-4 py-3 bg-[#f8f8f8] rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>

          {/* App ID */}
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-2">
              App ID
            </label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="com.example.myapp"
              className="w-full px-4 py-3 bg-[#f8f8f8] rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 font-mono text-sm"
            />
            <p className="mt-2 text-xs text-neutral-400">
              建议使用反向域名格式，如 com.yourcompany.appname
            </p>
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={!appName.trim() || !appId.trim() || isSubmitting}
            className="px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? '创建中...' : '创建应用'}
          </button>
        </div>
      </form>
    </div>
  );
}
