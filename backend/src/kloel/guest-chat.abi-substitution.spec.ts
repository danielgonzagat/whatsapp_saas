/**
 * UTP-ABI-005 — Guest Chat ABI substitution contract spec.
 *
 * Implements PCI.2 §8 (docs/contracts/pci/02-abi-schema.md).
 *
 * Validates the feature-flag gated ABI substitution in GuestChatService:
 *  - Flag OFF: legacy system prompt is sent unchanged.
 *  - Flag ON: system slot = canonical fallback; user message = JSON ABI.
 *  - No behavioral instruction pattern in any message when flag is ON.
 *  - ABI payload validates via validateAbiPayload.
 *  - AbiBuilderService is called with audience=public.
 *  - Empty input returns early without LLM call.
 */

import { GuestChatService } from './guest-chat.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { validateAbiPayload } from './abi/abi-validator';
import { ABI_VERSION } from './abi/abi-schema';

let capturedMessages: { role: string; content: string }[] = [];

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

function setFlag(on: boolean) {
  if (on) {
    process.env['KLOEL_GUEST_CHAT_USE_ABI'] = 'on';
  } else {
    delete process.env['KLOEL_GUEST_CHAT_USE_ABI'];
  }
}

describe('GuestChatService ABI substitution (UTP-ABI-005)', () => {
  beforeEach(() => {
    capturedMessages = [];
    jest.clearAllMocks();
    delete process.env['KLOEL_GUEST_CHAT_USE_ABI'];
  });

  afterEach(() => {
    delete process.env['KLOEL_GUEST_CHAT_USE_ABI'];
  });

  describe('flag OFF — legacy path', () => {
    it('sends the legacy system prompt (KLOEL_GUEST_SYSTEM_PROMPT)', async () => {
      setFlag(false);
      const service = createService();
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-legacy-1');

      const sysMsg = result.contextMessages.find((m) => m.role === 'system');
      expect(sysMsg).toBeDefined();
      expect(sysMsg!.content).toContain('MODO VISITANTE');
      expect(sysMsg!.content).toContain('Você é Kloel');
    });

    it('includes the user message in the messages array', async () => {
      setFlag(false);
      const service = createService();
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-legacy-2');

      const userMsgs = result.contextMessages.filter((m) => m.role === 'user');
      const lastUserMsg = userMsgs[userMsgs.length - 1];
      expect(lastUserMsg.content).toBe('Hello guest');
    });
  });

  describe('flag ON — ABI substitution', () => {
    let mockAbiBuilder: jest.Mocked<AbiBuilderService>;

    beforeEach(() => {
      mockAbiBuilder = {
        build: jest.fn().mockResolvedValue({
          status: 'ok',
          abi: makeValidAbi(),
        }),
      } as unknown as jest.Mocked<AbiBuilderService>;
    });

    it('system slot contains ONLY the canonical fallback string', async () => {
      setFlag(true);
      const service = createService(mockAbiBuilder);
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-1');

      const sysMsg = result.contextMessages.find((m) => m.role === 'system');
      expect(sysMsg).toBeDefined();
      expect(sysMsg!.content).toBe(
        'Estado cognitivo distribuído. Verbalize a partir do estado abaixo. Nunca invente fato fora do estado.',
      );
    });

    it('system slot contains NO behavioral instruction patterns (per PCI.4 prompt-leakage gate)', async () => {
      setFlag(true);
      const service = createService(mockAbiBuilder);
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-2');

      const sysMsg = result.contextMessages.find((m) => m.role === 'system');
      expect(sysMsg).toBeDefined();

      const sysContent = sysMsg!.content;
      // PCI.4 §3.8 patterns — persona declarations + roleplay instructions
      expect(sysContent).not.toMatch(/\bvoc[êe]\s+(é|es)(?=[\s.,;:!?'"]|$)/i);
      expect(sysContent).not.toMatch(/\byou are\s+(an?|the)\b/i);
      expect(sysContent).not.toMatch(/\bseu\s+papel\b/i);
      expect(sysContent).not.toMatch(/\byour\s+role\b/i);
      expect(sysContent).not.toMatch(/\bact\s+as\s+(an?|the)\b/i);
      expect(sysContent).not.toMatch(/\baja\s+como\s+(um|uma|o|a)\b/i);
      expect(sysContent).not.toMatch(/\bsempre\s+(faça|fala|use|seja|responda)\b/i);
      expect(sysContent).not.toMatch(/\balways\s+(do|use|be|respond)\b/i);
      expect(sysContent).not.toMatch(/\bnunca\s+(faça|fale|use|seja|responda)\b/i);
      expect(sysContent).not.toMatch(/\bnever\s+(do|use|be|respond)\b/i);
      expect(sysContent).not.toMatch(
        /\brespond\s+in\s+(json|markdown|format|portuguese|english)\b/i,
      );
      expect(sysContent).not.toMatch(
        /\bresponda\s+em\s+(json|markdown|formato|português|inglês)\b/i,
      );
      expect(sysContent).not.toMatch(/\bKloel\s+(é|is|acts|acta|behaves|fala)\s+/i);
      expect(sysContent).not.toMatch(/\b(User:|Assistant:|System:)\s/m);
    });

    it('user message contains JSON-stringified ABI payload', async () => {
      setFlag(true);
      const service = createService(mockAbiBuilder);
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-3');

      const userMsgs = result.contextMessages.filter((m) => m.role === 'user');
      const lastUserMsg = userMsgs[userMsgs.length - 1];

      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(lastUserMsg.content);
      }).not.toThrow();

      const abi = parsed as Record<string, unknown>;
      expect(abi).toHaveProperty('abiVersion');
      expect(abi).toHaveProperty('lineage');
      expect(abi).toHaveProperty('currentInput');
    });

    it('ABI payload validates as PASS via validateAbiPayload', async () => {
      setFlag(true);
      const abi = makeValidAbi();
      mockAbiBuilder.build.mockResolvedValue({ status: 'ok', abi });

      const service = createService(mockAbiBuilder);
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-4');

      const userMsgs = result.contextMessages.filter((m) => m.role === 'user');
      const lastUserMsg = userMsgs[userMsgs.length - 1];
      const parsed = JSON.parse(lastUserMsg.content);
      const verdict = validateAbiPayload(parsed);
      expect(verdict.status).toBe('PASS');
    });

    it('calls AbiBuilderService.build with audience=public', async () => {
      setFlag(true);
      const service = createService(mockAbiBuilder);
      await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-5');

      expect(mockAbiBuilder.build).toHaveBeenCalledTimes(1);
      const callArg = mockAbiBuilder.build.mock.calls[0][0];
      expect(callArg.audience).toBe('public');
    });

    it('falls back to legacy path when AbiBuilderService is not injected', async () => {
      setFlag(true);
      const service = createService(undefined); // no abiBuilder
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-fallback');

      const sysMsg = result.contextMessages.find((m) => m.role === 'system');
      expect(sysMsg!.content).toContain('MODO VISITANTE');
    });

    it('falls back to legacy path when ABI build returns lineage_compromised', async () => {
      setFlag(true);
      mockAbiBuilder.build.mockResolvedValue({
        status: 'lineage_compromised',
        reason: 'test compromise',
      } as const);

      const service = createService(mockAbiBuilder);
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-compromised');

      const sysMsg = result.contextMessages.find((m) => m.role === 'system');
      expect(sysMsg!.content).toContain('MODO VISITANTE');
    });

    it('falls back to legacy path when ABI validation fails', async () => {
      setFlag(true);
      const badAbi = { ...makeValidAbi() } as Record<string, unknown>;
      delete badAbi['abiVersion'];

      mockAbiBuilder.build.mockResolvedValue({
        status: 'ok',
        abi: badAbi,
      } as ReturnType<AbiBuilderService['build']>);

      const service = createService(mockAbiBuilder);
      const result = await (
        service as unknown as { buildGuestMessages: (typeof service)['buildGuestMessages'] }
      ).buildGuestMessages('Hello guest', 'session-abi-bad');

      const sysMsg = result.contextMessages.find((m) => m.role === 'system');
      expect(sysMsg!.content).toContain('MODO VISITANTE');
    });
  });

  describe('empty input — early return', () => {
    it('chatSync returns empty string for empty input', async () => {
      setFlag(false);
      const service = createService();
      const result = await service.chatSync('', 'session-empty');
      expect(result).toBe('');
    });

    it('chatSync returns empty string for whitespace-only input', async () => {
      setFlag(false);
      const service = createService();
      const result = await service.chatSync('   ', 'session-whitespace');
      expect(result).toBe('');
    });
  });
});
