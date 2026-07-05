#!/usr/bin/env node
// launcher-supervisor.mjs — immortality layer for the kloel-atomic-edit MCP server.
//
// Sits between the MCP host (Claude Code / Codex / OpenCode stdio pipes) and the
// real server chain (atomic-edit-mcp-launcher-impl.sh → node dist/server.js).
// The host process NEVER sees the server die: the supervisor relays stdio,
// caches the initialize handshake, and when the child exits it walks a recovery
// ladder (impl retry → blessed-impl restore → dist-lkg restore → internal
// rescue responder), replaying the handshake so the session continues.
//
// Deliberate REFUSED exits are still honored during boot (exit 78/79/80 are
// security contracts, not crashes) — see gates/mcp-launcher-host-boundary.proof.mjs.
// Everything else becomes recovery, never silence.
//
// Zero dependencies. stdout is reserved for the MCP transport; all supervisor
// diagnostics go to stderr prefixed [atomic-supervisor].

import { spawn, spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url)); // scripts/mcp/atomic-edit
const SCRIPTS_MCP_DIR = path.resolve(SRC_DIR, '..');
const REPO_ROOT = path.resolve(SRC_DIR, '..', '..', '..');
const BOOTSTRAP_PATH = path.join(SCRIPTS_MCP_DIR, 'atomic-edit-mcp-launcher.sh');
const IMPL_PATH = path.join(SCRIPTS_MCP_DIR, 'atomic-edit-mcp-launcher-impl.sh');
const SUPERVISOR_PATH = path.join(SRC_DIR, 'launcher-supervisor.mjs');
const DIST_DIR = path.join(SRC_DIR, 'dist');
const DIST_SERVER = path.join(DIST_DIR, 'server.js');
const LKG_DIR = path.join(SRC_DIR, 'dist-lkg');
const BLESSED_DIR = path.join(SRC_DIR, 'launcher-blessed');
const RUNTIME_DIR = path.join(REPO_ROOT, '.atomic');
const STATE_FILE = path.join(RUNTIME_DIR, `supervisor-state-${process.pid}.json`);
const LOCK_DIR = path.join(RUNTIME_DIR, 'supervisor-dist.lock');

const REFUSAL_EXITS = new Set([78, 79, 80]); // deliberate security refusals — propagate during boot
const BOOT_INIT_TIMEOUT_MS = Number(process.env.ATOMIC_SUPERVISOR_BOOT_TIMEOUT_MS || 90_000);
const INTEGRITY_INTERVAL_MS = Number(process.env.ATOMIC_SUPERVISOR_INTEGRITY_INTERVAL_MS || 60_000);
const RESCUE_RETRY_INTERVAL_MS = Number(process.env.ATOMIC_SUPERVISOR_RESCUE_RETRY_MS || 300_000);
const MAX_RESPAWNS_PER_WINDOW = 5;
const RESPAWN_WINDOW_MS = 10 * 60 * 1000;

const log = (msg) => {
  try { process.stderr.write(`[atomic-supervisor] ${msg}\n`); } catch { /* host gone */ }
};

// ── state ──────────────────────────────────────────────────────────────────
let child = null;            // current server child process (impl bash or direct node)
let childStage = null;       // 'impl' | 'impl-restored' | 'lkg' — what produced the child
let rescueMode = false;
let shuttingDown = false;
let firstSpawnDone = false;  // refusal exits only propagate on the very first attempt
let initLine = null;         // raw initialize request line from the host
let initIdKey = null;
let initAnswered = false;
let initializedLine = null;  // raw notifications/initialized line
const pending = new Map();   // idKey → raw request line, forwarded but unanswered
let suppressInitResponse = false; // next response to initIdKey is a replay artifact
let stdinBuf = '';
let childOutBuf = '';
const stderrRing = [];       // last chunks of child stderr for diagnostics
let stderrRingBytes = 0;
const ladderHistory = [];    // {stage, code, signal, at}
const respawnTimes = [];
let bootTimer = null;
let blessedThisDist = false;
let lkgBrokerChild = null;

const idKeyOf = (id) => (id === undefined ? null : JSON.stringify(id));

function pushStderr(chunk) {
  const s = String(chunk);
  stderrRing.push(s);
  stderrRingBytes += s.length;
  while (stderrRingBytes > 8192 && stderrRing.length > 1) {
    stderrRingBytes -= stderrRing[0].length;
    stderrRing.shift();
  }
}

function writeState(extra = {}) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({
      supervisorPid: process.pid,
      serverPid: child?.pid ?? null,
      stage: rescueMode ? 'rescue' : childStage,
      ladderHistory: ladderHistory.slice(-10),
      updatedAt: new Date().toISOString(),
      ...extra,
    }, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch { /* never fatal */ }
}

function safeWriteStdout(line) {
  try { process.stdout.write(line.endsWith('\n') ? line : line + '\n'); }
  catch { gracefulExit(0, 'stdout closed'); }
}

let exited = false;
function gracefulExit(code, why) {
  if (exited) return;
  exited = true;
  shuttingDown = true;
  log(`exiting (${why})`);
  try { if (child) child.kill('SIGTERM'); } catch { /* best effort */ }
  try { if (lkgBrokerChild) lkgBrokerChild.kill('SIGTERM'); } catch { /* best effort */ }
  try { fs.rmSync(STATE_FILE, { force: true }); } catch { /* runtime junk */ }
  process.exit(code);
}

// ── file integrity (blessed copies) ────────────────────────────────────────
function bashParses(file) {
  try {
    const r = spawnSync('/bin/bash', ['-n', file], { timeout: 5000, encoding: 'utf8' });
    return r.status === 0;
  } catch { return false; }
}

// parse-clean is not enough: a clobbered script can still be "valid bash"
// (e.g. plain prose parses as a command word). Healthy = shebang + parses.
function bashScriptHealthy(file) {
  try { if (!fs.readFileSync(file, 'utf8').startsWith('#!')) return false; } catch { return false; }
  return bashParses(file);
}

// The bootstrap's load-bearing invariant is launching this supervisor — a
// parseable-but-inert replacement (e.g. "#!/bin/bash\nexit 0") must count as
// broken so concurrent live sessions restore it.
function bootstrapHealthy(file) {
  if (!bashScriptHealthy(file)) return false;
  try { return fs.readFileSync(file, 'utf8').includes('launcher-supervisor.mjs'); } catch { return false; }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const BLESSED_MANIFEST = path.join(BLESSED_DIR, '.blessed-manifest.json');

function readBlessedManifest() {
  try { return JSON.parse(fs.readFileSync(BLESSED_MANIFEST, 'utf8')); } catch { return null; }
}

// A blessed copy is trustworthy only if it matches the fingerprint recorded at
// bless time — a poisoned blessed file must never be "restored" over the live
// chain (the armor would otherwise amplify one bad write into two).
function blessedEntryTrusted(name) {
  const manifest = readBlessedManifest();
  if (!manifest?.files?.[name]) return false;
  try {
    return sha256(fs.readFileSync(path.join(BLESSED_DIR, name))) === manifest.files[name];
  } catch { return false; }
}

function nodeParses(file) {
  try {
    const r = spawnSync(process.execPath, ['--check', file], { timeout: 5000, encoding: 'utf8' });
    return r.status === 0;
  } catch { return false; }
}

function restoreFromBlessed(name, target, parses) {
  const blessed = path.join(BLESSED_DIR, name);
  try {
    if (!fs.existsSync(blessed) || !parses(blessed)) return false;
    if (!blessedEntryTrusted(name)) {
      log(`refusing restore of ${name}: blessed copy does not match its recorded fingerprint`);
      return false;
    }
    const tmp = `${target}.restore-${process.pid}`;
    fs.copyFileSync(blessed, tmp);
    fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, target);
    log(`restored ${path.basename(target)} from blessed copy`);
    return true;
  } catch (e) {
    log(`restore of ${name} failed: ${e?.message ?? e}`);
    return false;
  }
}

// Files covered by the blessed/integrity armor. The freshness and build tools
// are part of the launch chain too — a syntax-broken one would otherwise force
// every future session into exit-81 → permanent silent LKG degradation.
function blessedFileSet() {
  return [
    ['atomic-edit-mcp-launcher.sh', BOOTSTRAP_PATH, bootstrapHealthy],
    ['atomic-edit-mcp-launcher-impl.sh', IMPL_PATH, bashScriptHealthy],
    ['launcher-supervisor.mjs', SUPERVISOR_PATH, nodeParses],
    ['dist-freshness.mjs', path.join(SRC_DIR, 'dist-freshness.mjs'), nodeParses],
    ['build.mjs', path.join(SRC_DIR, 'build.mjs'), nodeParses],
  ];
}

function integritySweep() {
  try {
    // quarantine poisoned blessed copies first (fingerprint mismatch) so they
    // can never be the source of a restore; a healthy boot re-blesses later.
    const manifest = readBlessedManifest();
    if (manifest?.files) {
      for (const name of Object.keys(manifest.files)) {
        const file = path.join(BLESSED_DIR, name);
        try {
          if (fs.existsSync(file) && sha256(fs.readFileSync(file)) !== manifest.files[name]) {
            fs.rmSync(file, { force: true });
            log(`quarantined poisoned blessed copy: ${name}`);
          }
        } catch { /* unreadable — leave for the trusted check to reject */ }
      }
    }
    for (const [name, target, healthy] of blessedFileSet()) {
      if (fs.existsSync(target) ? !healthy(target) : true) {
        restoreFromBlessed(name, target, healthy);
      }
    }
  } catch (e) { log(`integrity sweep error: ${e?.message ?? e}`); }
}

function withDistLock(fn) {
  let held = false;
  try {
    for (let i = 0; i < 10; i += 1) {
      try { fs.mkdirSync(LOCK_DIR); held = true; break; }
      catch {
        try {
          const age = Date.now() - fs.statSync(LOCK_DIR).mtimeMs;
          if (age > 120_000) { fs.rmdirSync(LOCK_DIR); continue; }
        } catch { continue; }
        const until = Date.now() + 300;
        while (Date.now() < until) { /* brief spin; supervisor is otherwise idle here */ }
      }
    }
    return fn();
  } finally {
    if (held) { try { fs.rmdirSync(LOCK_DIR); } catch { /* gone */ } }
  }
}

function blessCurrentChain() {
  try {
    fs.mkdirSync(BLESSED_DIR, { recursive: true });
    // provenance: a session serving from dist-lkg proved only the
    // bootstrap+supervisor — blessing the impl family then would consecrate
    // the very files whose failure forced the LKG path.
    const implProven = childStage !== 'lkg';
    const implFamily = new Set(['atomic-edit-mcp-launcher-impl.sh', 'dist-freshness.mjs', 'build.mjs']);
    const fingerprints = {};
    for (const [name, src, healthy] of blessedFileSet()) {
      const dest = path.join(BLESSED_DIR, name);
      if ((implFamily.has(name) && !implProven) || !fs.existsSync(src) || !healthy(src)) {
        try { if (fs.existsSync(dest)) fingerprints[name] = sha256(fs.readFileSync(dest)); } catch { /* skip */ }
        continue;
      }
      const cur = fs.readFileSync(src);
      fingerprints[name] = sha256(cur);
      const old = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      if (old && Buffer.compare(cur, old) === 0) continue;
      const tmp = `${dest}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, cur, { mode: 0o755 });
      fs.renameSync(tmp, dest);
      log(`blessed ${name}`);
    }
    const tmpManifest = `${BLESSED_MANIFEST}.tmp-${process.pid}`;
    fs.writeFileSync(tmpManifest, JSON.stringify({ version: 1, files: fingerprints, blessedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmpManifest, BLESSED_MANIFEST);
  } catch (e) { log(`bless failed: ${e?.message ?? e}`); }
}

const LKG_MANIFEST_NAME = '.lkg-manifest.json';

function walkFilesRel(root) {
  const out = [];
  const rec = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) rec(full);
      else if (entry.isFile()) out.push(path.relative(root, full));
    }
  };
  rec(root);
  return out.sort();
}

function snapshotDistToLkg() {
  if (blessedThisDist || childStage === 'lkg') return;
  blessedThisDist = true;
  try {
    if (!fs.existsSync(DIST_SERVER)) return;
    withDistLock(() => {
      const tmp = `${LKG_DIR}.tmp-${process.pid}`;
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.cpSync(DIST_DIR, tmp, { recursive: true });
      // fingerprint the snapshot so a poisoned dist-lkg can never be restored
      // over a healthy dist later (out-of-band writes break the manifest).
      const fingerprints = {};
      for (const rel of walkFilesRel(tmp)) {
        if (rel === LKG_MANIFEST_NAME) continue;
        fingerprints[rel] = sha256(fs.readFileSync(path.join(tmp, rel)));
      }
      fs.writeFileSync(path.join(tmp, LKG_MANIFEST_NAME), JSON.stringify({ version: 1, files: fingerprints, snapshotAt: new Date().toISOString() }, null, 2));
      fs.rmSync(LKG_DIR, { recursive: true, force: true });
      fs.renameSync(tmp, LKG_DIR);
    });
    log('dist snapshotted to dist-lkg (last known good)');
  } catch (e) { log(`lkg snapshot failed: ${e?.message ?? e}`); }
}

function lkgSnapshotTrusted() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(LKG_DIR, LKG_MANIFEST_NAME), 'utf8'));
    if (!manifest?.files || !manifest.files['server.js']) return false;
    for (const [rel, expected] of Object.entries(manifest.files)) {
      if (sha256(fs.readFileSync(path.join(LKG_DIR, rel))) !== expected) return false;
    }
    return true;
  } catch { return false; }
}

function restoreDistFromLkg() {
  try {
    if (!fs.existsSync(path.join(LKG_DIR, 'server.js'))) return false;
    if (!lkgSnapshotTrusted()) {
      log('refusing dist-lkg restore: snapshot missing/failed its integrity manifest — keeping current dist');
      return false;
    }
    withDistLock(() => {
      const brokenKeep = `${DIST_DIR}.broken-last`;
      fs.rmSync(brokenKeep, { recursive: true, force: true });
      if (fs.existsSync(DIST_DIR)) fs.renameSync(DIST_DIR, brokenKeep);
      const tmp = `${DIST_DIR}.tmp-${process.pid}`;
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.cpSync(LKG_DIR, tmp, { recursive: true });
      fs.rmSync(path.join(tmp, LKG_MANIFEST_NAME), { force: true });
      fs.renameSync(tmp, DIST_DIR);
    });
    log('dist restored from dist-lkg (previous dist kept at dist.broken-last)');
    return true;
  } catch (e) {
    log(`lkg restore failed: ${e?.message ?? e}`);
    return false;
  }
}

// ── child lifecycle ────────────────────────────────────────────────────────
function brokerAlive(endpoint) {
  try {
    if (!endpoint) return false;
    if (endpoint.startsWith('file://')) {
      const dir = endpoint.slice('file://'.length);
      return fs.existsSync(path.join(dir, 'requests')) && fs.existsSync(path.join(dir, 'responses'));
    }
    if (!fs.statSync(endpoint).isSocket()) return false;
    const r = spawnSync(process.execPath, [path.join(SRC_DIR, 'atomic-exec-broker-client.mjs'), endpoint], {
      input: JSON.stringify({ command: 'true', cwd: REPO_ROOT, effectRoot: null, timeoutMs: 1000 }),
      encoding: 'utf8', timeout: 2500, cwd: REPO_ROOT, maxBuffer: 1024 * 1024,
    });
    if (r.error || r.status !== 0) return false;
    const reply = JSON.parse(r.stdout || '{}');
    return reply?.ok === true && !reply?.brokerUnreachable;
  } catch { return false; }
}

function lkgEnv() {
  const env = { ...process.env };
  const hostComplete =
    env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
    env.ATOMIC_HOST_ATOMIC_ONLY === '1' &&
    env.ATOMIC_EXEC_BROKER_SOCKET &&
    brokerAlive(env.ATOMIC_EXEC_BROKER_SOCKET);
  env.CODEX_HOME = env.CODEX_HOME || path.join(process.env.HOME || REPO_ROOT, '.codex');
  env.CODEX_PROJECT_DIR = REPO_ROOT;
  env.TMPDIR = REPO_ROOT;
  env.TMP = REPO_ROOT;
  env.TEMP = REPO_ROOT;
  if (!hostComplete) {
    env.ATOMIC_HOST_SANDBOX = 'self-hosted';
    env.ATOMIC_HOST_ATOMIC_ONLY = '0';
    env.ATOMIC_HOST_WRITE_ROOT = REPO_ROOT;
    env.ATOMIC_EDIT_MCP_SELF_HOSTED = '1';
    env.ATOMIC_EDIT_ALLOW_SELF_HOSTED = '1';
    if (!env.ATOMIC_EXEC_BROKER_SOCKET) {
      try {
        const brokerDir = path.join(REPO_ROOT, '.atomic', `supervisor-lkg-broker-${process.pid}`);
        fs.mkdirSync(path.join(brokerDir, 'requests'), { recursive: true });
        fs.mkdirSync(path.join(brokerDir, 'responses'), { recursive: true });
        env.ATOMIC_EXEC_BROKER_SOCKET = `file://${brokerDir}`;
        lkgBrokerChild = spawn(process.execPath, [path.join(SRC_DIR, 'atomic-exec-broker.mjs'), '--no-sandbox', env.ATOMIC_EXEC_BROKER_SOCKET], {
          stdio: ['ignore', 'ignore', 'pipe'], env,
        });
        lkgBrokerChild.stderr?.on('data', pushStderr);
        lkgBrokerChild.on('error', () => { /* degraded: exec tools limited */ });
      } catch { /* degraded: exec tools limited */ }
    }
  }
  return env;
}

function spawnStage(stage) {
  childStage = stage;
  let proc;
  if (stage === 'lkg') {
    if (!restoreDistFromLkg() && !fs.existsSync(DIST_SERVER)) return null;
    proc = spawn(process.execPath, [DIST_SERVER], { stdio: ['pipe', 'pipe', 'pipe'], env: lkgEnv() });
  } else {
    if (stage === 'impl-restored') {
      // restore stage: the current impl just failed functionally — put the
      // blessed (last-boot-verified) impl back even if the current one parses.
      const blessed = path.join(BLESSED_DIR, 'atomic-edit-mcp-launcher-impl.sh');
      let sameAsBlessed = false;
      try {
        sameAsBlessed = fs.existsSync(blessed) &&
          Buffer.compare(fs.readFileSync(blessed), fs.readFileSync(IMPL_PATH)) === 0;
      } catch { sameAsBlessed = false; }
      if (!sameAsBlessed && !restoreFromBlessed('atomic-edit-mcp-launcher-impl.sh', IMPL_PATH, bashScriptHealthy)) {
        if (!bashScriptHealthy(IMPL_PATH)) return null;
      } else if (sameAsBlessed && !bashScriptHealthy(IMPL_PATH)) {
        return null;
      }
    } else if (!bashScriptHealthy(IMPL_PATH)) {
      if (!restoreFromBlessed('atomic-edit-mcp-launcher-impl.sh', IMPL_PATH, bashScriptHealthy)) return null;
      childStage = 'impl-restored';
    }
    proc = spawn('/bin/bash', [IMPL_PATH, ...process.argv.slice(2)], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  }
  wireChild(proc);
  return proc;
}

function wireChild(proc) {
  child = proc;
  childOutBuf = '';
  // generation guards: a dead child's pipes are held open by orphaned broker
  // children, so late data could otherwise corrupt the live relay stream.
  proc.stdout.on('data', (d) => { if (child === proc) onChildStdout(d); });
  proc.stderr.on('data', (d) => { if (child === proc) pushStderr(d); try { process.stderr.write(d); } catch { /* host gone */ } });
  proc.on('error', (e) => { log(`child spawn error: ${e?.message ?? e}`); onChildExit(proc, 1, null); });
  // 'exit' + a short drain grace: 'close' would be cleaner but background
  // brokers inherit the child's pipes and keep them open forever after a
  // SIGKILL; the grace period lets already-written stderr (refusal messages)
  // reach the ring buffer before the refusal-vs-crash decision.
  proc.on('exit', (code, signal) => setTimeout(() => onChildExit(proc, code, signal), 150));
  proc.stdin.on('error', () => { /* EPIPE while dying — exit handler takes over */ });
  writeState();
}

function replayHandshake(proc) {
  try {
    if (initLine) {
      if (initAnswered) suppressInitResponse = true;
      proc.stdin.write(initLine + '\n');
    }
    if (initializedLine) proc.stdin.write(initializedLine + '\n');
    for (const line of pending.values()) proc.stdin.write(line + '\n');
    if (pending.size > 0) log(`replayed handshake + ${pending.size} in-flight request(s)`);
  } catch (e) { log(`handshake replay failed: ${e?.message ?? e}`); }
}

function armBootTimer() {
  clearTimeout(bootTimer);
  bootTimer = setTimeout(() => {
    if (!initAnswered && child && !shuttingDown) {
      log(`no initialize response after ${BOOT_INIT_TIMEOUT_MS}ms — recycling child`);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }, BOOT_INIT_TIMEOUT_MS);
  if (typeof bootTimer.unref === 'function') bootTimer.unref();
}

function nextLadderStage(prev) {
  if (prev === 'impl') return 'impl-restored';
  if (prev === 'impl-restored') return 'lkg';
  return 'rescue';
}

function onChildExit(proc, code, signal) {
  // identity guard: ignore duplicate/late exit events from a generation that
  // has already been replaced (error+exit double-fire, stale grace timers).
  if (proc !== child) return;
  try { proc.removeAllListeners('exit'); } catch { /* noop */ }
  try { proc.stdout.removeAllListeners('data'); proc.stdout.destroy(); } catch { /* noop */ }
  try { proc.stderr.removeAllListeners('data'); proc.stderr.destroy(); } catch { /* noop */ }
  const stage = childStage;
  child = null;
  clearTimeout(bootTimer);
  ladderHistory.push({ stage, code, signal, at: new Date().toISOString() });
  if (shuttingDown) {
    gracefulExit(typeof code === 'number' ? code : 0, 'child closed during shutdown');
    return;
  }

  // Deliberate refusals: only honored before the host ever got a session — it
  // receives the designed REFUSED exit code instead of a zombie server. After
  // initialize has been answered (real server or rescue), dying would strand a
  // live session, so refusals turn into recovery instead. Exception: exit 80
  // caused by a STALE/dead broker (socket present but unresponsive) is an
  // availability failure, not a malformed envelope — recover degraded
  // instead of dying (the empty-socket refusal contract stays intact).
  if (!firstSpawnDone && !initAnswered && typeof code === 'number' && REFUSAL_EXITS.has(code)) {
    const staleBroker80 = code === 80 && !/requires ATOMIC_EXEC_BROKER_SOCKET/.test(stderrRing.join(''));
    if (!staleBroker80) {
      gracefulExit(code, `impl refused with designed exit ${code}`);
      return;
    }
    log('host-mode broker is stale/unready — serving degraded from dist instead of refusing');
    firstSpawnDone = true;
    const lkgProc = spawnStage('lkg');
    if (!lkgProc) { enterRescue('stale broker and no bootable dist'); return; }
    if (!initAnswered) armBootTimer();
    replayHandshake(lkgProc);
    return;
  }

  log(`server child (stage=${stage}) exited code=${code} signal=${signal} — recovering`);
  respawnTimes.push(Date.now());
  while (respawnTimes.length && respawnTimes[0] < Date.now() - RESPAWN_WINDOW_MS) respawnTimes.shift();

  if (respawnTimes.length > MAX_RESPAWNS_PER_WINDOW) {
    enterRescue(`respawn budget exhausted (${respawnTimes.length} in window)`);
    return;
  }

  // crashes after a successful run restart the ladder from the top; failures
  // during recovery walk down the ladder.
  let stage2 = initAnswered && stage !== 'lkg' && !firstFailureBurst() ? 'impl' : nextLadderStage(stage);
  if (stage2 === 'rescue') { enterRescue('recovery ladder exhausted'); return; }
  let next = spawnStage(stage2);
  if (!next) {
    const stage3 = nextLadderStage(stage2);
    next = stage3 === 'rescue' ? null : spawnStage(stage3);
    if (!next) { enterRescue(`could not spawn ${stage2} nor ${stage3}`); return; }
  }
  firstSpawnDone = true;
  if (!initAnswered) armBootTimer();
  replayHandshake(next);
}

function firstFailureBurst() {
  // two failures within 30s right after each other → stop bouncing on 'impl'
  const recent = ladderHistory.slice(-2);
  if (recent.length < 2) return false;
  return (Date.parse(recent[1].at) - Date.parse(recent[0].at)) < 30_000;
}

// ── stdio relay ────────────────────────────────────────────────────────────
function onHostLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg = null;
  try { msg = JSON.parse(trimmed); } catch { /* forward opaque lines untouched */ }
  if (msg && typeof msg === 'object') {
    if (msg.method === 'initialize' && msg.id !== undefined) {
      initLine = trimmed; initIdKey = idKeyOf(msg.id); initAnswered = false;
    } else if (msg.method === 'notifications/initialized') {
      initializedLine = trimmed;
    } else if (msg.id !== undefined && msg.method) {
      pending.set(idKeyOf(msg.id), trimmed);
    }
  }
  if (rescueMode) { rescueRespond(msg); return; }
  if (child && child.stdin.writable) {
    try { child.stdin.write(trimmed + '\n'); } catch { /* exit handler recovers */ }
  }
  // no child and not rescue → a respawn is in flight; pending map replays it.
}

function onChildStdout(data) {
  childOutBuf += String(data);
  let nl;
  while ((nl = childOutBuf.indexOf('\n')) >= 0) {
    const line = childOutBuf.slice(0, nl);
    childOutBuf = childOutBuf.slice(nl + 1);
    if (!line.trim()) continue;
    let msg = null;
    try { msg = JSON.parse(line); } catch { /* not JSON */ }
    if (msg === null || typeof msg !== 'object') {
      // protocol hygiene: stray prints (broker READY lines, stray console.log
      // from sabotaged code) must never corrupt the host's JSON-RPC stream.
      log(`dropped non-JSON server stdout line: ${line.slice(0, 120)}`);
      continue;
    }
    if (msg.id !== undefined && msg.method === undefined) {
      const key = idKeyOf(msg.id);
      if (key === initIdKey) {
        if (suppressInitResponse) { suppressInitResponse = false; continue; }
        initAnswered = true;
        clearTimeout(bootTimer);
        firstSpawnDone = true;
        onFirstHealthy();
      }
      pending.delete(key);
    }
    safeWriteStdout(line);
  }
}

let healthyOnce = false;
function onFirstHealthy() {
  writeState();
  if (healthyOnce) return;
  healthyOnce = true;
  // the chain just served a real handshake end-to-end — bless it now, before
  // forwarding anything else (short-lived sessions must still seed the armor).
  try { blessCurrentChain(); snapshotDistToLkg(); } catch { /* logged inside */ }
}

// ── rescue mode ────────────────────────────────────────────────────────────
let rescueRetryTimer = null;
function enterRescue(reason) {
  if (rescueMode) return;
  rescueMode = true;
  log(`RESCUE MODE — ${reason}. The MCP stays alive; use atomic_rescue_status / atomic_rescue_retry.`);
  writeState({ rescueReason: reason });
  // answer everything that was in flight so the host is not left hanging —
  // including a not-yet-answered initialize (host would otherwise time out).
  if (initLine && !initAnswered) {
    try { rescueRespond(JSON.parse(initLine)); } catch { /* unanswerable */ }
  }
  for (const raw of [...pending.values()]) {
    try { rescueRespond(JSON.parse(raw)); } catch { /* unanswerable */ }
  }
  pending.clear();
  rescueRetryTimer = setInterval(() => { attemptRescueRecovery('auto-retry'); }, RESCUE_RETRY_INTERVAL_MS);
  if (typeof rescueRetryTimer.unref === 'function') rescueRetryTimer.unref();
}

function rescueDiagnostics() {
  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  return {
    mode: 'rescue',
    reason: ladderHistory.slice(-5),
    files: {
      impl: exists(IMPL_PATH), implParses: exists(IMPL_PATH) && bashParses(IMPL_PATH),
      bootstrap: exists(BOOTSTRAP_PATH), bootstrapParses: exists(BOOTSTRAP_PATH) && bashParses(BOOTSTRAP_PATH),
      distServer: exists(DIST_SERVER), distLkg: exists(path.join(LKG_DIR, 'server.js')),
      blessedDir: exists(BLESSED_DIR),
    },
    node: process.version,
    stderrTail: stderrRing.join('').slice(-2000),
    hint: 'Fix the reported file (or run atomic_rescue_retry after a manual repair). The supervisor auto-retries every 5 minutes.',
  };
}

function rescueToolError(id) {
  return {
    jsonrpc: '2.0', id,
    result: {
      content: [{ type: 'text', text: `atomic-edit está em modo RESGATE (servidor real indisponível). Diagnóstico: chame a tool atomic_rescue_status. Recuperação: atomic_rescue_retry. Última falha: ${JSON.stringify(ladderHistory.slice(-1))}` }],
      isError: true,
    },
  };
}

function attemptRescueRecovery(via) {
  integritySweep();
  const proc = spawnStage('impl') || spawnStage('lkg');
  if (!proc) { log(`rescue recovery (${via}) failed — staying in rescue`); return false; }
  rescueMode = false;
  clearInterval(rescueRetryTimer);
  respawnTimes.length = 0;
  firstSpawnDone = true; // a session exists; later refusals must recover, not exit
  log(`rescue recovery (${via}) — real server respawned, replaying handshake`);
  if (!initAnswered) armBootTimer();
  replayHandshake(proc);
  // hosts that honor listChanged re-pull the full tool list automatically
  safeWriteStdout(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }));
  return true;
}

function rescueRespond(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.method === 'notifications/initialized' || String(msg.method ?? '').startsWith('notifications/')) return;
  const id = msg.id;
  if (id === undefined) return;
  pending.delete(idKeyOf(id));
  if (msg.method === 'initialize') {
    initAnswered = true;
    safeWriteStdout(JSON.stringify({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: msg.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'kloel-atomic-edit-rescue', version: '1.0.0' },
      },
    }));
    return;
  }
  if (msg.method === 'tools/list') {
    safeWriteStdout(JSON.stringify({
      jsonrpc: '2.0', id,
      result: {
        tools: [
          { name: 'atomic_rescue_status', description: 'Why the atomic-edit server is in rescue mode + repair hints (real server crashed/unbootable; supervisor kept the MCP alive).', inputSchema: { type: 'object', properties: {} } },
          { name: 'atomic_rescue_retry', description: 'Attempt to boot the real atomic-edit server again right now (after a manual repair).', inputSchema: { type: 'object', properties: {} } },
        ],
      },
    }));
    return;
  }
  if (msg.method === 'tools/call') {
    const tool = msg.params?.name;
    if (tool === 'atomic_rescue_status') {
      safeWriteStdout(JSON.stringify({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(rescueDiagnostics(), null, 2) }] },
      }));
      return;
    }
    if (tool === 'atomic_rescue_retry') {
      const recovered = attemptRescueRecovery('manual');
      safeWriteStdout(JSON.stringify({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: recovered ? 'Servidor real recuperado — a lista completa de tools volta via tools/list_changed (ou reconecte a sessão).' : `Recuperação falhou — ainda em resgate. Diagnóstico: ${JSON.stringify(rescueDiagnostics(), null, 2)}` }],
          isError: !recovered,
        },
      }));
      return;
    }
    safeWriteStdout(JSON.stringify(rescueToolError(id)));
    return;
  }
  safeWriteStdout(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found (rescue mode): ${msg.method}` } }));
}

// ── wiring ─────────────────────────────────────────────────────────────────
process.stdin.on('data', (d) => {
  stdinBuf += String(d);
  let nl;
  while ((nl = stdinBuf.indexOf('\n')) >= 0) {
    const line = stdinBuf.slice(0, nl);
    stdinBuf = stdinBuf.slice(nl + 1);
    try { onHostLine(line); } catch (e) { log(`host line handling error: ${e?.message ?? e}`); }
  }
});
process.stdin.on('end', () => {
  shuttingDown = true;
  if (child) { try { child.stdin.end(); } catch { /* noop */ } setTimeout(() => gracefulExit(0, 'host closed stdin'), 1500); }
  else gracefulExit(0, 'host closed stdin');
});
process.stdin.on('error', () => gracefulExit(0, 'stdin error'));
process.on('SIGTERM', () => gracefulExit(0, 'SIGTERM'));
process.on('SIGINT', () => gracefulExit(0, 'SIGINT'));
process.on('uncaughtException', (e) => { log(`uncaughtException: ${e?.stack ?? e}`); if (!rescueMode) enterRescue('supervisor uncaughtException'); });
process.on('unhandledRejection', (e) => { log(`unhandledRejection: ${e?.stack ?? e}`); if (!rescueMode) enterRescue('supervisor unhandledRejection'); });

const integrityTimer = setInterval(() => integritySweep(), INTEGRITY_INTERVAL_MS);
if (typeof integrityTimer.unref === 'function') integrityTimer.unref();

// boot
const boot = spawnStage('impl') || spawnStage('impl-restored') || spawnStage('lkg');
if (!boot) enterRescue('nothing bootable at startup');
else armBootTimer();
writeState();
