import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { startContinuousDaemon } from '../continuous-daemon';
import { readJsonFile } from '../safe-fs';
import type { BehaviorGraph, BehaviorNode } from '../types.behavior-graph';

interface PersistedCalibrationValue {
  value: number;
  source: string;
  detail: string;
}

interface PersistedCalibration {
  targetScore: PersistedCalibrationValue;
  maxIterations: PersistedCalibrationValue;
  cooldownCycles: PersistedCalibrationValue;
  leaseTtlMs: PersistedCalibrationValue;
  kindPriority: Record<string, PersistedCalibrationValue>;
  riskPriority: Record<string, PersistedCalibrationValue>;
  fileEvidenceDeficits: Record<string, number>;
  fileRiskImpact: Record<string, number>;
  weakFallbacks: string[];
}

interface PersistedDaemonState {
  targetScore: number;
  cycles: Array<{ unitId: string | null; summary: string }>;
  calibration: PersistedCalibration;
}

function makeRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-continuous-daemon-'));
  fs.mkdirSync(path.join(rootDir, '.pulse', 'current'), { recursive: true });
  return rootDir;
}

function writeArtifact(rootDir: string, fileName: string, value: unknown): void {
  fs.writeFileSync(
    path.join(rootDir, '.pulse', 'current', fileName),
    JSON.stringify(value, null, 2),
  );
}

function behaviorNode(overrides: Partial<BehaviorNode>): BehaviorNode {
  return {
    id: 'bn-default',
    kind: 'function_definition',
    name: 'defaultUnit',
    filePath: 'backend/src/default.ts',
    line: 1,
    parentFunctionId: null,
    inputs: [],
    outputs: [],
    stateAccess: [],
    externalCalls: [],
    risk: 'low',
    executionMode: 'ai_safe',
    calledBy: [],
    calls: [],
    isAsync: false,
    hasErrorHandler: false,
    hasLogging: false,
    hasMetrics: false,
    hasTracing: false,
    decorators: [],
    docComment: null,
    ...overrides,
  };
}

function writeBehaviorGraph(rootDir: string): void {
  const nodes: BehaviorNode[] = [
    behaviorNode({
      id: 'bn-product',
      name: 'repairProductProof',
      filePath: 'backend/src/products/product.service.ts',
      kind: 'function_definition',
      risk: 'low',
    }),
    behaviorNode({
      id: 'bn-other-api',
      name: 'otherEndpoint',
      filePath: 'backend/src/other.controller.ts',
      kind: 'api_endpoint',
      risk: 'low',
    }),
    behaviorNode({
      id: 'bn-observe-1',
      executionMode: 'observation_only',
      risk: 'medium',
    }),
    behaviorNode({
      id: 'bn-observe-2',
      executionMode: 'observation_only',
      risk: 'medium',
    }),
  ];
  const graph: BehaviorGraph = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalNodes: nodes.length,
      handlerNodes: 0,
      apiEndpointNodes: 1,
      queueNodes: 0,
      cronNodes: 0,
      webhookNodes: 0,
      dbNodes: 0,
      externalCallNodes: 0,
      aiSafeNodes: 2,
      humanRequiredNodes: 0,
      nodesWithErrorHandler: 0,
      nodesWithLogging: 0,
      nodesWithMetrics: 0,
      criticalRiskNodes: 0,
    },
    nodes,
    orphanNodes: [],
    unreachableNodes: [],
  };
  writeArtifact(rootDir, 'PULSE_BEHAVIOR_GRAPH.json', graph);
}

function readState(rootDir: string): PersistedDaemonState {
  return readJsonFile<PersistedDaemonState>(
    path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_STATE.json'),
  );
}

describe('continuous daemon dynamic calibration', () => {
  it('derives objective, iterations, cooldown, ttl, and priority from live PULSE artifacts', () => {
    const rootDir = makeRoot();
    writeBehaviorGraph(rootDir);
    writeArtifact(rootDir, 'PULSE_CLI_DIRECTIVE.json', {
      targetCheckpoint: { capabilityRealnessRatio: 0.88 },
      productionAutonomyVerdict: 'NAO',
    });
    writeArtifact(rootDir, 'PULSE_CERTIFICATE.json', {
      status: 'NOT_CERTIFIED',
      certificationTarget: { final: false, profile: 'production-final' },
      score: 50,
    });
    writeArtifact(rootDir, 'PULSE_PATH_PROOF_EVIDENCE.json', {
      summary: { totalTasks: 10, executableTasks: 5, missingResult: 6, notObserved: 6 },
    });
    writeArtifact(rootDir, 'PULSE_PROOF_SYNTHESIS.json', {
      summary: { totalPlans: 22, plannedPlans: 22, observedPlans: 1 },
      targets: [
        {
          filePath: 'backend/src/products/product.service.ts',
          sourceKind: 'pure_function',
          plans: Array.from({ length: 20 }, () => ({ observed: false, countsAsObserved: false })),
        },
        {
          filePath: 'backend/src/other.controller.ts',
          sourceKind: 'endpoint',
          plans: [{ observed: false, countsAsObserved: false }],
        },
      ],
    });
    writeArtifact(rootDir, 'PULSE_PROBABILISTIC_RISK.json', {
      summary: { avgReliability: 0.2, capabilitiesWithLowReliability: 8 },
      reliabilities: [
        {
          capabilityId: 'capability:products-product',
          expectedImpact: 0.5,
          reliabilityP: 0.1,
          observations: 12,
        },
      ],
    });
    writeArtifact(rootDir, 'PULSE_AUTONOMY_STATE.json', {
      generatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      totalCycles: 1,
      improvements: 0,
      regressions: 0,
      rollbacks: 0,
      currentScore: 50,
      targetScore: 88,
      milestones: [],
      cycles: [
        {
          iteration: 1,
          phase: 'planning',
          unitId: 'bn-old',
          agent: 'autonomy-planner',
          result: 'blocked',
          filesChanged: [],
          scoreBefore: 50,
          scoreAfter: 50,
          durationMs: 42000,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          summary: 'historical blocker',
        },
      ],
      status: 'stopped',
      eta: null,
    });

    startContinuousDaemon(rootDir, { maxCycles: 1 });

    const state = readState(rootDir);
    expect(state.targetScore).toBe(88);
    expect(state.calibration.targetScore.source).toBe('artifact');
    expect(state.calibration.maxIterations.source).toBe('evidence_graph');
    expect(state.calibration.cooldownCycles.source).toBe('history');
    expect(state.calibration.leaseTtlMs.source).toBe('history');
    expect(state.calibration.fileEvidenceDeficits['backend/src/products/product.service.ts']).toBe(
      20,
    );
    expect(state.calibration.fileRiskImpact['products-product']).toBeGreaterThan(0);
    expect(state.cycles[0]?.unitId).toBe('bn-product');
    expect(state.cycles[0]?.summary).toContain('calibration=');
  });

  it('marks fixed defaults as weak calibration when evidence artifacts are absent', () => {
    const rootDir = makeRoot();
    writeBehaviorGraph(rootDir);

    startContinuousDaemon(rootDir, { maxCycles: 1 });

    const state = readState(rootDir);
    expect(state.calibration.targetScore.source).toBe('weak_fallback');
    expect(state.calibration.leaseTtlMs.source).toBe('weak_fallback');
    expect(state.calibration.weakFallbacks).toContain(
      'DEFAULT_TARGET_SCORE without objective artifact',
    );
    expect(state.calibration.weakFallbacks).toContain('LEASE_TTL_MS without duration history');
  });
});
