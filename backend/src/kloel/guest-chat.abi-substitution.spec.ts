/**
 * UTP-ABI-005 — Guest Chat ABI substitution contract spec.
 *
 * Implements PCI.2 §8 (docs/contracts/pci/02-abi-schema.md).
 *
 * Validates the ABI substitution in GuestChatService:
 *  - AbiBuilderService available: user message = structured JSON ABI payload.
 *  - AbiBuilderService unavailable/invalid: user message = honest structured fallback.
 *  - No `role: system` message is sent from this guest chat path.
 *  - No behavioral instruction pattern is emitted as a prompt message.
 *  - ABI payload validates via validateAbiPayload.
 *  - AbiBuilderService is called with audience=public.
 *  - Empty input returns early without LLM call.
 */

import { GuestChatService } from './guest-chat.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { validateAbiPayload } from './abi/abi-validator';
import { ABI_VERSION } from './abi/abi-schema';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  chatCompletionWithRetry: jest.fn(),
}));

jest.mock('../lib/llm-provider', () => ({
  createTextLlmClient: jest.fn().mockReturnValue({}),
  resolveTextLlmApiKey: jest.fn().mockReturnValue('sk-test-key'),
}));

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn().mockReturnValue('gpt-test-model'),
}));

function makeValidAbi(overrides: Record<string, unknown> = {}) {
  return {
    abiVersion: ABI_VERSION,
    lineage: {
      canonicalName: 'Kloel' as const,
      genesisEventId: '01JD90000000000000000000GE',
      lineageStatus: 'intact' as const,
      operationalAge: { sinceGenesisDays: 30, sinceFirstWorkspaceDays: 10 },
      capabilities: ['lineage'],
    },
    identityProjection: {
      audience: 'public' as const,
      currentMaturity: 'developing' as const,
      truthMode: 'observed' as const,
    },
    perception: {
      currentSnapshot: { channel: 'web' },
      recentSalientEvents: [],
    },
    beliefs: [],
    predictions: { active: [], recentSurprises: [] },
    attention: { candidates: [] },
    memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
    capabilities: {
      available: [
        { capabilityId: 'lineage', maturity: 'developing' as const, runtimeEvidencePct: 5 },
      ],
      restricted: [],
    },
    valence: {
      recentTrace: [],
      aggregatedMood: {
        positive: 0,
        negative: 0,
        neutral: 1,
        ambiguous: 0,
        windowHours: 24,
      },
    },
    pulseTruth: {
      noOverclaimStatus: 'PASS' as const,
      capabilityHealthScore: 1,
      gates: [],
      certificationVerdict: {
        verdict: 'INSUFFICIENT_EVIDENCE' as const,
        score: 0,
        measuredAt: new Date().toISOString(),
      },
      overclaimRisk: 0,
    },
    currentInput: {
      raw: 'Hello',
      channel: 'web',
      arrivalTimestamp: new Date().toISOString(),
    },
    ...overrides,
  };
}

function createService(mockAbiBuilder?: AbiBuilderService): GuestChatService {
  const configService = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as import('@nestjs/config').ConfigService;
  return new GuestChatService(configService, undefined, undefined, mockAbiBuilder);
}

type GuestContextMessage = { role: 'user' | 'assistant'; content: string };

async function buildGuestMessages(
  service: GuestChatService,
  message: string,
  sessionId: string,
): Promise<{ contextMessages: GuestContextMessage[] }> {
  return (
    service as unknown as {
      buildGuestMessages: (
        message: string,
        sessionId: string,
      ) => Promise<{ contextMessages: GuestContextMessage[] }>;
    }
  ).buildGuestMessages(message, sessionId);
}

function expectNoSystemMessages(messages: GuestContextMessage[]) {
  expect(messages).toEqual(expect.not.arrayContaining([expect.objectContaining({ role: 'system' })]));
}

function parseLastUserPayload(messages: GuestContextMessage[]): Record<string, unknown> {
  const userMsgs = messages.filter((m) => m.role === 'user');
  const lastUserMsg = userMsgs[userMsgs.length - 1];
  if (!lastUserMsg) {
    throw new Error('missing user message');
  }

  return JSON.parse(lastUserMsg.content) as Record<string, unknown>;
}

describe('GuestChatService ABI substitution (UTP-ABI-005)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['KLOEL_GUEST_CHAT_USE_ABI'];
  });

  afterEach(() => {
    delete process.env['KLOEL_GUEST_CHAT_USE_ABI'];
  });

  describe('ABI builder unavailable — structured fallback', () => {
    it('sends structured cognitive fallback without a system role', async () => {
      const service = createService();
      const result = await buildGuestMessages(service, 'Hello guest', 'session-fallback-1');

      expectNoSystemMessages(result.contextMessages);
      const payload = parseLastUserPayload(result.contextMessages);
      expect(payload).toEqual(
        expect.objectContaining({
          cognitiveState: expect.objectContaining({
            abiStatus: 'builder_not_injected',
            audience: 'public',
          }),
          currentInput: expect.objectContaining({
            raw: 'Hello guest',
            channel: 'web',
          }),
        }),
      );
    });

    it('preserves the user input in the structured payload', async () => {
      const service = createService();
      const result = await buildGuestMessages(service, 'Hello guest', 'session-fallback-2');

      const payload = parseLastUserPayload(result.contextMessages);
      expect(payload.currentInput).toEqual(
        expect.objectContaining({
          raw: 'Hello guest',
          channel: 'web',
        }),
      );
    });
  });

  describe('ABI substitution', () => {
    let mockAbiBuilder: jest.Mocked<AbiBuilderService>;

    beforeEach(() => {
      mockAbiBuilder = {
        build: jest.fn().mockResolvedValue({
          status: 'ok',
          abi: makeValidAbi(),
        }),
      } as unknown as jest.Mocked<AbiBuilderService>;
    });

    it('does not send any system message', async () => {
      const service = createService(mockAbiBuilder);
      const result = await buildGuestMessages(service, 'Hello guest', 'session-abi-1');

      expectNoSystemMessages(result.contextMessages);
    });

    it('contains NO behavioral instruction patterns in emitted messages', async () => {
      const service = createService(mockAbiBuilder);
      const result = await buildGuestMessages(service, 'Hello guest', 'session-abi-2');

      const emittedContent = result.contextMessages.map((m) => m.content).join('\n');
      // PCI.4 §3.8 patterns — persona declarations + roleplay instructions
      expect(emittedContent).not.toMatch(/\bvoc[êe]\s+(é|es)(?=[\s.,;:!?'"]|$)/i);
      expect(emittedContent).not.toMatch(/\byou are\s+(an?|the)\b/i);
      expect(emittedContent).not.toMatch(/\bseu\s+papel\b/i);
      expect(emittedContent).not.toMatch(/\byour\s+role\b/i);
      expect(emittedContent).not.toMatch(/\bact\s+as\s+(an?|the)\b/i);
      expect(emittedContent).not.toMatch(/\baja\s+como\s+(um|uma|o|a)\b/i);
      expect(emittedContent).not.toMatch(/\bsempre\s+(faça|fala|use|seja|responda)\b/i);
      expect(emittedContent).not.toMatch(/\balways\s+(do|use|be|respond)\b/i);
      expect(emittedContent).not.toMatch(/\bnunca\s+(faça|fale|use|seja|responda)\b/i);
      expect(emittedContent).not.toMatch(/\bnever\s+(do|use|be|respond)\b/i);
      expect(emittedContent).not.toMatch(
        /\brespond\s+in\s+(json|markdown|format|portuguese|english)\b/i,
      );
      expect(emittedContent).not.toMatch(
        /\bresponda\s+em\s+(json|markdown|formato|português|inglês)\b/i,
      );
      expect(emittedContent).not.toMatch(/\bKloel\s+(é|is|acts|acta|behaves|fala)\s+/i);
      expect(emittedContent).not.toMatch(/\b(User:|Assistant:|System:)\s/m);
    });

    it('user message contains JSON-stringified ABI payload', async () => {
      const service = createService(mockAbiBuilder);
      const result = await buildGuestMessages(service, 'Hello guest', 'session-abi-3');

      const payload = parseLastUserPayload(result.contextMessages);
      expect(payload).toHaveProperty('cognitiveState');
      expect(payload).toHaveProperty('currentInput');
      expect(payload.cognitiveState).toEqual(
        expect.objectContaining({
          abiVersion: ABI_VERSION,
          lineage: expect.any(Object),
        }),
      );
    });

    it('ABI payload validates as PASS via validateAbiPayload', async () => {
      const abi = makeValidAbi();
      mockAbiBuilder.build.mockResolvedValue({ status: 'ok', abi });

      const service = createService(mockAbiBuilder);
      const result = await buildGuestMessages(service, 'Hello guest', 'session-abi-4');

      const parsed = parseLastUserPayload(result.contextMessages);
      const verdict = validateAbiPayload(parsed.cognitiveState);
      expect(verdict.status).toBe('PASS');
    });

    it('calls AbiBuilderService.build with audience=public', async () => {
      const service = createService(mockAbiBuilder);
      await buildGuestMessages(service, 'Hello guest', 'session-abi-5');

      expect(mockAbiBuilder.build).toHaveBeenCalledTimes(1);
      const callArg = mockAbiBuilder.build.mock.calls[0][0];
      expect(callArg.audience).toBe('public');
    });

    it('uses structured fallback when AbiBuilderService is not injected', async () => {
      const service = createService(undefined); // no abiBuilder
      const result = await buildGuestMessages(service, 'Hello guest', 'session-abi-fallback');

      expectNoSystemMessages(result.contextMessages);
      const payload = parseLastUserPayload(result.contextMessages);
      expect(payload.cognitiveState).toEqual(
        expect.objectContaining({ abiStatus: 'builder_not_injected' }),
      );
    });

    it('uses structured fallback when ABI build returns lineage_compromised', async () => {
      mockAbiBuilder.build.mockResolvedValue({
        status: 'lineage_compromised',
        reason: 'test compromise',
      } as const);

      const service = createService(mockAbiBuilder);
      const result = await buildGuestMessages(service, 'Hello guest', 'session-abi-compromised');

      expectNoSystemMessages(result.contextMessages);
      const payload = parseLastUserPayload(result.contextMessages);
      expect(payload.cognitiveState).toEqual(
        expect.objectContaining({ abiStatus: 'unavailable_or_invalid' }),
      );
    });

    it('uses structured fallback when ABI validation fails', async () => {
      const badAbi = { ...makeValidAbi() } as Record<string, unknown>;
      delete badAbi['abiVersion'];

      mockAbiBuilder.build.mockResolvedValue({
        status: 'ok',
        abi: badAbi,
      } as ReturnType<AbiBuilderService['build']>);

      const service = createService(mockAbiBuilder);
      const result = await buildGuestMessages(service, 'Hello guest', 'session-abi-bad');

      expectNoSystemMessages(result.contextMessages);
      const payload = parseLastUserPayload(result.contextMessages);
      expect(payload.cognitiveState).toEqual(
        expect.objectContaining({ abiStatus: 'unavailable_or_invalid' }),
      );
    });
  });

  describe('empty input — early return', () => {
    it('chatSync returns empty string for empty input', async () => {
      const service = createService();
      const result = await service.chatSync('', 'session-empty');
      expect(result).toBe('');
    });

    it('chatSync returns empty string for whitespace-only input', async () => {
      const service = createService();
      const result = await service.chatSync('   ', 'session-whitespace');
      expect(result).toBe('');
    });
  });
});
