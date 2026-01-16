'use client';

import { useState, useEffect, useMemo } from 'react';
import { Download, Users, RefreshCw, Mail, Clock, MessageSquare, Loader2 } from 'lucide-react';
import { StatsCard } from '@/components/stats-card';
import { DailyChart, PlatformChart, RetentionChart } from '@/components/charts';
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

  // Fetch data when app or date range changes
  useEffect(() => {
    if (!selectedAppId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
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
      }
    };

    fetchData();
  }, [selectedAppId, days]);

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

  // Transform platform stats for chart
  const platformData = useMemo(() => {
    if (!stats) return [];
    return stats.platform_stats.map(p => ({
      platform: p.platform?.toUpperCase() || 'Unknown',
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
    <div className="w-full">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {selectedApp.app_name}
          </h1>
          <p className="text-neutral-400 mt-1">{selectedApp.app_id}</p>
        </div>
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          {/* 核心指标卡片 */}
          <div className="grid grid-cols-3 gap-5 mb-8">
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
          <div className="grid grid-cols-2 gap-5 mb-8">
            <DailyChart
              data={chartData}
              dataKey="downloads"
              title="每日下载量"
            />
            <DailyChart data={chartData} dataKey="dau" title="每日活跃用户" />
          </div>

          {/* 留存、平台分布、用户反馈 */}
          <div className="grid grid-cols-3 gap-5">
            <RetentionChart data={stats?.retention || { d1: 0, d7: 0, d30: 0 }} />
            <PlatformChart data={platformData} />

            {/* 用户反馈 */}
            <div className="bg-white rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-neutral-900">用户反馈</h3>
                <span className="text-xs text-neutral-400">{feedbacks.length} 条</span>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto hide-scrollbar">
                {feedbacks.length > 0 ? (
                  feedbacks.map((feedback) => (
                    <div key={feedback.id} className="p-3 bg-[#f8f8f8] rounded-xl">
                      <p className="text-sm text-neutral-700 line-clamp-2">
                        {feedback.content}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        {feedback.contact && (
                          <div className="flex items-center gap-1 text-xs text-neutral-400">
                            <Mail className="w-3 h-3" />
                            <span className="truncate max-w-20">{feedback.contact}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-neutral-400">
                          <Clock className="w-3 h-3" />
                          <span>
                            {new Date(feedback.created_at * 1000).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-neutral-300">
                    <MessageSquare className="w-8 h-8 mb-2" />
                    <p className="text-sm">暂无反馈</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
