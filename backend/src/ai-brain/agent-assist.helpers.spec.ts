import {
  AgentAssistWalletAccessError,
  insufficientWalletMessage,
  readWorkspaceId,
  estimateOpenAiQuote,
  classifySentimentLabel,
  buildSentimentMessages,
  buildSummaryMessages,
  buildSuggestReplyMessages,
  buildPitchMessages,
} from './agent-assist.helpers';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';
import * as providerLlmBilling from '../wallet/provider-llm-billing';

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
    const estimateOpenAiChatQuoteCostCentsMock =
      providerLlmBilling.estimateOpenAiChatQuoteCostCents as jest.MockedFunction<
        typeof providerLlmBilling.estimateOpenAiChatQuoteCostCents
      >;

    it('should return bigint when estimation succeeds', () => {
      estimateOpenAiChatQuoteCostCentsMock.mockReturnValue(BigInt(1500));
      const result = estimateOpenAiQuote('gpt-4', [{ role: 'user', content: 'test' }]);
      expect(result).toBe(BigInt(1500));
    });

    it('should return undefined when model is unknown', () => {
      estimateOpenAiChatQuoteCostCentsMock.mockImplementation(() => {
        throw new UnknownProviderPricingModelError('unknown model');
      });
      const result = estimateOpenAiQuote('unknown-model', []);
      expect(result).toBeUndefined();
    });

    it('should rethrow non-pricing errors', () => {
      estimateOpenAiChatQuoteCostCentsMock.mockImplementation(() => {
        throw new Error('network error');
      });
      expect(() => estimateOpenAiQuote('gpt-4', [])).toThrow('network error');
    });

    it('should pass model and messages to underlying function', () => {
      estimateOpenAiChatQuoteCostCentsMock.mockReturnValue(BigInt(1000));
      const messages = [{ role: 'user', content: 'hello' }];
      estimateOpenAiQuote('gpt-4', messages);
      expect(estimateOpenAiChatQuoteCostCentsMock).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages,
      });
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
