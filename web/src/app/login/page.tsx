'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const { user, login, loginWithPassword, isLoading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    const success = loginWithPassword(username, password);
    if (!success) {
      setError('用户名或密码错误');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-5 h-5 rounded-full bg-neutral-900 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f8f8]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-neutral-900 mb-4">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" strokeWidth="2" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900">Orbit</h1>
          <p className="text-neutral-500 mt-2">轻量级应用数据服务</p>
        </div>

        {/* 登录卡片 */}
        <div className="bg-white rounded-2xl p-8">
          <h2 className="text-lg font-medium text-neutral-900 mb-6">登录到 Orbit</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-neutral-700 mb-1.5">
                用户名
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#f8f8f8] border-0 focus:ring-2 focus:ring-neutral-900 focus:outline-none transition-shadow"
                placeholder="请输入用户名"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1.5">
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#f8f8f8] border-0 focus:ring-2 focus:ring-neutral-900 focus:outline-none transition-shadow"
                placeholder="请输入密码"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <button
              type="submit"
              className="w-full px-4 py-3 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
            >
              登录
            </button>
          </form>

          {/* 分割线 */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-xs text-neutral-400">或</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          {/* OAuth 登录 */}
          <div className="space-y-3">
            <button
              onClick={() => login('google')}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-[#f8f8f8] hover:bg-neutral-100 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-neutral-700 font-medium">使用 Google 登录</span>
            </button>

            <button
              onClick={() => login('github')}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-[#f8f8f8] hover:bg-neutral-100 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#171717">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="text-neutral-700 font-medium">使用 GitHub 登录</span>
            </button>
          </div>

          <p className="text-xs text-neutral-400 text-center mt-6">
            登录即表示同意我们的
            <a href="/terms" className="text-neutral-600 hover:text-neutral-900 underline">
              服务条款
            </a>
            和
            <a href="/privacy" className="text-neutral-600 hover:text-neutral-900 underline">
              隐私政策
            </a>
          </p>
        </div>

        {/* 底部信息 */}
        <p className="text-center text-sm text-neutral-400 mt-6">
          两个事件，三个指标，够用就好
        </p>
      </div>
    </div>
  );
}
