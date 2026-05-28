import {
  buildSnapshot,
  parseBigIntString,
  parseManualTransfers,
  planProportionalReversals,
  ROLE_PRIORITY,
} from './connect-reversal.service.helpers';

describe('connect-reversal.service.helpers', () => {
  describe('ROLE_PRIORITY', () => {
    it('ranks supplier < affiliate < coproducer < manager < seller for tie-breaks', () => {
      expect(ROLE_PRIORITY.supplier).toBe(1);
      expect(ROLE_PRIORITY.affiliate).toBe(2);
      expect(ROLE_PRIORITY.coproducer).toBe(3);
      expect(ROLE_PRIORITY.manager).toBe(4);
      expect(ROLE_PRIORITY.seller).toBe(5);
    });

    it('is frozen so callers cannot reorder roles at runtime', () => {
      expect(Object.isFrozen(ROLE_PRIORITY)).toBe(true);
    });
  });

  describe('parseBigIntString', () => {
    it('parses digit-only strings into BigInt', () => {
      expect(parseBigIntString('13990')).toBe(13990n);
      expect(parseBigIntString('0')).toBe(0n);
    });

    it('parses signed integer strings', () => {
      expect(parseBigIntString('-42')).toBe(-42n);
    });

    it('parses safe integer numbers', () => {
      expect(parseBigIntString(1196)).toBe(1196n);
      expect(parseBigIntString(0)).toBe(0n);
    });

    it('returns 0n for non-integer numbers (defensive against float Stripe metadata)', () => {
      expect(parseBigIntString(1.5)).toBe(0n);
      expect(parseBigIntString(Number.NaN)).toBe(0n);
    });

    it('returns 0n for malformed strings', () => {
      expect(parseBigIntString('not-a-number')).toBe(0n);
      expect(parseBigIntString('1.5')).toBe(0n);
      expect(parseBigIntString('0x10')).toBe(0n);
      expect(parseBigIntString('')).toBe(0n);
    });

    it('returns 0n for null/undefined/object inputs', () => {
      expect(parseBigIntString(null)).toBe(0n);
      expect(parseBigIntString(undefined)).toBe(0n);
      expect(parseBigIntString({ value: '10' })).toBe(0n);
      expect(parseBigIntString([10])).toBe(0n);
      expect(parseBigIntString(true)).toBe(0n);
    });
  });

  describe('parseManualTransfers', () => {
    it('returns [] when the input is not an array', () => {
      expect(parseManualTransfers(null)).toEqual([]);
      expect(parseManualTransfers(undefined)).toEqual([]);
      expect(parseManualTransfers({})).toEqual([]);
      expect(parseManualTransfers('transfers')).toEqual([]);
    });

    it('returns [] for an empty array', () => {
      expect(parseManualTransfers([])).toEqual([]);
    });

    it('keeps only rows matching the PersistedManualTransfer shape', () => {
      const input = [
        {
          role: 'supplier',
          accountId: 'acct_supplier',
          amountCents: '4210',
          stripeTransferId: 'tr_supplier_1',
        },
        { role: 'affiliate', accountId: 'acct_aff', amountCents: '3604' }, // missing stripeTransferId
        null,
        'tr_invalid',
        {
          role: 'manager',
          accountId: 'acct_manager',
          amountCents: 1000, // number, not string → dropped
          stripeTransferId: 'tr_manager_1',
        },
        {
          role: 'seller',
          accountId: 'acct_seller',
          amountCents: '1000',
          stripeTransferId: 'tr_seller_1',
        },
      ];

      const result = parseManualTransfers(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        role: 'supplier',
        accountId: 'acct_supplier',
        amountCents: '4210',
        stripeTransferId: 'tr_supplier_1',
      });
      expect(result[1]).toEqual({
        role: 'seller',
        accountId: 'acct_seller',
        amountCents: '1000',
        stripeTransferId: 'tr_seller_1',
      });
    });
  });

  describe('buildSnapshot', () => {
    it('returns null when webhookData is not an object', () => {
      expect(buildSnapshot(null)).toBeNull();
      expect(buildSnapshot(undefined)).toBeNull();
      expect(buildSnapshot('snapshot')).toBeNull();
      expect(buildSnapshot([])).toBeNull();
    });

    it('returns null when splitInput is missing', () => {
      expect(
        buildSnapshot({
          connectPostSale: { transferGroup: 'tg' },
        }),
      ).toBeNull();
    });

    it('returns null when connectPostSale is missing', () => {
      expect(
        buildSnapshot({
          splitInput: { buyerPaidCents: '100' },
        }),
      ).toBeNull();
    });

    it('coerces fields and tolerates missing sub-fields', () => {
      const snapshot = buildSnapshot({
        splitInput: { buyerPaidCents: '13990' },
        connectPostSale: {
          sellerStripeAccountId: 'acct_seller',
          sellerDestinationAmountCents: '1196',
          transferGroup: 'sale:order_1',
          transfers: [
            {
              role: 'supplier',
              accountId: 'acct_supplier',
              amountCents: '4210',
              stripeTransferId: 'tr_supplier_1',
            },
          ],
        },
      });

      expect(snapshot).toEqual({
        buyerPaidCents: 13990n,
        transferGroup: 'sale:order_1',
        sellerStripeAccountId: 'acct_seller',
        sellerDestinationAmountCents: 1196n,
        manualTransfers: [
          {
            role: 'supplier',
            accountId: 'acct_supplier',
            amountCents: '4210',
            stripeTransferId: 'tr_supplier_1',
          },
        ],
      });
    });

    it('defaults missing numeric fields to 0n and missing transfers to []', () => {
      const snapshot = buildSnapshot({
        splitInput: {},
        connectPostSale: {},
      });
      expect(snapshot).toEqual({
        buyerPaidCents: 0n,
        transferGroup: null,
        sellerStripeAccountId: null,
        sellerDestinationAmountCents: 0n,
        manualTransfers: [],
      });
    });

    it('drops malformed transfer rows but keeps the well-formed ones', () => {
      const snapshot = buildSnapshot({
        splitInput: { buyerPaidCents: '100' },
        connectPostSale: {
          transfers: [
            { role: 'supplier' }, // malformed
            {
              role: 'seller',
              accountId: 'acct_seller',
              amountCents: '40',
              stripeTransferId: 'tr_seller',
            },
          ],
        },
      });
      expect(snapshot?.manualTransfers).toHaveLength(1);
      expect(snapshot?.manualTransfers[0]?.role).toBe('seller');
    });
  });

  describe('planProportionalReversals', () => {
    it('returns [] for empty lines', () => {
      expect(planProportionalReversals([], 100n, 1000n)).toEqual([]);
    });

    it('returns [] for non-positive requestedAmountCents', () => {
      const lines = [
        {
          role: 'seller' as const,
          accountId: 'acct',
          amountCents: 100n,
          stripeTransferId: 'tr_1',
        },
      ];
      expect(planProportionalReversals(lines, 0n, 1000n)).toEqual([]);
      expect(planProportionalReversals(lines, -10n, 1000n)).toEqual([]);
    });

    it('returns [] for non-positive buyerPaidCents (defensive against bad snapshot)', () => {
      const lines = [
        {
          role: 'seller' as const,
          accountId: 'acct',
          amountCents: 100n,
          stripeTransferId: 'tr_1',
        },
      ];
      expect(planProportionalReversals(lines, 100n, 0n)).toEqual([]);
      expect(planProportionalReversals(lines, 100n, -1n)).toEqual([]);
    });

    it('reverses every line proportionally on a full refund (exact-divisor case)', () => {
      const lines = [
        {
          role: 'supplier' as const,
          accountId: 'acct_supplier',
          amountCents: 4210n,
          stripeTransferId: 'tr_supplier_1',
        },
        {
          role: 'affiliate' as const,
          accountId: 'acct_affiliate',
          amountCents: 3604n,
          stripeTransferId: 'tr_affiliate_1',
        },
        {
          role: 'seller' as const,
          accountId: 'acct_seller',
          amountCents: 1196n,
          stripeTransferId: 'tr_seller_1',
        },
      ];
      const plan = planProportionalReversals(lines, 13990n, 13990n);
      // ratio == 1, so reversal = line.amountCents
      expect(plan).toHaveLength(3);
      expect(plan.map((p) => p.amountCents)).toEqual([4210n, 3604n, 1196n]);
    });

    it('distributes the fractional cent to the highest-remainder line first', () => {
      // requested=2 buyerPaid=13990 lines totaling buyerPaid.
      // floor(4210*2/13990) = 0 (rem 8420)
      // floor(3604*2/13990) = 0 (rem 7208)
      // floor(1196*2/13990) = 0 (rem 2392)
      // totalTarget = floor(9010*2/13990) = 1
      // Highest remainder = supplier (8420) gets the cent.
      const lines = [
        {
          role: 'supplier' as const,
          accountId: 'acct_supplier',
          amountCents: 4210n,
          stripeTransferId: 'tr_supplier_1',
        },
        {
          role: 'affiliate' as const,
          accountId: 'acct_affiliate',
          amountCents: 3604n,
          stripeTransferId: 'tr_affiliate_1',
        },
        {
          role: 'seller' as const,
          accountId: 'acct_seller',
          amountCents: 1196n,
          stripeTransferId: 'tr_seller_1',
        },
      ];
      const plan = planProportionalReversals(lines, 2n, 13990n);
      expect(plan).toHaveLength(1);
      expect(plan[0]?.stripeTransferId).toBe('tr_supplier_1');
      expect(plan[0]?.amountCents).toBe(1n);
    });

    it('breaks remainder ties using ROLE_PRIORITY (supplier before affiliate)', () => {
      // Equal lines → equal remainders → supplier (priority 1) gets the bonus first.
      const lines = [
        {
          role: 'affiliate' as const,
          accountId: 'acct_aff',
          amountCents: 100n,
          stripeTransferId: 'tr_aff_1',
        },
        {
          role: 'supplier' as const,
          accountId: 'acct_sup',
          amountCents: 100n,
          stripeTransferId: 'tr_sup_1',
        },
      ];
      // requested=1 buyerPaid=3 lines total=200 → floors=33,33 sumFloors=66 totalTarget=floor(200/3)=66
      // remainderToDistribute = 0 → no bonus
      const noBonusPlan = planProportionalReversals(lines, 1n, 3n);
      expect(noBonusPlan.map((p) => p.amountCents)).toEqual([33n, 33n]);

      // requested=1 buyerPaid=4 lines total=200 → floors=25,25 sumFloors=50 totalTarget=floor(200/4)=50
      // floor of each: 100*1/4 = 25, remainder = 0 for both → ROLE_PRIORITY supplier wins tie
      // remainderToDistribute = 50 - 50 = 0 (no bonus anyway).
      // Use a setup that forces a tie WITH bonus.
      const tieLines = [
        {
          role: 'affiliate' as const,
          accountId: 'acct_aff',
          amountCents: 5n,
          stripeTransferId: 'tr_aff_1',
        },
        {
          role: 'supplier' as const,
          accountId: 'acct_sup',
          amountCents: 5n,
          stripeTransferId: 'tr_sup_1',
        },
      ];
      // requested=1 buyerPaid=3 lines total=10
      // floor(5*1/3)=1 rem 2 (for both) totalTarget=floor(10/3)=3 sumFloors=2 → 1 bonus
      // Tie remainder (2 vs 2) → supplier (priority 1) gets the bonus cent.
      const tiePlan = planProportionalReversals(tieLines, 1n, 3n);
      const supplierLine = tiePlan.find((p) => p.role === 'supplier');
      const affiliateLine = tiePlan.find((p) => p.role === 'affiliate');
      expect(supplierLine?.amountCents).toBe(2n);
      expect(affiliateLine?.amountCents).toBe(1n);
    });

    it('breaks role+remainder ties deterministically by stripeTransferId lexicographic order', () => {
      const lines = [
        {
          role: 'supplier' as const,
          accountId: 'acct_a',
          amountCents: 5n,
          stripeTransferId: 'tr_zzz',
        },
        {
          role: 'supplier' as const,
          accountId: 'acct_b',
          amountCents: 5n,
          stripeTransferId: 'tr_aaa',
        },
      ];
      // Both supplier, both remainder=2; totalTarget=3, sumFloors=2 → 1 bonus.
      // Lexicographic tie-break → tr_aaa < tr_zzz → tr_aaa gets the bonus.
      const plan = planProportionalReversals(lines, 1n, 3n);
      const winner = plan.find((p) => p.stripeTransferId === 'tr_aaa');
      const loser = plan.find((p) => p.stripeTransferId === 'tr_zzz');
      expect(winner?.amountCents).toBe(2n);
      expect(loser?.amountCents).toBe(1n);
    });

    it('preserves the input line order in the output', () => {
      const lines = [
        {
          role: 'seller' as const,
          accountId: 'acct_seller',
          amountCents: 100n,
          stripeTransferId: 'tr_seller',
        },
        {
          role: 'supplier' as const,
          accountId: 'acct_supplier',
          amountCents: 100n,
          stripeTransferId: 'tr_supplier',
        },
      ];
      const plan = planProportionalReversals(lines, 200n, 200n);
      // Even though supplier has a lower ROLE_PRIORITY, the output order
      // mirrors the input (seller first).
      expect(plan.map((p) => p.role)).toEqual(['seller', 'supplier']);
    });

    it('never produces a reversal exceeding the original line amount (skip-saturated lines)', () => {
      // requested=4 buyerPaid=6 lines total=6
      // floor(1*4/6)=0 rem 4 / floor(5*4/6)=3 rem 2 → sumFloors=3 totalTarget=floor(6*4/6)=4 → 1 bonus
      // supplier highest remainder → gets bonus → supplier=1, affiliate=3. Sum=4. ✓
      const lines = [
        {
          role: 'supplier' as const,
          accountId: 'acct_supplier',
          amountCents: 1n,
          stripeTransferId: 'tr_supplier',
        },
        {
          role: 'affiliate' as const,
          accountId: 'acct_affiliate',
          amountCents: 5n,
          stripeTransferId: 'tr_affiliate',
        },
      ];
      const plan = planProportionalReversals(lines, 4n, 6n);
      const supplier = plan.find((p) => p.role === 'supplier');
      const affiliate = plan.find((p) => p.role === 'affiliate');
      // supplier may receive its single cent of bonus; never more than its original amount.
      expect(supplier?.amountCents).toBeLessThanOrEqual(1n);
      expect(affiliate?.amountCents).toBeLessThanOrEqual(5n);
      const total = plan.reduce((sum, p) => sum + p.amountCents, 0n);
      expect(total).toBe(4n);
    });

    it('drops zero-amount reversals from the output', () => {
      // requested=1, buyerPaid=1000 → tiny ratio → most lines floor to 0.
      const lines = [
        {
          role: 'supplier' as const,
          accountId: 'acct_a',
          amountCents: 50n,
          stripeTransferId: 'tr_a',
        },
        {
          role: 'affiliate' as const,
          accountId: 'acct_b',
          amountCents: 50n,
          stripeTransferId: 'tr_b',
        },
      ];
      // totalTarget = floor(100*1/1000) = 0 → no bonus to distribute → both floor=0 → all dropped.
      const plan = planProportionalReversals(lines, 1n, 1000n);
      expect(plan).toEqual([]);
    });

    it('does not mutate the input lines (referential purity)', () => {
      const lines = [
        {
          role: 'supplier' as const,
          accountId: 'acct_supplier',
          amountCents: 100n,
          stripeTransferId: 'tr_supplier',
        },
        {
          role: 'seller' as const,
          accountId: 'acct_seller',
          amountCents: 200n,
          stripeTransferId: 'tr_seller',
        },
      ];
      const originalLength = lines.length;
      const originalSupplier = { ...lines[0] };
      const originalSeller = { ...lines[1] };

      planProportionalReversals(lines, 50n, 100n);

      expect(lines).toHaveLength(originalLength);
      expect(lines[0]).toEqual(originalSupplier);
      expect(lines[1]).toEqual(originalSeller);
    });
  });
});
