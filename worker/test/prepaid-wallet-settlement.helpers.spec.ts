import { describe, it, expect } from 'vitest';
import {
  ZERO_BIG,
  ONE_BIG,
  USD_MICROS_SCALE,
  TOKENS_PER_MILLION,
  BASIS_POINTS_SCALE,
  DECIMAL_DIGITS_RE,
  ceilDiv,
  normalizeInteger,
  quoteSerializedInputTokenCostCents,
  absCents,
  computeNewBalance,
  buildAdjustmentMetadata,
  type ISettleInput,
} from '../providers/prepaid-wallet-settlement.helpers';
import { WorkerInsufficientWalletBalanceError } from '../providers/prepaid-wallet-errors';

describe('prepaid-wallet-settlement.helpers — constants', () => {
  it('exposes the BigInt scale factors used across the settlement math', () => {
    expect(ZERO_BIG).toBe(BigInt(0));
    expect(ONE_BIG).toBe(BigInt(1));
    expect(USD_MICROS_SCALE).toBe(BigInt(1_000_000));
    expect(TOKENS_PER_MILLION).toBe(BigInt(1_000_000));
    expect(BASIS_POINTS_SCALE).toBe(BigInt(10_000));
  });

  it('uses an anchored digits-only regex (no leading sign or decimal point allowed)', () => {
    expect(DECIMAL_DIGITS_RE.test('0')).toBe(true);
    expect(DECIMAL_DIGITS_RE.test('1234567890')).toBe(true);
    expect(DECIMAL_DIGITS_RE.test('-1')).toBe(false);
    expect(DECIMAL_DIGITS_RE.test('1.5')).toBe(false);
    expect(DECIMAL_DIGITS_RE.test('')).toBe(false);
    expect(DECIMAL_DIGITS_RE.test(' 1 ')).toBe(false);
  });
});

describe('prepaid-wallet-settlement.helpers — ceilDiv', () => {
  it('rounds up positive non-exact divisions', () => {
    expect(ceilDiv(BigInt(7), BigInt(3))).toBe(BigInt(3));
    expect(ceilDiv(BigInt(1), BigInt(1_000_000))).toBe(BigInt(1));
  });

  it('returns the exact quotient when the division is clean', () => {
    expect(ceilDiv(BigInt(9), BigInt(3))).toBe(BigInt(3));
    expect(ceilDiv(BigInt(0), BigInt(7))).toBe(BigInt(0));
  });
});

describe('prepaid-wallet-settlement.helpers — normalizeInteger', () => {
  it('accepts bigints, numbers, and digit-only strings', () => {
    expect(normalizeInteger(BigInt(42), 'x')).toBe(BigInt(42));
    expect(normalizeInteger(42, 'x')).toBe(BigInt(42));
    expect(normalizeInteger('42', 'x')).toBe(BigInt(42));
    expect(normalizeInteger('0', 'x')).toBe(BigInt(0));
  });

  it('rejects negative bigints with a field-named RangeError', () => {
    expect(() => normalizeInteger(BigInt(-1), 'inputTokens')).toThrow(/inputTokens.*>=\s*0/);
  });

  it('rejects unsafe / negative / non-integer numbers', () => {
    expect(() => normalizeInteger(-1, 'x')).toThrow(/non-negative safe integer/);
    expect(() => normalizeInteger(1.5, 'x')).toThrow(/non-negative safe integer/);
    expect(() => normalizeInteger(Number.MAX_SAFE_INTEGER + 1, 'x')).toThrow(
      /non-negative safe integer/,
    );
  });

  it('rejects strings that are not pure decimal digits', () => {
    expect(() => normalizeInteger('1.5', 'x')).toThrow(/non-negative integer/);
    expect(() => normalizeInteger('-1', 'x')).toThrow(/non-negative integer/);
    expect(() => normalizeInteger('abc', 'x')).toThrow(/non-negative integer/);
    expect(() => normalizeInteger('', 'x')).toThrow(/non-negative integer/);
  });
});

describe('prepaid-wallet-settlement.helpers — quoteSerializedInputTokenCostCents', () => {
  it('quotes the canonical fixture from the parent spec', () => {
    const cents = quoteSerializedInputTokenCostCents({
      inputTokens: 1_000_000,
      billing: {
        model: 'text-embedding-3-small',
        inputUsdMicrosPerMillion: '20000',
        exchangeRateBrlCentsPerUsd: '500',
        markupBps: '30000',
      },
    });

    expect(cents).toBe(BigInt(30));
  });

  it('always rounds up so the platform never under-charges for fractional cents', () => {
    const cents = quoteSerializedInputTokenCostCents({
      inputTokens: 1,
      billing: {
        model: 'tiny',
        inputUsdMicrosPerMillion: '1',
        exchangeRateBrlCentsPerUsd: '1',
        markupBps: '1',
      },
    });

    expect(cents).toBe(BigInt(1));
  });
});

describe('prepaid-wallet-settlement.helpers — absCents', () => {
  it('returns the magnitude of negative USAGE deltas', () => {
    expect(absCents(BigInt(-100))).toBe(BigInt(100));
    expect(absCents(BigInt(100))).toBe(BigInt(100));
    expect(absCents(BigInt(0))).toBe(BigInt(0));
  });
});

describe('prepaid-wallet-settlement.helpers — computeNewBalance', () => {
  const wallet = { id: 'wallet_1', balanceCents: BigInt(1_000) };

  it('debits the wallet when the delta is positive and balance is sufficient', () => {
    expect(computeNewBalance(wallet, BigInt(250))).toBe(BigInt(750));
  });

  it('credits the wallet when the delta is negative (refund)', () => {
    expect(computeNewBalance(wallet, BigInt(-250))).toBe(BigInt(1_250));
  });

  it('throws InsufficientBalance when the positive delta exceeds the balance', () => {
    expect(() => computeNewBalance(wallet, BigInt(2_000))).toThrow(
      WorkerInsufficientWalletBalanceError,
    );
  });

  it('leaves the balance unchanged when the delta is zero', () => {
    expect(computeNewBalance(wallet, BigInt(0))).toBe(wallet.balanceCents);
  });
});

describe('prepaid-wallet-settlement.helpers — buildAdjustmentMetadata', () => {
  const baseInput: ISettleInput = {
    workspaceId: 'ws_1',
    operation: 'kb_ingestion',
    requestId: 'req_1',
    actualCostCents: BigInt(120),
    reason: 'reconcile',
  };

  it('serializes all bigint deltas as decimal strings', () => {
    const metadata = buildAdjustmentMetadata(baseInput, BigInt(100), BigInt(20), 'usage_1') as Record<string, unknown>;

    expect(metadata).toMatchObject({
      operation: 'kb_ingestion',
      reason: 'reconcile',
      actualCostCents: '120',
      chargedCostCents: '100',
      deltaCents: '20',
      originalUsageTransactionId: 'usage_1',
    });
  });

  it('merges optional caller metadata onto the adjustment payload', () => {
    const metadata = buildAdjustmentMetadata(
      { ...baseInput, metadata: { jobId: 'job_42' } },
      BigInt(100),
      BigInt(20),
      'usage_1',
    ) as Record<string, unknown>;

    expect(metadata.jobId).toBe('job_42');
  });

  it('lets caller metadata override the canonical fields (last-write-wins)', () => {
    const metadata = buildAdjustmentMetadata(
      { ...baseInput, metadata: { reason: 'override' } },
      BigInt(100),
      BigInt(20),
      'usage_1',
    ) as Record<string, unknown>;

    expect(metadata.reason).toBe('override');
  });
});
