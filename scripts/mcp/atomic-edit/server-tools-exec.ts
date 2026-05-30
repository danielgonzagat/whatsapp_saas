/**
 * server-tools-exec — the universal computational-action operator for the
 * atomic OS. Closes the last gap in "atomic does every executable action":
 * arbitrary shell / git / gh / npm, wrapped in the SAME atomic envelope as
 * every byte-mutation op — fixed invariant LAWS (never bypass, never destroy,
 * never fake success, always trace), dynamic everything-else.
 *
 * Envelope (ALWAYS): repo-root cwd containment guard (reuses guard.ts allowed
 * roots, so registered git worktrees are in-scope), an invariant command
 * denylist (no `git restore`, no `--no-verify`, no skip-ci/codacy tags, no
 * `prisma db push`, no force-push, no disk/auditor destroyers), a trace receipt
 * to .atomic/exec-ledger.jsonl, secret redaction on every returned/traced
 * surface, and a hard timeout.
 *
 * Envelope (OPT-IN): a non-destructive `git stash create` snapshot before the
 * run with rollback-on-nonzero, for risky mutations.
 *
 * Honest scope: a shell can do anything, so full rollback is NOT promised — the
 * promise is guard + trace + timeout + redaction ALWAYS, plus a git
 * snapshot/rollback handle on request. Run mutations inside an isolated git
 * worktree to get true reversibility from git itself.
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT, resolveAllowedRootForAbsolutePath } from './guard.js';
import { ok, fail } from './server-helpers-result.js';

interface GuardVerdict {
  allowed: boolean;
  reason?: string;
}

/** Invariant LAWS — fixed, never bypassed. Mirrors the hard prohibitions in CLAUDE.md. */
const FORBIDDEN: { re: RegExp; reason: string }[] = [
  {
    re: /\bgit\s+restore\b/,
    reason:
      'git restore is absolutely forbidden in this repo — it can silently destroy uncommitted work. Restore from an explicit snapshot (git checkout <ref> -- <path>) or stop.',
  },
  { re: /--no-verify\b/, reason: '--no-verify bypasses husky/commit gates (forbidden by CLAUDE.md).' },
  { re: /\[(?:skip ci|ci skip|skip codacy|codacy skip)\]/i, reason: 'CI/Codacy skip tags are forbidden bypasses.' },
  { re: /\bprisma\s+db\s+push\b/, reason: 'prisma db push is forbidden in this repo (CI/Docker/automation).' },
  {
    re: /\bgit\s+push\b[^\n]*--force(?!-with-lease)/,
    reason: 'plain --force push is forbidden; use --force-with-lease and never to a protected branch.',
  },
  { re: /\bgit\s+push\b[^\n]*\s-f(?:\s|$)/, reason: 'force push (-f) is forbidden; use --force-with-lease.' },
  { re: /\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/(?:\s|$)|~|\$HOME|\*)/, reason: 'recursive remove of a root/home/glob path refused.' },
  { re: /\bmkfs\b|\bdd\s+if=|>\s*\/dev\/(?:sd|nvme|disk)/, reason: 'disk-destructive command refused.' },
  { re: /:\s*\(\s*\)\s*\{[^}]*\}\s*;\s*:/, reason: 'fork bomb refused.' },
  {
    re: /(?:chmod|chflags|mv|rm|cp|tee|>>?)\s*[^\n]*no-hardcoded-reality-audit/,
    reason: 'the locked PULSE auditor (no-hardcoded-reality-audit.ts) must not be moved/chmod/overwritten.',
  },
];

function guardCommand(cmd: string): GuardVerdict {
  const c = cmd.trim();
  if (!c) return { allowed: false, reason: 'empty command' };
  for (const f of FORBIDDEN) {
    if (f.re.test(c)) return { allowed: false, reason: f.reason };
  }
  return { allowed: true };
}

/** Never let a credential leave the process via stdout/stderr/trace. */
function redactSecrets(s: string): string {
  return s
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED_GH_TOKEN]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GH_PAT]')
    .replace(/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, '[REDACTED_STRIPE_KEY]')
    .replace(/whsec_[A-Za-z0-9]{8,}/g, '[REDACTED_WEBHOOK_SECRET]')
    .replace(/xox[baprs]-[A-Za-z0-9-]{8,}/g, '[REDACTED_SLACK_TOKEN]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, '[REDACTED_JWT]');
}

function capText(s: string, max = 60000): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max) + `\n…[truncated ${s.length - max} chars]`, truncated: true };
}

function resolveCwd(input?: string): string {
  const candidate = input
    ? path.isAbsolute(input)
      ? input
      : path.resolve(REPO_ROOT, input)
    : REPO_ROOT;
  const root = resolveAllowedRootForAbsolutePath(candidate);
  if (!root) {
    throw new Error(`atomic_exec refused: cwd escapes allowed roots (${candidate}). Allowed = repo root + registered git worktrees.`);
  }
  return candidate;
}

function tryGit(cwd: string, args: string[]): string | null {
  try {
    return childProcess
      .execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim();
  } catch {
    return null;
  }
}

interface GitSnapshot {
  headSha: string | null;
  stashSha: string | null;
  dirtyFiles: number;
}

function gitSnapshot(cwd: string): GitSnapshot {
  const headSha = tryGit(cwd, ['rev-parse', 'HEAD']);
  const status = tryGit(cwd, ['status', '--porcelain']);
  const dirtyFiles = status ? status.split('\n').filter((l) => l.trim().length > 0).length : 0;
  // `git stash create` builds a commit object capturing the dirty tree WITHOUT
  // touching the working tree or the stash list — a pure, non-destructive snapshot.
  const stashSha = dirtyFiles > 0 ? tryGit(cwd, ['stash', 'create', 'atomic_exec snapshot']) : null;
  return { headSha, stashSha, dirtyFiles: dirtyFiles };
}

function appendTrace(record: Record<string, unknown>): void {
  try {
    const dir = path.join(REPO_ROOT, '.atomic');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'exec-ledger.jsonl'), JSON.stringify(record) + '\n');
  } catch {
    /* trace is best-effort: never let a logging failure abort the op */
  }
}

export function registerToolsExec(server: McpServer): void {
  server.registerTool(
    'atomic_exec',
    {
      title: 'Run a shell/git/gh/npm command inside the atomic envelope',
      description:
        'The universal computational-action operator: runs an arbitrary command line via /bin/bash -c, ' +
        'wrapped in the atomic envelope — cwd containment guard (repo root + registered git worktrees), an ' +
        'invariant denylist (refuses git restore, --no-verify, skip-ci/codacy tags, prisma db push, ' +
        'force-push, disk/auditor destroyers), a trace receipt to .atomic/exec-ledger.jsonl, secret ' +
        'redaction on every returned/traced surface, and a hard timeout. Returns the REAL exit code (never ' +
        'fakes success): a non-zero exit comes back as {ok:false, exitCode, stdout, stderr}. Optional opt-in ' +
        'snapshot:true takes a non-destructive `git stash create` restore point; rollbackOnNonZero:true ' +
        'restores it if the command fails. Use this instead of the banned built-in Bash for git/gh/npm/test ' +
        'orchestration; run mutations inside an isolated worktree for true git-backed reversibility.',
      inputSchema: {
        command: z.string().min(1).describe('shell command line, executed via /bin/bash -c'),
        cwd: z
          .string()
          .optional()
          .describe('working directory (default: repo root); must resolve inside an allowed root / git worktree'),
        timeoutMs: z.number().int().min(1000).max(600000).optional().describe('hard timeout in ms (default 120000)'),
        stdin: z.string().optional().describe('data piped to the command stdin'),
        env: z
          .record(z.string(), z.string())
          .optional()
          .describe('extra env vars merged over process.env (values are redacted from the trace)'),
        intent: z.string().optional().describe('one-line product intent, recorded in the trace'),
        snapshot: z
          .boolean()
          .optional()
          .describe('take a non-destructive git stash snapshot before running, for rollback (default false)'),
        rollbackOnNonZero: z
          .boolean()
          .optional()
          .describe('if a snapshot was taken and exit≠0, restore the working tree from it'),
      },
    },
    async (a) => {
      const startedAt = Date.now();
      try {
        const cwd = resolveCwd(a.cwd);
        const verdict = guardCommand(a.command);
        if (!verdict.allowed) {
          appendTrace({ ts: startedAt, kind: 'refused', reason: verdict.reason, command: redactSecrets(a.command), cwd });
          return fail(`atomic_exec refused (invariant law): ${verdict.reason}`);
        }

        const snap = a.snapshot ? gitSnapshot(cwd) : null;
        const timeout = a.timeoutMs ?? 120000;
        const res = childProcess.spawnSync('/bin/bash', ['-c', a.command], {
          cwd,
          timeout,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          env: { ...process.env, ...(a.env ?? {}) },
          ...(a.stdin !== undefined ? { input: a.stdin } : {}),
        });
        const durationMs = Date.now() - startedAt;

        if (res.error) {
          const err = res.error as NodeJS.ErrnoException;
          const timedOut = err.code === 'ETIMEDOUT' || res.signal === 'SIGTERM';
          appendTrace({
            ts: startedAt,
            kind: timedOut ? 'timeout' : 'spawn-error',
            command: redactSecrets(a.command),
            cwd,
            durationMs,
            error: redactSecrets(err.message),
          });
          return fail(
            `atomic_exec ${timedOut ? `timed out after ${timeout}ms` : 'failed to spawn'}: ${redactSecrets(err.message)}`,
          );
        }

        const exitCode = res.status;
        const stdout = capText(redactSecrets(res.stdout ?? ''));
        const stderr = capText(redactSecrets(res.stderr ?? ''));

        let rolledBack = false;
        if (snap && snap.stashSha && exitCode !== 0 && a.rollbackOnNonZero) {
          try {
            childProcess.execFileSync('git', ['-C', cwd, 'checkout', snap.stashSha, '--', '.'], { stdio: 'ignore' });
            rolledBack = true;
          } catch {
            rolledBack = false;
          }
        }

        appendTrace({
          ts: startedAt,
          kind: 'exec',
          intent: a.intent ?? null,
          command: redactSecrets(a.command),
          cwd,
          exitCode,
          signal: res.signal ?? null,
          durationMs,
          snapshot: snap,
          rolledBack,
        });

        return ok({
          ok: exitCode === 0,
          exitCode,
          signal: res.signal ?? null,
          durationMs,
          cwd,
          intent: a.intent ?? null,
          command: redactSecrets(a.command),
          stdout: stdout.text,
          stdoutTruncated: stdout.truncated,
          stderr: stderr.text,
          stderrTruncated: stderr.truncated,
          snapshot: snap,
          rolledBack,
          atomicEnvelope: {
            guarded: true,
            traced: true,
            redacted: true,
            snapshot: Boolean(snap),
            rollbackOnNonZero: Boolean(a.rollbackOnNonZero),
          },
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
