import {
  ABI_ARRAY_CAP,
  ABI_MAX_STRING_LENGTH,
  buildBoundedAbiPayload,
  buildHandoffEscalationLog,
  capAbiArraysReplacer,
  extractAbiBuildExceptionMessage,
  initialAbiOutcomeLabel,
  readHandoffGateFlags,
  shouldEscalateForHandoff,
} from './kloel-thinker.abi.helpers';
import { HANDOFF_THRESHOLD, type HandoffConfidenceSnapshot } from './handoff-confidence.helper';

describe('kloel-thinker.abi.helpers', () => {
  describe('capAbiArraysReplacer', () => {
    it('returns scalars unchanged', () => {
      expect(capAbiArraysReplacer('k', 1)).toBe(1);
      expect(capAbiArraysReplacer('k', 'x')).toBe('x');
      expect(capAbiArraysReplacer('k', null)).toBeNull();
    });

    it('slices arrays at ABI_ARRAY_CAP', () => {
      const long = Array.from({ length: 20 }, (_, i) => i);
      const out = capAbiArraysReplacer('k', long);
      expect(Array.isArray(out)).toBe(true);
      expect((out as number[]).length).toBe(ABI_ARRAY_CAP);
      expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('does not mutate the input array', () => {
      const long = Array.from({ length: 20 }, (_, i) => i);
      capAbiArraysReplacer('k', long);
      expect(long.length).toBe(20);
    });
  });

  describe('buildBoundedAbiPayload', () => {
    it('caps every array to ABI_ARRAY_CAP entries', () => {
      const abi = {
        beliefs: Array.from({ length: 30 }, (_, i) => ({ id: i })),
        memories: Array.from({ length: 12 }, (_, i) => `m-${i}`),
        nested: { items: Array.from({ length: 9 }, (_, i) => i) },
      };
      const { boundedAbi, truncated } = buildBoundedAbiPayload(abi);
      expect((boundedAbi['beliefs'] as unknown[]).length).toBe(ABI_ARRAY_CAP);
      expect((boundedAbi['memories'] as unknown[]).length).toBe(ABI_ARRAY_CAP);
      expect((boundedAbi['nested'] as { items: unknown[] }).items.length).toBe(ABI_ARRAY_CAP);
      expect(truncated).toBe(false);
    });

    it('reports the post-bounding stringified length', () => {
      const abi = { hello: 'world' };
      const { abiStrLen } = buildBoundedAbiPayload(abi);
      expect(abiStrLen).toBe(JSON.stringify(abi).length);
    });

    it('truncates the string when above ABI_MAX_STRING_LENGTH', () => {
      // Build a payload whose post-bounding string is well above the cap.
      // Each entry is short, but we keep the array under the cap to retain
      // every long string after bounding.
      const big = Array.from({ length: ABI_ARRAY_CAP }, () => 'x'.repeat(5000));
      const { abiStrLen, truncated } = buildBoundedAbiPayload({ big });
      expect(truncated).toBe(true);
      // Final string is ABI_MAX + the marker "…(state_truncated)".
      expect(abiStrLen).toBe(ABI_MAX_STRING_LENGTH + '…(state_truncated)'.length);
    });

    it('preserves non-array scalar fields verbatim', () => {
      const { boundedAbi } = buildBoundedAbiPayload({ a: 1, b: 'two', c: null });
      expect(boundedAbi).toEqual({ a: 1, b: 'two', c: null });
    });
  });

  describe('readHandoffGateFlags', () => {
    it('returns both off when env is empty', () => {
      expect(readHandoffGateFlags({})).toEqual({ observe: false, blocking: false });
    });

    it('observe is true when the observation gate is enabled', () => {
      const flags = readHandoffGateFlags({ HANDOFF_CONFIDENCE_GATE_ENABLED: 'true' });
      expect(flags.observe).toBe(true);
      expect(flags.blocking).toBe(false);
    });

    it('observe is also true when only the blocking gate is enabled', () => {
      const flags = readHandoffGateFlags({ HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED: 'true' });
      expect(flags.observe).toBe(true);
      expect(flags.blocking).toBe(true);
    });

    it('treats every value other than the literal "true" as off', () => {
      expect(
        readHandoffGateFlags({
          HANDOFF_CONFIDENCE_GATE_ENABLED: '1',
          HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED: 'yes',
        }),
      ).toEqual({ observe: false, blocking: false });
    });
  });

  describe('shouldEscalateForHandoff', () => {
    const baseSnapshot: Pick<HandoffConfidenceSnapshot, 'wouldEscalateAtThreshold04'> = {
      wouldEscalateAtThreshold04: true,
    };

    it('returns false when the blocking gate is off', () => {
      expect(shouldEscalateForHandoff(baseSnapshot, { blocking: false })).toBe(false);
    });

    it('returns false when the snapshot is above the threshold', () => {
      expect(
        shouldEscalateForHandoff({ wouldEscalateAtThreshold04: false }, { blocking: true }),
      ).toBe(false);
    });

    it('returns true only when blocking AND the snapshot wants escalation', () => {
      expect(shouldEscalateForHandoff(baseSnapshot, { blocking: true })).toBe(true);
    });
  });

  describe('buildHandoffEscalationLog', () => {
    const snapshot: HandoffConfidenceSnapshot = {
      composite: 0.31,
      meanBeliefConfidence: 0.4,
      capabilityHealth: 0.2,
      overclaimRisk: 0.7,
      beliefCount: 5,
      wouldEscalateAtThreshold04: true,
    };

    it('flattens every snapshot field plus context/threshold', () => {
      const log = buildHandoffEscalationLog({
        snapshot,
        workspaceId: 'ws-1',
        threshold: HANDOFF_THRESHOLD,
      });
      expect(log).toEqual({
        context: 'kloel.handoff.confidence.blocking',
        workspaceId: 'ws-1',
        composite: 0.31,
        meanBeliefConfidence: 0.4,
        capabilityHealth: 0.2,
        overclaimRisk: 0.7,
        beliefCount: 5,
        threshold: HANDOFF_THRESHOLD,
      });
    });

    it('preserves undefined workspaceId', () => {
      const log = buildHandoffEscalationLog({
        snapshot,
        workspaceId: undefined,
        threshold: 0.4,
      });
      expect(log.workspaceId).toBeUndefined();
    });
  });

  describe('extractAbiBuildExceptionMessage', () => {
    it('returns message from Error instance', () => {
      expect(extractAbiBuildExceptionMessage(new Error('boom'))).toBe('boom');
    });

    it('returns the string verbatim when error is a string', () => {
      expect(extractAbiBuildExceptionMessage('plain failure')).toBe('plain failure');
    });

    it('falls back to "unknown error" for other shapes', () => {
      expect(extractAbiBuildExceptionMessage(undefined)).toBe('unknown error');
      expect(extractAbiBuildExceptionMessage(null)).toBe('unknown error');
      expect(extractAbiBuildExceptionMessage({ code: 1 })).toBe('unknown error');
      expect(extractAbiBuildExceptionMessage(42)).toBe('unknown error');
    });
  });

  describe('initialAbiOutcomeLabel', () => {
    it('returns flag_off when useAbi is false', () => {
      expect(initialAbiOutcomeLabel({ useAbi: false, hasAbiBuilder: true })).toBe('flag_off');
      expect(initialAbiOutcomeLabel({ useAbi: false, hasAbiBuilder: false })).toBe('flag_off');
    });

    it('returns attempted when ABI is on and the builder is injected', () => {
      expect(initialAbiOutcomeLabel({ useAbi: true, hasAbiBuilder: true })).toBe('attempted');
    });

    it('returns no_abiBuilder when ABI is on but the builder is missing', () => {
      expect(initialAbiOutcomeLabel({ useAbi: true, hasAbiBuilder: false })).toBe('no_abiBuilder');
    });
  });
});
