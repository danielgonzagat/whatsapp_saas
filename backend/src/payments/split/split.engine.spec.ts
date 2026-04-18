import * as fc from 'fast-check';

import { calculateSplit } from './split.engine';
import type { SplitInput, SplitOutput } from './split.types';

const sumSplits = (output: SplitOutput): bigint =>
  output.splits.reduce<bigint>((acc, line) => acc + line.amountCents, 0n);

const conserves = (input: SplitInput, output: SplitOutput): boolean =>
  sumSplits(output) + output.kloelTotalCents + output.residueCents === input.buyerPaidCents;

describe("calculateSplit — Daniel's 4 hypotheses", () => {
  // Common: R$ 139,90 paid, R$ 100,00 sale, R$ 39,90 interest, R$ 9,90 Kloel fee.
  const baseInput = (): Omit<SplitInput, 'supplier' | 'affiliate' | 'coproducer' | 'manager'> => ({
    buyerPaidCents: 13_990n,
    saleValueCents: 10_000n,
    interestCents: 3_990n,
    platformFeeCents: 990n,
    seller: { accountId: 'acct_seller' },
  });

  it('Hypothesis 1: no affiliate, no supplier — seller absorbs R$90,10 after Kloel', () => {
    const input: SplitInput = baseInput();
    const out = calculateSplit(input);

    expect(out.kloelTotalCents).toBe(4_980n);
    expect(out.splits).toEqual([{ accountId: 'acct_seller', role: 'seller', amountCents: 9_010n }]);
    expect(out.residueCents).toBe(0n);
    expect(conserves(input, out)).toBe(true);
  });

  it('Hypothesis 2: supplier R$42,10 — seller gets R$48,00, supplier R$42,10', () => {
    const input: SplitInput = {
      ...baseInput(),
      supplier: { accountId: 'acct_supplier', amountCents: 4_210n },
    };
    const out = calculateSplit(input);

    expect(out.kloelTotalCents).toBe(4_980n);
    expect(out.splits).toEqual([
      { accountId: 'acct_supplier', role: 'supplier', amountCents: 4_210n },
      { accountId: 'acct_seller', role: 'seller', amountCents: 4_800n },
    ]);
    expect(conserves(input, out)).toBe(true);
  });

  it('Hypothesis 3: affiliate 40% + supplier R$42,10 — seller gets R$11,96', () => {
    const input: SplitInput = {
      ...baseInput(),
      supplier: { accountId: 'acct_supplier', amountCents: 4_210n },
      affiliate: { accountId: 'acct_affiliate', percentBp: 4_000 },
    };
    const out = calculateSplit(input);

    // commissionBase = 10000 - 990 = 9010; affiliate = 40% of 9010 = 3604.
    expect(out.kloelTotalCents).toBe(4_980n);
    expect(out.splits).toEqual([
      { accountId: 'acct_supplier', role: 'supplier', amountCents: 4_210n },
      { accountId: 'acct_affiliate', role: 'affiliate', amountCents: 3_604n },
      { accountId: 'acct_seller', role: 'seller', amountCents: 1_196n },
    ]);
    expect(conserves(input, out)).toBe(true);
  });

  it('Hypothesis 4: affiliate 40% + supplier R$42,10 + coproducer 4% + manager 2% — seller gets R$6,56', () => {
    const input: SplitInput = {
      ...baseInput(),
      supplier: { accountId: 'acct_supplier', amountCents: 4_210n },
      affiliate: { accountId: 'acct_affiliate', percentBp: 4_000 },
      coproducer: { accountId: 'acct_coproducer', percentBp: 400 },
      manager: { accountId: 'acct_manager', percentBp: 200 },
    };
    const out = calculateSplit(input);

    // commissionBase = 9010; coproducer = 4% = 360; manager = 2% = 180.
    expect(out.splits).toEqual([
      { accountId: 'acct_supplier', role: 'supplier', amountCents: 4_210n },
      { accountId: 'acct_affiliate', role: 'affiliate', amountCents: 3_604n },
      { accountId: 'acct_coproducer', role: 'coproducer', amountCents: 360n },
      { accountId: 'acct_manager', role: 'manager', amountCents: 180n },
      { accountId: 'acct_seller', role: 'seller', amountCents: 656n },
    ]);
    expect(conserves(input, out)).toBe(true);
  });
});

describe('calculateSplit — priority and clamping edge cases', () => {
  const baseInput = (): Omit<SplitInput, 'supplier' | 'affiliate' | 'coproducer' | 'manager'> => ({
    buyerPaidCents: 13_990n,
    saleValueCents: 10_000n,
    interestCents: 3_990n,
    platformFeeCents: 990n,
    seller: { accountId: 'acct_seller' },
  });

  it('affiliate at 100% with supplier consuming most: affiliate gets remaining, seller gets 0', () => {
    const input: SplitInput = {
      ...baseInput(),
      supplier: { accountId: 'acct_supplier', amountCents: 4_800n },
      affiliate: { accountId: 'acct_affiliate', percentBp: 10_000 }, // 100%
    };
    const out = calculateSplit(input);

    // Kloel: 4980. Remaining: 9010. Supplier: 4800 → remaining 4210.
    // Affiliate calc: 100% of 9010 = 9010, clamped to 4210.
    // Seller: 0.
    expect(out.splits).toEqual([
      { accountId: 'acct_supplier', role: 'supplier', amountCents: 4_800n },
      { accountId: 'acct_affiliate', role: 'affiliate', amountCents: 4_210n },
      { accountId: 'acct_seller', role: 'seller', amountCents: 0n },
    ]);
    expect(conserves(input, out)).toBe(true);
  });

  it('affiliate 100% without supplier: seller gets 0', () => {
    const input: SplitInput = {
      ...baseInput(),
      affiliate: { accountId: 'acct_affiliate', percentBp: 10_000 },
    };
    const out = calculateSplit(input);

    expect(out.splits).toEqual([
      { accountId: 'acct_affiliate', role: 'affiliate', amountCents: 9_010n },
      { accountId: 'acct_seller', role: 'seller', amountCents: 0n },
    ]);
    expect(conserves(input, out)).toBe(true);
  });

  it('coproducer/manager are dropped (not zero entries) when remaining is exhausted', () => {
    const input: SplitInput = {
      ...baseInput(),
      affiliate: { accountId: 'acct_affiliate', percentBp: 10_000 }, // takes all 9010
      coproducer: { accountId: 'acct_coproducer', percentBp: 400 },
      manager: { accountId: 'acct_manager', percentBp: 200 },
    };
    const out = calculateSplit(input);

    expect(out.splits).toEqual([
      { accountId: 'acct_affiliate', role: 'affiliate', amountCents: 9_010n },
      { accountId: 'acct_seller', role: 'seller', amountCents: 0n },
    ]);
    // No coproducer/manager lines emitted — they would be 0.
    expect(out.splits.find((s) => s.role === 'coproducer')).toBeUndefined();
    expect(out.splits.find((s) => s.role === 'manager')).toBeUndefined();
    expect(conserves(input, out)).toBe(true);
  });

  it('percentBp = 9999 (99.99%) computes correctly', () => {
    const input: SplitInput = {
      ...baseInput(),
      affiliate: { accountId: 'acct_affiliate', percentBp: 9_999 },
    };
    const out = calculateSplit(input);

    // 99.99% of 9010 = 9009.0990 → integer division → 9009.
    const affiliate = out.splits.find((s) => s.role === 'affiliate');
    expect(affiliate?.amountCents).toBe(9_009n);
    expect(conserves(input, out)).toBe(true);
  });

  it('Kloel + interest >= buyerPaid: pathological input returns Kloel=full, no splits', () => {
    const input: SplitInput = {
      buyerPaidCents: 1_000n,
      saleValueCents: 10_000n,
      interestCents: 500n,
      platformFeeCents: 600n, // 1100 > 1000 buyerPaid
      seller: { accountId: 'acct_seller' },
    };
    const out = calculateSplit(input);

    expect(out.kloelTotalCents).toBe(1_000n);
    expect(out.splits).toHaveLength(0);
    expect(conserves(input, out)).toBe(true);
  });

  it('zero supplier amount produces no supplier line', () => {
    const input: SplitInput = {
      ...baseInput(),
      supplier: { accountId: 'acct_supplier', amountCents: 0n },
    };
    const out = calculateSplit(input);

    expect(out.splits.find((s) => s.role === 'supplier')).toBeUndefined();
    expect(conserves(input, out)).toBe(true);
  });

  it('zero affiliate percent emits no affiliate line', () => {
    const input: SplitInput = {
      ...baseInput(),
      affiliate: { accountId: 'acct_affiliate', percentBp: 0 },
    };
    const out = calculateSplit(input);

    expect(out.splits.find((s) => s.role === 'affiliate')).toBeUndefined();
    expect(conserves(input, out)).toBe(true);
  });
});

describe('calculateSplit — input validation', () => {
  const seller = { accountId: 'acct_seller' };

  it('rejects negative buyerPaid', () => {
    expect(() =>
      calculateSplit({
        buyerPaidCents: -1n,
        saleValueCents: 10_000n,
        interestCents: 0n,
        platformFeeCents: 990n,
        seller,
      }),
    ).toThrow(/buyerPaidCents/);
  });

  it('rejects platformFee exceeding saleValue', () => {
    expect(() =>
      calculateSplit({
        buyerPaidCents: 10_000n,
        saleValueCents: 1_000n,
        interestCents: 0n,
        platformFeeCents: 9_999n,
        seller,
      }),
    ).toThrow(/cannot exceed saleValueCents/);
  });

  it('rejects out-of-range percentBp', () => {
    expect(() =>
      calculateSplit({
        buyerPaidCents: 10_000n,
        saleValueCents: 10_000n,
        interestCents: 0n,
        platformFeeCents: 0n,
        affiliate: { accountId: 'a', percentBp: 10_001 },
        seller,
      }),
    ).toThrow(/percentBp/);
  });

  it('rejects non-integer percentBp', () => {
    expect(() =>
      calculateSplit({
        buyerPaidCents: 10_000n,
        saleValueCents: 10_000n,
        interestCents: 0n,
        platformFeeCents: 0n,
        affiliate: { accountId: 'a', percentBp: 33.5 },
        seller,
      }),
    ).toThrow(/percentBp/);
  });
});

describe('calculateSplit — conservation invariant (property-based)', () => {
  it('Σ(splits) + kloelTotal + residue === buyerPaid for any valid input', () => {
    const cents = (max: number) => fc.bigInt({ min: 0n, max: BigInt(max) });

    const arb = fc
      .record({
        buyerPaidCents: cents(10_000_000), // up to R$100k
        platformFeeBp: fc.integer({ min: 0, max: 10_000 }), // % of saleValue
        interestCents: cents(5_000_000),
        supplierAmountCents: cents(5_000_000),
        affiliateBp: fc.integer({ min: 0, max: 10_000 }),
        coproducerBp: fc.integer({ min: 0, max: 10_000 }),
        managerBp: fc.integer({ min: 0, max: 10_000 }),
        hasSupplier: fc.boolean(),
        hasAffiliate: fc.boolean(),
        hasCoproducer: fc.boolean(),
        hasManager: fc.boolean(),
        saleValueCents: cents(10_000_000),
      })
      .map((r) => {
        const platformFeeCents = (r.saleValueCents * BigInt(r.platformFeeBp)) / 10_000n;
        const input: SplitInput = {
          buyerPaidCents: r.buyerPaidCents,
          saleValueCents: r.saleValueCents,
          interestCents: r.interestCents,
          platformFeeCents,
          supplier: r.hasSupplier
            ? { accountId: 'acct_s', amountCents: r.supplierAmountCents }
            : undefined,
          affiliate: r.hasAffiliate ? { accountId: 'acct_a', percentBp: r.affiliateBp } : undefined,
          coproducer: r.hasCoproducer
            ? { accountId: 'acct_c', percentBp: r.coproducerBp }
            : undefined,
          manager: r.hasManager ? { accountId: 'acct_m', percentBp: r.managerBp } : undefined,
          seller: { accountId: 'acct_se' },
        };
        return input;
      });

    fc.assert(
      fc.property(arb, (input) => {
        const out = calculateSplit(input);
        return conserves(input, out);
      }),
      { numRuns: 1_000 },
    );
  });

  it('every line amount is non-negative for any valid input', () => {
    const cents = (max: number) => fc.bigInt({ min: 0n, max: BigInt(max) });

    const arb = fc
      .record({
        buyerPaidCents: cents(1_000_000),
        saleValueCents: cents(1_000_000),
        platformFeeCents: cents(100_000),
        interestCents: cents(100_000),
        affiliateBp: fc.integer({ min: 0, max: 10_000 }),
      })
      .filter((r) => r.platformFeeCents <= r.saleValueCents)
      .map<SplitInput>((r) => ({
        buyerPaidCents: r.buyerPaidCents,
        saleValueCents: r.saleValueCents,
        interestCents: r.interestCents,
        platformFeeCents: r.platformFeeCents,
        affiliate: { accountId: 'acct_a', percentBp: r.affiliateBp },
        seller: { accountId: 'acct_se' },
      }));

    fc.assert(
      fc.property(arb, (input) => {
        const out = calculateSplit(input);
        return out.splits.every((line) => line.amountCents >= 0n);
      }),
      { numRuns: 500 },
    );
  });
});
