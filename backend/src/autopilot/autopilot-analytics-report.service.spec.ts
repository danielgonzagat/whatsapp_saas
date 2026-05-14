import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AutopilotAnalyticsReportService } from './autopilot-analytics-report.service';
import { PrismaService } from '../prisma/prisma.service';

type FlexMock = jest.Mock & {
  mockResolvedValue: (v: unknown) => FlexMock;
  mockResolvedValueOnce: (v: unknown) => FlexMock;
  mockRejectedValue: (err: unknown) => FlexMock;
  mockRejectedValueOnce: (err: unknown) => FlexMock;
};

jest.mock('../common/async-sequence', () => ({
  forEachSequential: jest.fn(async <T>(arr: T[], fn: (item: T) => Promise<void>) => {
    for (const item of arr) {
      await fn(item);
    }
  }),
}));

describe('AutopilotAnalyticsReportService', () => {
  let service: AutopilotAnalyticsReportService;

  type MockedPrisma = {
    campaign: { findMany: FlexMock };
    deal: { findMany: FlexMock; aggregate: FlexMock };
    invoice: { findMany: FlexMock };
    autopilotEvent: { count: FlexMock; findMany: FlexMock };
    contact: { findMany: FlexMock };
  };

  const mockPrisma: MockedPrisma = {
    campaign: { findMany: jest.fn() as FlexMock },
    deal: { findMany: jest.fn() as FlexMock, aggregate: jest.fn() as FlexMock },
    invoice: { findMany: jest.fn() as FlexMock },
    autopilotEvent: { count: jest.fn() as FlexMock, findMany: jest.fn() as FlexMock },
    contact: { findMany: jest.fn() as FlexMock },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotAnalyticsReportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AutopilotAnalyticsReportService>(AutopilotAnalyticsReportService);
  });

  describe('getMoneyReport', () => {
    it('returns campaign rows with revenue from deals and invoices', async () => {
      const campId = 'camp-1';
      mockPrisma.campaign.findMany.mockResolvedValue([
        {
          id: campId,
          name: 'Camp 1',
          status: 'ACTIVE',
          createdAt: new Date('2026-05-10'),
          filters: {},
        },
      ]);
      mockPrisma.deal.findMany.mockResolvedValue([{ value: 199.9 }, { value: 99.9 }]);
      mockPrisma.invoice.findMany.mockResolvedValue([{ amount: 50.0 }]);
      mockPrisma.autopilotEvent.count.mockResolvedValue(3);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 150.0 }, _count: { id: 2 } });

      const result = await service.getMoneyReport('ws-1');

      expect(mockPrisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
      );
      expect(result.summary.revenueFromDeals).toBe(299.8);
      expect(result.summary.revenueFromInvoices).toBe(50);
      expect(result.summary.conversionsLast7d).toBe(3);
      expect(result.campaigns).toHaveLength(1);
      expect(result.campaigns[0]).toEqual(
        expect.objectContaining({ id: campId, revenue: 150, deals: 2 }),
      );
    });

    it('returns empty campaigns array when none found', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([]);
      mockPrisma.deal.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.count.mockResolvedValue(0);

      const result = await service.getMoneyReport('ws-1');

      expect(result.campaigns).toHaveLength(0);
      expect(result.summary.revenueFromDeals).toBe(0);
    });

    it('derives revenue from event meta when deal aggregate is zero', async () => {
      const campId = 'camp-2';
      mockPrisma.campaign.findMany.mockResolvedValue([
        { id: campId, name: 'Event Camp', status: 'ACTIVE', createdAt: new Date(), filters: {} },
      ]);
      mockPrisma.deal.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.count.mockResolvedValue(0);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          meta: { campaignId: campId, value: 99.0 },
        },
      ]);

      const result = await service.getMoneyReport('ws-1');

      expect(result.campaigns[0].deals).toBe(1);
      expect(result.campaigns[0].revenue).toBe(99);
    });

    it('falls back to contact-based aggregation when deal and event both empty', async () => {
      const campId = 'camp-3';
      mockPrisma.campaign.findMany.mockResolvedValue([
        {
          id: campId,
          name: 'Fallback Camp',
          status: 'ACTIVE',
          createdAt: new Date(),
          filters: { phones: ['5511'] },
        },
      ]);
      mockPrisma.deal.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.count.mockResolvedValue(0);
      mockPrisma.contact.findMany
        .mockResolvedValueOnce([{ id: 'c-1' }])
        .mockResolvedValueOnce([{ id: 'c-1' }]);
      mockPrisma.deal.aggregate
        .mockResolvedValueOnce({ _sum: { value: 0 }, _count: { id: 0 } })
        .mockResolvedValueOnce({ _sum: { value: 250.0 }, _count: { id: 3 } });
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);

      const result = await service.getMoneyReport('ws-1');

      expect(result.campaigns[0].revenue).toBe(250);
      expect(result.campaigns[0].deals).toBe(3);
    });

    it('respects workspace isolation in all Prisma queries', async () => {
      const ws = 'ws-isolated';
      mockPrisma.campaign.findMany.mockResolvedValue([]);
      mockPrisma.deal.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.autopilotEvent.count.mockResolvedValue(0);

      await service.getMoneyReport(ws);

      const campaignArgs = mockPrisma.campaign.findMany.mock.calls[0][0];
      expect(campaignArgs.where).toEqual({
        workspaceId: ws,
        createdAt: campaignArgs.where.createdAt,
      });
      expect(campaignArgs.where.createdAt).toBeDefined();
      expect(mockPrisma.deal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ contact: { workspaceId: ws } }),
        }),
      );
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: ws }) }),
      );
    });
  });

  describe('getRevenueEvents', () => {
    it('returns events from autopilotEvent table', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-05-10'),
          action: 'DEAL_WON',
          meta: { campaignId: 'cp-1', value: 199.0 },
        },
      ]);

      const result = await service.getRevenueEvents('ws-1');

      expect(result.events).toHaveLength(1);
      expect(result.events[0].value).toBe(199);
      expect(result.events[0].action).toBe('DEAL_WON');
      expect(result.totalRevenue).toBe(199);
      expect(result.totalDeals).toBe(1);
    });

    it('falls back to deal table when autopilotEvent is empty', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.deal.findMany.mockResolvedValue([
        {
          updatedAt: new Date('2026-05-09'),
          value: 300,
          stage: { pipeline: 'default' },
        },
      ]);

      const result = await service.getRevenueEvents('ws-1');

      expect(result.events).toHaveLength(1);
      expect(result.events[0].action).toBe('DEAL_WON');
      expect(result.events[0].source).toBe('deal');
      expect(result.totalRevenue).toBe(300);
    });

    it('handles autopilotEvent table error gracefully', async () => {
      mockPrisma.autopilotEvent.findMany.mockRejectedValue(new Error('table missing'));
      mockPrisma.deal.findMany.mockResolvedValue([]);

      const result = await service.getRevenueEvents('ws-1');

      expect(result.events).toHaveLength(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.totalDeals).toBe(0);
    });

    it('respects the limit parameter', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.deal.findMany.mockResolvedValue([]);

      await service.getRevenueEvents('ws-1', 50);

      expect(mockPrisma.autopilotEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('clamps limit to valid range', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.deal.findMany.mockResolvedValue([]);

      await service.getRevenueEvents('ws-1', 1);
      expect(mockPrisma.autopilotEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );

      jest.clearAllMocks();
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.deal.findMany.mockResolvedValue([]);

      await service.getRevenueEvents('ws-1', 999);
      expect(mockPrisma.autopilotEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });

  describe('getRecentActions', () => {
    it('returns serialized events with contact enrichment', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-05-10T12:00:00Z'),
          contactId: 'c-1',
          intent: 'BUYING_INTENT',
          action: 'SEND_OFFER',
          status: 'executed',
          reason: 'high_buying_signal',
          meta: { confidence: 0.9 },
        },
      ]);
      mockPrisma.contact.findMany.mockReset();
      mockPrisma.contact.findMany.mockResolvedValueOnce([
        { id: 'c-1', phone: '5511999999999', name: 'João', customFields: null },
      ]);

      const result = await service.getRecentActions('ws-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          contact: 'João',
          action: 'SEND_OFFER',
          intent: 'BUYING_INTENT',
          status: 'executed',
          intentConfidence: 0.9,
        }),
      );
    });

    it('filters by status when provided', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      await service.getRecentActions('ws-1', 30, 'error');

      expect(mockPrisma.autopilotEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'error' }) }),
      );
    });

    it('uses contact phone when name is null', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date(),
          contactId: 'c-2',
          intent: null,
          action: null,
          status: null,
          reason: null,
          meta: null,
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c-2', phone: '5511888888888', name: null, customFields: null },
      ]);

      const result = await service.getRecentActions('ws-1');

      expect(result[0].contact).toBe('5511888888888');
      expect(result[0].contactPhone).toBe('5511888888888');
    });

    it('falls back to contactId when contact not in map', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date(),
          contactId: 'c-orphan',
          intent: 'GREETING',
          action: 'AI_CHAT',
          status: 'executed',
          reason: 'greeting',
          meta: null,
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getRecentActions('ws-1');

      expect(result[0].contact).toBe('c-orphan');
    });

    it('propagates Prisma error', async () => {
      mockPrisma.autopilotEvent.findMany.mockRejectedValue(new Error('DB down'));

      await expect(service.getRecentActions('ws-1')).rejects.toThrow('DB down');
    });

    it('returns empty array when no events found', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getRecentActions('ws-1');

      expect(result).toEqual([]);
    });
  });

  describe('serializeRecentAction', () => {
    it('maps event fields correctly', () => {
      type ContactMap = Map<
        string,
        { id: string; phone: string | null; name: string | null; customFields: unknown }
      >;
      const contactMap: ContactMap = new Map();
      contactMap.set('c-1', {
        id: 'c-1',
        phone: '5511',
        name: 'Maria',
        customFields: null,
      });

      const result = service.serializeRecentAction(
        {
          createdAt: new Date('2026-05-10'),
          contactId: 'c-1',
          intent: 'BUYING',
          action: 'SEND_OFFER',
          status: 'executed',
          reason: 'signal',
          meta: { confidence: 0.95 },
        },
        contactMap,
      );

      expect(result.contact).toBe('Maria');
      expect(result.intent).toBe('BUYING');
      expect(result.status).toBe('executed');
      expect(result.intentConfidence).toBe(0.95);
    });

    it('handles null and missing fields', () => {
      type ContactMap2 = Map<
        string,
        { id: string; phone: string | null; name: string | null; customFields: unknown }
      >;
      const result = service.serializeRecentAction(
        {
          createdAt: new Date(),
          contactId: null,
          intent: null,
          action: null,
          status: null,
          reason: null,
          meta: null,
        },
        new Map() as ContactMap2,
      );

      expect(result.intent).toBe('UNKNOWN');
      expect(result.action).toBe('UNKNOWN');
      expect(result.status).toBe('executed');
      expect(result.reason).toBe('');
      expect(result.intentConfidence).toBeNull();
    });

    it('extracts nextRetryAt from customFields', () => {
      type ContactMap3 = Map<
        string,
        { id: string; phone: string | null; name: string | null; customFields: unknown }
      >;
      const contactMap: ContactMap3 = new Map();
      contactMap.set('c-1', {
        id: 'c-1',
        phone: '5511',
        name: 'X',
        customFields: { autopilotNextRetryAt: '2026-06-01T00:00:00Z' },
      });

      const result = service.serializeRecentAction(
        {
          createdAt: new Date(),
          contactId: 'c-1',
          intent: null,
          action: null,
          status: null,
          reason: null,
          meta: null,
        },
        contactMap,
      );

      expect(result.nextRetryAt).toBe('2026-06-01T00:00:00Z');
    });
  });
});
