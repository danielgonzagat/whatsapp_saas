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
 * deny-by-default sandbox-exec per command (writes confined to effectRoot,
 * TMPDIR forced into effectRoot, NETWORK DENIED). It returns the REAL exit code
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
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const endpointValue = process.argv[2] || process.env.ATOMIC_EXEC_BROKER_SOCKET;
const allowedRoot = canonicalPathForContainment(
  process.env.ATOMIC_EXEC_BROKER_ROOT ? process.env.ATOMIC_EXEC_BROKER_ROOT : process.cwd(),
);

if (!endpointValue) {
  process.stderr.write('[atomic-exec-broker] endpoint required (argv[2] or ATOMIC_EXEC_BROKER_SOCKET)\n');
  process.exit(2);
}
if (!fs.existsSync(SANDBOX_EXEC)) {
  process.stderr.write('[atomic-exec-broker] requires macOS sandbox-exec\n');
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
function profile(effectRoot) {
  const writeRule = effectRoot ? `(allow file-write* (subpath "${esc(realOr(effectRoot))}"))` : '';
  return [
    '(version 1)',
    '(deny default)',
    '(allow file-read*)',
    writeRule,
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
function within(child, root) {
  const rel = path.relative(canonicalPathForContainment(root), canonicalPathForContainment(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function handle(req) {
  if (!req || typeof req.command !== 'string' || !req.command.trim()) {
    return { ok: false, error: 'broker: command required' };
  }
  const command = req.command;
  const c = command.trim();
  for (const re of FORBIDDEN) {
    if (re.test(c)) return { ok: false, error: 'broker invariant denial: ' + re.toString() };
  }
  const runCwd = req.cwd ? path.resolve(req.cwd) : allowedRoot;
  if (!within(runCwd, allowedRoot)) return { ok: false, error: 'broker: cwd escapes allowed root' };
  const hasEffectRoot = Object.prototype.hasOwnProperty.call(req, 'effectRoot');
  const eRoot = hasEffectRoot
    ? (typeof req.effectRoot === 'string' && req.effectRoot.length > 0 ? path.resolve(req.effectRoot) : null)
    : runCwd;
  if (eRoot && !within(eRoot, allowedRoot)) return { ok: false, error: 'broker: effectRoot escapes allowed root' };
  const tempRoot = eRoot || runCwd;
  const res = spawnSync(SANDBOX_EXEC, ['-p', profile(eRoot), '/bin/bash', '-c', command], {
    cwd: runCwd,
    timeout: req.timeoutMs || 120000,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...(req.env || {}), TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot },
    ...(typeof req.stdin === 'string' ? { input: req.stdin } : {}),
  });
  if (res.error) {
    return { ok: false, error: String(res.error.message || res.error), exitCode: res.status ?? null, signal: res.signal ?? null, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }
  return { ok: res.status === 0, exitCode: res.status, signal: res.signal ?? null, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
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
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (need < 0 && buf.length >= 4) {
        need = buf.readUInt32BE(0);
        buf = buf.subarray(4);
      }
      if (need >= 0 && buf.length >= need) {
        let req = null;
        try {
          req = JSON.parse(buf.subarray(0, need).toString('utf8'));
        } catch {
          req = null;
        }
        let resp;
        try {
          resp = req ? handle(req) : { ok: false, error: 'broker: bad request json' };
        } catch (e) {
          resp = { ok: false, error: 'broker handler threw: ' + (e instanceof Error ? e.message : String(e)) };
        }
        sock.write(frame(resp));
        sock.end();
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
  fs.mkdirSync(requests, { recursive: true, mode: 0o700 });
  fs.mkdirSync(responses, { recursive: true, mode: 0o700 });
  const inFlight = new Set();
  const processRequest = (name) => {
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
        resp = handle(req);
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
