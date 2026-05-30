import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Provider } from '@nestjs/common';
import { AutopilotCycleExecutorService } from './autopilot-cycle-executor.service';
import type { AutopilotConversation } from './autopilot-cycle-executor.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { MindPolicyService } from '../kloel/mind/policy/mind-policy.service';
import type { MindPolicyDecision } from '../kloel/mind.types';
import { AUTOPILOT_MIND_DECISION_TYPE } from './autopilot-cycle-executor.helpers';
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

jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
}));

jest.mock('../common/sales-templates', () => ({
  renderTemplate: jest.fn(() => 'MOCK_CALENDAR_RESPONSE'),
}));

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

describe('AutopilotCycleExecutorService', () => {
  type PrismaCall = FlexMock<(args: unknown) => Promise<unknown>>;
  type MockedPrisma = {
    autopilotEvent: { create: PrismaCall };
    product: { findMany: PrismaCall };
  };

  const mockPrisma: MockedPrisma = {
    autopilotEvent: { create: jest.fn() as PrismaCall },
    product: { findMany: jest.fn() as PrismaCall },
  };

  const mockConfig = {
    get: jest.fn<() => unknown>(),
  };

  const mockPlanLimits = {
    ensureTokenBudget: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    trackAiUsage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ensureDailyMessageQuota: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ensureMessageRate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const mockOpsAlert = {
    alertOnCriticalError: jest.fn(),
  };

  function makeConv(overrides: Partial<AutopilotConversation> = {}): AutopilotConversation {
    return {
      id: 'conv-1',
      workspaceId: 'ws-1',
      contact: {
        id: 'c-1',
        phone: '5511999999999',
        name: 'João',
      },
      messages: [{ direction: 'INBOUND', content: 'Quero comprar', createdAt: new Date() }],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue(undefined);
  });

  describe('decideAction — MindPolicy wiring', () => {
    function buildDecisionStub(chosen: string, ctx: AutopilotConversation): MindPolicyDecision {
      return {
        baseline: chosen,
        baselineAction: chosen,
        calcSteps: [],
        candidates: [],
        chosen,
        context: {},
        decisionType: AUTOPILOT_MIND_DECISION_TYPE,
        epsilon: 0,
        fallbackActive: false,
        fallbackReason: null,
        reasonInternal: 'test',
        subject: `contact:${ctx.contact.id}`,
        utilityFail: 0,
        utilitySuccess: 1,
        workspaceId: ctx.workspaceId,
        usedGlobalPrior: false,
        priorWeight: 0,
      };
    }

    async function buildServiceWith(
      mindPolicyMock: { choose: jest.Mock } | null,
    ): Promise<AutopilotCycleExecutorService> {
      const providers: Provider[] = [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PlanLimitsService, useValue: mockPlanLimits },
        { provide: OpsAlertService, useValue: mockOpsAlert },
      ];
      if (mindPolicyMock) {
        providers.push({ provide: MindPolicyService, useValue: mindPolicyMock });
      }
      const module = await Test.createTestingModule({
        providers: [AutopilotCycleExecutorService, ...providers],
      }).compile();
      return module.get<AutopilotCycleExecutorService>(AutopilotCycleExecutorService);
    }

    it('preserves baseline when MindPolicy is not provided (@Optional behavior)', async () => {
      const svc = await buildServiceWith(null);
      const conv = makeConv();

      const result = await svc.decideAction({ intent: 'question_price' }, conv, true);

      expect(result).toBe('send_price');
    });

    it('returns MindPolicy.choose result when available', async () => {
      const conv = makeConv();
      const choose = jest
        .fn<(input: unknown) => Promise<{ chosen: string; decision: MindPolicyDecision }>>()
        .mockResolvedValue({
          chosen: 'try_upsell',
          decision: buildDecisionStub('try_upsell', conv),
        });
      const svc = await buildServiceWith({ choose });

      const result = await svc.decideAction({ intent: 'question_price' }, conv, true);

      expect(result).toBe('try_upsell');
      expect(choose).toHaveBeenCalledTimes(1);
      const [callInput] = choose.mock.calls[0] as [
        {
          workspaceId: string;
          decisionType: string;
          subject: string;
          baselineActionQuiet: string;
          options: Array<{ action: string }>;
          outcomeKey: string;
        },
      ];
      expect(callInput.workspaceId).toBe(conv.workspaceId);
      expect(callInput.decisionType).toBe(AUTOPILOT_MIND_DECISION_TYPE);
      expect(callInput.subject).toBe(`contact:${conv.contact.id}`);
      expect(callInput.baselineActionQuiet).toBe('send_price');
      expect(callInput.options.length).toBeGreaterThan(0);
      expect(callInput.outcomeKey.startsWith('autopilot_action:')).toBe(true);
    });

    it('falls back to baseline when MindPolicy.choose throws', async () => {
      const conv = makeConv();
      const choose = jest
        .fn<(input: unknown) => Promise<{ chosen: string; decision: MindPolicyDecision }>>()
        .mockRejectedValue(new Error('mind unavailable'));
      const svc = await buildServiceWith({ choose });

      const result = await svc.decideAction({ intent: 'question_price' }, conv, true);

      expect(result).toBe('send_price');
      expect(choose).toHaveBeenCalledTimes(1);
    });
  });
});
