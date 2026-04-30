import { spawnSync } from 'node:child_process';

import type { PathProofPlan, PathProofTask } from './path-proof-runner';

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

const GOVERNANCE_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  /(^|\/)\.github(\/|$)/i,
  /(^|\/)ops(\/|$)/i,
  /(^|\/)scripts\/ops(\/|$)/i,
  /(^|\/)AGENTS\.md$/i,
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)CODEX\.md$/i,
  /(^|\/)package\.json$/i,
  /(^|\/)\.codacy\.yml$/i,
  /(^|\/)\.husky\/pre-push$/i,
]);

const SHELL_CONTROL_PATTERN = /[;&|<>`$]/;

const DESTRUCTIVE_EXECUTABLES = new Set([
  'rm',
  'rmdir',
  'mv',
  'git',
  'sed',
  'perl',
  'python',
  'python3',
  'psql',
  'mysql',
  'mongosh',
]);

const DESTRUCTIVE_TOKEN_PATTERNS: readonly RegExp[] = Object.freeze([
  /^--force$/,
  /^-f$/,
  /^reset$/i,
  /^restore$/i,
  /^checkout$/i,
  /^clean$/i,
  /^rebase$/i,
  /^push$/i,
  /^drop$/i,
  /^truncate$/i,
  /^delete$/i,
  /^destroy$/i,
  /^prisma:migrate:reset$/i,
  /^migrate:reset$/i,
]);

function stripShellComment(command: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === '#' && quote === null) {
      return command.slice(0, index).trim();
    }
  }
  return command.trim();
}

function tokenizeCommand(command: string): string[] | null {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && quote === null) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (quote !== null) {
    return null;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function touchesGovernancePath(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const candidates = value.split(/[=,]/).map((candidate) => candidate.trim());
  return candidates.some((candidate) =>
    GOVERNANCE_PATH_PATTERNS.some((pattern) => pattern.test(candidate)),
  );
}

function taskTouchesGovernance(task: PathProofTask): boolean {
  return [
    task.entrypoint.filePath,
    task.breakpoint?.filePath,
    ...task.artifactLinks.map((link) => link.artifactPath),
  ].some(touchesGovernancePath);
}

function tokenTouchesGovernance(tokens: readonly string[]): boolean {
  return tokens.some(touchesGovernancePath);
}

function hasAllowedPrefix(
  tokens: readonly string[],
  allowedPrefixes: readonly (readonly string[])[],
): boolean {
  return allowedPrefixes.some((prefix) => {
    if (prefix.length === 0 || tokens.length < prefix.length) {
      return false;
    }
    return prefix.every((token, index) => tokens[index] === token);
  });
}

function isDestructiveCommand(tokens: readonly string[]): boolean {
  const executable = tokens[0];
  if (!executable) {
    return false;
  }
  if (DESTRUCTIVE_EXECUTABLES.has(executable)) {
    return true;
  }
  return tokens.some((token) => DESTRUCTIVE_TOKEN_PATTERNS.some((pattern) => pattern.test(token)));
}

export function evaluatePathProofCommandPolicy(
  task: PathProofTask,
  allowedCommandPrefixes: readonly (readonly string[])[] = DEFAULT_ALLOWED_COMMAND_PREFIXES,
): PathProofCommandPolicyDecision {
  if (!task.autonomousExecutionAllowed) {
    return {
      allowed: false,
      reason: 'Task is not explicitly marked autonomousExecutionAllowed.',
      parsed: null,
    };
  }
  if (task.mode === 'human_required' || task.mode === 'not_executable') {
    return {
      allowed: false,
      reason: `Task mode ${task.mode} cannot be executed autonomously.`,
      parsed: null,
    };
  }
  if (taskTouchesGovernance(task)) {
    return {
      allowed: false,
      reason: 'Task references protected governance or infrastructure paths.',
      parsed: null,
    };
  }

  const displayCommand = stripShellComment(task.command);
  if (displayCommand.length === 0) {
    return { allowed: false, reason: 'Task has no command to execute.', parsed: null };
  }
  if (SHELL_CONTROL_PATTERN.test(displayCommand) || /[\r\n]/.test(displayCommand)) {
    return {
      allowed: false,
      reason: 'Command contains shell control syntax and must not be executed.',
      parsed: null,
    };
  }

  const tokens = tokenizeCommand(displayCommand);
  if (!tokens || tokens.length === 0) {
    return { allowed: false, reason: 'Command could not be parsed safely.', parsed: null };
  }
  if (!hasAllowedPrefix(tokens, allowedCommandPrefixes)) {
    return { allowed: false, reason: 'Command is not in the autonomous allowlist.', parsed: null };
  }
  if (tokenTouchesGovernance(tokens)) {
    return {
      allowed: false,
      reason: 'Command references protected governance or infrastructure paths.',
      parsed: null,
    };
  }
  if (isDestructiveCommand(tokens)) {
    return {
      allowed: false,
      reason: 'Command contains destructive git, filesystem, database, or force tokens.',
      parsed: null,
    };
  }

  const [executable, ...args] = tokens;
  return {
    allowed: true,
    reason: 'Command passed autonomous path-proof execution policy.',
    parsed: { executable, args, displayCommand },
  };
}

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
  plan: PathProofPlan,
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

    const policy = evaluatePathProofCommandPolicy(task, allowedCommandPrefixes);
    if (!policy.allowed || !policy.parsed) {
      results.push(buildSkippedResult(task, 'execution_skipped', policy.reason));
      continue;
    }

    attemptedTasks += 1;
    try {
      const execution = await executor({ ...policy.parsed, cwd, timeoutMs, task });
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
        reason: execution.timedOut
          ? `Command timed out after ${timeoutMs}ms.`
          : `Command exited with code ${execution.exitCode ?? 'unknown'}.`,
        stdout: execution.stdout,
        stderr: execution.stderr,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        taskId: task.taskId,
        pathId: task.pathId,
        command: policy.parsed.displayCommand,
        status: 'observed_fail',
        executed: true,
        coverageCountsAsObserved: true,
        exitCode: null,
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
