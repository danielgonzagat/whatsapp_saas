import {
  AgentAssistWalletAccessError,
  AssistantAction,
  insufficientWalletMessage,
  readWorkspaceId,
  estimateOpenAiQuote,
  chargeAiUsageIfNeeded,
  settleAiUsageIfNeeded,
  refundAiUsageIfNeeded,
  classifySentimentLabel,
  buildSentimentMessages,
  buildSummaryMessages,
  buildSuggestReplyMessages,
  buildPitchMessages,
} from './agent-assist.helpers';
import { WalletService } from '../wallet/wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';

jest.mock('../wallet/wallet.service');
jest.mock('../wallet/provider-llm-billing', () => ({
  estimateOpenAiChatQuoteCostCents: jest.fn(() => BigInt(1000)),
  quoteOpenAiChatActualCostCents: jest.fn(() => BigInt(1200)),
}));
jest.mock('../wallet/provider-pricing');

describe('agent-assist.helpers', () => {
  describe('AgentAssistWalletAccessError', () => {
    it('should extend Error', () => {
      const error = new AgentAssistWalletAccessError('test message');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct error name', () => {
      const error = new AgentAssistWalletAccessError('test');
      expect(error.name).toBe('AgentAssistWalletAccessError');
    });

    it('should preserve error message', () => {
      const message = 'Wallet insufficient';
      const error = new AgentAssistWalletAccessError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('insufficientWalletMessage', () => {
    it('should return Portuguese wallet error message', () => {
      const message = insufficientWalletMessage();
      expect(message).toBeTruthy();
      expect(message).toContain('Saldo insuficiente');
      expect(message).toContain('wallet');
    });

    it('should be consistent across calls', () => {
      const msg1 = insufficientWalletMessage();
      const msg2 = insufficientWalletMessage();
      expect(msg1).toBe(msg2);
    });
  });

  describe('readWorkspaceId', () => {
    it('should return string when value is non-empty string', () => {
      expect(readWorkspaceId('ws-123')).toBe('ws-123');
    });

    it('should return undefined when value is empty string', () => {
      expect(readWorkspaceId('')).toBeUndefined();
    });

    it('should return undefined when value is whitespace only', () => {
      expect(readWorkspaceId('   ')).toBeUndefined();
      expect(readWorkspaceId('\t\n')).toBeUndefined();
    });

    it('should accept string with surrounding whitespace', () => {
      expect(readWorkspaceId('  ws-123  ')).toBe('  ws-123  ');
    });

    it('should return undefined for null', () => {
      expect(readWorkspaceId(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(readWorkspaceId(undefined)).toBeUndefined();
    });

    it('should return undefined for non-string types', () => {
      expect(readWorkspaceId(123)).toBeUndefined();
      expect(readWorkspaceId({ id: 'ws-123' })).toBeUndefined();
      expect(readWorkspaceId(['ws-123'])).toBeUndefined();
    });

    it('should return undefined for zero', () => {
      expect(readWorkspaceId(0)).toBeUndefined();
    });

    it('should return undefined for false', () => {
      expect(readWorkspaceId(false)).toBeUndefined();
    });
  });

  describe('estimateOpenAiQuote', () => {
    const { estimateOpenAiChatQuoteCostCents } = require('../wallet/provider-llm-billing');

    it('should return bigint when estimation succeeds', () => {
      estimateOpenAiChatQuoteCostCents.mockReturnValue(BigInt(1500));
      const result = estimateOpenAiQuote('gpt-4', [{ role: 'user', content: 'test' }]);
      expect(result).toBe(BigInt(1500));
    });

    it('should return undefined when model is unknown', () => {
      estimateOpenAiChatQuoteCostCents.mockImplementation(() => {
        throw new UnknownProviderPricingModelError('unknown model');
      });
      const result = estimateOpenAiQuote('unknown-model', []);
      expect(result).toBeUndefined();
    });

    it('should rethrow non-pricing errors', () => {
      estimateOpenAiChatQuoteCostCents.mockImplementation(() => {
        throw new Error('network error');
      });
      expect(() => estimateOpenAiQuote('gpt-4', [])).toThrow('network error');
    });

    it('should pass model and messages to underlying function', () => {
      estimateOpenAiChatQuoteCostCents.mockReturnValue(BigInt(1000));
      const messages = [{ role: 'user', content: 'hello' }];
      estimateOpenAiQuote('gpt-4', messages);
      expect(estimateOpenAiChatQuoteCostCents).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages,
      });
    });
  });

  describe('chargeAiUsageIfNeeded', () => {
    let mockWalletService: jest.Mocked<WalletService>;

    beforeEach(() => {
      mockWalletService = {
        chargeForUsage: jest.fn(),
      } as any;
    });

    it('should return false when workspaceId is undefined', async () => {
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: undefined,
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        metadata: {},
      });
      expect(result).toBe(false);
      expect(mockWalletService.chargeForUsage).not.toHaveBeenCalled();
    });

    it('should return false when workspaceId is null', async () => {
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: null,
        requestId: 'req-1',
        assistantAction: 'generate_pitch',
        metadata: {},
      });
      expect(result).toBe(false);
    });

    it('should charge with estimated cost when provided', async () => {
      mockWalletService.chargeForUsage.mockResolvedValue({} as any);
      await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        metadata: { test: true },
        estimatedCostCents: BigInt(1500),
      });
      expect(mockWalletService.chargeForUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          operation: 'ai_message',
          quotedCostCents: BigInt(1500),
          requestId: 'req-1',
          metadata: expect.objectContaining({
            channel: 'ai_assistant',
            capability: 'analyze_sentiment',
            test: true,
          }),
        }),
      );
    });

    it('should charge with units=1 when no estimated cost', async () => {
      mockWalletService.chargeForUsage.mockResolvedValue({} as any);
      await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'suggest_reply',
        metadata: {},
      });
      expect(mockWalletService.chargeForUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          units: 1,
        }),
      );
    });

    it('should return true on successful charge', async () => {
      mockWalletService.chargeForUsage.mockResolvedValue({} as any);
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'summarize_conversation',
        metadata: {},
      });
      expect(result).toBe(true);
    });

    it('should return false on UsagePriceNotFoundError', async () => {
      mockWalletService.chargeForUsage.mockRejectedValue(new UsagePriceNotFoundError('ai_message'));
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        metadata: {},
      });
      expect(result).toBe(false);
    });

    it('should throw AgentAssistWalletAccessError on InsufficientWalletBalanceError', async () => {
      mockWalletService.chargeForUsage.mockRejectedValue(
        new InsufficientWalletBalanceError('wallet-1', BigInt(5000), BigInt(1000)),
      );
      await expect(
        chargeAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          metadata: {},
        }),
      ).rejects.toBeInstanceOf(AgentAssistWalletAccessError);
    });

    it('should throw AgentAssistWalletAccessError on WalletNotFoundError', async () => {
      mockWalletService.chargeForUsage.mockRejectedValue(new WalletNotFoundError('ws-1'));
      await expect(
        chargeAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          metadata: {},
        }),
      ).rejects.toBeInstanceOf(AgentAssistWalletAccessError);
    });
  });

  describe('settleAiUsageIfNeeded', () => {
    let mockWalletService: jest.Mocked<WalletService>;
    const { quoteOpenAiChatActualCostCents } = require('../wallet/provider-llm-billing');

    beforeEach(() => {
      mockWalletService = {
        settleUsageCharge: jest.fn(),
      } as any;
      quoteOpenAiChatActualCostCents.mockReturnValue(BigInt(1200));
    });

    it('should return early when workspaceId is undefined', async () => {
      await settleAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: undefined,
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        model: 'gpt-4',
        usage: { completion_tokens: 10, prompt_tokens: 5 },
      });
      expect(mockWalletService.settleUsageCharge).not.toHaveBeenCalled();
    });

    it('should settle with actual cost calculation', async () => {
      mockWalletService.settleUsageCharge.mockResolvedValue({} as any);
      await settleAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'generate_pitch',
        model: 'gpt-4',
        usage: { completion_tokens: 20, prompt_tokens: 10 },
      });
      expect(mockWalletService.settleUsageCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          operation: 'ai_message',
          requestId: 'req-1',
          actualCostCents: BigInt(1200),
          reason: 'ai_assistant_provider_usage',
          metadata: expect.objectContaining({
            channel: 'ai_assistant',
            capability: 'generate_pitch',
            model: 'gpt-4',
          }),
        }),
      );
    });

    it('should silently catch UnknownProviderPricingModelError', async () => {
      mockWalletService.settleUsageCharge.mockRejectedValue(
        new UnknownProviderPricingModelError('unknown model'),
      );
      await expect(
        settleAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          model: 'unknown',
          usage: {},
        }),
      ).resolves.not.toThrow();
    });

    it('should rethrow non-pricing errors', async () => {
      mockWalletService.settleUsageCharge.mockRejectedValue(new Error('db error'));
      await expect(
        settleAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          model: 'gpt-4',
          usage: {},
        }),
      ).rejects.toThrow('db error');
    });
  });

  describe('refundAiUsageIfNeeded', () => {
    let mockWalletService: jest.Mocked<WalletService>;

    beforeEach(() => {
      mockWalletService = {
        refundUsageCharge: jest.fn(),
      } as any;
    });

    it('should return early when workspaceId is undefined', async () => {
      await refundAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: undefined,
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        reason: 'provider_timeout',
      });
      expect(mockWalletService.refundUsageCharge).not.toHaveBeenCalled();
    });

    it('should refund with reason', async () => {
      mockWalletService.refundUsageCharge.mockResolvedValue({} as any);
      await refundAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'suggest_reply',
        reason: 'provider_unavailable',
      });
      expect(mockWalletService.refundUsageCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          operation: 'ai_message',
          requestId: 'req-1',
          reason: 'provider_unavailable',
          metadata: expect.objectContaining({
            channel: 'ai_assistant',
            capability: 'suggest_reply',
          }),
        }),
      );
    });

    it('should handle null workspaceId', async () => {
      await refundAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: null,
        requestId: 'req-1',
        assistantAction: 'summarize_conversation',
        reason: 'user_cancelled',
      });
      expect(mockWalletService.refundUsageCharge).not.toHaveBeenCalled();
    });
  });

  describe('classifySentimentLabel', () => {
    it('should classify positivo as positive', () => {
      expect(classifySentimentLabel('positivo')).toBe('positive');
      expect(classifySentimentLabel('POSITIVO')).toBe('positive');
      expect(classifySentimentLabel('Positivo grande!')).toBe('positive');
    });

    it('should classify negativo as negative', () => {
      expect(classifySentimentLabel('negativo')).toBe('negative');
      expect(classifySentimentLabel('NEGATIVO')).toBe('negative');
      expect(classifySentimentLabel('Muito negativo, pior')).toBe('negative');
    });

    it('should classify anything else as neutral', () => {
      expect(classifySentimentLabel('neutro')).toBe('neutral');
      expect(classifySentimentLabel('mixed')).toBe('neutral');
      expect(classifySentimentLabel('')).toBe('neutral');
      expect(classifySentimentLabel('unknown value')).toBe('neutral');
    });

    it('should be case-insensitive', () => {
      expect(classifySentimentLabel('pOsItIvO')).toBe('positive');
      expect(classifySentimentLabel('nEgAtIvO')).toBe('negative');
    });

    it('should match substring', () => {
      expect(classifySentimentLabel('é muito positivo mesmo')).toBe('positive');
      expect(classifySentimentLabel('isso é negativo')).toBe('negative');
    });
  });

  describe('buildSentimentMessages', () => {
    it('should build sentiment analysis messages', () => {
      const messages = buildSentimentMessages('teste de sentimento');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should include sentiment classification prompt in system', () => {
      const messages = buildSentimentMessages('text');
      expect(messages[0].content).toContain('sentimento');
      expect(messages[0].content).toContain('positivo');
    });

    it('should include user text in user message', () => {
      const text = 'Produto excelente, recomendo!';
      const messages = buildSentimentMessages(text);
      expect(messages[1].content).toBe(text);
    });

    it('should handle empty text', () => {
      const messages = buildSentimentMessages('');
      expect(messages[1].content).toBe('');
    });
  });

  describe('buildSummaryMessages', () => {
    it('should build summary messages', () => {
      const messages = buildSummaryMessages('conversation history');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should include summary instructions in Portuguese', () => {
      const messages = buildSummaryMessages('history');
      expect(messages[0].content).toContain('português');
      expect(messages[0].content).toContain('3 linhas');
    });

    it('should include history in user message', () => {
      const history = 'Cliente: oi\nVendedor: oi';
      const messages = buildSummaryMessages(history);
      expect(messages[1].content).toBe(history);
    });
  });

  describe('buildSuggestReplyMessages', () => {
    it('should build reply suggestion messages', () => {
      const messages = buildSuggestReplyMessages(undefined, 'latest message');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should include reply tone in system message', () => {
      const messages = buildSuggestReplyMessages(undefined, 'text');
      expect(messages[0].content).toContain('humano');
    });

    it('should include only latest when no custom prompt', () => {
      const latest = 'Cliente quer saber preço';
      const messages = buildSuggestReplyMessages(undefined, latest);
      expect(messages[1].content).toBe(latest);
    });

    it('should combine prompt and context when prompt provided', () => {
      const prompt = 'Use tom amigável';
      const latest = 'Cliente está irritado';
      const messages = buildSuggestReplyMessages(prompt, latest);
      expect(messages[1].content).toContain(prompt);
      expect(messages[1].content).toContain('Contexto');
      expect(messages[1].content).toContain(latest);
    });

    it('should handle empty custom prompt as undefined', () => {
      const messages = buildSuggestReplyMessages('', 'latest');
      expect(messages[1].content).toBe('latest');
    });
  });

  describe('buildPitchMessages', () => {
    it('should build pitch generation messages', () => {
      const messages = buildPitchMessages('produto base');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should include pitch instructions in Portuguese', () => {
      const messages = buildPitchMessages('base');
      expect(messages[0].content).toContain('pitch');
      expect(messages[0].content).toContain('português');
      expect(messages[0].content).toContain('CTA');
    });

    it('should include product base in user message', () => {
      const base = 'Novo produto de skincare';
      const messages = buildPitchMessages(base);
      expect(messages[1].content).toBe(base);
    });
  });
});
