'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Download, Users, RefreshCw, Loader2 } from 'lucide-react';
import { StatsCard } from '@/components/stats-card';
import { DailyChart, PlatformChart, RetentionChart } from '@/components/charts';
import { FeedbackCard } from '@/components/feedback-card';
import { DateFilter } from '@/components/date-filter';
import { useApp } from '@/lib/app-context';
import { getAppStats, getAppFeedbacks, AppStats, Feedback } from '@/lib/api';

type DateRange = '7d' | '14d' | '30d' | 'custom';

export default function DashboardPage() {
  const { selectedAppId, selectedApp, isLoading: appsLoading } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [stats, setStats] = useState<AppStats | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get days from date range
  const days = useMemo(() => {
    switch (dateRange) {
      case '7d': return 7;
      case '14d': return 14;
      case '30d': return 30;
      default: return 30;
    }
  }, [dateRange]);

  // Fetch data function
  const fetchData = useCallback(async (showFullLoading = true) => {
    if (!selectedAppId) return;

    try {
      if (showFullLoading) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      const [statsData, feedbacksData] = await Promise.all([
        getAppStats(selectedAppId, days),
        getAppFeedbacks(selectedAppId, 1, 10),
      ]);

      setStats(statsData);
      setFeedbacks(feedbacksData.feedbacks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedAppId, days]);

  // Fetch data when app or date range changes
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  // Transform data for charts
  const chartData = useMemo(() => {
    if (!stats) return [];

    // Merge downloads and dau by date
    const dateMap = new Map<string, { date: string; downloads: number; dau: number }>();

    for (const item of stats.downloads.by_date) {
      dateMap.set(item.date, { date: item.date, downloads: item.count, dau: 0 });
    }

    for (const item of stats.dau.by_date) {
      const existing = dateMap.get(item.date);
      if (existing) {
        existing.dau = item.count;
      } else {
        dateMap.set(item.date, { date: item.date, downloads: 0, dau: item.count });
      }
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [stats]);

  // Format platform name for display
  const formatPlatformName = (platform: string | undefined): string => {
    if (!platform) return '未知';
    const platformMap: Record<string, string> = {
      'macos': 'macOS',
      'windows': 'Windows',
      'linux': 'Linux',
      'ios': 'iOS',
      'android': 'Android',
      'web': 'Web',
    };
    return platformMap[platform.toLowerCase()] || platform;
  };

  // Transform platform stats for chart
  const platformData = useMemo(() => {
    if (!stats) return [];
    return stats.platform_stats.map(p => ({
      platform: formatPlatformName(p.platform),
      count: p.count,
    }));
  }, [stats]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!stats) {
      return { totalDownloads: 0, avgDau: 0, todayDau: 0, dauChange: 0 };
    }

    const dauByDate = stats.dau.by_date;
    const todayDau = dauByDate.length > 0 ? dauByDate[dauByDate.length - 1].count : 0;
    const yesterdayDau = dauByDate.length > 1 ? dauByDate[dauByDate.length - 2].count : 0;
    const dauChange = yesterdayDau > 0
      ? Number(((todayDau - yesterdayDau) / yesterdayDau * 100).toFixed(1))
      : 0;

    return {
      totalDownloads: stats.downloads.total,
      avgDau: stats.dau.avg,
      todayDau,
      dauChange,
    };
  }, [stats]);

  if (appsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!selectedApp) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-neutral-400">请先选择一个应用</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {selectedApp.app_name}
          </h1>
          <p className="text-neutral-400 mt-1">{selectedApp.app_id}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-white hover:bg-neutral-50 text-neutral-500 hover:text-neutral-700 transition-colors disabled:opacity-50"
            title="刷新数据"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* 核心指标卡片 */}
          <div className="grid grid-cols-3 gap-5 mb-8 flex-shrink-0">
            <StatsCard
              title="总下载量"
              value={summaryStats.totalDownloads}
              icon={<Download className="w-5 h-5" />}
            />
            <StatsCard
              title="今日活跃用户"
              value={summaryStats.todayDau}
              change={summaryStats.dauChange}
              changeLabel="vs 昨日"
              icon={<Users className="w-5 h-5" />}
            />
            <StatsCard
              title="平均日活"
              value={summaryStats.avgDau}
              icon={<RefreshCw className="w-5 h-5" />}
            />
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-2 gap-5 mb-8 flex-shrink-0">
            <DailyChart
              data={chartData}
              dataKey="downloads"
              title="每日下载量"
            />
            <DailyChart data={chartData} dataKey="dau" title="每日活跃用户" />
          </div>

          {/* 留存、平台分布、用户反馈 - 自适应填充剩余空间 */}
          <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">
            <RetentionChart data={stats?.retention || { d1: 0, d7: 0, d30: 0 }} />
            <PlatformChart data={platformData} />
            <FeedbackCard
              feedbacks={feedbacks}
              appId={selectedAppId!}
              onFeedbackDeleted={(feedbackId) => {
                setFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
