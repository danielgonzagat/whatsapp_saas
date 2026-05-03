import type { PathProofTask } from '../../path-proof-runner';
import type {
  PathProofCommandPolicyDecision,
  ParsedPathProofCommand,
} from '../../path-proof-execution-runner';
import {
  isProtectedFile as isGovernanceProtectedFile,
  loadGovernanceBoundary,
  normalizePath,
} from '../../scope-state-classify';

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

const DEFAULT_ALLOWED_COMMAND_PREFIXES: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(['node', 'scripts/pulse/run.js']),
]);

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
