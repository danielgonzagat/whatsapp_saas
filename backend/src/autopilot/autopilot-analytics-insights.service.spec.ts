import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AutopilotAnalyticsInsightsService } from './autopilot-analytics-insights.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { CANONICAL_MODEL_IDS } from '../lib/openai-models';
import { type FlexMock } from '../../test/helpers/prisma.mock';

jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn(),
}));

jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn(() => actual.CANONICAL_MODEL_IDS.openAiTextMock),
  };
});

jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    __mockOpenaiCreate: mockCreate,
  };
});

describe('AutopilotAnalyticsInsightsService', () => {
  let service: AutopilotAnalyticsInsightsService;

  type MockedPrisma = {
    autopilotEvent: {
      findMany: FlexMock;
      create: FlexMock;
      count: FlexMock;
      groupBy: FlexMock;
    };
    contact: { findMany: FlexMock };
    message: { findMany: FlexMock };
    deal: { aggregate: FlexMock };
    accountProofSnapshot: { findFirst: FlexMock };
    agentWorkItem: { count: FlexMock };
    mindPolicy: { aggregate: FlexMock; count: FlexMock };
  };

  const mockPrisma: MockedPrisma = {
    autopilotEvent: {
      findMany: jest.fn() as FlexMock,
      create: jest.fn() as FlexMock,
      count: jest.fn() as FlexMock,
      groupBy: jest.fn() as FlexMock,
    },
    contact: { findMany: jest.fn() as FlexMock },
    message: { findMany: jest.fn() as FlexMock },
    deal: { aggregate: jest.fn() as FlexMock },
    accountProofSnapshot: { findFirst: jest.fn().mockResolvedValue(null) as FlexMock },
    agentWorkItem: { count: jest.fn().mockResolvedValue(0) as FlexMock },
    mindPolicy: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _avg: { epsilon: null }, _count: { id: 0 } }) as FlexMock,
      count: jest.fn().mockResolvedValue(0) as FlexMock,
    },
  };

  const mockConfig = {
    get: jest.fn<() => unknown>(),
  };

  const mockPlanLimits = {
    ensureTokenBudget: jest
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    trackAiUsage: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
    mockPrisma.autopilotEvent.create.mockResolvedValue({} as never);
    mockPrisma.autopilotEvent.count.mockResolvedValue(0);
    mockPrisma.autopilotEvent.groupBy.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { id: 0 } });
    mockPrisma.accountProofSnapshot.findFirst.mockResolvedValue(null);
    mockPrisma.agentWorkItem.count.mockResolvedValue(0);
    mockPrisma.mindPolicy.aggregate.mockResolvedValue({
      _avg: { epsilon: null },
      _count: { id: 0 },
    });
    mockPrisma.mindPolicy.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotAnalyticsInsightsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PlanLimitsService, useValue: mockPlanLimits },
      ],
    }).compile();
    service = module.get<AutopilotAnalyticsInsightsService>(AutopilotAnalyticsInsightsService);
  });

  describe('getImpact', () => {
    it('computes reply rate and conversion rate from events and messages', async () => {
      const contactId = 'c-1';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId, createdAt: new Date('2026-05-10T10:00:00Z'), action: 'SEND_OFFER' },
        { contactId: 'c-2', createdAt: new Date('2026-05-10T11:00:00Z'), action: 'SEND_OFFER' },
        { contactId, createdAt: new Date('2026-05-11T10:00:00Z'), action: 'CONVERSION' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c-1', phone: '5511999999999', name: 'João' },
        { id: 'c-2', phone: '5511888888888', name: null },
      ]);
      mockPrisma.message.findMany
        .mockResolvedValueOnce([{ contactId, createdAt: new Date('2026-05-11T11:00:00Z') }])
        .mockResolvedValueOnce([]);

      const result = await service.getImpact('ws-1');

      expect(result.workspaceId).toBe('ws-1');
      expect(result.windowDays).toBe(7);
      expect(result.actionsAnalyzed).toBe(3);
      expect(result.repliedContacts).toBe(1);
      expect(result.totalReplies).toBe(1);
      expect(result.conversions).toBeGreaterThanOrEqual(1);
      expect(result.replyRate).toBeCloseTo(1 / 3, 2);
      expect(result.samples).toHaveLength(1);
    });

    it('returns zero rates when no events found', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(0);
      expect(result.repliedContacts).toBe(0);
      expect(result.replyRate).toBe(0);
      expect(result.conversions).toBe(0);
      expect(result.conversionRate).toBe(0);
      expect(result.samples).toEqual([]);
    });

    it('filters out events with null contactId from contactActions map', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId: null, createdAt: new Date(), action: 'SYSTEM' },
        { contactId: 'c-1', createdAt: new Date(), action: 'SEND_OFFER' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-1', phone: '5511', name: 'Maria' }]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(2);
      expect(result.samples).toHaveLength(0);
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['c-1'] } }) }),
      );
    });

    it('does not treat queued or recommended events as impactable actions', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        {
          contactId: 'c-queued',
          createdAt: new Date('2026-05-10T10:00:00Z'),
          action: 'ENQUEUED',
          status: 'queued',
        },
        {
          contactId: 'c-recommended',
          createdAt: new Date('2026-05-10T10:05:00Z'),
          action: 'NEXT_BEST_ACTION',
          status: 'recommended',
        },
        {
          contactId: 'c-executed',
          createdAt: new Date('2026-05-10T10:10:00Z'),
          action: 'SEND_OFFER',
          status: 'executed',
        },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c-executed', phone: '5511', name: 'Lead' },
      ]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(1);
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['c-executed'] } }),
        }),
      );
    });

    it('deduplicates contact actions by latest timestamp in contactActions map', async () => {
      const contactId = 'c-1';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId, createdAt: new Date('2026-05-11T10:00:00Z'), action: 'LATEST' },
        { contactId, createdAt: new Date('2026-05-10T08:00:00Z'), action: 'EARLIER' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-1', phone: '5511', name: 'X' }]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(result.actionsAnalyzed).toBe(2);
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['c-1'] } }) }),
      );
    });

    it('skips message queries when no contact ids found', async () => {
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);

      const result = await service.getImpact('ws-1');

      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
      expect(result.actionsAnalyzed).toBe(0);
    });

    it('respects workspace isolation in all queries', async () => {
      const ws = 'ws-isolated';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      await service.getImpact(ws);

      expect(mockPrisma.autopilotEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: ws }) }),
      );
    });

    it('includes keyword-based conversions from messages', async () => {
      const contactId = 'c-3';
      mockPrisma.autopilotEvent.findMany.mockResolvedValue([
        { contactId, createdAt: new Date('2026-05-10T10:00:00Z'), action: 'SEND_OFFER' },
      ]);
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-3', phone: '5511', name: 'Lead' }]);
      mockPrisma.message.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ contactId }]);

      const result = await service.getImpact('ws-1');

      expect(result.conversions).toBe(1);
    });

    it('survives upstream error', async () => {
      mockPrisma.autopilotEvent.findMany.mockRejectedValue(new Error('DB crash'));

      await expect(service.getImpact('ws-1')).rejects.toThrow('DB crash');
    });
  });
});
