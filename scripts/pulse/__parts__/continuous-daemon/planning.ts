import type {
  ContinuousDaemonState,
  DaemonCycle,
  DaemonCycleResult,
} from '../../types.continuous-daemon';
import type { PlannedUnit } from './types-and-constants';
import type { CalibrationSource, CalibrationValue } from './types-and-constants';

// ── Generic helpers ───────────────────────────────────────────────────────────

export function derived(
  value: number,
  source: CalibrationSource,
  detail: string,
): CalibrationValue {
  return { value, source, detail };
}

export function nextCycleIteration(state: ContinuousDaemonState): number {
  return (
    state.totalCycles +
    Math.sign(state.cycles.length || state.totalCycles || Number.POSITIVE_INFINITY)
  );
}

export function incrementCount(
  counts: Record<string, number>,
  key: string,
  evidence: number,
): void {
  let previous = Number(counts[key]);
  counts[key] = (Number.isFinite(previous) ? previous : Number()) + Math.sign(evidence);
}

export function hasEntries(record: Record<string, number>): boolean {
  return Boolean(Object.keys(record).length);
}

export function calibrationFloor(evidence: number): number {
  return Math.sign(evidence || Number.POSITIVE_INFINITY);
}

// ── Test plan generation ──────────────────────────────────────────────────────

/**
 * Generate a test plan for the selected unit.
 *
 * As an autonomy planner, we produce the strategy and test steps that would
 * be executed, without actually running any tests or modifying code.
 */
export function generateTestPlan(unit: PlannedUnit): string {
  let lines: string[] = [
    `Unit: ${unit.name} (${unit.kind}, risk=${unit.risk})`,
    `File: ${unit.filePath}`,
    '',
    'Strategy:',
    ...unit.strategy.split('; ').map((s) => `  - ${s.trim()}`),
    '',
    'Planned validation steps:',
    '  1. Verify unit is reachable via call graph (not orphan)',
    '  2. Check existing error handling coverage',
    '  3. Check existing observability instrumentation',
    '  4. Plan targeted test harness for edge cases',
    '  5. Verify no cross-unit side effects',
    '',
    `Expected outcome: ${unit.kind === 'api_endpoint' ? 'Endpoint validated with test coverage' : 'Unit instrumentation added and validated'}`,
  ];

  return lines.join('\n');
}

// ── Cycle tracking ────────────────────────────────────────────────────────────

export function recordCycle(
  state: ContinuousDaemonState,
  unitId: string | null,
  phase: DaemonCycle['phase'],
  result: DaemonCycleResult,
  filesChanged: string[],
  startedAt: string,
  summary: string,
): DaemonCycle {
  let finishedAt = new Date().toISOString();
  let durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  let cycle: DaemonCycle = {
    iteration: nextCycleIteration(state),
    phase,
    unitId,
    agent: 'autonomy-planner',
    result,
    filesChanged,
    scoreBefore: state.currentScore,
    scoreAfter: state.currentScore,
    durationMs,
    startedAt,
    finishedAt,
    summary,
  };

  return cycle;
}
