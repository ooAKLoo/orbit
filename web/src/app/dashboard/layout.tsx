'use client';

import { useAuth } from '@/lib/auth-context';
import { AppProvider } from '@/lib/app-context';
import { Sidebar } from '@/components/sidebar';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-5 h-5 rounded-full bg-neutral-900 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppProvider>
      <div className="h-screen flex bg-[#f8f8f8]">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-8 h-full">{children}</div>
        </main>
      </div>
    </AppProvider>
  );
}
