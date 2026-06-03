#!/usr/bin/env node
/**
 * Launch a Codex-like agent command inside the current repo host boundary.
 *
 * This is not a global machine policy. It is the concrete launch boundary that
 * lets a future Codex process inherit a deny-by-default macOS sandbox marker:
 * writes are limited to the repo root plus Codex-owned runtime state under
 * CODEX_HOME, host runtime network is allowed for Codex/MCP remotes, and
 * Codex PreToolUse still has
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
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const REAL_CODEX = '/opt/homebrew/bin/codex';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const BROKER = path.join(here, 'atomic-exec-broker.mjs');
const BROKER_STATE = path.join(repoRoot, ".atomic", "codex-broker-current.json");

function die(message, code = 1) {
  process.stderr.write(message + '\n');
  process.exit(code);
}

function sandboxPath(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function realpathIfPresent(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function codexHomePath() {
  return realpathIfPresent(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'));
}

function subpathWriteRule(value) {
  return '(allow file-write* (subpath "' + sandboxPath(value) + '"))';
}

function codexRuntimeWriteRules(codexHome) {
  return [subpathWriteRule(codexHome)];
}

function codexRuntimeNetworkRules(codexHome) {
  const escapedCodexHome = sandboxPath(codexHome);
  return [
    '(allow network-bind (subpath "' + escapedCodexHome + '"))',
    '(allow network-outbound (subpath "' + escapedCodexHome + '"))',
  ];
}

function sandboxProfile(writeRoot, brokerSocket, codexHome) {
  const realWriteRoot = fs.realpathSync(writeRoot);
  const escapedBrokerSocket = brokerSocket ? sandboxPath(brokerSocket) : null;
  return [
    '(version 1)',
    '(deny default)',
    '(allow file-read*)',
    subpathWriteRule(realWriteRoot),
    ...codexRuntimeWriteRules(codexHome),
    ...codexRuntimeNetworkRules(codexHome),
    // Codex's reasoning stream, DNS, and several MCPs are HTTP/remote.
    // atomic_exec remains network-denied by the out-of-sandbox broker.
    '(allow network-outbound)',
    '(allow network-inbound (local ip "localhost:*"))',
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/stdout"))',
    '(allow file-write* (literal "/dev/stderr"))',
    '(allow file* (regex #"^/dev/tty.*"))',
    '(allow process*)',
    '(allow mach-lookup)',
    '(allow sysctl-read)',
    // This broker socket is the explicit bridge back to the out-of-sandbox
    // broker that applies the stricter per-command sandbox for atomic_exec.
    ...(escapedBrokerSocket ? ['(allow network-outbound (literal "' + escapedBrokerSocket + '"))'] : []),
  ].join(' ');
}

function childEnv(brokerSocket, codexHome) {
  return {
    ...process.env,
    ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
    ATOMIC_HOST_WRITE_ROOT: repoRoot,
    ATOMIC_HOST_ATOMIC_ONLY: '1',
    ATOMIC_HOST_AGENT: process.env.ATOMIC_HOST_AGENT ?? 'codex',
    ATOMIC_EXEC_BROKER_SOCKET: brokerSocket,
    CODEX_HOME: codexHome,
    CODEX_PROJECT_DIR: repoRoot,
    TMPDIR: repoRoot,
    TMP: repoRoot,
    TEMP: repoRoot,
  };
}

function normalizeAgentCommand(command) {
  if (command[0] === 'codex' && fs.existsSync(REAL_CODEX)) {
    return [REAL_CODEX, ...command.slice(1)];
  }
  return command;
}

function writeBrokerState(socket, codexHome) {
  const payload = {
    agent: "codex",
    repoRoot,
    socket,
    codexHome,
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(BROKER_STATE), { recursive: true });
  fs.writeFileSync(BROKER_STATE, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
}

function clearBrokerState(socket) {
  try {
    const payload = JSON.parse(fs.readFileSync(BROKER_STATE, "utf8"));
    if (payload?.socket === socket) fs.rmSync(BROKER_STATE, { force: true });
  } catch {
    /* best-effort */
  }
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
    const codexHome = codexHomePath();
    writeBrokerState(socket, codexHome);
    const child = spawn(SANDBOX_EXEC, ['-p', sandboxProfile(repoRoot, socket, codexHome), ...normalizeAgentCommand(command)], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: childEnv(socket, codexHome),
    });
    const cleanup = () => {
      clearBrokerState(socket);
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
