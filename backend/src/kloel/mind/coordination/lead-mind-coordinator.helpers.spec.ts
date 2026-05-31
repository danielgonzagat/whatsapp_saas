import {
  LEAD_AUTOPILOT_FALLBACK,
  LEAD_DEFAULT_GREETING,
  LEAD_TECH_ERROR_REPLY,
  buildAbiCognitiveContent,
  buildContactDisplayName,
  buildFallbackCognitiveContent,
  buildLeadUpdateData,
  buildNewLeadName,
  findProductMatch,
  formatPaymentReply,
  isAutopilotEnabled,
  isShortLlmOutput,
  leadErrorMessage,
  pickKloelReply,
  pickUnifiedAgentReply,
  productCandidateFromMemory,
} from './lead-mind-coordinator.helpers';

describe('lead-mind-coordinator.helpers', () => {
  describe('isAutopilotEnabled', () => {
    it('returns false for empty / undefined / null settings', () => {
      expect(isAutopilotEnabled(undefined)).toBe(false);
      expect(isAutopilotEnabled(null)).toBe(false);
      expect(isAutopilotEnabled({})).toBe(false);
    });

    it('returns true when autonomy.mode is LIVE / BACKLOG / FULL (case-insensitive)', () => {
      expect(isAutopilotEnabled({ autonomy: { mode: 'LIVE' } })).toBe(true);
      expect(isAutopilotEnabled({ autonomy: { mode: 'live' } })).toBe(true);
      expect(isAutopilotEnabled({ autonomy: { mode: 'BACKLOG' } })).toBe(true);
      expect(isAutopilotEnabled({ autonomy: { mode: 'full' } })).toBe(true);
    });

    it('returns false for unknown autonomy modes', () => {
      expect(isAutopilotEnabled({ autonomy: { mode: 'OFF' } })).toBe(false);
      expect(isAutopilotEnabled({ autonomy: { mode: 'DRAFT' } })).toBe(false);
    });

    it('returns true when autopilot.enabled === true', () => {
      expect(isAutopilotEnabled({ autopilot: { enabled: true } })).toBe(true);
    });

    it('does not flip on autopilot.enabled === "true" (string)', () => {
      expect(isAutopilotEnabled({ autopilot: { enabled: 'true' } })).toBe(false);
    });

    it('returns true on the legacy autopilotEnabled flag', () => {
      expect(isAutopilotEnabled({ autopilotEnabled: true })).toBe(true);
    });

    it('returns false when autopilot.enabled is missing or false', () => {
      expect(isAutopilotEnabled({ autopilot: { enabled: false } })).toBe(false);
      expect(isAutopilotEnabled({ autopilot: {} })).toBe(false);
    });

    it('ignores arrays and primitives passed as settings', () => {
      expect(isAutopilotEnabled([])).toBe(false);
      expect(isAutopilotEnabled('LIVE')).toBe(false);
      expect(isAutopilotEnabled(7)).toBe(false);
    });
  });

  describe('pickUnifiedAgentReply', () => {
    it('prefers reply over response', () => {
      expect(pickUnifiedAgentReply({ reply: 'A', response: 'B' })).toBe('A');
    });

    it('falls back to response when reply is missing or empty', () => {
      expect(pickUnifiedAgentReply({ reply: '', response: 'B' })).toBe('B');
      expect(pickUnifiedAgentReply({ response: 'B' })).toBe('B');
    });

    it('falls back to the canonical greeting when both are empty / null / undefined', () => {
      expect(pickUnifiedAgentReply({})).toBe(LEAD_AUTOPILOT_FALLBACK);
      expect(pickUnifiedAgentReply({ reply: null, response: null })).toBe(LEAD_AUTOPILOT_FALLBACK);
      expect(pickUnifiedAgentReply(null)).toBe(LEAD_AUTOPILOT_FALLBACK);
      expect(pickUnifiedAgentReply(undefined)).toBe(LEAD_AUTOPILOT_FALLBACK);
    });
  });

  describe('buildLeadUpdateData', () => {
    const fixedNow = new Date('2024-06-01T00:00:00.000Z');

    it('high intent → +20 score, negotiation stage', () => {
      const data = buildLeadUpdateData('quero comprar', 'high', fixedNow);
      expect(data).toEqual({
        lastMessage: 'quero comprar',
        lastIntent: 'high',
        updatedAt: fixedNow,
        score: { increment: 20 },
        stage: 'negotiation',
      });
    });

    it('medium intent → +10 score, interested stage', () => {
      const data = buildLeadUpdateData('quanto custa?', 'medium', fixedNow);
      expect(data.score).toEqual({ increment: 10 });
      expect(data.stage).toBe('interested');
    });

    it('objection intent → stage objection, no score change', () => {
      const data = buildLeadUpdateData('tá caro', 'objection', fixedNow);
      expect(data.stage).toBe('objection');
      expect(data.score).toBeUndefined();
    });

    it('low intent → no score / stage change, just lastMessage + updatedAt', () => {
      const data = buildLeadUpdateData('ok', 'low', fixedNow);
      expect(data).toEqual({
        lastMessage: 'ok',
        lastIntent: 'low',
        updatedAt: fixedNow,
      });
    });

    it('defaults updatedAt to a fresh Date when not provided', () => {
      const before = Date.now();
      const data = buildLeadUpdateData('hi', 'low');
      const after = Date.now();
      expect(data.updatedAt).toBeInstanceOf(Date);
      const at = (data.updatedAt as Date).getTime();
      expect(at).toBeGreaterThanOrEqual(before);
      expect(at).toBeLessThanOrEqual(after);
    });
  });

  describe('findProductMatch', () => {
    const catalog = [
      { name: 'Curso de Marketing', price: 19700 },
      { name: 'Mentoria Premium', price: 99700 },
    ];

    it('returns the first match found in the catalog', () => {
      expect(findProductMatch('quero o curso de marketing', catalog)).toEqual(catalog[0]);
    });

    it('matches case-insensitively', () => {
      expect(findProductMatch('QUERO A MENTORIA PREMIUM', catalog)).toEqual(catalog[1]);
    });

    it('returns null when no candidate is mentioned', () => {
      expect(findProductMatch('boa tarde, tudo bem?', catalog)).toBeNull();
    });

    it('skips candidates whose name is empty or whitespace', () => {
      const dirty = [{ name: '   ', price: 0 }, ...catalog];
      expect(findProductMatch('curso de marketing', dirty)).toEqual(catalog[0]);
    });

    it('handles empty candidate list', () => {
      expect(findProductMatch('curso', [])).toBeNull();
    });
  });

  describe('productCandidateFromMemory', () => {
    it('returns null when value is missing', () => {
      expect(productCandidateFromMemory(null)).toBeNull();
      expect(productCandidateFromMemory(undefined)).toBeNull();
    });

    it('returns null when name is empty', () => {
      expect(productCandidateFromMemory({ name: '', price: 100 })).toBeNull();
      expect(productCandidateFromMemory({ price: 100 })).toBeNull();
    });

    it('coerces missing / NaN price to 0', () => {
      expect(productCandidateFromMemory({ name: 'X' })).toEqual({ name: 'X', price: 0 });
      expect(productCandidateFromMemory({ name: 'X', price: Number.NaN })).toEqual({
        name: 'X',
        price: 0,
      });
    });

    it('returns the {name,price} pair for a valid record', () => {
      expect(productCandidateFromMemory({ name: 'Curso', price: 19700 })).toEqual({
        name: 'Curso',
        price: 19700,
      });
    });
  });

  describe('buildFallbackCognitiveContent', () => {
    type FallbackEnvelope = {
      cognitiveState: {
        abiStatus: string;
        audience: string;
        workspaceContext: string;
        perceptionSnapshot: { channel: string };
      };
      currentInput: { raw: string; channel: string; arrivalTimestamp: string };
    };

    it('emits a JSON string with cognitiveState + currentInput', () => {
      const raw = buildFallbackCognitiveContent({
        abiStatus: 'builder_not_injected',
        workspaceContext: 'ctx',
        channel: 'whatsapp',
        message: 'oi',
        arrivalTimestamp: '2024-06-01T00:00:00.000Z',
      });
      const parsed = JSON.parse(raw) as FallbackEnvelope;
      expect(parsed.cognitiveState).toEqual({
        abiStatus: 'builder_not_injected',
        audience: 'public',
        workspaceContext: 'ctx',
        perceptionSnapshot: { channel: 'whatsapp' },
      });
      expect(parsed.currentInput).toEqual({
        raw: 'oi',
        channel: 'whatsapp',
        arrivalTimestamp: '2024-06-01T00:00:00.000Z',
      });
    });

    it('honors an explicit audience override', () => {
      const raw = buildFallbackCognitiveContent({
        abiStatus: 'unavailable_or_invalid',
        workspaceContext: '',
        channel: 'whatsapp',
        message: '',
        arrivalTimestamp: 't',
        audience: 'admin',
      });
      const parsed = JSON.parse(raw) as FallbackEnvelope;
      expect(parsed.cognitiveState.audience).toBe('admin');
    });
  });

  describe('buildAbiCognitiveContent', () => {
    type AbiEnvelope = {
      cognitiveState: unknown;
      workspaceContext: string;
      currentInput: { raw: string; channel: string; arrivalTimestamp: string };
    };

    it('wraps the ABI payload inside cognitiveState verbatim', () => {
      const raw = buildAbiCognitiveContent({
        abi: { foo: 'bar', nested: { x: 1 } },
        workspaceContext: 'ctx',
        channel: 'whatsapp',
        message: 'oi',
        arrivalTimestamp: 't',
      });
      const parsed = JSON.parse(raw) as AbiEnvelope;
      expect(parsed.cognitiveState).toEqual({ foo: 'bar', nested: { x: 1 } });
      expect(parsed.workspaceContext).toBe('ctx');
      expect(parsed.currentInput).toEqual({
        raw: 'oi',
        channel: 'whatsapp',
        arrivalTimestamp: 't',
      });
    });
  });

  describe('formatPaymentReply', () => {
    it('appends a PT-BR call-to-action with the payment URL', () => {
      const result = formatPaymentReply('Beleza!', 'https://pay/abc');
      expect(result).toBe(
        'Beleza!\n\nAqui está o link para finalizar sua compra:\nhttps://pay/abc',
      );
    });
  });

  describe('buildNewLeadName / buildContactDisplayName', () => {
    it('uses the last 4 digits to form a readable label', () => {
      expect(buildNewLeadName('5511987654321')).toBe('Lead 4321');
      expect(buildContactDisplayName('5511987654321')).toBe('Contato 4321');
    });

    it('tolerates short phones (returns whatever slice yields)', () => {
      expect(buildNewLeadName('99')).toBe('Lead 99');
      expect(buildContactDisplayName('99')).toBe('Contato 99');
    });
  });

  describe('isShortLlmOutput / pickKloelReply', () => {
    it('flags empty / whitespace / under-5-char outputs as short', () => {
      expect(isShortLlmOutput('')).toBe(true);
      expect(isShortLlmOutput('   ')).toBe(true);
      expect(isShortLlmOutput('hi')).toBe(true);
      expect(isShortLlmOutput('hi  ')).toBe(true);
    });

    it('does not flag normal outputs (≥ 5 chars after trim)', () => {
      expect(isShortLlmOutput('Olá!!')).toBe(false);
      expect(isShortLlmOutput('Como posso ajudar?')).toBe(false);
    });

    it('treats exactly-5-char output as not-short', () => {
      expect(isShortLlmOutput('12345')).toBe(false);
    });

    it('treats exactly-4-char output as short (legacy threshold)', () => {
      expect(isShortLlmOutput('Olá!')).toBe(true);
    });

    it('pickKloelReply falls back to the canonical greeting on empty input', () => {
      expect(pickKloelReply('')).toBe(LEAD_DEFAULT_GREETING);
      expect(pickKloelReply('Olá!')).toBe('Olá!');
    });
  });

  describe('leadErrorMessage', () => {
    it('returns Error.message for Error instances', () => {
      expect(leadErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('falls back to "unknown error" for non-Error values', () => {
      expect(leadErrorMessage('boom')).toBe('unknown error');
      expect(leadErrorMessage(undefined)).toBe('unknown error');
      expect(leadErrorMessage({ message: 'x' })).toBe('unknown error');
    });
  });

  describe('constants', () => {
    it('exports the expected static strings', () => {
      expect(LEAD_DEFAULT_GREETING).toBe('Olá! Como posso ajudá-lo hoje?');
      expect(LEAD_AUTOPILOT_FALLBACK).toBe('Olá! Como posso ajudar?');
      expect(LEAD_TECH_ERROR_REPLY).toBe(
        'Olá! Tive um pequeno problema técnico. Pode repetir sua mensagem?',
      );
    });
  });
});
