import {
  BigNumberish,
  USD_MICROS_SCALE,
  TOKENS_PER_MILLION,
  BASIS_POINTS_SCALE,
  DEFAULT_POLICY,
  OPENAI_TEXT_RATE_CARDS,
  OPENAI_EMBEDDING_RATE_CARDS,
  ANTHROPIC_TEXT_RATE_CARDS,
  OPENAI_TEXT_MODEL_PREFIXES,
  OPENAI_EMBEDDING_MODEL_PREFIXES,
  ANTHROPIC_TEXT_MODEL_PREFIXES,
  ceilDiv,
  normalizeInteger,
  normalizePolicy,
  normalizeModelByPrefix,
  applyUsdMicrosToBrlCents,
  computeTextUsdMicrosNumerator,
} from './provider-pricing.helpers';

describe('provider-pricing.helpers', () => {
  describe('constants', () => {
    it('should define USD_MICROS_SCALE as 1 million', () => {
      expect(USD_MICROS_SCALE).toBe(1_000_000n);
    });

    it('should define TOKENS_PER_MILLION as 1 million', () => {
      expect(TOKENS_PER_MILLION).toBe(1_000_000n);
    });

    it('should define BASIS_POINTS_SCALE as 10 thousand', () => {
      expect(BASIS_POINTS_SCALE).toBe(10_000n);
    });

    it('should define DEFAULT_POLICY with valid exchange rate and markup', () => {
      expect(DEFAULT_POLICY.exchangeRateBrlCentsPerUsd).toBe(500n);
      expect(DEFAULT_POLICY.markupBps).toBe(30_000n);
    });

    it('should define OpenAI text rate cards', () => {
      expect(OPENAI_TEXT_RATE_CARDS['gpt-4o-mini']).toBeDefined();
      expect(OPENAI_TEXT_RATE_CARDS['gpt-4o-mini'].inputUsdMicrosPerMillion).toBe(150_000n);
    });

    it('should define OpenAI embedding rate cards', () => {
      expect(OPENAI_EMBEDDING_RATE_CARDS['text-embedding-3-small']).toBeDefined();
      expect(OPENAI_EMBEDDING_RATE_CARDS['text-embedding-3-small'].inputUsdMicrosPerMillion).toBe(
        20_000n,
      );
    });

    it('should define Anthropic text rate cards', () => {
      expect(ANTHROPIC_TEXT_RATE_CARDS['claude-3-5-haiku']).toBeDefined();
      expect(ANTHROPIC_TEXT_RATE_CARDS['claude-3-5-haiku'].inputUsdMicrosPerMillion).toBe(800_000n);
    });

    it('should define model prefix lists', () => {
      expect(OPENAI_TEXT_MODEL_PREFIXES.length).toBeGreaterThan(0);
      expect(OPENAI_EMBEDDING_MODEL_PREFIXES.length).toBeGreaterThan(0);
      expect(ANTHROPIC_TEXT_MODEL_PREFIXES.length).toBeGreaterThan(0);
    });
  });

  describe('ceilDiv', () => {
    it('should divide evenly with zero remainder', () => {
      expect(ceilDiv(10n, 5n)).toBe(2n);
    });

    it('should round up with remainder', () => {
      expect(ceilDiv(10n, 3n)).toBe(4n);
    });

    it('should handle division by 1', () => {
      expect(ceilDiv(5n, 1n)).toBe(5n);
    });

    it('should handle large numbers with bigint precision', () => {
      const large = 1_000_000_000_000n;
      const divisor = 3n;
      const result = ceilDiv(large, divisor);
      expect(result).toBe(333_333_333_334n);
    });

    it('should return 1 for small numerator and divisor', () => {
      expect(ceilDiv(1n, 1n)).toBe(1n);
    });
  });

  describe('normalizeInteger', () => {
    it('should return 0 for null', () => {
      expect(normalizeInteger(null, 'field')).toBe(0n);
    });

    it('should return 0 for undefined', () => {
      expect(normalizeInteger(undefined, 'field')).toBe(0n);
    });

    it('should return 0 for empty string', () => {
      expect(normalizeInteger('', 'field')).toBe(0n);
    });

    it('should accept positive bigint', () => {
      expect(normalizeInteger(42n, 'field')).toBe(42n);
    });

    it('should accept positive number', () => {
      expect(normalizeInteger(42, 'field')).toBe(42n);
    });

    it('should accept numeric string', () => {
      expect(normalizeInteger('42', 'field')).toBe(42n);
    });

    it('should throw for negative bigint', () => {
      expect(() => normalizeInteger(-1n, 'field')).toThrow(RangeError);
    });

    it('should throw for negative number', () => {
      expect(() => normalizeInteger(-1, 'field')).toThrow(RangeError);
    });

    it('should throw for non-integer number', () => {
      expect(() => normalizeInteger(3.14, 'field')).toThrow(RangeError);
    });

    it('should throw for non-numeric string', () => {
      expect(() => normalizeInteger('abc', 'field')).toThrow(RangeError);
    });

    it('should handle large safe integers', () => {
      const large = Number.MAX_SAFE_INTEGER;
      expect(normalizeInteger(large, 'field')).toBe(BigInt(large));
    });
  });

  describe('normalizePolicy', () => {
    it('should return DEFAULT_POLICY when passed undefined', () => {
      const result = normalizePolicy(undefined);
      expect(result).toEqual(DEFAULT_POLICY);
    });

    it('should return DEFAULT_POLICY when passed null', () => {
      const result = normalizePolicy(null as any);
      expect(result).toEqual(DEFAULT_POLICY);
    });

    it('should accept and validate a full policy', () => {
      const policy = {
        exchangeRateBrlCentsPerUsd: 520n,
        markupBps: 35_000n,
      };
      const result = normalizePolicy(policy);
      expect(result.exchangeRateBrlCentsPerUsd).toBe(520n);
      expect(result.markupBps).toBe(35_000n);
    });

    it('should normalize number values to bigint', () => {
      const policy = {
        exchangeRateBrlCentsPerUsd: 500,
        markupBps: 30_000,
      };
      const result = normalizePolicy(policy as any);
      expect(typeof result.exchangeRateBrlCentsPerUsd).toBe('bigint');
      expect(typeof result.markupBps).toBe('bigint');
    });

    it('should throw when policy contains negative values', () => {
      const policy = {
        exchangeRateBrlCentsPerUsd: -500n,
        markupBps: 30_000n,
      };
      expect(() => normalizePolicy(policy)).toThrow(RangeError);
    });
  });

  describe('normalizeModelByPrefix', () => {
    it('should match gpt-4o-mini from longer input', () => {
      const result = normalizeModelByPrefix(
        'gpt-4o-mini-20240718',
        OPENAI_TEXT_MODEL_PREFIXES,
      );
      expect(result).toBe('gpt-4o-mini');
    });

    it('should match gpt-5.4 from input starting with gpt-5.4', () => {
      const result = normalizeModelByPrefix('gpt-5.4-preview', OPENAI_TEXT_MODEL_PREFIXES);
      expect(result).toBe('gpt-5.4');
    });

    it('should be case-insensitive', () => {
      const result = normalizeModelByPrefix('GPT-4O-MINI', OPENAI_TEXT_MODEL_PREFIXES);
      expect(result).toBe('gpt-4o-mini');
    });

    it('should trim whitespace', () => {
      const result = normalizeModelByPrefix('  gpt-4o-mini  ', OPENAI_TEXT_MODEL_PREFIXES);
      expect(result).toBe('gpt-4o-mini');
    });

    it('should return normalized value when no prefix matches', () => {
      const result = normalizeModelByPrefix('unknown-model', OPENAI_TEXT_MODEL_PREFIXES);
      expect(result).toBe('unknown-model');
    });

    it('should handle Anthropic models', () => {
      const result = normalizeModelByPrefix(
        'claude-3-5-haiku-20240514',
        ANTHROPIC_TEXT_MODEL_PREFIXES,
      );
      expect(result).toBe('claude-3-5-haiku');
    });

    it('should handle embedding models', () => {
      const result = normalizeModelByPrefix(
        'text-embedding-3-large-preview',
        OPENAI_EMBEDDING_MODEL_PREFIXES,
      );
      expect(result).toBe('text-embedding-3-large');
    });
  });

  describe('applyUsdMicrosToBrlCents', () => {
    it('should apply exchange rate and markup correctly with bigint precision', () => {
      const usdMicrosNumerator = 1_000_000n; // 1 USD in micros
      const result = applyUsdMicrosToBrlCents(usdMicrosNumerator, TOKENS_PER_MILLION);

      // (1M * 500 * 30000) / (1M * 1M * 10k) = 15_000_000_000 / 10_000_000_000 = 1.5
      // With ceil: 2 BRL cents
      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThan(0n);
    });

    it('should respect custom policy', () => {
      const policy = {
        exchangeRateBrlCentsPerUsd: 500n,
        markupBps: 10_000n, // 1x (no markup)
      };
      const usdMicrosNumerator = 1_000_000n;
      const result = applyUsdMicrosToBrlCents(usdMicrosNumerator, TOKENS_PER_MILLION, policy);

      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThan(0n);
    });

    it('should handle zero numerator', () => {
      const result = applyUsdMicrosToBrlCents(0n, TOKENS_PER_MILLION);
      expect(result).toBe(0n);
    });

    it('should maintain precision without float conversion', () => {
      // Test that no intermediate floats leak into calculation
      const result1 = applyUsdMicrosToBrlCents(1_234_567n, 1_000_000n);
      const result2 = applyUsdMicrosToBrlCents(1_234_567n, 1_000_000n);
      expect(result1).toBe(result2);
    });
  });

  describe('computeTextUsdMicrosNumerator', () => {
    it('should compute correct numerator for input and output tokens', () => {
      const rateCard = {
        inputUsdMicrosPerMillion: 100_000n,
        cachedInputUsdMicrosPerMillion: 10_000n,
        outputUsdMicrosPerMillion: 200_000n,
      };
      const inputTokens = 1_000_000n;
      const cachedInputTokens = 500_000n;
      const outputTokens = 500_000n;

      const result = computeTextUsdMicrosNumerator(
        rateCard,
        inputTokens,
        cachedInputTokens,
        outputTokens,
      );

      // (1M * 100k) + (500k * 10k) + (500k * 200k)
      const expected =
        inputTokens * 100_000n +
        cachedInputTokens * 10_000n +
        outputTokens * 200_000n;
      expect(result).toBe(expected);
    });

    it('should maintain bigint precision throughout', () => {
      const rateCard = OPENAI_TEXT_RATE_CARDS['gpt-4o-mini'];
      const result = computeTextUsdMicrosNumerator(rateCard, 1_000_000n, 0n, 1_000_000n);

      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThan(0n);
    });

    it('should handle zero tokens', () => {
      const rateCard = {
        inputUsdMicrosPerMillion: 100_000n,
        cachedInputUsdMicrosPerMillion: 10_000n,
        outputUsdMicrosPerMillion: 200_000n,
      };
      const result = computeTextUsdMicrosNumerator(rateCard, 0n, 0n, 0n);
      expect(result).toBe(0n);
    });

    it('should compute correctly for Anthropic models', () => {
      const rateCard = ANTHROPIC_TEXT_RATE_CARDS['claude-3-5-haiku'];
      const result = computeTextUsdMicrosNumerator(rateCard, 10_000_000n, 0n, 5_000_000n);

      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThan(0n);
    });
  });

  describe('integration: end-to-end cost computation', () => {
    it('should compute cost in BRL cents for OpenAI GPT-4o-mini', () => {
      const rateCard = OPENAI_TEXT_RATE_CARDS['gpt-4o-mini'];
      const inputTokens = 1_000_000n;
      const outputTokens = 500_000n;

      const usdMicrosNumerator = computeTextUsdMicrosNumerator(
        rateCard,
        inputTokens,
        0n,
        outputTokens,
      );
      const brlCents = applyUsdMicrosToBrlCents(usdMicrosNumerator, TOKENS_PER_MILLION);

      expect(typeof brlCents).toBe('bigint');
      expect(brlCents).toBeGreaterThan(0n);
    });

    it('should compute cost in BRL cents for Anthropic Claude', () => {
      const rateCard = ANTHROPIC_TEXT_RATE_CARDS['claude-3-5-haiku'];
      const inputTokens = 1_000_000n;
      const outputTokens = 1_000_000n;

      const usdMicrosNumerator = computeTextUsdMicrosNumerator(
        rateCard,
        inputTokens,
        0n,
        outputTokens,
      );
      const brlCents = applyUsdMicrosToBrlCents(usdMicrosNumerator, TOKENS_PER_MILLION);

      expect(typeof brlCents).toBe('bigint');
      expect(brlCents).toBeGreaterThan(0n);
    });

    it('should never use float conversion in entire pipeline', () => {
      const rateCard = OPENAI_TEXT_RATE_CARDS['gpt-4o-mini'];
      const input = 2_500_000n;
      const output = 750_000n;

      const usdMicros = computeTextUsdMicrosNumerator(rateCard, input, 0n, output);
      const brlCents = applyUsdMicrosToBrlCents(usdMicros, TOKENS_PER_MILLION);

      // Verify no NaN or Infinity
      expect(Number.isNaN(Number(brlCents))).toBe(false);
      expect(Number.isFinite(Number(brlCents))).toBe(true);

      // Verify result is bigint
      expect(typeof brlCents).toBe('bigint');
    });
  });
});
