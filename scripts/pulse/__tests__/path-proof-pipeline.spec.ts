import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { PathProofRunnerResult } from '../path-proof-evidence';
import { buildPathProofPipeline } from '../path-proof-pipeline';
import type { PathProofPlan, PathProofTask } from '../path-proof-runner';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-proof-pipeline-'));
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

function makeTask(overrides: Partial<PathProofTask> = {}): PathProofTask {
  return {
    taskId: 'path-proof:endpoint:checkout',
    pathId: 'matrix:path:checkout',
    capabilityId: 'checkout-capability',
    flowId: 'checkout-flow',
    mode: 'endpoint',
    status: 'planned',
    executed: false,
    coverageCountsAsObserved: false,
    autonomousExecutionAllowed: true,
    command: 'npx vitest run scripts/pulse/__tests__/checkout.spec.ts',
    reason: 'Critical checkout path requires runtime proof.',
    sourceStatus: 'inferred_only',
    risk: 'critical',
    entrypoint: {
      nodeId: 'checkout-controller',
      filePath: 'backend/src/checkout/checkout-public.controller.ts',
      routePattern: '/checkout/:slug',
      description: 'checkout endpoint',
    },
    breakpoint: {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: 'backend/src/checkout/checkout-public.controller.ts',
      nodeId: 'checkout-controller',
      routePattern: '/checkout/:slug',
      reason: 'No runtime evidence was observed.',
      recovery: 'Run path proof command.',
    },
    expectedEvidence: [
      {
        kind: 'runtime',
        required: true,
        reason: 'Runtime command must pass or fail honestly.',
      },
    ],
    artifactLinks: [
      {
        artifactPath: '.pulse/current/PULSE_PATH_PROOF_TASKS.json',
        relationship: 'proof_task_plan',
      },
    ],
    ...overrides,
  };
}

function makePlan(tasks: PathProofTask[]): PathProofPlan {
  return {
    generatedAt: '2026-04-29T21:00:00.000Z',
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

function result(
  task: PathProofTask,
  overrides: Partial<PathProofRunnerResult> = {},
): PathProofRunnerResult {
  return {
    taskId: task.taskId,
    pathId: task.pathId,
    command: task.command,
    status: 'passed',
    executed: true,
    exitCode: 0,
    startedAt: '2026-04-29T21:01:00.000Z',
    finishedAt: '2026-04-29T21:01:01.000Z',
    durationMs: 1000,
    artifactPath: '.pulse/current/runner/checkout.json',
    summary: 'Command completed.',
    ...overrides,
  };
}

describe('path proof pipeline', () => {
  it('synthesizes evidence artifact and readiness gate from plan and runner results only', () => {
    const checkoutTask = makeTask();
    const workerTask = makeTask({
      taskId: 'path-proof:worker:sync',
      pathId: 'matrix:path:sync',
      mode: 'worker',
    });
    const plan = makePlan([checkoutTask, workerTask]);

    const output = buildPathProofPipeline({
      plan,
      runnerResults: [result(checkoutTask), result(workerTask, { status: 'failed', exitCode: 1 })],
      generatedAt: '2026-04-29T21:02:00.000Z',
    });

    expect(output.evidenceArtifact.summary).toEqual(
      expect.objectContaining({
        totalTasks: 2,
        runnerResults: 2,
        observedEvidenceLinks: 2,
        observedPass: 1,
        observedFail: 1,
      }),
    );
    expect(output.readinessGate.canAdvance).toBe(true);
    expect(output.readinessGate.status).toBe('ready');
    expect(output.readinessGate.summary).toEqual(
      expect.objectContaining({
        executableTasks: 2,
        executableObserved: 2,
        executableUnproved: 0,
        observedEvidence: 2,
        nonObservedEvidence: 0,
      }),
    );
    expect(output.readinessGate.blockers).toEqual([]);
  });

  it('does not write artifacts while building the pure pipeline result', () => {
    const rootDir = makeTempRoot();
    const cwdBefore = process.cwd();

    process.chdir(rootDir);
    try {
      const output = buildPathProofPipeline({
        plan: makePlan([makeTask()]),
        runnerResults: [],
        generatedAt: '2026-04-29T21:02:00.000Z',
      });

      expect(output.evidenceArtifact.summary.missingResult).toBe(1);
      expect(output.readinessGate.status).toBe('executable_unproved');
      expect(fs.existsSync(path.join(rootDir, '.pulse'))).toBe(false);
    } finally {
      process.chdir(cwdBefore);
    }
  });

  it('keeps planned-only and blocked tasks out of observed readiness', () => {
    const plannedTask = makeTask({ taskId: 'path-proof:endpoint:planned', pathId: 'planned-path' });
    const humanTask = makeTask({
      taskId: 'path-proof:human:governance',
      pathId: 'governance-path',
      mode: 'human_required',
      autonomousExecutionAllowed: false,
    });
    const plan = makePlan([plannedTask, humanTask]);

    const output = buildPathProofPipeline({
      plan,
      runnerResults: [result(plannedTask, { executed: false, status: 'planned_only' })],
      generatedAt: '2026-04-29T21:02:00.000Z',
    });

    expect(output.evidenceArtifact.summary).toEqual(
      expect.objectContaining({
        plannedOnly: 1,
        missingResult: 1,
        observedEvidenceLinks: 0,
      }),
    );
    expect(output.readinessGate.canAdvance).toBe(false);
    expect(output.readinessGate.status).toBe('executable_unproved');
    expect(output.readinessGate.blockers.map((blocker) => blocker.reason)).toEqual([
      'executable_without_observed_evidence',
      'human_required',
    ]);
  });
});
