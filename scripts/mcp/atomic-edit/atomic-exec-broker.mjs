#!/usr/bin/env node
/**
 * atomic-exec-broker - out-of-sandbox per-command macOS sandbox broker.
 *
 * WHY: macOS forbids nested sandbox-exec (sandbox_apply: Operation not
 * permitted). When the whole Claude CLI runs INSIDE the host sandbox
 * (claude-atomic-host-launcher.mjs), atomic_exec can no longer re-apply its own
 * per-command sandbox-exec, and the host sandbox must ALLOW network (Claude's
 * reasoning is the remote Anthropic API) so it cannot itself deny per-command
 * network. This broker, started OUTSIDE the host sandbox, re-applies a fresh
 * deny-by-default sandbox-exec per command (writes confined to effectRoot plus
 * an Atomic-owned scratch temp root, NETWORK DENIED). It returns the REAL exit code
 * (never fakes success) and re-enforces the invariant denylist + allowed-root
 * containment as defense-in-depth.
 *
 * Protocols:
 * - plain path: length-prefixed JSON over Unix socket
 * - file://dir: no-socket filesystem RPC using atomic request/response renames
 *
 * Request shape: { command, cwd?, effectRoot?, timeoutMs?, env?, stdin? }.
 * Reply shape: { ok, exitCode, signal, stdout, stderr } or { ok:false, error }.
 *
 * Lifecycle: `node atomic-exec-broker.mjs <endpoint>` (or
 * ATOMIC_EXEC_BROKER_SOCKET). ATOMIC_EXEC_BROKER_ROOT pins the allowed root
 * (default cwd). Prints 'ATOMIC_BROKER_READY <endpoint>' when listening.
 */
import net from 'node:net';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const brokerArgs = process.argv.slice(2);
const noSandbox = brokerArgs.includes('--no-sandbox');
const endpointValue =
  brokerArgs.find((a) => a !== '--no-sandbox' && !a.startsWith('ATOMIC_')) ||
  process.env.ATOMIC_EXEC_BROKER_SOCKET;
const allowedRoot = canonicalPathForContainment(
  process.env.ATOMIC_EXEC_BROKER_ROOT ? process.env.ATOMIC_EXEC_BROKER_ROOT : process.cwd(),
);
const allowedScratchRoot = canonicalPathForContainment(path.join(realOr(os.tmpdir()), 'atomic-exec'));
const allowedRootScratchRoot = canonicalPathForContainment(path.join(allowedRoot, 'atomic-exec'));
if (!endpointValue) {
  process.stderr.write('[atomic-exec-broker] endpoint required (argv[2] or ATOMIC_EXEC_BROKER_SOCKET)\n');
  process.exit(2);
}
if (!noSandbox && !fs.existsSync(SANDBOX_EXEC)) {
  process.stderr.write('[atomic-exec-broker] requires macOS sandbox-exec (or --no-sandbox for passthrough)\n');
  process.exit(78);
}

// Defense-in-depth mirror of the invariant LAWS (server-tools-exec FORBIDDEN is
// primary). The broker never relaxes them; it only ADDS a denial layer.
const FORBIDDEN = [
  /\bgit\s+restore\b/,
  /--no-verify\b/,
  /\[(?:skip ci|ci skip|skip codacy|codacy skip)\]/i,
  /\bprisma\s+db\s+push\b/,
  /\bgit\s+push\b[^\n]*--force(?!-with-lease)/,
  /\bgit\s+push\b[^\n]*\s-f(?:\s|$)/,
  /\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/(?:\s|$)|~|\$HOME|\*)/,
  /\bmkfs\b|\bdd\s+if=|>\s*\/dev\/(?:sd|nvme|disk)/,
  /:\s*\(\s*\)\s*\{[^}]*\}\s*;\s*:/,
  /(?:chmod|chflags|mv|rm|cp|tee|>>?)\s*[^\n]*no-hardcoded-reality-audit/,
  /\bfind\b[^|]*\s-delete\b/,
  /\|\s*(?:sh|bash|zsh|dash)\b/,
  /\bgit\s+config\b[^\n]*\balias\./,
];

function esc(p) {
  return String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function realOr(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
function canonicalPathForContainment(target) {
  const resolved = path.resolve(target);
  let cursor = resolved;
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return resolved;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(realOr(cursor), ...suffix);
}
function subpathWriteRule(value) {
  return `(allow file-write* (subpath "${esc(value)}"))`;
}
function darwinScratchDir(name) {
  const scratch = process.env[name];
  return scratch ? scratch.trim().replace(/\/+$/, '') : null;
}
function browserRuntimeWriteRules(effectRoot, tempRoot = null) {
  const writable = new Set();
  for (const root of [effectRoot, tempRoot]) {
    if (!root) continue;
    writable.add(root);
    writable.add(realOr(root));
  }
  for (const name of ['DARWIN_USER_TEMP_DIR', 'DARWIN_USER_CACHE_DIR']) {
    const scratch = darwinScratchDir(name);
    if (scratch) {
      writable.add(scratch);
      writable.add(realOr(scratch));
    }
  }
  const homeDir = process.env.HOME || '';
  if (homeDir) {
    for (const crashpadDir of [
      path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'Crashpad'),
      path.join(homeDir, 'Library', 'Application Support', 'Chromium', 'Crashpad'),
    ]) {
      writable.add(crashpadDir);
      writable.add(realOr(crashpadDir));
    }
  }
  return [...writable].map(subpathWriteRule);
}
function sandboxWriteRules(...roots) {
  const writable = new Set();
  for (const root of roots) {
    if (!root) continue;
    writable.add(realOr(root));
  }
  return [...writable].map(subpathWriteRule);
}

function profile(effectRoot, profileName = 'atomic-exec', tempRoot = null) {
  const writeRules = sandboxWriteRules(effectRoot, tempRoot);
  if (profileName === 'chrome-devtools') {
    return [
      '(version 1)',
      '(deny default)',
      '(allow file-read*)',
      ...browserRuntimeWriteRules(effectRoot, tempRoot),
      '(allow file-write* (subpath "/var/folders"))',
      '(allow file-write* (subpath "/private/var/folders"))',
      '(allow file-write* (literal "/dev/null"))',
      '(allow file-write* (literal "/dev/stdout"))',
      '(allow file-write* (literal "/dev/stderr"))',
      '(allow process*)',
      '(allow mach-lookup)',
      '(allow mach-register)',
      '(allow sysctl-read)',
      '(allow network*)',
    ]
      .filter(Boolean)
      .join(' ');
  }
  return [
    '(version 1)',
    '(deny default)',
    '(allow file-read*)',
    ...writeRules,
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/stdout"))',
    '(allow file-write* (literal "/dev/stderr"))',
    '(allow process*)',
    '(allow mach-lookup)',
    '(allow sysctl-read)',
    '(deny network*)',
  ]
    .filter(Boolean)
    .join(' ');
}
function requestedProfile(req, command) {
  if (!req.profile || req.profile === 'atomic-exec') return 'atomic-exec';
  if (req.profile !== 'chrome-devtools') return null;
  const normalized = command.replace(/\\/g, '/');
  if (!normalized.includes('scripts/mcp/chrome-devtools-cdp-browser.sh') || !/\bstart\b/.test(normalized)) {
    return null;
  }
  return 'chrome-devtools';
}
function within(child, root) {
  const rel = path.relative(canonicalPathForContainment(root), canonicalPathForContainment(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function appendCapped(current, chunk, maxBytes = 32 * 1024 * 1024) {
  if (current.length >= maxBytes) return current;
  const next = current + String(chunk);
  if (next.length <= maxBytes) return next;
  return next.slice(0, maxBytes) + '\n[atomic broker output truncated]';
}

function tempEnv(tempRoot) {
  if (!tempRoot) return {};
  return {
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    NODE_COMPILE_CACHE: path.join(tempRoot, 'node-compile-cache'),
    XDG_CACHE_HOME: path.join(tempRoot, 'xdg-cache'),
    npm_config_cache: path.join(tempRoot, 'npm-cache'),
    YARN_CACHE_FOLDER: path.join(tempRoot, 'yarn-cache'),
    PNPM_HOME: path.join(tempRoot, 'pnpm-home'),
    PIP_CACHE_DIR: path.join(tempRoot, 'pip-cache'),
  };
}

function runPassthrough(command, runCwd, eRoot, req) {
  return new Promise((resolve) => {
    const tempRoot = req.tempRoot || eRoot || runCwd;
    fs.mkdirSync(tempRoot, { recursive: true });
    const child = spawn('/bin/bash', ['-c', command], {
      cwd: runCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(req.env || {}), ...tempEnv(tempRoot) },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const timeoutMs = req.timeoutMs || 120000;
    const forceKill = () => {
      try { child.kill('SIGKILL'); } catch { /* best-effort */ }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stderr = appendCapped(stderr, '\n[atomic broker command timed out after ' + timeoutMs + 'ms]');
      try { child.kill('SIGTERM'); } catch { /* best-effort */ }
      setTimeout(forceKill, 1000).unref();
    }, timeoutMs);
    const finish = (reply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(reply);
    };
    child.stdout.on('data', (chunk) => { stdout = appendCapped(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendCapped(stderr, chunk); });
    child.on('error', (error) => {
      finish({ ok: false, error: String(error.message || error), exitCode: null, signal: null, stdout, stderr });
    });
    child.on('close', (code, signal) => {
      finish({ ok: !timedOut && code === 0, exitCode: code, signal: signal ?? null, stdout, stderr });
    });
    if (typeof req.stdin === 'string') child.stdin.end(req.stdin);
    else child.stdin.end();
  });
}

function runSandboxed(command, runCwd, eRoot, profileName, req) {
  return new Promise((resolve) => {
    const tempRoot = req.tempRoot || eRoot || runCwd;
    fs.mkdirSync(tempRoot, { recursive: true });
    const child = spawn(SANDBOX_EXEC, ['-p', profile(eRoot, profileName, tempRoot), '/bin/bash', '-c', command], {
      cwd: runCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(req.env || {}), ...tempEnv(tempRoot) },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const timeoutMs = req.timeoutMs || 120000;
    const forceKill = () => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stderr = appendCapped(stderr, '\n[atomic broker command timed out after ' + timeoutMs + 'ms]');
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      setTimeout(forceKill, 1000).unref();
    }, timeoutMs);
    const finish = (reply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(reply);
    };
    child.stdout.on('data', (chunk) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendCapped(stderr, chunk);
    });
    child.on('error', (error) => {
      finish({ ok: false, error: String(error.message || error), exitCode: null, signal: null, stdout, stderr });
    });
    child.on('close', (code, signal) => {
      finish({ ok: !timedOut && code === 0, exitCode: code, signal: signal ?? null, stdout, stderr });
    });
    if (typeof req.stdin === 'string') child.stdin.end(req.stdin);
    else child.stdin.end();
  });
}

async function handle(req) {
  if (!req || typeof req.command !== 'string' || !req.command.trim()) {
    return { ok: false, error: 'broker: command required' };
  }
  const command = req.command;
  const c = command.trim();
  for (const re of FORBIDDEN) {
    if (re.test(c)) return { ok: false, error: 'broker invariant denial: ' + re.toString() };
  }
  const profileName = requestedProfile(req, c);
  if (!profileName) return { ok: false, error: 'broker: unsupported execution profile' };
  const runCwd = req.cwd ? path.resolve(req.cwd) : allowedRoot;
  if (!within(runCwd, allowedRoot)) return { ok: false, error: 'broker: cwd escapes allowed root' };
  const hasEffectRoot = Object.prototype.hasOwnProperty.call(req, 'effectRoot');
  const eRoot = hasEffectRoot
    ? (typeof req.effectRoot === 'string' && req.effectRoot.length > 0 ? path.resolve(req.effectRoot) : null)
    : runCwd;
  if (eRoot && !within(eRoot, allowedRoot)) return { ok: false, error: 'broker: effectRoot escapes allowed root' };
  const tRoot =
    typeof req.tempRoot === 'string' && req.tempRoot.length > 0 ? path.resolve(req.tempRoot) : null;
  if (tRoot && !within(tRoot, allowedScratchRoot) && !within(tRoot, allowedRootScratchRoot)) {
    return { ok: false, error: 'broker: tempRoot escapes atomic scratch roots' };
  }
  const runReq = tRoot ? { ...req, tempRoot: tRoot } : req;
  if (noSandbox) return runPassthrough(command, runCwd, eRoot, runReq);
  return runSandboxed(command, runCwd, eRoot, profileName, runReq);
}

function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

function writeJsonAtomic(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function endpointFrom(value) {
  if (value.startsWith('file://')) {
    return { kind: 'file', dir: path.resolve(fileURLToPath(value)) };
  }
  return { kind: 'socket', socketPath: value };
}

let server = null;
let filePoller = null;
let cleanup = () => {};

function startSocketBroker(socketPath) {
  server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let need = -1;
    let handled = false;
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (need < 0 && buf.length >= 4) {
        need = buf.readUInt32BE(0);
        buf = buf.subarray(4);
      }
      if (need >= 0 && buf.length >= need && !handled) {
        handled = true;
        let req = null;
        try {
          req = JSON.parse(buf.subarray(0, need).toString('utf8'));
        } catch {
          req = null;
        }
        (async () => {
          let resp;
          try {
            resp = req ? await handle(req) : { ok: false, error: 'broker: bad request json' };
          } catch (e) {
            resp = { ok: false, error: 'broker handler threw: ' + (e instanceof Error ? e.message : String(e)) };
          }
          sock.write(frame(resp));
          sock.end();
        })().catch((e) => {
          sock.write(frame({ ok: false, error: 'broker async handler threw: ' + (e instanceof Error ? e.message : String(e)) }));
          sock.end();
        });
      }
    });
    sock.on('error', () => {});
  });
  server.on('error', (e) => {
    process.stderr.write('[atomic-exec-broker] server error: ' + e.message + '\n');
    process.exit(1);
  });
  try {
    fs.rmSync(socketPath, { force: true });
  } catch {
    /* fresh socket */
  }
  cleanup = () => {
    try {
      fs.rmSync(socketPath, { force: true });
    } catch {
      /* best-effort */
    }
  };
  server.listen(socketPath, () => {
    process.stdout.write('ATOMIC_BROKER_READY ' + socketPath + '\n');
  });
}

function startFileBroker(root) {
  if (!within(root, allowedRoot)) {
    process.stderr.write('[atomic-exec-broker] file endpoint escapes allowed root\n');
    process.exit(2);
  }
  const requests = path.join(root, 'requests');
  const responses = path.join(root, 'responses');
  const marker = path.join(root, 'broker.json');
  fs.mkdirSync(requests, { recursive: true, mode: 0o700 });
  fs.mkdirSync(responses, { recursive: true, mode: 0o700 });
  writeJsonAtomic(marker, {
    protocol: 'atomic-file-broker-v1',
    pid: process.pid,
    parentPid: process.ppid,
    startedAt: new Date().toISOString(),
  });
  const inFlight = new Set();
  const processRequest = async (name) => {
    if (!name.endsWith('.json') || inFlight.has(name)) return;
    inFlight.add(name);
    const requestFile = path.join(requests, name);
    const processingFile = requestFile + '.processing';
    const responseFile = path.join(responses, name);
    try {
      fs.renameSync(requestFile, processingFile);
    } catch {
      inFlight.delete(name);
      return;
    }
    let resp;
    let shutdownRequested = false;
    try {
      const req = JSON.parse(fs.readFileSync(processingFile, 'utf8'));
      if (req?.atomicBrokerShutdown === true) {
        shutdownRequested = true;
        resp = { ok: true, shutdown: true };
      } else {
        resp = await handle(req);
      }
    } catch (e) {
      resp = { ok: false, error: 'broker handler threw: ' + (e instanceof Error ? e.message : String(e)) };
    } finally {
      fs.rmSync(processingFile, { force: true });
    }
    try {
      writeJsonAtomic(responseFile, resp);
      if (shutdownRequested) setTimeout(shutdown, 0);
    } finally {
      inFlight.delete(name);
    }
  };
  filePoller = setInterval(() => {
    let names = [];
    try {
      names = fs.readdirSync(requests);
    } catch {
      names = [];
    }
    for (const name of names) processRequest(name);
  }, 25);
  cleanup = () => {
    if (filePoller) clearInterval(filePoller);
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  };
  process.stdout.write('ATOMIC_BROKER_READY file://' + root + '\n');
}

const endpoint = endpointFrom(endpointValue);
if (endpoint.kind === 'file') startFileBroker(endpoint.dir);
else startSocketBroker(endpoint.socketPath);

function shutdown() {
  try {
    if (server) server.close();
  } catch {
    /* best-effort */
  }
  cleanup();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Parent-death reaper. This broker is ALWAYS spawned as a child of the host
// launcher / supervisor that owns its lifetime (claude-/codex-atomic-host-launcher
// and the launcher-supervisor LKG path) — never a standalone daemon. On a CLEAN
// parent exit those owners SIGTERM us (handled above). But on an ABNORMAL parent
// death (SIGKILL, crash, a timeout-killed gate run) no SIGTERM is delivered, and
// because the broker reads no stdin nothing else signals us: we are reparented to
// launchd (ppid 1) and would keep listening forever. That orphaning was the
// dominant source of leaked atomic-exec brokers accumulating until the machine ran
// out of RAM.
//
// NB: process.ppid is captured ONCE by Node and is NOT updated on reparent, so we
// cannot watch it change. Instead record the owning parent's pid at startup and
// poll its LIVENESS with signal 0: once that throws ESRCH (no such process) the
// owner is gone and we have been orphaned — reap cleanly so the socket / file
// endpoint is removed and the process exits. EPERM means the pid still exists
// (owner alive, just not signalable) so we keep serving.
const BROKER_PARENT_PID = process.ppid;
if (BROKER_PARENT_PID > 1) {
  const parentReaper = setInterval(() => {
    let parentAlive = true;
    try {
      process.kill(BROKER_PARENT_PID, 0);
    } catch (err) {
      parentAlive = err && err.code === 'EPERM';
    }
    if (!parentAlive) {
      try {
        process.stderr.write(
          '[atomic-exec-broker] owning parent ' + BROKER_PARENT_PID +
            ' gone; reaping orphaned broker\n',
        );
      } catch {
        /* best-effort */
      }
      shutdown();
    }
  }, 2000);
  parentReaper.unref();
}
