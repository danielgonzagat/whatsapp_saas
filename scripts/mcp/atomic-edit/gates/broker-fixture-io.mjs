import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');

function permissionDenied(error) {
  return Boolean(error && typeof error === 'object' && ['EPERM', 'EACCES', 'EROFS'].includes(error.code));
}

function shellPath(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function hostWriteRoot() {
  return process.env.ATOMIC_HOST_WRITE_ROOT ? path.resolve(process.env.ATOMIC_HOST_WRITE_ROOT) : repoRoot;
}

function nearestExistingPath(absPath) {
  let current = path.resolve(absPath);
  while (!fs.existsSync(current)) {
    const next = path.dirname(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function hostVisiblePath(absPath) {
  const target = path.resolve(absPath);
  const root = hostWriteRoot();
  try {
    const rootReal = fs.realpathSync(root);
    const existing = nearestExistingPath(target);
    const existingReal = fs.realpathSync(existing);
    if (existingReal === rootReal || existingReal.startsWith(rootReal + path.sep)) {
      return path.join(root, path.relative(rootReal, existingReal), path.relative(existing, target));
    }
  } catch {
    // Fall back to the original target; the broker will fail closed if it is outside its write root.
  }
  return target;
}

function brokerClientPath() {
  return path.join(hostWriteRoot(), 'scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs');
}

function runBrokerFixtureOp(op, absPath, stdin, mode) {
  const socket = process.env.ATOMIC_EXEC_BROKER_SOCKET ?? '';
  const client = brokerClientPath();
  if (!socket || process.env.ATOMIC_EXEC_BROKER_ROOT || !fs.existsSync(client)) {
    throw new Error(`fixture broker fallback unavailable for ${op} ${absPath}`);
  }

  const target = hostVisiblePath(absPath);
  const root = hostWriteRoot();
  const scripts = {
    mkdir: "const fs=require('node:fs'); fs.mkdirSync(process.argv[1], { recursive: true });",
    rm: "const fs=require('node:fs'); fs.rmSync(process.argv[1], { recursive: true, force: true });",
    write: "const fs=require('node:fs'); const mode=process.argv[2]; fs.writeFileSync(process.argv[1], fs.readFileSync(0, 'utf8')); if (mode) fs.chmodSync(process.argv[1], Number(mode));",
  };
  const command = `${shellPath(process.execPath)} -e ${shellPath(scripts[op])} ${shellPath(target)}${mode === undefined ? '' : ` ${shellPath(String(mode))}`}`;
  const request = JSON.stringify({
    command,
    cwd: root,
    effectRoot: root,
    timeoutMs: 30000,
    env: {
      ...process.env,
      ATOMIC_HOST_WRITE_ROOT: root,
      CODEX_PROJECT_DIR: process.env.CODEX_PROJECT_DIR ?? root,
      TMPDIR: root,
      TMP: root,
      TEMP: root,
    },
    ...(stdin === undefined ? {} : { stdin }),
  });
  const result = childProcess.spawnSync(process.execPath, [client, socket], {
    cwd: root,
    input: request,
    encoding: 'utf8',
    timeout: 35000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  let reply;
  try {
    reply = JSON.parse(result.stdout || '{}');
  } catch (error) {
    throw new Error(`fixture broker reply was not JSON: ${String(error)} stdout=${String(result.stdout).slice(0, 500)}`);
  }
  const exitCode = typeof reply.exitCode === 'number' ? reply.exitCode : result.status;
  if (reply.brokerUnreachable || exitCode !== 0) {
    throw new Error(`fixture broker ${op} failed: exit=${String(exitCode)} error=${String(reply.error ?? '')} stderr=${String(reply.stderr ?? result.stderr ?? '').slice(0, 1000)}`);
  }
}

export function mkdirPath(absPath) {
  try {
    fs.mkdirSync(absPath, { recursive: true });
  } catch (error) {
    if (!permissionDenied(error)) throw error;
    runBrokerFixtureOp('mkdir', absPath);
  }
}

export function removePath(absPath) {
  try {
    fs.rmSync(absPath, { recursive: true, force: true });
  } catch (error) {
    if (!permissionDenied(error)) throw error;
    runBrokerFixtureOp('rm', absPath);
  }
}

export function writeText(absPath, text, mode) {
  try {
    fs.writeFileSync(absPath, text, mode === undefined ? undefined : { mode });
  } catch (error) {
    if (!permissionDenied(error)) throw error;
    runBrokerFixtureOp('write', absPath, text, mode);
  }
}
