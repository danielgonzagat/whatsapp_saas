import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedAgentActionsWorkspaceService } from './unified-agent-actions-workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { CANONICAL_MODEL_IDS } from '../lib/openai-models';
import { chatCompletionWithFallback } from './openai-wrapper';
import { actionGetWorkspaceStatus } from './unified-agent-actions-workspace.helpers';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));
jest.mock('./unified-agent-actions-workspace.helpers', () => ({
  actionGetWorkspaceStatus: jest.fn(),
}));
type WorkspacePrismaMock = {
  product: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  kloelMemory: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  flow: { create: jest.Mock };
  contact: { count: jest.Mock };
  campaign: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

function isWorkspaceTransaction(fnOrArg: unknown): fnOrArg is (tx: WorkspacePrismaMock) => unknown {
  return typeof fnOrArg === 'function';
}

describe('UnifiedAgentActionsWorkspaceService', () => {
  let service: UnifiedAgentActionsWorkspaceService;
  let prisma: WorkspacePrismaMock;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  const actionGetWorkspaceStatusMock = jest.mocked(actionGetWorkspaceStatus);
  const chatCompletionWithFallbackMock = jest.mocked(chatCompletionWithFallback);
  const wsId = 'ws-1';
  beforeEach(async () => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'p-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      flow: {
        create: jest.fn().mockResolvedValue({ id: 'f-1', name: 'Flow 1' }),
      },
      contact: {
        count: jest.fn().mockResolvedValue(0),
      },
      campaign: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fnOrArg: unknown) =>
          isWorkspaceTransaction(fnOrArg) ? fnOrArg(prisma) : Promise.resolve(undefined),
        ),
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentActionsWorkspaceService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get<UnifiedAgentActionsWorkspaceService>(UnifiedAgentActionsWorkspaceService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('actionCreateFlowFromDescription', () => {
    it('returns error when OpenAI is null', async () => {
      const result = await service.actionCreateFlowFromDescription(
        wsId,
        { description: 'test', objective: 'sell' },
        null,
        CANONICAL_MODEL_IDS.openAiLegacyGpt4,
        CANONICAL_MODEL_IDS.openAiLegacyGpt35Turbo,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenAI');
    });
    it('creates flow via OpenAI completion', async () => {
      const fakeCompletion = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Sales Flow',
                nodes: [{ id: 'n1', type: 'message' }],
                edges: [{ source: 'n1', target: 'n2' }],
              }),
            },
          },
        ],
        usage: { total_tokens: 500 },
      };
      chatCompletionWithFallbackMock.mockResolvedValue(fakeCompletion);
      const result = await service.actionCreateFlowFromDescription(
        wsId,
        { description: 'Sell product', objective: 'convert', autoActivate: true },
        { apiKey: 'fake' },
        CANONICAL_MODEL_IDS.openAiLegacyGpt4,
        CANONICAL_MODEL_IDS.openAiLegacyGpt35Turbo,
      );
      expect(result.success).toBe(true);
      expect(result.flowId).toBeDefined();
      expect(chatCompletionWithFallbackMock).toHaveBeenCalled();
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(wsId);
      const [[createArg]] = prisma.flow.create.mock.calls as Array<
        [
          {
            data: { isActive: boolean; workspaceId: string };
          },
        ]
      >;
      expect(createArg).toMatchObject({ data: { workspaceId: wsId, isActive: true } });
    });
    it('handles OpenAI error gracefully', async () => {
      chatCompletionWithFallbackMock.mockRejectedValue(new Error('API error'));
      const result = await service.actionCreateFlowFromDescription(
        wsId,
        { description: 'test', objective: 'sell' },
        { apiKey: 'fake' },
        CANONICAL_MODEL_IDS.openAiLegacyGpt4,
        CANONICAL_MODEL_IDS.openAiLegacyGpt35Turbo,
      );
      expect(result.success).toBe(false);
    });
  });
  describe('actionScheduleCampaign', () => {
    it('schedules campaign by id', async () => {
      const result = await service.actionScheduleCampaign(wsId, {
        campaignId: 'c-1',
        scheduleAt: '2026-06-01T10:00:00Z',
      });
      expect(result.success).toBe(true);
      expect(prisma.campaign.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1', workspaceId: wsId },
        }),
      );
    });
    it('returns error when campaignId is missing', async () => {
      const result = await service.actionScheduleCampaign(wsId, {});
      expect(result.success).toBe(false);
    });
  });
  describe('actionGetWorkspaceStatus', () => {
    it('delegates to helper', async () => {
      actionGetWorkspaceStatusMock.mockResolvedValue({
        workspaceId: wsId,
        health: { status: 'healthy' },
      });
      const result = await service.actionGetWorkspaceStatus(wsId, {});
      expect(result.workspaceId).toBe(wsId);
      expect(actionGetWorkspaceStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: wsId }),
      );
    });
  });
  describe('workspace isolation', () => {
    it('actionCreateProduct scopes to workspaceId', async () => {
      await service.actionCreateProduct('ws-tenant', { name: 'X', price: 1 });
      const [[findFirstArg]] = prisma.product.findFirst.mock.calls as Array<
        [
          {
            where: { workspaceId: string };
          },
        ]
      >;
      expect(findFirstArg).toMatchObject({ where: { workspaceId: 'ws-tenant' } });
    });
    it('actionCreateFlow scopes to workspaceId', async () => {
      await service.actionCreateFlow('ws-tenant', { name: 'Flow A', trigger: 'welcome' });
      const [[createArg]] = prisma.kloelMemory.create.mock.calls as Array<
        [
          {
            data: { workspaceId: string };
          },
        ]
      >;
      expect(createArg).toMatchObject({ data: { workspaceId: 'ws-tenant' } });
    });
    it('actionCreateBroadcast counts contacts by workspaceId', async () => {
      await service.actionCreateBroadcast('ws-tenant', { name: 'B', message: 'M' });
      const [[countArg]] = prisma.contact.count.mock.calls as Array<
        [
          {
            where: { workspaceId: string };
          },
        ]
      >;
      expect(countArg).toMatchObject({ where: { workspaceId: 'ws-tenant' } });
    });
  });
});
