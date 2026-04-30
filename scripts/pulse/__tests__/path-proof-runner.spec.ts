import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPathCoverageState } from '../path-coverage-engine';
import { buildPathProofPlan, type PathProofTaskMode } from '../path-proof-runner';
import type {
  PulseExecutionMatrix,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathSource,
  PulseExecutionMatrixPathStatus,
} from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-proof-runner-'));
  tempRoots.push(rootDir);
  return rootDir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

function makeMatrixPath(
  overrides: Partial<PulseExecutionMatrixPath> = {},
): PulseExecutionMatrixPath {
  const routePatterns = overrides.routePatterns ?? ['/api/checkout'];
  return {
    pathId: 'matrix:path:critical-checkout',
    capabilityId: 'checkout-capability',
    flowId: 'checkout-flow',
    source: 'execution_chain',
    entrypoint: {
      nodeId: 'ui:checkout',
      filePath: 'frontend/checkout.tsx',
      routePattern: routePatterns[0] ?? null,
      description: 'checkout button',
    },
    chain: [
      {
        role: 'trigger',
        nodeId: 'ui:checkout',
        filePath: 'frontend/checkout.tsx',
        description: 'checkout button',
        truthMode: 'inferred',
      },
    ],
    status: 'inferred_only',
    truthMode: 'inferred',
    productStatus: 'real',
    breakpoint: {
      stage: 'trigger',
      stepIndex: 0,
      filePath: 'frontend/checkout.tsx',
      nodeId: 'ui:checkout',
      routePattern: routePatterns[0] ?? null,
      reason: 'Path is structurally inferred but lacks observed runtime evidence.',
      recovery: 'Run the checkout runtime probe and refresh path coverage.',
    },
    requiredEvidence: [
      {
        kind: 'runtime',
        required: true,
        reason: 'Critical checkout path needs runtime evidence.',
      },
    ],
    observedEvidence: [
      {
        source: 'static',
        artifactPath: 'PULSE_CERTIFICATE.json',
        executed: true,
        status: 'mapped',
        summary: 'Path is statically reconstructed.',
      },
    ],
    validationCommand:
      'node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path matrix:path:critical-checkout route /api/checkout',
    risk: 'critical',
    executionMode: 'governed_validation',
    confidence: 0.7,
    filePaths: ['frontend/checkout.tsx'],
    routePatterns,
    ...overrides,
  };
}

function countByStatus(
  paths: PulseExecutionMatrixPath[],
): Record<PulseExecutionMatrixPathStatus, number> {
  const statuses: PulseExecutionMatrixPathStatus[] = [
    'observed_pass',
    'observed_fail',
    'untested',
    'observation_only',
    'blocked_human_required',
    'unreachable',
    'inferred_only',
    'not_executable',
  ];

  return Object.fromEntries(
    statuses.map((status) => [status, paths.filter((entry) => entry.status === status).length]),
  ) as Record<PulseExecutionMatrixPathStatus, number>;
}

function countBySource(
  paths: PulseExecutionMatrixPath[],
): Record<PulseExecutionMatrixPathSource, number> {
  const sources: PulseExecutionMatrixPathSource[] = [
    'execution_chain',
    'capability',
    'flow',
    'structural_node',
    'scope_file',
  ];

  return Object.fromEntries(
    sources.map((source) => [source, paths.filter((entry) => entry.source === source).length]),
  ) as Record<PulseExecutionMatrixPathSource, number>;
}

function makeMatrix(paths: PulseExecutionMatrixPath[]): PulseExecutionMatrix {
  const byStatus = countByStatus(paths);
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalPaths: paths.length,
      bySource: countBySource(paths),
      byStatus,
      observedPass: byStatus.observed_pass,
      observedFail: byStatus.observed_fail,
      untested: byStatus.untested,
      blockedHumanRequired: byStatus.blocked_human_required,
      observationOnlyRequired: byStatus.observation_only,
      unreachable: byStatus.unreachable,
      inferredOnly: byStatus.inferred_only,
      notExecutable: byStatus.not_executable,
      terminalPaths: paths.length,
      nonTerminalPaths: 0,
      unknownPaths: 0,
      criticalUnobservedPaths: paths.filter(
        (entry) =>
          (entry.risk === 'high' || entry.risk === 'critical') &&
          entry.status !== 'observed_pass' &&
          entry.status !== 'observed_fail',
      ).length,
      impreciseBreakpoints: 0,
      coveragePercent: 100,
    },
    paths,
  };
}

describe('buildPathProofPlan', () => {
  it('materializes terminal critical paths as planned proof tasks without observed evidence', () => {
    const rootDir = makeTempRoot();
    const matrix = makeMatrix([makeMatrixPath()]);
    const coverage = buildPathCoverageState(rootDir, matrix);
    const plan = buildPathProofPlan(rootDir, {
      matrix,
      pathCoverage: coverage,
      generatedAt: '2026-04-29T12:00:00.000Z',
    });
    const task = plan.tasks[0];
    const writtenPlan = JSON.parse(
      fs.readFileSync(path.join(rootDir, '.pulse/current/PULSE_PATH_PROOF_TASKS.json'), 'utf8'),
    ) as { tasks: Array<{ pathId: string; executed: boolean }> };

    expect(plan.summary).toEqual({
      terminalWithoutObservedEvidence: 1,
      plannedTasks: 1,
      executableTasks: 1,
      humanRequiredTasks: 0,
      notExecutableTasks: 0,
    });
    expect(task).toEqual(
      expect.objectContaining({
        taskId: 'path-proof:endpoint:matrix-path-critical-checkout',
        pathId: 'matrix:path:critical-checkout',
        mode: 'endpoint',
        status: 'planned',
        executed: false,
        coverageCountsAsObserved: false,
        autonomousExecutionAllowed: true,
        sourceStatus: 'inferred_only',
      }),
    );
    expect(task.command).toContain('execute generated probe blueprint .pulse/frontier/');
    expect(task.artifactLinks).toEqual(
      expect.arrayContaining([
        {
          artifactPath: '.pulse/current/PULSE_EXECUTION_MATRIX.json',
          relationship: 'source_matrix',
        },
        { artifactPath: '.pulse/current/PULSE_PATH_COVERAGE.json', relationship: 'coverage_state' },
        {
          artifactPath: '.pulse/current/PULSE_PATH_PROOF_TASKS.json',
          relationship: 'proof_task_plan',
        },
        expect.objectContaining({ relationship: 'probe_blueprint' }),
      ]),
    );
    expect(coverage.paths[0].classification).toBe('probe_blueprint_generated');
    expect(coverage.paths[0].evidenceMode).toBe('blueprint');
    expect(coverage.paths[0].lastProbed).toBeNull();
    expect(writtenPlan.tasks[0]).toEqual(
      expect.objectContaining({ pathId: task.pathId, executed: false }),
    );
  });

  it('assigns deterministic proof task modes for all terminal path classes', () => {
    const rootDir = makeTempRoot();
    const matrix = makeMatrix([
      makeMatrixPath({
        pathId: 'z-endpoint',
        routePatterns: ['/api/orders'],
      }),
      makeMatrixPath({
        pathId: 'a-ui',
        routePatterns: [],
        entrypoint: {
          nodeId: 'ui:orders',
          filePath: 'frontend/src/app/orders/page.tsx',
          routePattern: null,
          description: 'orders page',
        },
        filePaths: ['frontend/src/app/orders/page.tsx'],
      }),
      makeMatrixPath({
        pathId: 'b-worker',
        routePatterns: [],
        entrypoint: {
          nodeId: 'worker:sync',
          filePath: 'worker/src/sync.worker.ts',
          routePattern: null,
          description: 'sync queue worker',
        },
        filePaths: ['worker/src/sync.worker.ts'],
      }),
      makeMatrixPath({
        pathId: 'c-webhook',
        routePatterns: ['/stripe/webhook'],
      }),
      makeMatrixPath({
        pathId: 'd-function',
        routePatterns: [],
        entrypoint: {
          nodeId: 'fn:score',
          filePath: 'scripts/pulse/scoring.ts',
          routePattern: null,
          description: 'score function',
        },
        filePaths: ['scripts/pulse/scoring.ts'],
      }),
      makeMatrixPath({
        pathId: 'e-not-executable',
        status: 'not_executable',
        routePatterns: [],
        entrypoint: {
          nodeId: null,
          filePath: 'scripts/pulse/inventory.ts',
          routePattern: null,
          description: 'inventory file',
        },
        filePaths: ['scripts/pulse/inventory.ts'],
      }),
      makeMatrixPath({
        pathId: 'f-human-required',
        routePatterns: [],
        executionMode: 'observation_only',
        entrypoint: {
          nodeId: 'ops:gate',
          filePath: 'scripts/ops/check-governance-boundary.mjs',
          routePattern: null,
          description: 'governance gate',
        },
        filePaths: ['scripts/ops/check-governance-boundary.mjs'],
      }),
      makeMatrixPath({
        pathId: 'observed-excluded',
        status: 'observed_pass',
        observedEvidence: [
          {
            source: 'runtime',
            artifactPath: 'PULSE_RUNTIME_EVIDENCE.json',
            executed: true,
            status: 'passed',
            summary: 'Runtime probe passed.',
          },
        ],
      }),
    ]);

    const plan = buildPathProofPlan(rootDir, {
      matrix,
      generatedAt: '2026-04-29T12:00:00.000Z',
      writeArtifact: false,
    });
    const modesByPath = new Map(plan.tasks.map((task) => [task.pathId, task.mode]));
    const expectedModes: Array<[string, PathProofTaskMode]> = [
      ['a-ui', 'ui'],
      ['b-worker', 'worker'],
      ['c-webhook', 'webhook'],
      ['d-function', 'function'],
      ['e-not-executable', 'not_executable'],
      ['f-human-required', 'human_required'],
      ['z-endpoint', 'endpoint'],
    ];

    expect(plan.tasks.map((task) => task.pathId)).toEqual(expectedModes.map(([pathId]) => pathId));
    expect([...modesByPath.entries()]).toEqual(expectedModes);
    expect(plan.tasks.every((task) => task.status === 'planned' && !task.executed)).toBe(true);
    expect(plan.tasks.every((task) => !task.coverageCountsAsObserved)).toBe(true);
    expect(modesByPath.has('observed-excluded')).toBe(false);
    expect(plan.summary).toEqual(
      expect.objectContaining({
        terminalWithoutObservedEvidence: 7,
        executableTasks: 5,
        humanRequiredTasks: 1,
        notExecutableTasks: 1,
      }),
    );
  });
});
