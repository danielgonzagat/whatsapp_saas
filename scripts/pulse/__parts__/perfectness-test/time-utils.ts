import type { PerfectnessLongRunEvidence } from '../../types.perfectness-test';
import type { PulseAutonomyState } from './constants-and-types';

const REQUIRED_LONG_RUN_HOURS = 72;
const MAX_LONG_RUN_GAP_HOURS = 6;

// ────────────────────────────────────────────────────────────────────────────
// Time Utilities
// ────────────────────────────────────────────────────────────────────────────

export function hasElapsed72h(startTime: string): boolean {
  return computeHoursSince(startTime) >= 72;
}

export function evaluateLongRunEvidence(
  startTime: string,
  autonomyState: PulseAutonomyState | null,
  nowMs = Date.now(),
): PerfectnessLongRunEvidence {
  const base = emptyLongRunEvidence('PULSE_AUTONOMY_STATE.json missing or unreadable');
  if (!autonomyState) {
    return base;
  }

  const evaluationStart = parseTimestamp(startTime);
  if (evaluationStart === null) {
    return emptyLongRunEvidence(`invalid evaluation startTime: ${startTime}`);
  }

  const autonomyStartedAt = parseTimestamp(autonomyState.startedAt);
  const coverageStart = Math.max(evaluationStart, autonomyStartedAt ?? evaluationStart);
  const status = autonomyState.status ?? 'missing';
  const allCycles = (autonomyState.cycles ?? [])
    .map((cycle) => {
      const startedAt = parseTimestamp(cycle.startedAt);
      const finishedAt = parseTimestamp(cycle.finishedAt);
      if (startedAt === null || finishedAt === null || finishedAt < startedAt) {
        return null;
      }
      return { ...cycle, startedAt, finishedAt };
    })
    .filter(
      (
        cycle,
      ): cycle is {
        startedAt: number;
        finishedAt: number;
        phase?: string;
        result?: string;
        unitId?: string | null;
        filesChanged?: string[];
        scoreBefore?: number;
        scoreAfter?: number;
      } => cycle !== null,
    )
    .sort((a, b) => a.startedAt - b.startedAt);
  const proofCycles = allCycles.filter(isLongRunProofCycle);
  const nonProofCycles = allCycles.length - proofCycles.length;

  const generatedAt = parseTimestamp(autonomyState.generatedAt);
  const latestCycleEnd = proofCycles.reduce(
    (latest, cycle) => Math.max(latest, cycle.finishedAt),
    0,
  );
  const coverageEnd = Math.min(nowMs, Math.max(generatedAt ?? 0, latestCycleEnd, coverageStart));
  const observedHours = Math.max(0, (coverageEnd - coverageStart) / (1000 * 60 * 60));
  const maxGapHours = computeMaxUncoveredGapHours(coverageStart, coverageEnd, proofCycles);

  const reasons: string[] = [];
  if (observedHours < REQUIRED_LONG_RUN_HOURS) {
    reasons.push(`observed ${observedHours.toFixed(1)}h of ${REQUIRED_LONG_RUN_HOURS}h required`);
  }
  if (proofCycles.length === 0) {
    reasons.push('no non-regressing autonomy proof cycles recorded');
  }
  if (nonProofCycles > 0) {
    reasons.push(
      `${nonProofCycles} cycle(s) lacked non-regressing execution evidence and were excluded`,
    );
  }
  if (maxGapHours > MAX_LONG_RUN_GAP_HOURS) {
    reasons.push(
      `longest uncovered gap ${maxGapHours.toFixed(1)}h exceeds ${MAX_LONG_RUN_GAP_HOURS}h`,
    );
  }
  if (status === 'paused' || status === 'stopped') {
    reasons.push(`daemon status is ${status}`);
  }

  const passed = reasons.length === 0;
  return {
    requiredHours: REQUIRED_LONG_RUN_HOURS,
    observedHours,
    cycleCount: proofCycles.length,
    maxGapHours,
    allowedGapHours: MAX_LONG_RUN_GAP_HOURS,
    status,
    passed,
    reason: passed
      ? `observed ${observedHours.toFixed(1)}h with ${proofCycles.length} non-regressing proof cycle(s), max uncovered gap ${maxGapHours.toFixed(1)}h, status=${status}`
      : reasons.join('; '),
  };
}

function emptyLongRunEvidence(reason: string): PerfectnessLongRunEvidence {
  return {
    requiredHours: REQUIRED_LONG_RUN_HOURS,
    observedHours: 0,
    cycleCount: 0,
    maxGapHours: 0,
    allowedGapHours: MAX_LONG_RUN_GAP_HOURS,
    status: 'missing',
    passed: false,
    reason,
  };
}

export function computeHoursSince(startTime: string): number {
  const start = new Date(startTime).getTime();
  const now = Date.now();

  if (isNaN(start) || start > now) {
    return 0;
  }

  return (now - start) / (1000 * 60 * 60);
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isLongRunProofCycle(cycle: {
  phase?: string;
  result?: string;
  unitId?: string | null;
  filesChanged?: string[];
  scoreBefore?: number;
  scoreAfter?: number;
}): boolean {
  const result = cycle.result ?? '';
  if (result !== 'improvement' && result !== 'no_change') {
    return false;
  }

  if (typeof cycle.scoreBefore === 'number' && typeof cycle.scoreAfter === 'number') {
    if (cycle.scoreAfter < cycle.scoreBefore) {
      return false;
    }
  }

  const phase = cycle.phase ?? '';
  const executionPhase = phase === 'executing' || phase === 'validating' || phase === 'committing';
  const touchedRuntimeSurface =
    typeof cycle.unitId === 'string' ||
    (Array.isArray(cycle.filesChanged) && cycle.filesChanged.length > 0);

  return executionPhase && touchedRuntimeSurface;
}

function computeMaxUncoveredGapHours(
  coverageStart: number,
  coverageEnd: number,
  cycles: Array<{ startedAt: number; finishedAt: number }>,
): number {
  if (coverageEnd <= coverageStart) {
    return 0;
  }

  let cursor = coverageStart;
  let maxGapMs = 0;

  for (const cycle of cycles) {
    if (cycle.finishedAt < coverageStart || cycle.startedAt > coverageEnd) {
      continue;
    }

    const cycleStart = Math.max(cycle.startedAt, coverageStart);
    const cycleEnd = Math.min(cycle.finishedAt, coverageEnd);
    maxGapMs = Math.max(maxGapMs, cycleStart - cursor);
    cursor = Math.max(cursor, cycleEnd);
  }

  maxGapMs = Math.max(maxGapMs, coverageEnd - cursor);
  return maxGapMs / (1000 * 60 * 60);
}
