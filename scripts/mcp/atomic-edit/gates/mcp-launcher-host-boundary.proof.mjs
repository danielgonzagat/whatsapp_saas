#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');
const brokerScript = path.join(sourceDir, 'atomic-exec-broker.mjs');

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

function inheritedBrokerSocket() {
  if (
    process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
    process.env.ATOMIC_HOST_ATOMIC_ONLY === '1' &&
    process.env.ATOMIC_EXEC_BROKER_SOCKET
  ) {
    return process.env.ATOMIC_EXEC_BROKER_SOCKET;
  }
  return null;
}

function startBroker() {
  const socketPath = path.join(sourceDir, `.proof-broker-${process.pid}-${Date.now()}.sock`);
  const proc = childProcess.spawn(process.execPath, [brokerScript, socketPath], {
    cwd: repoRoot,
    env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: repoRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  proc.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`broker did not become ready: stdout=${stdout} stderr=${stderr}`));
    }, 5000);
    proc.on('exit', (code) => {
      clearTimeout(deadline);
      if (!stdout.includes('ATOMIC_BROKER_READY')) {
        reject(new Error(`broker exited before ready: code=${code} stdout=${stdout} stderr=${stderr}`));
      }
    });
    const poll = setInterval(() => {
      if (stdout.includes('ATOMIC_BROKER_READY') && fs.existsSync(socketPath)) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve({ proc, socketPath, stdout, stderr });
      }
    }, 25);
  });
}

async function hostedLauncherStartsMcp(brokerSocket) {
  const transport = new StdioClientTransport({
    command: launcher,
    args: [],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      ATOMIC_EXEC_BROKER_SOCKET: brokerSocket,
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
  });
  const client = new Client({ name: 'mcp-launcher-host-boundary-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    return { ok: listed.tools?.some((tool) => tool.name === 'atomic_y_certificate') === true, tools: listed.tools?.length ?? 0 };
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
}

async function main() {
  const results = [];
  const denied = childProcess.spawnSync(launcher, [], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      ATOMIC_HOST_SANDBOX: '',
      ATOMIC_HOST_ATOMIC_ONLY: '',
      ATOMIC_HOST_WRITE_ROOT: '',
      ATOMIC_EXEC_BROKER_SOCKET: '',
    },
  });
  record(results, 'unhosted MCP launcher is refused before server start', denied.status === 79 && /requires the atomic host sandbox boundary/.test(denied.stderr ?? ''), {
    status: denied.status,
    stderr: denied.stderr,
  });

  const noBroker = childProcess.spawnSync(launcher, [], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      ATOMIC_EXEC_BROKER_SOCKET: '',
    },
  });
  record(results, 'host-marked MCP launcher is refused without broker socket', noBroker.status === 80 && /ATOMIC_EXEC_BROKER_SOCKET/.test(noBroker.stderr ?? ''), {
    status: noBroker.status,
    stderr: noBroker.stderr,
  });

  let broker;
  const inherited = inheritedBrokerSocket();
  try {
    const brokerSocket = inherited ?? (broker = await startBroker()).socketPath;
    const hosted = await hostedLauncherStartsMcp(brokerSocket);
    record(
      results,
      inherited
        ? 'inherited-broker host-marked MCP launcher starts the Atomic server'
        : 'broker-backed host-marked MCP launcher starts the Atomic server',
      hosted.ok === true,
      { ...hosted, inheritedBroker: Boolean(inherited) },
    );
  } finally {
    if (!inherited && broker?.proc) broker.proc.kill('SIGTERM');
    if (!inherited && broker?.socketPath) fs.rmSync(broker.socketPath, { force: true });
  }

  return { ok: results.every((entry) => entry.ok), results };
}

main().then((result) => {
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  else for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
  process.exit(result.ok ? 0 : 1);
}).catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exit(1);
});
