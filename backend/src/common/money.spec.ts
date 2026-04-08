import fc from 'fast-check';
import {
  cents,
  addCents,
  subCents,
  mulCentsInt,
  applyBasisPoints,
  parseBRL,
  formatBRL,
  ZERO_CENTS,
} from './money';

describe('Cents — invariant I7 (money is integer cents)', () => {
  describe('cents constructor', () => {
    it('accepts positive and negative integers', () => {
      expect(cents(0)).toBe(0);
      expect(cents(12345)).toBe(12345);
      expect(cents(-500)).toBe(-500);
    });

    it('rejects non-integer values', () => {
      expect(() => cents(1.5)).toThrow(/integer cents/);
      expect(() => cents(0.1)).toThrow(/integer cents/);
    });

    it('rejects non-finite values', () => {
      expect(() => cents(NaN)).toThrow(/finite/);
      expect(() => cents(Infinity)).toThrow(/finite/);
      expect(() => cents(-Infinity)).toThrow(/finite/);
    });

    it('rejects non-number inputs', () => {
      expect(() => cents('100' as any)).toThrow();
      expect(() => cents(null as any)).toThrow();
      expect(() => cents(undefined as any)).toThrow();
    });
  });

  describe('addCents / subCents (properties)', () => {
    it('addCents is commutative', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (a, b) => {
          const left = addCents(cents(a), cents(b));
          const right = addCents(cents(b), cents(a));
          expect(left).toBe(right);
        }),
      );
    });

    it('addCents is associative', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), fc.integer(), (a, b, c) => {
          const left = addCents(addCents(cents(a), cents(b)), cents(c));
          const right = addCents(cents(a), addCents(cents(b), cents(c)));
          expect(left).toBe(right);
        }),
      );
    });

    it('addCents has identity element ZERO_CENTS', () => {
      fc.assert(
        fc.property(fc.integer(), (a) => {
          expect(addCents(cents(a), ZERO_CENTS)).toBe(a);
        }),
      );
    });

    it('subCents is the inverse of addCents', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (a, b) => {
          const sum = addCents(cents(a), cents(b));
          expect(subCents(sum, cents(b))).toBe(a);
        }),
      );
    });
  });

  describe('mulCentsInt', () => {
    it('rejects non-integer multipliers', () => {
      expect(() => mulCentsInt(cents(100), 1.5)).toThrow();
      expect(() => mulCentsInt(cents(100), 0.1)).toThrow();
    });

    it('preserves zero', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          expect(mulCentsInt(ZERO_CENTS, n)).toBe(0);
        }),
      );
    });

    it('multiplies correctly for small values', () => {
      expect(mulCentsInt(cents(100), 3)).toBe(300);
      expect(mulCentsInt(cents(12345), 2)).toBe(24690);
    });
  });

  describe('applyBasisPoints', () => {
    it('computes 10% VAT exactly', () => {
      // 10% = 1000 basis points
      expect(applyBasisPoints(cents(10_000), 1000)).toBe(1_000);
      // 12_345 * 1000 / 10_000 = 1234.5 exactly; banker's rounding → 1234 (even)
      expect(applyBasisPoints(cents(12_345), 1000)).toBe(1_234);
      // 12_355 * 1000 / 10_000 = 1235.5 exactly; banker's rounding → 1236 (even)
      expect(applyBasisPoints(cents(12_355), 1000)).toBe(1_236);
    });

    it('computes 0% as zero', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1_000_000 }), (a) => {
          expect(applyBasisPoints(cents(a), 0)).toBe(0);
        }),
      );
    });

    it('computes 100% as identity for exact inputs', () => {
      // 100% = 10_000 basis points
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1_000_000 }), (a) => {
          expect(applyBasisPoints(cents(a), 10_000)).toBe(a);
        }),
      );
    });
  });

  describe('parseBRL / formatBRL (round-trip)', () => {
    it('round-trips positive values without loss', () => {
      // parseBRL(formatBRL(x)) === x for non-negative integer cents
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10_000_000 }), (n) => {
          const c = cents(n);
          const formatted = formatBRL(c);
          const parsed = parseBRL(formatted);
          expect(parsed).toBe(c);
        }),
      );
    });

    it('parses concrete BRL strings', () => {
      expect(parseBRL('R$ 100,00')).toBe(10_000);
      expect(parseBRL('R$ 1.234,56')).toBe(123_456);
      expect(parseBRL('0,01')).toBe(1);
    });

    it('rejects empty input', () => {
      expect(() => parseBRL('')).toThrow();
      expect(() => parseBRL('   ')).toThrow();
    });
  });
});
