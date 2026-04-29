import { describe, expect, it } from 'vitest';

import { evaluateLongRunEvidence } from '../perfectness-test';

const HOUR_MS = 60 * 60 * 1000;
const START = '2026-04-26T00:00:00.000Z';
const NOW_MS = new Date('2026-04-29T01:00:00.000Z').getTime();

function isoAfter(hours: number): string {
  return new Date(new Date(START).getTime() + hours * HOUR_MS).toISOString();
}

describe('perfectness 72h long-run evidence', () => {
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
    expect(result.reason).toContain('no autonomy cycles recorded');
  });

  it('rejects a 72h run with an uncovered cycle gap above the allowed threshold', () => {
    const result = evaluateLongRunEvidence(
      START,
      {
        startedAt: START,
        generatedAt: isoAfter(73),
        status: 'running',
        cycles: [
          { startedAt: isoAfter(0), finishedAt: isoAfter(1) },
          { startedAt: isoAfter(70), finishedAt: isoAfter(73) },
        ],
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
        cycles: [
          { startedAt: isoAfter(0), finishedAt: isoAfter(12) },
          { startedAt: isoAfter(16), finishedAt: isoAfter(32) },
          { startedAt: isoAfter(36), finishedAt: isoAfter(52) },
          { startedAt: isoAfter(56), finishedAt: isoAfter(73) },
        ],
      },
      NOW_MS,
    );

    expect(result.passed).toBe(true);
    expect(result.observedHours).toBe(73);
    expect(result.maxGapHours).toBe(4);
  });
});
