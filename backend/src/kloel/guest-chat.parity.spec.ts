import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GuestChatService } from './guest-chat.service';
import { SpineEmitterService } from './spine/spine-emitter.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';

jest.mock('openai', () => {
  const mockCompletions = { create: jest.fn() };
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: mockCompletions },
    })),
  };
});

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  chatCompletionWithRetry: jest.fn(),
}));

const TEXT_LLM_KEY_NAMES = ['DEEPSEEK_API_KEY', 'LLM_API_KEY', 'OPENAI_API_KEY'] as const;
type TextLlmKeyName = (typeof TEXT_LLM_KEY_NAMES)[number];
const originalTextLlmEnv = new Map<TextLlmKeyName, string | undefined>(
  TEXT_LLM_KEY_NAMES.map((key) => [key, process.env[key]]),
);

function setTextLlmEnv(value: string | undefined): void {
  for (const key of TEXT_LLM_KEY_NAMES) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreTextLlmEnv(): void {
  for (const key of TEXT_LLM_KEY_NAMES) {
    const value = originalTextLlmEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('GuestChatService — Cognitive Parity (PI-K19-A)', () => {
  let service: GuestChatService;
  let chatCompletionWithFallbackMock: jest.Mock;
  let chatCompletionWithRetryMock: jest.Mock;
  let mockConfigGet: jest.Mock;
  let mockRedis: { get: jest.Mock; set: jest.Mock };
  let mockSpineEmitter: { emit: jest.Mock };
  let mockDecisionOutcome: { recordDecision: jest.Mock; closeOutcome: jest.Mock };
  let mockMindBelief: { observeBinary: jest.Mock; getOrInit: jest.Mock };
  let mockMindSurprise: { computeSurprise: jest.Mock };

  async function createService(withCognitive: boolean) {
    const { chatCompletionWithFallback, chatCompletionWithRetry } =
      await import('./openai-wrapper');
    chatCompletionWithFallbackMock = chatCompletionWithFallback as jest.Mock;
    chatCompletionWithRetryMock = chatCompletionWithRetry as jest.Mock;

    chatCompletionWithFallbackMock.mockResolvedValue({
      choices: [{ message: { content: 'Olá! Como posso ajudar?' } }],
      usage: { total_tokens: 80 },
    });

    mockSpineEmitter = { emit: jest.fn().mockResolvedValue(undefined) };
    mockDecisionOutcome = {
      recordDecision: jest.fn().mockResolvedValue(undefined),
      closeOutcome: jest.fn().mockResolvedValue(undefined),
    };
    mockMindBelief = {
      observeBinary: jest.fn().mockResolvedValue(undefined),
      getOrInit: jest.fn().mockResolvedValue({ mean: 0.5, variance: 0.1, samples: 10 }),
    };
    mockMindSurprise = { computeSurprise: jest.fn().mockReturnValue(0.1) };

    const mockConfig = { get: mockConfigGet };

    const providers: Array<unknown> = [
      GuestChatService,
      { provide: ConfigService, useValue: mockConfig },
      { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
    ];

    if (withCognitive) {
      providers.push({ provide: SpineEmitterService, useValue: mockSpineEmitter });
      providers.push({ provide: DecisionOutcomeService, useValue: mockDecisionOutcome });
      providers.push({ provide: MindBeliefService, useValue: mockMindBelief });
      providers.push({ provide: MindSurpriseService, useValue: mockMindSurprise });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    service = module.get<GuestChatService>(GuestChatService);
  }

  beforeEach(() => {
    setTextLlmEnv('sk-test-key');
    mockConfigGet = jest.fn().mockImplementation((key: string) => {
      if (TEXT_LLM_KEY_NAMES.some((llmKey) => llmKey === key)) {
        return 'sk-test-key';
      }
      return undefined;
    });
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    restoreTextLlmEnv();
  });

  describe('1. Cognition decision emit', () => {
    it('emits cognition.decision_made via SpineEmitterService on chatSync reply', async () => {
      await createService(true);

      await service.chatSync('Olá', 'cog-session-1', 'ws-test-001');

      expect(mockSpineEmitter.emit).toHaveBeenCalledTimes(1);
      const matcher = expect.objectContaining({
        eventName: 'cognition.decision_made',
        workspaceId: 'ws-test-001',
        truthMode: 'observed',
        provenance: expect.objectContaining({
          source: 'guest-chat',
          surface: 'guest',
        }) as unknown,
        payload: expect.objectContaining({
          decision: 'engage',
          messageLength: 3,
        }) as unknown,
      });
      expect(mockSpineEmitter.emit).toHaveBeenCalledWith(matcher);
    });

    it('tolerates absent SpineEmitterService — does not crash', async () => {
      await createService(false);

      const reply = await service.chatSync('Olá', 'cog-session-2', 'ws-test-001');

      expect(reply).toBe('Olá! Como posso ajudar?');
    });

    it('tolerates spineEmitter.emit rejection gracefully', async () => {
      await createService(true);
      mockSpineEmitter.emit.mockRejectedValue(new Error('ring buffer full'));

      const reply = await service.chatSync('Olá', 'cog-session-3', 'ws-test-001');

      expect(reply).toBe('Olá! Como posso ajudar?');
    });
  });

  describe('2. Belief observed after reply', () => {
    it('observes replied_to_user belief after successful chatSync reply', async () => {
      await createService(true);

      await service.chatSync('Olá', 'belief-session-1', 'ws-test-001');

      expect(mockMindBelief.observeBinary).toHaveBeenCalled();
      const calls = mockMindBelief.observeBinary.mock.calls as Array<
        [string, string, string, Record<string, unknown>, number]
      >;
      const beliefCall = calls.find(([, , predicate]) => predicate === 'replied_to_user');
      expect(beliefCall).toBeDefined();
      expect(beliefCall![3]).toEqual(expect.objectContaining({ surface: 'guest' }));
      expect(beliefCall![4]).toBe(1);
    });

    it('still observes belief when LLM degrades (unavailable message)', async () => {
      await createService(true);
      chatCompletionWithFallbackMock.mockRejectedValueOnce(new Error('timeout'));
      chatCompletionWithRetryMock.mockRejectedValue(new Error('all emergency models down'));

      await service.chatSync('Teste', 'belief-session-2', 'ws-test-001');

      // Even on LLM degradation, observeBinary is called (observed=1 because
      // unavailable message has content)
      expect(mockMindBelief.observeBinary).toHaveBeenCalled();
      const calls = mockMindBelief.observeBinary.mock.calls as Array<
        [string, string, string, Record<string, unknown>, number]
      >;
      const beliefCall = calls.find(([, , predicate]) => predicate === 'replied_to_user');
      expect(beliefCall).toBeDefined();
      expect(beliefCall![4]).toBe(1);
    });

    it('tolerates absent MindBeliefService', async () => {
      await createService(false);

      const reply = await service.chatSync('Olá', 'belief-session-3', 'ws-test-001');

      expect(reply).toBe('Olá! Como posso ajudar?');
    });
  });

  describe('3. Surprise computed after reply', () => {
    it('calls computeSurprise with predicted vs observed after chatSync', async () => {
      await createService(true);
      mockMindSurprise.computeSurprise.mockReturnValue(0.45);

      await service.chatSync('Olá', 'surprise-session-1', 'ws-test-001');

      expect(mockMindSurprise.computeSurprise).toHaveBeenCalled();
    });

    it('tolerates absent MindSurpriseService', async () => {
      await createService(false);

      const reply = await service.chatSync('Olá', 'surprise-session-2', 'ws-test-001');

      expect(reply).toBe('Olá! Como posso ajudar?');
    });

    it('still computes surprise when LLM degrades (unavailable message)', async () => {
      await createService(true);
      chatCompletionWithFallbackMock.mockRejectedValueOnce(new Error('timeout'));
      chatCompletionWithRetryMock.mockRejectedValue(new Error('all emergency models down'));

      await service.chatSync('Teste', 'surprise-session-3', 'ws-test-001');

      // computeSurprise is called even when the LLM falls back to unavailable message
      expect(mockMindSurprise.computeSurprise).toHaveBeenCalled();
    });
  });

  describe('4. All cognitive services @Optional', () => {
    it('instantiates and functions without any cognitive services injected', async () => {
      await createService(false);

      const reply = await service.chatSync('Olá', 'optional-session-1', 'ws-test-001');

      expect(reply).toBe('Olá! Como posso ajudar?');
      expect(chatCompletionWithFallbackMock).toHaveBeenCalled();
    });

    it('handles chatSync with partial cognitive services (only spine)', async () => {
      const { chatCompletionWithFallback } = await import('./openai-wrapper');
      chatCompletionWithFallbackMock = chatCompletionWithFallback as jest.Mock;
      chatCompletionWithFallbackMock.mockResolvedValue({
        choices: [{ message: { content: 'Hello!' } }],
        usage: { total_tokens: 50 },
      });

      mockSpineEmitter = { emit: jest.fn().mockResolvedValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GuestChatService,
          { provide: ConfigService, useValue: { get: mockConfigGet } },
          { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
          { provide: SpineEmitterService, useValue: mockSpineEmitter },
        ],
      }).compile();

      const partialService = module.get<GuestChatService>(GuestChatService);
      const reply = await partialService.chatSync('Hi', 'partial-session', 'ws-test-001');

      expect(reply).toBe('Hello!');
    });
  });
});
