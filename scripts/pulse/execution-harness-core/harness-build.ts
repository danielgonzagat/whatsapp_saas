import * as path from 'path';
import type { BehaviorGraph, BehaviorNode } from '../types.behavior-graph';
import type {
  HarnessEvidence,
  HarnessExecutionResult,
  HarnessExecutionStatus,
} from '../types.execution-harness';
import { detectConfig } from '../config';
import { safeJoin } from '../safe-path';
import { ensureDir, writeTextFile } from '../safe-fs';
import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { ALL_ARTIFACTS, harnessArtifactPath, UNEXECUTED_STATUSES } from './grammar';
import {
  ALL_EXECUTION_STATUS_LABELS,
  BLOCKED_HARNESS_STATUS,
  CANNOT_EXECUTE_FEASIBILITY,
  FAILED_HARNESS_STATUS,
  isCriticalHarnessTarget,
  isObservedHarnessStatus,
  isPassedHarnessStatus,
  normalizeHarnessExecutionResult,
  PLANNED_STATUS,
  formatTimestamp,
} from './helpers';
import {
  discoverEndpoints,
  discoverServices,
  discoverWorkers,
  discoverCrons,
  discoverWebhooks,
} from './target-discovery';
import {
  generateFixturesForTarget,
  readBehaviorGraph,
  classifyExecutionFeasibility,
} from './fixtures';
import { generateTestHarnessCode } from './test-gen';
import { buildFixtureDataStructures, buildFeasibilitySummary, loadHarnessResults } from './results';

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Build the complete execution harness catalog for the codebase.
 *
 * Discovers all executable targets (endpoints, services, workers, crons,
 * webhooks) and generates required fixtures for each. Does NOT execute
 * anything — the harness catalog is consumed by test runners and actors.
 *
 * Stores the result at `.pulse/current/PULSE_HARNESS_EVIDENCE.json`.
 *
 * @param rootDir - Repository root directory
 * @returns Complete harness evidence including targets, results, and summary
 */
export function buildExecutionHarness(rootDir: string): HarnessEvidence {
  const config = detectConfig(rootDir);

  // ── 1. Discover all executable targets ──
  const endpoints = discoverEndpoints(config);
  const services = discoverServices(config);
  const workers = discoverWorkers(config);
  const crons = discoverCrons(config);
  const webhooks = discoverWebhooks(config, endpoints);

  const allTargets = [...endpoints, ...services, ...workers, ...crons, ...webhooks];

  // ── 2. Load behavior graph for richer classification ──
  const behaviorGraph = readBehaviorGraph(rootDir);
  const behaviorGraphIndex = new Map<string, BehaviorNode>();
  if (behaviorGraph?.nodes) {
    for (const node of behaviorGraph.nodes) {
      behaviorGraphIndex.set(`${node.filePath}:${node.name}`, node);
    }
  }

  // ── 3. Classify execution feasibility for every target ──
  for (const target of allTargets) {
    const classification = classifyExecutionFeasibility(target, behaviorGraphIndex, rootDir);
    target.feasibility = classification.feasibility;
    target.feasibilityReason = classification.reason;
    target.generatedTests = [];
    target.generated = false;
  }

  // ── 4. Generate fixtures for every target ──
  for (const target of allTargets) {
    target.fixtures = generateFixturesForTarget(target, rootDir);
  }

  // ── 5. Generate governed harness blueprints for executable targets ──
  for (const target of allTargets) {
    if (target.feasibility !== CANNOT_EXECUTE_FEASIBILITY) {
      target.generatedTests = generateTestHarnessCode(target);
    }
  }

  // ── 6. Build fixture data structures (blueprint, no real DB connection) ──
  const fixtureData = buildFixtureDataStructures(allTargets);

  // ── 7. Merge with existing results ──
  const existingResults = loadHarnessResults(rootDir);
  const resultsById = new Map(existingResults.map((r) => [r.targetId, r] as const));

  const combinedResults: HarnessExecutionResult[] = allTargets.map((target) => {
    const existing = resultsById.get(target.targetId);
    if (existing) {
      return normalizeHarnessExecutionResult(existing);
    }
    const ZERO = deriveZeroValue();
    const unexecArr = [...UNEXECUTED_STATUSES].sort((a, b) => b.length - a.length);
    const notExecStatus =
      unexecArr.length > ZERO ? unexecArr[ZERO] : [...ALL_EXECUTION_STATUS_LABELS][ZERO];
    return {
      targetId: target.targetId,
      status: notExecStatus as HarnessExecutionStatus,
      executionTimeMs: ZERO,
      attempts: ZERO,
      error: null,
      output: null,
      dbSideEffects: [],
      logEntries: [],
      startedAt: '',
      finishedAt: '',
    };
  });

  // ── 8. Compute critical target stats ──
  const governedGroup = allTargets.filter(isCriticalHarnessTarget);

  const passedResults = combinedResults.filter((r) => isPassedHarnessStatus(r.status));
  const failedResults = combinedResults.filter((r) => r.status === FAILED_HARNESS_STATUS);
  const blockedResults = combinedResults.filter((r) => r.status === BLOCKED_HARNESS_STATUS);

  const feasibilitySummary = buildFeasibilitySummary(allTargets);

  const summary = {
    totalTargets: allTargets.length,
    plannedTargets: allTargets.filter((t) =>
      t.generatedTests.some((test) => test.status === PLANNED_STATUS),
    ).length,
    notExecutedTargets: combinedResults.filter((r) => UNEXECUTED_STATUSES.has(r.status)).length,
    testedTargets: combinedResults.filter((r) => isObservedHarnessStatus(r.status)).length,
    passedTargets: passedResults.length,
    failedTargets: failedResults.length,
    blockedTargets: blockedResults.length,
    criticalTargets: governedGroup.length,
    criticalTested: governedGroup.filter((t) => {
      const r = combinedResults.find((rr) => rr.targetId === t.targetId);
      return r && isObservedHarnessStatus(r.status);
    }).length,
    criticalPassed: governedGroup.filter((t) => {
      const r = combinedResults.find((rr) => rr.targetId === t.targetId);
      return r && isPassedHarnessStatus(r.status);
    }).length,
    executableTargets: feasibilitySummary.executableTargets,
    needsStagingTargets: feasibilitySummary.needsStagingTargets,
    cannotExecuteTargets: feasibilitySummary.cannotExecuteTargets,
    generatedTestCount: feasibilitySummary.generatedTestCount,
  };

  const evidence: HarnessEvidence = {
    generatedAt: formatTimestamp(),
    summary,
    targets: allTargets,
    results: combinedResults,
    behaviorNodeCount: behaviorGraphIndex.size,
  };

  // ── 9. Write artifact to disk ──
  const outputFileAbs = safeJoin(rootDir, harnessArtifactPath());
  ensureDir(path.dirname(outputFileAbs), { recursive: true });
  writeTextFile(outputFileAbs, JSON.stringify(evidence, null, 2));

  return evidence;
}
