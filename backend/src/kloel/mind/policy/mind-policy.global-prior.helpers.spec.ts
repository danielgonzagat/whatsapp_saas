import {
  MIND_POLICY_COLD_START_THRESHOLD,
  buildBeliefMeanSummaries,
  classifyAutopilotConfirmation,
  computeGlobalPriorMix,
  shouldSkipGlobalPriorMix,
} from './mind-policy.global-prior.helpers';

describe('mind-policy.global-prior.helpers', () => {
  describe('MIND_POLICY_COLD_START_THRESHOLD', () => {
    it('keeps the production cold-start gate at 30', () => {
      expect(MIND_POLICY_COLD_START_THRESHOLD).toBe(30);
    });
  });

  describe('shouldSkipGlobalPriorMix', () => {
    const base = {
      workspaceOptedOut: false,
      channel: 'whatsapp' as string | undefined,
      hasGlobalPrior: true,
      beliefSamples: 0,
    };

    it('returns false when channel, prior, and samples are all eligible', () => {
      expect(shouldSkipGlobalPriorMix(base)).toBe(false);
    });

    it('returns true when the workspace opted out', () => {
      expect(shouldSkipGlobalPriorMix({ ...base, workspaceOptedOut: true })).toBe(true);
    });

    it('returns true when the channel is missing', () => {
      expect(shouldSkipGlobalPriorMix({ ...base, channel: undefined })).toBe(true);
    });

    it('returns true when the global-prior service is unavailable', () => {
      expect(shouldSkipGlobalPriorMix({ ...base, hasGlobalPrior: false })).toBe(true);
    });

    it('returns true at the cold-start threshold (samples >= threshold)', () => {
      expect(shouldSkipGlobalPriorMix({ ...base, beliefSamples: 30 })).toBe(true);
      expect(shouldSkipGlobalPriorMix({ ...base, beliefSamples: 31 })).toBe(true);
    });

    it('returns false just below the threshold', () => {
      expect(shouldSkipGlobalPriorMix({ ...base, beliefSamples: 29 })).toBe(false);
    });

    it('honors a custom threshold override', () => {
      expect(shouldSkipGlobalPriorMix({ ...base, beliefSamples: 9, coldStartThreshold: 10 })).toBe(
        false,
      );
      expect(shouldSkipGlobalPriorMix({ ...base, beliefSamples: 10, coldStartThreshold: 10 })).toBe(
        true,
      );
    });
  });

  describe('computeGlobalPriorMix', () => {
    it('matches the inline formula at zero local samples', () => {
      const result = computeGlobalPriorMix({
        localN: 0,
        localMean: 0,
        globalN: 100,
        globalMean: 0.6,
      });
      // globalNWeight = min(100, 30 - 0) = 30; denom = 0 + 30 = 30
      // mixedMean = (0*0 + 30*0.6) / 30 = 0.6
      // priorWeight = 30 / 30 = 1
      expect(result.mixedMean).toBeCloseTo(0.6, 10);
      expect(result.priorWeight).toBeCloseTo(1, 10);
    });

    it('blends local and global means weighted by sample counts', () => {
      const result = computeGlobalPriorMix({
        localN: 10,
        localMean: 0.5,
        globalN: 100,
        globalMean: 0.8,
      });
      // globalNWeight = min(100, 30 - 10) = 20; denom = 30
      // mixedMean = (10*0.5 + 20*0.8) / 30 = (5 + 16) / 30 = 0.7
      // priorWeight = 20 / 30 ≈ 0.6667
      expect(result.mixedMean).toBeCloseTo(0.7, 10);
      expect(result.priorWeight).toBeCloseTo(20 / 30, 10);
    });

    it('caps globalNWeight at globalN when the gap exceeds it', () => {
      const result = computeGlobalPriorMix({
        localN: 5,
        localMean: 0.4,
        globalN: 3,
        globalMean: 0.9,
      });
      // globalNWeight = min(3, 30 - 5) = 3; denom = 8
      // mixedMean = (5*0.4 + 3*0.9) / 8 = (2 + 2.7) / 8 = 0.5875
      // priorWeight = 3 / 8 = 0.375
      expect(result.mixedMean).toBeCloseTo(4.7 / 8, 10);
      expect(result.priorWeight).toBeCloseTo(3 / 8, 10);
    });

    it('honors a custom cold-start threshold', () => {
      const result = computeGlobalPriorMix({
        localN: 5,
        localMean: 0.5,
        globalN: 100,
        globalMean: 1,
        coldStartThreshold: 10,
      });
      // globalNWeight = min(100, 10 - 5) = 5; denom = 10
      // mixedMean = (5*0.5 + 5*1) / 10 = 0.75
      // priorWeight = 5 / 10 = 0.5
      expect(result.mixedMean).toBeCloseTo(0.75, 10);
      expect(result.priorWeight).toBeCloseTo(0.5, 10);
    });

    it('falls back to localMean with zero priorWeight when the denominator is zero', () => {
      // localN=0, globalN=0 → globalNWeight=0, denom=0
      const result = computeGlobalPriorMix({
        localN: 0,
        localMean: 0.42,
        globalN: 0,
        globalMean: 0.99,
      });
      expect(result.mixedMean).toBeCloseTo(0.42, 10);
      expect(result.priorWeight).toBe(0);
    });
  });

  describe('classifyAutopilotConfirmation', () => {
    const windowCutoff = new Date('2026-05-28T12:00:00Z');

    it('returns "skip" when outcomeConfidence is already set to a string', () => {
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: 'confirmed',
          resolvedAt: new Date('2026-05-28T12:30:00Z'),
          windowCutoff,
        }),
      ).toBe('skip');
    });

    it('returns "skip" when outcomeConfidence is a non-null falsy value (false/0/"")', () => {
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: false,
          resolvedAt: new Date('2026-05-28T12:30:00Z'),
          windowCutoff,
        }),
      ).toBe('skip');
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: 0,
          resolvedAt: new Date('2026-05-28T12:30:00Z'),
          windowCutoff,
        }),
      ).toBe('skip');
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: '',
          resolvedAt: new Date('2026-05-28T12:30:00Z'),
          windowCutoff,
        }),
      ).toBe('skip');
    });

    it('does NOT skip when outcomeConfidence is undefined or null', () => {
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: undefined,
          resolvedAt: new Date('2026-05-28T12:30:00Z'),
          windowCutoff,
        }),
      ).toBe('confirmed');
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: null,
          resolvedAt: new Date('2026-05-28T12:30:00Z'),
          windowCutoff,
        }),
      ).toBe('confirmed');
    });

    it('returns "confirmed" when resolvedAt is at or after the window cutoff', () => {
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: undefined,
          resolvedAt: windowCutoff,
          windowCutoff,
        }),
      ).toBe('confirmed');
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: undefined,
          resolvedAt: new Date('2026-05-28T13:00:00Z'),
          windowCutoff,
        }),
      ).toBe('confirmed');
    });

    it('returns "unanswered" when resolvedAt predates the window cutoff', () => {
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: undefined,
          resolvedAt: new Date('2026-05-28T11:59:00Z'),
          windowCutoff,
        }),
      ).toBe('unanswered');
    });

    it('returns "unanswered" when resolvedAt is null or undefined', () => {
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: undefined,
          resolvedAt: null,
          windowCutoff,
        }),
      ).toBe('unanswered');
      expect(
        classifyAutopilotConfirmation({
          existingConfidence: undefined,
          resolvedAt: undefined,
          windowCutoff,
        }),
      ).toBe('unanswered');
    });
  });

  describe('buildBeliefMeanSummaries', () => {
    it('extracts mean/variance and tracks prior usage flags', () => {
      const result = buildBeliefMeanSummaries([
        {
          belief: { mean: 0.6, variance: 0.04 },
          mixedMean: 0.65,
          usedPrior: true,
          priorWeight: 0.3,
        },
        {
          belief: { mean: 0.8, variance: 0.01 },
          mixedMean: 0.85,
          usedPrior: true,
          priorWeight: 0.15,
        },
        {
          belief: { mean: 0.4, variance: 0.09 },
          mixedMean: 0.4,
          usedPrior: false,
          priorWeight: 0,
        },
      ]);

      expect(result.usedGlobalPrior).toBe(true);
      expect(result.maxPriorWeight).toBe(0.3);
      expect(result.summaries).toEqual([
        { mean: 0.65, variance: 0.04 },
        { mean: 0.85, variance: 0.01 },
        { mean: 0.4, variance: 0.09 },
      ]);
    });

    it('returns false and 0 when no entry uses the prior', () => {
      const result = buildBeliefMeanSummaries([
        {
          belief: { mean: 0.5, variance: 0.02 },
          mixedMean: 0.5,
          usedPrior: false,
          priorWeight: 0,
        },
      ]);

      expect(result.usedGlobalPrior).toBe(false);
      expect(result.maxPriorWeight).toBe(0);
      expect(result.summaries).toEqual([{ mean: 0.5, variance: 0.02 }]);
    });

    it('handles an empty input array', () => {
      const result = buildBeliefMeanSummaries([]);

      expect(result.usedGlobalPrior).toBe(false);
      expect(result.maxPriorWeight).toBe(0);
      expect(result.summaries).toEqual([]);
    });

    it('tracks the highest priorWeight as maxPriorWeight', () => {
      const result = buildBeliefMeanSummaries([
        {
          belief: { mean: 0.5, variance: 0.1 },
          mixedMean: 0.55,
          usedPrior: true,
          priorWeight: 0.1,
        },
        {
          belief: { mean: 0.5, variance: 0.1 },
          mixedMean: 0.55,
          usedPrior: true,
          priorWeight: 0.9,
        },
        {
          belief: { mean: 0.5, variance: 0.1 },
          mixedMean: 0.55,
          usedPrior: true,
          priorWeight: 0.5,
        },
      ]);

      expect(result.maxPriorWeight).toBe(0.9);
    });
  });
});
