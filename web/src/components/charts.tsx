'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { DailyStats, PlatformStats, RetentionStats } from '@/lib/mock-data';

interface DailyChartProps {
  data: DailyStats[];
  dataKey: 'downloads' | 'dau';
  title: string;
}

export function DailyChart({ data, dataKey, title }: DailyChartProps) {
  // 格式化日期显示
  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="bg-white rounded-2xl p-5">
      <h3 className="text-sm font-medium text-neutral-900 mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#171717" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#171717" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 12, fill: '#a3a3a3' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#a3a3a3' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                padding: '12px',
              }}
              labelFormatter={(label) => new Date(label).toLocaleDateString('zh-CN')}
              formatter={(value: number) => [value.toLocaleString(), title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="#171717"
              strokeWidth={2}
              fill={`url(#gradient-${dataKey})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface PlatformChartProps {
  data: PlatformStats[];
}

export function PlatformChart({ data }: PlatformChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="bg-white rounded-2xl p-5">
      <h3 className="text-sm font-medium text-neutral-900 mb-4">平台分布</h3>
      <div className="space-y-3">
        {data.map((item) => {
          const percentage = ((item.count / total) * 100).toFixed(1);
          return (
            <div key={item.platform}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-neutral-600">{item.platform}</span>
                <span className="text-neutral-900 font-medium">
                  {item.count.toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-[#f8f8f8] rounded-full overflow-hidden">
                <div
                  className="h-full bg-neutral-900 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RetentionChartProps {
  data: RetentionStats;
}

export function RetentionChart({ data }: RetentionChartProps) {
  const chartData = [
    { day: 'D1', rate: data.d1 * 100 },
    { day: 'D7', rate: data.d7 * 100 },
    { day: 'D30', rate: data.d30 * 100 },
  ];

  return (
    <div className="bg-white rounded-2xl p-5">
      <h3 className="text-sm font-medium text-neutral-900 mb-4">留存率</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: '#a3a3a3' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#a3a3a3' }}
              axisLine={false}
              tickLine={false}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                padding: '12px',
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, '留存率']}
            />
            <Bar dataKey="rate" fill="#171717" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-around mt-4 pt-4">
        {chartData.map((item) => (
          <div key={item.day} className="text-center">
            <p className="text-2xl font-semibold text-neutral-900">
              {item.rate.toFixed(0)}%
            </p>
            <p className="text-xs text-neutral-400">{item.day} 留存</p>
          </div>
        ))}
      </div>
    </div>
  );
}
