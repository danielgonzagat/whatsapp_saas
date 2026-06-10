import {
  estimateAnthropicMessageQuoteCostCents,
  estimateOpenAiChatQuoteCostCents,
  quoteAnthropicMessageActualCostCents,
  quoteOpenAiChatActualCostCents,
} from './provider-llm-billing';
import {
  estimateOpenAiTextCostFromCharsCents,
  quoteAnthropicTextUsageCostCents,
  quoteOpenAiTextUsageCostCents,
} from './provider-pricing';

// Pin the wrapper constant so the maxOutputTokens fallback is deterministic and
// the spec does not drag the full OpenAI wrapper (and its env requirements) in.
jest.mock('../kloel/openai-wrapper', () => ({
  LLM_MAX_COMPLETION_TOKENS: 1024,
}));
jest.mock('./provider-pricing', () => ({
  estimateOpenAiTextCostFromCharsCents: jest.fn().mockReturnValue(11n),
  quoteAnthropicTextUsageCostCents: jest.fn().mockReturnValue(22n),
  quoteOpenAiTextUsageCostCents: jest.fn().mockReturnValue(33n),
}));

const mockedEstimateOpenAi = jest.mocked(estimateOpenAiTextCostFromCharsCents);
const mockedAnthropicUsage = jest.mocked(quoteAnthropicTextUsageCostCents);
const mockedOpenAiUsage = jest.mocked(quoteOpenAiTextUsageCostCents);

describe('provider-llm-billing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEstimateOpenAi.mockReturnValue(11n);
    mockedAnthropicUsage.mockReturnValue(22n);
    mockedOpenAiUsage.mockReturnValue(33n);
  });

  describe('estimateOpenAiChatQuoteCostCents', () => {
    it('quotes from the serialized message size and the explicit output cap', () => {
      const messages = [{ role: 'user', content: 'olá' }];

      const cost = estimateOpenAiChatQuoteCostCents({
        model: 'gpt-4o-mini',
        messages,
        maxOutputTokens: 256,
      });

      expect(cost).toBe(11n);
      expect(mockedEstimateOpenAi).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        inputChars: JSON.stringify(messages).length,
        maxOutputTokens: 256,
      });
    });

    it('falls back to LLM_MAX_COMPLETION_TOKENS when the cap is absent or invalid', () => {
      estimateOpenAiChatQuoteCostCents({ model: 'gpt-4o-mini', messages: [] });
      estimateOpenAiChatQuoteCostCents({
        model: 'gpt-4o-mini',
        messages: [],
        maxOutputTokens: -5,
      });
      estimateOpenAiChatQuoteCostCents({
        model: 'gpt-4o-mini',
        messages: [],
        maxOutputTokens: Number.NaN,
      });

      for (const call of mockedEstimateOpenAi.mock.calls) {
        expect(call[0].maxOutputTokens).toBe(1024);
      }
    });

    it('treats a null/undefined payload as an empty serialized string', () => {
      estimateOpenAiChatQuoteCostCents({ model: 'gpt-4o-mini', messages: undefined });

      expect(mockedEstimateOpenAi).toHaveBeenCalledWith(
        expect.objectContaining({ inputChars: JSON.stringify('').length }),
      );
    });
  });

  describe('estimateAnthropicMessageQuoteCostCents', () => {
    it('estimates input tokens as ceil(serialized chars / 4) over system + messages', () => {
      const system = 'be terse';
      const messages = [{ role: 'user', content: 'oi' }];
      const expectedChars = JSON.stringify({ system, messages }).length;

      const cost = estimateAnthropicMessageQuoteCostCents({
        model: 'claude-sonnet-4-5',
        system,
        messages,
        maxOutputTokens: 512,
      });

      expect(cost).toBe(22n);
      expect(mockedAnthropicUsage).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-5',
        inputTokens: Math.ceil(expectedChars / 4),
        outputTokens: 512,
      });
    });
  });

  describe('quoteOpenAiChatActualCostCents', () => {
    it('bills prompt, cached, and completion tokens from the usage block', () => {
      const cost = quoteOpenAiChatActualCostCents({
        model: 'gpt-4o',
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 200,
          prompt_tokens_details: { cached_tokens: 400 },
        },
      });

      expect(cost).toBe(33n);
      expect(mockedOpenAiUsage).toHaveBeenCalledWith({
        model: 'gpt-4o',
        inputTokens: 1000,
        cachedInputTokens: 400,
        outputTokens: 200,
      });
    });

    it('bills zero tokens when the provider returns no usage', () => {
      quoteOpenAiChatActualCostCents({ model: 'gpt-4o', usage: null });

      expect(mockedOpenAiUsage).toHaveBeenCalledWith({
        model: 'gpt-4o',
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      });
    });
  });

  describe('quoteAnthropicMessageActualCostCents', () => {
    it('counts cache-creation tokens as billable input and cache-read as cached', () => {
      const cost = quoteAnthropicMessageActualCostCents({
        model: 'claude-sonnet-4-5',
        usage: {
          input_tokens: 800,
          output_tokens: 150,
          cache_read_input_tokens: 300,
          cache_creation_input_tokens: 50,
        },
      });

      expect(cost).toBe(22n);
      expect(mockedAnthropicUsage).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-5',
        inputTokens: 850, // input + cache_creation
        cachedInputTokens: 300,
        outputTokens: 150,
      });
    });

    it('is null-safe for partial usage blocks', () => {
      quoteAnthropicMessageActualCostCents({
        model: 'claude-sonnet-4-5',
        usage: { input_tokens: null, output_tokens: undefined },
      });

      expect(mockedAnthropicUsage).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-5',
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      });
    });
  });
});
