#!/usr/bin/env node
/**
 * PROOF — the atomic-edit MCP CONNECTS under the Claude host launch (no-bypass
 * for Claude is real, not just for Codex).
 *
 * A plain `claude` session does NOT set the host-sandbox env, so
 * atomic-edit-mcp-launcher.sh exits 79/80 and the MCP never connects
 * (`/mcp` -> -32000). This proof reproduces what claude-atomic-host-launcher.mjs
 * provides — an out-of-sandbox broker + the four ATOMIC_HOST_* env vars — then
 * drives the REAL launcher through a real MCP stdio handshake (initialize +
 * tools/list) and asserts the server connects and serves its tool set.
 *
 * This is the connection chain the user's `/mcp` reconnect could not complete.
 * Falsifiable: unset any ATOMIC_HOST_* var (or stop the broker) and the launcher
 * exits 79/80, tools/list never arrives, and this exits 1.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..'); // scripts/mcp/atomic-edit
const repoRoot = path.resolve(root, '../../..');
const brokerPath = path.join(root, 'atomic-exec-broker.mjs');
const launcher = path.join(repoRoot, 'scripts/mcp/atomic-edit-mcp-launcher.sh');
const atomicDir = path.join(repoRoot, '.atomic');
const socket = path.join(atomicDir, `selfhost-proof-${process.pid}.sock`);

let failures = 0;
const results = [];
const expect = (cond, name) => {
  results.push({ name, ok: !!cond });
  if (!cond) failures++;
};

function startBroker() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [brokerPath, socket], {
      cwd: repoRoot,
      env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: repoRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const to = setTimeout(() => reject(new Error('broker did not become ready in 8s')), 8000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('ATOMIC_BROKER_READY')) {
        clearTimeout(to);
        resolve(child);
      }
    });
    child.on('exit', (c) => {
      clearTimeout(to);
      reject(new Error('broker exited early: ' + c));
    });
  });
}

function handshake() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      ATOMIC_HOST_AGENT: 'claude',
      ATOMIC_EXEC_BROKER_SOCKET: socket,
    };
    const srv = spawn('bash', [launcher], { cwd: repoRoot, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let stderr = '';
    let done = false;
    const finish = (fn, arg) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      try {
        srv.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      fn(arg);
    };
    const to = setTimeout(
      () => finish(reject, new Error('handshake timeout; stderr tail: ' + stderr.slice(-400))),
      45000,
    );
    srv.stderr.on('data', (d) => {
      stderr += String(d);
    });
    srv.stdout.on('data', (d) => {
      buf += String(d);
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
        } else if (msg.id === 2 && msg.result) {
          finish(resolve, msg.result.tools || []);
        }
      }
    });
    srv.on('exit', (c) =>
      finish(reject, new Error('launcher/server exited ' + c + ' before tools/list; stderr tail: ' + stderr.slice(-400))),
    );
    srv.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'selfhost-proof', version: '1' } },
      }) + '\n',
    );
  });
}

let brokerChild = null;
try {
  mkdirSync(atomicDir, { recursive: true });
  try {
    rmSync(socket, { force: true });
  } catch {
    /* fresh */
  }
  brokerChild = await startBroker();
  expect(true, 'out-of-sandbox broker started (ATOMIC_BROKER_READY)');
  const tools = await handshake();
  const names = new Set((tools || []).map((t) => t.name));
  expect(
    Array.isArray(tools) && tools.length >= 20,
    `atomic MCP CONNECTED under host launch and listed ${tools?.length} tools (>=20)`,
  );
  expect(
    names.has('atomic_replace_text') || names.has('atomic_edit') || names.has('atomic_replace_range'),
    'a core atomic edit tool is exposed',
  );
  expect(
    names.has('code_read_symbol') || names.has('code_outline'),
    'a structured read tool is exposed',
  );
} catch (error) {
  expect(false, `chain failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    brokerChild?.kill('SIGKILL');
  } catch {
    /* already gone */
  }
  try {
    rmSync(socket, { force: true });
  } catch {
    /* best-effort */
  }
}

if (jsonMode) {
  console.log(JSON.stringify({ proof: 'claude-self-host-connects', ok: failures === 0, results }));
} else {
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  console.log(failures === 0 ? 'PROOF PASS' : `PROOF FAIL (${failures} assertion(s) failed)`);
}
process.exit(failures === 0 ? 0 : 1);
