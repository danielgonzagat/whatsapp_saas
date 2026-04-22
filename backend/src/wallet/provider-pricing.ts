const USD_MICROS_SCALE = 1_000_000n;
const TOKENS_PER_MILLION = 1_000_000n;
const BASIS_POINTS_SCALE = 10_000n;

type BigNumberish = bigint | number | string | null | undefined;

export interface ProviderBillingPolicy {
  exchangeRateBrlCentsPerUsd: bigint;
  markupBps: bigint;
}

export interface TokenUsageQuoteInput {
  model: string;
  inputTokens?: BigNumberish;
  cachedInputTokens?: BigNumberish;
  outputTokens?: BigNumberish;
  policy?: ProviderBillingPolicy;
}

export interface OpenAiEmbeddingQuoteInput {
  model: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  inputTokens: BigNumberish;
  policy?: ProviderBillingPolicy;
}

export interface SerializedInputTokenBillingDescriptor {
  model: string;
  inputUsdMicrosPerMillion: string;
  exchangeRateBrlCentsPerUsd: string;
  markupBps: string;
}

interface TokenRateCard {
  inputUsdMicrosPerMillion: bigint;
  cachedInputUsdMicrosPerMillion: bigint;
  outputUsdMicrosPerMillion: bigint;
}

interface EmbeddingRateCard {
  inputUsdMicrosPerMillion: bigint;
}

const DEFAULT_POLICY: ProviderBillingPolicy = {
  exchangeRateBrlCentsPerUsd: 500n,
  markupBps: 30_000n,
};

const OPENAI_TEXT_RATE_CARDS: Record<string, TokenRateCard> = {
  'gpt-5.4': {
    inputUsdMicrosPerMillion: 2_500_000n,
    cachedInputUsdMicrosPerMillion: 250_000n,
    outputUsdMicrosPerMillion: 15_000_000n,
  },
  'gpt-5.4-mini': {
    inputUsdMicrosPerMillion: 750_000n,
    cachedInputUsdMicrosPerMillion: 75_000n,
    outputUsdMicrosPerMillion: 4_500_000n,
  },
  'gpt-5.4-nano': {
    inputUsdMicrosPerMillion: 200_000n,
    cachedInputUsdMicrosPerMillion: 20_000n,
    outputUsdMicrosPerMillion: 1_250_000n,
  },
  'gpt-4.1': {
    inputUsdMicrosPerMillion: 2_000_000n,
    cachedInputUsdMicrosPerMillion: 500_000n,
    outputUsdMicrosPerMillion: 8_000_000n,
  },
  'gpt-4.1-mini': {
    inputUsdMicrosPerMillion: 400_000n,
    cachedInputUsdMicrosPerMillion: 100_000n,
    outputUsdMicrosPerMillion: 1_600_000n,
  },
  'gpt-4.1-nano': {
    inputUsdMicrosPerMillion: 100_000n,
    cachedInputUsdMicrosPerMillion: 25_000n,
    outputUsdMicrosPerMillion: 400_000n,
  },
  'gpt-4o-mini': {
    inputUsdMicrosPerMillion: 150_000n,
    cachedInputUsdMicrosPerMillion: 75_000n,
    outputUsdMicrosPerMillion: 600_000n,
  },
  'gpt-4o-mini-transcribe': {
    inputUsdMicrosPerMillion: 1_250_000n,
    cachedInputUsdMicrosPerMillion: 0n,
    outputUsdMicrosPerMillion: 5_000_000n,
  },
};

const OPENAI_EMBEDDING_RATE_CARDS: Record<OpenAiEmbeddingQuoteInput['model'], EmbeddingRateCard> = {
  'text-embedding-3-small': {
    inputUsdMicrosPerMillion: 20_000n,
  },
  'text-embedding-3-large': {
    inputUsdMicrosPerMillion: 130_000n,
  },
  'text-embedding-ada-002': {
    inputUsdMicrosPerMillion: 100_000n,
  },
};

const ANTHROPIC_TEXT_RATE_CARDS: Record<string, TokenRateCard> = {
  'claude-3-5-haiku': {
    inputUsdMicrosPerMillion: 800_000n,
    cachedInputUsdMicrosPerMillion: 80_000n,
    outputUsdMicrosPerMillion: 4_000_000n,
  },
  'claude-sonnet-4.6': {
    inputUsdMicrosPerMillion: 3_000_000n,
    cachedInputUsdMicrosPerMillion: 300_000n,
    outputUsdMicrosPerMillion: 15_000_000n,
  },
  'claude-sonnet-4.5': {
    inputUsdMicrosPerMillion: 3_000_000n,
    cachedInputUsdMicrosPerMillion: 300_000n,
    outputUsdMicrosPerMillion: 15_000_000n,
  },
};

export class UnknownProviderPricingModelError extends Error {
  constructor(public readonly model: string) {
    super(`No provider pricing registered for model '${model}'`);
    this.name = 'UnknownProviderPricingModelError';
  }
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function normalizeInteger(value: BigNumberish, field: string): bigint {
  if (value === null || value === undefined || value === '') {
    return 0n;
  }

  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new RangeError(`${field} must be >= 0`);
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${field} must be a non-negative safe integer`);
    }
    return BigInt(value);
  }

  if (!/^\d+$/.test(value)) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }

  return BigInt(value);
}

function normalizePolicy(policy?: ProviderBillingPolicy): ProviderBillingPolicy {
  if (!policy) {
    return DEFAULT_POLICY;
  }

  return {
    exchangeRateBrlCentsPerUsd: normalizeInteger(
      policy.exchangeRateBrlCentsPerUsd,
      'exchangeRateBrlCentsPerUsd',
    ),
    markupBps: normalizeInteger(policy.markupBps, 'markupBps'),
  };
}

function normalizeOpenAiModel(model: string): string {
  const normalized = String(model || '')
    .trim()
    .toLowerCase();

  if (normalized.startsWith('gpt-4.1-nano')) {
    return 'gpt-4.1-nano';
  }
  if (normalized.startsWith('gpt-4.1-mini')) {
    return 'gpt-4.1-mini';
  }
  if (normalized.startsWith('gpt-4.1')) {
    return 'gpt-4.1';
  }
  if (normalized.startsWith('gpt-5.4-nano')) {
    return 'gpt-5.4-nano';
  }
  if (normalized.startsWith('gpt-5.4-mini')) {
    return 'gpt-5.4-mini';
  }
  if (normalized.startsWith('gpt-5.4')) {
    return 'gpt-5.4';
  }
  if (normalized.startsWith('gpt-4o-mini-transcribe')) {
    return 'gpt-4o-mini-transcribe';
  }
  if (normalized.startsWith('gpt-4o-mini')) {
    return 'gpt-4o-mini';
  }

  return normalized;
}

function normalizeOpenAiEmbeddingModel(model: string): string {
  const normalized = String(model || '')
    .trim()
    .toLowerCase();

  if (normalized.startsWith('text-embedding-3-small')) {
    return 'text-embedding-3-small';
  }
  if (normalized.startsWith('text-embedding-3-large')) {
    return 'text-embedding-3-large';
  }
  if (normalized.startsWith('text-embedding-ada-002')) {
    return 'text-embedding-ada-002';
  }

  return normalized;
}

function normalizeAnthropicModel(model: string): string {
  const normalized = String(model || '')
    .trim()
    .toLowerCase();

  if (normalized.startsWith('claude-3-5-haiku')) {
    return 'claude-3-5-haiku';
  }
  if (normalized.startsWith('claude-sonnet-4.6')) {
    return 'claude-sonnet-4.6';
  }
  if (normalized.startsWith('claude-sonnet-4.5')) {
    return 'claude-sonnet-4.5';
  }

  return normalized;
}

function resolveOpenAiTextRateCard(model: string): TokenRateCard {
  const rateCard = OPENAI_TEXT_RATE_CARDS[normalizeOpenAiModel(model)];
  if (!rateCard) {
    throw new UnknownProviderPricingModelError(model);
  }
  return rateCard;
}

function resolveOpenAiEmbeddingRateCard(model: string): EmbeddingRateCard {
  const rateCard =
    OPENAI_EMBEDDING_RATE_CARDS[
      normalizeOpenAiEmbeddingModel(model) as OpenAiEmbeddingQuoteInput['model']
    ];
  if (!rateCard) {
    throw new UnknownProviderPricingModelError(model);
  }
  return rateCard;
}

function resolveAnthropicTextRateCard(model: string): TokenRateCard {
  const rateCard = ANTHROPIC_TEXT_RATE_CARDS[normalizeAnthropicModel(model)];
  if (!rateCard) {
    throw new UnknownProviderPricingModelError(model);
  }
  return rateCard;
}

function applyUsdMicrosToBrlCents(
  usdMicrosNumerator: bigint,
  unitScale: bigint,
  policy?: ProviderBillingPolicy,
): bigint {
  const resolvedPolicy = normalizePolicy(policy);

  return ceilDiv(
    usdMicrosNumerator * resolvedPolicy.exchangeRateBrlCentsPerUsd * resolvedPolicy.markupBps,
    unitScale * USD_MICROS_SCALE * BASIS_POINTS_SCALE,
  );
}

export function quoteOpenAiTextUsageCostCents(input: TokenUsageQuoteInput): bigint {
  const rateCard = resolveOpenAiTextRateCard(input.model);
  const inputTokens = normalizeInteger(input.inputTokens, 'inputTokens');
  const cachedInputTokens = normalizeInteger(input.cachedInputTokens, 'cachedInputTokens');
  const outputTokens = normalizeInteger(input.outputTokens, 'outputTokens');
  const usdMicrosNumerator =
    inputTokens * rateCard.inputUsdMicrosPerMillion +
    cachedInputTokens * rateCard.cachedInputUsdMicrosPerMillion +
    outputTokens * rateCard.outputUsdMicrosPerMillion;

  return applyUsdMicrosToBrlCents(usdMicrosNumerator, TOKENS_PER_MILLION, input.policy);
}

export function quoteOpenAiEmbeddingCostCents(input: OpenAiEmbeddingQuoteInput): bigint {
  const inputTokens = normalizeInteger(input.inputTokens, 'inputTokens');
  const rateCard = resolveOpenAiEmbeddingRateCard(input.model);

  return applyUsdMicrosToBrlCents(
    inputTokens * rateCard.inputUsdMicrosPerMillion,
    TOKENS_PER_MILLION,
    input.policy,
  );
}

export function quoteAnthropicTextUsageCostCents(input: TokenUsageQuoteInput): bigint {
  const rateCard = resolveAnthropicTextRateCard(input.model);
  const inputTokens = normalizeInteger(input.inputTokens, 'inputTokens');
  const cachedInputTokens = normalizeInteger(input.cachedInputTokens, 'cachedInputTokens');
  const outputTokens = normalizeInteger(input.outputTokens, 'outputTokens');
  const usdMicrosNumerator =
    inputTokens * rateCard.inputUsdMicrosPerMillion +
    cachedInputTokens * rateCard.cachedInputUsdMicrosPerMillion +
    outputTokens * rateCard.outputUsdMicrosPerMillion;

  return applyUsdMicrosToBrlCents(usdMicrosNumerator, TOKENS_PER_MILLION, input.policy);
}

export function estimateOpenAiTextCostFromCharsCents(input: {
  model: string;
  inputChars: number;
  maxOutputTokens: number;
  cachedInputTokens?: BigNumberish;
  policy?: ProviderBillingPolicy;
}): bigint {
  if (!Number.isSafeInteger(input.inputChars) || input.inputChars < 0) {
    throw new RangeError('inputChars must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 0) {
    throw new RangeError('maxOutputTokens must be a non-negative safe integer');
  }

  const estimatedInputTokens = BigInt(Math.ceil(input.inputChars / 4));

  return quoteOpenAiTextUsageCostCents({
    model: input.model,
    inputTokens: estimatedInputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.maxOutputTokens,
    policy: input.policy,
  });
}

export function buildSerializedOpenAiEmbeddingBillingDescriptor(
  model: OpenAiEmbeddingQuoteInput['model'],
  policy?: ProviderBillingPolicy,
): SerializedInputTokenBillingDescriptor {
  const rateCard = resolveOpenAiEmbeddingRateCard(model);
  const resolvedPolicy = normalizePolicy(policy);

  return {
    model: normalizeOpenAiEmbeddingModel(model),
    inputUsdMicrosPerMillion: rateCard.inputUsdMicrosPerMillion.toString(),
    exchangeRateBrlCentsPerUsd: resolvedPolicy.exchangeRateBrlCentsPerUsd.toString(),
    markupBps: resolvedPolicy.markupBps.toString(),
  };
}

export const PROVIDER_BILLING_DEFAULTS = DEFAULT_POLICY;
