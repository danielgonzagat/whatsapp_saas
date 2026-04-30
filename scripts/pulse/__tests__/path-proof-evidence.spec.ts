import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PATH_PROOF_EVIDENCE_ARTIFACT,
  PATH_PROOF_TASKS_ARTIFACT,
  buildPathProofEvidenceArtifact,
  mergePathProofRunnerResults,
  pathProofExecutionResultsToRunnerResults,
  resultCountsAsObservedPathProof,
  type PathProofRunnerResult,
} from '../path-proof-evidence';
import { executePathProofPlan } from '../path-proof-execution-runner';
import type { PathProofPlan, PathProofTask } from '../path-proof-runner';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-proof-evidence-'));
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
  taskId: string,
  overrides: Partial<PathProofRunnerResult> = {},
): PathProofRunnerResult {
  return {
    taskId,
    pathId: `matrix:path:${taskId}`,
    command: 'npm run pulse -- --path checkout',
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

describe('path proof evidence artifact', () => {
  it('creates observed evidence links only from executed pass/fail command results', () => {
    const passTask = makeTask({ taskId: 'path-proof:endpoint:pass', pathId: 'pass-path' });
    const failTask = makeTask({ taskId: 'path-proof:endpoint:fail', pathId: 'fail-path' });
    const plannedTask = makeTask({ taskId: 'path-proof:endpoint:planned', pathId: 'planned-path' });
    const skippedTask = makeTask({ taskId: 'path-proof:endpoint:skipped', pathId: 'skipped-path' });
    const staleTask = makeTask({ taskId: 'path-proof:endpoint:stale', pathId: 'stale-path' });
    const commandlessTask = makeTask({
      taskId: 'path-proof:endpoint:commandless',
      pathId: 'commandless-path',
    });
    const missingTask = makeTask({ taskId: 'path-proof:endpoint:missing', pathId: 'missing-path' });

    const artifact = mergePathProofRunnerResults(
      makePlan([
        passTask,
        failTask,
        plannedTask,
        skippedTask,
        staleTask,
        commandlessTask,
        missingTask,
      ]),
      [
        result(passTask.taskId, { status: 'passed' }),
        result(failTask.taskId, { status: 'failed', exitCode: 1 }),
        result(plannedTask.taskId, { status: 'passed', executed: false }),
        result(skippedTask.taskId, { status: 'skipped', skipped: true }),
        result(staleTask.taskId, { status: 'passed', stale: true }),
        result(commandlessTask.taskId, { command: '' }),
      ],
      '2026-04-29T21:02:00.000Z',
    );

    expect(artifact.artifact).toBe('PULSE_PATH_PROOF_EVIDENCE');
    expect(artifact.sourceArtifacts).toEqual({
      tasks: PATH_PROOF_TASKS_ARTIFACT,
      self: PATH_PROOF_EVIDENCE_ARTIFACT,
    });
    expect(artifact.summary).toEqual({
      totalTasks: 7,
      runnerResults: 6,
      observedEvidenceLinks: 2,
      observedPass: 1,
      observedFail: 1,
      notRun: 5,
      plannedOnly: 1,
      skipped: 1,
      stale: 1,
      missingResult: 1,
      notObserved: 5,
      commandlessResults: 1,
      executableTasks: 7,
      humanRequiredTasks: 0,
      notExecutableTasks: 0,
    });
    expect(
      artifact.tasks
        .filter((task) => task.observedEvidenceLink)
        .map((task) => [
          task.taskId,
          task.disposition,
          task.evidenceState,
          task.coverageCountsAsObserved,
          task.freshness.status,
        ]),
    ).toEqual([
      ['path-proof:endpoint:pass', 'observed_pass', 'observed', true, 'fresh'],
      ['path-proof:endpoint:fail', 'observed_fail', 'observed', true, 'fresh'],
    ]);
    expect(
      artifact.tasks
        .filter((task) => !task.observed)
        .map((task) => [
          task.taskId,
          task.disposition,
          task.evidenceState,
          task.coverageCountsAsObserved,
          task.freshness.status,
        ]),
    ).toEqual([
      ['path-proof:endpoint:planned', 'planned_only', 'not_run', false, 'not_run'],
      ['path-proof:endpoint:skipped', 'skipped', 'not_run', false, 'not_run'],
      ['path-proof:endpoint:stale', 'stale', 'not_run', false, 'stale'],
      ['path-proof:endpoint:commandless', 'not_observed', 'not_run', false, 'not_run'],
      ['path-proof:endpoint:missing', 'missing_result', 'not_run', false, 'not_run'],
    ]);
    expect(artifact.tasks[0].observedEvidenceLink).toEqual(
      expect.objectContaining({
        startedAt: '2026-04-29T21:01:00.000Z',
        finishedAt: '2026-04-29T21:01:01.000Z',
        observedAt: '2026-04-29T21:01:01.000Z',
      }),
    );
  });

  it('keeps executed false and planned_only outside observed proof even with passing status', () => {
    expect(
      resultCountsAsObservedPathProof(
        result('unexecuted-pass', { status: 'passed', executed: false, plannedOnly: false }),
      ),
    ).toBe(false);
    expect(
      resultCountsAsObservedPathProof(
        result('planned-only-pass', { status: 'passed', executed: true, plannedOnly: true }),
      ),
    ).toBe(false);
    expect(resultCountsAsObservedPathProof(result('actual-pass', { status: 'passed' }))).toBe(true);
    expect(resultCountsAsObservedPathProof(result('actual-fail', { status: 'failed' }))).toBe(true);
    const missingTimestamps = result('missing-timestamps', { status: 'passed' });
    delete missingTimestamps.startedAt;
    delete missingTimestamps.finishedAt;
    expect(resultCountsAsObservedPathProof(missingTimestamps)).toBe(false);
  });

  it('adapts execution-runner observed statuses without losing pass/fail semantics', async () => {
    const passTask = makeTask({
      taskId: 'path-proof:endpoint:runner-pass',
      pathId: 'runner-pass-path',
      command: 'node scripts/pulse/run.js --profile pulse-core-final --guidance --json',
    });
    const failTask = makeTask({
      taskId: 'path-proof:endpoint:runner-fail',
      pathId: 'runner-fail-path',
      command: 'node scripts/pulse/run.js --profile pulse-core-final --guidance --json',
    });
    const skippedTask = makeTask({
      taskId: 'path-proof:endpoint:runner-skipped',
      pathId: 'runner-skipped-path',
      autonomousExecutionAllowed: false,
      command: 'node scripts/pulse/run.js --profile pulse-core-final --guidance --json',
    });
    const run = await executePathProofPlan(makePlan([passTask, failTask, skippedTask]), {
      executor: (input) => ({
        exitCode: input.task.taskId === failTask.taskId ? 13 : 0,
      }),
      generatedAt: '2026-04-29T21:04:00.000Z',
    });

    const artifact = mergePathProofRunnerResults(
      makePlan([passTask, failTask, skippedTask]),
      pathProofExecutionResultsToRunnerResults(run.results),
      '2026-04-29T21:05:00.000Z',
    );

    expect(run.results.map((entry) => [entry.taskId, entry.status, entry.executed])).toEqual([
      [passTask.taskId, 'observed_pass', true],
      [failTask.taskId, 'observed_fail', true],
      [skippedTask.taskId, 'execution_skipped', false],
    ]);
    const tasks = artifact.tasks.map((entry) => [
      entry.taskId,
      entry.result?.status,
      entry.disposition,
      entry.observed,
      entry.coverageCountsAsObserved,
      entry.result?.startedAt,
      entry.result?.finishedAt,
    ]);
    expect(tasks[0].slice(0, 5)).toEqual([passTask.taskId, 'passed', 'observed_pass', true, true]);
    expect(typeof tasks[0][5]).toBe('string');
    expect(typeof tasks[0][6]).toBe('string');
    expect(tasks[1].slice(0, 5)).toEqual([failTask.taskId, 'failed', 'observed_fail', true, true]);
    expect(typeof tasks[1][5]).toBe('string');
    expect(typeof tasks[1][6]).toBe('string');
    expect(tasks[2]).toEqual([
      skippedTask.taskId,
      'skipped',
      'skipped',
      false,
      false,
      undefined,
      undefined,
    ]);
    expect(artifact.summary).toEqual(
      expect.objectContaining({
        observedEvidenceLinks: 2,
        observedPass: 1,
        observedFail: 1,
        skipped: 1,
      }),
    );
  });

  it('writes the canonical artifact by merging runner results with PULSE_PATH_PROOF_TASKS', () => {
    const rootDir = makeTempRoot();
    const plan = makePlan([makeTask()]);
    const taskPath = path.join(rootDir, PATH_PROOF_TASKS_ARTIFACT);

    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    fs.writeFileSync(taskPath, JSON.stringify(plan, null, 2));

    const artifact = buildPathProofEvidenceArtifact(rootDir, {
      runnerResults: [result(plan.tasks[0].taskId)],
      generatedAt: '2026-04-29T21:03:00.000Z',
    });
    const writtenArtifact = JSON.parse(
      fs.readFileSync(path.join(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT), 'utf8'),
    ) as { artifact: string; summary: { observedEvidenceLinks: number } };

    expect(artifact.summary.observedEvidenceLinks).toBe(1);
    expect(writtenArtifact).toEqual(
      expect.objectContaining({
        artifact: 'PULSE_PATH_PROOF_EVIDENCE',
        summary: expect.objectContaining({ observedEvidenceLinks: 1 }),
      }),
    );
  });
});
