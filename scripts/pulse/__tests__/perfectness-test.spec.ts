import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

import { computeVerdict, evaluateGate, evaluateLongRunEvidence } from '../perfectness-test';
import type { PerfectnessGate } from '../types.perfectness-test';

const HOUR_MS = 60 * 60 * 1000;
const START = '2026-04-26T00:00:00.000Z';
const NOW_MS = new Date('2026-04-29T01:00:00.000Z').getTime();

function isoAfter(hours: number): string {
  return new Date(new Date(START).getTime() + hours * HOUR_MS).toISOString();
}

describe('perfectness 72h long-run evidence', () => {
  const proofCycle = (startHour: number, finishHour: number) => ({
    startedAt: isoAfter(startHour),
    finishedAt: isoAfter(finishHour),
    phase: 'validating',
    result: 'improvement',
    unitId: `unit-${startHour}`,
    filesChanged: ['scripts/pulse/perfectness-test.ts'],
    scoreBefore: 70,
    scoreAfter: 71,
  });

  it('rejects elapsed wall-clock time when no autonomy cycles prove continuous work', () => {
    const result = evaluateLongRunEvidence(
      START,
      {
        startedAt: START,
        generatedAt: isoAfter(73),
        status: 'running',
        cycles: [],
      },
      NOW_MS,
    );

    expect(result.observedHours).toBe(73);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('no non-regressing autonomy proof cycles recorded');
  });

  it('rejects timestamp-only cycles because they do not prove autonomous execution', () => {
    const result = evaluateLongRunEvidence(
      START,
      {
        startedAt: START,
        generatedAt: isoAfter(73),
        status: 'running',
        cycles: [
          { startedAt: isoAfter(0), finishedAt: isoAfter(12) },
          { startedAt: isoAfter(16), finishedAt: isoAfter(32) },
          { startedAt: isoAfter(36), finishedAt: isoAfter(52) },
          { startedAt: isoAfter(56), finishedAt: isoAfter(73) },
        ],
      },
      NOW_MS,
    );

    expect(result.passed).toBe(false);
    expect(result.cycleCount).toBe(0);
    expect(result.reason).toContain(
      '4 cycle(s) lacked non-regressing execution evidence and were excluded',
    );
  });

  it('rejects a 72h run with an uncovered cycle gap above the allowed threshold', () => {
    const result = evaluateLongRunEvidence(
      START,
      {
        startedAt: START,
        generatedAt: isoAfter(73),
        status: 'running',
        cycles: [proofCycle(0, 1), proofCycle(70, 73)],
      },
      NOW_MS,
    );

    expect(result.passed).toBe(false);
    expect(result.maxGapHours).toBe(69);
    expect(result.reason).toContain('longest uncovered gap 69.0h exceeds 6h');
  });

  it('accepts 72h only when cycle evidence covers the window without long gaps', () => {
    const result = evaluateLongRunEvidence(
      START,
      {
        startedAt: START,
        generatedAt: isoAfter(73),
        status: 'running',
        cycles: [proofCycle(0, 12), proofCycle(16, 32), proofCycle(36, 52), proofCycle(56, 73)],
      },
      NOW_MS,
    );

    expect(result.passed).toBe(true);
    expect(result.observedHours).toBe(73);
    expect(result.maxGapHours).toBe(4);
  });
});

describe('perfectness dynamic gate predicates', () => {
  it('computes verdict thresholds from the observed suite size', () => {
    const gates: PerfectnessGate[] = Array.from({ length: 4 }, (_, index) => ({
      name: `gate-${index}`,
      description: `gate ${index}`,
      target: 'observed predicate',
      actual: 'observed',
      passed: index < 3,
      evidence: 'test evidence',
    }));

    expect(computeVerdict(gates)).toBe('ALMOST_PERFECT');
  });

  it('discovers browser proof from certificate gate evidence instead of one fixed gate key', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-perfectness-gate-'));
    const pulseDir = path.join(rootDir, '.pulse', 'current');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_CERTIFICATE.json'),
      JSON.stringify({
        score: 74,
        gates: {
          browserReplayEvidence: { status: 'passed' },
        },
      }),
    );

    const gate = evaluateGate('e2e-core-pass', rootDir, 74, START);

    expect(gate.passed).toBe(true);
    expect(gate.actual).toContain('browser gate = passed');
  });
});
