import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    message: {
      count: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    contact: {
      count: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    flow: { findUnique: jest.Mock };
    flowExecution: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
    conversation: { count: jest.Mock };
    product: { count: jest.Mock };
    kloelSale: { findMany: jest.Mock };
    kloelLead: { count: jest.Mock };
    kloelWallet: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      message: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      contact: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      flow: { findUnique: jest.fn() },
      flowExecution: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversation: { count: jest.fn().mockResolvedValue(0) },
      product: { count: jest.fn().mockResolvedValue(0) },
      kloelSale: { findMany: jest.fn().mockResolvedValue([]) },
      kloelLead: { count: jest.fn().mockResolvedValue(0) },
      kloelWallet: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getDashboardStats', () => {
    it('returns zeroed stats when workspace has no data', async () => {
      const result = await service.getDashboardStats('ws-1');

      expect(result.messages).toBe(0);
      expect(result.contacts).toBe(0);
      expect(result.flows).toBe(0);
      expect(result.flowCompleted).toBe(0);
      expect(result.deliveryRate).toBe(0);
      expect(result.readRate).toBe(0);
      expect(result.errorRate).toBe(0);
      expect(result.sentiment).toEqual({ positive: 0, negative: 0, neutral: 0 });
      expect(result.leadScore).toEqual({ high: 0, medium: 0, low: 0 });
    });

    it('aggregates sentiment counts correctly', async () => {
      prisma.contact.groupBy.mockResolvedValue([
        { sentiment: 'POSITIVE', _count: { sentiment: 10 } },
        { sentiment: 'NEGATIVE', _count: { sentiment: 5 } },
        { sentiment: 'NEUTRAL', _count: { sentiment: 3 } },
      ]);
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.message.groupBy
        .mockResolvedValueOnce([]) // flowExecs
        .mockResolvedValueOnce([]); // outboundStatus

      const result = await service.getDashboardStats('ws-1');

      expect(result.sentiment).toEqual({ positive: 10, negative: 5, neutral: 3 });
    });

    it('buckets lead scores into high/medium/low', async () => {
      prisma.contact.findMany.mockResolvedValue([
        { leadScore: 90 },
        { leadScore: 75 },
        { leadScore: 50 },
        { leadScore: 35 },
        { leadScore: 10 },
      ]);

      const result = await service.getDashboardStats('ws-1');

      expect(result.leadScore).toEqual({ high: 2, medium: 2, low: 1 });
    });

    it('computes delivery, read and error rates from outbound status', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.message.groupBy.mockResolvedValue([
        { status: 'DELIVERED', _count: { status: 80 } },
        { status: 'READ', _count: { status: 50 } },
        { status: 'FAILED', _count: { status: 10 } },
        { status: 'SENT', _count: { status: 20 } },
      ]);

      const result = await service.getDashboardStats('ws-1');

      expect(result.deliveryRate).toBeGreaterThan(0);
      expect(result.readRate).toBeGreaterThan(0);
      expect(result.errorRate).toBeGreaterThan(0);
    });

    it('includes SENT in delivered count alongside DELIVERED', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.message.groupBy.mockResolvedValue([{ status: 'SENT', _count: { status: 100 } }]);

      const result = await service.getDashboardStats('ws-1');

      expect(result.deliveryRate).toBe(100);
    });
  });

  describe('getDailyActivity', () => {
    it('returns empty activity entries for all 7 days', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      const result = await service.getDailyActivity('ws-1');

      expect(result).toHaveLength(7);
      for (const day of result) {
        expect(day.inbound).toBe(0);
        expect(day.outbound).toBe(0);
      }
    });

    it('counts inbound and outbound messages per day', async () => {
      const today = new Date();
      today.setHours(10, 0, 0, 0);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      prisma.message.findMany.mockResolvedValue([
        { createdAt: today, direction: 'INBOUND' },
        { createdAt: today, direction: 'INBOUND' },
        { createdAt: today, direction: 'OUTBOUND' },
        { createdAt: yesterday, direction: 'INBOUND' },
      ]);

      const result = await service.getDailyActivity('ws-1');

      const todayKey = today.toISOString().split('T')[0];
      const todayEntry = result.find((d) => d.date === todayKey);
      expect(todayEntry).toBeDefined();
      expect(todayEntry!.inbound).toBe(2);
      expect(todayEntry!.outbound).toBe(1);
    });
  });

  describe('getFlowStats', () => {
    it('throws when flow does not belong to workspace', async () => {
      prisma.flow.findUnique.mockResolvedValue({ workspaceId: 'other-ws' });

      await expect(service.getFlowStats('ws-1', 'flow-1')).rejects.toThrow(
        'Fluxo não encontrado no workspace',
      );
    });

    it('returns conversion rate and node visits for existing flow', async () => {
      prisma.flow.findUnique.mockResolvedValue({
        id: 'flow-1',
        workspaceId: 'ws-1',
      });
      prisma.flowExecution.findMany.mockResolvedValue([
        {
          status: 'COMPLETED',
          logs: [{ nodeId: 'n1' }, { nodeId: 'n2' }],
          createdAt: new Date(),
        },
        {
          status: 'FAILED',
          logs: [{ nodeId: 'n1' }],
          createdAt: new Date(),
        },
      ]);

      const result = await service.getFlowStats('ws-1', 'flow-1');

      expect(result.total).toBe(2);
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.conversionRate).toBe(50);
      expect(result.nodeVisits).toEqual({ n1: 2, n2: 1 });
    });

    it('handles numeric nodeId in logs', async () => {
      prisma.flow.findUnique.mockResolvedValue({
        id: 'flow-1',
        workspaceId: 'ws-1',
      });
      prisma.flowExecution.findMany.mockResolvedValue([
        {
          status: 'COMPLETED',
          logs: [{ nodeId: 42 }],
          createdAt: new Date(),
        },
      ]);

      const result = await service.getFlowStats('ws-1', 'flow-1');

      expect(result.nodeVisits).toEqual({ '42': 1 });
    });
  });

  describe('getAIReport', () => {
    it('returns default AI report structure', async () => {
      const result = await service.getAIReport('ws-1');

      expect(result).toHaveProperty('messagesProcessed');
      expect(result).toHaveProperty('avgResponseTime');
      expect(result).toHaveProperty('activeConversations');
      expect(result).toHaveProperty('resolutionRate');
      expect(result).toHaveProperty('csat');
      expect(result).toHaveProperty('productsLoaded');
      expect(result.resolutionRate).toBe(94);
      expect(result.avgResponseTime).toBe('2.8s');
      expect(result.csat).toBe(4.7);
    });
  });

  describe('getFullReport', () => {
    it('returns full report structure with period info', async () => {
      prisma.kloelSale.findMany
        .mockResolvedValueOnce([]) // sales
        .mockResolvedValueOnce([]); // prevSales
      prisma.kloelLead.count
        .mockResolvedValueOnce(0) // leads
        .mockResolvedValueOnce(0) // prevLeads
        .mockResolvedValueOnce(0) // qualified
        .mockResolvedValueOnce(0); // converted
      prisma.contact.count.mockResolvedValue(0);

      const result = await service.getFullReport('ws-1', '7d');

      expect(result.period).toBe('7d');
      expect(result.kpi).toBeDefined();
      expect(result.kpi.totalRevenue).toBe(0);
      expect(result.revenueChart).toBeDefined();
      expect(result.topProducts).toEqual([]);
      expect(result.funnel).toBeDefined();
      expect(result.paymentMethods).toEqual([]);
    });

    it('computes revenue trend correctly with paid sales', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      prisma.kloelSale.findMany
        .mockResolvedValueOnce([
          {
            amount: 100,
            status: 'paid',
            paymentMethod: 'PIX',
            productName: 'Prod A',
            createdAt: now,
          },
        ])
        .mockResolvedValueOnce([
          {
            amount: 50,
            status: 'paid',
            paymentMethod: null,
            productName: null,
            createdAt: yesterday,
          },
        ]);
      prisma.kloelLead.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.contact.count.mockResolvedValue(100);

      const result = await service.getFullReport('ws-1', '7d');

      expect(result.kpi.totalRevenue).toBe(100);
      expect(result.kpi.totalSales).toBe(1);
      expect(result.paymentMethods).toHaveLength(1);
      expect(result.paymentMethods[0].method).toBe('PIX');
    });
  });
});
