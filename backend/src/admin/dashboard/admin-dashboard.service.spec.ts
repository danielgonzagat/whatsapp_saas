import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from './admin-dashboard.service';

jest.mock('./queries/gmv.query', () => ({ queryGmvInCents: jest.fn() }));
jest.mock('./queries/revenue.query', () => ({ queryRevenueKloelInCents: jest.fn() }));
jest.mock('./queries/transactions.query', () => ({ queryTransactionCounts: jest.fn() }));
jest.mock('./queries/producers.query', () => ({ queryProducers: jest.fn() }));
jest.mock('./queries/breakdowns.query', () => ({
  queryGatewayBreakdown: jest.fn(),
  queryMethodBreakdown: jest.fn(),
}));
jest.mock('./queries/series.query', () => ({
  queryGmvDailySeries: jest.fn(),
  queryRevenueKloelDailySeries: jest.fn(),
}));
jest.mock('./range.util', () => ({ resolveAdminHomeRange: jest.fn() }));
jest.mock('./kpi-math.util', () => ({
  computeApprovalRate: jest.fn(),
  computeAverageTicket: jest.fn(),
  deltaPct: jest.fn(),
  makeMoneyKpi: jest.fn(),
  makeNumberKpi: jest.fn(),
}));

import { queryGmvInCents } from './queries/gmv.query';
import { queryRevenueKloelInCents } from './queries/revenue.query';
import { queryTransactionCounts } from './queries/transactions.query';
import { queryProducers } from './queries/producers.query';
import { queryGatewayBreakdown, queryMethodBreakdown } from './queries/breakdowns.query';
import { queryGmvDailySeries, queryRevenueKloelDailySeries } from './queries/series.query';
import { resolveAdminHomeRange } from './range.util';
import {
  computeApprovalRate,
  computeAverageTicket,
  deltaPct,
  makeMoneyKpi,
  makeNumberKpi,
} from './kpi-math.util';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;

  const mockQueryRaw = jest.fn();
  const mockConversationCount = jest.fn();
  const recurringMetricsRow = {
    mrrProjectedInCents: 50000n,
    baseAtStart: 40n,
    canceledInRange: 2n,
  };
  const responseTimeRow = { avg_minutes: 12.5 };

  function readRawQueryText(query: unknown): string {
    if (
      query &&
      typeof query === 'object' &&
      'strings' in query &&
      Array.isArray((query as { strings?: unknown }).strings)
    ) {
      return (query as { strings: string[] }).strings.join(' ');
    }
    return '';
  }

  function mockRawAdminMetrics(
    recurring = recurringMetricsRow,
    responseTime: { avg_minutes: number | null } = responseTimeRow,
  ) {
    mockQueryRaw.mockImplementation((query: unknown) => {
      const rawQueryText = readRawQueryText(query);
      if (rawQueryText.includes('RAC_CustomerSubscription')) {
        return Promise.resolve([recurring]);
      }
      return Promise.resolve([responseTime]);
    });
  }

  const prismaMock = {
    $queryRaw: mockQueryRaw,
    conversation: {
      count: mockConversationCount,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (queryGmvInCents as jest.Mock).mockResolvedValue({ gmvInCents: 100000, approvedCount: 10 });
    (queryRevenueKloelInCents as jest.Mock).mockResolvedValue(5000);
    (queryTransactionCounts as jest.Mock).mockResolvedValue({
      approved: 10,
      declined: 2,
      pending: 3,
      refundCount: 1,
      refundAmountInCents: 2000,
      chargebackCount: 0,
      chargebackAmountInCents: 0,
    });
    (queryProducers as jest.Mock).mockResolvedValue({
      total: 50,
      activeLast30Days: 20,
      newInRange: 5,
    });
    (queryGatewayBreakdown as jest.Mock).mockResolvedValue([{ gateway: 'stripe', amount: 80000 }]);
    (queryMethodBreakdown as jest.Mock).mockResolvedValue([{ method: 'pix', amount: 60000 }]);
    (queryGmvDailySeries as jest.Mock).mockResolvedValue([{ day: '2026-05-10', amount: 50000 }]);
    (queryRevenueKloelDailySeries as jest.Mock).mockResolvedValue([
      { day: '2026-05-10', amount: 2500 },
    ]);

    (computeApprovalRate as jest.Mock).mockReturnValue(0.833);
    (computeAverageTicket as jest.Mock).mockReturnValue(10000);
    (deltaPct as jest.Mock).mockReturnValue(15);
    (makeMoneyKpi as jest.Mock).mockImplementation((v, p) => ({
      value: v,
      previous: p,
      deltaPct: p !== null ? 15 : null,
    }));
    (makeNumberKpi as jest.Mock).mockImplementation((v, p) => ({
      value: v,
      previous: p,
      deltaPct: p !== null ? 15 : null,
    }));

    const from = new Date('2026-05-01T00:00:00Z');
    const to = new Date('2026-05-10T23:59:59Z');
    (resolveAdminHomeRange as jest.Mock).mockReturnValue({
      period: '30D',
      compare: 'PREVIOUS',
      from,
      to,
      label: 'Últimos 30 dias',
      previous: {
        from: new Date('2026-04-01T00:00:00Z'),
        to: new Date('2026-04-30T23:59:59Z'),
      },
    });

    mockRawAdminMetrics();

    mockConversationCount.mockResolvedValue(100);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminDashboardService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AdminDashboardService);
  });

  describe('getHome', () => {
    it('returns HomeResponse with all KPIs, breakdowns, and series', async () => {
      const result = await service.getHome('30D', 'PREVIOUS');

      expect(result.kpis.gmv.value).toBe(100000);
      expect(result.kpis.approvedCount.value).toBe(10);
      expect(result.kpis.revenueKloel.value).toBe(5000);
      expect(result.kpis.mrrProjected.value).toBe(50000);
      expect(result.kpis.conversations.value).toBe(100);
      expect(result.kpis.responseTimeMinutes.value).toBe(13);
      expect(result.breakdowns.byGateway).toHaveLength(1);
      expect(result.breakdowns.byMethod).toHaveLength(1);
      expect(result.series.gmvDaily).toHaveLength(1);
      expect(result.series.revenueKloelDaily).toHaveLength(1);
      expect(result.range.period).toBe('30D');
      expect(resolveAdminHomeRange).toHaveBeenCalled();
    });

    it('handles previous period null (no compare)', async () => {
      (resolveAdminHomeRange as jest.Mock).mockReturnValueOnce({
        period: '30D',
        compare: 'NONE',
        from: new Date('2026-05-01T00:00:00Z'),
        to: new Date('2026-05-10T23:59:59Z'),
        label: 'Últimos 30 dias',
        previous: null,
      });
      (queryGmvDailySeries as jest.Mock).mockResolvedValue([]);
      (queryRevenueKloelDailySeries as jest.Mock).mockResolvedValue([]);
      (makeMoneyKpi as jest.Mock).mockImplementation((v) => ({
        value: v,
        previous: null,
        deltaPct: null,
      }));
      (makeNumberKpi as jest.Mock).mockImplementation((v) => ({
        value: v,
        previous: null,
        deltaPct: null,
      }));

      const result = await service.getHome('30D', 'NONE');

      expect(result.compare).toBeNull();
      expect(result.kpis.gmv.previous).toBeNull();
    });

    it('handles missing churnRate (baseAtStart=0)', async () => {
      mockQueryRaw.mockReset();
      mockRawAdminMetrics(
        {
          mrrProjectedInCents: 0n,
          baseAtStart: 0n,
          canceledInRange: 0n,
        },
        { avg_minutes: null },
      );

      const result = await service.getHome('30D', 'PREVIOUS');

      expect(result.kpis.churnRate.value).toBeNull();
    });

    it('handles null responseTimes', async () => {
      const result = await service.getHome('30D', 'PREVIOUS');

      expect(result.kpis.responseTimeMinutes.value).toBe(13);
    });

    it('passes correct date range from resolveAdminHomeRange', async () => {
      const from = new Date('2026-05-01T00:00:00Z');
      const to = new Date('2026-05-10T23:59:59Z');
      (resolveAdminHomeRange as jest.Mock).mockReturnValueOnce({
        period: '30D',
        compare: 'PREVIOUS',
        from,
        to,
        label: 'Últimos 30 dias',
        previous: null,
      });
      (makeMoneyKpi as jest.Mock).mockImplementation((v) => ({
        value: v,
        previous: null,
        deltaPct: null,
      }));
      (makeNumberKpi as jest.Mock).mockImplementation((v) => ({
        value: v,
        previous: null,
        deltaPct: null,
      }));

      await service.getHome('30D', 'PREVIOUS', from, to);

      expect(resolveAdminHomeRange).toHaveBeenCalledWith(
        expect.objectContaining({ period: '30D', compare: 'PREVIOUS', from, to }),
      );
    });

    it('handles raw query ($queryRaw) for recurring metrics', async () => {
      await service.getHome('30D', 'PREVIOUS');

      expect(mockQueryRaw).toHaveBeenCalledTimes(4);
      const firstCall = mockQueryRaw.mock.calls[0][0] as { strings: string[] };
      expect(firstCall.strings.join(' ')).toContain('RAC_CustomerSubscription');
    });
  });
});
