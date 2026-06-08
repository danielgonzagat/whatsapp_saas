/**
 * P0-C: proves the cognition learning loop FIRES on the streaming primary chat
 * surface (`KloelThinkerService.think`) ONLY behind the KLOEL_THINK_LOOP_ENABLED
 * feature flag.
 *
 * - Flag OFF (explicit `=false`): none of the loop's underlying services are
 *   touched — recordDecision / predictReply / resolveReply / closeOutcome are
 *   NOT called. `think()` behaves exactly as legacy.
 * - Flag ON (default, or explicit `=true`): the SAME envelope the proven sync
 *   path uses fires, in order:
 *     recordChatReplyDecision (DecisionOutcomeService.recordDecision)
 *       → predictReply (MindPredictorService.predictReply)
 *       → [stream + finalize]
 *       → closeChatReplyOutcome (DecisionOutcomeService.closeOutcome 'chat.replied')
 *       → resolveReply (MindSurpriseService.resolveReply)
 *
 * The cognition services are mocked; the REAL reused helper functions run so the
 * call sequence is asserted end-to-end, not stubbed.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService } from './llm-budget.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { StateBuilderService } from './state/state-builder.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindEventProcessorService } from './mind/runtime/mind-event-processor.service';
import { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import { MindPredictorService } from './mind/inference/mind-predictor.service';
import { ValenceTaggerService } from './mind/valence-tagger.service';

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

jest.mock('./kloel-thinker.helpers', () => ({
  thinkSyncImpl: jest.fn(),
  regenerateThreadAssistantResponseImpl: jest.fn(),
}));

// Keep the deterministic/composer/tool branches inert; we only exercise the
// plain conversational stream where the loop is wired. finalizeSuccessfulReply
// is mocked so the spec doesn't depend on thread persistence internals.
jest.mock('./kloel-thinker-think.helpers', () => {
  const actual = jest.requireActual<typeof import('./kloel-thinker-think.helpers')>(
    './kloel-thinker-think.helpers',
  );
  return {
    ...actual,
    runComposerCapabilityBranch: jest.fn(),
    runToolPlanningBranch: jest.fn(),
    finalizeSuccessfulReply: jest.fn().mockResolvedValue(undefined),
    persistChatTurnToSpine: jest.fn(),
  };
});

jest.mock('./kloel-conversation-store', () => ({
  KloelConversationStore: jest.fn().mockImplementation(() => ({
    getConversationMessages: jest.fn().mockResolvedValue([]),
    saveMessage: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Stream a NON-empty reply so the success arm (replyOutcome=1) runs.
jest.mock('./kloel-stream-writer', () => ({
  KloelStreamWriter: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    write: jest.fn(),
    close: jest.fn(),
    streamModelResponse: jest
      .fn()
      .mockResolvedValue({ fullResponse: 'Olá! Como posso ajudar?', estimatedTokens: 10 }),
  })),
}));

import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { KLOEL_LLM_E2E_GUARD } from './kloel-llm-e2e-guard';
import { KloelThinkerService } from './kloel-thinker.service';

type ThinkerPrismaMock = {
  workspace: { findUnique: jest.Mock };
  agent: { findFirst: jest.Mock };
  chatThread: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  chatMessage: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  autopilotEvent: { create: jest.Mock };
  $transaction: jest.Mock;
};

describe('KloelThinkerService — P0-C streaming cognition loop (KLOEL_THINK_LOOP_ENABLED)', () => {
  const wsId = 'ws-loop-1';
  let service: KloelThinkerService;
  let prisma: ThinkerPrismaMock;

  // Cognition service mocks — the loop's underlying producers.
  let decisionOutcomeService: { recordDecision: jest.Mock; closeOutcome: jest.Mock };
  let mindPredictorService: {
    predictReply: jest.MockedFunction<(payload: unknown, latencyMs: number) => Promise<unknown>>;
  };
  let mindSurpriseService: { resolveReply: jest.Mock; computeSurprise: jest.Mock };
  let mindBeliefService: { observeBinary: jest.Mock; getOrInit: jest.Mock };
  let mindGlobalPriorService: { recordObservation: jest.Mock };
  let mindEventProcessorService: { process: jest.Mock };
  let valenceTagger: { tag: jest.Mock };

  const originalFlag = process.env.KLOEL_THINK_LOOP_ENABLED;

  const buildService = async (): Promise<KloelThinkerService> => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: wsId }) },
      agent: { findFirst: jest.fn().mockResolvedValue({ name: 'Test User' }) },
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'thread-1', title: 'Nova conversa' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatMessage: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      autopilotEvent: { create: jest.fn().mockResolvedValue({ id: 'ae-1' }) },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };

    const planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    const llmBudget = {
      assertBudget: jest.fn().mockResolvedValue(undefined),
      recordSpend: jest.fn().mockResolvedValue(undefined),
    };
    const threadService = {
      resolveThread: jest.fn().mockResolvedValue(null),
      getThreadConversationState: jest
        .fn()
        .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
      buildThreadSummarySystemMessage: jest.fn().mockReturnValue(null),
      persistUserThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-user-1' }),
      buildThreadMessageMetadata: jest.fn().mockReturnValue({}),
      resolveClientRequestId: jest.fn().mockReturnValue('req-1'),
      appendStoredProcessingTraceEntry: jest.fn(),
    };
    const wsContextService = {
      getWorkspaceContext: jest.fn().mockResolvedValue('Company context'),
    };
    const composerService = { searchWeb: jest.fn() };
    const replyEngine = {
      hasOpenAiKey: jest.fn().mockReturnValue(true),
      buildDashboardPrompt: jest.fn().mockReturnValue('system prompt'),
      buildChatModelMessages: jest.fn().mockResolvedValue([]),
      buildDynamicRuntimeContext: jest.fn().mockResolvedValue(''),
      buildMarketingPromptAddendum: jest.fn().mockResolvedValue(null),
      detectExpertiseLevel: jest.fn().mockReturnValue('beginner'),
      shouldAttemptToolPlanningPass: jest.fn().mockReturnValue(false),
      shouldUseLongFormBudget: jest.fn().mockReturnValue(false),
      isClientDisconnected: jest.fn().mockReturnValue(false),
      buildStreamAbortMessage: jest.fn().mockReturnValue('timeout'),
      openai: {},
      unavailableMessage: 'Indisponível no momento.',
      contextFormatter: { sanitizeUserNameForAssistant: jest.fn().mockReturnValue('User') },
    };
    const llmE2EGuard = { isEnabled: jest.fn().mockReturnValue(false), buildStream: jest.fn() };
    const stateBuilder = {
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
    };
    // ABI off → plain conversational stream path (where the loop is wired).
    const abiBuilder = {
      build: jest.fn().mockResolvedValue({ status: 'lineage_compromised', reason: 'test' }),
    };
    const capabilityExecutor = { buildCognitiveSubstrate: jest.fn().mockResolvedValue({}) };

    decisionOutcomeService = {
      recordDecision: jest.fn().mockResolvedValue(undefined),
      closeOutcome: jest.fn().mockResolvedValue(undefined),
    };
    mindPredictorService = {
      predictReply: jest.fn().mockResolvedValue({ confidence: 0.5 }),
    };
    mindSurpriseService = {
      resolveReply: jest.fn().mockResolvedValue(0.1),
      computeSurprise: jest.fn().mockReturnValue(0.1),
    };
    mindBeliefService = {
      observeBinary: jest.fn().mockResolvedValue(undefined),
      getOrInit: jest.fn().mockResolvedValue({ mean: 0.5 }),
    };
    mindGlobalPriorService = { recordObservation: jest.fn().mockResolvedValue(undefined) };
    mindEventProcessorService = { process: jest.fn().mockResolvedValue(undefined) };
    valenceTagger = { tag: jest.fn() };

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
        { provide: StateBuilderService, useValue: stateBuilder },
        { provide: AbiBuilderService, useValue: abiBuilder },
        { provide: MindCapabilityExecutor, useValue: capabilityExecutor },
        { provide: DecisionOutcomeService, useValue: decisionOutcomeService },
        { provide: MindPredictorService, useValue: mindPredictorService },
        { provide: MindSurpriseService, useValue: mindSurpriseService },
        { provide: MindBeliefService, useValue: mindBeliefService },
        { provide: MindGlobalPriorService, useValue: mindGlobalPriorService },
        { provide: MindEventProcessorService, useValue: mindEventProcessorService },
        { provide: ValenceTaggerService, useValue: valenceTagger },
      ],
    }).compile();

    return module.get<KloelThinkerService>(KloelThinkerService);
  };

  const runThink = async (): Promise<void> => {
    await service.think(
      { message: 'oi kloel', workspaceId: wsId },
      {},
      null,
      undefined,
      undefined,
      jest.fn(),
    );
    // Let the fire-and-forget post-reply microtasks settle.
    await new Promise((r) => setImmediate(r));
  };

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_THINK_LOOP_ENABLED;
    } else {
      process.env.KLOEL_THINK_LOOP_ENABLED = originalFlag;
    }
    jest.clearAllMocks();
  });

  describe('flag OFF (explicit =false)', () => {
    it('does NOT call cognition-loop producers', async () => {
      process.env.KLOEL_THINK_LOOP_ENABLED = 'false';
      service = await buildService();

      await runThink();

      expect(decisionOutcomeService.recordDecision).not.toHaveBeenCalled();
      expect(mindPredictorService.predictReply).not.toHaveBeenCalled();
      expect(decisionOutcomeService.closeOutcome).not.toHaveBeenCalled();
      expect(mindSurpriseService.resolveReply).not.toHaveBeenCalled();
      expect(mindBeliefService.observeBinary).not.toHaveBeenCalled();
      expect(mindGlobalPriorService.recordObservation).not.toHaveBeenCalled();
    });

    it('treats an explicit non-false value as ON', async () => {
      process.env.KLOEL_THINK_LOOP_ENABLED = 'true';
      service = await buildService();

      await runThink();

      expect(decisionOutcomeService.recordDecision).toHaveBeenCalled();
      expect(mindPredictorService.predictReply).toHaveBeenCalled();
    });
  });

  describe('flag ON (default — env unset)', () => {
    it('fires the cognition loop when KLOEL_THINK_LOOP_ENABLED is unset', async () => {
      delete process.env.KLOEL_THINK_LOOP_ENABLED;
      service = await buildService();

      await runThink();

      expect(decisionOutcomeService.recordDecision).toHaveBeenCalledTimes(1);
      expect(mindPredictorService.predictReply).toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    beforeEach(async () => {
      process.env.KLOEL_THINK_LOOP_ENABLED = 'true';
      service = await buildService();
      await runThink();
    });

    it('records the chat_reply decision BEFORE predicting the reply', async () => {
      expect(decisionOutcomeService.recordDecision).toHaveBeenCalledTimes(1);
      expect(decisionOutcomeService.recordDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          decisionType: 'chat_reply',
          chosenAction: 'engage',
          baselineAction: 'silence',
        }),
      );
      const recordOrder = decisionOutcomeService.recordDecision.mock.invocationCallOrder[0];
      const predictOrder = mindPredictorService.predictReply.mock.invocationCallOrder[0];
      expect(recordOrder).toBeLessThan(predictOrder);
    });

    it('predicts the reply with the canonical features at stream start', async () => {
      expect(mindPredictorService.predictReply).toHaveBeenCalledTimes(1);
      expect(mindPredictorService.predictReply.mock.calls[0]?.[0]).toMatchObject({
        workspaceId: wsId,
        subject: wsId,
        features: { template: 'dashboard', channel: 'dashboard' },
      });
      expect(mindPredictorService.predictReply.mock.calls[0]?.[1]).toBe(60);
    });

    it('closes the outcome as chat.replied (won) AFTER the reply', async () => {
      expect(decisionOutcomeService.closeOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ outcomeName: 'chat.replied', wonVsBaseline: true }),
      );
    });

    it('resolves the prediction loop and feeds belief + global prior on success', async () => {
      expect(mindSurpriseService.resolveReply).toHaveBeenCalledWith(wsId, wsId, 1);
      expect(mindBeliefService.observeBinary).toHaveBeenCalledWith(
        wsId,
        wsId,
        'replied_to_user',
        expect.objectContaining({ surface: 'dashboard' }),
        1,
      );
      expect(mindGlobalPriorService.recordObservation).toHaveBeenCalledWith(
        'dashboard',
        'chat_reply',
        'engage',
        true,
      );
    });

    it('fires the full envelope in order: record → predict → close → resolve', async () => {
      const record = decisionOutcomeService.recordDecision.mock.invocationCallOrder[0];
      const predict = mindPredictorService.predictReply.mock.invocationCallOrder[0];
      const close = decisionOutcomeService.closeOutcome.mock.invocationCallOrder[0];
      const resolve = mindSurpriseService.resolveReply.mock.invocationCallOrder[0];
      expect(record).toBeLessThan(predict);
      expect(predict).toBeLessThan(close);
      expect(close).toBeLessThan(resolve);
    });
  });
});
