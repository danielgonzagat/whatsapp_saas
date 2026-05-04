/**
 * Provider pricing entry point.
 *
 * Quotes LLM/embedding usage cost in BRL cents using bigint math throughout
 * (no float arithmetic on money). Rate cards, normalization, and shared math
 * live in {@link ./provider-pricing.helpers}; this module exposes the stable
 * public API consumed by services and tests.
 */

import {
  ANTHROPIC_TEXT_MODEL_PREFIXES,
  ANTHROPIC_TEXT_RATE_CARDS,
  type BigNumberish,
  DEFAULT_POLICY,
  type EmbeddingRateCard,
  OPENAI_EMBEDDING_MODEL_PREFIXES,
  OPENAI_EMBEDDING_RATE_CARDS,
  OPENAI_TEXT_MODEL_PREFIXES,
  OPENAI_TEXT_RATE_CARDS,
  type ProviderBillingPolicy,
  TOKENS_PER_MILLION,
  type TokenRateCard,
  applyUsdMicrosToBrlCents,
  computeTextUsdMicrosNumerator,
  normalizeInteger,
  normalizeModelByPrefix,
  normalizePolicy,
} from './provider-pricing.helpers';

export type { ProviderBillingPolicy };

/** Input shape for token-billed text quotes (OpenAI and Anthropic share it). */
export interface TokenUsageQuoteInput {
  /** Provider model id, raw or aliased (e.g. `gpt-5.4-nano-2026-03-17`). */
  model: string;
  /** Non-cached input tokens consumed by the request. */
  inputTokens?: BigNumberish;
  /** Cached input tokens (billed at the discounted cached rate). */
  cachedInputTokens?: BigNumberish;
  /** Output tokens produced by the model. */
  outputTokens?: BigNumberish;
  /** Optional FX/markup override; falls back to {@link DEFAULT_POLICY}. */
  policy?: ProviderBillingPolicy;
}

/** Input shape for OpenAI embedding quotes. */
export interface OpenAiEmbeddingQuoteInput {
  /** OpenAI embedding model id. */
  model: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  /** Tokens to be embedded. */
  inputTokens: BigNumberish;
  /** Optional FX/markup override; falls back to {@link DEFAULT_POLICY}. */
  policy?: ProviderBillingPolicy;
}

/** Stringified billing descriptor for an input-token-only model (e.g. embeddings). */
export interface SerializedInputTokenBillingDescriptor {
  /** Canonical model alias. */
  model: string;
  /** USD micros per 1M input tokens, as a base-10 string. */
  inputUsdMicrosPerMillion: string;
  /** BRL cents per 1 USD, as a base-10 string. */
  exchangeRateBrlCentsPerUsd: string;
  /** Markup in basis points, as a base-10 string. */
  markupBps: string;
}

/** Thrown when a caller passes a model id that has no registered rate card. */
export class UnknownProviderPricingModelError extends Error {
  constructor(public readonly model: string) {
    super(`No provider pricing registered for model '${model}'`);
    this.name = 'UnknownProviderPricingModelError';
  }
}

function resolveRateCard<T>(
  model: string,
  prefixes: readonly string[],
  cards: Record<string, T>,
): T {
  const card = cards[normalizeModelByPrefix(model, prefixes)];
  if (!card) {
    throw new UnknownProviderPricingModelError(model);
  }
  return card;
}

function resolveOpenAiTextRateCard(model: string): TokenRateCard {
  return resolveRateCard(model, OPENAI_TEXT_MODEL_PREFIXES, OPENAI_TEXT_RATE_CARDS);
}

function resolveOpenAiEmbeddingRateCard(model: string): EmbeddingRateCard {
  return resolveRateCard(model, OPENAI_EMBEDDING_MODEL_PREFIXES, OPENAI_EMBEDDING_RATE_CARDS);
}

function resolveAnthropicTextRateCard(model: string): TokenRateCard {
  return resolveRateCard(model, ANTHROPIC_TEXT_MODEL_PREFIXES, ANTHROPIC_TEXT_RATE_CARDS);
}

/**
 * Compute BRL-cents cost for a token-billed text request, given a rate-card
 * resolver. Shared kernel between OpenAI and Anthropic text quotes.
 */
function quoteTextUsageCostCents(
  input: TokenUsageQuoteInput,
  resolveRateCardFor: (model: string) => TokenRateCard,
): bigint {
  const rateCard = resolveRateCardFor(input.model);
  const inputTokens = normalizeInteger(input.inputTokens, 'inputTokens');
  const cachedInputTokens = normalizeInteger(input.cachedInputTokens, 'cachedInputTokens');
  const outputTokens = normalizeInteger(input.outputTokens, 'outputTokens');
  const usdMicrosNumerator = computeTextUsdMicrosNumerator(
    rateCard,
    inputTokens,
    cachedInputTokens,
    outputTokens,
  );

  return applyUsdMicrosToBrlCents(usdMicrosNumerator, TOKENS_PER_MILLION, input.policy);
}

/** Quote BRL-cents cost for an OpenAI text completion request. */
export function quoteOpenAiTextUsageCostCents(input: TokenUsageQuoteInput): bigint {
  return quoteTextUsageCostCents(input, resolveOpenAiTextRateCard);
}

/** Quote BRL-cents cost for an OpenAI embedding request. */
export function quoteOpenAiEmbeddingCostCents(input: OpenAiEmbeddingQuoteInput): bigint {
  const inputTokens = normalizeInteger(input.inputTokens, 'inputTokens');
  const rateCard = resolveOpenAiEmbeddingRateCard(input.model);

  return applyUsdMicrosToBrlCents(
    inputTokens * rateCard.inputUsdMicrosPerMillion,
    TOKENS_PER_MILLION,
    input.policy,
  );
}

/** Quote BRL-cents cost for an Anthropic text completion request. */
export function quoteAnthropicTextUsageCostCents(input: TokenUsageQuoteInput): bigint {
  return quoteTextUsageCostCents(input, resolveAnthropicTextRateCard);
}

/**
 * Estimate BRL-cents cost for an OpenAI text request given character counts.
 *
 * Approximates input tokens as `ceil(inputChars / 4)`. Useful when the caller
 * has a prompt string but has not yet tokenized it.
 *
 * @throws RangeError when `inputChars` or `maxOutputTokens` is not a
 * non-negative safe integer.
 */
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

/**
 * Build a stringified billing descriptor for an OpenAI embedding model. The
 * resulting object is safe to persist (e.g. on a quota record) without losing
 * bigint precision.
 */
export function buildSerializedOpenAiEmbeddingBillingDescriptor(
  model: OpenAiEmbeddingQuoteInput['model'],
  policy?: ProviderBillingPolicy,
): SerializedInputTokenBillingDescriptor {
  const rateCard = resolveOpenAiEmbeddingRateCard(model);
  const resolvedPolicy = normalizePolicy(policy);

  return {
    model: normalizeModelByPrefix(model, OPENAI_EMBEDDING_MODEL_PREFIXES),
    inputUsdMicrosPerMillion: rateCard.inputUsdMicrosPerMillion.toString(),
    exchangeRateBrlCentsPerUsd: resolvedPolicy.exchangeRateBrlCentsPerUsd.toString(),
    markupBps: resolvedPolicy.markupBps.toString(),
  };
}

/** Default FX/markup applied when a caller does not pass a policy. */
export const PROVIDER_BILLING_DEFAULTS = DEFAULT_POLICY;
