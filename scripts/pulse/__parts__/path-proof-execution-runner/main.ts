import { spawnSync } from 'node:child_process';

import type { PathProofTask } from '../../path-proof-runner';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath,
} from '../../scope-state-classify';
import { evaluatePathProofCommandPolicy } from './command-policy';

export type PathProofExecutionStatus =
  | 'observed_pass'
  | 'observed_fail'
  | 'execution_skipped'
  | 'planned_only';

export interface ParsedPathProofCommand {
  executable: string;
  args: string[];
  displayCommand: string;
}

export interface PathProofCommandExecutionInput extends ParsedPathProofCommand {
  cwd: string;
  timeoutMs: number;
  task: PathProofTask;
}

export interface PathProofCommandExecutionOutput {
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
}

export type PathProofCommandExecutor = (
  input: PathProofCommandExecutionInput,
) => PathProofCommandExecutionOutput | Promise<PathProofCommandExecutionOutput>;

export interface ExecutePathProofPlanOptions {
  cwd?: string;
  timeoutMs?: number;
  maxTasks?: number;
  allowedCommandPrefixes?: readonly (readonly string[])[];
  executor?: PathProofCommandExecutor;
  generatedAt?: string;
}

export interface PathProofExecutionResult {
  taskId: string;
  pathId: string;
  command: string;
  status: PathProofExecutionStatus;
  executed: boolean;
  coverageCountsAsObserved: boolean;
  exitCode: number | null;
  reason: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
}

export interface PathProofExecutionRun {
  generatedAt: string;
  summary: {
    totalTasks: number;
    attemptedTasks: number;
    observedPass: number;
    observedFail: number;
    executionSkipped: number;
    plannedOnly: number;
    observedTasks: number;
  };
  results: PathProofExecutionResult[];
}

export interface PathProofCommandPolicyDecision {
  allowed: boolean;
  reason: string;
  parsed: ParsedPathProofCommand | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TASKS = 25;

const DEFAULT_ALLOWED_COMMAND_PREFIXES: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(['node', 'scripts/pulse/run.js']),
]);

function defaultExecutor(input: PathProofCommandExecutionInput): PathProofCommandExecutionOutput {
  const result = spawnSync(input.executable, input.args, {
    cwd: input.cwd,
    encoding: 'utf8',
    shell: false,
    timeout: input.timeoutMs,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || undefined,
    stderr: result.stderr || result.error?.message,
    timedOut: result.error?.message.includes('ETIMEDOUT') ?? false,
  };
}

function buildSkippedResult(
  task: PathProofTask,
  status: PathProofExecutionStatus,
  reason: string,
): PathProofExecutionResult {
  return {
    taskId: task.taskId,
    pathId: task.pathId,
    command: task.command,
    status,
    executed: false,
    coverageCountsAsObserved: false,
    exitCode: null,
    reason,
  };
}

export async function executePathProofPlan(
  plan: import('../../path-proof-runner').PathProofPlan,
  options: ExecutePathProofPlanOptions = {},
): Promise<PathProofExecutionRun> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
  const allowedCommandPrefixes = options.allowedCommandPrefixes ?? DEFAULT_ALLOWED_COMMAND_PREFIXES;
  const executor = options.executor ?? defaultExecutor;
  const results: PathProofExecutionResult[] = [];
  let attemptedTasks = 0;

  for (const task of plan.tasks) {
    if (attemptedTasks >= maxTasks) {
      results.push(
        buildSkippedResult(
          task,
          'planned_only',
          `Execution budget exhausted after ${maxTasks} attempted task(s).`,
        ),
      );
      continue;
    }

    const policy = evaluatePathProofCommandPolicy(task, allowedCommandPrefixes, cwd);
    if (!policy.allowed || !policy.parsed) {
      results.push(buildSkippedResult(task, 'execution_skipped', policy.reason));
      continue;
    }

    attemptedTasks += 1;
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    try {
      const execution = await executor({ ...policy.parsed, cwd, timeoutMs, task });
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      const status: PathProofExecutionStatus =
        execution.exitCode === 0 ? 'observed_pass' : 'observed_fail';
      results.push({
        taskId: task.taskId,
        pathId: task.pathId,
        command: policy.parsed.displayCommand,
        status,
        executed: true,
        coverageCountsAsObserved: true,
        exitCode: execution.exitCode,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAtMs - startedAtMs),
        reason: execution.timedOut
          ? `Command timed out after ${timeoutMs}ms.`
          : `Command exited with code ${execution.exitCode ?? 'unknown'}.`,
        stdout: execution.stdout,
        stderr: execution.stderr,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      results.push({
        taskId: task.taskId,
        pathId: task.pathId,
        command: policy.parsed.displayCommand,
        status: 'observed_fail',
        executed: true,
        coverageCountsAsObserved: true,
        exitCode: null,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAtMs - startedAtMs),
        reason: `Executor threw before producing an exit code: ${message}`,
      });
    }
  }

  const observedPass = results.filter((result) => result.status === 'observed_pass').length;
  const observedFail = results.filter((result) => result.status === 'observed_fail').length;
  const executionSkipped = results.filter((result) => result.status === 'execution_skipped').length;
  const plannedOnly = results.filter((result) => result.status === 'planned_only').length;

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summary: {
      totalTasks: plan.tasks.length,
      attemptedTasks,
      observedPass,
      observedFail,
      executionSkipped,
      plannedOnly,
      observedTasks: observedPass + observedFail,
    },
    results,
  };
}
