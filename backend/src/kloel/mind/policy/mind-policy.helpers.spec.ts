import {
  buildResolveOutcomeUpdateData,
  estimateCounterfactualBaselineOutcome,
  extractGlobalPriorRow,
} from './mind-policy.helpers';

describe('mind-policy.helpers — resolution builders', () => {
  describe('buildResolveOutcomeUpdateData', () => {
    const baseRow = {
      baseline: 'no_coupon',
      chosen: 'coupon_10',
      context: { channel: 'whatsapp' },
      decisionType: 'autopilot_action',
    } as const;

    it('returns the outcome verbatim plus a fresh Date when no override is supplied', () => {
      const before = Date.now();
      const data = buildResolveOutcomeUpdateData(baseRow, 0.42);
      const after = Date.now();

      expect(data.outcome).toBe(0.42);
      expect(data.resolvedAt).toBeInstanceOf(Date);
      expect(data.resolvedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(data.resolvedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('honors a shared resolvedAt timestamp (resolveOutcome transaction pattern)', () => {
      const shared = new Date('2026-05-01T12:00:00Z');
      const data = buildResolveOutcomeUpdateData(baseRow, 0.5, undefined, shared);
      expect(data.resolvedAt).toBe(shared);
    });

    it('uses the explicit baselineOutcome override when provided (skipping the counterfactual)', () => {
      const data = buildResolveOutcomeUpdateData(baseRow, 1, 0.123);
      expect(data.baselineOutcome).toBe(0.123);
    });

    it('falls back to estimateCounterfactualBaselineOutcome when no override is supplied', () => {
      const expected = estimateCounterfactualBaselineOutcome({
        baseline: baseRow.baseline,
        chosen: baseRow.chosen,
        context: baseRow.context,
        outcome: 0.9,
      });
      const data = buildResolveOutcomeUpdateData(baseRow, 0.9);
      expect(data.baselineOutcome).toBe(expected);
    });

    it('returns the same outcome for baseline=chosen rows (no counterfactual delta)', () => {
      const data = buildResolveOutcomeUpdateData(
        { ...baseRow, baseline: 'coupon_10', chosen: 'coupon_10' },
        0.77,
      );
      expect(data.baselineOutcome).toBe(0.77);
    });

    it('accepts explicit baselineOutcome=0 (distinguishes from undefined fallback)', () => {
      const data = buildResolveOutcomeUpdateData(baseRow, 1, 0);
      expect(data.baselineOutcome).toBe(0);
    });
  });

  describe('extractGlobalPriorRow', () => {
    it('returns the {channel, decisionType, action} triple when context.channel is a string', () => {
      const triple = extractGlobalPriorRow({
        context: { channel: 'whatsapp', extra: 'ignored' },
        decisionType: 'autopilot_action',
        chosen: 'coupon_10',
      });
      expect(triple).toEqual({
        channel: 'whatsapp',
        decisionType: 'autopilot_action',
        action: 'coupon_10',
      });
    });

    it('returns null when context.channel is missing', () => {
      expect(
        extractGlobalPriorRow({
          context: { foo: 'bar' },
          decisionType: 'autopilot_action',
          chosen: 'coupon_10',
        }),
      ).toBeNull();
    });

    it('returns null when context.channel is not a string', () => {
      expect(
        extractGlobalPriorRow({
          context: { channel: 42 },
          decisionType: 'autopilot_action',
          chosen: 'coupon_10',
        }),
      ).toBeNull();
    });

    it('returns null when context itself is null or undefined', () => {
      expect(
        extractGlobalPriorRow({
          context: null,
          decisionType: 'autopilot_action',
          chosen: 'coupon_10',
        }),
      ).toBeNull();
      expect(
        extractGlobalPriorRow({
          context: undefined,
          decisionType: 'autopilot_action',
          chosen: 'coupon_10',
        }),
      ).toBeNull();
    });

    it('preserves the row decisionType and chosen verbatim', () => {
      const triple = extractGlobalPriorRow({
        context: { channel: 'instagram' },
        decisionType: 'channel_choice',
        chosen: 'audio_response',
      });
      expect(triple).toEqual({
        channel: 'instagram',
        decisionType: 'channel_choice',
        action: 'audio_response',
      });
    });
  });
});
