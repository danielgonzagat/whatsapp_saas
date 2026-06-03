#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const codexHome = path.join(os.homedir(), '.codex');
const launcher = path.join(sourceDir, 'codex-atomic-host-launcher.mjs');
const allowed = path.join(sourceDir, '.whole-host-launcher-allowed-' + process.pid + '-' + Date.now() + '.tmp');
const codexRuntimeAllowed = path.join(codexHome, 'tmp', '.whole-host-launcher-codex-runtime-' + process.pid + '-' + Date.now() + '.tmp');
const codexSocketAllowed = path.join(codexHome, 'tmp', '.whole-host-launcher-codex-runtime-' + process.pid + '-' + Date.now() + '.sock');
const codexRootForbidden = path.join(codexHome, '.whole-host-launcher-forbidden-' + process.pid + '-' + Date.now() + '.tmp');
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

function tryOpen(file, flags = 'r+') {
  try {
    const fd = fs.openSync(file, flags);
    fs.closeSync(fd);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function inheritedHostMode() {
  return process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' && process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
}

function cleanup() {
  fs.rmSync(allowed, { force: true });
  fs.rmSync(codexRuntimeAllowed, { force: true });
  fs.rmSync(codexSocketAllowed, { force: true });
  fs.rmSync(codexRootForbidden, { force: true });
  fs.rmSync(forbidden, { force: true });
  fs.rmSync(tmpForbidden, { force: true });
}

function currentBoundaryProof() {
  const results = [];
  cleanup();

  record(
    results,
    'current process is marked as atomic host sandbox',
    inheritedHostMode() &&
      process.env.ATOMIC_HOST_WRITE_ROOT === repoRoot &&
      process.env.CODEX_HOME === codexHome &&
      process.env.TMPDIR === repoRoot &&
      process.env.TMP === repoRoot &&
      process.env.TEMP === repoRoot,
    {
      ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX,
      ATOMIC_HOST_ATOMIC_ONLY: process.env.ATOMIC_HOST_ATOMIC_ONLY,
      ATOMIC_HOST_WRITE_ROOT: process.env.ATOMIC_HOST_WRITE_ROOT,
      CODEX_HOME: process.env.CODEX_HOME,
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

  const codexRuntimeWrite = tryWrite(codexRuntimeAllowed, 'ok');
  record(results, 'current host boundary allows Codex runtime writes under CODEX_HOME/tmp', codexRuntimeWrite.ok && fs.existsSync(codexRuntimeAllowed), codexRuntimeWrite);

  const ttyOpen = tryOpen('/dev/tty');
  const ttyAllowedOrNoControllingTty = ttyOpen.ok || /\bENXIO\b/.test(String(ttyOpen.error ?? ''));
  record(results, 'current host boundary does not sandbox-deny /dev/tty', ttyAllowedOrNoControllingTty, ttyOpen);

  const unixSocket = childProcess.spawnSync(
    process.execPath,
    ['-e', 'const fs=require("node:fs"); const net=require("node:net"); const p=process.env.CODEX_SOCKET_ALLOWED; fs.rmSync(p,{force:true}); const s=net.createServer(); s.on("error", e => { console.error(e.code || e.message); process.exit(1); }); s.listen(p, () => { console.log("ok"); s.close(() => fs.rmSync(p,{force:true})); });'],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, CODEX_SOCKET_ALLOWED: codexSocketAllowed }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  record(results, 'current host boundary allows Codex runtime Unix sockets under CODEX_HOME/tmp', unixSocket.status === 0, {
    status: unixSocket.status,
    stdout: unixSocket.stdout,
    stderr: unixSocket.stderr,
  });

  const codexRootWrite = tryWrite(codexRootForbidden, 'ok');
  record(
    results,
    'current host boundary allows Codex-owned writes under CODEX_HOME',
    codexRootWrite.ok && fs.existsSync(codexRootForbidden),
    codexRootWrite,
  );

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
      'const dns=require("node:dns"); dns.lookup("developers.openai.com", (error) => { if (error) { console.error(error.code || error.message); process.exit(3); } process.exit(0); });',
    ],
    { cwd: repoRoot, encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  record(
    results,
    'current host boundary resolves DNS for Codex HTTP MCPs (per-command atomic_exec stays broker-denied)',
    network.status === 0,
    { status: network.status, stdout: network.stdout, stderr: network.stderr },
  );

  cleanup();
  return { ok: results.every((entry) => entry.ok), mode: 'inherited-host', results };
}

function launcherProof() {
  const results = [];
  cleanup();

  const envCheck = run('test "$ATOMIC_HOST_SANDBOX" = macos-sandbox-exec && test "$ATOMIC_HOST_ATOMIC_ONLY" = 1 && test "$ATOMIC_HOST_WRITE_ROOT" = "$PWD" && test "$CODEX_HOME" = "$HOME/.codex" && test "$TMPDIR" = "$PWD" && test "$TMP" = "$PWD" && test "$TEMP" = "$PWD"');
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

  const codexRuntimeWrite = run('node -e "require(\\\"node:fs\\\").writeFileSync(process.env.CODEX_RUNTIME_ALLOWED,\\\"ok\\\")"', { CODEX_RUNTIME_ALLOWED: codexRuntimeAllowed });
  record(results, 'launcher allows Codex runtime writes under CODEX_HOME/tmp', codexRuntimeWrite.status === 0 && fs.existsSync(codexRuntimeAllowed), {
    status: codexRuntimeWrite.status,
    stdout: codexRuntimeWrite.stdout,
    stderr: codexRuntimeWrite.stderr,
  });

  const ttyOpen = run('node -e "const fs=require(\\\"node:fs\\\"); const fd=fs.openSync(\\\"/dev/tty\\\",\\\"r+\\\"); fs.closeSync(fd);"');
  const ttyAllowedOrNoControllingTty = ttyOpen.status === 0 || /\bENXIO\b/.test(ttyOpen.stderr);
  record(results, 'launcher does not sandbox-deny the interactive TUI /dev/tty open', ttyAllowedOrNoControllingTty, {
    status: ttyOpen.status,
    stdout: ttyOpen.stdout,
    stderr: ttyOpen.stderr,
  });

  const codexSocket = run('node -e "const fs=require(\\\"node:fs\\\"); const net=require(\\\"node:net\\\"); const p=process.env.CODEX_SOCKET_ALLOWED; fs.rmSync(p,{force:true}); const s=net.createServer(); s.on(\\\"error\\\", e => { console.error(e.code || e.message); process.exit(1); }); s.listen(p, () => { console.log(\\\"ok\\\"); s.close(() => fs.rmSync(p,{force:true})); });"', { CODEX_SOCKET_ALLOWED: codexSocketAllowed });
  record(results, 'launcher allows Codex runtime Unix sockets under CODEX_HOME/tmp', codexSocket.status === 0, {
    status: codexSocket.status,
    stdout: codexSocket.stdout,
    stderr: codexSocket.stderr,
  });

  const codexRootWrite = run('node -e "require(\\\"node:fs\\\").writeFileSync(process.env.CODEX_ROOT_ALLOWED,\\\"ok\\\")"', { CODEX_ROOT_ALLOWED: codexRootForbidden });
  record(results, 'launcher allows Codex-owned writes under CODEX_HOME', codexRootWrite.status === 0 && fs.existsSync(codexRootForbidden), {
    status: codexRootWrite.status,
    stdout: codexRootWrite.stdout,
    stderr: codexRootWrite.stderr,
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

  const network = run('node -e "const dns=require(\\\"node:dns\\\"); dns.lookup(\\\"developers.openai.com\\\", (error) => { if (error) { console.error(error.code || error.message); process.exit(3); } process.exit(0); });"');
  record(results, 'launcher resolves DNS for Codex HTTP MCPs (per-command atomic_exec stays broker-denied)', network.status === 0, {
    status: network.status,
    stdout: network.stdout,
    stderr: network.stderr,
  });

  cleanup();
  return { ok: results.every((entry) => entry.ok), mode: 'launcher', results };
}

const payload = inheritedHostMode() ? currentBoundaryProof() : launcherProof();
if (jsonMode) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
} else if (!payload.ok) {
  process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
}
process.exit(payload.ok ? 0 : 1);
