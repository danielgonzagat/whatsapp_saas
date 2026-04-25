/**
 * Internal helpers for provider-pricing token cost computation.
 *
 * Public types/values are re-exported from `provider-pricing.ts`. This file
 * concentrates rate cards, normalization, and shared math so the entry point
 * stays small and free of duplication across providers.
 */

/** Numeric inputs accepted by token quote APIs (cents/tokens are non-negative integers). */
export type BigNumberish = bigint | number | string | null | undefined;

/** Currency conversion + markup policy applied to USD-denominated rate cards. */
export interface ProviderBillingPolicy {
  /** BRL cents per 1 USD, e.g. `500n` means 1 USD = 5.00 BRL. */
  exchangeRateBrlCentsPerUsd: bigint;
  /** Markup expressed in basis points; `30_000n` means 3x retail markup. */
  markupBps: bigint;
}

/** Rate card for an LLM that bills input/cached-input/output tokens separately. */
export interface TokenRateCard {
  inputUsdMicrosPerMillion: bigint;
  cachedInputUsdMicrosPerMillion: bigint;
  outputUsdMicrosPerMillion: bigint;
}

/** Rate card for an embeddings model (input-only billing). */
export interface EmbeddingRateCard {
  inputUsdMicrosPerMillion: bigint;
}

export const USD_MICROS_SCALE = 1_000_000n;
export const TOKENS_PER_MILLION = 1_000_000n;
export const BASIS_POINTS_SCALE = 10_000n;

export const DEFAULT_POLICY: ProviderBillingPolicy = {
  exchangeRateBrlCentsPerUsd: 500n,
  markupBps: 30_000n,
};

export const OPENAI_TEXT_RATE_CARDS: Record<string, TokenRateCard> = {
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

export const OPENAI_EMBEDDING_RATE_CARDS: Record<string, EmbeddingRateCard> = {
  'text-embedding-3-small': { inputUsdMicrosPerMillion: 20_000n },
  'text-embedding-3-large': { inputUsdMicrosPerMillion: 130_000n },
  'text-embedding-ada-002': { inputUsdMicrosPerMillion: 100_000n },
};

export const ANTHROPIC_TEXT_RATE_CARDS: Record<string, TokenRateCard> = {
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

/**
 * Prefixes used to normalize OpenAI text model aliases. Order matters:
 * longer/more specific prefixes must come first so e.g. `gpt-5.4-nano-...`
 * resolves to `gpt-5.4-nano` rather than `gpt-5.4`.
 */
export const OPENAI_TEXT_MODEL_PREFIXES: readonly string[] = [
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-5.4-nano',
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-4o-mini-transcribe',
  'gpt-4o-mini',
];

export const OPENAI_EMBEDDING_MODEL_PREFIXES: readonly string[] = [
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
];

export const ANTHROPIC_TEXT_MODEL_PREFIXES: readonly string[] = [
  'claude-3-5-haiku',
  'claude-sonnet-4.6',
  'claude-sonnet-4.5',
];

/** Ceiling-divide two non-negative bigints. */
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Coerce {@link BigNumberish} to a non-negative `bigint`. Empty/null/undefined
 * become `0n`; numbers must be safe integers; strings must match `/^\d+$/`.
 *
 * @throws RangeError when the value is negative or not a non-negative integer.
 */
export function normalizeInteger(value: BigNumberish, field: string): bigint {
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

/** Resolve a partial policy against {@link DEFAULT_POLICY}, validating each field. */
export function normalizePolicy(policy?: ProviderBillingPolicy): ProviderBillingPolicy {
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

/**
 * Lower-case + trim a model identifier and resolve it to a canonical alias by
 * matching against an ordered prefix list. Falls back to the raw normalized
 * value when no prefix matches (so unknown models surface as misses upstream).
 */
export function normalizeModelByPrefix(model: string, prefixes: readonly string[]): string {
  const normalized = String(model || '')
    .trim()
    .toLowerCase();

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return prefix;
    }
  }

  return normalized;
}

/**
 * Convert a USD-micros numerator to BRL cents using a normalized policy.
 *
 * The numerator is `tokens * usdMicrosPerMillion`; `unitScale` is the divisor
 * that maps `tokens` back to whole units (typically `TOKENS_PER_MILLION`).
 */
export function applyUsdMicrosToBrlCents(
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

/**
 * Compute the USD-micros numerator for a token-billed model: input + cached +
 * output, each multiplied by their respective per-million USD-micros rate.
 */
export function computeTextUsdMicrosNumerator(
  rateCard: TokenRateCard,
  inputTokens: bigint,
  cachedInputTokens: bigint,
  outputTokens: bigint,
): bigint {
  return (
    inputTokens * rateCard.inputUsdMicrosPerMillion +
    cachedInputTokens * rateCard.cachedInputUsdMicrosPerMillion +
    outputTokens * rateCard.outputUsdMicrosPerMillion
  );
}
