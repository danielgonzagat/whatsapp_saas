#!/usr/bin/env node
/**
 * Claude → Atomic whole-host launcher (priority A).
 *
 * Goal: start the Claude Code CLI process INSIDE the mandatory host boundary so
 * the atomic server (a child of Claude) observes the host-sandbox witness and
 * the whole-host Y certificate's `wholeHostActionSpace` domain stops being RED.
 *
 * The certificate's detection contract (server-tools-y.ts) is exactly:
 *   activeHostSandbox =
 *     process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
 *     process.env.ATOMIC_HOST_ATOMIC_ONLY === '1'
 * so this launcher sets BOTH, in the SAME spawn that applies sandbox-exec — the
 * env vars are a faithful witness: present in the Claude process tree only if
 * that tree is genuinely wrapped by sandbox-exec.
 *
 * NETWORK: unlike the codex launcher (which denies all network), Claude's
 * reasoning IS the remote Anthropic API, so this host sandbox ALLOWS outbound
 * network. Host-level guarantee = FILESYSTEM CONTAINMENT (writes only under
 * repo + TMPDIR + ~/.claude). Per-command network denial + cwd-confinement for
 * shell commands is restored by the BROKER (below), because macOS forbids nested
 * sandbox-exec inside the host sandbox.
 *
 * BROKER: macOS refuses sandbox_apply inside an existing sandbox, so a
 * host-launched atomic_exec cannot re-apply its own per-command sandbox. This
 * launcher therefore starts atomic-exec-broker.mjs OUTSIDE the host sandbox
 * (a sibling process) and exports ATOMIC_EXEC_BROKER_SOCKET into the wrapped
 * Claude. atomic_exec delegates each host-mode command to the broker, which
 * re-applies a fresh deny-by-default sandbox-exec per command (network denied,
 * writes confined to cwd). Without the broker, host-mode atomic_exec fails
 * closed — it never runs a command unsandboxed.
 *
 * Usage:
 *   node scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs            → launch `claude`
 *   node scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs --resume   → pass-through flags to `claude`
 *   node scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs --verify   → in-sandbox boundary probes, print JSON, exit
 *   node scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs node -e ... → full command override (proof path)
 * Override launched binary with ATOMIC_HOST_LAUNCH_CMD (default: claude).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync, mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOME = os.homedir();
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const BROKER = path.join(__dirname, 'atomic-exec-broker.mjs');

function schemeString(p) {
  return '"' + String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function schemeRegexPrefix(prefix) {
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return '#"^' + escaped + '"';
}

function realOrSelf(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

// macOS per-user Darwin scratch dirs (confstr _CS_DARWIN_USER_{TEMP,CACHE}_DIR),
// e.g. /var/folders/xx/.../T and .../C. These are what NSTemporaryDirectory()
// returns and — unlike POSIX $TMPDIR — they are NOT overridable by the env, so a
// process that overrode $TMPDIR (Claude points it at its own scratch) still writes
// scratch here. Returned trailing-slash-stripped so SBPL (subpath …) matches.
function darwinScratchDir(name) {
  try {
    const r = spawnSync('/usr/bin/getconf', [name], { encoding: 'utf8' });
    const p = (r.stdout || '').trim().replace(/\/+$/, '');
    return p || null;
  } catch {
    return null;
  }
}

// allow-by-default (so network/process/exec work for Claude), then DENY all
// writes, then carve out the minimal writable set. SBPL is last-match-wins.
function buildProfile() {
  const tmpDir = process.env.TMPDIR ? path.resolve(process.env.TMPDIR) : os.tmpdir();
  const writableSubpaths = new Set([
    REPO_ROOT,
    realOrSelf(REPO_ROOT),
    tmpDir,
    realOrSelf(tmpDir),
    path.join(HOME, '.claude'),
    realOrSelf(path.join(HOME, '.claude')),
  ]);
  // Browser/Chromium/Electron tools (chrome-devtools MCP, Puppeteer, Lighthouse)
  // create scratch in the Darwin per-user temp/cache dirs — notably Chrome's
  // ProcessSingleton socket dir. Those dirs come from NSTemporaryDirectory() and
  // IGNORE the $TMPDIR override above, so without these carve-outs Chrome aborts
  // with "Failed to create socket directory" and NO browser MCP can launch inside
  // the host sandbox. Same trust level as $TMPDIR (per-user scratch); home docs,
  // /etc, system, and repo-external source stay read-only. Both raw and realpath
  // are added because /var → /private/var is a symlink and SBPL matches the real path.
  for (const name of ['DARWIN_USER_TEMP_DIR', 'DARWIN_USER_CACHE_DIR']) {
    const d = darwinScratchDir(name);
    if (d) {
      writableSubpaths.add(d);
      writableSubpaths.add(realOrSelf(d));
    }
  }
  const lines = ['(version 1)', '(allow default)', '(deny file-write*)'];
  for (const sp of writableSubpaths) {
    lines.push(`(allow file-write* (subpath ${schemeString(sp)}))`);
  }
  lines.push(`(allow file-write* (regex ${schemeRegexPrefix(path.join(HOME, '.claude.json'))}))`);
  // Claude Code's Bash tool writes its per-session scratch under
  // /private/tmp/claude-<uid>/<project>/<uuid> — a hardcoded base that does NOT
  // honor $TMPDIR, so the TMPDIR carve-out above does not cover it. Without this
  // rule the Bash tool's mkdir of that scratch dir fails with EPERM and NO shell
  // command (git included) can run inside the sandbox. Scoped tight by prefix to
  // Claude's own temp namespace — it never opens /tmp root, so home/system/source
  // containment is unchanged.
  lines.push(`(allow file-write* (regex ${schemeRegexPrefix('/private/tmp/claude-')}))`);
  lines.push(`(allow file-write* (regex ${schemeRegexPrefix('/tmp/claude-')}))`);
  lines.push('(allow file-write* (literal "/dev/null"))');
  lines.push('(allow file-write* (literal "/dev/stdout"))');
  lines.push('(allow file-write* (literal "/dev/stderr"))');
  lines.push('(allow file-write* (subpath "/dev/tty"))');
  lines.push('(allow file-write-data (subpath "/dev"))');
  return lines.join('\n');
}

function fail(msg) {
  process.stderr.write(`[claude-atomic-host-launcher] ${msg}\n`);
  process.exit(1);
}

if (!existsSync(SANDBOX_EXEC)) {
  fail(
    'sandbox-exec not found (this launcher requires macOS). On Linux use a ' +
      'namespace/seccomp wrapper (bubblewrap/firejail) with an equivalent ' +
      'repo+TMPDIR+~/.claude-only-write profile and set ' +
      'ATOMIC_HOST_SANDBOX=macos-sandbox-exec + ATOMIC_HOST_ATOMIC_ONLY=1.',
  );
}

const profile = buildProfile();

function childEnv(brokerSocket) {
  return {
    ...process.env,
    ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
    ATOMIC_HOST_ATOMIC_ONLY: '1',
    ATOMIC_HOST_WRITE_ROOT: REPO_ROOT,
    ATOMIC_HOST_AGENT: process.env.ATOMIC_HOST_AGENT ?? 'claude',
    ...(brokerSocket ? { ATOMIC_EXEC_BROKER_SOCKET: brokerSocket } : {}),
  };
}

/**
 * Start the out-of-sandbox broker and resolve once it prints ATOMIC_BROKER_READY.
 * The broker is a sibling of the sandboxed Claude (NOT wrapped by sandbox-exec),
 * so it CAN apply a fresh per-command sandbox-exec. Returns { child, socket }.
 */
function startBroker() {
  const atomicDir = path.join(REPO_ROOT, '.atomic');
  try {
    mkdirSync(atomicDir, { recursive: true });
  } catch {
    /* best-effort */
  }
  const brokerDir = path.join(atomicDir, `claude-broker-${process.pid}`);
  const socket = pathToFileURL(brokerDir).href;
  try {
    rmSync(brokerDir, { recursive: true, force: true });
  } catch {
    /* fresh */
  }
  const child = spawn(process.execPath, [BROKER, socket], {
    cwd: REPO_ROOT,
    env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: REPO_ROOT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const to = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('broker did not become ready in time'));
      }
    }, 8000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('ATOMIC_BROKER_READY') && !settled) {
        settled = true;
        clearTimeout(to);
        resolve({ child, socket, cleanupPath: brokerDir });
      }
    });
    child.stderr.on('data', (d) => process.stderr.write('[atomic-exec-broker] ' + d));
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(to);
        reject(new Error('broker exited early with code ' + code));
      }
    });
  });
}

// ── --verify: prove the boundary holds, then exit (no Claude session) ──
function verify() {
  const runProbe = (body) =>
    spawnSync(SANDBOX_EXEC, ['-p', profile, 'node', '-e', body], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      env: childEnv(),
    });
  const repoProbe = path.join(REPO_ROOT, `.claude-host-verify-${process.pid}.tmp`);
  const claudeProbe = path.join(HOME, '.claude', `.claude-host-verify-${process.pid}.tmp`);
  const homeProbe = path.join(HOME, `.claude-host-verify-forbidden-${process.pid}.tmp`);
  const etcProbe = `/etc/.claude-host-verify-forbidden-${process.pid}.tmp`;
  const writeBody = (p) => `require('fs').writeFileSync(${JSON.stringify(p)}, 'x')`;
  const results = [];
  const r1 = runProbe(writeBody(repoProbe));
  results.push({ name: 'repo write allowed', ok: r1.status === 0, status: r1.status });
  const r2 = runProbe(writeBody(claudeProbe));
  results.push({ name: '~/.claude write allowed', ok: r2.status === 0, status: r2.status });
  const r3 = runProbe(writeBody(homeProbe));
  results.push({ name: 'home-root write denied', ok: r3.status !== 0, status: r3.status });
  const r4 = runProbe(writeBody(etcProbe));
  results.push({ name: '/etc write denied', ok: r4.status !== 0, status: r4.status });
  const r5 = runProbe(
    "process.stdout.write(process.env.ATOMIC_HOST_SANDBOX+'|'+process.env.ATOMIC_HOST_ATOMIC_ONLY)",
  );
  results.push({
    name: 'cert witness env propagated',
    ok: (r5.stdout || '').trim() === 'macos-sandbox-exec|1',
    value: (r5.stdout || '').trim(),
  });
  for (const p of [repoProbe, claudeProbe]) {
    try {
      rmSync(p);
    } catch {
      /* best-effort cleanup */
    }
  }
  const ok = results.every((r) => r.ok);
  process.stdout.write(
    JSON.stringify({ ok, agent: 'claude', repoRoot: REPO_ROOT, results }, null, 2) + '\n',
  );
  process.exit(ok ? 0 : 1);
}

const argv = process.argv.slice(2);
if (argv[0] === '--verify') verify();

const launchCmd = process.env.ATOMIC_HOST_LAUNCH_CMD ?? 'claude';
let command;
if (argv.length === 0) command = [launchCmd];
else if (argv[0].startsWith('-')) command = [launchCmd, ...argv];
else command = argv;

startBroker()
  .then(({ child: brokerChild, socket, cleanupPath }) => {
    process.stderr.write(
      `[claude-atomic-host-launcher] host sandbox ACTIVE — writes restricted to ` +
        `repo(${REPO_ROOT}) + TMPDIR + ~/.claude; network ALLOWED (LLM transport); ` +
        `per-command sandbox via broker(${socket}); ` +
        `ATOMIC_HOST_SANDBOX=macos-sandbox-exec ATOMIC_HOST_ATOMIC_ONLY=1; ` +
        `launching: ${command.join(' ')}\n`,
    );
    const child = spawn(SANDBOX_EXEC, ['-p', profile, ...command], {
      stdio: 'inherit',
      cwd: REPO_ROOT,
      env: childEnv(socket),
    });
    const cleanup = () => {
      try {
        brokerChild.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      try {
        rmSync(cleanupPath ?? socket, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    };
    child.on('exit', (code, signal) => {
      cleanup();
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  })
  .catch((e) => fail('could not start the per-command sandbox broker: ' + (e instanceof Error ? e.message : String(e))));
