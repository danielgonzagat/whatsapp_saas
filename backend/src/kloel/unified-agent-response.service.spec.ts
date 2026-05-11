import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));

describe('UnifiedAgentResponseService', () => {
  let service: UnifiedAgentResponseService;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;

  const wsId = 'ws-1';

  beforeEach(async () => {
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentResponseService,
        { provide: PlanLimitsService, useValue: planLimits },
      ],
    }).compile();

    service = module.get<UnifiedAgentResponseService>(UnifiedAgentResponseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('composeWriterReply', () => {
    it('returns fallback reply when OpenAI is null', async () => {
      const result = await service.composeWriterReply(null, 'gpt-4', 'gpt-3.5', {
        customerMessage: 'Oi',
        assistantDraft: 'Olá, como vai?',
        actions: [],
        historyTurns: 0,
      });

      expect(result).toBeDefined();
    });

    it('returns undefined when draft and message are empty', async () => {
      const result = await service.composeWriterReply(null, 'gpt-4', 'gpt-3.5', {
        customerMessage: '',
        assistantDraft: null,
        actions: [],
        historyTurns: 0,
      });

      expect(result).toBeUndefined();
    });

    it('calls OpenAI with correct params', async () => {
      const { chatCompletionWithFallback } = require('./openai-wrapper');
      const fakeCompletion = {
        choices: [{ message: { content: 'Olá! Como posso te ajudar hoje?' } }],
        usage: { total_tokens: 100 },
      };
      chatCompletionWithFallback.mockResolvedValue(fakeCompletion);

      const result = await service.composeWriterReply({ apiKey: 'fake' } as any, 'gpt-4', 'gpt-3.5', {
        workspaceId: wsId,
        customerMessage: 'Oi',
        assistantDraft: 'Rascunho',
        actions: [{ tool: 'send_message', args: { message: 'Oi' }, result: 'ok' }],
        historyTurns: 2,
      });

      expect(result).toBeDefined();
      expect(chatCompletionWithFallback).toHaveBeenCalled();
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(wsId);
    });

    it('falls back on OpenAI error', async () => {
      const { chatCompletionWithFallback } = require('./openai-wrapper');
      chatCompletionWithFallback.mockRejectedValue(new Error('API error'));

      const result = await service.composeWriterReply({ apiKey: 'fake' } as any, 'gpt-4', 'gpt-3.5', {
        customerMessage: 'Oi',
        assistantDraft: 'Olá, como vai?',
        actions: [],
        historyTurns: 0,
      });

      expect(result).toBeDefined();
    });

    it('tracks AI usage when workspaceId provided', async () => {
      const { chatCompletionWithFallback } = require('./openai-wrapper');
      chatCompletionWithFallback.mockResolvedValue({
        choices: [{ message: { content: 'Resposta' } }],
        usage: { total_tokens: 200 },
      });

      await service.composeWriterReply({ apiKey: 'fake' } as any, 'gpt-4', 'gpt-3.5', {
        workspaceId: wsId,
        customerMessage: 'Oi',
        assistantDraft: null,
        actions: [],
        historyTurns: 0,
      });

      expect(planLimits.trackAiUsage).toHaveBeenCalledWith(wsId, 200);
    });
  });

  describe('finalizeReplyStyle', () => {
    it('returns undefined for empty reply', () => {
      const result = service.finalizeReplyStyle('Oi', '');
      expect(result).toBeUndefined();
    });

    it('returns undefined for null reply', () => {
      const result = service.finalizeReplyStyle('Oi', null);
      expect(result).toBeUndefined();
    });

    it('returns trimmed reply for short messages', () => {
      const result = service.finalizeReplyStyle('Oi', 'Olá! Tudo bem?');
      expect(result).toContain('Olá');
    });

    it('limits reply length for longer conversations', () => {
      const longReply = 'Frase um. '.repeat(20);
      const result = service.finalizeReplyStyle('Me fale tudo sobre o produto e seus detalhes e benefícios', longReply, 10);

      expect(result).toBeDefined();
      expect(result!.length).toBeLessThan(longReply.length);
    });
  });

  describe('buildQuotedReplyPlan', () => {
    it('returns empty array for empty messages', async () => {
      const result = await service.buildQuotedReplyPlan(
        null,
        'gpt-4',
        'gpt-3.5',
        planLimits as PlanLimitsService,
        {
          workspaceId: wsId,
          draftReply: 'Oi',
          customerMessages: [],
        },
      );

      expect(result).toEqual([]);
    });

    it('uses fallback for single message', async () => {
      const result = await service.buildQuotedReplyPlan(
        null,
        'gpt-4',
        'gpt-3.5',
        planLimits as PlanLimitsService,
        {
          workspaceId: wsId,
          draftReply: 'Olá, como vai?',
          customerMessages: [{ content: 'Oi', quotedMessageId: 'msg-1' }],
        },
      );

      expect(result).toHaveLength(1);
      expect(result[0].quotedMessageId).toBe('msg-1');
    });

    it('calls OpenAI for multiple messages', async () => {
      const { chatCompletionWithFallback } = require('./openai-wrapper');
      chatCompletionWithFallback.mockResolvedValue({
        choices: [
          {
            message: {
              content: '{"replies":[{"index":1,"text":"Resposta 1"},{"index":2,"text":"Resposta 2"}]}',
            },
          },
        ],
        usage: { total_tokens: 150 },
      });

      const result = await service.buildQuotedReplyPlan(
        { apiKey: 'fake' } as any,
        'gpt-4',
        'gpt-3.5',
        planLimits as PlanLimitsService,
        {
          workspaceId: wsId,
          draftReply: 'Respostas',
          customerMessages: [
            { content: 'Msg 1', quotedMessageId: 'id-1' },
            { content: 'Msg 2', quotedMessageId: 'id-2' },
          ],
        },
      );

      expect(result).toHaveLength(2);
    });

    it('falls back on OpenAI error', async () => {
      const { chatCompletionWithFallback } = require('./openai-wrapper');
      chatCompletionWithFallback.mockRejectedValue(new Error('API error'));

      const result = await service.buildQuotedReplyPlan(
        { apiKey: 'fake' } as any,
        'gpt-4',
        'gpt-3.5',
        planLimits as PlanLimitsService,
        {
          workspaceId: wsId,
          draftReply: 'Respostas',
          customerMessages: [
            { content: 'Msg 1', quotedMessageId: 'id-1' },
            { content: 'Msg 2', quotedMessageId: 'id-2' },
          ],
        },
      );

      expect(result).toHaveLength(2);
    });

    it('falls back when OpenAI returns wrong count', async () => {
      const { chatCompletionWithFallback } = require('./openai-wrapper');
      chatCompletionWithFallback.mockResolvedValue({
        choices: [
          {
            message: { content: '{"replies":[{"index":1,"text":"Apenas uma"}]}' },
          },
        ],
        usage: { total_tokens: 50 },
      });

      const result = await service.buildQuotedReplyPlan(
        { apiKey: 'fake' } as any,
        'gpt-4',
        'gpt-3.5',
        planLimits as PlanLimitsService,
        {
          workspaceId: wsId,
          draftReply: 'Respostas',
          customerMessages: [
            { content: 'Msg 1', quotedMessageId: 'id-1' },
            { content: 'Msg 2', quotedMessageId: 'id-2' },
          ],
        },
      );

      expect(result).toHaveLength(2);
    });
  });

  describe('buildFallbackResult', () => {
    it('detects BUYING_INTENT for price messages', () => {
      const result = service.buildFallbackResult('quanto custa o produto?');

      expect(result.intent).toBe('BUYING_INTENT');
      expect(result.confidence).toBe(0.45);
    });

    it('detects SCHEDULING for meeting messages', () => {
      const result = service.buildFallbackResult('quero agendar uma reunião');

      expect(result.intent).toBe('SCHEDULING');
      expect(result.confidence).toBe(0.4);
    });

    it('detects CHURN_RISK for cancel messages', () => {
      const result = service.buildFallbackResult('quero cancelar minha conta');

      expect(result.intent).toBe('CHURN_RISK');
      expect(result.confidence).toBe(0.4);
    });

    it('detects GREETING for hello messages', () => {
      const result = service.buildFallbackResult('Olá, bom dia');

      expect(result.intent).toBe('GREETING');
      expect(result.confidence).toBe(0.35);
    });

    it('falls back to UNKNOWN for unrecognized messages', () => {
      const result = service.buildFallbackResult('xyz random text');

      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBe(0.2);
    });
  });

  describe('extractIntent', () => {
    it('returns IDLE for empty actions', () => {
      const intent = service.extractIntent([], 'any message');
      expect(intent).toBe('IDLE');
    });

    it('maps tool to intent', () => {
      const intent = service.extractIntent([{ tool: 'create_payment_link', args: {} }], 'quero pagar');
      expect(intent).toBe('BUYING');
    });

    it('returns FOLLOW_UP for unknown tools', () => {
      const intent = service.extractIntent([{ tool: 'unknown_tool', args: {} }], 'message');
      expect(intent).toBe('FOLLOW_UP');
    });
  });

  describe('calculateConfidence', () => {
    it('calculates confidence based on actions and tool calls', () => {
      const response = {
        choices: [{ message: { tool_calls: [{ id: 't1', type: 'function', function: { name: 'test', arguments: '{}' } }] } }],
      } as any;

      const confidence = service.calculateConfidence(
        [{ tool: 'send_message', args: {}, result: 'ok' }],
        response,
      );

      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('caps confidence at 1', () => {
      const response = {
        choices: [{ message: { tool_calls: Array(10).fill({}) } }],
      } as any;

      const confidence = service.calculateConfidence(
        Array(20).fill({ tool: 't', args: {}, result: 'ok' }),
        response,
      );

      expect(confidence).toBeCloseTo(0.95);
    });
  });
});
