import { spawnSync } from 'node:child_process';

import type { PathProofPlan, PathProofTask } from './path-proof-runner';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath,
} from './scope-state-classify';

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

const SHELL_TOKENIZER_CONTROL_KERNEL_GRAMMAR_CHARS = ';&|<>`$';

const COMMAND_SAFETY_KERNEL_GRAMMAR_BLOCKED_EXECUTABLES = new Set([
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

const COMMAND_SAFETY_KERNEL_GRAMMAR_BLOCKED_TOKENS = new Set([
  '--force',
  '-f',
  'reset',
  'restore',
  'checkout',
  'clean',
  'rebase',
  'push',
  'drop',
  'truncate',
  'delete',
  'destroy',
  'prisma:migrate:reset',
  'migrate:reset',
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
    if (char.trim().length === 0 && quote === null) {
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

function shellTokenizerGrammarHasControlSyntax(command: string): boolean {
  for (const char of command) {
    if (SHELL_TOKENIZER_CONTROL_KERNEL_GRAMMAR_CHARS.includes(char)) {
      return true;
    }
  }
  return false;
}

function commandTokenPathCandidates(value: string): string[] {
  return value
    .split('=')
    .flatMap((part) => part.split(','))
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
}

function loadGovernanceBoundaryForPolicy(
  rootDir: string,
): ReturnType<typeof loadGovernanceBoundary> {
  try {
    return loadGovernanceBoundary(rootDir);
  } catch {
    return loadGovernanceBoundary(process.cwd());
  }
}

function touchesGovernancePath(value: string | null | undefined, rootDir: string): boolean {
  if (!value) {
    return false;
  }
  const boundary = loadGovernanceBoundaryForPolicy(rootDir);
  return commandTokenPathCandidates(value).some((candidate) =>
    isGovernanceProtectedFile(normalizePath(candidate), boundary),
  );
}

function taskTouchesGovernance(task: PathProofTask, rootDir: string): boolean {
  return [
    task.entrypoint.filePath,
    task.breakpoint?.filePath,
    ...task.artifactLinks.map((link) => link.artifactPath),
  ].some((value) => touchesGovernancePath(value, rootDir));
}

function tokenTouchesGovernance(tokens: readonly string[], rootDir: string): boolean {
  return tokens.some((token) => touchesGovernancePath(token, rootDir));
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
  if (COMMAND_SAFETY_KERNEL_GRAMMAR_BLOCKED_EXECUTABLES.has(executable.toLowerCase())) {
    return true;
  }
  return tokens.some((token) =>
    COMMAND_SAFETY_KERNEL_GRAMMAR_BLOCKED_TOKENS.has(token.toLowerCase()),
  );
}

export function evaluatePathProofCommandPolicy(
  task: PathProofTask,
  allowedCommandPrefixes: readonly (readonly string[])[] = DEFAULT_ALLOWED_COMMAND_PREFIXES,
  rootDir = process.cwd(),
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
  if (taskTouchesGovernance(task, rootDir)) {
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
  if (
    shellTokenizerGrammarHasControlSyntax(displayCommand) ||
    displayCommand.includes('\r') ||
    displayCommand.includes('\n')
  ) {
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
  if (tokenTouchesGovernance(tokens, rootDir)) {
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
