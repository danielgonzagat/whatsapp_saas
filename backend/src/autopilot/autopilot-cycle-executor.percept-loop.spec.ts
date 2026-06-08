import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AutopilotCycleExecutorService } from './autopilot-cycle-executor.service';
import type { AutopilotConversation } from './autopilot-cycle-executor.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { MindPolicyService } from '../kloel/mind/policy/mind-policy.service';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
import {
  AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE,
  AUTOPILOT_DECISION_MADE_EVENT_TYPE,
} from './autopilot-percept-emit.helper';
import { type FlexMock } from '../../test/helpers/prisma.mock';

jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
}));

const mockFlowQueueAdd = jest.requireMock<{
  flowQueue: { add: jest.Mock<(...args: unknown[]) => Promise<unknown>> };
}>('../queue/queue').flowQueue.add;

// The `send_calendar` action resolves through renderTemplate (mocked here to a
// non-empty string), so executeAction reaches the flowQueue.add seam WITHOUT
// needing an OpenAI client — the cleanest path to drive the action seam.
jest.mock('../common/sales-templates', () => ({
  renderTemplate: jest.fn(() => 'MOCK_CALENDAR_RESPONSE'),
}));

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

const FLAG = 'KLOEL_AUTOPILOT_PERCEPT_ENABLED';

describe('AutopilotCycleExecutorService — Mind percept/decision loop (flag-gated)', () => {
  let service: AutopilotCycleExecutorService;

  type PrismaCall = FlexMock<(args: unknown) => Promise<unknown>>;
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const mockPrisma = {
    autopilotEvent: { create: jest.fn() as PrismaCall },
    product: { findMany: jest.fn() as PrismaCall },
    mindOutboxEvent: { upsert },
  };

  const mockConfig = { get: jest.fn<() => unknown>().mockReturnValue(undefined) };

  const mockPlanLimits = {
    ensureTokenBudget: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    trackAiUsage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ensureDailyMessageQuota: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ensureMessageRate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const mockOpsAlert = { alertOnCriticalError: jest.fn() };

  const mindChoose = jest
    .fn<() => Promise<{ chosen: string; decision: unknown }>>()
    .mockResolvedValue({ chosen: 'send_offer', decision: {} });
  const mockMindPolicy = { choose: mindChoose };

  const recordDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const mockDecisionOutcome = { recordDecision };

  const prev = process.env[FLAG];

  function makeConv(overrides: Partial<AutopilotConversation> = {}): AutopilotConversation {
    return {
      id: 'conv-1',
      workspaceId: 'ws-1',
      contact: { id: 'c-1', phone: '5511999999999', name: 'João' },
      messages: [{ direction: 'INBOUND', content: 'Quero comprar', createdAt: new Date() }],
      ...overrides,
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[FLAG];
    mockConfig.get.mockReturnValue(undefined);
    upsert.mockResolvedValue(undefined);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mindChoose.mockResolvedValue({ chosen: 'send_offer', decision: {} });
    recordDecision.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotCycleExecutorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PlanLimitsService, useValue: mockPlanLimits },
        { provide: OpsAlertService, useValue: mockOpsAlert },
        { provide: MindPolicyService, useValue: mockMindPolicy },
        { provide: DecisionOutcomeService, useValue: mockDecisionOutcome },
      ],
    }).compile();
    service = module.get<AutopilotCycleExecutorService>(AutopilotCycleExecutorService);
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
  });

  describe('action seam (executeAction)', () => {
    it('flag OFF: enqueues the send but emits NO percept and records NO decision (byte-identical behavior)', async () => {
      await service.executeAction(
        'send_calendar',
        makeConv(),
        { allowed: true },
        { intent: 'buying' },
      );

      // legacy behavior unchanged: the send is still enqueued
      expect(mockFlowQueueAdd).toHaveBeenCalledTimes(1);
      // additive loop stays inert with the flag OFF
      expect(upsert).not.toHaveBeenCalled();
      expect(recordDecision).not.toHaveBeenCalled();
    });

    it('flag ON: enqueues the send AND closes the loop (percept + decision-ledger record)', async () => {
      process.env[FLAG] = 'true';

      await service.executeAction(
        'send_calendar',
        makeConv(),
        { allowed: true },
        { intent: 'buying' },
      );

      // legacy behavior still happens
      expect(mockFlowQueueAdd).toHaveBeenCalledTimes(1);

      // the action percept is emitted into the spine outbox
      expect(upsert).toHaveBeenCalledTimes(1);
      const upsertArg = (upsert.mock.calls[0] as unknown[])[0] as {
        create: { eventType: string };
      };
      expect(upsertArg.create.eventType).toBe(AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE);

      // the loop CLOSES: the autonomous action is recorded as a decision
      expect(recordDecision).toHaveBeenCalledTimes(1);
      const recordArg = (recordDecision.mock.calls[0] as unknown[])[0] as {
        workspaceId: string;
        chosenAction: string;
        decisionType: string;
      };
      expect(recordArg.workspaceId).toBe('ws-1');
      expect(recordArg.chosenAction).toBe('send_calendar');
      expect(recordArg.decisionType).toBe('autopilot_action');
    });

    it('flag ON but the send fails: never throws (best-effort loop must not break the send path)', async () => {
      process.env[FLAG] = 'true';
      mockFlowQueueAdd.mockRejectedValueOnce(new Error('queue down'));

      await expect(
        service.executeAction('send_calendar', makeConv(), { allowed: true }, { intent: 'buying' }),
      ).resolves.toBeUndefined();

      // send failed before the seam → no percept, no record, but no throw
      expect(upsert).not.toHaveBeenCalled();
      expect(recordDecision).not.toHaveBeenCalled();
    });
  });

  describe('decision seam (decideAction)', () => {
    it('flag OFF: returns the Mind choice but emits NO decision percept', async () => {
      const chosen = await service.decideAction({ intent: 'buying' }, makeConv(), true);

      expect(chosen).toBe('send_offer');
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON: returns the Mind choice AND emits ONE decision percept', async () => {
      process.env[FLAG] = 'true';

      const chosen = await service.decideAction({ intent: 'buying' }, makeConv(), true);

      expect(chosen).toBe('send_offer');
      expect(upsert).toHaveBeenCalledTimes(1);
      const upsertArg = (upsert.mock.calls[0] as unknown[])[0] as {
        create: { eventType: string };
      };
      expect(upsertArg.create.eventType).toBe(AUTOPILOT_DECISION_MADE_EVENT_TYPE);
    });
  });
});
