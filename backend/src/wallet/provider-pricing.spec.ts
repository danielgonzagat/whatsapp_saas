import {
  PROVIDER_BILLING_DEFAULTS,
  UnknownProviderPricingModelError,
  buildSerializedOpenAiEmbeddingBillingDescriptor,
  estimateOpenAiTextCostFromCharsCents,
  quoteOpenAiEmbeddingCostCents,
  quoteOpenAiTextUsageCostCents,
} from './provider-pricing';

describe('provider-pricing', () => {
  it('quotes GPT-5.4 token usage with FX=5 and 3x markup', () => {
    const cents = quoteOpenAiTextUsageCostCents({
      model: 'gpt-5.4',
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cents).toBe(26_625n);
  });

  it('quotes GPT-5.4 nano snapshots via normalized model aliases', () => {
    const cents = quoteOpenAiTextUsageCostCents({
      model: 'gpt-5.4-nano-2026-03-17',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cents).toBe(2_175n);
  });

  it('quotes GPT-4.1 fallback aliases', () => {
    const cents = quoteOpenAiTextUsageCostCents({
      model: 'gpt-4.1-2025-04-14',
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cents).toBe(15_750n);
  });

  it('quotes text-embedding-3-small with the certified FX and markup', () => {
    const cents = quoteOpenAiEmbeddingCostCents({
      model: 'text-embedding-3-small',
      inputTokens: 1_000_000,
    });

    expect(cents).toBe(30n);
  });

  it('serializes embedding billing descriptors for async settlement', () => {
    expect(buildSerializedOpenAiEmbeddingBillingDescriptor('text-embedding-3-small')).toEqual({
      model: 'text-embedding-3-small',
      inputUsdMicrosPerMillion: '20000',
      exchangeRateBrlCentsPerUsd: '500',
      markupBps: '30000',
    });
  });

  it('estimates text upper bounds from input chars and max output tokens', () => {
    const cents = estimateOpenAiTextCostFromCharsCents({
      model: 'gpt-5.4',
      inputChars: 400,
      maxOutputTokens: 200,
    });

    expect(cents).toBe(5n);
  });

  it('throws for unknown models instead of guessing a rate', () => {
    expect(() =>
      quoteOpenAiTextUsageCostCents({
        model: 'gpt-unknown',
        inputTokens: 1,
      }),
    ).toThrow(UnknownProviderPricingModelError);
  });

  it('exposes the certified billing defaults', () => {
    expect(PROVIDER_BILLING_DEFAULTS).toEqual({
      exchangeRateBrlCentsPerUsd: 500n,
      markupBps: 30_000n,
    });
  });
});
