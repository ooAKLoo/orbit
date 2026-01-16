'use client';

import { useAuth } from '@/lib/auth-context';
import { useApp } from '@/lib/app-context';
import { LogOut, Plus, ChevronDown, Settings, Code, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function Sidebar() {
  const { user, logout } = useAuth();
  const { apps, selectedApp, selectedAppId, setSelectedAppId, isLoading } = useApp();
  const [showApps, setShowApps] = useState(false);

  return (
    <aside className="w-64 h-screen bg-[#f8f8f8] flex flex-col">
      {/* Logo */}
      <div className="p-5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-900 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" strokeWidth="2" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-neutral-900">Orbit</span>
        </Link>
      </div>

      {/* App 选择器 */}
      <div className="px-3 mb-2">
        <button
          onClick={() => setShowApps(!showApps)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white hover:bg-neutral-50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm font-medium text-neutral-900 truncate">
              {selectedApp?.app_name || '选择应用'}
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-neutral-400 transition-transform ${
              showApps ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showApps && (
          <div className="mt-2 p-2 bg-white rounded-xl space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
              </div>
            ) : apps.length === 0 ? (
              <div className="px-3 py-2 text-sm text-neutral-400">暂无应用</div>
            ) : null}
            {!isLoading && apps.map((app) => (
              <div
                key={app.id}
                className={`flex items-center justify-between rounded-lg transition-colors ${
                  app.app_id === selectedAppId
                    ? 'bg-[#f8f8f8]'
                    : 'hover:bg-[#f8f8f8]'
                }`}
              >
                <button
                  onClick={() => setSelectedAppId(app.app_id)}
                  className={`flex-1 px-3 py-2 text-left text-sm ${
                    app.app_id === selectedAppId
                      ? 'text-neutral-900'
                      : 'text-neutral-600'
                  }`}
                >
                  {app.app_name}
                </button>
                <Link
                  href={`/dashboard/apps/${app.app_id}`}
                  className="p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  title="接入代码"
                >
                  <Code className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
            <Link
              href="/dashboard/apps/new"
              className="w-full px-3 py-2 text-left text-sm text-neutral-400 hover:text-neutral-600 hover:bg-[#f8f8f8] rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加应用
            </Link>
          </div>
        )}
      </div>

      {/* 占位区域 */}
      <div className="flex-1" />

      {/* 用量信息 */}
      <div className="px-3 py-3">
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-400">今日请求</span>
            <span className="text-xs font-medium text-neutral-900">
              {user?.plan === 'pro' ? 'Pro' : 'Free'}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold text-neutral-900">1,234</span>
            <span className="text-xs text-neutral-400">
              / {user?.daily_limit.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-[#f8f8f8] rounded-full overflow-hidden">
            <div
              className="h-full bg-neutral-900 rounded-full"
              style={{ width: `${(1234 / (user?.daily_limit || 2000)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 用户信息 */}
      <div className="p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <img
            src={user?.avatar_url}
            alt={user?.name}
            className="w-8 h-8 rounded-full bg-neutral-200"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {user?.name}
            </p>
            <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
          </div>
          <Link
            href="/dashboard/settings"
            className="p-2 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-white transition-colors"
          >
            <Settings className="w-4 h-4" />
          </Link>
          <button
            onClick={logout}
            className="p-2 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
