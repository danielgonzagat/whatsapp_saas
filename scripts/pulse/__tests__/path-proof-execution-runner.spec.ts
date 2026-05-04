import { describe, expect, it } from 'vitest';

import {
  evaluatePathProofCommandPolicy,
  executePathProofPlan,
  type PathProofCommandExecutionInput,
} from '../path-proof-execution-runner';
import type { PathProofPlan, PathProofTask } from '../path-proof-runner';

function makeTask(overrides: Partial<PathProofTask> = {}): PathProofTask {
  return {
    taskId: 'path-proof:endpoint:checkout',
    pathId: 'matrix:path:checkout',
    capabilityId: 'checkout',
    flowId: 'checkout-flow',
    mode: 'endpoint',
    status: 'planned',
    executed: false,
    coverageCountsAsObserved: false,
    autonomousExecutionAllowed: true,
    command:
      'node scripts/pulse/run.js --profile pulse-core-final --guidance --json # generated path proof',
    reason: 'Critical path needs observed evidence.',
    sourceStatus: 'inferred_only',
    risk: 'critical',
    entrypoint: {
      nodeId: 'checkout:route',
      filePath: 'backend/src/checkout/checkout-public.controller.ts',
      routePattern: '/api/checkout',
      description: 'checkout route',
    },
    breakpoint: {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: 'backend/src/checkout/checkout-public.controller.ts',
      nodeId: 'checkout:route',
      routePattern: '/api/checkout',
      reason: 'No runtime proof attached yet.',
      recovery: 'Run the bounded proof command.',
    },
    expectedEvidence: [
      {
        kind: 'runtime',
        required: true,
        reason: 'Runtime evidence is required for a critical path.',
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

describe('path proof execution runner', () => {
  it('executes only policy-allowed commands through the injected executor', async () => {
    const calls: PathProofCommandExecutionInput[] = [];
    const task = makeTask();
    const run = await executePathProofPlan(makePlan([task]), {
      cwd: '/repo',
      timeoutMs: 1234,
      generatedAt: '2026-04-29T13:00:00.000Z',
      executor: (input) => {
        calls.push(input);
        return { exitCode: 0, stdout: 'ok' };
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        executable: 'node',
        args: ['scripts/pulse/run.js', '--profile', 'pulse-core-final', '--guidance', '--json'],
        cwd: '/repo',
        timeoutMs: 1234,
      }),
    );
    expect(run.summary).toEqual({
      totalTasks: 1,
      attemptedTasks: 1,
      observedPass: 1,
      observedFail: 0,
      executionSkipped: 0,
      plannedOnly: 0,
      observedTasks: 1,
    });
    expect(run.results[0]).toEqual(
      expect.objectContaining({
        status: 'observed_pass',
        executed: true,
        coverageCountsAsObserved: true,
        exitCode: 0,
        command: 'node scripts/pulse/run.js --profile pulse-core-final --guidance --json',
      }),
    );
  });

  it('maps non-zero executor exits to observed_fail without hiding the failure', async () => {
    const run = await executePathProofPlan(makePlan([makeTask()]), {
      executor: () => ({ exitCode: 17, stderr: 'boom' }),
    });

    expect(run.summary.observedFail).toBe(1);
    expect(run.summary.observedTasks).toBe(1);
    expect(run.results[0]).toEqual(
      expect.objectContaining({
        status: 'observed_fail',
        executed: true,
        coverageCountsAsObserved: true,
        exitCode: 17,
        stderr: 'boom',
      }),
    );
  });

  it('skips tasks that are not autonomous, reference governance, or contain unsafe commands', async () => {
    const calls: PathProofCommandExecutionInput[] = [];
    const blockedTasks = [
      makeTask({
        taskId: 'not-autonomous',
        pathId: 'not-autonomous',
        autonomousExecutionAllowed: false,
      }),
      makeTask({
        taskId: 'human-required',
        pathId: 'human-required',
        mode: 'human_required',
      }),
      makeTask({
        taskId: 'governance-path',
        pathId: 'governance-path',
        entrypoint: {
          nodeId: 'ops:gate',
          filePath: 'scripts/ops/check-governance-boundary.mjs',
          routePattern: null,
          description: 'governance gate',
        },
      }),
      makeTask({
        taskId: 'destructive-token',
        pathId: 'destructive-token',
        command: 'git reset --hard',
      }),
      makeTask({
        taskId: 'shell-control',
        pathId: 'shell-control',
        command: 'node scripts/pulse/run.js --guidance && rm -rf .pulse',
      }),
      makeTask({
        taskId: 'governance-arg',
        pathId: 'governance-arg',
        command: 'node scripts/pulse/run.js --config=scripts/ops/check-governance-boundary.mjs',
      }),
    ];

    const run = await executePathProofPlan(makePlan(blockedTasks), {
      executor: (input) => {
        calls.push(input);
        return { exitCode: 0 };
      },
    });

    expect(calls).toHaveLength(0);
    expect(run.summary).toEqual({
      totalTasks: 6,
      attemptedTasks: 0,
      observedPass: 0,
      observedFail: 0,
      executionSkipped: 6,
      plannedOnly: 0,
      observedTasks: 0,
    });
    expect(run.results.every((result) => !result.coverageCountsAsObserved)).toBe(true);
    expect(run.results.map((result) => result.status)).toEqual([
      'execution_skipped',
      'execution_skipped',
      'execution_skipped',
      'execution_skipped',
      'execution_skipped',
      'execution_skipped',
    ]);
  });

  it('keeps execution-budget overflow as planned_only and never counts it as observed', async () => {
    const tasks = [
      makeTask({ taskId: 'first', pathId: 'first' }),
      makeTask({ taskId: 'second', pathId: 'second' }),
    ];
    const run = await executePathProofPlan(makePlan(tasks), {
      maxTasks: 1,
      executor: () => ({ exitCode: 0 }),
    });

    expect(run.summary).toEqual({
      totalTasks: 2,
      attemptedTasks: 1,
      observedPass: 1,
      observedFail: 0,
      executionSkipped: 0,
      plannedOnly: 1,
      observedTasks: 1,
    });
    expect(run.results[1]).toEqual(
      expect.objectContaining({
        status: 'planned_only',
        executed: false,
        coverageCountsAsObserved: false,
        exitCode: null,
      }),
    );
  });

  it('requires command prefixes to be explicitly allowlisted', () => {
    const policy = evaluatePathProofCommandPolicy(
      makeTask({ command: 'npx vitest run scripts/pulse/__tests__/path-proof-runner.spec.ts' }),
    );

    expect(policy.allowed).toBe(false);
    expect(policy.reason).toBe('Command is not in the autonomous allowlist.');
  });
});
