#!/usr/bin/env node
/**
 * Findings Watch — daemon: full-aggregate runs, file-change debounce,
 * slow-lane scheduling, watcher lifecycle, CLI signals, and main entry.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { handleFastLane } from './engine.mjs';
import {
  state,
  log,
  shouldIgnore,
  readPidFile,
  writePidFile,
  pidIsLive,
  acquireLock,
  releaseLock,
  detectRenameKind,
  removeSidecarFor,
  REPO_ROOT,
  AGGREGATE_SCRIPT,
  EMIT_SCRIPT,
  SLOW_LANE_THROTTLE_MS,
  FAST_LANE_DEBOUNCE_MS,
  POLL_INTERVAL_MS,
} from './helpers.mjs';

// ---------------------------------------------------------------------------
// Debounce handler
// ---------------------------------------------------------------------------

/**
 * Called on each file-change event. Dedupes by path within the
 * debounce window.
 * @param {string} absPath
 */
function onFileChanged(absPath) {
  if (state.paused) return;
  if (shouldIgnore(absPath)) return;

  // Clear existing timer for this file (dedup)
  const existingTimer = state.fileTimers.get(absPath);
  if (existingTimer) clearTimeout(existingTimer);

  state.fileTimers.set(
    absPath,
    setTimeout(() => {
      state.fileTimers.delete(absPath);
      handleFastLane(absPath);
    }, FAST_LANE_DEBOUNCE_MS),
  );

  // Also schedule a full aggregate in the slow lane
  scheduleSlowLane();
}

// ---------------------------------------------------------------------------
// Full aggregate (slow lane)
// ---------------------------------------------------------------------------

/**
 * Run full aggregate + emit sidecars. Returns a promise that resolves
 * when both scripts have completed.
 * @returns {Promise<void>}
 */
export function runFullAggregate() {
  return new Promise((resolveOverall) => {
    log('aggregate-trigger', 'full re-aggregate');

    const aggChild = spawn('node', [AGGREGATE_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: 'inherit',
    });

    aggChild.on('close', (aggCode) => {
      if (aggCode !== 0) {
        log('error', `aggregate-findings.mjs exited ${aggCode}`);
      }

      log('aggregate-done', `exit=${aggCode}`);

      // Emit sidecars after aggregate
      const emitChild = spawn('node', [EMIT_SCRIPT], {
        cwd: REPO_ROOT,
        env: { ...process.env },
        stdio: 'inherit',
      });

      emitChild.on('close', (emitCode) => {
        if (emitCode !== 0) {
          log('error', `emit-findings-sidecars.mjs exited ${emitCode}`);
        }
        resolveOverall();
      });

      emitChild.on('error', (e) => {
        log('error', `emit-findings-sidecars.mjs spawn error: ${e.message}`);
        resolveOverall();
      });
    });

    aggChild.on('error', (e) => {
      log('error', `aggregate-findings.mjs spawn error: ${e.message}`);
      resolveOverall();
    });
  });
}

/**
 * Schedule a full aggregate with 30s leading-edge throttle.
 * Called on every file change event.
 */
function scheduleSlowLane() {
  const now = Date.now();
  const elapsed = now - state.lastSlowLaneRun;

  if (elapsed >= SLOW_LANE_THROTTLE_MS || state.lastSlowLaneRun === 0) {
    // Leading edge: run immediately
    state.lastSlowLaneRun = now;
    state.slowLanePending = false;

    runFullAggregate().catch(() => {
      /* caught inside */
    });
    return;
  }

  // Schedule a trailing run
  if (state.slowLanePending) return; // already scheduled

  state.slowLanePending = true;
  const remaining = SLOW_LANE_THROTTLE_MS - elapsed;

  state.slowLaneTimer = setTimeout(() => {
    state.slowLaneTimer = null;
    state.lastSlowLaneRun = Date.now();
    state.slowLanePending = false;

    runFullAggregate().catch(() => {
      /* caught inside */
    });
  }, remaining);
}

// ---------------------------------------------------------------------------
// Control file polling
// ---------------------------------------------------------------------------

function pollControlFile() {
  const pidState = readPidFile();
  if (!pidState) return;

  // Handle rescan request
  if (pidState.rescanRequested) {
    log('aggregate-trigger', 'rescan via control file');
    pidState.rescanRequested = false;
    try {
      writePidFile(pidState);
    } catch {
      /* ok */
    }

    runFullAggregate().catch(() => {
      /* caught inside */
    });
  }

  // Handle pause/resume transitions
  if (pidState.paused !== state.paused) {
    state.paused = pidState.paused;
    if (state.paused) {
      log('paused');
      // Drain all pending per-file timers while paused
      for (const timer of state.fileTimers.values()) {
        clearTimeout(timer);
      }
      state.fileTimers.clear();
      if (state.slowLaneTimer) {
        clearTimeout(state.slowLaneTimer);
        state.slowLaneTimer = null;
        state.slowLanePending = false;
      }
    } else {
      log('resumed');
    }
  }
}

// ---------------------------------------------------------------------------
// Watcher lifecycle
// ---------------------------------------------------------------------------

function startWatcher() {
  try {
    state.watcher = watch(REPO_ROOT, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // filename from fs.watch is relative to watched dir
      const absPath = resolve(REPO_ROOT, filename);
      // Skip ignored paths (.git/, node_modules/, vault, FINDINGS_AGGREGATE.json, ...)
      // BEFORE logging so the log stays signal-only.
      if (shouldIgnore(absPath)) return;
      try {
        const kind = eventType === 'rename' ? detectRenameKind(absPath) : eventType;
        if (kind === 'change' || kind === 'add' || kind === 'unlink') {
          log(kind, filename);
          if (kind === 'unlink') {
            // Source removed → drop its sidecar from the vault.
            removeSidecarFor(absPath);
          } else {
            onFileChanged(absPath);
          }
        }
      } catch {
        log(eventType, filename);
        if (eventType !== 'rename') {
          onFileChanged(absPath);
        }
      }
    });

    state.watcher.on('error', (e) => {
      log('error', `fs.watch error: ${e.message}`);
      // Don't crash — macOS may emit transient errors
    });

    log('change', `watching ${REPO_ROOT}`);
  } catch (e) {
    log('error', `failed to start fs.watch: ${e.message}`);
    gracefulShutdown(1);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function gracefulShutdown(code) {
  if (state.watcher) {
    try {
      state.watcher.close();
    } catch {
      /* ok */
    }
  }

  // Clear all timers
  for (const timer of state.fileTimers.values()) clearTimeout(timer);
  state.fileTimers.clear();

  if (state.slowLaneTimer) {
    clearTimeout(state.slowLaneTimer);
    state.slowLaneTimer = null;
  }

  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  releaseLock();
  log('change', `shutdown (exit ${code})`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// CLI: --once
// ---------------------------------------------------------------------------

async function onceMode() {
  // Run aggregate synchronously then emit
  const aggResult = spawnSync('node', [AGGREGATE_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: 'inherit',
  });

  if (aggResult.status !== 0) {
    process.exit(1);
  }

  const emitResult = spawnSync('node', [EMIT_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: 'inherit',
  });

  process.exit(emitResult.status === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// CLI: --pause / --resume / --rescan-full
// ---------------------------------------------------------------------------

function signalPause(pauseFlag) {
  const pidState = readPidFile();
  if (!pidState || !pidState.pid || !pidIsLive(pidState.pid)) {
    process.stderr.write('findings-watch: no running watcher found\n');
    process.exit(2);
  }
  pidState.paused = pauseFlag;
  writePidFile(pidState);
  process.stderr.write(
    `findings-watch: ${pauseFlag ? 'paused' : 'resumed'} watcher (pid=${pidState.pid})\n`,
  );
  process.exit(0);
}

function signalRescan() {
  const pidState = readPidFile();
  if (!pidState || !pidState.pid || !pidIsLive(pidState.pid)) {
    process.stderr.write('findings-watch: no running watcher found\n');
    process.exit(2);
  }
  pidState.rescanRequested = true;
  writePidFile(pidState);
  process.stderr.write(`findings-watch: rescan requested (pid=${pidState.pid})\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const flags = new Set(args);
  if (flags.has('--quiet')) state.quiet = true;

  // --pause / --resume are one-shot signals
  if (flags.has('--pause')) {
    signalPause(true);
    return; // unreachable
  }
  if (flags.has('--resume')) {
    signalPause(false);
    return; // unreachable
  }
  if (flags.has('--rescan-full')) {
    signalRescan();
    return; // unreachable
  }

  // --once
  if (flags.has('--once')) {
    await onceMode();
    return; // unreachable
  }

  // --start (default)
  log('change', `findings-watch starting, repo=${REPO_ROOT}`);

  acquireLock();
  state.startedAt = new Date().toISOString();

  // Register signal handlers BEFORE bootstrap (SIGTERM must clean up PID file)
  process.on('SIGINT', () => gracefulShutdown(0));
  process.on('SIGTERM', () => gracefulShutdown(0));

  // Prevent unhandled rejections from crashing the daemon
  process.on('unhandledRejection', (reason) => {
    log('error', `unhandled rejection: ${String(reason)}`);
  });

  process.on('uncaughtException', (err) => {
    log('error', `uncaught exception: ${err.message}`);
  });

  // Start watching FIRST so user-side changes during bootstrap are not lost.
  state.pollTimer = setInterval(pollControlFile, POLL_INTERVAL_MS);
  startWatcher();

  // Bootstrap aggregate runs in background; failures are logged but do not
  // prevent the watcher from honoring file changes via the fast lane.
  log('aggregate-trigger', 'bootstrap');
  runFullAggregate().catch((e) => {
    log('error', `bootstrap aggregate failed: ${e.message}`);
  });
}

main().catch((e) => {
  log('error', `fatal: ${e.message}`);
  process.exit(1);
});
