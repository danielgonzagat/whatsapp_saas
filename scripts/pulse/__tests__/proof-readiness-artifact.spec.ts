import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PATH_PROOF_EVIDENCE_ARTIFACT,
  PATH_PROOF_TASKS_ARTIFACT,
  mergePathProofRunnerResults,
  type PathProofRunnerResult,
} from '../path-proof-evidence';
import { PROOF_READINESS_ARTIFACT, buildProofReadinessArtifact } from '../proof-readiness-artifact';
import type { PathProofPlan, PathProofTask } from '../path-proof-runner';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-proof-readiness-'));
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
    command: 'npm run pulse -- --path checkout',
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
        artifactPath: PATH_PROOF_TASKS_ARTIFACT,
        relationship: 'proof_task_plan',
      },
    ],
    ...overrides,
  };
}

function makePlan(tasks: PathProofTask[]): PathProofPlan {
  return {
    generatedAt: '2026-04-29T22:00:00.000Z',
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
    startedAt: '2026-04-29T22:01:00.000Z',
    finishedAt: '2026-04-29T22:01:01.000Z',
    durationMs: 1000,
    artifactPath: '.pulse/current/runner/checkout.json',
    summary: 'Command completed.',
    ...overrides,
  };
}

function writeJson(rootDir: string, artifactPath: string, value: unknown): void {
  const outputPath = path.join(rootDir, artifactPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
}

describe('proof readiness artifact', () => {
  it('writes canonical readiness artifact using path proof tasks, evidence, and gate result', () => {
    const rootDir = makeTempRoot();
    const observedTask = makeTask();
    const plan = makePlan([observedTask]);
    const evidence = mergePathProofRunnerResults(
      plan,
      [result(observedTask)],
      '2026-04-29T22:02:00.000Z',
    );

    writeJson(rootDir, PATH_PROOF_TASKS_ARTIFACT, plan);
    writeJson(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT, evidence);

    const artifact = buildProofReadinessArtifact(rootDir, {
      generatedAt: '2026-04-29T22:03:00.000Z',
    });
    const writtenArtifact = JSON.parse(
      fs.readFileSync(path.join(rootDir, PROOF_READINESS_ARTIFACT), 'utf8'),
    ) as { artifact: string; summary: { canAdvance: boolean; status: string } };

    expect(artifact.artifact).toBe('PULSE_PROOF_READINESS');
    expect(artifact.sourceArtifacts).toEqual({
      tasks: PATH_PROOF_TASKS_ARTIFACT,
      evidence: PATH_PROOF_EVIDENCE_ARTIFACT,
      self: PROOF_READINESS_ARTIFACT,
    });
    expect(artifact.summary).toEqual(
      expect.objectContaining({
        totalTasks: 1,
        executableTasks: 1,
        executableObserved: 1,
        executableUnproved: 0,
        observedEvidence: 1,
        nonObservedEvidence: 0,
        plannedOrUnexecutedEvidence: 0,
        canAdvance: true,
        status: 'ready',
      }),
    );
    expect(artifact.readinessGate.canAdvance).toBe(true);
    expect(writtenArtifact).toEqual(
      expect.objectContaining({
        artifact: 'PULSE_PROOF_READINESS',
        summary: expect.objectContaining({ canAdvance: true, status: 'ready' }),
      }),
    );
  });

  it('classifies planned and unexecuted path proof evidence as not ready', () => {
    const plannedTask = makeTask({
      taskId: 'path-proof:endpoint:planned',
      pathId: 'matrix:path:planned',
    });
    const unexecutedTask = makeTask({
      taskId: 'path-proof:endpoint:unexecuted',
      pathId: 'matrix:path:unexecuted',
    });
    const plan = makePlan([plannedTask, unexecutedTask]);
    const evidence = mergePathProofRunnerResults(
      plan,
      [
        result(plannedTask, { status: 'planned_only', executed: false, plannedOnly: true }),
        result(unexecutedTask, { status: 'passed', executed: false }),
      ],
      '2026-04-29T22:04:00.000Z',
    );

    const artifact = buildProofReadinessArtifact(makeTempRoot(), {
      plan,
      evidenceArtifact: evidence,
      generatedAt: '2026-04-29T22:05:00.000Z',
      writeArtifact: false,
    });

    expect(artifact.summary).toEqual(
      expect.objectContaining({
        executableTasks: 2,
        executableObserved: 0,
        executableUnproved: 2,
        observedEvidence: 0,
        nonObservedEvidence: 2,
        plannedOrUnexecutedEvidence: 2,
        canAdvance: false,
        status: 'executable_unproved',
      }),
    );
    expect(artifact.readinessGate.blockers.map((blocker) => blocker.taskId)).toEqual([
      plannedTask.taskId,
      unexecutedTask.taskId,
    ]);
  });
});
