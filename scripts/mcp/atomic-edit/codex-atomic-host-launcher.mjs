#!/usr/bin/env node
/**
 * Launch a Codex-like agent command inside the current repo host boundary.
 *
 * This is not a global machine policy. It is the concrete launch boundary that
 * lets a future Codex process inherit a deny-by-default macOS sandbox marker:
 * writes are limited to the repo root, network is denied except for the single
 * inherited Unix socket to the atomic_exec broker, and Codex PreToolUse still has
 * to enforce atomic-only tool calls above it.
 *
 * BROKER: macOS refuses sandbox_apply inside an existing sandbox, so a
 * host-launched atomic_exec cannot re-apply its own per-command sandbox. This
 * launcher starts atomic-exec-broker.mjs OUTSIDE the host sandbox (a sibling
 * process) and exports ATOMIC_EXEC_BROKER_SOCKET into the wrapped Codex process.
 * atomic_exec delegates each host-mode command to the broker, which re-applies a
 * fresh deny-by-default sandbox-exec per command: network denied, writes confined
 * to cwd, and byte-effect proof still required for mutations. Without the
 * broker, atomic_exec fails closed.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const BROKER = path.join(here, 'atomic-exec-broker.mjs');

function die(message, code = 1) {
  process.stderr.write(message + '\n');
  process.exit(code);
}

function sandboxPath(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sandboxProfile(writeRoot, brokerSocket) {
  const realWriteRoot = fs.realpathSync(writeRoot);
  const escapedWriteRoot = sandboxPath(realWriteRoot);
  const escapedBrokerSocket = brokerSocket ? sandboxPath(brokerSocket) : null;
  return [
    '(version 1)',
    '(deny default)',
    '(allow file-read*)',
    '(allow file-write* (subpath "' + escapedWriteRoot + '"))',
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/stdout"))',
    '(allow file-write* (literal "/dev/stderr"))',
    '(allow process*)',
    '(allow mach-lookup)',
    '(allow sysctl-read)',
    // Default-deny still blocks every other network target. This one Unix
    // socket is the inescapable bridge back to the out-of-sandbox broker that
    // applies the stricter per-command sandbox for atomic_exec.
    ...(escapedBrokerSocket ? ['(allow network-outbound (literal "' + escapedBrokerSocket + '"))'] : []),
  ].join(' ');
}

function childEnv(brokerSocket) {
  return {
    ...process.env,
    ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
    ATOMIC_HOST_WRITE_ROOT: repoRoot,
    ATOMIC_HOST_ATOMIC_ONLY: '1',
    ATOMIC_HOST_AGENT: process.env.ATOMIC_HOST_AGENT ?? 'codex',
    ATOMIC_EXEC_BROKER_SOCKET: brokerSocket,
    CODEX_PROJECT_DIR: repoRoot,
    TMPDIR: repoRoot,
    TMP: repoRoot,
    TEMP: repoRoot,
  };
}

function startBroker() {
  const atomicDir = path.join(repoRoot, '.atomic');
  try {
    fs.mkdirSync(atomicDir, { recursive: true });
  } catch {
    /* best-effort */
  }
  const socket = path.join(atomicDir, `codex-broker-${process.pid}.sock`);
  try {
    fs.rmSync(socket, { force: true });
  } catch {
    /* fresh */
  }
  const child = spawn(process.execPath, [BROKER, socket], {
    cwd: repoRoot,
    env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: repoRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('broker did not become ready in time'));
      }
    }, 8000);
    child.stdout.on('data', (data) => {
      if (String(data).includes('ATOMIC_BROKER_READY') && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ child, socket });
      }
    });
    child.stderr.on('data', (data) => process.stderr.write('[atomic-exec-broker] ' + data));
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('broker exited early with code ' + code));
      }
    });
  });
}

const separator = process.argv.indexOf('--');
const command = separator >= 0 ? process.argv.slice(separator + 1) : process.argv.slice(2);
if (command.length === 0) {
  die('usage: codex-atomic-host-launcher.mjs -- <command> [args...]', 2);
}
if (!fs.existsSync(SANDBOX_EXEC)) {
  die(SANDBOX_EXEC + ' is required for the atomic host sandbox boundary.', 78);
}

startBroker()
  .then(({ child: brokerChild, socket }) => {
    const child = spawn(SANDBOX_EXEC, ['-p', sandboxProfile(repoRoot, socket), ...command], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: childEnv(socket),
    });
    const cleanup = () => {
      try {
        brokerChild.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      try {
        fs.rmSync(socket, { force: true });
      } catch {
        /* best-effort */
      }
    };
    child.on('exit', (code, signal) => {
      cleanup();
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
    child.on('error', (error) => {
      cleanup();
      die(error.message, 1);
    });
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  })
  .catch((error) => die('could not start the per-command sandbox broker: ' + (error instanceof Error ? error.message : String(error)), 1));
