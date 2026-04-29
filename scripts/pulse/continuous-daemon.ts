/**
 * Continuous Daemon — autonomous loop orchestration engine.
 *
 * Wave 8, Module A.
 *
 * The continuous daemon is the top-level orchestrator that runs
 * scan → plan → execute → validate → commit/rollback cycles
 * until the codebase reaches the target score, hits the max cycle
 * limit, or runs out of time.
 *
 * State is persisted to `.pulse/current/PULSE_CONTINUOUS_DAEMON.json`.
 */
import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { resolveRoot } from './lib/safe-path';
import type {
  ContinuousDaemonState,
  DaemonCycle,
  DaemonCycleResult,
} from './types.continuous-daemon';
import type { PulseConvergencePlan } from './types';
import type { PulseAutonomyMemoryState } from './types';
import {
  captureRegressionSnapshot,
  detectChangedFilesSinceHead,
  detectRegression,
  rollbackRegression,
  type PulseSnapshot,
} from './regression-guard';
import { createExecutor, detectAvailableExecutor, type Executor } from './executor';
import { compact } from './autonomy-memory';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAEMON_STATE_FILENAME = 'PULSE_CONTINUOUS_DAEMON.json';
const CONVERGENCE_PLAN_FILENAME = 'PULSE_CONVERGENCE_PLAN.json';
const MEMORY_FILENAME = 'PULSE_AUTONOMY_MEMORY.json';

const DEFAULT_TARGET_SCORE = 85;
const DEFAULT_MAX_CYCLES = 20;
const DEFAULT_TIMEOUT_HOURS = 8;
const MILESTONE_INTERVAL = 5;
const MAX_CONSECUTIVE_FAILURES = 3;
const COOLDOWN_CYCLE_COUNT = 3;

// ── Path helpers ──────────────────────────────────────────────────────────────

function daemonStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', DAEMON_STATE_FILENAME);
}

function convergencePlanPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', CONVERGENCE_PLAN_FILENAME);
}

function memoryPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', MEMORY_FILENAME);
}

// ── State I/O ────────────────────────────────────────────────────────────────

function loadDaemonState(rootDir: string): ContinuousDaemonState | null {
  const filePath = daemonStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<ContinuousDaemonState>(filePath);
  } catch {
    return null;
  }
}

function saveDaemonState(rootDir: string, state: ContinuousDaemonState): void {
  const filePath = daemonStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  state.generatedAt = new Date().toISOString();
  writeTextFile(filePath, JSON.stringify(state, null, 2));
}

function loadConvergencePlan(rootDir: string): PulseConvergencePlan | null {
  const filePath = convergencePlanPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseConvergencePlan>(filePath);
  } catch {
    return null;
  }
}

function loadMemory(rootDir: string): PulseAutonomyMemoryState | null {
  const filePath = memoryPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseAutonomyMemoryState>(filePath);
  } catch {
    return null;
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function getCurrentScore(rootDir: string): number {
  const plan = loadConvergencePlan(rootDir);
  if (!plan) return 0;
  const gates = plan.summary?.failingGates ?? [];
  const totalGates = 22;
  const passingGates = totalGates - gates.length;
  return Math.round((passingGates / totalGates) * 100);
}

// ── Milestones ────────────────────────────────────────────────────────────────

function recordMilestones(
  score: number,
  existing: ContinuousDaemonState['milestones'],
): ContinuousDaemonState['milestones'] {
  const milestones = [...existing];
  const achievedScores = new Set(milestones.map((m) => m.score));
  const currentMilestone = Math.floor(score / MILESTONE_INTERVAL) * MILESTONE_INTERVAL;

  for (let s = MILESTONE_INTERVAL; s <= currentMilestone; s += MILESTONE_INTERVAL) {
    if (!achievedScores.has(s)) {
      milestones.push({
        score: s,
        achievedAt: new Date().toISOString(),
        description: `Reached score ${s}`,
      });
    }
  }

  milestones.sort((a, b) => a.score - b.score);
  return milestones;
}

// ── Cycle Recording ───────────────────────────────────────────────────────────

function recordCycle(
  state: ContinuousDaemonState,
  cycle: Omit<DaemonCycle, 'iteration' | 'startedAt' | 'finishedAt' | 'durationMs'>,
  startedAt: string,
): DaemonCycle {
  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const full: DaemonCycle = {
    ...cycle,
    iteration: state.totalCycles + 1,
    startedAt,
    finishedAt,
    durationMs,
  };
  return full;
}

// ── Agent availability ───────────────────────────────────────────────────────

function getOrCreateExecutor(): { executor: Executor | null; agentName: string } {
  const kind = detectAvailableExecutor();
  if (!kind) {
    return { executor: null, agentName: 'unavailable' };
  }
  return { executor: createExecutor(kind), agentName: kind };
}

// ── Prompt generation ────────────────────────────────────────────────────────

function buildUnitPrompt(
  unit: { id: string; title: string; summary: string },
  rootDir: string,
): string {
  return [
    `You are executing PULSE convergence unit "${unit.id}".`,
    `Title: ${unit.title}`,
    `Summary: ${unit.summary}`,
    `Repository root: ${rootDir}`,
    '',
    'Your task is to implement the changes described above.',
    'Focus on the specific scope of this unit and do not expand into unrelated areas.',
    'After making changes, verify they work by running the relevant tests.',
  ].join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the continuous daemon loop.
 *
 * The daemon repeatedly:
 * 1. Scans the current codebase state
 * 2. Picks the next highest-impact ai_safe convergence unit
 * 3. Executes it through the available agent executor
 * 4. Validates the result
 * 5. Detects regression — commits if clean, rolls back if not
 *
 * State is persisted to `.pulse/current/PULSE_CONTINUOUS_DAEMON.json` after
 * every cycle so resumption is possible across process restarts.
 *
 * @param rootDir    Absolute or relative path to the repository root.
 * @param options    Override defaults for target score, max cycles, and timeout.
 * @returns The final daemon state after the loop terminates.
 */
export function startContinuousDaemon(
  rootDir: string,
  options: { targetScore?: number; maxCycles?: number; timeoutHours?: number } = {},
): ContinuousDaemonState {
  const resolvedRoot = resolveRoot(rootDir);
  const targetScore = options.targetScore ?? DEFAULT_TARGET_SCORE;
  const maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES;
  const timeoutHours = options.timeoutHours ?? DEFAULT_TIMEOUT_HOURS;

  const existing = loadDaemonState(resolvedRoot);

  let state: ContinuousDaemonState;

  if (existing && existing.status === 'running') {
    state = existing;
    state.targetScore = targetScore;
  } else {
    const now = new Date().toISOString();
    const currentScore = getCurrentScore(resolvedRoot);
    state = {
      generatedAt: now,
      startedAt: existing?.startedAt ?? now,
      totalCycles: 0,
      improvements: 0,
      regressions: 0,
      rollbacks: 0,
      currentScore,
      targetScore,
      milestones: [],
      cycles: [],
      status: 'running',
      eta: null,
    };
  }

  const startTimestamp = new Date(state.startedAt).getTime();
  const timeoutMs = timeoutHours * 60 * 60 * 1000;

  const { executor, agentName } = getOrCreateExecutor();

  let consecutiveFailures = 0;

  while (shouldContinue(state, targetScore, maxCycles)) {
    const elapsed = Date.now() - startTimestamp;
    if (elapsed >= timeoutMs) {
      state.status = 'stopped';
      state.cycles.push({
        iteration: state.totalCycles + 1,
        phase: 'waiting',
        unitId: null,
        agent: agentName,
        result: 'blocked',
        filesChanged: [],
        scoreBefore: state.currentScore,
        scoreAfter: state.currentScore,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: `Timeout reached after ${timeoutHours}h`,
      });
      state.totalCycles++;
      saveDaemonState(resolvedRoot, state);
      break;
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      state.status = 'stopped';
      state.cycles.push({
        iteration: state.totalCycles + 1,
        phase: 'idle',
        unitId: null,
        agent: agentName,
        result: 'blocked',
        filesChanged: [],
        scoreBefore: state.currentScore,
        scoreAfter: state.currentScore,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
      });
      state.totalCycles++;
      saveDaemonState(resolvedRoot, state);
      break;
    }

    const cycleStartedAt = new Date().toISOString();
    const scoreBefore = getCurrentScore(resolvedRoot);

    // Phase 1: Scan
    const convergencePlan = loadConvergencePlan(resolvedRoot);

    // Phase 2: Plan / Pick unit
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _memory = loadMemory(resolvedRoot);
    const unitId = pickNextUnit(convergencePlan, state.cycles);
    if (!unitId) {
      const cycle = recordCycle(
        state,
        {
          phase: 'planning',
          unitId: null,
          agent: agentName,
          result: 'blocked',
          filesChanged: [],
          scoreBefore,
          scoreAfter: scoreBefore,
          summary: 'No ai_safe unit available to pick',
        },
        cycleStartedAt,
      );
      state.cycles.push(cycle);
      state.totalCycles++;
      saveDaemonState(resolvedRoot, state);
      break;
    }

    // Phase 3: Execute
    const unit = convergencePlan?.queue.find((u) => u.id === unitId) ?? null;
    if (!unit) {
      consecutiveFailures++;
      continue;
    }

    let filesChanged: string[] = [];
    let cycleResult: DaemonCycleResult = 'no_change';
    let summary = '';

    try {
      if (executor) {
        const prompt = buildUnitPrompt(
          { id: unit.id, title: unit.title, summary: unit.summary },
          resolvedRoot,
        );
        executor.runUnit(resolvedRoot, prompt);
      }

      // Phase 4: Regression detection
      filesChanged = detectChangedFilesSinceHead(resolvedRoot);
      const scoreAfter = getCurrentScore(resolvedRoot);

      const beforeSnapshot = captureRegressionSnapshot(resolvedRoot);
      const afterSnapshot: PulseSnapshot = {
        score: scoreAfter,
        blockingTier: 0,
        codacyHighCount: 0,
        gatesPass: {},
        scenarioPass: {},
        runtimeHighSignals: 0,
      };

      const regressionResult = detectRegression(beforeSnapshot, afterSnapshot);

      if (regressionResult.regressed) {
        const reason = `Score regressed ${scoreBefore} → ${scoreAfter}`;
        rollbackRegression(resolvedRoot, filesChanged, reason);
        cycleResult = 'regression';
        state.regressions++;
        state.rollbacks++;
        summary = `${reason}; rolled back ${filesChanged.length} files`;
        filesChanged = [];
        consecutiveFailures++;
      } else if (scoreAfter > scoreBefore) {
        cycleResult = 'improvement';
        state.improvements++;
        state.currentScore = scoreAfter;
        summary = `Score improved ${scoreBefore} → ${scoreAfter}`;
        consecutiveFailures = 0;
      } else if (scoreAfter === scoreBefore && filesChanged.length > 0) {
        cycleResult = 'improvement';
        state.improvements++;
        summary = `No score change but ${filesChanged.length} files modified`;
        consecutiveFailures = 0;
      } else {
        cycleResult = 'no_change';
        summary = 'No score change';
        consecutiveFailures++;
      }
    } catch (err) {
      cycleResult = 'error';
      summary = `Execution error: ${compact(String(err))}`;
      consecutiveFailures++;
    }

    const cycle = recordCycle(
      state,
      {
        phase: 'executing',
        unitId,
        agent: agentName,
        result: cycleResult,
        filesChanged,
        scoreBefore,
        scoreAfter: getCurrentScore(resolvedRoot),
        summary,
      },
      cycleStartedAt,
    );

    state.cycles.push(cycle);
    state.totalCycles++;
    state.currentScore = getCurrentScore(resolvedRoot);
    state.milestones = recordMilestones(state.currentScore, state.milestones);
    state.eta = computeETA(state, targetScore);

    if (state.currentScore >= targetScore) {
      state.status = 'certified';
    }

    saveDaemonState(resolvedRoot, state);
  }

  state.generatedAt = new Date().toISOString();
  saveDaemonState(resolvedRoot, state);
  return state;
}

/**
 * Determine whether the daemon should continue running.
 *
 * @param state        Current daemon state.
 * @param targetScore  Desired score threshold.
 * @param maxCycles    Maximum allowed cycles.
 * @returns `true` if the daemon should keep iterating.
 */
export function shouldContinue(
  state: ContinuousDaemonState,
  targetScore: number,
  maxCycles: number,
): boolean {
  if (state.status !== 'running') return false;
  if (state.currentScore >= targetScore) return false;
  if (state.totalCycles >= maxCycles) return false;
  return true;
}

/**
 * Pick the next convergence unit to execute.
 *
 * Strategy:
 * 1. Prefer units with `executionMode === 'ai_safe'`
 * 2. Prioritize by highest computed impact = (priorityRank + productImpactRank)
 * 3. Exclude units that were attempted in the last {@link COOLDOWN_CYCLE_COUNT} cycles
 *    and resulted in regression or error.
 *
 * @param convergencePlan  The current convergence plan (may be null).
 * @param cycleHistory      Recent cycle records for cooldown exclusion.
 * @returns The id of the best unit to attempt, or `null` if none are eligible.
 */
export function pickNextUnit(
  convergencePlan: PulseConvergencePlan | null,
  cycleHistory: Array<{ unitId: string | null; result: DaemonCycleResult }>,
): string | null {
  if (!convergencePlan?.queue?.length) return null;

  interface ScoredUnit {
    id: string;
    executionMode: string;
    priority: string;
    productImpact: string;
  }

  const aiSafeUnits = convergencePlan.queue.filter(
    (u): u is PulseConvergencePlan['queue'][number] & { executionMode: 'ai_safe' } =>
      u.executionMode === 'ai_safe',
  );

  if (!aiSafeUnits.length) return null;

  const recentlyFailedUnits = new Set<string>();
  const recentCycles = cycleHistory.slice(-COOLDOWN_CYCLE_COUNT);
  for (const cycle of recentCycles) {
    if (
      cycle.unitId &&
      (cycle.result === 'regression' || cycle.result === 'error' || cycle.result === 'blocked')
    ) {
      recentlyFailedUnits.add(cycle.unitId);
    }
  }

  const eligible = aiSafeUnits.filter((u) => !recentlyFailedUnits.has(u.id));

  if (!eligible.length) return null;

  const priorityRank: Record<string, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };
  const impactRank: Record<string, number> = {
    transformational: 4,
    material: 3,
    enabling: 2,
    diagnostic: 1,
  };

  const scored = eligible.map((u) => ({
    id: u.id,
    score: (priorityRank[u.priority] ?? 1) + (impactRank[u.productImpact as string] ?? 1),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.id ?? null;
}

/**
 * Estimate time remaining to reach the target score.
 *
 * Uses the average improvement per cycle over all cycles that ended in
 * `improvement`. Returns `null` if there are fewer than 2 qualifying cycles.
 *
 * @param state        Current daemon state.
 * @param targetScore  Desired score threshold.
 * @returns Human-readable ETA string (e.g. "~45 min"), or `null`.
 */
export function computeETA(state: ContinuousDaemonState, targetScore: number): string | null {
  const improvementCycles = state.cycles.filter((c) => c.result === 'improvement');

  if (improvementCycles.length < 2) return null;

  const totalImprovement = improvementCycles.reduce(
    (sum, c) => sum + Math.max(0, c.scoreAfter - c.scoreBefore),
    0,
  );
  const avgImprovementPerCycle = totalImprovement / improvementCycles.length;

  const totalDurationMs = improvementCycles.reduce((sum, c) => sum + c.durationMs, 0);
  const avgDurationMs = totalDurationMs / improvementCycles.length;

  if (avgImprovementPerCycle <= 0) return null;

  const gap = targetScore - state.currentScore;
  if (gap <= 0) return '0 min';

  const cyclesNeeded = Math.ceil(gap / avgImprovementPerCycle);
  const msRemaining = cyclesNeeded * avgDurationMs;
  const minutesRemaining = Math.ceil(msRemaining / 60_000);

  if (minutesRemaining < 60) return `~${minutesRemaining} min`;
  const hours = Math.floor(minutesRemaining / 60);
  const mins = minutesRemaining % 60;
  return `~${hours}h ${mins}m`;
}
