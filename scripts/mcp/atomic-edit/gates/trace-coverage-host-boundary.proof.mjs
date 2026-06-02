#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const audit = path.join(sourceDir, 'trace-coverage-audit.mjs');
const socketPath = path.join(sourceDir, `.proof-host-boundary-${process.pid}-${Date.now()}.sock`);

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function runAudit(env, args = ['--json']) {
  const result = childProcess.spawnSync(process.execPath, [audit, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, ...env },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch (error) {
    parsed = { parseError: error instanceof Error ? error.message : String(error), stdout: result.stdout };
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

function withSocket(fn) {
  return new Promise((resolve, reject) => {
    fs.rmSync(socketPath, { force: true });
    const server = net.createServer((socket) => socket.end());
    server.on('error', reject);
    server.listen(socketPath, async () => {
      try {
        resolve(await fn());
      } catch (error) {
        reject(error);
      } finally {
        server.close();
        fs.rmSync(socketPath, { force: true });
      }
    });
  });
}

async function main() {
  const results = [];
  const unhostedEnv = {
    ATOMIC_HOST_SANDBOX: '',
    ATOMIC_HOST_ATOMIC_ONLY: '',
    ATOMIC_HOST_WRITE_ROOT: '',
    ATOMIC_EXEC_BROKER_SOCKET: '',
    TMPDIR: '',
    TMP: '',
    TEMP: '',
  };
  const unhosted = runAudit(unhostedEnv);
  record(
    results,
    'trace coverage audit reports missing active host boundary without failing advisory mode',
    unhosted.status === 0 && unhosted.parsed?.hostBoundary?.pass === false && unhosted.parsed?.hostBoundary?.active === false,
    unhosted,
  );

  const strictUnhosted = runAudit(unhostedEnv, ['--json', '--strict-host-boundary']);
  record(
    results,
    'trace coverage audit hard-fails missing host boundary in strict host mode',
    strictUnhosted.status === 1 && strictUnhosted.parsed?.hostBoundary?.pass === false,
    strictUnhosted,
  );

  await withSocket(async () => {
    const hostedEnv = {
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      ATOMIC_EXEC_BROKER_SOCKET: socketPath,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    };
    const hosted = runAudit(hostedEnv);
    record(
      results,
      'trace coverage audit recognizes a complete active host boundary witness',
      hosted.status === 0 &&
        hosted.parsed?.hostBoundary?.pass === true &&
        hosted.parsed?.hostBoundary?.writeRootMatchesRepo === true &&
        hosted.parsed?.hostBoundary?.tempPinnedToRepo === true &&
        hosted.parsed?.hostBoundary?.brokerSocketIsSocket === true,
      hosted,
    );
  });

  const hooks = fs.readFileSync(path.join(repoRoot, '.codex', 'hooks.json'), 'utf8');
  record(
    results,
    'workspace Stop hook invokes trace-coverage-audit.mjs',
    hooks.includes('trace-coverage-audit.mjs'),
  );

  return { ok: results.every((entry) => entry.ok), results };
}

main().then((payload) => {
  if (jsonMode) process.stdout.write(JSON.stringify(payload) + '\n');
  else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
  process.exit(payload.ok ? 0 : 1);
}).catch((error) => {
  const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (jsonMode) process.stdout.write(JSON.stringify(payload) + '\n');
  else process.stderr.write(payload.error + '\n');
  process.exit(1);
});
