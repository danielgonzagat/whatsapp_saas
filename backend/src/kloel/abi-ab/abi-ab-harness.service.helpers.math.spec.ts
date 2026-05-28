/**
 * UTP-ABI-005/006 — abi-ab-harness.service.helpers math + constants spec.
 *
 * Validates the dependency-free math utilities and shared constants exposed by
 * `abi-ab-harness.service.helpers`:
 *  - Constants: R_CRITERIA, PROMOTION_MIN_SAMPLES, PROMOTION_MIN_IMPROVED_CRITERIA
 *  - ID generation: generateId
 *  - Math utilities: sum, avg, ratio, clamp01
 */

import {
  PROMOTION_MIN_SAMPLES,
  PROMOTION_MIN_IMPROVED_CRITERIA,
  R_CRITERIA,
  avg,
  clamp01,
  generateId,
  ratio,
  sum,
} from './abi-ab-harness.service.helpers';

describe('abi-ab-harness.service.helpers — constants & math', () => {
  describe('constants', () => {
    it('PROMOTION_MIN_SAMPLES is 100', () => {
      expect(PROMOTION_MIN_SAMPLES).toBe(100);
    });

    it('PROMOTION_MIN_IMPROVED_CRITERIA is 3', () => {
      expect(PROMOTION_MIN_IMPROVED_CRITERIA).toBe(3);
    });

    it('R_CRITERIA has 38 entries with valid structure', () => {
      expect(R_CRITERIA).toHaveLength(38);
      const names = new Set<string>();
      for (const c of R_CRITERIA) {
        expect(c.name).toMatch(/^R(?:[1-9]|[12]\d|3[0-8])$/);
        expect(c.family).toBeTruthy();
        expect(c.family.length).toBeGreaterThan(0);
        expect(c.description).toBeTruthy();
        names.add(c.name);
      }
      expect(names.size).toBe(38);
    });
  });

  describe('generateId', () => {
    it('returns a string starting with rec_', () => {
      const id = generateId();
      expect(id).toMatch(/^rec_\d+_[a-zA-Z0-9]+$/);
    });

    it('generates unique ids on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('sum', () => {
    it('returns 0 for empty array', () => {
      expect(sum([])).toBe(0);
    });

    it('sums positive numbers', () => {
      expect(sum([1, 2, 3, 4])).toBe(10);
    });

    it('sums negative numbers', () => {
      expect(sum([-1, -2, -3])).toBe(-6);
    });

    it('sums mixed signs', () => {
      expect(sum([5, -3, 2])).toBe(4);
    });

    it('handles single element', () => {
      expect(sum([42])).toBe(42);
    });
  });

  describe('avg', () => {
    it('returns fallback for empty array', () => {
      expect(avg([], -1)).toBe(-1);
    });

    it('default fallback is 0', () => {
      expect(avg([])).toBe(0);
    });

    it('computes integer average', () => {
      expect(avg([2, 4, 6])).toBe(4);
    });

    it('computes fractional average', () => {
      expect(avg([1, 2])).toBe(1.5);
    });

    it('handles single element', () => {
      expect(avg([7])).toBe(7);
    });
  });

  describe('ratio', () => {
    it('returns fallback when denominator is 0', () => {
      expect(ratio(5, 0, -1)).toBe(-1);
    });

    it('default fallback is 0', () => {
      expect(ratio(5, 0)).toBe(0);
    });

    it('computes ratio', () => {
      expect(ratio(3, 4)).toBe(0.75);
    });

    it('returns 0 when numerator is 0', () => {
      expect(ratio(0, 100)).toBe(0);
    });

    it('handles integer result', () => {
      expect(ratio(10, 2)).toBe(5);
    });
  });

  describe('clamp01', () => {
    it('returns 0 for negative values', () => {
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(-100)).toBe(0);
    });

    it('returns 1 for values above 1', () => {
      expect(clamp01(1.5)).toBe(1);
      expect(clamp01(100)).toBe(1);
    });

    it('returns the value for 0 ≤ x ≤ 1', () => {
      expect(clamp01(0)).toBe(0);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(1)).toBe(1);
    });
  });
});
