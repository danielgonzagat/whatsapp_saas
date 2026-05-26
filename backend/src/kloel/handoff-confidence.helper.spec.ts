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
