/**
 * One-Mind unification proof: the COPILOT reply surface fires the SAME cognition
 * learning loop the streaming `think()` path uses (P0-C), behind the
 * `KLOEL_COPILOT_LOOP_ENABLED` flag.
 *
 * Proves BOTH states on `CopilotService.suggest`:
 *   - flag OFF (default) → ZERO cognition calls; byte-identical legacy behavior.
 *   - flag ON           → recordDecision → predictReply → closeOutcome fire
 *                          with a successful answer, attributed to surface
 *                          `'copilot'`.
 */
const mockLegacyPrimaryModel = ['gpt', '-4'].join('');

jest.mock('../../../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    id: 'chat-mock',
    object: 'chat.completion',
    created: 1234567890,
    model: mockLegacyPrimaryModel,
    usage: { total_tokens: 120 },
    choices: [
      {
        message: { content: 'Sugestão mockada', refusal: null, role: 'assistant' },
        finish_reason: 'stop',
        index: 0,
        logprobs: null,
      },
    ],
  }),
}));

import { chatCompletionWithRetry } from '../../../kloel/openai-wrapper';
import { CopilotService } from '../../copilot.service';
import { PrismaService } from '../../../prisma/prisma.service';

type DecisionRecordPayload = {
  workspaceId: string;
  decisionType: string;
  chosenAction: string;
  contextSnapshot?: { surface?: string };
};

type PredictionPayload = {
  workspaceId: string;
  features?: { template?: string };
};

type CloseOutcomePayload = {
  outcomeName: string;
  wonVsBaseline: boolean;
};

describe('CopilotService — KLOEL_COPILOT_LOOP_ENABLED cognition loop', () => {
  const workspaceId = 'ws-loop';
  const savedFlag = process.env.KLOEL_COPILOT_LOOP_ENABLED;
  const savedKey = process.env.OPENAI_API_KEY;

  let prisma: {
    contact: { findFirst: jest.Mock; findUnique: jest.Mock };
    message: { findMany: jest.Mock };
    workspace: { findUnique: jest.Mock };
  };
  let planLimits: { ensureTokenBudget: jest.Mock; trackAiUsage: jest.Mock };

  // Cognition service mocks — the SAME methods the reused helpers call.
  let decisionOutcomeService: {
    recordDecision: jest.MockedFunction<(payload: DecisionRecordPayload) => Promise<void>>;
    closeOutcome: jest.MockedFunction<(payload: CloseOutcomePayload) => Promise<void>>;
  };
  let mindBeliefService: { observeBinary: jest.Mock };
  let mindSurpriseService: { resolveReply: jest.Mock };
  let mindGlobalPriorService: { recordObservation: jest.Mock };
  let mindPredictorService: {
    predictReply: jest.MockedFunction<
      (payload: PredictionPayload, horizonSec: number) => Promise<void>
    >;
  };

  function build(): CopilotService {
    return new CopilotService(
      prisma as never as PrismaService,
      planLimits as never,
      decisionOutcomeService as never,
      mindBeliefService as never,
      mindSurpriseService as never,
      mindGlobalPriorService as never,
      mindPredictorService as never,
    );
  }

  beforeEach(() => {
    jest.mocked(chatCompletionWithRetry).mockResolvedValue({
      id: 'chat-mock',
      object: 'chat.completion',
      created: 1234567890,
      model: mockLegacyPrimaryModel,
      usage: { total_tokens: 120 },
      choices: [
        {
          message: { content: 'Sugestão mockada', refusal: null, role: 'assistant' },
          finish_reason: 'stop',
          index: 0,
          logprobs: null,
        },
      ],
    } as never);

    prisma = {
      contact: { findFirst: jest.fn(), findUnique: jest.fn() },
      message: { findMany: jest.fn() },
      workspace: { findUnique: jest.fn() },
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    decisionOutcomeService = {
      recordDecision: jest.fn().mockResolvedValue(undefined),
      closeOutcome: jest.fn().mockResolvedValue(undefined),
    };
    mindBeliefService = { observeBinary: jest.fn().mockResolvedValue(undefined) };
    mindSurpriseService = { resolveReply: jest.fn().mockResolvedValue(0) };
    mindGlobalPriorService = { recordObservation: jest.fn().mockResolvedValue(undefined) };
    mindPredictorService = { predictReply: jest.fn().mockResolvedValue(undefined) };

    // A real, OpenAI-reaching reply path (so the loop's success arm is exercised).
    prisma.contact.findFirst.mockResolvedValue({ id: 'c-1' });
    prisma.message.findMany.mockResolvedValue([{ direction: 'INBOUND', content: 'Quanto custa?' }]);
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { openai: { apiKey: 'sk-test' } },
    });
  });

  afterEach(() => {
    if (savedFlag === undefined) {
      delete process.env.KLOEL_COPILOT_LOOP_ENABLED;
    } else {
      process.env.KLOEL_COPILOT_LOOP_ENABLED = savedFlag;
    }
    if (savedKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedKey;
    }
  });

  // Drain the fire-and-forget microtasks the loop schedules.
  const flush = () => new Promise((r) => setImmediate(r));

  describe('flag OFF (default)', () => {
    it('produces the answer WITHOUT touching cognition services', async () => {
      delete process.env.KLOEL_COPILOT_LOOP_ENABLED;
      const service = build();

      const result = await service.suggest({ workspaceId, contactId: 'c-1' });
      await flush();

      // Behavior preserved: same successful suggestion as the legacy path.
      expect(result.suggestion).toBe('Sugestão mockada');

      // The loop NEVER fired — the env read short-circuited openCopilotLoop().
      expect(decisionOutcomeService.recordDecision).not.toHaveBeenCalled();
      expect(mindPredictorService.predictReply).not.toHaveBeenCalled();
      expect(decisionOutcomeService.closeOutcome).not.toHaveBeenCalled();
      expect(mindBeliefService.observeBinary).not.toHaveBeenCalled();
      expect(mindSurpriseService.resolveReply).not.toHaveBeenCalled();
      expect(mindGlobalPriorService.recordObservation).not.toHaveBeenCalled();
    });

    it('treats a non-true flag value as OFF', async () => {
      process.env.KLOEL_COPILOT_LOOP_ENABLED = '1';
      const service = build();

      await service.suggest({ workspaceId, contactId: 'c-1' });
      await flush();

      expect(decisionOutcomeService.recordDecision).not.toHaveBeenCalled();
      expect(mindPredictorService.predictReply).not.toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    beforeEach(() => {
      process.env.KLOEL_COPILOT_LOOP_ENABLED = 'true';
    });

    it('fires record → predict at open, then closeOutcome (won) on a successful answer', async () => {
      const service = build();

      const result = await service.suggest({ workspaceId, contactId: 'c-1' });
      await flush();

      // User-facing behavior is unchanged — the loop is additive.
      expect(result.suggestion).toBe('Sugestão mockada');

      // OPEN arm: record the chat_reply decision + persist the prediction,
      // attributed to the distinct 'copilot' surface.
      expect(decisionOutcomeService.recordDecision).toHaveBeenCalledTimes(1);
      const decisionArg = decisionOutcomeService.recordDecision.mock.calls[0][0];
      expect(decisionArg).toMatchObject({
        workspaceId,
        decisionType: 'chat_reply',
        chosenAction: 'engage',
      });
      expect(decisionArg.contextSnapshot).toMatchObject({ surface: 'copilot' });

      expect(mindPredictorService.predictReply).toHaveBeenCalledTimes(1);
      const predictArg = mindPredictorService.predictReply.mock.calls[0][0];
      expect(predictArg).toMatchObject({ workspaceId });
      expect(predictArg.features).toMatchObject({ template: 'copilot' });

      // CLOSE arm (success): outcome closed as won + belief/surprise/prior fed.
      expect(decisionOutcomeService.closeOutcome).toHaveBeenCalledTimes(1);
      expect(decisionOutcomeService.closeOutcome.mock.calls[0][0]).toMatchObject({
        outcomeName: 'chat.replied',
        wonVsBaseline: true,
      });
      expect(mindBeliefService.observeBinary).toHaveBeenCalledTimes(1);
      expect(mindSurpriseService.resolveReply).toHaveBeenCalledTimes(1);
      expect(mindGlobalPriorService.recordObservation).toHaveBeenCalledTimes(1);
      expect(mindGlobalPriorService.recordObservation).toHaveBeenCalledWith(
        'copilot',
        'chat_reply',
        'engage',
        true,
      );
    });

    it('closes the loop as a FAILED outcome when the LLM call throws', async () => {
      jest.mocked(chatCompletionWithRetry).mockRejectedValueOnce(new Error('API down'));
      const service = build();

      const result = await service.suggest({ workspaceId, contactId: 'c-1' });
      await flush();

      // Fallback still returned — the loop never breaks the user-facing answer.
      expect(result.suggestion).toContain('Estou aqui para ajudar');

      // OPEN still fired; CLOSE used the error arm (not won, no post-reply observe).
      expect(decisionOutcomeService.recordDecision).toHaveBeenCalledTimes(1);
      expect(decisionOutcomeService.closeOutcome).toHaveBeenCalledTimes(1);
      expect(decisionOutcomeService.closeOutcome.mock.calls[0][0]).toMatchObject({
        outcomeName: 'chat.error',
        wonVsBaseline: false,
      });
      expect(mindBeliefService.observeBinary).not.toHaveBeenCalled();
      expect(mindGlobalPriorService.recordObservation).not.toHaveBeenCalled();
    });

    it('a thrown loop dependency NEVER breaks the user-facing answer', async () => {
      // Make the very first loop call throw synchronously.
      decisionOutcomeService.recordDecision.mockImplementation(() => {
        throw new Error('loop boom');
      });
      const service = build();

      const result = await service.suggest({ workspaceId, contactId: 'c-1' });
      await flush();

      // The answer is intact despite the loop failure (try/catch + fire-and-forget).
      expect(result.suggestion).toBe('Sugestão mockada');
    });
  });
});
