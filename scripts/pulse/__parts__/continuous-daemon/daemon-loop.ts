import { resolveRoot } from '../../lib/safe-path';
import type { ContinuousDaemonState } from '../../types.continuous-daemon';
import { evaluateExecutorCycleMateriality } from '../../autonomous-executor-policy';
import type { CalibratedDaemonState } from './types-and-constants';
import {
  shutdownRequested,
  installSignalHandlers,
  uninstallSignalHandlers,
  loadAutonomyState,
  saveAutonomyState,
  loadBehaviorGraph,
} from './signals-and-paths';
import { buildDaemonCalibration, computeCurrentScore } from './calibration-core';
import type { PlannedUnit } from './unit-selection';
import { pickNextUnit } from './unit-selection';
import { acquireFileLease, releaseFileLease, releaseAllLeases } from './leasing';
import { generateTestPlan, recordCycle, nextCycleIteration } from './planning';

// ── Helpers ───────────────────────────────────────────────────────────────────

function planSummary(planned: PlannedUnit): string {
  return `${planned.name} (${planned.filePath}) — ${planned.strategy.slice(0, 120)}`;
}

/**
 * Estimate remaining cycles to reach the target score.
 *
 * Uses average improvement per cycle. Returns `null` if fewer than 2
 * improvement cycles available.
 */
function computeETA(state: ContinuousDaemonState): string | null {
  let improvementCycles = state.cycles.filter((c) => c.result === 'improvement');
  if (improvementCycles.length < 2) return null;

  let totalImprovement = improvementCycles.reduce(
    (sum, c) => sum + Math.max(0, c.scoreAfter - c.scoreBefore),
    0,
  );
  let avgImprovementPerCycle = totalImprovement / improvementCycles.length;

  let totalDurationMs = improvementCycles.reduce((sum, c) => sum + c.durationMs, 0);
  let avgDurationMs = totalDurationMs / improvementCycles.length;

  if (avgImprovementPerCycle <= 0) return null;

  let gap = state.targetScore - state.currentScore;
  if (gap <= 0) return '0 min';

  let cyclesNeeded = Math.ceil(gap / avgImprovementPerCycle);
  let msRemaining = cyclesNeeded * avgDurationMs;
  let minutesRemaining = Math.ceil(msRemaining / 60_000);

  if (minutesRemaining < 60) return `~${minutesRemaining} min`;
  let hours = Math.floor(minutesRemaining / 60);
  let mins = minutesRemaining % 60;
  return `~${hours}h ${mins}m`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the continuous daemon autonomy planner loop.
 *
 * The daemon repeatedly:
 * 1. Loads the behavior graph to discover ai_safe units
 * 2. Picks the highest-value ai_safe unit
 * 3. Acquires a file lease to prevent concurrent work
 * 4. Generates a test plan and validation strategy
 * 5. Records the planned outcome
 *
 * This is a PLANNER — it does NOT modify code, commit changes, or execute
 * external agents. Each cycle records what WOULD be done.
 *
 * State is persisted to `.pulse/current/PULSE_AUTONOMY_STATE.json` after
 * every cycle.
 *
 * @param rootDir  Absolute or relative path to the repository root.
 * @param options  Optional externally supplied cycle ceiling.
 * @returns The final autonomy state after the loop terminates.
 */
export function startContinuousDaemon(
  rootDir: string,
  options: { maxCycles?: number } = {},
): ContinuousDaemonState {
  let resolvedRoot = resolveRoot(rootDir);

  let existing = loadAutonomyState(resolvedRoot);
  let now = new Date().toISOString();

  let state: CalibratedDaemonState;

  if (existing && existing.status === 'running') {
    state = existing;
  } else {
    state = {
      generatedAt: now,
      startedAt: existing?.startedAt ?? now,
      totalCycles: 0,
      improvements: 0,
      regressions: 0,
      rollbacks: 0,
      currentScore: Number(),
      targetScore: existing?.targetScore ?? Number(),
      milestones: [],
      cycles: [],
      status: 'running',
      eta: null,
    };
  }

  installSignalHandlers();

  let behaviorGraph = loadBehaviorGraph(resolvedRoot);

  if (!behaviorGraph || !behaviorGraph.nodes.length) {
    state.status = 'stopped';
    state.cycles.push({
      iteration: 1,
      phase: 'idle',
      unitId: null,
      agent: 'autonomy-planner',
      result: 'blocked',
      filesChanged: [],
      scoreBefore: Number(),
      scoreAfter: Number(),
      durationMs: 0,
      startedAt: now,
      finishedAt: now,
      summary: 'No behavior graph available — generate PULSE_BEHAVIOR_GRAPH.json first',
    });
    state.totalCycles = 1;
    saveAutonomyState(resolvedRoot, state);
    uninstallSignalHandlers();
    return state;
  }

  let initialScore = computeCurrentScore(behaviorGraph);
  let calibration = buildDaemonCalibration(resolvedRoot, behaviorGraph, existing);
  let maxCycles = options.maxCycles ?? calibration.maxIterations.value;
  state.currentScore = initialScore;
  state.targetScore = calibration.targetScore.value;
  state.calibration = calibration;

  let consecutiveFailures = 0;

  while (!shutdownRequested && state.status === 'running' && state.totalCycles < maxCycles) {
    let cycleStartedAt = new Date().toISOString();

    let freshGraph = loadBehaviorGraph(resolvedRoot);
    if (!freshGraph || !freshGraph.nodes.length) {
      state.status = 'stopped';
      let cycle = recordCycle(
        state,
        null,
        'scanning',
        'blocked',
        [],
        cycleStartedAt,
        'Behavior graph disappeared — stopping daemon',
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveAutonomyState(resolvedRoot, state);
      break;
    }

    let calibrationHistory = state.cycles.length > 0 ? state : existing;
    let freshCalibration = buildDaemonCalibration(resolvedRoot, freshGraph, calibrationHistory);
    let newScore = computeCurrentScore(freshGraph);
    state.currentScore = newScore;
    state.targetScore = freshCalibration.targetScore.value;
    state.calibration = freshCalibration;

    if (state.currentScore >= state.targetScore) {
      state.status = 'certified';
      let cycle = recordCycle(
        state,
        null,
        'idle',
        'improvement',
        [],
        cycleStartedAt,
        `Target score ${state.targetScore} reached (current: ${state.currentScore})`,
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveAutonomyState(resolvedRoot, state);
      break;
    }

    let recentUnits = new Set<string>();
    let recentCycles = state.cycles.slice(-freshCalibration.cooldownCycles.value);
    for (let cycle of recentCycles) {
      if (cycle.unitId && (cycle.result === 'error' || cycle.result === 'blocked')) {
        recentUnits.add(cycle.unitId);
      }
    }

    let planned = pickNextUnit(freshGraph, recentUnits, freshCalibration);

    if (!planned) {
      if (consecutiveFailures >= freshCalibration.planningFailureCeiling.value) {
        state.status = 'stopped';
        let cycle = recordCycle(
          state,
          null,
          'planning',
          'blocked',
          [],
          cycleStartedAt,
          `No ai_safe units available after ${freshCalibration.planningFailureCeiling.value} dynamically calibrated attempts`,
        );
        state.cycles.push(cycle);
        state.totalCycles++;
        saveAutonomyState(resolvedRoot, state);
        break;
      }

      consecutiveFailures++;
      let cycle = recordCycle(
        state,
        null,
        'planning',
        'blocked',
        [],
        cycleStartedAt,
        'No eligible ai_safe unit found',
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveAutonomyState(resolvedRoot, state);
      continue;
    }

    let leaseAcquired = acquireFileLease(
      resolvedRoot,
      planned.filePath,
      planned.unitId,
      nextCycleIteration(state),
      freshCalibration.leaseTtlMs.value,
    );

    if (!leaseAcquired) {
      let cycle = recordCycle(
        state,
        planned.unitId,
        'planning',
        'blocked',
        [],
        cycleStartedAt,
        `File lease conflict for ${planned.filePath} — another agent holds the lock`,
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      consecutiveFailures++;
      saveAutonomyState(resolvedRoot, state);
      continue;
    }

    let testPlan = generateTestPlan(planned);

    let hasStrategy = planned.strategy.length > 0;
    let hasTestSteps = testPlan.includes('Planned validation steps:');

    let cycleResult: import('../../types.continuous-daemon').DaemonCycleResult;
    let cycleSummary: string;

    if (hasStrategy && hasTestSteps) {
      let materiality = evaluateExecutorCycleMateriality({
        daemonMode: 'planner',
        sandboxResult: null,
        validationResult: null,
        beforeAfterMetric: null,
      });
      cycleResult = materiality.acceptedMaterial ? 'improvement' : 'no_change';
      cycleSummary = `Planned only: ${planned.name} — ${materiality.reason}; priority=${planned.priority}; calibration=${planned.prioritySource}`;
      if (materiality.acceptedMaterial) {
        state.improvements++;
      }
      consecutiveFailures = 0;
    } else {
      cycleResult = 'error';
      cycleSummary = `Planning failed for ${planned.name} — incomplete strategy`;
      consecutiveFailures++;
    }

    releaseFileLease(resolvedRoot, planned.filePath);

    let cycle = recordCycle(
      state,
      planned.unitId,
      'validating',
      cycleResult,
      [planned.filePath],
      cycleStartedAt,
      cycleSummary,
    );

    state.cycles.push(cycle);
    state.totalCycles++;

    state.eta = computeETA(state);

    if (process.env.PULSE_CONTINUOUS_DEBUG === '1') {
      console.warn(
        `[continuous-daemon] Cycle ${state.totalCycles}/${maxCycles}: ${cycleResult} — ${planSummary(planned)}`,
      );
    }

    saveAutonomyState(resolvedRoot, state);
  }

  if (shutdownRequested) {
    state.status = 'stopped';
    state.cycles.push({
      iteration: nextCycleIteration(state),
      phase: 'idle',
      unitId: null,
      agent: 'autonomy-planner',
      result: 'blocked',
      filesChanged: [],
      scoreBefore: state.currentScore,
      scoreAfter: state.currentScore,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: 'Graceful shutdown requested via signal',
    });
    state.totalCycles++;
  }

  releaseAllLeases(resolvedRoot);
  uninstallSignalHandlers();
  state.generatedAt = new Date().toISOString();
  saveAutonomyState(resolvedRoot, state);

  return state;
}
