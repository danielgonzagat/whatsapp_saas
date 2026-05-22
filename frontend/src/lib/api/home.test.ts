import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDashboardHome,
  getDashboardPostPayment,
  DashboardHomeResponse,
  DashboardPostPaymentResponse,
} from './home';

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

const baseHomeResponse: DashboardHomeResponse = {
  generatedAt: '2026-01-01T00:00:00Z',
  range: {
    period: '30d',
    label: 'Last 30 days',
    startDate: '2025-12-01',
    endDate: '2026-01-01',
  },
  hero: {
    totalRevenueInCents: 150000,
    previousRevenueInCents: 120000,
    revenueDeltaPct: 25,
    monthRevenueInCents: 50000,
    previousMonthRevenueInCents: 40000,
    todayRevenueInCents: 2000,
    yesterdayRevenueInCents: 1800,
    availableBalanceInCents: 100000,
    pendingBalanceInCents: 50000,
  },
  metrics: {
    paidOrders: 30,
    totalOrders: 35,
    conversionRatePct: 85.7,
    averageTicketInCents: 5000,
    totalConversations: 120,
    convertedOrders: 28,
    waitingForHuman: 3,
    averageResponseTimeSeconds: 45,
  },
  series: {
    labels: ['2025-12-01', '2026-01-01'],
    revenueInCents: [5000, 2000],
    previousRevenueInCents: [4000, 1800],
    paidOrders: [2, 1],
    totalOrders: [3, 2],
    conversionRatePct: [66, 50],
    averageTicketInCents: [2500, 2000],
  },
  products: [
    { id: 'p1', name: 'Widget', status: 'active', category: null, imageUrl: null, totalRevenueInCents: 10000, totalSales: 5, isTop: true },
  ],
  recentConversations: [
    { id: 'c1', contactName: 'Alice', contactPhone: '+5511999999999', avatarUrl: null, preview: 'Hello!', lastMessageAt: '2026-01-01T00:00:00Z', status: 'ai', unreadCount: 0 },
  ],
  health: {
    operationalScorePct: 95,
    checkoutCompletionRatePct: 80,
    activeCheckpoints: 2,
    totalCheckpoints: 3,
    checkpoints: [{ id: 'ch1', label: 'Payment', description: 'Check payment', active: true }],
  },
};

const basePostPaymentResponse: DashboardPostPaymentResponse = {
  generatedAt: '2026-01-01T00:00:00Z',
  payments: { approved: 10, failed: 1 },
  orders: { paid: 8, processing: 2 },
  memberAccess: { activeEnrollments: 15, grants: 20 },
  notifications: { purchaseEmailsSent: 10, whatsappEnqueued: 8, whatsappSkipped: 2 },
  tracking: { facebookCapiPurchases: 5, convertedSocialLeads: 3 },
  affiliateCommissions: { created: 2, totalInCents: 500 },
  recentEvents: [{ id: 'ev1', action: 'payment.created', resource: 'payment', resourceId: 'pmt1', createdAt: '2026-01-01T00:00:00Z' }],
};

describe('getDashboardHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns home data on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseHomeResponse, status: 200 });

    const result = await getDashboardHome();
    expect(result).toEqual(baseHomeResponse);
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/dashboard/home'));
  });

  it('passes period param', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseHomeResponse, status: 200 });

    await getDashboardHome({ period: 'today' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('period=today'));
  });

  it('passes date range params', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseHomeResponse, status: 200 });

    await getDashboardHome({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('startDate=2026-01-01'));
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('endDate=2026-01-31'));
  });

  it('omits undefined params', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseHomeResponse, status: 200 });

    await getDashboardHome({ period: '30d' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('period=30d'));
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('startDate'));
  });

  it('throws when the API returns an error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Forbidden', status: 403 });

    await expect(getDashboardHome()).rejects.toThrow('Forbidden');
  });
});

describe('getDashboardPostPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns post-payment data on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: basePostPaymentResponse, status: 200 });

    const result = await getDashboardPostPayment();
    expect(result).toEqual(basePostPaymentResponse);
    expect(apiFetch).toHaveBeenCalledWith('/dashboard/post-payment');
  });

  it('throws when the API returns an error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Internal Server Error', status: 500 });

    await expect(getDashboardPostPayment()).rejects.toThrow('Internal Server Error');
  });
});
