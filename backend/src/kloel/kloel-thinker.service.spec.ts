import { ForbiddenException } from '@nestjs/common';
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
      expect(replyEngine.hasOpenAiKey).toHaveBeenCalledTimes(1);
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

    it('persists model-generated executable pre-response as thread processing trace', async () => {
      const { finalizeSuccessfulReply: realFinalizeSuccessfulReply } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const { buildProcessingTraceSummary } =
        jest.requireActual<typeof import('./kloel-thread.helpers')>('./kloel-thread.helpers');
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
        buildProcessingTraceSummary,
      };
      const localConversationStore = { saveMessage: jest.fn().mockResolvedValue(undefined) };
      const localStreamWriter = { close: jest.fn() };
      const events: unknown[] = [];

      await realFinalizeSuccessfulReply(
        '**Raciocínio resumido:** entendi o contexto do operador.\n**Ações:** verifiquei a conversa ativa.\n**Observações:** não houve chamada de ferramenta nesta resposta.\n**Resposta final:** A resposta limpa para o usuário.',
        120,
        {
          workspaceId: wsId,
          message: 'Explique seu trace executivo',
          mode: 'chat',
          metadata: {},
          clientRequestId: 'req-trace-1',
          thread: { id: 'thread-trace-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries: [],
          safeWrite: (event) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { unavailableMessage: 'Indisponível.', openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits,
        } as unknown as Parameters<typeof realFinalizeSuccessfulReply>[2],
      );

      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-trace-1',
        wsId,
        'A resposta limpa para o usuário.',
        expect.objectContaining({
          responseVersions: [
            expect.objectContaining({ content: 'A resposta limpa para o usuário.' }),
          ],
          processingTrace: [
            expect.objectContaining({
              phase: 'thinking',
              label: 'Raciocínio resumido: entendi o contexto do operador.',
            }),
            expect.objectContaining({
              phase: 'tool_calling',
              label: 'Ações: verifiquei a conversa ativa.',
            }),
            expect.objectContaining({
              phase: 'tool_result',
              label: 'Observações: não houve chamada de ferramenta nesta resposta.',
            }),
          ],
          processingSummary: 'Entendi o contexto do operador.',
        }),
      );
      expect(localConversationStore.saveMessage).toHaveBeenLastCalledWith(
        wsId,
        'assistant',
        'A resposta limpa para o usuário.',
      );
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'done' })]));
    });

    it('emits action and observation events for deterministic composer capabilities', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: 'Resultado real da busca web.',
          metadata: {
            capability: 'search_web',
            sources: [{ title: 'Fonte', url: 'https://example.com' }],
          },
        }),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };
      const processingTraceEntries = [
        {
          id: 'trace-thinking',
          kind: 'status' as const,
          phase: 'thinking' as const,
          label: 'Raciocínio resumido antes da resposta.',
          createdAt: '2026-06-04T00:00:00.000Z',
        },
        {
          id: 'trace-action',
          kind: 'tool_call' as const,
          phase: 'tool_calling' as const,
          label: 'Consultei contexto operacional relevante antes de responder.',
          tool: 'busca web',
          spanId: 'req-1',
          createdAt: '2026-06-04T00:00:01.000Z',
        },
      ];

      await runComposerCapabilityBranch(
        'search_web',
        'Contexto operacional real',
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'Busque referencias atuais',
          mode: 'chat',
          metadata: { capability: 'search_web' },
          clientRequestId: 'req-1',
          thread: { id: 'thread-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries,
          safeWrite: (event) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits,
        } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
      );

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tool_call', tool: 'search_web' }),
          expect.objectContaining({ type: 'tool_result', tool: 'search_web', success: true }),
          expect.objectContaining({ type: 'content', content: 'Resultado real da busca web.' }),
        ]),
      );
      expect(localComposerService.executeComposerCapability).toHaveBeenCalledWith(
        expect.objectContaining({ capability: 'search_web', message: 'Busque referencias atuais' }),
      );
      expect(localThreadService.buildProcessingTraceSummary).toHaveBeenCalledWith(
        processingTraceEntries,
      );
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        'Resultado real da busca web.',
        expect.objectContaining({
          capability: 'search_web',
          processingSummary: 'Resumo persistido da pré-resposta.',
          processingTrace: expect.arrayContaining([
            expect.objectContaining({
              id: 'trace-thinking',
              label: 'Raciocínio resumido antes da resposta.',
            }),
            expect.objectContaining({
              id: 'trace-action',
              tool: 'busca web',
            }),
          ]) as unknown,
        }),
      );
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'done',
            metadata: expect.objectContaining({
              processingSummary: 'Resumo persistido da pré-resposta.',
              processingTrace: expect.arrayContaining([
                expect.objectContaining({ id: 'trace-thinking' }),
                expect.objectContaining({ id: 'trace-action' }),
              ]) as unknown,
            }) as unknown,
          }),
        ]),
      );
    });

    it('normalizes refine_response markdown at the SSE stream and persistence boundary', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const rawContent =
        '## Diagnóstico executivo Texto bruto inline. ## Lacunas e riscos * Risco um. * Risco dois. ## Versão refinada * Item refinado. ## Próxima ação verificável Validar no Chrome.';
      const normalizedContent =
        '## Diagnóstico executivo\n\nTexto bruto inline.\n\n## Lacunas e riscos\n\n* Risco um.\n* Risco dois.\n\n## Versão refinada\n\n* Item refinado.\n\n## Próxima ação verificável\n\nValidar no Chrome.';
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: rawContent,
          metadata: { capability: 'refine_response' },
        }),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };

      await runComposerCapabilityBranch(
        'refine_response',
        'Contexto operacional real',
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'Refine para documentação pública',
          mode: 'chat',
          metadata: { capability: 'refine_response' },
          clientRequestId: 'req-refine-normalize',
          thread: { id: 'thread-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries: [],
          safeWrite: (event) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits,
        } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
      );

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'content', content: normalizedContent }),
        ]),
      );
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        normalizedContent,
        expect.objectContaining({ capability: 'refine_response' }),
      );
      expect(localConversationStore.saveMessage).toHaveBeenLastCalledWith(
        wsId,
        'assistant',
        normalizedContent,
      );
    });

    it('turns composer provider setup errors into persisted user-facing replies', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const { ERR_SITE_API_KEY_MISSING } = jest.requireActual<
        typeof import('./kloel-composer.service.helpers')
      >('./kloel-composer.service.helpers');
      const localComposerService = {
        executeComposerCapability: jest
          .fn()
          .mockRejectedValue(new Error(ERR_SITE_API_KEY_MISSING)),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };

      await expect(
        runComposerCapabilityBranch(
          'create_site',
          undefined,
          undefined,
          localComposerService as unknown as KloelComposerService,
          {
            workspaceId: wsId,
            message: 'Crie uma landing page',
            mode: 'chat',
            metadata: { capability: 'create_site' },
            clientRequestId: 'req-site-missing-provider',
            thread: { id: 'thread-1', title: 'Nova conversa' },
            persistedUserMessage: { id: 'msg-user-1' },
            processingTraceEntries: [],
            safeWrite: (event) => events.push(event),
            streamWriter: localStreamWriter,
            replyEngine: { openai: null },
            threadService: localThreadService,
            conversationStore: localConversationStore,
            planLimits,
          } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
        ),
      ).resolves.toBeUndefined();

      const contentEvent = events.find(
        (event): event is { type: string; content: string } =>
          !!event &&
          typeof event === 'object' &&
          !Array.isArray(event) &&
          (event as { type?: unknown }).type === 'content',
      );
      expect(contentEvent?.content).toContain('A criação de site está conectada');
      expect(contentEvent?.content).toContain('configuração de geração de sites');
      expect(contentEvent?.content).not.toContain('provedor');
      expect(contentEvent?.content).not.toContain('chave');
      expect(contentEvent?.content).not.toContain('ANTHROPIC');
      expect(contentEvent?.content).not.toContain('API_KEY');
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tool_result', tool: 'create_site', success: false }),
          expect.objectContaining({ type: 'done' }),
        ]),
      );
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        expect.stringContaining('A criação de site está conectada'),
        expect.objectContaining({
          capability: 'create_site',
          capabilityError: true,
          requestState: 'completed',
        }),
      );
      expect(localConversationStore.saveMessage).toHaveBeenLastCalledWith(
        wsId,
        'assistant',
        expect.stringContaining('A criação de site está conectada'),
      );
    });

    it('re-throws real composer provider failures instead of faking a successful turn', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const providerError = new Error('Anthropic API error 503: upstream unavailable');
      const localComposerService = {
        executeComposerCapability: jest.fn().mockRejectedValue(providerError),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };

      await expect(
        runComposerCapabilityBranch(
          'create_site',
          undefined,
          undefined,
          localComposerService as unknown as KloelComposerService,
          {
            workspaceId: wsId,
            message: 'Crie uma landing page',
            mode: 'chat',
            metadata: { capability: 'create_site' },
            clientRequestId: 'req-site-provider-5xx',
            thread: { id: 'thread-1', title: 'Nova conversa' },
            persistedUserMessage: { id: 'msg-user-1' },
            processingTraceEntries: [],
            safeWrite: (event) => events.push(event),
            streamWriter: localStreamWriter,
            replyEngine: { openai: null },
            threadService: localThreadService,
            conversationStore: localConversationStore,
            planLimits,
          } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
        ),
      ).rejects.toBe(providerError);

      // No fake successful turn: no content/done emitted, nothing persisted.
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'done' }));
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'content' }));
      expect(localThreadService.persistAssistantThreadMessage).not.toHaveBeenCalled();
      expect(localConversationStore.saveMessage).not.toHaveBeenCalled();
      expect(localStreamWriter.close).not.toHaveBeenCalled();
    });

    it('keeps generated site HTML out of composer observation events', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const generatedSiteHtml = '<html><body><main>Landing completa gerada</main></body></html>';
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: 'Site gerado e pronto para revisão.',
          metadata: {
            capability: 'create_site',
            generatedSiteHtml,
            siteDraftId: 'site-draft-1',
          },
        }),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue('Resumo persistido da pré-resposta.'),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = {
        saveMessage: jest.fn().mockResolvedValue(undefined),
      };
      const localStreamWriter = { close: jest.fn() };

      await runComposerCapabilityBranch(
        'create_site',
        undefined,
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'Crie uma landing page',
          mode: 'chat',
          metadata: { capability: 'create_site' },
          clientRequestId: 'req-site-1',
          thread: { id: 'thread-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries: [],
          safeWrite: (event) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits,
        } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
      );

      const resultEvent = events.find((event): event is Record<string, unknown> => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
          return false;
        }
        const candidate = event as Record<string, unknown>;
        return candidate.type === 'tool_result';
      });

      expect(JSON.stringify(resultEvent)).not.toContain(generatedSiteHtml);
      expect(resultEvent).toEqual(
        expect.objectContaining({
          result: expect.objectContaining({
            capability: 'create_site',
            generatedSiteHtmlBytes: generatedSiteHtml.length,
            generatedSiteHtmlOmitted: true,
            siteDraftId: 'site-draft-1',
          }) as unknown,
        }),
      );
    });

    it('does not re-check plan budget mid tool-planning turn after the first model call overshoots usage', async () => {
      const { runToolPlanningBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const chatCompletionWithFallbackMock = jest.mocked(chatCompletionWithFallback);
      chatCompletionWithFallbackMock.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'code_outline',
                    arguments: '{"file":"backend/src/kloel/kloel-thinker.service.ts"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 1200 },
      } as never);
      const localPlanLimits = {
        ensureTokenBudget: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValue(
            new ForbiddenException('Limite mensal de tokens IA atingido para o plano FREE.'),
          ),
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
      };
      const events: unknown[] = [];
      const localReplyEngine = {
        openai: {},
        unavailableMessage: replyEngine.unavailableMessage,
        toolRouter: {
          executeAssistantToolCalls: jest
            .fn()
            .mockImplementation((input: { safeWrite: (event: unknown) => void }) => {
              input.safeWrite({
                type: 'tool_call',
                callId: 'call-1',
                spanId: 'call-1',
                tool: 'code_outline',
                args: { file: 'backend/src/kloel/kloel-thinker.service.ts' },
                done: false,
              });
              input.safeWrite({
                type: 'tool_result',
                callId: 'call-1',
                spanId: 'call-1',
                tool: 'code_outline',
                success: true,
                result: { success: true, symbols: [{ name: 'think' }] },
                durationMs: 12,
                done: false,
              });
              return Promise.resolve({
                toolMessages: [
                  {
                    role: 'tool',
                    tool_call_id: 'call-1',
                    content: JSON.stringify({ success: true, symbols: [{ name: 'think' }] }),
                  },
                ],
                receipts: [],
                usedSearchWeb: false,
              });
            }),
        },
        buildChatModelMessages: jest
          .fn()
          .mockResolvedValue([{ role: 'user', content: 'responda com base na observação' }]),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
        buildProcessingTraceSummary: jest
          .fn()
          .mockReturnValue(
            'Raciocínio resumido, 1 ação real e 1 observação antes da resposta final.',
          ),
      };
      const localConversationStore = { saveMessage: jest.fn().mockResolvedValue(undefined) };
      const localStreamWriter = { close: jest.fn() };
      const streamWriterResponse = jest.fn().mockResolvedValue({
        fullResponse:
          'Eu observei a arquitetura real e finalizei sem vazar ferramenta interna.\n<｜｜DSML｜｜tool_calls> <｜｜DSML｜｜invoke name="get_workspace_status"> </｜｜DSML｜｜invoke> </｜｜DSML｜｜tool_calls>',
        estimatedTokens: 320,
      });

      await expect(
        runToolPlanningBranch(
          [{ role: 'user', content: 'valide sua trajetória' }],
          'system prompt',
          'dynamic context',
          null,
          null,
          0.2,
          500,
          jest.fn() as LocalToolExecutor,
          ['code_outline'],
          undefined,
          streamWriterResponse,
          {
            workspaceId: wsId,
            message: 'valide sua trajetória',
            mode: 'chat',
            metadata: {},
            clientRequestId: 'req-1',
            thread: { id: 'thread-1', title: 'Nova conversa' },
            persistedUserMessage: { id: 'msg-user-1' },
            processingTraceEntries: [],
            safeWrite: (event) => events.push(event),
            streamWriter: localStreamWriter,
            replyEngine: localReplyEngine,
            threadService: localThreadService,
            conversationStore: localConversationStore,
            planLimits: localPlanLimits,
          } as unknown as Parameters<typeof runToolPlanningBranch>[11],
        ),
      ).resolves.toBeUndefined();

      expect(localPlanLimits.ensureTokenBudget).toHaveBeenCalledTimes(1);
      expect(streamWriterResponse).toHaveBeenCalled();
      expect(localThreadService.persistAssistantThreadMessage).toHaveBeenCalledWith(
        'thread-1',
        wsId,
        expect.stringContaining('arquitetura real'),
        expect.any(Object),
      );
      const assistantPersistCalls = localThreadService.persistAssistantThreadMessage.mock
        .calls as Array<[string, string, string, unknown]>;
      const persistedAssistantText = assistantPersistCalls[0]?.[2] ?? '';
      expect(persistedAssistantText).not.toContain('DSML');
      expect(persistedAssistantText).not.toContain('tool_calls');
      const writerCalls = streamWriterResponse.mock.calls as Array<[Array<{ content?: unknown }>]>;
      const finalWriterMessages = writerCalls[0]?.[0] ?? [];
      expect(
        finalWriterMessages.some(
          (item) =>
            typeof item.content === 'string' &&
            item.content.includes('resposta final') &&
            item.content.includes('markup de ferramenta'),
        ),
      ).toBe(true);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'tool_call', tool: 'code_outline' }),
          expect.objectContaining({ type: 'tool_result', tool: 'code_outline', success: true }),
          expect.objectContaining({ type: 'done' }),
        ]),
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
      const [abiBuildParams] = buildMock.mock.calls[0];
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

    it('blocks the composer capability branch for an over-budget workspace (budget preflight)', async () => {
      // assertBudget rejects → the composer provider must NOT run, so an
      // over-budget workspace can't keep triggering paid create-site calls.
      (llmBudget.assertBudget as jest.Mock).mockRejectedValueOnce(
        new ForbiddenException({ code: 'llm_budget_exceeded' }),
      );
      jest.mocked(runComposerCapabilityBranch).mockClear();

      await service.think(
        {
          message: 'crie uma landing page curta',
          workspaceId: wsId,
          userId: 'agent-1',
          metadata: { capability: 'create_site' },
        },
        {} as Response,
        'create_site',
        undefined,
        undefined,
        jest.fn() as LocalToolExecutor,
      );

      expect(llmBudget.assertBudget).toHaveBeenCalledTimes(1);
      // The paid composer provider must never be reached when over budget.
      expect(runComposerCapabilityBranch).not.toHaveBeenCalled();
      // A terminal error event is surfaced (same behavior as the normal path).
      const streamWriter = (KloelStreamWriter as jest.Mock).mock.results.at(-1)?.value as {
        write: jest.Mock<void, [unknown]>;
        close: jest.Mock;
      };
      expect(
        streamWriter.write.mock.calls.some(([event]) => {
          if (event === null || typeof event !== 'object' || Array.isArray(event)) {
            return false;
          }
          const maybeEvent = event as { type?: unknown; done?: unknown };
          return maybeEvent.type === 'error' && maybeEvent.done === true;
        }),
      ).toBe(true);
    });

    it('accounts estimatedTokens after a successful composer capability call', async () => {
      const { runComposerCapabilityBranch } = jest.requireActual<
        typeof import('./kloel-thinker-think.helpers')
      >('./kloel-thinker-think.helpers');
      const events: unknown[] = [];
      const localComposerService = {
        executeComposerCapability: jest.fn().mockResolvedValue({
          content: 'Imagem gerada com sucesso.',
          metadata: { capability: 'create_image' },
          estimatedTokens: 512,
        }),
      };
      const localThreadService = {
        persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
        buildThreadMessageMetadata: jest.fn((_metadata: unknown, meta: unknown): unknown => meta),
        buildProcessingTraceSummary: jest.fn().mockReturnValue(undefined),
        maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
        maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
      };
      const localConversationStore = { saveMessage: jest.fn().mockResolvedValue(undefined) };
      const localStreamWriter = { close: jest.fn() };
      const localPlanLimits = {
        ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
      };
      const localLlmBudget = {
        assertBudget: jest.fn().mockResolvedValue(undefined),
        recordSpend: jest.fn().mockResolvedValue(undefined),
      };

      await runComposerCapabilityBranch(
        'create_image',
        'Contexto operacional real',
        undefined,
        localComposerService as unknown as KloelComposerService,
        {
          workspaceId: wsId,
          message: 'gere uma imagem do produto',
          mode: 'chat',
          metadata: { capability: 'create_image' },
          clientRequestId: 'req-1',
          thread: { id: 'thread-1', title: 'Nova conversa' },
          persistedUserMessage: { id: 'msg-user-1' },
          processingTraceEntries: [],
          safeWrite: (event) => events.push(event),
          streamWriter: localStreamWriter,
          replyEngine: { openai: null },
          threadService: localThreadService,
          conversationStore: localConversationStore,
          planLimits: localPlanLimits,
          llmBudget: localLlmBudget,
        } as unknown as Parameters<typeof runComposerCapabilityBranch>[4],
      );

      // estimatedTokens flow into the SAME ledgers the normal chat path uses.
      expect(localPlanLimits.trackAiUsage).toHaveBeenCalledWith(wsId, 512);
      expect(localLlmBudget.recordSpend).toHaveBeenCalledWith(wsId, 512);
    });
  });
});
