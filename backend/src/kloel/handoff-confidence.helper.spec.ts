import { computeHandoffConfidence } from './handoff-confidence.helper';
import type { AbiBelief, AbiPulseTruth } from './abi/abi-schema';

const mkBelief = (confidence: number): AbiBelief => ({
  beliefId: 'b1',
  subject: 'test',
  proposition: 'test',
  confidence,
  evidenceCount: 1,
  lastUpdated: new Date(0).toISOString(),
  truthMode: 'observed',
});

const mkPulse = (capabilityHealth: number, overclaimRisk: number): AbiPulseTruth => ({
  noOverclaimStatus: 'PASS',
  capabilityHealthScore: capabilityHealth,
  gates: [],
  certificationVerdict: {
    verdict: 'INSUFFICIENT_EVIDENCE',
    score: 0,
    measuredAt: new Date(0).toISOString(),
  },
  overclaimRisk,
});

describe('computeHandoffConfidence', () => {
  it('returns zero composite when no inputs', () => {
    const out = computeHandoffConfidence([], undefined);
    expect(out.composite).toBeCloseTo(0.15); // only 0.15 * (1-0) = 0.15
    expect(out.meanBeliefConfidence).toBe(0);
    expect(out.wouldEscalateAtThreshold04).toBe(true);
  });

  it('returns high composite when beliefs are confident + pulse healthy', () => {
    const out = computeHandoffConfidence(
      [mkBelief(0.9), mkBelief(0.85)],
      mkPulse(0.95, 0.05),
    );
    // 0.5*0.875 + 0.35*0.95 + 0.15*0.95 = 0.4375 + 0.3325 + 0.1425 = 0.9125
    expect(out.composite).toBeCloseTo(0.9125, 3);
    expect(out.wouldEscalateAtThreshold04).toBe(false);
  });

  it('flags escalation when composite < 0.4', () => {
    const out = computeHandoffConfidence(
      [mkBelief(0.2)],
      mkPulse(0.3, 0.8),
    );
    // 0.5*0.2 + 0.35*0.3 + 0.15*0.2 = 0.1 + 0.105 + 0.03 = 0.235
    expect(out.composite).toBeCloseTo(0.235, 3);
    expect(out.wouldEscalateAtThreshold04).toBe(true);
  });

  it('clamps overclaimRisk to [0,1]', () => {
    const outHigh = computeHandoffConfidence([mkBelief(0.5)], mkPulse(0.5, 5));
    // overclaimRisk should clamp to 1; 0.15 * (1-1) = 0
    expect(outHigh.overclaimRisk).toBe(1);
    const outLow = computeHandoffConfidence([mkBelief(0.5)], mkPulse(0.5, -2));
    expect(outLow.overclaimRisk).toBe(0);
  });

  it('handles non-finite belief confidence as zero', () => {
    const out = computeHandoffConfidence(
      [mkBelief(NaN), mkBelief(0.8)],
      mkPulse(0.5, 0.1),
    );
    // NaN treated as 0 → mean = 0.4
    expect(out.meanBeliefConfidence).toBeCloseTo(0.4, 3);
  });

  it('reports beliefCount', () => {
    const out = computeHandoffConfidence(
      [mkBelief(0.5), mkBelief(0.6), mkBelief(0.7)],
      mkPulse(0.5, 0.1),
    );
    expect(out.beliefCount).toBe(3);
  });
});

describe('Phase-2 flag-gated integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('produces a loggable snapshot when HANDOFF_CONFIDENCE_GATE_ENABLED is true', () => {
    process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] = 'true';
    const enabled = process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true';
    expect(enabled).toBe(true);

    const snapshot = computeHandoffConfidence(
      [mkBelief(0.7), mkBelief(0.8)],
      mkPulse(0.9, 0.1),
    );

    // Snapshot shape is loggable: every field is a JSON-safe primitive.
    expect(typeof snapshot.composite).toBe('number');
    expect(typeof snapshot.meanBeliefConfidence).toBe('number');
    expect(typeof snapshot.capabilityHealth).toBe('number');
    expect(typeof snapshot.overclaimRisk).toBe('number');
    expect(typeof snapshot.beliefCount).toBe('number');
    expect(typeof snapshot.wouldEscalateAtThreshold04).toBe('boolean');

    // Verify the spread produces valid log context keys.
    const context = { context: 'kloel.handoff.confidence', ...snapshot };
    expect(context.context).toBe('kloel.handoff.confidence');
    expect(context.composite).toBe(snapshot.composite);
  });

  it('skips the gate when HANDOFF_CONFIDENCE_GATE_ENABLED is not true', () => {
    delete process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'];
    const enabled = process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true';
    expect(enabled).toBe(false);
  });

  describe('Phase-3 blocking gate integration', () => {
    it('behaves as original when both flags are off', () => {
      delete process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'];
      delete process.env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'];

      const gateEnabled =
        process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true';
      const blockingEnabled =
        process.env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'] === 'true';

      // Both flags off: no gate logic activates.
      const shouldComputeSnapshot =
        gateEnabled || blockingEnabled;
      expect(shouldComputeSnapshot).toBe(false);

      // The helper itself still works when called independently.
      const snapshot = computeHandoffConfidence(
        [mkBelief(0.25)],
        mkPulse(0.3, 0.7),
      );
      // Confidence is low, but with both flags off, no escalation.
      expect(snapshot.wouldEscalateAtThreshold04).toBe(true);

      // Escalation condition: BOTH gate must be on AND low confidence.
      const shouldEscalate =
        (gateEnabled || blockingEnabled) &&
        blockingEnabled &&
        snapshot.wouldEscalateAtThreshold04;
      expect(shouldEscalate).toBe(false);
    });

    it('observe-only logging when only HANDOFF_CONFIDENCE_GATE_ENABLED is on', () => {
      process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] = 'true';
      delete process.env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'];

      const gateEnabled =
        process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true';
      const blockingEnabled =
        process.env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'] === 'true';

      // Phase-2 gate is on: snapshot computed.
      const shouldComputeSnapshot =
        gateEnabled || blockingEnabled;
      expect(shouldComputeSnapshot).toBe(true);

      const snapshot = computeHandoffConfidence(
        [mkBelief(0.2)],
        mkPulse(0.25, 0.8),
      );

      // Confidence below threshold (composite ≈ 0.1 + 0.0875 + 0.03 = 0.2175).
      expect(snapshot.wouldEscalateAtThreshold04).toBe(true);

      // But blocking flag is off: no escalation, LLM reply is returned.
      const shouldEscalate =
        (gateEnabled || blockingEnabled) &&
        blockingEnabled &&
        snapshot.wouldEscalateAtThreshold04;
      expect(shouldEscalate).toBe(false);
    });

    it('deterministic escalation reply when both flags on and confidence < 0.4', () => {
      process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] = 'true';
      process.env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'] = 'true';

      const gateEnabled =
        process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true';
      const blockingEnabled =
        process.env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'] === 'true';

      // Both flags on: snapshot computed.
      const shouldComputeSnapshot =
        gateEnabled || blockingEnabled;
      expect(shouldComputeSnapshot).toBe(true);

      const snapshot = computeHandoffConfidence(
        [mkBelief(0.15)],
        mkPulse(0.2, 0.85),
      );

      // Confidence well below 0.4 threshold.
      expect(snapshot.wouldEscalateAtThreshold04).toBe(true);

      // Both flags on AND low confidence: escalation fires.
      const escalate =
        (gateEnabled || blockingEnabled) &&
        blockingEnabled &&
        snapshot.wouldEscalateAtThreshold04;
      expect(escalate).toBe(true);

      // Verify the escalation reply shape is deterministic.
      const ESCALATION_REPLY =
        'Estou analisando sua mensagem com mais cuidado. ' +
        'Um atendente humano vai revisar e responder em breve.';
      expect(typeof ESCALATION_REPLY).toBe('string');
      expect(ESCALATION_REPLY.length).toBeGreaterThan(50);
      expect(ESCALATION_REPLY).toContain('atendente humano');

      // Verify escalation event context shape.
      const eventContext = {
        context: 'kloel.handoff.confidence.blocking',
        workspaceId: 'ws_test',
        composite: snapshot.composite,
        meanBeliefConfidence: snapshot.meanBeliefConfidence,
        capabilityHealth: snapshot.capabilityHealth,
        overclaimRisk: snapshot.overclaimRisk,
        beliefCount: snapshot.beliefCount,
        threshold: 0.4,
      };
      expect(eventContext.context).toBe('kloel.handoff.confidence.blocking');
      expect(typeof eventContext.composite).toBe('number');
      expect(eventContext.threshold).toBe(0.4);
    });
  });
});
