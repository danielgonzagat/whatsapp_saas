/**
 * Continuous Daemon — autonomous loop orchestration engine (PLANNER MODE).
 *
 * Wave 8, Module A.
 *
 * The continuous daemon is an AUTONOMY PLANNER: it generates the plan for
 * what an autonomous loop WOULD do, without actually editing files or
 * committing changes. Each iteration picks the highest-value ai_safe unit
 * from the behavior graph, acquires a file lease, plans the test harness,
 * validates the strategy, and records the expected outcome.
 *
 * State is persisted to `.pulse/current/PULSE_AUTONOMY_STATE.json`.
 */

import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { resolveRoot } from './lib/safe-path';
import type {
  ContinuousDaemonState,
  DaemonCycle,
  DaemonCycleResult,
} from './types.continuous-daemon';
import type { BehaviorGraph, BehaviorNode } from './types.behavior-graph';
import { readBehaviorGraph } from './execution-harness';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTONOMY_STATE_FILENAME = 'PULSE_AUTONOMY_STATE.json';
const BEHAVIOR_GRAPH_ARTIFACT = '.pulse/current/PULSE_BEHAVIOR_GRAPH.json';

const DEFAULT_TARGET_SCORE = 100;
const DEFAULT_MAX_ITERATIONS = 100;
const COOLDOWN_CYCLE_COUNT = 3;
const MAX_CONSECUTIVE_PLANNING_FAILURES = 5;

// ── Lease constants ───────────────────────────────────────────────────────────

const LEASE_DIR = '.pulse/leases';
const LEASE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface FileLease {
  filePath: string;
  unitId: string;
  iteration: number;
  acquiredAt: string;
  expiresAt: string;
  agentId: string;
}

// ── Daemon-level signal state ─────────────────────────────────────────────────

let shutdownRequested = false;

function onSignal(signal: string): void {
  if (shutdownRequested) {
    process.exit(0);
  }
  shutdownRequested = true;
  if (process.env.PULSE_CONTINUOUS_DEBUG === '1') {
    console.warn(`[continuous-daemon] Received ${signal}, initiating graceful shutdown...`);
  }
}

function installSignalHandlers(): void {
  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('SIGINT', () => onSignal('SIGINT'));
}

function uninstallSignalHandlers(): void {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function autonomyStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_STATE_FILENAME);
}

function behaviorGraphPath(rootDir: string): string {
  return path.join(rootDir, BEHAVIOR_GRAPH_ARTIFACT);
}

function leaseDirPath(rootDir: string): string {
  return path.join(rootDir, LEASE_DIR);
}

function leaseFilePath(rootDir: string, filePath: string): string {
  const safeName = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 120);
  return path.join(leaseDirPath(rootDir), `${safeName}.lease.json`);
}

// ── State I/O ────────────────────────────────────────────────────────────────

function loadAutonomyState(rootDir: string): ContinuousDaemonState | null {
  const filePath = autonomyStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<ContinuousDaemonState>(filePath);
  } catch {
    return null;
  }
}

function saveAutonomyState(rootDir: string, state: ContinuousDaemonState): void {
  const filePath = autonomyStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  state.generatedAt = new Date().toISOString();
  writeTextFile(filePath, JSON.stringify(state, null, 2));
}

// ── Behavior graph loading ───────────────────────────────────────────────────

function loadBehaviorGraph(rootDir: string): BehaviorGraph | null {
  const artifactPath = behaviorGraphPath(rootDir);
  if (!pathExists(artifactPath)) return null;
  try {
    return readJsonFile<BehaviorGraph>(artifactPath);
  } catch {
    return null;
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeCurrentScore(graph: BehaviorGraph): number {
  const totalNodes = graph.summary.totalNodes;
  if (totalNodes === 0) return 0;
  const aiSafeNodes = graph.summary.aiSafeNodes;
  // Score: ratio of ai_safe vs total discovered nodes; PULSE should not remove
  // nodes from the autonomy denominator by routing them to humans.
  const automatableTarget = totalNodes;
  if (automatableTarget <= 0) return 0;
  return Math.round((aiSafeNodes / automatableTarget) * 100);
}

// ── Unit selection ────────────────────────────────────────────────────────────

interface PlannedUnit {
  unitId: string;
  filePath: string;
  name: string;
  kind: string;
  risk: string;
  priority: number;
  strategy: string;
}

const KIND_PRIORITY: Record<string, number> = {
  api_endpoint: 5,
  handler: 4,
  function_definition: 3,
  lifecycle_hook: 2,
  validation: 1,
};

const RISK_PRIORITY: Record<string, number> = {
  low: 5,
  medium: 3,
  none: 1,
};

/**
 * Pick the highest-value ai_safe unit from the behavior graph.
 *
 * Priority scoring:
 *   - kind priority: api_endpoint > handler > function_definition > lifecycle > validation
 *   - risk priority lower-risk first: low > medium > none (ai_safe units are never high/critical)
 *   - prefers units with observability (hasLogging, hasMetrics, hasTracing)
 *   - excludes recently planned units (cooldown)
 *
 * @param graph       The behavior graph containing all nodes.
 * @param recentUnits Set of unit IDs from recent cycles to exclude.
 * @returns The selected unit with a strategy description, or null.
 */
function pickNextUnit(graph: BehaviorGraph, recentUnits: Set<string>): PlannedUnit | null {
  const aiSafeNodes = graph.nodes.filter(
    (n): n is BehaviorNode & { executionMode: 'ai_safe' } => n.executionMode === 'ai_safe',
  );

  if (!aiSafeNodes.length) return null;

  const eligible = aiSafeNodes.filter((n) => !recentUnits.has(n.id));

  if (!eligible.length) {
    // All units on cooldown — relax cooldown and retry
    const allEligible = aiSafeNodes;
    const scored = allEligible.map((node) => ({
      node,
      score:
        (KIND_PRIORITY[node.kind] ?? 0) +
        (RISK_PRIORITY[node.risk] ?? 0) +
        (node.hasLogging ? 1 : 0) +
        (node.hasMetrics ? 1 : 0) +
        (node.hasTracing ? 1 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return null;
    return buildPlannedUnit(best.node);
  }

  const scored = eligible.map((node) => ({
    node,
    score:
      (KIND_PRIORITY[node.kind] ?? 0) +
      (RISK_PRIORITY[node.risk] ?? 0) +
      (node.hasLogging ? 1 : 0) +
      (node.hasMetrics ? 1 : 0) +
      (node.hasTracing ? 1 : 0),
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return buildPlannedUnit(best.node);
}

function buildPlannedUnit(node: BehaviorNode): PlannedUnit {
  const strategyParts: string[] = [];

  if (node.hasErrorHandler) {
    strategyParts.push('unit already has error handler — validate coverage');
  } else {
    strategyParts.push('add try/catch error boundary');
  }

  if (!node.hasLogging) strategyParts.push('add structured logging');
  if (!node.hasMetrics) strategyParts.push('add metrics instrumentation');
  if (!node.hasTracing) strategyParts.push('add tracing span');

  const strategy =
    strategyParts.length > 0
      ? strategyParts.join('; ')
      : `validate unit ${node.name} idempotency and error paths`;

  return {
    unitId: node.id,
    filePath: node.filePath,
    name: node.name,
    kind: node.kind,
    risk: node.risk,
    priority: (KIND_PRIORITY[node.kind] ?? 0) + (RISK_PRIORITY[node.risk] ?? 0),
    strategy,
  };
}

// ── File leasing ──────────────────────────────────────────────────────────────

/**
 * Acquire a lease on a file to prevent concurrent work on the same unit.
 *
 * Leases are stored as JSON files in `.pulse/leases/` with a 30-minute TTL.
 * Returns `true` if the lease was acquired, `false` if the file is already
 * leased (and the lease has not expired).
 */
function acquireFileLease(
  rootDir: string,
  filePath: string,
  unitId: string,
  iteration: number,
): boolean {
  ensureDir(leaseDirPath(rootDir), { recursive: true });
  const leasePath = leaseFilePath(rootDir, filePath);

  // Check existing lease
  if (pathExists(leasePath)) {
    try {
      const existing: FileLease = readJsonFile<FileLease>(leasePath);
      const expiresAt = new Date(existing.expiresAt).getTime();
      if (Date.now() < expiresAt) {
        return false; // Active lease exists
      }
      // Lease expired — we can overwrite
    } catch {
      // Corrupt lease file — overwrite
    }
  }

  const now = new Date();
  const lease: FileLease = {
    filePath,
    unitId,
    iteration,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LEASE_TTL_MS).toISOString(),
    agentId: `pulse-planner-${process.pid ?? 'unknown'}`,
  };

  writeTextFile(leasePath, JSON.stringify(lease, null, 2));
  return true;
}

/**
 * Release a file lease after a planning cycle completes.
 */
function releaseFileLease(rootDir: string, filePath: string): void {
  const leasePath = leaseFilePath(rootDir, filePath);
  try {
    if (pathExists(leasePath)) {
      const fs = require('fs');
      fs.unlinkSync(leasePath);
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Release all active leases for the current agent.
 */
function releaseAllLeases(rootDir: string): void {
  const dirPath = leaseDirPath(rootDir);
  if (!pathExists(dirPath)) return;

  try {
    const fs = require('fs');
    const entries = fs.readdirSync(dirPath);
    const agentId = `pulse-planner-${process.pid ?? 'unknown'}`;
    for (const entry of entries) {
      if (!entry.endsWith('.lease.json')) continue;
      const fullPath = path.join(dirPath, entry);
      try {
        const lease: FileLease = readJsonFile<FileLease>(fullPath);
        if (lease.agentId === agentId) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Best-effort
  }
}

// ── Test plan generation ──────────────────────────────────────────────────────

/**
 * Generate a test plan for the selected unit.
 *
 * As an autonomy planner, we produce the strategy and test steps that would
 * be executed, without actually running any tests or modifying code.
 */
function generateTestPlan(unit: PlannedUnit): string {
  const lines: string[] = [
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

function recordCycle(
  state: ContinuousDaemonState,
  unitId: string | null,
  phase: DaemonCycle['phase'],
  result: DaemonCycleResult,
  filesChanged: string[],
  startedAt: string,
  summary: string,
): DaemonCycle {
  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  const cycle: DaemonCycle = {
    iteration: state.totalCycles + 1,
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
 * @param options  Override defaults for max iterations.
 * @returns The final autonomy state after the loop terminates.
 */
export function startContinuousDaemon(
  rootDir: string,
  options: { maxCycles?: number } = {},
): ContinuousDaemonState {
  const resolvedRoot = resolveRoot(rootDir);
  const maxCycles = options.maxCycles ?? DEFAULT_MAX_ITERATIONS;

  const existing = loadAutonomyState(resolvedRoot);
  const now = new Date().toISOString();

  let state: ContinuousDaemonState;

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
      currentScore: 0,
      targetScore: DEFAULT_TARGET_SCORE,
      milestones: [],
      cycles: [],
      status: 'running',
      eta: null,
    };
  }

  installSignalHandlers();

  // Load behavior graph for unit selection
  const behaviorGraph = loadBehaviorGraph(resolvedRoot);

  if (!behaviorGraph || !behaviorGraph.nodes.length) {
    state.status = 'stopped';
    state.cycles.push({
      iteration: 1,
      phase: 'idle',
      unitId: null,
      agent: 'autonomy-planner',
      result: 'blocked',
      filesChanged: [],
      scoreBefore: 0,
      scoreAfter: 0,
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

  const initialScore = computeCurrentScore(behaviorGraph);
  state.currentScore = initialScore;
  state.targetScore = DEFAULT_TARGET_SCORE;

  let consecutiveFailures = 0;

  while (!shutdownRequested && state.status === 'running' && state.totalCycles < maxCycles) {
    const cycleStartedAt = new Date().toISOString();

    // ── Re-read behavior graph each cycle to get fresh state ──
    const freshGraph = loadBehaviorGraph(resolvedRoot);
    if (!freshGraph || !freshGraph.nodes.length) {
      state.status = 'stopped';
      const cycle = recordCycle(
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

    const newScore = computeCurrentScore(freshGraph);
    state.currentScore = newScore;

    // Check if certified
    if (state.currentScore >= state.targetScore) {
      state.status = 'certified';
      const cycle = recordCycle(
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

    // Cooldown: don't re-plan recently planned units
    const recentUnits = new Set<string>();
    const recentCycles = state.cycles.slice(-COOLDOWN_CYCLE_COUNT);
    for (const cycle of recentCycles) {
      if (cycle.unitId && (cycle.result === 'error' || cycle.result === 'blocked')) {
        recentUnits.add(cycle.unitId);
      }
    }

    // Step 1: Pick highest-value ai_safe unit
    const planned = pickNextUnit(freshGraph, recentUnits);

    if (!planned) {
      if (consecutiveFailures >= MAX_CONSECUTIVE_PLANNING_FAILURES) {
        state.status = 'stopped';
        const cycle = recordCycle(
          state,
          null,
          'planning',
          'blocked',
          [],
          cycleStartedAt,
          `No ai_safe units available after ${MAX_CONSECUTIVE_PLANNING_FAILURES} attempts`,
        );
        state.cycles.push(cycle);
        state.totalCycles++;
        saveAutonomyState(resolvedRoot, state);
        break;
      }

      consecutiveFailures++;
      const cycle = recordCycle(
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

    // Step 2: Acquire file lease
    const leaseAcquired = acquireFileLease(
      resolvedRoot,
      planned.filePath,
      planned.unitId,
      state.totalCycles + 1,
    );

    if (!leaseAcquired) {
      const cycle = recordCycle(
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

    // Step 3: Generate test plan
    const testPlan = generateTestPlan(planned);

    // Step 4: Validate strategy (planning-level validation)
    const hasStrategy = planned.strategy.length > 0;
    const hasTestSteps = testPlan.includes('Planned validation steps:');

    let cycleResult: DaemonCycleResult;
    let cycleSummary: string;

    if (hasStrategy && hasTestSteps) {
      cycleResult = 'improvement';
      cycleSummary = `Planned: ${planned.name} — ${planned.strategy.slice(0, 200)}`;
      state.improvements++;
      consecutiveFailures = 0;
    } else {
      cycleResult = 'error';
      cycleSummary = `Planning failed for ${planned.name} — incomplete strategy`;
      consecutiveFailures++;
    }

    // Release lease after planning (planner doesn't hold leases across cycles)
    releaseFileLease(resolvedRoot, planned.filePath);

    const cycle = recordCycle(
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

    // Compute ETA
    state.eta = computeETA(state);

    if (process.env.PULSE_CONTINUOUS_DEBUG === '1') {
      console.warn(
        `[continuous-daemon] Cycle ${state.totalCycles}/${maxCycles}: ${cycleResult} — ${planSummary(planned)}`,
      );
    }

    saveAutonomyState(resolvedRoot, state);
  }

  // Final state
  if (shutdownRequested) {
    state.status = 'stopped';
    state.cycles.push({
      iteration: state.totalCycles + 1,
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

/**
 * Stop the continuous daemon by signaling a graceful shutdown.
 *
 * The daemon will finish its current cycle and exit on the next iteration
 * check. If no daemon is running, this is a no-op.
 */
export function stopContinuousDaemon(): void {
  shutdownRequested = true;
}

/**
 * Get the current daemon status.
 *
 * Reads the persisted autonomy state from `.pulse/current/PULSE_AUTONOMY_STATE.json`
 * and returns it. Returns `null` if no state exists or if reading fails.
 *
 * @param rootDir Absolute or relative path to the repository root.
 * @returns The current autonomy state, or null.
 */
export function getDaemonStatus(rootDir: string): ContinuousDaemonState | null {
  const resolvedRoot = resolveRoot(rootDir);
  return loadAutonomyState(resolvedRoot);
}

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

  const gap = state.targetScore - state.currentScore;
  if (gap <= 0) return '0 min';

  const cyclesNeeded = Math.ceil(gap / avgImprovementPerCycle);
  const msRemaining = cyclesNeeded * avgDurationMs;
  const minutesRemaining = Math.ceil(msRemaining / 60_000);

  if (minutesRemaining < 60) return `~${minutesRemaining} min`;
  const hours = Math.floor(minutesRemaining / 60);
  const mins = minutesRemaining % 60;
  return `~${hours}h ${mins}m`;
}
