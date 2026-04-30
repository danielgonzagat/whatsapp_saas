import { describe, expect, it } from 'vitest';

import { buildDirectiveProofSurface } from '../directive-proof-surface';
import type { PulseMachineReadiness } from '../artifacts.types';
import type { PathProofPlan, PathProofTask } from '../path-proof-runner';
import type { PathCoverageState } from '../types.path-coverage-engine';

function makeTask(overrides: Partial<PathProofTask> = {}): PathProofTask {
  return {
    taskId: 'path-proof:function:opaque-a',
    pathId: 'opaque-a',
    capabilityId: null,
    flowId: null,
    mode: 'function',
    status: 'planned',
    executed: false,
    coverageCountsAsObserved: false,
    autonomousExecutionAllowed: true,
    command: 'node scripts/pulse/run.js --guidance # validate opaque-a',
    reason: 'Path has no observed proof.',
    sourceStatus: 'inferred_only',
    risk: 'high',
    entrypoint: {
      nodeId: 'node:opaque-a',
      filePath: 'scripts/pulse/opaque-a.ts',
      routePattern: null,
      description: 'opaque function path',
    },
    breakpoint: {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: 'scripts/pulse/opaque-a.ts',
      nodeId: 'node:opaque-a',
      routePattern: null,
      reason: 'Runtime evidence is absent.',
      recovery: 'Run the generated proof command.',
    },
    expectedEvidence: [{ kind: 'runtime', required: true, reason: 'Runtime proof is required.' }],
    artifactLinks: [
      { artifactPath: '.pulse/current/PULSE_EXECUTION_MATRIX.json', relationship: 'source_matrix' },
    ],
    ...overrides,
  };
}

function makePlan(tasks: PathProofTask[]): PathProofPlan {
  return {
    generatedAt: '2026-04-29T12:00:00.000Z',
    summary: {
      terminalWithoutObservedEvidence: tasks.length,
      plannedTasks: tasks.length,
      executableTasks: tasks.filter((task) => task.autonomousExecutionAllowed).length,
      humanRequiredTasks: tasks.filter((task) => task.mode === 'human_required').length,
      notExecutableTasks: tasks.filter((task) => task.mode === 'not_executable').length,
    },
    tasks,
  };
}

function makeCoverage(overrides: Partial<PathCoverageState['summary']> = {}): PathCoverageState {
  return {
    generatedAt: '2026-04-29T11:50:00.000Z',
    summary: {
      totalPaths: 3,
      observedPass: 1,
      observedFail: 0,
      testGenerated: 1,
      probeBlueprintGenerated: 2,
      inferredOnly: 1,
      criticalInferredOnly: 1,
      criticalUnobserved: 2,
      criticalBlueprintReady: 1,
      criticalTerminalReasoned: 0,
      criticalInferredGap: 1,
      coveragePercent: 33,
      ...overrides,
    },
    paths: [],
  };
}

function makeReadiness(overrides: Partial<PulseMachineReadiness> = {}): PulseMachineReadiness {
  return {
    scope: 'pulse_machine_not_kloel_product',
    status: 'NOT_READY',
    generatedAt: '2026-04-29T11:45:00.000Z',
    productCertificationStatus: 'PARTIAL',
    productCertificationExcludedFromVerdict: true,
    canRunBoundedAutonomousCycle: true,
    canDeclareKloelProductCertified: false,
    criteria: [
      {
        id: 'execution_matrix',
        status: 'fail',
        reason: 'Matrix proof is incomplete.',
        evidence: { missing: 1 },
      },
    ],
    blockers: ['Matrix proof is incomplete.'],
    ...overrides,
  };
}

describe('buildDirectiveProofSurface', () => {
  it('summarizes counts, freshness, commands, and top executable unproved tasks', () => {
    const tasks = [
      makeTask({
        taskId: 'path-proof:function:medium',
        pathId: 'medium',
        risk: 'medium',
        command: 'node scripts/pulse/run.js --guidance # validate medium',
      }),
      makeTask({
        taskId: 'path-proof:endpoint:critical',
        pathId: 'critical',
        mode: 'endpoint',
        risk: 'critical',
        command: 'node scripts/pulse/run.js --guidance # validate critical',
        entrypoint: {
          nodeId: 'node:critical',
          filePath: 'scripts/pulse/critical.ts',
          routePattern: '/opaque',
          description: 'opaque critical path',
        },
      }),
      makeTask({
        taskId: 'path-proof:function:human',
        pathId: 'human',
        mode: 'human_required',
        autonomousExecutionAllowed: false,
      }),
    ];

    const surface = buildDirectiveProofSurface({
      pathProofPlan: makePlan(tasks),
      pathCoverage: makeCoverage(),
      machineReadiness: makeReadiness(),
      now: '2026-04-29T12:30:00.000Z',
      maxTopTasks: 2,
    });

    expect(surface.counts).toMatchObject({
      plannedTasks: 3,
      unprovedTasks: 3,
      executableUnprovedTasks: 2,
      humanRequiredTasks: 1,
      notExecutableTasks: 0,
      readinessBlockers: 1,
      criticalUnobservedPaths: 2,
      criticalBlueprintReady: 1,
      coveragePercent: 33,
    });
    expect(surface.executionMode).toBe('governed_sandbox');
    expect(surface.topExecutableUnprovedTasks.map((task) => task.pathId)).toEqual([
      'critical',
      'medium',
    ]);
    expect(surface.evidenceFreshness).toEqual({
      generatedAt: '2026-04-29T12:00:00.000Z',
      ageMinutes: 30,
      stale: false,
      source: 'path_proof_plan',
      staleThresholdMinutes: 1440,
    });
    expect(surface.validationCommandHints).toEqual([
      'node scripts/pulse/run.js --guidance # validate critical',
      'node scripts/pulse/run.js --guidance # validate medium',
      'node scripts/pulse/run.js --guidance # refresh execution_matrix',
    ]);
  });

  it('falls back to readiness blockers when no executable proof task remains', () => {
    const surface = buildDirectiveProofSurface({
      pathProofPlan: makePlan([
        makeTask({
          mode: 'human_required',
          autonomousExecutionAllowed: false,
        }),
      ]),
      machineReadiness: makeReadiness(),
      now: '2026-04-29T12:30:00.000Z',
    });

    expect(surface.executionMode).toBe('human_required');
    expect(surface.topExecutableUnprovedTasks).toEqual([]);
    expect(surface.validationCommandHints).toEqual([
      'node scripts/pulse/run.js --guidance # refresh execution_matrix',
    ]);
    expect(surface.readiness).toEqual({
      status: 'NOT_READY',
      canRunBoundedAutonomousCycle: true,
      canDeclareProductCertified: false,
      blockers: ['Matrix proof is incomplete.'],
    });
  });

  it('does not invent work when provided surfaces are empty or missing', () => {
    const surface = buildDirectiveProofSurface({
      now: '2026-04-29T12:30:00.000Z',
    });

    expect(surface.counts).toEqual({
      plannedTasks: 0,
      unprovedTasks: 0,
      executableUnprovedTasks: 0,
      humanRequiredTasks: 0,
      notExecutableTasks: 0,
      readinessBlockers: 0,
      criticalUnobservedPaths: null,
      criticalBlueprintReady: null,
      coveragePercent: null,
    });
    expect(surface.executionMode).toBe('observation_only');
    expect(surface.evidenceFreshness).toMatchObject({
      generatedAt: null,
      ageMinutes: null,
      stale: true,
      source: 'missing',
    });
    expect(surface.validationCommandHints).toEqual([]);
  });
});
