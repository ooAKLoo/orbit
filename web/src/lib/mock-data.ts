// Mock 数据 - 每个 App 独立数据

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  plan: 'free' | 'pro';
  daily_limit: number;
  retention_days: number;
}

export interface App {
  id: string;
  app_id: string;
  app_name: string;
  api_key: string;
  created_at: string;
}

export interface DailyStats {
  date: string;
  downloads: number;
  dau: number;
}

export interface PlatformStats {
  platform: string;
  count: number;
}

export interface RetentionStats {
  d1: number;
  d7: number;
  d30: number;
}

export interface Feedback {
  id: string;
  app_id: string;
  content: string;
  contact: string | null;
  created_at: string;
}

export interface AppData {
  dailyStats: DailyStats[];
  platformStats: PlatformStats[];
  retention: RetentionStats;
  feedbacks: Feedback[];
}

// Mock 当前用户
export const mockUser: User = {
  id: 'user_001',
  email: 'demo@example.com',
  name: 'Demo User',
  avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
  plan: 'free',
  daily_limit: 2000,
  retention_days: 30,
};

// Mock 应用列表
export const mockApps: App[] = [
  {
    id: '1',
    app_id: 'com.example.app1',
    app_name: 'My Awesome App',
    api_key: 'orb_live_xxxxxxxxxxxxx',
    created_at: '2024-12-01',
  },
  {
    id: '2',
    app_id: 'com.example.app2',
    app_name: 'Another App',
    api_key: 'orb_live_yyyyyyyyyyyyy',
    created_at: '2024-12-15',
  },
];

// 生成每个 App 的独立 Mock 数据
function generateDailyStats(days: number, seed: number): DailyStats[] {
  const stats: DailyStats[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // 使用 seed 生成不同 app 的不同数据
    const baseDownloads = (30 + seed * 20) + Math.floor(Math.random() * 30);
    const baseDau = (150 + seed * 50) + Math.floor(Math.random() * 100);

    const dayOfWeek = date.getDay();
    const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1;

    stats.push({
      date: date.toISOString().split('T')[0],
      downloads: Math.floor(baseDownloads * weekendFactor),
      dau: Math.floor(baseDau * weekendFactor),
    });
  }

  return stats;
}

// 每个 App 的独立数据
export const mockAppData: Record<string, AppData> = {
  'com.example.app1': {
    dailyStats: generateDailyStats(30, 1),
    platformStats: [
      { platform: 'iOS', count: 1234 },
      { platform: 'macOS', count: 567 },
      { platform: 'Android', count: 890 },
      { platform: 'Windows', count: 234 },
    ],
    retention: { d1: 0.42, d7: 0.25, d30: 0.12 },
    feedbacks: [
      {
        id: '1',
        app_id: 'com.example.app1',
        content: '希望能增加深色模式，晚上使用眼睛会比较舒服',
        contact: 'user1@example.com',
        created_at: '2024-01-15 14:30',
      },
      {
        id: '2',
        app_id: 'com.example.app1',
        content: 'App 很好用，就是启动有点慢',
        contact: null,
        created_at: '2024-01-14 09:15',
      },
      {
        id: '3',
        app_id: 'com.example.app1',
        content: '能否支持导出 PDF 格式？',
        contact: 'user3@example.com',
        created_at: '2024-01-13 18:45',
      },
    ],
  },
  'com.example.app2': {
    dailyStats: generateDailyStats(30, 2),
    platformStats: [
      { platform: 'iOS', count: 456 },
      { platform: 'Android', count: 789 },
    ],
    retention: { d1: 0.38, d7: 0.20, d30: 0.08 },
    feedbacks: [
      {
        id: '4',
        app_id: 'com.example.app2',
        content: '这个应用非常棒，简洁好用！',
        contact: 'happy@example.com',
        created_at: '2024-01-15 10:20',
      },
      {
        id: '5',
        app_id: 'com.example.app2',
        content: '建议增加云同步功能',
        contact: null,
        created_at: '2024-01-12 16:30',
      },
    ],
  },
};

// 获取指定 App 的数据
export function getAppData(appId: string): AppData | null {
  return mockAppData[appId] || null;
}

// 计算汇总数据
export function getStats(dailyStats: DailyStats[]) {
  const totalDownloads = dailyStats.reduce((sum, d) => sum + d.downloads, 0);
  const avgDau = Math.round(
    dailyStats.reduce((sum, d) => sum + d.dau, 0) / dailyStats.length
  );
  const todayDau = dailyStats[dailyStats.length - 1]?.dau || 0;
  const yesterdayDau = dailyStats[dailyStats.length - 2]?.dau || 0;
  const dauChange = yesterdayDau > 0
    ? ((todayDau - yesterdayDau) / yesterdayDau * 100).toFixed(1)
    : '0';

  return {
    totalDownloads,
    avgDau,
    todayDau,
    dauChange: Number(dauChange),
  };
}
