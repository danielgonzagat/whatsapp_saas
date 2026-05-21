import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AutopilotAnalyticsService } from './autopilot-analytics.service';
import { AutopilotAnalyticsInsightsService } from './autopilot-analytics-insights.service';
import { AutopilotAnalyticsReportService } from './autopilot-analytics-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { type FlexMock } from '../../test/helpers/prisma.mock';
;

describe('AutopilotAnalyticsService', () => {
  let service: AutopilotAnalyticsService;

  type MockedPrisma = {
    workspace: { findUnique: FlexMock };
    autopilotEvent: { findMany: FlexMock };
    contact: { findMany: FlexMock };
  };

  const mockPrisma: MockedPrisma = {
    workspace: { findUnique: jest.fn() as FlexMock },
    autopilotEvent: { findMany: jest.fn() as FlexMock },
    contact: { findMany: jest.fn() as FlexMock },
  };

  const mockReport = {
    getMoneyReport: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    getRevenueEvents: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    getRecentActions: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    serializeRecentAction: jest.fn<(...args: unknown[]) => unknown>(),
  };

  const mockInsights = {
    getImpact: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    getInsights: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    askInsights: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AutopilotAnalyticsReportService, useValue: mockReport },
        { provide: AutopilotAnalyticsInsightsService, useValue: mockInsights },
      ],
    }).compile();
    service = module.get<AutopilotAnalyticsService>(AutopilotAnalyticsService);
  });

  describe('getStats', () => {
    const baseWorkspace = {
      id: 'ws-1',
      providerSettings: { autopilot: { enabled: true }, billingSuspended: false },
    };

    it('returns enabled true when providerSettings.autopilot.enabled is set', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.enabled).toBe(true);
      expect(result.billingSuspended).toBe(false);
      expect(result.actionsLast7d).toBe(0);
      expect(result.errorsLast7d).toBe(0);
    });

    it('returns enabled false when autopilot.enabled is absent', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: {},
      });
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.enabled).toBe(false);
    });

    it('detects billingSuspended', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { billingSuspended: true },
      });
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.billingSuspended).toBe(true);
    });

    it('accumulates events by type and status', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-05-10T10:00:00Z'),
          action: 'SEND_OFFER',
          status: 'executed',
          reason: null,
          meta: null,
        },
        {
          createdAt: new Date('2026-05-10T11:00:00Z'),
          action: 'SEND_OFFER',
          status: 'error',
          reason: 'waha_timeout',
          meta: null,
        },
        {
          createdAt: new Date('2026-05-11T10:00:00Z'),
          action: 'CONVERSION',
          status: 'executed',
          reason: null,
          meta: { amount: 199.9 },
        },
        {
          createdAt: new Date('2026-05-11T12:00:00Z'),
          action: 'AI_CHAT',
          status: 'skipped',
          reason: 'optin_not_confirmed',
          meta: null,
        },
        {
          createdAt: new Date('2026-05-11T13:00:00Z'),
          action: 'FOLLOW_UP',
          status: 'skipped',
          reason: '24h_window_violation',
          meta: null,
        },
        {
          createdAt: new Date('2026-05-11T14:00:00Z'),
          action: 'SEND_PRICE',
          status: 'scheduled',
          reason: null,
          meta: { nextRetryAt: '2026-05-12T08:00:00Z' },
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);

      const result = await service.getStats('ws-1');

      expect(result.contactsTracked).toBe(2);
      expect(result.actionsLast7d).toBe(6);
      expect(result.actionsByType.SEND_OFFER).toBe(2);
      expect(result.actionsByType.CONVERSION).toBe(1);
      expect(result.errorsLast7d).toBe(1);
      expect(result.errorReasons.waha_timeout).toBe(1);
      expect(result.conversionsLast7d).toBe(1);
      expect(result.conversionsAmountLast7d).toBe(199.9);
      expect(result.skippedTotal).toBe(2);
      expect(result.skippedOptin).toBe(1);
      expect(result.skipped24h).toBe(1);
      expect(result.scheduledCount).toBe(1);
      expect(result.nextRetryAt).toBe('2026-05-12T08:00:00Z');
      expect(result.timeline).toEqual({
        '2026-05-10': 2,
        '2026-05-11': 4,
      });
    });

    it('sets lastActionAt to most recent event', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-05-10T10:00:00Z'),
          action: 'OLD',
          status: 'executed',
          reason: null,
          meta: null,
        },
        {
          createdAt: new Date('2026-05-11T10:00:00Z'),
          action: 'NEW',
          status: 'executed',
          reason: null,
          meta: null,
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.lastActionAt).toBe('2026-05-11T10:00:00.000Z');
    });

    it('sets lastErrorAt to most recent error', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-05-10T08:00:00Z'),
          action: 'X',
          status: 'error',
          reason: 'old_err',
          meta: null,
        },
        {
          createdAt: new Date('2026-05-10T09:00:00Z'),
          action: 'Y',
          status: 'error',
          reason: 'new_err',
          meta: null,
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.lastErrorAt).toBe('2026-05-10T09:00:00.000Z');
      expect(result.errorReasons.old_err).toBe(1);
      expect(result.errorReasons.new_err).toBe(1);
    });

    it('sets lastConversionAt to most recent conversion', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date('2026-05-09T10:00:00Z'),
          action: 'CONVERSION',
          status: 'executed',
          reason: null,
          meta: { amount: 100 },
        },
        {
          createdAt: new Date('2026-05-10T10:00:00Z'),
          action: 'CONVERSION',
          status: 'executed',
          reason: null,
          meta: { amount: 200 },
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.lastConversionAt).toBe('2026-05-10T10:00:00.000Z');
      expect(result.conversionsLast7d).toBe(2);
      expect(result.conversionsAmountLast7d).toBe(300);
    });

    it('handles UNKNOWN action when action is null', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { createdAt: new Date(), action: null, status: 'executed', reason: null, meta: null },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.actionsByType.UNKNOWN).toBe(1);
    });

    it('skips nextRetryAt update when scheduled meta has no valid date', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          createdAt: new Date(),
          action: 'X',
          status: 'scheduled',
          reason: null,
          meta: { nextRetryAt: '' },
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      const result = await service.getStats('ws-1');

      expect(result.scheduledCount).toBe(1);
      expect(result.nextRetryAt).toBeNull();
    });

    it('respects workspace isolation', async () => {
      const ws = 'ws-isolated';
      mockPrisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);

      await service.getStats(ws);

      expect(mockPrisma.workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ws } }),
      );
      expect(mockPrisma.autopilotEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: ws }) }),
      );
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: ws } }),
      );
    });
  });

  describe('delegation methods', () => {
    it('getImpact delegates to insights service', async () => {
      const expected = { workspaceId: 'ws-1', replyRate: 0.5 };
      mockInsights.getImpact.mockResolvedValue(expected);

      const result = await service.getImpact('ws-1');

      expect(result).toBe(expected);
      expect(mockInsights.getImpact).toHaveBeenCalledWith('ws-1');
    });

    it('getInsights delegates to insights service', async () => {
      const expected = { workspaceId: 'ws-1', executed: 10, errors: 2 };
      mockInsights.getInsights.mockResolvedValue(expected);

      const result = await service.getInsights('ws-1');

      expect(result).toBe(expected);
      expect(mockInsights.getInsights).toHaveBeenCalledWith('ws-1');
    });

    it('askInsights delegates to insights service', async () => {
      const expected = { answer: 'OK', detail: {} };
      mockInsights.askInsights.mockResolvedValue(expected);

      const result = await service.askInsights('ws-1', 'How many deals?');

      expect(result).toBe(expected);
      expect(mockInsights.askInsights).toHaveBeenCalledWith('ws-1', 'How many deals?');
    });

    it('getMoneyReport delegates to report service', async () => {
      const expected = {
        campaigns: [],
        summary: { revenueFromDeals: 0, revenueFromInvoices: 0, conversionsLast7d: 0 },
      };
      mockReport.getMoneyReport.mockResolvedValue(expected);

      const result = await service.getMoneyReport('ws-1');

      expect(result).toBe(expected);
      expect(mockReport.getMoneyReport).toHaveBeenCalledWith('ws-1');
    });

    it('getRevenueEvents delegates to report service with limit', async () => {
      const expected = { events: [], totalRevenue: 0, totalDeals: 0 };
      mockReport.getRevenueEvents.mockResolvedValue(expected);

      const result = await service.getRevenueEvents('ws-1', 10);

      expect(result).toBe(expected);
      expect(mockReport.getRevenueEvents).toHaveBeenCalledWith('ws-1', 10);
    });

    it('getRecentActions delegates to report service with optional status', async () => {
      const expected = [{ action: 'SEND' }];
      mockReport.getRecentActions.mockResolvedValue(expected);

      const result = await service.getRecentActions('ws-1', 30, 'error');

      expect(result).toBe(expected);
      expect(mockReport.getRecentActions).toHaveBeenCalledWith('ws-1', 30, 'error');
    });

    it('serializeRecentAction delegates to report service', () => {
      const event = {
        createdAt: new Date(),
        contactId: 'c-1',
        intent: 'X',
        action: 'Y',
        status: 'ok',
        reason: '',
        meta: null,
      };
      type ContactMap = Map<
        string,
        { id: string; phone: string | null; name: string | null; customFields: unknown }
      >;
      const contactMap: ContactMap = new Map();
      const expected = { contact: 'João' };
      mockReport.serializeRecentAction.mockReturnValue(expected);

      const result = service.serializeRecentAction(event, contactMap);

      expect(result).toBe(expected);
      expect(mockReport.serializeRecentAction).toHaveBeenCalledWith(event, contactMap);
    });
  });
});
