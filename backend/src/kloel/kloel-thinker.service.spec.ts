import { Test, TestingModule } from '@nestjs/testing';
import { KloelThinkerService } from './kloel-thinker.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService } from './llm-budget.service';
import { Response } from 'express';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { StateBuilderService } from './state/state-builder.service';

jest.mock('./kloel-thread.service', () => ({
  KloelThreadService: class MockKloelThreadService {},
  StoredProcessingTraceEntry: undefined,
  StoredResponseVersion: undefined,
  ChatMessage: undefined,
  ThreadConversationState: undefined,
}));

jest.mock('./kloel-workspace-context.service', () => ({
  KloelWorkspaceContextService: class MockKloelWorkspaceContextService {},
}));

jest.mock('./kloel-composer.service', () => ({
  KloelComposerService: class MockKloelComposerService {},
}));

jest.mock('./kloel-reply-engine.service', () => ({
  KloelReplyEngineService: class MockKloelReplyEngineService {},
  LocalToolExecutor: undefined,
}));

jest.mock('./kloel-llm-e2e-guard', () => ({
  KLOEL_LLM_E2E_GUARD: Symbol('KLOEL_LLM_E2E_GUARD'),
  KloelLLME2EGuard: class MockKloelLLME2EGuard {},
  NoopKloelLLME2EGuard: class MockNoopKloelLLME2EGuard {},
}));

jest.mock('./kloel-conversation-store', () => ({
  KloelConversationStore: class MockKloelConversationStore {},
}));

import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelReplyEngineService, LocalToolExecutor } from './kloel-reply-engine.service';
import { KLOEL_LLM_E2E_GUARD, KloelLLME2EGuard } from './kloel-llm-e2e-guard';
import { KloelStreamWriter } from './kloel-stream-writer';
import { finalizeSuccessfulReply } from './kloel-thinker-think.helpers';
jest.mock('./kloel-thinker.helpers', () => ({
  thinkSyncImpl: jest.fn(),
  regenerateThreadAssistantResponseImpl: jest.fn(),
}));

jest.mock('./kloel-thinker-think.helpers', () => {
  const actual = jest.requireActual<typeof import('./kloel-thinker-think.helpers')>(
    './kloel-thinker-think.helpers',
  );
  return {
    ...actual,
    runComposerCapabilityBranch: jest.fn(),
    runToolPlanningBranch: jest.fn(),
    finalizeSuccessfulReply: jest.fn(),
  };
});

jest.mock('./kloel-conversation-store', () => ({
  KloelConversationStore: jest.fn().mockImplementation(() => ({
    getConversationMessages: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('./kloel-stream-writer', () => ({
  KloelStreamWriter: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    write: jest.fn(),
    close: jest.fn(),
    streamModelResponse: jest.fn(),
  })),
}));

type ThinkerPrismaMock = {
  workspace: { findUnique: jest.Mock };
  agent: { findFirst: jest.Mock };
  chatThread: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  chatMessage: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

describe('KloelThinkerService', () => {
  let service: KloelThinkerService;
  let prisma: ThinkerPrismaMock;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let llmBudget: Pick<LLMBudgetService, 'assertBudget' | 'recordSpend'>;
  let threadService: Pick<
    KloelThreadService,
    | 'resolveThread'
    | 'getThreadConversationState'
    | 'buildThreadSummarySystemMessage'
    | 'persistUserThreadMessage'
    | 'buildThreadMessageMetadata'
    | 'resolveClientRequestId'
    | 'appendStoredProcessingTraceEntry'
  >;
  let wsContextService: Pick<KloelWorkspaceContextService, 'getWorkspaceContext'>;
  let composerService: Pick<KloelComposerService, 'searchWeb'>;
  let replyEngine: Pick<
    KloelReplyEngineService,
    | 'hasOpenAiKey'
    | 'buildDashboardPrompt'
    | 'buildChatModelMessages'
    | 'buildDynamicRuntimeContext'
    | 'buildMarketingPromptAddendum'
    | 'detectExpertiseLevel'
    | 'shouldAttemptToolPlanningPass'
    | 'shouldUseLongFormBudget'
    | 'isClientDisconnected'
    | 'buildStreamAbortMessage'
    | 'openai'
    | 'unavailableMessage'
    | 'contextFormatter'
  >;
  let llmE2EGuard: Pick<KloelLLME2EGuard, 'isEnabled' | 'buildStream'>;
  let abiBuilder: Pick<AbiBuilderService, 'build'>;
  let capabilityExecutor: Pick<MindCapabilityExecutor, 'buildCognitiveSubstrate'>;
  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: wsId }) },
      agent: { findFirst: jest.fn().mockResolvedValue({ name: 'Test User' }) },
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'thread-1',
          title: 'Nova conversa',
          summary: null,
          summaryUpdatedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatMessage: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest
        .fn()
        .mockImplementation((arg: unknown) =>
          typeof arg === 'function'
            ? (arg as (p: typeof prisma) => unknown)(prisma)
            : Promise.resolve(undefined),
        ),
    };

    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    llmBudget = {
      assertBudget: jest.fn().mockResolvedValue(undefined),
      recordSpend: jest.fn().mockResolvedValue(undefined),
    };

    threadService = {
      resolveThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        title: 'Nova conversa',
        summary: null,
        summaryUpdatedAt: null,
      }),
      getThreadConversationState: jest
        .fn()
        .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
      buildThreadSummarySystemMessage: jest.fn().mockReturnValue(null),
      persistUserThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-user-1' }),
      buildThreadMessageMetadata: jest.fn().mockReturnValue({}),
      resolveClientRequestId: jest.fn().mockReturnValue('req-1'),
      appendStoredProcessingTraceEntry: jest.fn(),
    };

    wsContextService = {
      getWorkspaceContext: jest.fn().mockResolvedValue('Company context'),
    };

    composerService = {
      searchWeb: jest.fn().mockResolvedValue({ answer: 'result', sources: [] }),
    };

    replyEngine = {
      hasOpenAiKey: jest.fn().mockReturnValue(true),
      buildDashboardPrompt: jest.fn().mockReturnValue('system prompt'),
      buildChatModelMessages: jest.fn().mockReturnValue([]),
      buildDynamicRuntimeContext: jest.fn().mockResolvedValue([]),
      buildMarketingPromptAddendum: jest.fn().mockResolvedValue([]),
      detectExpertiseLevel: jest.fn().mockReturnValue('beginner'),
      shouldAttemptToolPlanningPass: jest.fn().mockReturnValue(false),
      shouldUseLongFormBudget: jest.fn().mockReturnValue(false),
      isClientDisconnected: jest.fn().mockReturnValue(false),
      buildStreamAbortMessage: jest.fn().mockReturnValue('timeout'),
      openai: {} as Pick<KloelReplyEngineService, 'openai'>['openai'],
      unavailableMessage: 'Indisponível no momento.',
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn().mockReturnValue('User'),
      } as Pick<KloelReplyEngineService, 'contextFormatter'>['contextFormatter'],
    };

    llmE2EGuard = {
      isEnabled: jest.fn().mockReturnValue(false),
      buildStream: jest.fn(),
    };

    abiBuilder = {
      build: jest.fn().mockResolvedValue({ status: 'lineage_compromised', reason: 'test' }),
    };
    capabilityExecutor = {
      buildCognitiveSubstrate: jest.fn().mockResolvedValue({
        workingMemory: ['memória operacional'],
        beliefs: [{ predicate: 'has_products', confidence: 0.8, n: 3 }],
      }),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelThinkerService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: LLMBudgetService, useValue: llmBudget },
        { provide: KloelThreadService, useValue: threadService },
        { provide: KloelWorkspaceContextService, useValue: wsContextService },
        { provide: KloelComposerService, useValue: composerService },
        { provide: KloelReplyEngineService, useValue: replyEngine },
        { provide: KLOEL_LLM_E2E_GUARD, useValue: llmE2EGuard },
        {
          provide: StateBuilderService,
          useValue: {
            build: jest.fn().mockResolvedValue({
              workspace: { available: false },
              actor: { available: false },
              contact: null,
              recentEvents: [],
              memory: { shortTerm: [] },
              capabilities: [],
              risk: { available: false, reason: 'no risk service' },
              missingSources: [],
              assembledAt: new Date(),
            }),
          },
        },
        { provide: AbiBuilderService, useValue: abiBuilder },
        { provide: MindCapabilityExecutor, useValue: capabilityExecutor },
      ],
    }).compile();

    service = module.get<KloelThinkerService>(KloelThinkerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('think (SSE)', () => {
    it('writes error event and closes when API key is missing', async () => {
      replyEngine.hasOpenAiKey = jest.fn().mockReturnValue(false);
      jest.replaceProperty(process, 'env', { ...process.env, ANTHROPIC_API_KEY: '' });

      await expect(
        service.think(
          { message: 'hello', workspaceId: wsId },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
        ),
      ).resolves.toBeUndefined();
    });

    it('routes detected operational SSE actions before the LLM key guard', async () => {
      replyEngine.hasOpenAiKey = jest.fn().mockReturnValue(false);
      jest.replaceProperty(process, 'env', { ...process.env, ANTHROPIC_API_KEY: '' });
      const executeLocalTool = jest
        .fn()
        .mockResolvedValue({ success: true, products: [{ name: 'PDRN', price: 197 }] });

      await service.think(
        { message: 'listar produtos', workspaceId: wsId, userId: 'agent-1' },
        {} as Response,
        null,
        undefined,
        undefined,
        executeLocalTool as LocalToolExecutor,
      );

      expect(executeLocalTool).toHaveBeenCalledWith(wsId, 'list_products', {}, 'agent-1');
      expect(replyEngine.hasOpenAiKey).not.toHaveBeenCalled();
      expect(replyEngine.buildChatModelMessages).not.toHaveBeenCalled();
      const streamWriter = (KloelStreamWriter as jest.Mock).mock.results.at(-1)?.value as {
        write: jest.Mock<void, [unknown]>;
      };
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tool_call', tool: 'list_products' }),
      );
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tool_result', tool: 'list_products', success: true }),
      );
      expect(
        streamWriter.write.mock.calls.some(([event]) => {
          if (event === null || typeof event !== 'object' || Array.isArray(event)) {
            return false;
          }
          const maybeEvent = event as { type?: unknown; content?: unknown };
          return (
            maybeEvent.type === 'content' &&
            typeof maybeEvent.content === 'string' &&
            maybeEvent.content.includes('PDRN')
          );
        }),
      ).toBe(true);
      expect(finalizeSuccessfulReply).toHaveBeenCalledWith(
        expect.stringContaining('PDRN'),
        0,
        expect.objectContaining({ workspaceId: wsId, message: 'listar produtos' }),
      );
    });

    it('includes canonical receipt proof in deterministic SSE replies', async () => {
      const executeLocalTool = jest.fn().mockResolvedValue({
        success: true,
        product: { id: 'prod-1', name: 'PDRN', price: 197 },
        capabilityId: 'products.create',
        auditLogId: 'audit_prod_1',
        evidenceUrl: '/produtos/prod-1',
        domainEvents: ['product.created'],
        receipt: {
          capabilityId: 'products.create',
          auditLogId: 'audit_prod_1',
          evidenceUrl: '/produtos/prod-1',
          domainEvents: ['product.created'],
          idempotencyKey: 'products.create:ws-1:agent-1',
          success: true,
        },
      });

      await service.think(
        { message: 'criar produto nome: PDRN, preco R$ 197', workspaceId: wsId, userId: 'agent-1' },
        {} as Response,
        null,
        undefined,
        undefined,
        executeLocalTool as LocalToolExecutor,
      );

      expect(executeLocalTool).toHaveBeenCalledWith(
        wsId,
        'products.create',
        expect.objectContaining({ name: 'pdrn', price: 197 }),
        'agent-1',
      );

      const streamWriter = (KloelStreamWriter as unknown as jest.Mock).mock.results.at(-1)
        ?.value as { write: jest.Mock<void, [unknown]> };
      const contentEvents = streamWriter.write.mock.calls
        .map(([event]) => event)
        .filter(
          (event): event is { type: 'content'; content: string } =>
            event !== null &&
            typeof event === 'object' &&
            !Array.isArray(event) &&
            (event as { type?: unknown }).type === 'content',
        );
      const content = contentEvents.map((event) => event.content).join('\n');

      expect(content).toContain('Produto PDRN');
      expect(content).toContain('Prova material:');
      expect(content).toContain('Evidência: /produtos/prod-1');
      expect(content).toContain('AuditLog: audit_prod_1');
      expect(content).toContain('Eventos: product.created');
      expect(finalizeSuccessfulReply).toHaveBeenCalledWith(
        expect.stringContaining('Evidência: /produtos/prod-1'),
        0,
        expect.objectContaining({
          workspaceId: wsId,
          message: 'criar produto nome: PDRN, preco R$ 197',
        }),
      );
    });

    it('returns an honest tool failure on SSE without falling through to the LLM', async () => {
      const executeLocalTool = jest
        .fn()
        .mockResolvedValue({ success: false, error: 'tool_not_allowed' });

      await service.think(
        { message: 'listar produtos', workspaceId: wsId, allowedTools: ['search_web'] },
        {} as Response,
        null,
        undefined,
        undefined,
        executeLocalTool as LocalToolExecutor,
      );

      expect(executeLocalTool).toHaveBeenCalledWith(wsId, 'list_products', {}, undefined);
      expect(replyEngine.buildChatModelMessages).not.toHaveBeenCalled();
      const streamWriter = (KloelStreamWriter as jest.Mock).mock.results.at(-1)?.value as {
        write: jest.Mock<void, [unknown]>;
      };
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_result',
          tool: 'list_products',
          success: false,
          error: 'tool_not_allowed',
        }),
      );
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'content', content: 'Erro: tool_not_allowed' }),
      );
      expect(finalizeSuccessfulReply).toHaveBeenCalledWith(
        'Erro: tool_not_allowed',
        0,
        expect.objectContaining({ workspaceId: wsId, message: 'listar produtos' }),
      );
    });

    it('builds conversational ABI by default and sends cognitive state to model messages', async () => {
      const previousFlag = process.env['KLOEL_THINKER_USE_ABI'];
      delete process.env['KLOEL_THINKER_USE_ABI'];
      const cognitiveState = {
        abiVersion: '1.1.0',
        lineage: {
          canonicalName: 'Kloel',
          genesisEventId: 'genesis-1',
          lineageStatus: 'intact',
          operationalAge: { days: 1 },
          capabilities: ['list_products'],
        },
        identityProjection: {
          audience: 'public',
          currentMaturity: 'developing',
          truthMode: 'observed',
        },
        perception: { currentSnapshot: { channel: 'web' }, recentSalientEvents: [] },
        beliefs: [],
        predictions: { active: [], recentSurprises: [] },
        attention: { candidates: [] },
        memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
        capabilities: {
          available: [
            { capabilityId: 'list_products', maturity: 'developing', runtimeEvidencePct: 1 },
          ],
          restricted: [],
        },
        valence: {
          recentTrace: [],
          aggregatedMood: { positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24 },
        },
        readinessTruth: {
          noOverclaimStatus: 'PASS',
          capabilityHealthScore: 1,
          gates: [],
          certificationVerdict: {
            verdict: 'DEVELOPING',
            score: 1,
            measuredAt: '2026-05-27T00:00:00.000Z',
          },
          overclaimRisk: 0,
        },
        currentInput: {
          raw: 'Liste meus produtos ativos',
          channel: 'web',
          arrivalTimestamp: '2026-05-27T00:00:00.000Z',
        },
      };
      abiBuilder.build = jest.fn().mockResolvedValue({ status: 'ok', abi: cognitiveState });

      try {
        await service.think(
          { message: 'Liste meus produtos ativos', workspaceId: wsId },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
        );
      } finally {
        if (previousFlag === undefined) {
          delete process.env['KLOEL_THINKER_USE_ABI'];
        } else {
          process.env['KLOEL_THINKER_USE_ABI'] = previousFlag;
        }
      }

      expect(capabilityExecutor.buildCognitiveSubstrate).toHaveBeenCalledWith(wsId);
      const buildMock = abiBuilder.build as jest.MockedFunction<AbiBuilderService['build']>;
      const [abiBuildParams] = buildMock.mock.calls[0] as [
        Parameters<AbiBuilderService['build']>[0],
      ];
      expect(abiBuildParams.cognitiveSubstrate).toEqual(
        expect.objectContaining({ workingMemory: ['memória operacional'] }),
      );
      expect(abiBuildParams.capabilityIds).toEqual(expect.arrayContaining(['list_products']));
      expect(replyEngine.buildChatModelMessages).toHaveBeenCalledWith(
        expect.objectContaining({ prebuiltCognitiveState: cognitiveState }),
      );
    });

    it('does not throw when request is aborted before start', async () => {
      const signal = AbortSignal.abort();

      await expect(
        service.think(
          { message: 'hello', workspaceId: wsId },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
          { signal },
        ),
      ).resolves.toBeUndefined();
    });
  });
});
