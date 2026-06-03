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
 * Envelope (STRICT): every command is classified. A small allowlist of read-only
 * commands may run with trace-only receipts; every mutable-or-unknown command
 * requires proveEffect:true before it is spawned. rollbackOnNonZero is recovery
 * after proof, never admission. Known
 * network/database/provider/remote-host/package/runtime-control commands are
 * external-or-host-effect and refused before spawn, because a filesystem snapshot
 * cannot prove those effects. The byte-effect snapshot must be complete, or the
 * action is UNJUDGED and refused.
 *
 * Honest scope: on hosts with sandbox-exec, spawned commands run under a deny-by-default
 * OS sandbox. Trace-only commands get no file-write capability; byte-effect-proven
 * commands get write access only to cwd, with TMPDIR/TMP/TEMP forced to cwd so temp
 * bytes stay inside the captured effect root. When the whole Claude/Codex host is already
 * inside the atomic host sandbox, nested sandbox-exec is impossible on macOS, so every
 * command is delegated to the out-of-sandbox broker (atomic-exec-broker.mjs), which
 * re-applies a fresh per-command sandbox-exec (network denied, writes confined to cwd) —
 * host mode is therefore byte-for-byte as contained as non-host mode, and fails closed
 * if the broker socket is absent. On hosts without any sandbox, commands fail closed.
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT, resolveAllowedRootForAbsolutePath, isProtectedRelative } from './guard.js';
import { ok, fail } from './server-helpers-result.js';
import {
  assertCompleteEffectSnapshot,
  captureEffectSnapshot,
  diffEffect,
  rollbackEffect,
  type EffectSnapshot,
  type FileEffect,
} from './server-helpers-effect.js';

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
  {
    re: /--no-verify\b/,
    reason: '--no-verify bypasses husky/commit gates (forbidden by CLAUDE.md).',
  },
  {
    re: /\[(?:skip ci|ci skip|skip codacy|codacy skip)\]/i,
    reason: 'CI/Codacy skip tags are forbidden bypasses.',
  },
  {
    re: /\bprisma\s+db\s+push\b/,
    reason: 'prisma db push is forbidden in this repo (CI/Docker/automation).',
  },
  {
    re: /\bgit\s+push\b[^\n]*--force(?!-with-lease)/,
    reason:
      'plain --force push is forbidden; use --force-with-lease and never to a protected branch.',
  },
  {
    re: /\bgit\s+push\b[^\n]*\s-f(?:\s|$)/,
    reason: 'force push (-f) is forbidden; use --force-with-lease.',
  },
  {
    re: /\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/(?:\s|$)|~|\$HOME|\*)/,
    reason: 'recursive remove of a root/home/glob path refused.',
  },
  {
    re: /\bmkfs\b|\bdd\s+if=|>\s*\/dev\/(?:sd|nvme|disk)/,
    reason: 'disk-destructive command refused.',
  },
  { re: /:\s*\(\s*\)\s*\{[^}]*\}\s*;\s*:/, reason: 'fork bomb refused.' },
  {
    re: /(?:chmod|chflags|mv|rm|cp|tee|>>?)\s*[^\n]*no-hardcoded-reality-audit/,
    reason:
      'the locked PULSE auditor (no-hardcoded-reality-audit.ts) must not be moved/chmod/overwritten.',
  },
  // Catchable evasions surfaced by the closeout audit. A flat regex over a
  // `/bin/bash -c` string is best-effort DEFENSE-IN-DEPTH, NOT a boundary —
  // env-var/eval/alias indirection can still hide a banned verb. Run risky
  // mutations inside an isolated git worktree for real reversibility.
  {
    re: /\bgit\s+push\b[^\n]*\s\+[^\s:]+(?::|\s|$)/,
    reason:
      'plus-refspec force-push (git push ... +ref) is forbidden; use --force-with-lease, never to a protected branch.',
  },
  {
    re: /\bfind\b[^|]*\s-delete\b/,
    reason: 'find ... -delete is a mass-delete; refused (use the atomic delete tool).',
  },
  {
    re: /\|\s*(?:sh|bash|zsh|dash)\b/,
    reason: 'piping into a shell (| sh/bash) hides the real command from the denylist; refused.',
  },
  {
    re: /\bgit\s+config\b[^\n]*\balias\./,
    reason: 'defining a git alias can smuggle a banned verb (restore / push --force); refused.',
  },
  {
    re: /\brm\b[^|;&]*\s--recursive\b/,
    reason: 'rm --recursive (long-form) is refused; use the atomic delete tool.',
  },
];

/**
 * Heuristic scan for a shell command that WRITES to a governance-protected file
 * (CLAUDE.md, eslint configs, .husky/pre-push, ai-models.ts, …). The byte-edit
 * tools enforce the protected set via resolveSafeTarget; the shell operator must
 * not be a hole around it. Extracts likely write targets from redirections, tee,
 * dd of=, and the dest arg of sed -i / cp / mv / install / truncate, then checks
 * each against isProtectedRelative. Best-effort (a shell can obfuscate), so it is
 * defense-in-depth, not a guarantee.
 */
function protectedWriteTarget(cmd: string): string | null {
  const candidates: string[] = [];
  for (const m of cmd.matchAll(/>>?\s*["']?([^\s"'|;&<>]+)/g)) candidates.push(m[1]);
  for (const m of cmd.matchAll(/\btee\b\s+(?:-\S+\s+)*["']?([^\s"'|;&]+)/g)) candidates.push(m[1]);
  for (const m of cmd.matchAll(/\bof=["']?([^\s"';|&]+)/g)) candidates.push(m[1]);

  const sed = cmd.match(/\bsed\b([^|;&]*)/);
  if (sed && /(?:^|\s)(?:-[^\s]*i[^\s]*|--in-place(?:=|\s|$))/.test(sed[1])) {
    const args = sed[1]
      .split(/\s+/)
      .filter((a) => a && !a.startsWith('-') && !a.includes('=') && a !== "''" && a !== '""');
    if (args.length) candidates.push(args[args.length - 1]); // sed -i target = last positional
  }

  for (const verb of ['cp', 'mv', 'install', 'truncate', 'ex', 'ed']) {
    const m = cmd.match(new RegExp(`\\b${verb}\\b([^|;&]*)`));
    if (!m) continue;
    const args = m[1].split(/\s+/).filter((a) => a && !a.startsWith('-') && !a.includes('='));
    if (args.length) candidates.push(args[args.length - 1]); // dest = last positional
  }
  for (const cand of candidates) {
    const abs = path.isAbsolute(cand) ? cand : path.resolve(REPO_ROOT, cand);
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    if (rel.startsWith('..')) continue; // outside the repo — not a repo-protected file
    const hit = isProtectedRelative(rel);
    if (hit) return `${rel} (matches \"${hit}\")`;
  }
  return null;
}

/**
 * Repo-relative PROTECTED-file hits among the REALIZED byte-effect (rank-3 no-bypass).
 * `protectedWriteTarget` reads the command STRING and so misses an obfuscated write
 * (`node -e fs.writeFileSync`, a path built at runtime, a symlink alias). The realized
 * effect cannot be obfuscated: this inspects every file the command actually changed
 * (created / modified / deleted) and reports any that resolve to a protected file. Mirrors
 * `protectedWriteTarget`'s repo-relative resolution. Pure + exported so it is unit-provable.
 */
export function protectedEffectHits(rootAbs: string, effects: { file: string }[]): string[] {
  const hits: string[] = [];
  for (const e of effects) {
    const abs = path.isAbsolute(e.file) ? e.file : path.resolve(rootAbs, e.file);
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    if (rel.startsWith('..')) continue; // outside the repo — not a repo-protected file
    const hit = isProtectedRelative(rel);
    if (hit) hits.push(`${rel} (matches "${hit}")`);
  }
  return hits;
}

function guardCommand(cmd: string): GuardVerdict {
  const c = cmd.trim();
  if (!c) return { allowed: false, reason: 'empty command' };
  for (const f of FORBIDDEN) {
    if (f.re.test(c)) return { allowed: false, reason: f.reason };
  }
  const prot = protectedWriteTarget(c);
  if (prot) {
    return {
      allowed: false,
      reason:
        `refuses to write a governance-protected file via the shell: ${prot}. ` +
        `Protected files are owner-only — the byte-edit tools refuse them and the ` +
        `shell operator now does too. Ask the owner; do not bypass.`,
    };
  }
  return { allowed: true };
}

type CommandClass = 'read-only' | 'mutable-or-unknown' | 'external-or-host-effect';

const EXTERNAL_OR_HOST_EFFECT_COMMANDS: { re: RegExp; reason: string }[] = [
  {
    re: /^git\s+(?:push|pull|fetch|clone|submodule|lfs)\b/,
    reason: 'git remote/submodule operation can change or depend on external host state',
  },
  {
    re: /^(?:curl|wget|http)\b/,
    reason: 'network client effect is outside the filesystem byte snapshot',
  },
  { re: /\b(?:ssh|scp|rsync)\b/, reason: 'remote shell/file transfer can mutate another host' },
  {
    re: /^(?:psql|mysql|sqlite3|redis-cli|mongosh|mongo)\b/,
    reason: 'database client effect is outside the filesystem byte snapshot',
  },
  {
    re: /^(?:kubectl|helm|docker|docker-compose|podman)\b/,
    reason: 'orchestrator/container/host effect is outside the repo byte snapshot',
  },
  {
    re: /^(?:railway|vercel|gh|stripe|aws|gcloud|az|flyctl|supabase|firebase)\b/,
    reason: 'provider CLI can mutate external runtime or cloud state',
  },
  {
    re: /^(?:npm|pnpm|yarn|bun|pip|pipx|poetry|cargo|go|mvn|gradle|gem|bundle)\s+(?:install|add|update|get|publish|deploy|push)\b/,
    reason:
      'package manager install/publish/deploy can mutate network, caches, hooks, or registries',
  },
  {
    re: /\b(?:fetch\s*\(|XMLHttpRequest|https?:\/\/|node:https|node:http)\b/,
    reason: 'inline runtime network access is not a filesystem byte effect',
  },
];

const READ_ONLY_COMMANDS: RegExp[] = [
  /^(?:pwd|true|false|date|whoami|hostname)\b(?:\s|$)/,
  /^git\s+(?:status|diff|show|log|rev-parse|branch|ls-files|remote\s+-v)\b/,
  /^rg\b/,
  /^grep\b/,
  /^sed\s+-n\b/,
  /^cat\b/,
  /^ls\b/,
  /^find\b(?![\s\S]*\s-delete\b)(?![\s\S]*\s-exec\b)/,
  /^wc\b/,
  /^node\s+scripts\/mcp\/atomic-edit\/audit-atomicity\.mjs\b/,
];

function externalEffectReason(cmd: string): string | null {
  const c = cmd.trim();
  const hit = EXTERNAL_OR_HOST_EFFECT_COMMANDS.find((entry) => entry.re.test(c));
  return hit?.reason ?? null;
}

function classifyCommand(cmd: string): CommandClass {
  const c = cmd.trim();
  if (READ_ONLY_COMMANDS.some((re) => re.test(c))) return 'read-only';
  return externalEffectReason(c) ? 'external-or-host-effect' : 'mutable-or-unknown';
}

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

function sandboxExecAvailable(): boolean {
  return fs.existsSync(SANDBOX_EXEC);
}

function sandboxPath(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function atomicSandboxProfile(writeRoot: string | null): string {
  const writeRule = writeRoot
    ? '(allow file-write* (subpath "' + sandboxPath(fs.realpathSync(writeRoot)) + '"))'
    : null;
  return [
    '(version 1)',
    '(deny default)',
    '(allow file-read*)',
    ...(writeRule ? [writeRule] : []),
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/stdout"))',
    '(allow file-write* (literal "/dev/stderr"))',
    '(allow process*)',
    '(allow mach-lookup)',
    '(allow sysctl-read)',
    '(deny network*)',
  ].join(' ');
}

function sandboxReceipt(active: boolean, writeRoot: string | null): Record<string, unknown> {
  return {
    active,
    engine: active ? 'macos-sandbox-exec' : 'none',
    writeRoot,
    fileWrites: active ? (writeRoot ? 'cwd-only' : 'denied') : 'unguarded',
    tempRoot: active && writeRoot ? writeRoot : null,
    network: active ? 'denied' : 'unguarded',
  };
}

function hostSandboxActive(): boolean {
  return (
    process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
    process.env.ATOMIC_HOST_ATOMIC_ONLY === '1'
  );
}

function hostSandboxWriteRoot(): string | null {
  const value = process.env.ATOMIC_HOST_WRITE_ROOT;
  if (!value) return null;
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

/** Path to a running out-of-sandbox broker socket, or null if none is configured. */
function brokerSocketPath(): string | null {
  return process.env.ATOMIC_EXEC_BROKER_SOCKET || null;
}

/**
 * Host-mode sandbox receipt: identical containment guarantees to non-host mode
 * (cwd-only writes, network denied), but the OS sandbox is applied by the
 * out-of-sandbox broker per command rather than by a nested sandbox-exec.
 */
function brokerSandboxReceipt(writeRoot: string | null): Record<string, unknown> {
  return {
    active: true,
    engine: 'macos-broker-sandbox',
    writeRoot,
    fileWrites: writeRoot ? 'cwd-only' : 'denied',
    tempRoot: writeRoot,
    network: 'denied',
    nestedSandbox: false,
    broker: true,
  };
}

function nearestExistingBrokerPath(target: string): string {
  let current = path.resolve(target);
  while (!fs.existsSync(current)) {
    const next = path.dirname(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function hostVisibleBrokerPath(target: string): string {
  const host = process.env.ATOMIC_HOST_WRITE_ROOT?.trim();
  if (!host) return path.resolve(target);
  try {
    const hostRoot = path.resolve(host);
    const hostReal = fs.realpathSync.native(hostRoot);
    const nearest = nearestExistingBrokerPath(target);
    const nearestReal = fs.realpathSync.native(nearest);
    const relNearest = path.relative(hostReal, nearestReal);
    if (relNearest === '' || (!relNearest.startsWith('..') && !path.isAbsolute(relNearest))) {
      return path.join(hostRoot, relNearest, path.relative(nearest, path.resolve(target)));
    }
  } catch {
    // Fall through to the resolved target.
  }
  return path.resolve(target);
}

interface SpawnLikeResult {
  error: (Error & { code?: string }) | null;
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/**
 * Delegate a command to the out-of-sandbox broker via the synchronous client
 * bridge. The broker re-applies a fresh per-command sandbox-exec (network denied,
 * writes confined to effectRoot). Returns a spawnSync-shaped result so the
 * caller's downstream handling is identical. Fails closed (error set) when the
 * broker socket is unset or the broker is unreachable.
 */
function runViaBroker(
  command: string,
  cwd: string,
  effectRoot: string | null,
  timeoutMs: number,
  env: Record<string, string> | undefined,
  stdin: string | undefined,
): SpawnLikeResult {
  const sockPath = brokerSocketPath();
  if (!sockPath) {
    return {
      error: new Error(
        'host-sandboxed atomic_exec requires a running broker (ATOMIC_EXEC_BROKER_SOCKET is unset). ' +
          'Relaunch Claude through scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs, which starts the broker.',
      ),
      status: null,
      signal: null,
      stdout: '',
      stderr: '',
    };
  }
  const clientPath = hostVisibleBrokerPath(
    path.join(REPO_ROOT, 'scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs'),
  );
  const brokerCwd = hostVisibleBrokerPath(cwd);
  const brokerEffectRoot = effectRoot ? hostVisibleBrokerPath(effectRoot) : null;
  const reqObj: Record<string, unknown> = {
    command,
    cwd: brokerCwd,
    effectRoot: brokerEffectRoot,
    timeoutMs,
  };
  if (env) reqObj.env = env;
  if (stdin !== undefined) reqObj.stdin = stdin;
  const res = childProcess.spawnSync(process.execPath, [clientPath, sockPath], {
    cwd: brokerCwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: timeoutMs + 5000,
    input: JSON.stringify(reqObj),
  });
  if (res.error) {
    return {
      error: res.error as Error & { code?: string },
      status: null,
      signal: null,
      stdout: '',
      stderr: '',
    };
  }
  let reply: Record<string, unknown>;
  try {
    reply = JSON.parse(res.stdout || '{}') as Record<string, unknown>;
  } catch {
    return {
      error: new Error('broker reply unparseable: ' + String(res.stdout ?? '').slice(0, 300)),
      status: null,
      signal: null,
      stdout: String(res.stdout ?? ''),
      stderr: String(res.stderr ?? ''),
    };
  }
  if (reply.brokerUnreachable) {
    return {
      error: new Error(String(reply.error ?? 'broker unreachable')),
      status: null,
      signal: null,
      stdout: '',
      stderr: '',
    };
  }
  if (reply.ok === false && typeof reply.exitCode !== 'number') {
    return {
      error: new Error(String(reply.error ?? 'broker refused command')),
      status: null,
      signal: null,
      stdout: String(reply.stdout ?? ''),
      stderr: String(reply.stderr ?? ''),
    };
  }
  return {
    error: null,
    status: typeof reply.exitCode === 'number' ? reply.exitCode : null,
    signal: (reply.signal as NodeJS.Signals) ?? null,
    stdout: String(reply.stdout ?? ''),
    stderr: String(reply.stderr ?? ''),
  };
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
    throw new Error(
      `atomic_exec refused: cwd escapes allowed roots (${candidate}). Allowed = repo root + registered git worktrees.`,
    );
  }
  return candidate;
}

function tryGit(cwd: string, args: string[]): string | null {
  try {
    return childProcess
      .execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .trim();
  } catch {
    return null;
  }
}

interface GitSnapshot {
  headSha: string | null;
  stashSha: string | null;
  dirtyFiles: number;
  untrackedFiles: number;
}

function gitSnapshot(cwd: string): GitSnapshot {
  const headSha = tryGit(cwd, ['rev-parse', 'HEAD']);
  const status = tryGit(cwd, ['status', '--porcelain']);
  const lines = status ? status.split('\n').filter((l) => l.trim().length > 0) : [];
  const dirtyFiles = lines.length;
  // `git stash create` captures TRACKED + staged content WITHOUT touching the
  // working tree or stash list — a pure, non-destructive snapshot. It does NOT
  // capture untracked files, so rollback is tracked-content-only (reported in
  // the receipt as rollbackScope).
  const untrackedFiles = lines.filter((l) => l.startsWith('??')).length;
  const stashSha = dirtyFiles > 0 ? tryGit(cwd, ['stash', 'create', 'atomic_exec snapshot']) : null;
  return { headSha, stashSha, dirtyFiles, untrackedFiles };
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
        'wrapped in the atomic envelope — a starting-directory guard (cwd must resolve inside the repo ' +
        'root / a registered git worktree), a host sandbox where available (macOS sandbox-exec: no writes ' +
        'for trace-only commands; cwd-only writes for byte-effect-proven commands; network denied; ' +
        'host-launched mode delegates each command to the out-of-sandbox broker, which re-applies a fresh ' +
        'per-command sandbox-exec, allows read-only commands with no write permission, and fails closed if the broker socket is absent), plus a ' +
        'best-effort denylist (DEFENSE-IN-DEPTH — refuses git ' +
        'tags, prisma db push, force-push, pipe-to-shell, disk/auditor destroyers, and shell writes to ' +
        'governance-protected files; env-var/eval/alias indirection can still evade it), a trace receipt ' +
        'to .atomic/exec-ledger.jsonl, secret ' +
        'redaction on every returned/traced surface, and a hard timeout. Returns the REAL exit code (never ' +
        'fakes success): a non-zero exit comes back as {ok:false, exitCode, stdout, stderr}. Commands are ' +
        'classified conservatively: read-only allowlisted commands may run trace-only, mutable-or-unknown ' +
        'commands require proveEffect:true before spawn; rollbackOnNonZero is recovery after proof, never admission. host-mode read-only commands run trace-only through the broker no-write sandbox, and external-or-host-effect ' +
        'commands (network/database/provider/remote-host/package/runtime-control) are refused because filesystem ' +
        'proof cannot approve external state. snapshot:true remains a ' +
        'tracked-content restore point only; byte-effect proof is the strict admission layer. Use this instead ' +
        'of the banned built-in Bash for git/gh/npm/test orchestration; run mutations inside an isolated ' +
        'worktree/root to keep captured effects complete and reversible.',
      inputSchema: {
        command: z.string().min(1).describe('shell command line, executed via /bin/bash -c'),
        cwd: z
          .string()
          .optional()
          .describe(
            'working directory (default: repo root); must resolve inside an allowed root / git worktree',
          ),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(600000)
          .optional()
          .describe('hard timeout in ms (default 120000)'),
        stdin: z.string().optional().describe('data piped to the command stdin'),
        env: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'extra env vars merged over process.env (NOT written to the trace; their values are masked from returned stdout/stderr)',
          ),
        intent: z.string().optional().describe('one-line product intent, recorded in the trace'),
        snapshot: z
          .boolean()
          .optional()
          .describe(
            'take a non-destructive git stash snapshot before running, for rollback (default false)',
          ),
        rollbackOnNonZero: z
          .boolean()
          .optional()
          .describe(
            'on non-zero exit, restore already-captured state: git snapshot when snapshot:true, and byte effects only when proveEffect:true; never grants write admission',
          ),
        proveEffect: z
          .boolean()
          .optional()
          .describe(
            'govern the byte-EFFECT (the filesystem-effect substrate): snapshot the file-bytes under cwd before ' +
              'the command, then report the EXACT per-file changes it made (modified/created/deleted, with char-level ' +
              'diffs) and enable byte-exact, untracked-inclusive rollback — turns a shell command into a proven, ' +
              'reversible transaction. Bounded (caps + skips node_modules/.git/dist); sets effect.limitReached on a cap.',
          ),
      },
    },
    async (a) => {
      const startedAt = Date.now();
      try {
        const cwd = resolveCwd(a.cwd);
        const verdict = guardCommand(a.command);
        if (!verdict.allowed) {
          appendTrace({
            ts: startedAt,
            kind: 'refused',
            reason: verdict.reason,
            command: redactSecrets(a.command),
            cwd,
          });
          return fail(`atomic_exec refused (invariant law): ${verdict.reason}`);
        }
        const commandClass = classifyCommand(a.command);
        const externalReason =
          commandClass === 'external-or-host-effect' ? externalEffectReason(a.command) : null;
        if (externalReason) {
          const reason =
            `external-or-host-effect command refused under Y admission: ${externalReason}. ` +
            `Filesystem proveEffect cannot approve network, database, provider, remote-host, package-registry, or runtime-control effects. ` +
            `Use a domain-specific MCP/gate with observed external-state proof, or run this outside atomic admission with owner approval.`;
          appendTrace({
            ts: startedAt,
            kind: 'refused',
            reason,
            commandClass,
            command: redactSecrets(a.command),
            cwd,
          });
          return fail(`atomic_exec refused (external effect unproved): ${reason}`);
        }
        const hostSandbox = hostSandboxActive();
        const hostWriteRoot = hostSandboxWriteRoot();
        if (hostSandbox && !hostWriteRoot) {
          const reason =
            'atomic host sandbox is active but ATOMIC_HOST_WRITE_ROOT is missing or invalid.';
          appendTrace({
            ts: startedAt,
            kind: 'refused',
            reason,
            commandClass,
            command: redactSecrets(a.command),
            cwd,
          });
          return fail(`atomic_exec refused (host sandbox invalid): ${reason}`);
        }
        const needsEffectProof = commandClass === 'mutable-or-unknown';
        if (needsEffectProof && !a.proveEffect) {
          const reason =
            'mutable-or-unknown command requires proveEffect:true under Y admission; rollbackOnNonZero is recovery, not proof, and unproven shell effects are not byte-correct-by-construction.';
          appendTrace({
            ts: startedAt,
            kind: 'refused',
            reason,
            commandClass,
            command: redactSecrets(a.command),
            cwd,
          });
          return fail(`atomic_exec refused (effect proof required): ${reason}`);
        }

        const snap = a.snapshot ? gitSnapshot(cwd) : null;
        // Effect proof is only for commands admitted to write. Trace-only read
        // commands run under a no-write sandbox, so there is no cwd write surface
        // to snapshot and no root-size cap to hide behind.
        const effectRoot: string | null = a.proveEffect ? cwd : null;
        const effectSnap: EffectSnapshot | null = effectRoot
          ? captureEffectSnapshot(effectRoot, {})
          : null;
        if (effectSnap)
          assertCompleteEffectSnapshot(effectSnap, 'run atomic_exec with byte-effect proof');
        const timeout = a.timeoutMs ?? 120000;
        // Host mode: per-command sandboxing is delegated to the out-of-sandbox
        // broker (macOS forbids nested sandbox-exec). It MUST be present, or we
        // fail closed — a host-launched command must never run unsandboxed.
        const brokerSock = brokerSocketPath();
        if (hostSandbox && !brokerSock) {
          const reason =
            'host-sandboxed atomic_exec requires a running broker (ATOMIC_EXEC_BROKER_SOCKET is unset). ' +
            'Relaunch Claude through scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs, which starts the broker.';
          appendTrace({
            ts: startedAt,
            kind: 'refused',
            reason,
            commandClass,
            command: redactSecrets(a.command),
            cwd,
          });
          return fail(`atomic_exec refused (broker required): ${reason}`);
        }
        const sandboxActive = hostSandbox ? Boolean(brokerSock) : sandboxExecAvailable();
        if (!sandboxActive) {
          const reason =
            'atomic_exec requires a real process sandbox under Y admission; ' +
            `${SANDBOX_EXEC} is not available on this host.`;
          appendTrace({
            ts: startedAt,
            kind: 'refused',
            reason,
            commandClass,
            command: redactSecrets(a.command),
            cwd,
          });
          return fail(`atomic_exec refused (sandbox unavailable): ${reason}`);
        }
        const sandboxWriteRoot = effectRoot;
        const sandbox = hostSandbox
          ? brokerSandboxReceipt(sandboxWriteRoot)
          : sandboxReceipt(true, sandboxWriteRoot);
        const sandboxEnv: Record<string, string> = {};
        if (sandboxWriteRoot) {
          sandboxEnv.TMPDIR = sandboxWriteRoot;
          sandboxEnv.TMP = sandboxWriteRoot;
          sandboxEnv.TEMP = sandboxWriteRoot;
        }
        const res: SpawnLikeResult = hostSandbox
          ? runViaBroker(
              a.command,
              cwd,
              effectRoot,
              timeout,
              { ...(a.env ?? {}), ...sandboxEnv },
              a.stdin,
            )
          : (childProcess.spawnSync(
              SANDBOX_EXEC,
              ['-p', atomicSandboxProfile(sandboxWriteRoot), '/bin/bash', '-c', a.command],
              {
                cwd,
                timeout,
                encoding: 'utf8',
                maxBuffer: 32 * 1024 * 1024,
                env: { ...process.env, ...(a.env ?? {}), ...sandboxEnv },
                ...(a.stdin !== undefined ? { input: a.stdin } : {}),
              },
            ) as unknown as SpawnLikeResult);
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
        // Redact BOTH known token shapes AND any caller-supplied env value (a
        // secret passed via env and echoed by the command would otherwise leak).
        const envVals = Object.values(a.env ?? {}).filter((v) => v && v.length >= 6);
        const redactAll = (s: string): string => {
          let out = redactSecrets(s);
          for (const v of envVals) out = out.split(v).join('[REDACTED_ENV_VALUE]');
          return out;
        };
        const stdout = capText(redactAll(res.stdout ?? ''));
        const stderr = capText(redactAll(res.stderr ?? ''));

        let rolledBack = false;
        // tracked-content-only: `git checkout <stash> -- .` restores tracked file
        // content but does NOT delete files the failed command newly created.
        let rollbackScope: 'none' | 'tracked-content-only' = 'none';
        if (snap && snap.stashSha && exitCode !== 0 && a.rollbackOnNonZero) {
          try {
            childProcess.execFileSync('git', ['-C', cwd, 'checkout', snap.stashSha, '--', '.'], {
              stdio: 'ignore',
            });
            rolledBack = true;
            rollbackScope = 'tracked-content-only';
          } catch {
            rolledBack = false;
          }
        }

        // Byte-effect substrate: diff the file-bytes the command actually changed,
        // and (on failure, if asked) reverse them byte-exactly. The filesystem
        // effect governed as a transaction — independent of the git snapshot, and
        // untracked-inclusive (it captures created/deleted files git-stash misses).
        const effects: FileEffect[] | null = effectSnap ? diffEffect(effectSnap) : null;
        let effectRestored = 0;
        if (effectSnap && effects && exitCode !== 0 && a.rollbackOnNonZero) {
          effectRestored = rollbackEffect(effectSnap, effects);
        }

        // Govern the EFFECT, not the command (rank-3 no-bypass). A write that reached a
        // PROTECTED file by any obfuscated means (`node -e fs.writeFileSync`, a runtime-built
        // path, a symlink alias) slips past the command-string guard but is visible in the
        // realized byte-effect. If any realized effect touched a protected file, reverse the
        // WHOLE effect byte-exactly and REFUSE — protected infrastructure is never a
        // legitimate atomic_exec target, regardless of exit code.
        if (effectSnap && effects && effects.length > 0) {
          const protectedHits = protectedEffectHits(effectSnap.rootAbs, effects);
          if (protectedHits.length > 0) {
            const reversed = rollbackEffect(effectSnap, effects);
            appendTrace({
              ts: startedAt,
              kind: 'exec-protected-effect-refused',
              intent: a.intent ?? null,
              command: redactSecrets(a.command),
              protectedHits,
              reversed,
            });
            return fail(
              `atomic_exec refused: the command's realized byte-effect touched protected ` +
                `file(s) [${protectedHits.join('; ')}]. Protected infrastructure may only be ` +
                `changed by the repo owner — never through exec. The whole effect was reversed ` +
                `byte-exactly (${reversed} file(s) restored). Govern the effect, not the command.`,
            );
          }
        }

        appendTrace({
          ts: startedAt,
          kind: 'exec',
          intent: a.intent ?? null,
          command: redactSecrets(a.command),
          commandClass,
          sandbox,
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
          commandClass,
          sandbox,
          stdout: stdout.text,
          stdoutTruncated: stdout.truncated,
          stderr: stderr.text,
          stderrTruncated: stderr.truncated,
          snapshot: snap,
          rolledBack,
          rollbackScope,
          effect: effects
            ? {
                changedFiles: effects.length,
                limitReached: effectSnap?.limitReached ?? false,
                reversed: effectRestored,
                files: effects.map((e) => ({
                  file: e.file,
                  change: e.change,
                  bytesBefore: e.bytesBefore,
                  bytesAfter: e.bytesAfter,
                  ...(e.modeBefore === undefined ? {} : { modeBefore: e.modeBefore }),
                  ...(e.modeAfter === undefined ? {} : { modeAfter: e.modeAfter }),
                  ...(e.metadataOnly === true ? { metadataOnly: true } : {}),
                  ...(e.atomicDiff ? { atomicDiff: redactAll(e.atomicDiff) } : {}),
                })),
              }
            : null,
          atomicEnvelope: {
            guarded: true,
            effectProven: Boolean(effectSnap),
            effectProofRequired: needsEffectProof,
            sandbox,
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
