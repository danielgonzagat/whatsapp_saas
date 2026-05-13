import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAnalyticsDashboard,
  getAnalyticsDailyActivity,
  getAnalyticsAdvanced,
  getSmartTime,
  getFlowAnalytics,
  getAnalyticsStats,
  getAnalyticsFullReport,
  AnalyticsDashboardStats,
  AnalyticsDailyActivityItem,
  AnalyticsAdvancedResponse,
  SmartTimeResponse,
  FlowAnalyticsResponse,
  AnalyticsFullReport,
} from './analytics';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
  buildQuery: vi.fn((params: Record<string, string | number | undefined | null>) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return qs ? `?${qs}` : '';
  }),
}));

const baseStats: AnalyticsDashboardStats = {
  messages: 1000,
  contacts: 500,
  flows: 20,
  flowCompleted: 15,
  flowFailed: 3,
  flowRunning: 2,
  deliveryRate: 0.98,
  readRate: 0.85,
  errorRate: 0.03,
  sentiment: { positive: 60, negative: 10, neutral: 30 },
  leadScore: { high: 100, medium: 200, low: 200 },
};

const baseActivity: AnalyticsDailyActivityItem[] = [
  { date: '2026-01-01', inbound: 50, outbound: 30 },
  { date: '2026-01-02', inbound: 45, outbound: 35 },
];

const baseAdvanced: AnalyticsAdvancedResponse = {
  range: { startDate: '2026-01-01', endDate: '2026-01-31' },
  sales: {
    totals: { totalCount: 100, totalAmount: 50000, paidCount: 80, paidAmount: 40000, conversionRate: 0.8 },
    byDay: [{ day: '2026-01-01', paidAmount: 2000, paidCount: 4, totalCount: 5 }],
  },
  leads: { newContacts: 30 },
  inbox: {
    conversationsByStatus: { ai: 20, waiting: 5, done: 75 },
    waitingByQueue: [{ id: 'q1', name: 'Sales', waitingCount: 5 }],
  },
  funnels: {
    executionsByStatus: { completed: 150, running: 10, failed: 20 },
    totals: { total: 180, completed: 150, failed: 20, completionRate: 0.83 },
    topFlows: [{ flowId: 'f1', name: 'Welcome', executions: 50 }],
  },
  agents: {
    performance: [{ agentId: 'a1', messageCount: 200, avgResponseTime: 30 }],
  },
  queues: { stats: [{ id: 'q1', name: 'Sales', waitingCount: 5 }] },
};

const baseSmartTime: SmartTimeResponse = {
  bestHours: [9, 10, 14],
  bestDays: ['Monday', 'Wednesday'],
  peakHour: 10,
  peakDay: 'Monday',
  heatmap: [{ hour: 9, day: 'Monday', score: 0.9 }],
};

const baseFlowAnalytics: FlowAnalyticsResponse = {
  flowId: 'f1',
  name: 'Welcome Flow',
  totalExecutions: 100,
  completed: 80,
  failed: 10,
  running: 10,
  completionRate: 0.8,
  byDay: [{ date: '2026-01-01', count: 10 }],
};

const baseFullReport: AnalyticsFullReport = {
  period: '30d',
  messages: { total: 500, inbound: 300, outbound: 200 },
  contacts: { total: 200, new: 50 },
  flows: { executions: 100, completed: 80, failed: 20 },
  sales: { total: 40, paid: 30, revenue: 15000 },
};

describe('getAnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dashboard stats on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseStats, status: 200 });

    const result = await getAnalyticsDashboard();
    expect(result).toEqual(baseStats);
    expect(apiFetch).toHaveBeenCalledWith('/analytics/dashboard');
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Not Found', status: 404 });

    await expect(getAnalyticsDashboard()).rejects.toThrow('Not Found');
  });
});

describe('getAnalyticsDailyActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns daily activity on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseActivity, status: 200 });

    const result = await getAnalyticsDailyActivity();
    expect(result).toEqual(baseActivity);
  });

  it('returns empty array when data is nullish', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    const result = await getAnalyticsDailyActivity();
    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Server Error', status: 500 });

    await expect(getAnalyticsDailyActivity()).rejects.toThrow('Server Error');
  });
});

describe('getAnalyticsAdvanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns advanced analytics on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseAdvanced, status: 200 });

    const result = await getAnalyticsAdvanced();
    expect(result).toEqual(baseAdvanced);
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/analytics/advanced'));
  });

  it('passes date range params', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseAdvanced, status: 200 });

    await getAnalyticsAdvanced({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('startDate=2026-01-01'));
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('endDate=2026-01-31'));
  });

  it('works without params', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseAdvanced, status: 200 });

    await getAnalyticsAdvanced({});
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/analytics/advanced'));
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    await expect(getAnalyticsAdvanced()).rejects.toThrow('Unauthorized');
  });
});

describe('getSmartTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns smart time data on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseSmartTime, status: 200 });

    const result = await getSmartTime();
    expect(result).toEqual(baseSmartTime);
    expect(apiFetch).toHaveBeenCalledWith('/analytics/smart-time');
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Rate Limited', status: 429 });

    await expect(getSmartTime()).rejects.toThrow('Rate Limited');
  });
});

describe('getAnalyticsStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns overall stats on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseStats, status: 200 });

    const result = await getAnalyticsStats();
    expect(result).toEqual(baseStats);
    expect(apiFetch).toHaveBeenCalledWith('/analytics/stats');
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Down', status: 503 });

    await expect(getAnalyticsStats()).rejects.toThrow('Down');
  });
});

describe('getFlowAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns flow analytics on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseFlowAnalytics, status: 200 });

    const result = await getFlowAnalytics('f1');
    expect(result).toEqual(baseFlowAnalytics);
    expect(apiFetch).toHaveBeenCalledWith('/analytics/flow/f1');
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Flow not found', status: 404 });

    await expect(getFlowAnalytics('missing')).rejects.toThrow('Flow not found');
  });
});

describe('getAnalyticsFullReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns full report on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseFullReport, status: 200 });

    const result = await getAnalyticsFullReport();
    expect(result).toEqual(baseFullReport);
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/analytics/reports'));
  });

  it('passes period and date params', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseFullReport, status: 200 });

    await getAnalyticsFullReport({ period: '7d', startDate: '2026-01-01', endDate: '2026-01-07' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('period=7d'));
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('startDate=2026-01-01'));
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('endDate=2026-01-07'));
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Bad Request', status: 400 });

    await expect(getAnalyticsFullReport()).rejects.toThrow('Bad Request');
  });
});
