'use client';

import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">设置</h1>
        <p className="text-neutral-400 mt-1">管理你的账户</p>
      </div>

      {/* 账户信息 */}
      <div className="bg-white rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-medium text-neutral-900 mb-4">账户信息</h2>
        <div className="flex items-center gap-4">
          <img
            src={user?.avatar_url}
            alt={user?.name}
            className="w-16 h-16 rounded-full bg-neutral-200"
          />
          <div>
            <p className="text-lg font-medium text-neutral-900">{user?.name}</p>
            <p className="text-neutral-500">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* 套餐信息 */}
      <div className="bg-white rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-medium text-neutral-900 mb-4">套餐</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 text-sm font-medium rounded-lg ${
                  user?.plan === 'pro'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-[#f8f8f8] text-neutral-600'
                }`}
              >
                {user?.plan === 'pro' ? 'Pro' : 'Free'}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-neutral-500">
              <p>{user?.daily_limit.toLocaleString()} 请求/天</p>
              <p>数据保留 {user?.retention_days} 天</p>
            </div>
          </div>
          {user?.plan === 'free' && (
            <button className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition-colors">
              升级到 Pro
            </button>
          )}
        </div>
      </div>

      {/* 危险操作 */}
      <div className="bg-white rounded-2xl p-6">
        <h2 className="text-lg font-medium text-neutral-900 mb-4">危险操作</h2>
        <div className="flex items-center justify-between p-4 bg-[#f8f8f8] rounded-xl">
          <div>
            <p className="text-sm font-medium text-neutral-900">删除账户</p>
            <p className="text-sm text-neutral-500 mt-0.5">
              永久删除你的账户和所有数据
            </p>
          </div>
          <button className="px-4 py-2 text-red-500 text-sm font-medium rounded-xl hover:bg-red-50 transition-colors">
            删除账户
          </button>
        </div>
      </div>
    </div>
  );
}
