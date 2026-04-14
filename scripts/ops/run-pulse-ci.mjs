#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const timeoutMs = Number.parseInt(process.env.PULSE_CI_TIMEOUT_MS || '', 10) || 300000;
const isWindows = process.platform === 'win32';
let timeoutTriggered = false;
let forceKillTimer = null;
let forceExitTimer = null;

function killChildTree(pid, signal) {
  if (!pid) return;

  try {
    if (isWindows) {
      process.kill(pid, signal);
      return;
    }

    // Detached children become the leader of their own process group, so
    // negative pid targets the whole tree (browser probes, ts-node children, etc.).
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // best effort
    }
  }
}

const child = spawn(
  process.execPath,
  [path.join(rootDir, 'scripts', 'pulse', 'run.js'), '--certify', '--tier', '0'],
  {
    cwd: rootDir,
    detached: !isWindows,
    stdio: 'inherit',
    env: {
      ...process.env,
      PULSE_DISABLE_LOCAL_ENV: process.env.PULSE_DISABLE_LOCAL_ENV || 'true',
      PULSE_EXECUTION_TRACE_PATH:
        process.env.PULSE_EXECUTION_TRACE_PATH ||
        (process.env.CI === 'true' ? path.join(rootDir, 'PULSE_EXECUTION_TRACE.json') : ''),
    },
  },
);

const timer = setTimeout(() => {
  timeoutTriggered = true;
  console.error(
    `PULSE CI timed out after ${timeoutMs}ms. Investigate deep runtime probes or raise PULSE_CI_TIMEOUT_MS if the longer runtime is intentional.`,
  );

  killChildTree(child.pid, 'SIGTERM');

  forceKillTimer = setTimeout(() => {
    killChildTree(child.pid, 'SIGKILL');
  }, 5000);

  forceExitTimer = setTimeout(() => {
    process.exit(124);
  }, 6000);
}, timeoutMs);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (forceExitTimer) clearTimeout(forceExitTimer);

  if (signal) {
    process.exit(124);
  }

  if (timeoutTriggered) {
    process.exit(124);
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  clearTimeout(timer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (forceExitTimer) clearTimeout(forceExitTimer);
  console.error(`Failed to start PULSE CI: ${error.message}`);
  process.exit(1);
});
