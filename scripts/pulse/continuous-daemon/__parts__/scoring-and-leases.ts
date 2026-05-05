/**
 * Part 4: scoring-and-leases — unit selection, priority scoring, file leasing,
 * test plan generation, and cycle recording.
 */

import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type {
  ContinuousDaemonState,
  DaemonCycle,
  DaemonCycleResult,
  DaemonPhase,
} from '../../types.continuous-daemon';
import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import { leaseDirPath, leaseFilePath, nextCycleIteration } from './state-foundation';
import type { DaemonCalibrationSnapshot, FileLease } from './state-foundation';
import { riskImpactForFile } from './calibration-extra';

export interface PlannedUnit {
  unitId: string;
  filePath: string;
  name: string;
  kind: string;
  risk: string;
  priority: number;
  prioritySource: string;
  strategy: string;
}

export function isAiSafeNode(
  node: BehaviorNode,
): node is BehaviorNode & { executionMode: 'ai_safe' } {
  return node.executionMode === 'ai_safe';
}

/**
 * Pick the highest-value ai_safe unit from the behavior graph.
 */
export function pickNextUnit(
  graph: BehaviorGraph,
  recentUnits: Set<string>,
  calibration: DaemonCalibrationSnapshot,
): PlannedUnit | null {
  let aiSafeNodes = graph.nodes.filter(
    (n): n is BehaviorNode & { executionMode: 'ai_safe' } => n.executionMode === 'ai_safe',
  );

  if (!aiSafeNodes.length) return null;

  let eligible = aiSafeNodes.filter((n) => !recentUnits.has(n.id));

  if (!eligible.length) {
    let allEligible = aiSafeNodes;
    let scored = allEligible.map((node) => ({
      node,
      score: scoreNodePriority(node, calibration),
    }));
    scored.sort((a, b) => b.score - a.score);
    let best = scored[deriveZeroValue()];
    if (!best) return null;
    return buildPlannedUnit(best.node, best.score, calibration);
  }

  let scored = eligible.map((node) => ({
    node,
    score: scoreNodePriority(node, calibration),
  }));

  scored.sort((a, b) => b.score - a.score);
  let best = scored[deriveZeroValue()];
  if (!best) return null;
  return buildPlannedUnit(best.node, best.score, calibration);
}

function scoreNodePriority(node: BehaviorNode, calibration: DaemonCalibrationSnapshot): number {
  return (
    (calibration.kindPriority[node.kind]?.value ?? deriveZeroValue()) +
    (calibration.riskPriority[node.risk]?.value ?? deriveZeroValue()) +
    (calibration.fileEvidenceDeficits[node.filePath] ?? deriveZeroValue()) +
    (node.hasLogging ? deriveUnitValue() : deriveZeroValue()) +
    (node.hasMetrics ? deriveUnitValue() : deriveZeroValue()) +
    (node.hasTracing ? deriveUnitValue() : deriveZeroValue())
  );
}

function buildPlannedUnit(
  node: BehaviorNode,
  priority: number,
  calibration: DaemonCalibrationSnapshot,
): PlannedUnit {
  let strategyParts: string[] = [];

  if (node.hasErrorHandler) {
    strategyParts.push('unit already has error handler — validate coverage');
  } else {
    strategyParts.push('add try/catch error boundary');
  }

  if (!node.hasLogging) strategyParts.push('add structured logging');
  if (!node.hasMetrics) strategyParts.push('add metrics instrumentation');
  if (!node.hasTracing) strategyParts.push('add tracing span');
  if ((calibration.fileEvidenceDeficits[node.filePath] ?? deriveZeroValue()) > deriveZeroValue()) {
    strategyParts.push('close unobserved proof plans from evidence graph');
  }
  if (riskImpactForFile(node.filePath, calibration.fileRiskImpact) > deriveZeroValue()) {
    strategyParts.push('prioritize dynamic-risk capability impact');
  }

  let strategy =
    strategyParts.length > deriveZeroValue()
      ? strategyParts.join('; ')
      : `validate unit ${node.name} idempotency and error paths`;

  return {
    unitId: node.id,
    filePath: node.filePath,
    name: node.name,
    kind: node.kind,
    risk: node.risk,
    priority,
    prioritySource: [
      calibration.kindPriority[node.kind]?.source ?? String(calibration.kindPriority[node.kind]),
      calibration.riskPriority[node.risk]?.source ?? String(calibration.riskPriority[node.risk]),
    ].join('+'),
    strategy,
  };
}

// ── File leasing ──────────────────────────────────────────────────────────────

export function acquireFileLease(
  rootDir: string,
  filePath: string,
  unitId: string,
  iteration: number,
  leaseTtlMs: number,
): boolean {
  ensureDir(leaseDirPath(rootDir), { recursive: Boolean(deriveUnitValue()) });
  let leasePath = leaseFilePath(rootDir, filePath);

  if (pathExists(leasePath)) {
    try {
      let existing: FileLease = readJsonFile<FileLease>(leasePath);
      let expiresAt = new Date(existing.expiresAt).getTime();
      if (Date.now() < expiresAt) {
        return Boolean(deriveZeroValue());
      }
    } catch {
      // Corrupt lease file — overwrite
    }
  }

  let now = new Date();
  let lease: FileLease = {
    filePath,
    unitId,
    iteration,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + leaseTtlMs).toISOString(),
    agentId: `pulse-planner-${process.pid ?? 'unknown'}`,
  };

  writeTextFile(leasePath, JSON.stringify(lease, null, deriveUnitValue() + deriveUnitValue()));
  return Boolean(lease);
}

export function releaseFileLease(rootDir: string, filePath: string): void {
  let leasePath = leaseFilePath(rootDir, filePath);
  try {
    if (pathExists(leasePath)) {
      let fs = require('fs');
      fs.unlinkSync(leasePath);
    }
  } catch {
    // Best-effort cleanup
  }
}

export function releaseAllLeases(rootDir: string): void {
  let dirPath = leaseDirPath(rootDir);
  if (!pathExists(dirPath)) return;

  try {
    let fs = require('fs');
    let entries = fs.readdirSync(dirPath);
    let agentId = `pulse-planner-${process.pid ?? 'unknown'}`;
    for (let entry of entries) {
      if (!entry.endsWith('.lease.json')) continue;
      let fullPath = path.join(dirPath, entry);
      try {
        let lease: FileLease = readJsonFile<FileLease>(fullPath);
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
