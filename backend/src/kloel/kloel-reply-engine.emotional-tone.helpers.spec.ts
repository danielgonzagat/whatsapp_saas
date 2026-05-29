import {
  applyToneGuardrail,
  buildToneDirective,
  logPostReplySentiment,
} from './kloel-reply-engine.emotional-tone.helpers';
import type {
  EmotionalInference,
  MindEmotionalIntelligenceService,
  ToneRecommendation,
} from './mind/emotional/mind-emotional-intelligence.service';
import type { ReplyMessage } from './kloel-reply-engine.types';

function makeEi(
  inference: EmotionalInference,
  recommendation: ToneRecommendation,
): {
  service: MindEmotionalIntelligenceService;
  inferCalls: unknown[][];
} {
  const inferCalls: unknown[][] = [];
  const service = {
    inferEmotionalState: jest.fn(async (...args: unknown[]) => {
      inferCalls.push(args);
      return inference;
    }),
    recommendTone: jest.fn(() => recommendation),
  } as unknown as MindEmotionalIntelligenceService;
  return { service, inferCalls };
}

describe('kloel-reply-engine emotional-tone helpers', () => {
  describe('applyToneGuardrail', () => {
    it('downgrades an aggressive (enthusiastic) tone to empathetic for a negative-history contact', () => {
      const out = applyToneGuardrail('angry', {
        tone: 'enthusiastic',
        rationale: 'x',
      });
      expect(out.tone).toBe('empathetic');
      expect(out.guardrailApplied).toBe(true);
    });

    it('also guards a frustrated contact', () => {
      const out = applyToneGuardrail('frustrated', {
        tone: 'enthusiastic',
        rationale: 'x',
      });
      expect(out.tone).toBe('empathetic');
      expect(out.guardrailApplied).toBe(true);
    });

    it('leaves a non-aggressive tone untouched even for a negative contact', () => {
      const out = applyToneGuardrail('angry', { tone: 'concise', rationale: 'x' });
      expect(out.tone).toBe('concise');
      expect(out.guardrailApplied).toBe(false);
    });

    it('allows enthusiastic for a positive contact', () => {
      const out = applyToneGuardrail('excited', {
        tone: 'enthusiastic',
        rationale: 'x',
      });
      expect(out.tone).toBe('enthusiastic');
      expect(out.guardrailApplied).toBe(false);
    });
  });

  describe('buildToneDirective', () => {
    it('injects a tone directive carrying the recommended tone', async () => {
      const { service } = makeEi(
        { state: 'curious', confidence: 0.7, basis: 'lexical' },
        { tone: 'professional', rationale: 'curious expects clear explanation' },
      );
      const directive = await buildToneDirective(service, {
        workspaceId: 'ws_1',
        conversationId: 'conv_1',
        message: 'como funciona o plano?',
      });
      expect(directive).not.toBeNull();
      expect(directive?.tone).toBe('professional');
      expect(directive?.state).toBe('curious');
      expect(directive?.guardrailApplied).toBe(false);
      expect(directive?.directive).toContain('DIRETRIZ DE TOM');
      expect(directive?.directive).toContain('professional');
    });

    it('blocks an aggressive tone for a negative-history contact in the directive', async () => {
      const { service } = makeEi(
        { state: 'angry', confidence: 0.9, basis: 'lexical' },
        // EI mistakenly recommends an aggressive/high-energy tone
        { tone: 'enthusiastic', rationale: 'high energy' },
      );
      const recentMessages: ReplyMessage[] = [
        { role: 'user', content: 'isso é um absurdo, quero cancelar' },
      ];
      const directive = await buildToneDirective(service, {
        workspaceId: 'ws_1',
        conversationId: 'conv_1',
        message: 'lixo de atendimento',
        recentMessages,
      });
      expect(directive).not.toBeNull();
      expect(directive?.guardrailApplied).toBe(true);
      // aggressive tone must NOT survive into the directive
      expect(directive?.tone).toBe('empathetic');
      expect(directive?.directive).not.toContain('enthusiastic');
      expect(directive?.directive).toContain('Guardrail');
    });

    it('fails open (returns null) when the EI service is unavailable', async () => {
      const directive = await buildToneDirective(undefined, {
        workspaceId: 'ws_1',
        message: 'oi',
      });
      expect(directive).toBeNull();
    });

    it('fails open (returns null) when inference throws', async () => {
      const service = {
        inferEmotionalState: jest.fn(async () => {
          throw new Error('boom');
        }),
        recommendTone: jest.fn(),
      } as unknown as MindEmotionalIntelligenceService;
      const warn = jest.fn();
      const directive = await buildToneDirective(service, {
        workspaceId: 'ws_1',
        message: 'oi',
        logger: { warn },
      });
      expect(directive).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        'kloel_emotional_tone_directive_failed',
        expect.any(Object),
      );
    });

    it('returns null when there is no workspace', async () => {
      const { service } = makeEi(
        { state: 'neutral', confidence: 0.5, basis: 'x' },
        { tone: 'professional', rationale: 'x' },
      );
      const directive = await buildToneDirective(service, {
        workspaceId: null,
        message: 'oi',
      });
      expect(directive).toBeNull();
    });
  });

  describe('logPostReplySentiment', () => {
    it('feeds the assistant reply back through inference', async () => {
      const { service, inferCalls } = makeEi(
        { state: 'neutral', confidence: 0.5, basis: 'x' },
        { tone: 'professional', rationale: 'x' },
      );
      const out = await logPostReplySentiment(service, {
        workspaceId: 'ws_1',
        conversationId: 'conv_1',
        assistantMessage: 'claro, posso ajudar com isso',
      });
      expect(out).not.toBeNull();
      expect(inferCalls).toHaveLength(1);
      expect(inferCalls[0]?.[2]).toEqual(['claro, posso ajudar com isso']);
    });

    it('no-ops on empty reply', async () => {
      const { service, inferCalls } = makeEi(
        { state: 'neutral', confidence: 0.5, basis: 'x' },
        { tone: 'professional', rationale: 'x' },
      );
      const out = await logPostReplySentiment(service, {
        workspaceId: 'ws_1',
        assistantMessage: '   ',
      });
      expect(out).toBeNull();
      expect(inferCalls).toHaveLength(0);
    });

    it('fails open when inference throws', async () => {
      const service = {
        inferEmotionalState: jest.fn(async () => {
          throw new Error('boom');
        }),
        recommendTone: jest.fn(),
      } as unknown as MindEmotionalIntelligenceService;
      const out = await logPostReplySentiment(service, {
        workspaceId: 'ws_1',
        assistantMessage: 'oi',
      });
      expect(out).toBeNull();
    });
  });
});
