/**
 * Part 5: daemon-loop — startContinuousDaemon, stopContinuousDaemon,
 * getDaemonStatus, planSummary, computeETA.
 */

import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { resolveRoot } from '../../lib/safe-path';
import { evaluateExecutorCycleMateriality } from '../../autonomous-executor-policy';
import type {
  ContinuousDaemonState,
  DaemonCycle,
  DaemonCycleResult,
  DaemonPhase,
} from '../../types.continuous-daemon';
import type { BehaviorNode } from '../../types.behavior-graph';
import {
  shutdownRequested,
  installSignalHandlers,
  uninstallSignalHandlers,
  loadAutonomyState,
  saveAutonomyState,
  loadBehaviorGraph,
  loadOptionalArtifact,
  DAEMON_STATUS,
  DAEMON_PHASE,
  CYCLE_RESULT,
  nextCycleIteration,
  releaseAllLeases as releaseAllLeasesFromLeases,
} from './state-foundation';
import type {
  CalibratedDaemonState,
  DaemonCalibrationSnapshot,
  PathProofEvidenceArtifact,
  ProofSynthesisArtifact,
  ProbabilisticRiskArtifact,
} from './state-foundation';
import { buildDaemonCalibration, computeCurrentScore } from './calibration';
import {
  pickNextUnit,
  acquireFileLease,
  releaseFileLease,
  generateTestPlan,
  recordCycle,
  PlannedUnit,
} from './scoring-and-leases';

// ── Helpers ───────────────────────────────────────────────────────────────────

function planSummary(planned: PlannedUnit): string {
  return `${planned.name} (${planned.filePath}) — ${planned.strategy.slice(deriveZeroValue(), 120)}`;
}

function computeETA(state: ContinuousDaemonState): string | null {
  let improvementCycles = state.cycles.filter((c) => c.result === CYCLE_RESULT.improvement);
  if (improvementCycles.length < deriveUnitValue() + deriveUnitValue()) return null;

  let totalImprovement = improvementCycles.reduce(
    (sum, c) => sum + Math.max(deriveZeroValue(), c.scoreAfter - c.scoreBefore),
    deriveZeroValue(),
  );
  let avgImprovementPerCycle = totalImprovement / improvementCycles.length;

  let totalDurationMs = improvementCycles.reduce((sum, c) => sum + c.durationMs, deriveZeroValue());
  let avgDurationMs = totalDurationMs / improvementCycles.length;

  if (avgImprovementPerCycle <= deriveZeroValue()) return null;

  let gap = state.targetScore - state.currentScore;
  if (gap <= deriveZeroValue()) return '0 min';

  let cyclesNeeded = Math.ceil(gap / avgImprovementPerCycle);
  let msRemaining = cyclesNeeded * avgDurationMs;
  let minutesRemaining = Math.ceil(msRemaining / 60_000);

  if (minutesRemaining < 60) return `~${minutesRemaining} min`;
  let hours = Math.floor(minutesRemaining / 60);
  let mins = minutesRemaining % 60;
  return `~${hours}h ${mins}m`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startContinuousDaemon(
  rootDir: string,
  options: { maxCycles?: number } = {},
): ContinuousDaemonState {
  let resolvedRoot = resolveRoot(rootDir);

  let existing = loadAutonomyState(resolvedRoot);
  let now = new Date().toISOString();

  let state: CalibratedDaemonState;

  if (existing && existing.status === DAEMON_STATUS.running) {
    state = existing;
  } else {
    state = {
      generatedAt: now,
      startedAt: existing?.startedAt ?? now,
      totalCycles: deriveZeroValue(),
      improvements: deriveZeroValue(),
      regressions: deriveZeroValue(),
      rollbacks: deriveZeroValue(),
      currentScore: deriveZeroValue(),
      targetScore: existing?.targetScore ?? deriveZeroValue(),
      milestones: [],
      cycles: [],
      status: DAEMON_STATUS.running as ContinuousDaemonState['status'],
      eta: null,
    };
  }

  installSignalHandlers();

  let behaviorGraph = loadBehaviorGraph(resolvedRoot);

  if (!behaviorGraph || !behaviorGraph.nodes.length) {
    state.status = DAEMON_STATUS.stopped as ContinuousDaemonState['status'];
    state.cycles.push({
      iteration: deriveUnitValue(),
      phase: DAEMON_PHASE.idle as DaemonPhase,
      unitId: null,
      agent: 'autonomy-planner',
      result: CYCLE_RESULT.blocked as DaemonCycleResult,
      filesChanged: [],
      scoreBefore: deriveZeroValue(),
      scoreAfter: deriveZeroValue(),
      durationMs: deriveZeroValue(),
      startedAt: now,
      finishedAt: now,
      summary: 'No behavior graph available — generate PULSE_BEHAVIOR_GRAPH.json first',
    });
    state.totalCycles = deriveUnitValue();
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

  let consecutiveFailures = deriveZeroValue();

  while (
    !shutdownRequested &&
    state.status === DAEMON_STATUS.running &&
    state.totalCycles < maxCycles
  ) {
    let cycleStartedAt = new Date().toISOString();

    let freshGraph = loadBehaviorGraph(resolvedRoot);
    if (!freshGraph || !freshGraph.nodes.length) {
      state.status = DAEMON_STATUS.stopped as ContinuousDaemonState['status'];
      let cycle = recordCycle(
        state,
        null,
        DAEMON_PHASE.scanning as DaemonPhase,
        CYCLE_RESULT.blocked as DaemonCycleResult,
        [],
        cycleStartedAt,
        'Behavior graph disappeared — stopping daemon',
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveAutonomyState(resolvedRoot, state);
      break;
    }

    let calibrationHistory = state.cycles.length > deriveZeroValue() ? state : existing;
    let freshCalibration = buildDaemonCalibration(resolvedRoot, freshGraph, calibrationHistory);
    let newScore = computeCurrentScore(freshGraph);
    state.currentScore = newScore;
    state.targetScore = freshCalibration.targetScore.value;
    state.calibration = freshCalibration;

    if (state.currentScore >= state.targetScore) {
      state.status = DAEMON_STATUS.certified as ContinuousDaemonState['status'];
      let cycle = recordCycle(
        state,
        null,
        DAEMON_PHASE.idle as DaemonPhase,
        CYCLE_RESULT.improvement as DaemonCycleResult,
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
      if (
        cycle.unitId &&
        (cycle.result === CYCLE_RESULT.error || cycle.result === CYCLE_RESULT.blocked)
      ) {
        recentUnits.add(cycle.unitId);
      }
    }

    let planned = pickNextUnit(freshGraph, recentUnits, freshCalibration);

    if (!planned) {
      if (consecutiveFailures >= freshCalibration.planningFailureCeiling.value) {
        state.status = DAEMON_STATUS.stopped as ContinuousDaemonState['status'];
        let cycle = recordCycle(
          state,
          null,
          DAEMON_PHASE.planning as DaemonPhase,
          CYCLE_RESULT.blocked as DaemonCycleResult,
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
        DAEMON_PHASE.planning as DaemonPhase,
        CYCLE_RESULT.blocked as DaemonCycleResult,
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
        DAEMON_PHASE.planning as DaemonPhase,
        CYCLE_RESULT.blocked as DaemonCycleResult,
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

    let hasStrategy = planned.strategy.length > deriveZeroValue();
    let hasTestSteps = testPlan.includes('Planned validation steps:');

    let cycleResult: DaemonCycleResult;
    let cycleSummary: string;

    if (hasStrategy && hasTestSteps) {
      let materiality = evaluateExecutorCycleMateriality({
        daemonMode: 'planner',
        sandboxResult: null,
        validationResult: null,
        beforeAfterMetric: null,
      });
      cycleResult = materiality.acceptedMaterial
        ? CYCLE_RESULT.improvement
        : (CYCLE_RESULT.no_change as DaemonCycleResult);
      cycleSummary = `Planned only: ${planned.name} — ${materiality.reason}; priority=${planned.priority}; calibration=${planned.prioritySource}`;
      if (materiality.acceptedMaterial) {
        state.improvements++;
      }
      consecutiveFailures = deriveZeroValue();
    } else {
      cycleResult = CYCLE_RESULT.error as DaemonCycleResult;
      cycleSummary = `Planning failed for ${planned.name} — incomplete strategy`;
      consecutiveFailures++;
    }

    releaseFileLease(resolvedRoot, planned.filePath);

    let cycle = recordCycle(
      state,
      planned.unitId,
      DAEMON_PHASE.validating as DaemonPhase,
      cycleResult,
      [planned.filePath],
      cycleStartedAt,
      cycleSummary,
    );

    state.cycles.push(cycle);
    state.totalCycles++;

    state.eta = computeETA(state);

    if (process.env.PULSE_CONTINUOUS_DEBUG === String(deriveUnitValue())) {
      console.warn(
        `[continuous-daemon] Cycle ${state.totalCycles}/${maxCycles}: ${cycleResult} — ${planSummary(planned)}`,
      );
    }

    saveAutonomyState(resolvedRoot, state);
  }

  if (shutdownRequested) {
    state.status = DAEMON_STATUS.stopped as ContinuousDaemonState['status'];
    state.cycles.push({
      iteration: nextCycleIteration(state),
      phase: DAEMON_PHASE.idle as DaemonPhase,
      unitId: null,
      agent: 'autonomy-planner',
      result: CYCLE_RESULT.blocked as DaemonCycleResult,
      filesChanged: [],
      scoreBefore: state.currentScore,
      scoreAfter: state.currentScore,
      durationMs: deriveZeroValue(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: 'Graceful shutdown requested via signal',
    });
    state.totalCycles++;
  }

  releaseAllLeasesFromLeases(resolvedRoot);
  uninstallSignalHandlers();
  state.generatedAt = new Date().toISOString();
  saveAutonomyState(resolvedRoot, state);

  return state;
}

export function stopContinuousDaemon(): void {
  shutdownRequested = Boolean(deriveUnitValue());
}

export function getDaemonStatus(rootDir: string): ContinuousDaemonState | null {
  let resolvedRoot = resolveRoot(rootDir);
  return loadAutonomyState(resolvedRoot);
}
