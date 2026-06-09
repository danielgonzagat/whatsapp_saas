import { Test, TestingModule } from '@nestjs/testing';
import { KloelThinkerService } from './kloel-thinker.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService } from './llm-budget.service';
import { Response } from 'express';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { StateBuilderService } from './state/state-builder.service';
import { MemoryService } from './mind/memory/memory.service';
import { ManifestInjectionBuilderService } from './manifest/manifest-injection.builder';

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
import {
  finalizeSuccessfulReply,
  runComposerCapabilityBranch,
} from './kloel-thinker-think.helpers';
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
    getLastReasoning: jest.fn(() => ({ text: '', durationMs: undefined })),
  })),
}));

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));

import { chatCompletionWithFallback } from './openai-wrapper';

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
  let memoryGraph: Pick<MemoryService, 'buildMemoryContextForModel' | 'extractFromTurn'>;
  let manifestInjection: Pick<ManifestInjectionBuilderService, 'assemble'>;
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
      unavailableMessage:
        'Eu fiquei sem acesso ao motor de resposta agora. Me chama de novo em instantes que eu retomo sem te fazer repetir tudo.',
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn().mockReturnValue('User'),
      } as unknown as Pick<KloelReplyEngineService, 'contextFormatter'>['contextFormatter'],
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

    // wire-context: default to an empty memory recall + empty manifest so the
    // EXISTING tests are byte-identical (no injected text). Individual tests
    // override these to assert injection / degradation behavior.
    memoryGraph = {
      buildMemoryContextForModel: jest.fn().mockResolvedValue({
        userProfileStatic: [],
        userProfileDynamic: [],
        relevantMemories: [],
        preferences: [],
        constraints: [],
        text: '',
      }),
      extractFromTurn: jest.fn().mockResolvedValue({
        created: 0,
        updated: 0,
        contradictions: 0,
        forgotten: 0,
        nodeIds: [],
      }),
    };
    manifestInjection = {
      assemble: jest.fn().mockReturnValue({ text: '', internalNames: [] }),
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
        { provide: MemoryService, useValue: memoryGraph },
        { provide: ManifestInjectionBuilderService, useValue: manifestInjection },
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
      expect(replyEngine.hasOpenAiKey).toHaveBeenCalledTimes(1);
      expect(replyEngine.buildChatModelMessages).not.toHaveBeenCalled();
      const streamWriter = (KloelStreamWriter as jest.Mock).mock.results.at(-1)?.value as {
        write: jest.Mock<void, [unknown]>;
      };
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tool_call', tool: 'list_products' }),
      );
      expect(streamWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_result',
          tool: 'list_products',
          success: true,
        }),
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

    it('lets an explicit composer capability bypass generic action routing', async () => {
      const executeLocalTool = jest.fn().mockResolvedValue({ success: true });
      jest.mocked(runComposerCapabilityBranch).mockResolvedValueOnce(undefined);

      await service.think(
        {
          message: 'rode os testes backend e crie uma landing page curta para Serum Graph Proof',
          workspaceId: wsId,
          userId: 'agent-1',
          metadata: { capability: 'create_site' },
        },
        {} as Response,
        'create_site',
        undefined,
        undefined,
        executeLocalTool as LocalToolExecutor,
      );

      expect(executeLocalTool).not.toHaveBeenCalled();
      expect(runComposerCapabilityBranch).toHaveBeenCalledWith(
        'create_site',
        undefined,
        undefined,
        expect.anything(),
        expect.objectContaining({
          workspaceId: wsId,
          message: 'rode os testes backend e crie uma landing page curta para Serum Graph Proof',
          metadata: { capability: 'create_site' },
        }),
      );
    });

    it('lets an explicit linked product bypass generic sales action routing', async () => {
      const executeLocalTool = jest.fn().mockResolvedValue({ success: true });

      await service.think(
        {
          message:
            'Use o produto vinculado para responder: confirme nome e status do produto sem expor IDs internos.',
          workspaceId: wsId,
          userId: 'agent-1',
          metadata: {
            linkedProduct: {
              id: 'prod-1',
              productId: 'prod-1',
              name: 'Produto chat link',
              source: 'owned',
              status: 'draft',
            },
          },
        },
        {} as Response,
        null,
        undefined,
        undefined,
        executeLocalTool as LocalToolExecutor,
      );

      expect(executeLocalTool).not.toHaveBeenCalled();
      expect(replyEngine.buildChatModelMessages).toHaveBeenCalled();
    });

    it('synthesizes deterministic tool observations through the model when the AI provider is available', async () => {
      jest.mocked(chatCompletionWithFallback).mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                'Raciocínio resumido: consultei o catálogo real.\nAções: executei a leitura operacional.\nObservações: encontrei PDRN como produto ativo.\nResposta final: Consultei seu catálogo real e encontrei PDRN ativo para você revisar.',
            },
          },
        ],
        usage: { total_tokens: 222 },
      } as never);
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
      expect(chatCompletionWithFallback).toHaveBeenCalledTimes(1);
      const synthesisCall = jest.mocked(chatCompletionWithFallback).mock.calls[0];
      expect(synthesisCall?.[0]).toBe(replyEngine.openai);
      expect(JSON.stringify(synthesisCall?.[1])).toContain('Produtos: PDRN - R$ 197');
      const streamWriter = (KloelStreamWriter as jest.Mock).mock.results.at(-1)?.value as {
        write: jest.Mock<void, [unknown]>;
      };
      expect(
        streamWriter.write.mock.calls.some(([event]) => {
          if (event === null || typeof event !== 'object' || Array.isArray(event)) {
            return false;
          }
          const candidate = event as { type?: unknown; content?: unknown };
          return (
            candidate.type === 'content' &&
            typeof candidate.content === 'string' &&
            candidate.content.includes('Consultei seu catálogo real')
          );
        }),
      ).toBe(true);
      expect(finalizeSuccessfulReply).toHaveBeenCalledWith(
        expect.stringContaining('Consultei seu catálogo real'),
        222,
        expect.objectContaining({ workspaceId: wsId, message: 'listar produtos' }),
      );
    });

    it('includes canonical receipt proof in deterministic SSE replies', async () => {
      const executeLocalTool = jest.fn().mockResolvedValue({
        success: true,
        products: [{ id: 'prod-1', name: 'PDRN', price: 197 }],
        capabilityId: 'list_products',
        auditLogId: 'audit_catalog_1',
        evidenceUrl: '/produtos',
        domainEvents: ['product.catalog_read'],
        receipt: {
          capabilityId: 'list_products',
          auditLogId: 'audit_catalog_1',
          evidenceUrl: '/produtos',
          domainEvents: ['product.catalog_read'],
          idempotencyKey: 'list_products:ws-1:agent-1',
          success: true,
        },
      });

      await service.think(
        { message: 'listar produtos', workspaceId: wsId, userId: 'agent-1' },
        {} as Response,
        null,
        undefined,
        undefined,
        executeLocalTool as LocalToolExecutor,
      );

      expect(executeLocalTool).toHaveBeenCalledWith(wsId, 'list_products', {}, 'agent-1');

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

      expect(content).toContain('Produtos: PDRN - R$ 197');
      expect(content).toContain('Prova material:');
      expect(content).toContain('Evidência: /produtos');
      expect(content).toContain('AuditLog: audit_catalog_1');
      expect(content).toContain('Eventos: product.catalog_read');
      expect(finalizeSuccessfulReply).toHaveBeenCalledWith(
        expect.stringContaining('Evidência: /produtos'),
        0,
        expect.objectContaining({ workspaceId: wsId, message: 'listar produtos' }),
      );
    });
  });
});
