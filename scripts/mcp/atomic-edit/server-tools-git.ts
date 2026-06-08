import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT, resolveAllowedRootForAbsolutePath } from './guard.js';
import { ok, fail } from './server-helpers-result.js';

type GitRemoteAction =
  | 'status'
  | 'stage'
  | 'commit'
  | 'fetch'
  | 'rebase_remote'
  | 'resolve_stage'
  | 'rebase_continue'
  | 'push'
  | 'publish'
  | 'gh_read';

type ConflictStageSide = 'ours' | 'theirs';

interface StepReceipt {
  label: string;
  command: string[];
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stdoutTruncated: boolean;
  stderr: string;
  stderrTruncated: boolean;
  durationMs: number;
}

const SKIP_CI_RE = /\[(?:skip ci|ci skip|skip codacy|codacy skip)\]/i;
const FORBIDDEN_GH_MUTATIONS = new Set([
  'accept',
  'approve',
  'close',
  'comment',
  'create',
  'delete',
  'disable',
  'edit',
  'enable',
  'lock',
  'merge',
  'ready',
  'reopen',
  'review',
  'run',
  'unlock',
]);

function redactSecrets(s: string): string {
  return s
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED_GH_TOKEN]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GH_PAT]')
    .replace(/https:\/\/[^\s/@]+:[^\s/@]+@github\.com/g, 'https://[REDACTED_GIT_CREDENTIALS]@github.com')
    .replace(/https:\/\/[^\s/@]+@github\.com/g, 'https://[REDACTED_GIT_CREDENTIALS]@github.com')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, '[REDACTED_JWT]');
}

function capText(s: string, max = 60000): { text: string; truncated: boolean } {
  const redacted = redactSecrets(s);
  if (redacted.length <= max) return { text: redacted, truncated: false };
  return { text: `${redacted.slice(0, max)}\n...[truncated ${redacted.length - max} chars]`, truncated: true };
}

function appendGitTrace(record: Record<string, unknown>): void {
  try {
    const dir = path.join(REPO_ROOT, '.atomic');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'git-ledger.jsonl'), JSON.stringify(record) + '\n');
  } catch {
    // Ledger write is best-effort and must not hide the real git/gh result.
  }
}

function resolveCwd(input?: string): string {
  const candidate = input ? (path.isAbsolute(input) ? input : path.resolve(REPO_ROOT, input)) : REPO_ROOT;
  const root = resolveAllowedRootForAbsolutePath(candidate);
  if (!root) throw new Error(`atomic_git_remote refused: cwd escapes allowed roots (${candidate})`);
  return candidate;
}

function normalizeRepoPath(raw: string, cwd: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('empty path is not a valid git pathspec');
  if (trimmed.includes('\0')) throw new Error('NUL byte in path is refused');
  if (trimmed.startsWith(':(')) throw new Error(`magic git pathspecs are refused: ${trimmed}`);
  const abs = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(cwd, trimmed);
  const rel = path.relative(REPO_ROOT, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`git path escapes repo root: ${raw}`);
  return rel.split(path.sep).join('/');
}

function normalizedPaths(values: string[] | undefined, cwd: string): string[] {
  if (!values || values.length === 0) return [];
  return [...new Set(values.map((value) => normalizeRepoPath(value, cwd)))];
}

export function gitRemoteArgDenial(args: readonly string[], context: 'git' | 'gh' | 'message' = 'git'): string | null {
  for (const arg of args) {
    if (arg === '--no-verify') return '--no-verify bypasses hooks and is forbidden';
    if (SKIP_CI_RE.test(arg)) return 'CI/Codacy skip tags are forbidden';
    if (context === 'git' && (arg === '--force' || arg === '-f' || arg.startsWith('+'))) {
      return 'force push/refspec is forbidden in atomic_git_remote';
    }
  }
  return null;
}

function assertMessage(message: string | undefined): string {
  const value = (message ?? '').trim();
  if (!value) throw new Error('commit message is required');
  const denial = gitRemoteArgDenial([value], 'message');
  if (denial) throw new Error(denial);
  return value;
}

function methodAfterGhApiArgs(args: readonly string[]): string {
  let method = 'GET';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '-X' || arg === '--method') && args[i + 1]) method = args[i + 1].toUpperCase();
    if (arg.startsWith('-X') && arg.length > 2) method = arg.slice(2).toUpperCase();
    if ((arg === '-f' || arg === '-F' || arg === '--field' || arg === '--raw-field') && method === 'GET') {
      method = 'POST';
    }
  }
  return method;
}

function assertGhReadArgs(args: string[] | undefined): string[] {
  if (!args || args.length === 0) throw new Error('ghArgs is required for gh_read');
  const clean = args.map((arg) => arg.trim()).filter(Boolean);
  if (clean.length === 0) throw new Error('ghArgs cannot be empty');
  const denial = gitRemoteArgDenial(clean, 'gh');
  if (denial) throw new Error(denial);
  const [area, sub] = clean;
  if (area === 'auth' && sub === 'status') return clean;
  if (area === 'repo' && (sub === 'view' || sub === 'list')) return clean;
  if (area === 'pr' && (sub === 'view' || sub === 'checks' || sub === 'status' || sub === 'diff')) return clean;
  if (area === 'run' && (sub === 'view' || sub === 'list')) return clean;
  if (area === 'api') {
    if (methodAfterGhApiArgs(clean) !== 'GET') {
      throw new Error('gh api is read-only here; non-GET methods are refused');
    }
    for (const arg of clean) {
      if (FORBIDDEN_GH_MUTATIONS.has(arg)) throw new Error(`gh mutation verb refused: ${arg}`);
    }
    return clean;
  }
  throw new Error(`gh_read supports only read-only gh commands, got: gh ${clean.join(' ')}`);
}

function commandText(command: string, args: readonly string[]): string[] {
  return [command, ...args.map((arg) => redactSecrets(arg))];
}

function runStep(label: string, command: string, args: string[], cwd: string, timeoutMs: number): StepReceipt {
  const started = Date.now();
  const res = childProcess.spawnSync(command, args, {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  const stdout = capText(String(res.stdout ?? ''));
  const stderr = capText(String(res.stderr ?? ''));
  return {
    label,
    command: commandText(command, args),
    ok: !res.error && res.status === 0,
    exitCode: res.status ?? null,
    signal: res.signal ?? null,
    stdout: stdout.text,
    stdoutTruncated: stdout.truncated,
    stderr: stderr.text,
    stderrTruncated: stderr.truncated,
    durationMs: Date.now() - started,
  };
}

function currentBranch(cwd: string, timeoutMs: number): string {
  const step = runStep('current-branch', 'git', ['branch', '--show-current'], cwd, timeoutMs);
  if (!step.ok) throw new Error(`could not determine current branch: ${step.stderr || step.stdout}`);
  const branch = step.stdout.trim();
  if (!branch || branch === 'HEAD') throw new Error('current checkout is detached; pass branch explicitly');
  return branch;
}

function remoteName(remote: string | undefined): string {
  const value = (remote ?? 'origin').trim();
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) throw new Error(`invalid remote name: ${remote}`);
  return value;
}

function runGitSequence(cwd: string, timeoutMs: number, sequence: { label: string; args: string[] }[]): StepReceipt[] {
  const steps: StepReceipt[] = [];
  for (const item of sequence) {
    const denial = gitRemoteArgDenial(item.args, 'git');
    if (denial) throw new Error(denial);
    const step = runStep(item.label, 'git', item.args, cwd, timeoutMs);
    steps.push(step);
    if (!step.ok) break;
  }
  return steps;
}

function stageSequence(
  cwd: string,
  timeoutMs: number,
  includeAllTracked: boolean,
  paths: string[],
  excludePaths: string[],
): StepReceipt[] {
  const sequence: { label: string; args: string[] }[] = [];
  if (includeAllTracked) sequence.push({ label: 'stage-tracked', args: ['add', '-u'] });
  if (paths.length > 0) sequence.push({ label: 'stage-paths', args: ['add', '--', ...paths] });
  if (excludePaths.length > 0) sequence.push({ label: 'unstage-excluded', args: ['reset', '--', ...excludePaths] });
  sequence.push({ label: 'staged-stat', args: ['diff', '--cached', '--stat'] });
  return runGitSequence(cwd, timeoutMs, sequence);
}

function firstFailed(steps: StepReceipt[]): StepReceipt | null {
  return steps.find((step) => !step.ok) ?? null;
}

function manualStep(label: string, args: string[], okValue: boolean, stdoutValue: string, stderrValue = ''): StepReceipt {
  const stdout = capText(stdoutValue);
  const stderr = capText(stderrValue);
  return {
    label,
    command: commandText('git', args),
    ok: okValue,
    exitCode: okValue ? 0 : 1,
    signal: null,
    stdout: stdout.text,
    stdoutTruncated: stdout.truncated,
    stderr: stderr.text,
    stderrTruncated: stderr.truncated,
    durationMs: 0,
  };
}

function conflictStage(side: ConflictStageSide): ':2' | ':3' {
  return side === 'ours' ? ':2' : ':3';
}

function readGitBlob(cwd: string, timeoutMs: number, spec: string): Buffer | Error {
  const res = childProcess.spawnSync('git', ['show', spec], {
    cwd,
    timeout: timeoutMs,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  if (res.error) return res.error;
  if (res.status !== 0) return new Error(String(res.stderr ?? res.stdout ?? `git show ${spec} failed`));
  return Buffer.isBuffer(res.stdout) ? res.stdout : Buffer.from(String(res.stdout ?? ''), 'utf8');
}

function resolveStageSequence(cwd: string, timeoutMs: number, side: ConflictStageSide, paths: string[]): StepReceipt[] {
  if (paths.length === 0) throw new Error('paths is required for resolve_stage');
  const steps: StepReceipt[] = [];
  const stage = conflictStage(side);
  for (const rel of paths) {
    const unmerged = runStep(`check-unmerged:${rel}`, 'git', ['ls-files', '-u', '--', rel], cwd, timeoutMs);
    steps.push(unmerged);
    if (!unmerged.ok) break;
    if (!unmerged.stdout.trim()) {
      steps.push(manualStep(`resolve-${side}:${rel}`, ['show', `${stage}:${rel}`], false, '', `path is not currently unmerged: ${rel}`));
      break;
    }
    const blob = readGitBlob(cwd, timeoutMs, `${stage}:${rel}`);
    if (blob instanceof Error) {
      steps.push(manualStep(`resolve-${side}:${rel}`, ['show', `${stage}:${rel}`], false, '', blob.message));
      break;
    }
    fs.writeFileSync(path.join(REPO_ROOT, rel), blob);
    steps.push(manualStep(`resolve-${side}:${rel}`, ['show', `${stage}:${rel}`], true, `wrote ${blob.length} byte(s) from ${stage}:${rel}`));
  }
  if (!firstFailed(steps)) steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'stage-resolved', args: ['add', '--', ...paths] }]));
  return steps;
}

export function registerToolsGit(server: McpServer): void {
  server.registerTool(
    'atomic_git_remote',
    {
      title: 'Governed git commit, sync, push, and GitHub read operations',
      description:
        'Runs structured git/gh publication actions that atomic_exec intentionally refuses. It never uses shell strings; refuses --no-verify, skip-ci tags, force push/refspecs, and mutating gh commands; and writes a redacted .atomic/git-ledger.jsonl receipt.',
      inputSchema: {
        action: z.enum([
          'status',
          'stage',
          'commit',
          'fetch',
          'rebase_remote',
          'resolve_stage',
          'rebase_continue',
          'push',
          'publish',
          'gh_read',
        ]),
        cwd: z.string().optional(),
        includeAllTracked: z.boolean().optional(),
        paths: z.array(z.string().min(1)).max(1000).optional(),
        excludePaths: z.array(z.string().min(1)).max(1000).optional(),
        message: z.string().optional(),
        remote: z.string().optional(),
        branch: z.string().optional(),
        ghArgs: z.array(z.string().min(1)).max(100).optional(),
        stageSide: z.enum(['ours', 'theirs']).optional(),
        timeoutMs: z.number().int().min(1000).max(1200000).optional(),
        intent: z.string().optional(),
      },
    },
    async (a) => {
      const startedAt = Date.now();
      const steps: StepReceipt[] = [];
      try {
        const cwd = resolveCwd(a.cwd);
        const timeoutMs = a.timeoutMs ?? 300000;
        const action = a.action as GitRemoteAction;
        const paths = normalizedPaths(a.paths, cwd);
        const excludePaths = normalizedPaths(a.excludePaths, cwd);
        const remote = remoteName(a.remote);
        const needsBranch = ['fetch', 'rebase_remote', 'push', 'publish'].includes(action);
        const branch = a.branch?.trim() || (needsBranch ? currentBranch(cwd, timeoutMs) : undefined);
        if (action === 'status') {
          steps.push(
            ...runGitSequence(cwd, timeoutMs, [
              { label: 'status', args: ['status', '-sb', '--ignored=no'] },
              { label: 'cached-stat', args: ['diff', '--cached', '--stat'] },
              { label: 'head', args: ['rev-parse', 'HEAD'] },
            ]),
          );
        } else if (action === 'stage') {
          steps.push(...stageSequence(cwd, timeoutMs, Boolean(a.includeAllTracked), paths, excludePaths));
        } else if (action === 'commit') {
          steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'commit', args: ['commit', '-m', assertMessage(a.message)] }]));
        } else if (action === 'fetch') {
          if (!branch) throw new Error('branch is required for fetch');
          steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'fetch', args: ['fetch', remote, branch] }]));
        } else if (action === 'rebase_remote') {
          if (!branch) throw new Error('branch is required for rebase_remote');
          steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'rebase-remote', args: ['rebase', `${remote}/${branch}`] }]));
        } else if (action === 'resolve_stage') {
          steps.push(...resolveStageSequence(cwd, timeoutMs, (a.stageSide ?? 'ours') as ConflictStageSide, paths));
        } else if (action === 'rebase_continue') {
          steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'rebase-continue', args: ['-c', 'core.editor=true', 'rebase', '--continue'] }]));
        } else if (action === 'push') {
          if (!branch) throw new Error('branch is required for push');
          steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'push', args: ['push', '-u', remote, branch] }]));
        } else if (action === 'publish') {
          if (!branch) throw new Error('branch is required for publish');
          const message = assertMessage(a.message);
          steps.push(...stageSequence(cwd, timeoutMs, Boolean(a.includeAllTracked), paths, excludePaths));
          if (!firstFailed(steps)) steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'commit', args: ['commit', '-m', message] }]));
          if (!firstFailed(steps)) steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'fetch', args: ['fetch', remote, branch] }]));
          if (!firstFailed(steps)) steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'rebase-remote', args: ['rebase', `${remote}/${branch}`] }]));
          if (!firstFailed(steps)) steps.push(...runGitSequence(cwd, timeoutMs, [{ label: 'push', args: ['push', '-u', remote, branch] }]));
        } else if (action === 'gh_read') {
          steps.push(runStep('gh-read', 'gh', assertGhReadArgs(a.ghArgs), cwd, timeoutMs));
        } else {
          throw new Error(`unknown atomic_git_remote action: ${String(action)}`);
        }
        const failed = firstFailed(steps);
        const receipt = {
          ok: failed === null,
          action,
          cwd,
          intent: a.intent ?? null,
          durationMs: Date.now() - startedAt,
          remote,
          branch: branch ?? null,
          steps,
          failedStep: failed?.label ?? null,
          guarded: {
            structuredArgvOnly: true,
            noShell: true,
            noNoVerify: true,
            noSkipCiTags: true,
            noForcePush: true,
            ghReadOnly: action === 'gh_read',
          },
        };
        appendGitTrace({ ts: startedAt, ...receipt });
        return ok(receipt);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        appendGitTrace({ ts: startedAt, kind: 'atomic_git_remote-refused', ok: false, error: message, durationMs: Date.now() - startedAt, steps });
        return fail(message);
      }
    },
  );
}
