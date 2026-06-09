/**
 * Proves the ADDITIVE capability-turn observability closure
 * (KLOEL_CAPABILITY_TURN_LEARN) on the `thinkSyncImpl` sync chat path.
 *
 * The gap: when a composer capability produces the reply, `thinkSyncImpl` uses
 * `capabilityResult?.content` and `buildAssistantReply` never runs — so NONE of
 * the reply engine's learning hooks fire and the capability turn is INVISIBLE to
 * the Mind. This flag records the turn as a `capability_reply` decision so the
 * turn is OBSERVABLE, WITHOUT changing which reply is returned.
 *
 * Coverage:
 *  - Flag OFF (default + explicit non-'true'): recordDecision is NOT called for a
 *    capability turn; the returned reply is the verbatim capability content.
 *  - Flag ON: a capability turn records EXACTLY ONE `capability_reply` decision
 *    (chosenAction = capability name) — the loop closes — and the returned reply
 *    is STILL the verbatim capability content (reply path unchanged).
 *  - Flag ON but NON-capability turn (reply-engine path): recordDecision is NOT
 *    called by this closure (it only fires when a capability produced the reply).
 *  - Flag ON but service absent (fail-open): no throw, reply still returned.
 *
 * The unit under test is the REAL `thinkSyncImpl` + REAL flag helper; only the
 * collaborator services are mocked, so the gate + call sequence are asserted
 * end-to-end, not stubbed.
 */
import { thinkSyncImpl } from './kloel-thinker.helpers';
import {
  CAPABILITY_REPLY_DECISION_TYPE,
  isCapabilityTurnLearnEnabled,
} from './capability-turn-learn.flag';
import type { ThinkRequest } from './kloel-thinker.types';

const CAPABILITY_CONTENT = 'Resultado real da capacidade (ex.: busca web).';
const REPLY_ENGINE_CONTENT = 'Resposta do motor de conversa.';
const WS = 'ws-capability-1';

function makeDecisionOutcomeMock() {
  return {
    recordDecision: jest.fn().mockResolvedValue(undefined),
    closeOutcome: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(decisionOutcomeService?: ReturnType<typeof makeDecisionOutcomeMock>) {
  const replyEngine = {
    hasOpenAiKey: jest.fn().mockReturnValue(true),
    buildAssistantReply: jest.fn().mockResolvedValue(REPLY_ENGINE_CONTENT),
    openai: null,
  };
  const composerService = {
    executeComposerCapability: jest
      .fn()
      .mockResolvedValue({ content: CAPABILITY_CONTENT, metadata: { capability: 'search_web' } }),
  };
  const threadService = {
    resolveThread: jest.fn().mockResolvedValue(null),
    getThreadConversationState: jest
      .fn()
      .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
    resolveClientRequestId: jest.fn().mockReturnValue('req-1'),
    buildThreadMessageMetadata: jest.fn().mockReturnValue({}),
    persistUserThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-user-1' }),
    persistAssistantThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-assistant-1' }),
    maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
    maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Nova conversa'),
  };
  const conversationStore = { saveMessage: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    autopilotEvent: { create: jest.fn().mockResolvedValue({ id: 'ae-1' }) },
  };
  const planLimits = {};

  const deps = {
    replyEngine,
    prisma,
    threadService,
    composerService,
    conversationStore,
    planLimits,
    ...(decisionOutcomeService ? { decisionOutcomeService } : {}),
  } as unknown as Parameters<typeof thinkSyncImpl>[3];

  return { deps, replyEngine, composerService };
}

const request: ThinkRequest = { message: 'oi kloel', workspaceId: WS, mode: 'chat' };

describe('KLOEL_CAPABILITY_TURN_LEARN — capability-turn observability closure', () => {
  const original = process.env.KLOEL_CAPABILITY_TURN_LEARN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.KLOEL_CAPABILITY_TURN_LEARN;
    } else {
      process.env.KLOEL_CAPABILITY_TURN_LEARN = original;
    }
    jest.clearAllMocks();
  });

  describe('flag OFF (default)', () => {
    beforeEach(() => {
      delete process.env.KLOEL_CAPABILITY_TURN_LEARN;
    });

    it('reports the gate as disabled', () => {
      expect(isCapabilityTurnLearnEnabled()).toBe(false);
    });

    it('does NOT record a capability_reply decision for a capability turn', async () => {
      const decisionOutcomeService = makeDecisionOutcomeMock();
      const { deps } = makeDeps(decisionOutcomeService);

      const result = await thinkSyncImpl(request, 'search_web', undefined, deps);

      expect(decisionOutcomeService.recordDecision).not.toHaveBeenCalled();
      // Reply path unchanged: the verbatim capability content is returned.
      expect(result.response).toBe(CAPABILITY_CONTENT);
    });

    it('treats an explicit non-true value as OFF', async () => {
      process.env.KLOEL_CAPABILITY_TURN_LEARN = 'false';
      const decisionOutcomeService = makeDecisionOutcomeMock();
      const { deps } = makeDeps(decisionOutcomeService);

      await thinkSyncImpl(request, 'search_web', undefined, deps);

      expect(decisionOutcomeService.recordDecision).not.toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    beforeEach(() => {
      process.env.KLOEL_CAPABILITY_TURN_LEARN = 'true';
    });

    it('reports the gate as enabled', () => {
      expect(isCapabilityTurnLearnEnabled()).toBe(true);
    });

    it('CLOSES THE LOOP: records exactly one capability_reply decision naming the capability', async () => {
      const decisionOutcomeService = makeDecisionOutcomeMock();
      const { deps } = makeDeps(decisionOutcomeService);

      const result = await thinkSyncImpl(request, 'search_web', undefined, deps);
      // Let the fire-and-forget record microtask settle.
      await new Promise((r) => setImmediate(r));

      expect(decisionOutcomeService.recordDecision).toHaveBeenCalledTimes(1);
      expect(decisionOutcomeService.recordDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WS,
          decisionType: CAPABILITY_REPLY_DECISION_TYPE,
          chosenAction: 'search_web',
          baselineAction: 'reply_engine',
          expectedWindow: 1,
          outcomeKey: expect.stringMatching(
            /^capability:ws-capability-1:\d+:[0-9a-f]{6}$/,
          ) as string,
          contextSnapshot: expect.objectContaining({
            surface: 'chat',
            capability: 'search_web',
            replyLength: CAPABILITY_CONTENT.length,
          }) as Record<string, unknown>,
        }),
      );
      // The reply itself is UNCHANGED — still the verbatim capability content.
      expect(result.response).toBe(CAPABILITY_CONTENT);
    });

    it('does NOT record for a NON-capability (reply-engine) turn', async () => {
      const decisionOutcomeService = makeDecisionOutcomeMock();
      const { deps, replyEngine, composerService } = makeDeps(decisionOutcomeService);

      // composerCapability=null → no capability executed → buildAssistantReply runs.
      const result = await thinkSyncImpl(request, null, undefined, deps);
      await new Promise((r) => setImmediate(r));

      expect(composerService.executeComposerCapability).not.toHaveBeenCalled();
      expect(replyEngine.buildAssistantReply).toHaveBeenCalledTimes(1);
      // This closure must NOT fire on the reply-engine path (that path has its
      // own chat_reply learning hooks inside buildAssistantReply).
      expect(decisionOutcomeService.recordDecision).not.toHaveBeenCalled();
      expect(result.response).toBe(REPLY_ENGINE_CONTENT);
    });

    it('is fail-open: a recordDecision rejection never breaks the reply', async () => {
      const decisionOutcomeService = makeDecisionOutcomeMock();
      decisionOutcomeService.recordDecision.mockRejectedValueOnce(new Error('db down'));
      const { deps } = makeDeps(decisionOutcomeService);

      const result = await thinkSyncImpl(request, 'search_web', undefined, deps);
      await new Promise((r) => setImmediate(r));

      expect(result.response).toBe(CAPABILITY_CONTENT);
    });

    it('is fail-open when the DecisionOutcomeService is absent', async () => {
      const { deps } = makeDeps(undefined);

      const result = await thinkSyncImpl(request, 'search_web', undefined, deps);

      expect(result.response).toBe(CAPABILITY_CONTENT);
    });
  });
});
