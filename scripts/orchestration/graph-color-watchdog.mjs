#!/usr/bin/env node
/**
 * Graph Color Watchdog — keeps Obsidian graph.json colorGroups populated
 * when Obsidian overwrites them to [] on Graph view close.
 *
 * CLI surface:
 *   node scripts/orchestration/graph-color-watchdog.mjs --start   # daemon
 *   node scripts/orchestration/graph-color-watchdog.mjs --stop    # stop running daemon
 *   node scripts/orchestration/graph-color-watchdog.mjs --status  # running?
 *
 * NOT constitution-locked.
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, watch } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || resolve(__dirname, '..', '..'));

const GRAPH_SETTINGS_PATH = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
  '.obsidian',
  'graph.json',
);

const LENS_SCRIPT = resolve(REPO_ROOT, 'scripts', 'obsidian-graph-lens.mjs');
const PID_FILE = '/tmp/kloel-graph-color-watchdog.pid';

const EXPECTED_COLOR_GROUPS = 28;
const POLL_INTERVAL_MS = 5_000;
const REAPPLY_BACKOFF_MS = 1_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let watcher = null;
let pollTimer = null;
let lastApplyTime = 0;

// ---------------------------------------------------------------------------
// Logging — stderr structured: [ts] kind detail
// ---------------------------------------------------------------------------

function log(kind, detail) {
  const ts = new Date().toISOString();
  const line = detail ? `[${ts}] ${kind} ${detail}\n` : `[${ts}] ${kind}\n`;
  process.stderr.write(line);
}

// ---------------------------------------------------------------------------
// PID / control file
// ---------------------------------------------------------------------------

function readPidFile() {
  try {
    const raw = readFileSync(PID_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writePidFile(state) {
  writeFileSync(PID_FILE, JSON.stringify(state, null, 2));
}

function pidIsLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  const existing = readPidFile();
  if (existing && existing.pid && pidIsLive(existing.pid)) {
    process.stderr.write(`graph-color-watchdog: already running (pid=${existing.pid})\n`);
    process.exit(2);
  }
  writePidFile({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });
}

function releaseLock() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* ok */
  }
}

// ---------------------------------------------------------------------------
// Core: check colorGroups and re-apply lens if needed
// ---------------------------------------------------------------------------

function readColorGroupsCount() {
  try {
    const raw = readFileSync(GRAPH_SETTINGS_PATH, 'utf8');
    const graph = JSON.parse(raw);
    const colorGroups = graph.colorGroups || [];
    return colorGroups.length;
  } catch {
    return -1;
  }
}

function checkAndReapply() {
  const count = readColorGroupsCount();
  if (count >= 0 && count < EXPECTED_COLOR_GROUPS) {
    log('fix', `colorGroups ${count} < ${EXPECTED_COLOR_GROUPS}, re-applying`);
    applyFactoryLens();
  }
}

function applyFactoryLens() {
  const now = Date.now();
  if (now - lastApplyTime < REAPPLY_BACKOFF_MS) {
    return;
  }
  lastApplyTime = now;

  const child = spawn('node', [LENS_SCRIPT, '--factory'], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      log('error', `lens --factory exit ${code}: ${stderr.slice(0, 300)}`);
    } else {
      log('applied', 'factory lens');
    }
  });

  child.on('error', (e) => {
    log('error', `lens spawn: ${e.message}`);
  });
}

// ---------------------------------------------------------------------------
// fs.watch on graph.json's parent directory
// ---------------------------------------------------------------------------

function startGraphWatcher() {
  const graphDir = dirname(GRAPH_SETTINGS_PATH);

  try {
    watcher = watch(graphDir, (_eventType, filename) => {
      if (filename === 'graph.json') {
        checkAndReapply();
      }
    });

    watcher.on('error', (e) => {
      log('error', `fs.watch: ${e.message}`);
    });

    log('watching', GRAPH_SETTINGS_PATH);
  } catch (e) {
    log('error', `fs.watch start: ${e.message}`);
    gracefulShutdown(1);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function gracefulShutdown(code) {
  if (watcher) {
    try {
      watcher.close();
    } catch {
      /* ok */
    }
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  releaseLock();
  log('shutdown', `exit ${code}`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// CLI: --stop
// ---------------------------------------------------------------------------

function stopDaemon() {
  const state = readPidFile();
  if (!state || !state.pid || !pidIsLive(state.pid)) {
    process.stderr.write('graph-color-watchdog: no running daemon\n');
    process.exit(2);
  }
  process.kill(state.pid, 'SIGTERM');
  log('stop-request', `sent SIGTERM to pid ${state.pid}`);
  setTimeout(() => {
    if (pidIsLive(state.pid)) {
      process.kill(state.pid, 'SIGKILL');
    }
    process.exit(0);
  }, 200);
}

// ---------------------------------------------------------------------------
// CLI: --status
// ---------------------------------------------------------------------------

function statusDaemon() {
  const state = readPidFile();
  if (!state || !state.pid) {
    process.stdout.write(JSON.stringify({ running: false }) + '\n');
  } else if (pidIsLive(state.pid)) {
    process.stdout.write(JSON.stringify({ running: true, ...state }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ running: false, stalePid: true }) + '\n');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--start';

  if (mode === '--stop') {
    stopDaemon();
    return;
  }

  if (mode === '--status') {
    statusDaemon();
    return;
  }

  if (mode === '--start') {
    log('startup', 'graph-color-watchdog');

    acquireLock();

    process.on('SIGINT', () => gracefulShutdown(0));
    process.on('SIGTERM', () => gracefulShutdown(0));

    process.on('unhandledRejection', (reason) => {
      log('error', `unhandled rejection: ${String(reason)}`);
    });

    process.on('uncaughtException', (err) => {
      log('error', `uncaught exception: ${err.message}`);
    });

    // Initial check at start
    checkAndReapply();

    // Safety-net poll (fs.watch misses events on macOS)
    pollTimer = setInterval(checkAndReapply, POLL_INTERVAL_MS);

    startGraphWatcher();

    return;
  }

  process.stderr.write(`Usage: node ${process.argv[1]} [--start|--stop|--status]\n`);
  process.exit(1);
}

main();
