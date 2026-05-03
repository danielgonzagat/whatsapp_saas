import { describe, it, expect } from 'vitest';
import { detectRegression } from '../../regression-guard';
import { makeSnapshot } from './regression-guard.helpers';

describe('detectRegression', () => {
  describe('edge cases', () => {
    it('handles empty gatesPass and scenarioPass maps', () => {
      const before = makeSnapshot({ gatesPass: {}, scenarioPass: {} });
      const after = makeSnapshot({ gatesPass: {}, scenarioPass: {} });
      const result = detectRegression(before, after);
      expect(result.regressed).toBe(false);
    });

    it('handles zero values without false positives', () => {
      const snap = makeSnapshot({
        score: 0,
        blockingTier: 0,
        codacyHighCount: 0,
        runtimeHighSignals: 0,
      });
      const result = detectRegression(snap, { ...snap });
      expect(result.regressed).toBe(false);
    });
  });
});
