#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.join(sourceDir, 'codex-atomic-host-launcher.mjs');
const allowed = path.join(sourceDir, '.whole-host-launcher-allowed-' + process.pid + '-' + Date.now() + '.tmp');
const forbidden = path.join(path.dirname(repoRoot), '.whole-host-launcher-forbidden-' + process.pid + '-' + Date.now() + '.tmp');
const tmpForbidden = path.join('/tmp', '.whole-host-launcher-forbidden-' + process.pid + '-' + Date.now() + '.tmp');

function run(command, env = {}) {
  return childProcess.spawnSync(process.execPath, [launcher, '--', '/bin/bash', '-lc', command], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function tryWrite(file, text = 'x') {
  try {
    fs.writeFileSync(file, text);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function inheritedHostMode() {
  return process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' && process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
}

function currentBoundaryProof() {
  const results = [];
  fs.rmSync(allowed, { force: true });
  fs.rmSync(forbidden, { force: true });
  fs.rmSync(tmpForbidden, { force: true });

  record(
    results,
    'current process is marked as atomic host sandbox',
    inheritedHostMode() && process.env.ATOMIC_HOST_WRITE_ROOT === repoRoot && process.env.TMPDIR === repoRoot && process.env.TMP === repoRoot && process.env.TEMP === repoRoot,
    {
      ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX,
      ATOMIC_HOST_ATOMIC_ONLY: process.env.ATOMIC_HOST_ATOMIC_ONLY,
      ATOMIC_HOST_WRITE_ROOT: process.env.ATOMIC_HOST_WRITE_ROOT,
      TMPDIR: process.env.TMPDIR,
      TMP: process.env.TMP,
      TEMP: process.env.TEMP,
    },
  );
  record(
    results,
    'current host boundary has inherited broker socket',
    Boolean(process.env.ATOMIC_EXEC_BROKER_SOCKET),
    { socket: process.env.ATOMIC_EXEC_BROKER_SOCKET ?? null },
  );

  const allowedWrite = tryWrite(allowed, 'ok');
  record(results, 'current host boundary allows writes inside repo root', allowedWrite.ok && fs.existsSync(allowed), allowedWrite);

  const outsideWrite = tryWrite(forbidden, 'x');
  record(
    results,
    'current host boundary denies writes outside repo root',
    outsideWrite.ok === false && !fs.existsSync(forbidden) && /EPERM|EACCES|Operation not permitted|not permitted/i.test(String(outsideWrite.error ?? '')),
    outsideWrite,
  );

  const tmpWrite = tryWrite(tmpForbidden, 'x');
  record(
    results,
    'current host boundary denies temp writes outside repo root',
    tmpWrite.ok === false && !fs.existsSync(tmpForbidden) && /EPERM|EACCES|Operation not permitted|not permitted/i.test(String(tmpWrite.error ?? '')),
    tmpWrite,
  );

  const network = childProcess.spawnSync(
    process.execPath,
    [
      '-e',
      'const net=require("node:net"); const s=net.connect(9,"127.0.0.1"); s.on("error", e => { console.error(e.code || e.message); process.exit((e.code==="EPERM" || e.code==="EACCES") ? 0 : 1); }); setTimeout(() => process.exit(2), 1000);',
    ],
    { cwd: repoRoot, encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  record(
    results,
    'current host boundary denies network from child process',
    network.status === 0 && /EPERM|EACCES|Operation not permitted|not permitted/i.test(network.stderr),
    { status: network.status, stdout: network.stdout, stderr: network.stderr },
  );

  fs.rmSync(allowed, { force: true });
  fs.rmSync(forbidden, { force: true });
  fs.rmSync(tmpForbidden, { force: true });
  return { ok: results.every((entry) => entry.ok), mode: 'inherited-host', results };
}

function launcherProof() {
  const results = [];
  fs.rmSync(allowed, { force: true });
  fs.rmSync(forbidden, { force: true });
  fs.rmSync(tmpForbidden, { force: true });

  const envCheck = run('test "$ATOMIC_HOST_SANDBOX" = macos-sandbox-exec && test "$ATOMIC_HOST_ATOMIC_ONLY" = 1 && test "$ATOMIC_HOST_WRITE_ROOT" = "$PWD" && test "$TMPDIR" = "$PWD" && test "$TMP" = "$PWD" && test "$TEMP" = "$PWD"');
  record(results, 'launcher marks child as atomic host sandbox', envCheck.status === 0, {
    status: envCheck.status,
    stdout: envCheck.stdout,
    stderr: envCheck.stderr,
  });

  const allowedWrite = run('node -e "require(\\\"node:fs\\\").writeFileSync(process.env.ALLOWED,\\\"ok\\\")"', { ALLOWED: allowed });
  record(results, 'launcher allows writes inside repo root', allowedWrite.status === 0 && fs.existsSync(allowed), {
    status: allowedWrite.status,
    stdout: allowedWrite.stdout,
    stderr: allowedWrite.stderr,
  });

  const deniedWrite = run('node -e "require(\\\"node:fs\\\").writeFileSync(process.env.FORBIDDEN,\\\"x\\\")"', { FORBIDDEN: forbidden });
  record(results, 'launcher denies writes outside repo root', deniedWrite.status !== 0 && !fs.existsSync(forbidden) && /EPERM|EACCES|Operation not permitted|not permitted/i.test(deniedWrite.stderr), {
    status: deniedWrite.status,
    stdout: deniedWrite.stdout,
    stderr: deniedWrite.stderr,
  });

  const deniedTmp = run(`node -e 'require("node:fs").writeFileSync(process.env.TMP_FORBIDDEN,"x")'`, { TMP_FORBIDDEN: tmpForbidden });
  record(results, 'launcher denies temp writes outside repo root', deniedTmp.status !== 0 && !fs.existsSync(tmpForbidden) && /EPERM|EACCES|Operation not permitted|not permitted/i.test(deniedTmp.stderr), {
    status: deniedTmp.status,
    stdout: deniedTmp.stdout,
    stderr: deniedTmp.stderr,
  });

  const network = run('node -e "const net=require(\\\"node:net\\\"); const s=net.connect(9,\\\"127.0.0.1\\\"); s.on(\\\"error\\\", e => { console.error(e.code || e.message); process.exit((e.code===\\\"EPERM\\\" || e.code===\\\"EACCES\\\") ? 0 : 1); }); setTimeout(() => process.exit(2), 1000);"');
  record(results, 'launcher denies network from child process', network.status === 0 && /EPERM|EACCES|Operation not permitted|not permitted/i.test(network.stderr), {
    status: network.status,
    stdout: network.stdout,
    stderr: network.stderr,
  });

  fs.rmSync(allowed, { force: true });
  fs.rmSync(forbidden, { force: true });
  fs.rmSync(tmpForbidden, { force: true });
  return { ok: results.every((entry) => entry.ok), mode: 'launcher', results };
}

const payload = inheritedHostMode() ? currentBoundaryProof() : launcherProof();
if (jsonMode) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
} else if (!payload.ok) {
  process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
}
process.exit(payload.ok ? 0 : 1);
