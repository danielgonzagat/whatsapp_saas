import {
  buildResolveOutcomeUpdateData,
  collectGlobalPriorRows,
  estimateCounterfactualBaselineOutcome,
  extractGlobalPriorRow,
  recordOutcomeGlobalPrior,
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

  describe('collectGlobalPriorRows', () => {
    it('filters out rows without a string channel and maps the rest', () => {
      const rows = [
        { context: { channel: 'whatsapp' }, decisionType: 'dt1', chosen: 'a1' },
        { context: { channel: 42 }, decisionType: 'dt2', chosen: 'a2' },
        { context: { channel: 'email' }, decisionType: 'dt3', chosen: 'a3' },
        { context: { foo: 'bar' }, decisionType: 'dt4', chosen: 'a4' },
        { context: null, decisionType: 'dt5', chosen: 'a5' },
      ];

      const result = collectGlobalPriorRows(rows);

      expect(result).toEqual([
        { channel: 'whatsapp', decisionType: 'dt1', action: 'a1' },
        { channel: 'email', decisionType: 'dt3', action: 'a3' },
      ]);
    });

    it('returns an empty array when no rows have a valid channel', () => {
      expect(
        collectGlobalPriorRows([{ context: { channel: 99 }, decisionType: 'x', chosen: 'y' }]),
      ).toEqual([]);
    });

    it('returns an empty array for empty input', () => {
      expect(collectGlobalPriorRows([])).toEqual([]);
    });
  });

  describe('recordOutcomeGlobalPrior', () => {
    it('calls recordObservation for each valid row and skips invalid ones', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const logger = { error: jest.fn() };

      await recordOutcomeGlobalPrior({
        globalPrior: { recordObservation },
        rows: [
          { context: { channel: 'whatsapp' }, decisionType: 'dt1', chosen: 'act_a' },
          { context: { channel: 42 }, decisionType: 'dt2', chosen: 'act_b' },
          { context: { channel: 'email' }, decisionType: 'dt3', chosen: 'act_c' },
        ],
        outcome: 0.8,
        logContext: { key: 'value' },
        logger,
      });

      expect(recordObservation).toHaveBeenCalledTimes(2);
      expect(recordObservation).toHaveBeenCalledWith('whatsapp', 'dt1', 'act_a', true);
      expect(recordObservation).toHaveBeenCalledWith('email', 'dt3', 'act_c', true);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('records success=false when outcome < 0.5', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);

      await recordOutcomeGlobalPrior({
        globalPrior: { recordObservation },
        rows: [{ context: { channel: 'whatsapp' }, decisionType: 'dt', chosen: 'a' }],
        outcome: 0.2,
        logContext: {},
        logger: { error: jest.fn() },
      });

      expect(recordObservation).toHaveBeenCalledWith('whatsapp', 'dt', 'a', false);
    });

    it('logs errors but does not throw when recordObservation fails', async () => {
      const recordObservation = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);
      const logger = { error: jest.fn() };

      await recordOutcomeGlobalPrior({
        globalPrior: { recordObservation },
        rows: [
          { context: { channel: 'whatsapp' }, decisionType: 'dt1', chosen: 'a1' },
          { context: { channel: 'email' }, decisionType: 'dt2', chosen: 'a2' },
        ],
        outcome: 0.9,
        logContext: { outcomeKey: 'ok-1' },
        logger,
      });

      // Both should have been attempted
      expect(recordObservation).toHaveBeenCalledTimes(2);
      // Error logged once
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to record global prior observation',
        expect.objectContaining({
          outcomeKey: 'ok-1',
          error: 'boom',
        }),
      );
    });

    it('is a no-op when rows array is empty', async () => {
      const recordObservation = jest.fn();

      await recordOutcomeGlobalPrior({
        globalPrior: { recordObservation },
        rows: [],
        outcome: 0.5,
        logContext: {},
        logger: { error: jest.fn() },
      });

      expect(recordObservation).not.toHaveBeenCalled();
    });
  });
});
