import * as path from 'path';
import type { PulseConfig, BehaviorGraph, BehaviorNode } from '../../types';
import type {
  HarnessEvidence,
  HarnessTarget,
  HarnessExecutionResult,
} from '../../types.execution-harness';
import { detectConfig } from '../../config';
import { safeJoin } from '../../safe-path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { discoverEndpoints } from './discover-endpoints';
import { discoverServices } from './discover-services';
import { discoverWorkers } from './discover-workers';
import { discoverCrons } from './discover-crons';
import { discoverWebhooks } from './discover-webhooks';
import { readBehaviorGraph, classifyExecutionFeasibility } from './behavior-and-feasibility';
import { generateFixturesForTarget } from './generate-fixtures';
import { generateTestHarnessCode } from './harness-code-gen';
import { buildFixtureDataStructures } from './harness-fixtures';
import { loadHarnessResults } from './harness-fixtures';
import {
  isCriticalHarnessTarget,
  isPassedHarnessStatus,
  isObservedHarnessStatus,
  normalizeHarnessExecutionResult,
  formatTimestamp,
} from './helpers';
import { harnessArtifactPath } from './grammar';

export function buildExecutionHarness(rootDir: string): HarnessEvidence {
  const config = detectConfig(rootDir);

  const endpoints = discoverEndpoints(config);
  const services = discoverServices(config);
  const workers = discoverWorkers(config);
  const crons = discoverCrons(config);
  const webhooks = discoverWebhooks(config, endpoints);

  const allTargets = [...endpoints, ...services, ...workers, ...crons, ...webhooks];

  const behaviorGraph = readBehaviorGraph(rootDir);
  const behaviorGraphIndex = new Map<string, BehaviorNode>();
  if (behaviorGraph?.nodes) {
    for (const node of behaviorGraph.nodes) {
      behaviorGraphIndex.set(`${node.filePath}:${node.name}`, node);
    }
  }

  for (const target of allTargets) {
    const classification = classifyExecutionFeasibility(target, behaviorGraphIndex, rootDir);
    target.feasibility = classification.feasibility;
    target.feasibilityReason = classification.reason;
    target.generatedTests = [];
    target.generated = false;
  }

  for (const target of allTargets) {
    target.fixtures = generateFixturesForTarget(target, rootDir);
  }

  for (const target of allTargets) {
    if (target.feasibility !== 'cannot_execute') {
      target.generatedTests = generateTestHarnessCode(target);
    }
  }

  const fixtureData = buildFixtureDataStructures(allTargets);

  const existingResults = loadHarnessResults(rootDir);
  const resultsById = new Map(existingResults.map((r) => [r.targetId, r] as const));

  const combinedResults: HarnessExecutionResult[] = allTargets.map((target) => {
    const existing = resultsById.get(target.targetId);
    if (existing) {
      return normalizeHarnessExecutionResult(existing);
    }
    return {
      targetId: target.targetId,
      status: 'not_executed' as const,
      executionTimeMs: 0,
      attempts: 0,
      error: null,
      output: null,
      dbSideEffects: [],
      logEntries: [],
      startedAt: '',
      finishedAt: '',
    };
  });

  const governedGroup = allTargets.filter(isCriticalHarnessTarget);

  const passedResults = combinedResults.filter((r) => isPassedHarnessStatus(r.status));
  const failedResults = combinedResults.filter((r) => r.status === 'failed');
  const blockedResults = combinedResults.filter((r) => r.status === 'blocked');

  const feasibilitySummary = buildFeasibilitySummary(allTargets);

  const summary = {
    totalTargets: allTargets.length,
    plannedTargets: allTargets.filter((t) =>
      t.generatedTests.some((test) => test.status === 'planned'),
    ).length,
    notExecutedTargets: combinedResults.filter(
      (r) => r.status === 'planned' || r.status === 'not_executed' || r.status === 'not_tested',
    ).length,
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

  const outputFileAbs = safeJoin(rootDir, harnessArtifactPath());
  ensureDir(path.dirname(outputFileAbs), { recursive: true });
  writeTextFile(outputFileAbs, JSON.stringify(evidence, null, 2));

  return evidence;
}

function buildFeasibilitySummary(targets: HarnessTarget[]): {
  executableTargets: number;
  needsStagingTargets: number;
  cannotExecuteTargets: number;
  generatedTestCount: number;
} {
  let executableTargets = 0;
  let needsStagingTargets = 0;
  let cannotExecuteTargets = 0;
  let generatedTestsTotal = 0;

  for (const t of targets) {
    switch (t.feasibility) {
      case 'executable':
        executableTargets++;
        break;
      case 'needs_staging':
        needsStagingTargets++;
        break;
      case 'cannot_execute':
        cannotExecuteTargets++;
        break;
    }
    generatedTestsTotal += t.generatedTests.length;
  }

  return {
    executableTargets,
    needsStagingTargets,
    cannotExecuteTargets,
    generatedTestCount: generatedTestsTotal,
  };
}
