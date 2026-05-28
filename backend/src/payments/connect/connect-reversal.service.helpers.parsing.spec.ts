import {
  buildSnapshot,
  parseBigIntString,
  parseManualTransfers,
  ROLE_PRIORITY,
} from './connect-reversal.service.helpers';

describe('connect-reversal.service.helpers — parsing & snapshot', () => {
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
});
