'use client';

import { useState, useMemo } from 'react';
import { Download, Users, RefreshCw, Mail, Clock, MessageSquare } from 'lucide-react';
import { StatsCard } from '@/components/stats-card';
import { DailyChart, PlatformChart, RetentionChart } from '@/components/charts';
import { DateFilter } from '@/components/date-filter';
import { useApp } from '@/lib/app-context';
import { getAppData, getStats } from '@/lib/mock-data';

type DateRange = '7d' | '14d' | '30d' | 'custom';

export default function DashboardPage() {
  const { selectedAppId, selectedApp } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  // 获取当前选中 App 的数据
  const appData = useMemo(() => {
    if (!selectedAppId) return null;
    return getAppData(selectedAppId);
  }, [selectedAppId]);

  // 根据日期范围筛选数据
  const filteredData = useMemo(() => {
    if (!appData) return [];
    const days = dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : 30;
    return appData.dailyStats.slice(-days);
  }, [appData, dateRange]);

  const stats = useMemo(() => getStats(filteredData), [filteredData]);

  if (!appData || !selectedApp) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-neutral-400">请先选择一个应用</p>
      </div>
    );
  }

  const feedbacks = appData.feedbacks;

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

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        <StatsCard
          title="总下载量"
          value={stats.totalDownloads}
          icon={<Download className="w-5 h-5" />}
        />
        <StatsCard
          title="今日活跃用户"
          value={stats.todayDau}
          change={stats.dauChange}
          changeLabel="vs 昨日"
          icon={<Users className="w-5 h-5" />}
        />
        <StatsCard
          title="平均日活"
          value={stats.avgDau}
          icon={<RefreshCw className="w-5 h-5" />}
        />
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-2 gap-5 mb-8">
        <DailyChart
          data={filteredData}
          dataKey="downloads"
          title="每日下载量"
        />
        <DailyChart data={filteredData} dataKey="dau" title="每日活跃用户" />
      </div>

      {/* 留存、平台分布、用户反馈 */}
      <div className="grid grid-cols-3 gap-5">
        <RetentionChart data={appData.retention} />
        <PlatformChart data={appData.platformStats} />

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
                      <span>{feedback.created_at.split(' ')[0]}</span>
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
    </div>
  );
}
