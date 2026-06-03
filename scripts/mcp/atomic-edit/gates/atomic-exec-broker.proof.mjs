#!/usr/bin/env node
/**
 * Proof: the out-of-sandbox broker enforces per-command containment and never
 * fakes success. Runs the broker as a normal (out-of-sandbox) daemon and drives
 * it through the sync client, asserting:
 *   1. client fail-closed when the broker is absent (refuse, not run unsandboxed)
 *   2. write inside effectRoot   -> allowed, file exists, exit 0
 *   3. write outside effectRoot  -> denied (EPERM), file absent
 *   4. effectRoot:null           -> denies cwd writes for read-only envelopes
 *   5. network connect           -> denied per-command (EPERM in stderr)
 *   6. real exit code returned   -> `exit 3` comes back exitCode===3
 *   7. invariant denial enforced -> `git restore .` refused by the broker
 *
 * The final payload is ALSO written to .atomic/broker-proof-last.json so the
 * result is readable even when run inside atomic_expand_self (which discards
 * proof stdout). Proves the broker independently of any host launch.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const dir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(dir, '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const broker = path.join(sourceDir, 'atomic-exec-broker.mjs');
const client = path.join(sourceDir, 'atomic-exec-broker-client.mjs');
const atomicDir = path.join(repoRoot, '.atomic');
const sock = path.join(atomicDir, `broker-proof-${process.pid}.sock`);
const fixture = path.join(sourceDir, `.broker-proof-${process.pid}`);
const homeForbidden = path.join(os.homedir(), `.broker-proof-forbidden-${process.pid}.tmp`);

function callBroker(req, sockPath = sock) {
  try {
    const out = execFileSync('node', [client, sockPath], { input: JSON.stringify(req), encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    const so = e.stdout ? String(e.stdout) : '';
    try {
      return JSON.parse(so);
    } catch {
      return { ok: false, error: 'client failed: ' + (e.message || ''), raw: so.slice(0, 300) };
    }
  }
}

function waitReady(child, stderrSink) {
  return new Promise((resolve, reject) => {
    let done = false;
    const to = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('broker did not become ready in time'));
      }
    }, 8000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('ATOMIC_BROKER_READY') && !done) {
        done = true;
        clearTimeout(to);
        resolve();
      }
    });
    child.stderr.on('data', (d) => stderrSink.push(String(d)));
    child.on('exit', (c) => {
      if (!done) {
        done = true;
        clearTimeout(to);
        reject(new Error('broker exited early with code ' + c + ' stderr=' + stderrSink.join('')));
      }
    });
  });
}

async function main() {
  const results = [];
  const stderrSink = [];
  fs.mkdirSync(atomicDir, { recursive: true });
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.mkdirSync(fixture, { recursive: true });
  fs.rmSync(sock, { force: true });
  fs.rmSync(homeForbidden, { force: true });

  const absent = callBroker(
    { command: 'echo hi', cwd: fixture, effectRoot: fixture },
    path.join(atomicDir, `absent-${process.pid}.sock`),
  );
  results.push({
    name: 'client fail-closed when broker absent',
    ok: absent.ok === false && (absent.brokerUnreachable === true || /unreachable|failed/i.test(String(absent.error || ''))),
    detail: absent,
  });

  const child = spawn('node', [broker, sock], {
    env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: repoRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitReady(child, stderrSink);
    const wb = (p) => `node -e 'require("fs").writeFileSync(${JSON.stringify(p)},"x")'`;

    const inFile = path.join(fixture, 'allowed.tmp');
    const r2 = callBroker({ command: wb(inFile), cwd: fixture, effectRoot: fixture });
    results.push({
      name: 'write inside effectRoot allowed',
      ok: r2.ok === true && r2.exitCode === 0 && fs.existsSync(inFile),
      detail: { exitCode: r2.exitCode, stderr: (r2.stderr || '').slice(0, 200) },
    });

    const r3 = callBroker({ command: wb(homeForbidden), cwd: fixture, effectRoot: fixture });
    results.push({
      name: 'write outside effectRoot denied',
      ok: r3.exitCode !== 0 && !fs.existsSync(homeForbidden) && /EPERM|not permitted/i.test(String(r3.stderr || '')),
      detail: { exitCode: r3.exitCode, stderr: (r3.stderr || '').slice(0, 200) },
    });

    const noWriteFile = path.join(fixture, 'no-write.tmp');
    fs.rmSync(noWriteFile, { force: true });
    const rNoWrite = callBroker({ command: wb(noWriteFile), cwd: fixture, effectRoot: null });
    results.push({
      name: 'explicit null effectRoot denies cwd writes',
      ok: rNoWrite.exitCode !== 0 && !fs.existsSync(noWriteFile) && /EPERM|not permitted/i.test(String(rNoWrite.stderr || '')),
      detail: { exitCode: rNoWrite.exitCode, stderr: (rNoWrite.stderr || '').slice(0, 200) },
    });

    const netCmd =
      `node -e 'const n=require("net");const s=n.connect(443,"1.1.1.1");s.on("error",e=>{console.error(e.code);process.exit(e.code==="EPERM"?0:1)});s.on("connect",()=>{process.exit(2)});setTimeout(()=>process.exit(3),1500)'`;
    const r4 = callBroker({ command: netCmd, cwd: fixture, effectRoot: fixture, timeoutMs: 6000 });
    results.push({
      name: 'network denied per-command',
      ok: /EPERM|not permitted/i.test(String(r4.stderr || '')),
      detail: { exitCode: r4.exitCode, stderr: (r4.stderr || '').slice(0, 200) },
    });

    const r5 = callBroker({ command: 'exit 3', cwd: fixture, effectRoot: fixture });
    results.push({
      name: 'real exit code returned (no fake success)',
      ok: r5.ok === false && r5.exitCode === 3,
      detail: { exitCode: r5.exitCode },
    });

    const r6 = callBroker({ command: 'git restore .', cwd: fixture, effectRoot: fixture });
    results.push({
      name: 'invariant denial enforced (git restore)',
      ok: r6.ok === false && /invariant/i.test(String(r6.error || '')),
      detail: r6,
    });
  } catch (e) {
    results.push({ name: 'broker lifecycle', ok: false, detail: { error: e instanceof Error ? e.message : String(e), brokerStderr: stderrSink.join('') } });
  } finally {
    try {
      child.kill('SIGTERM');
    } catch {
      /* best-effort */
    }
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(sock, { force: true });
    fs.rmSync(homeForbidden, { force: true });
  }

  return { ok: results.every((r) => r.ok), results };
}

main()
  .then((payload) => {
    try {
      fs.mkdirSync(atomicDir, { recursive: true });
      fs.writeFileSync(path.join(atomicDir, 'broker-proof-last.json'), JSON.stringify(payload, null, 2));
    } catch {
      /* best-effort persistence */
    }
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
    process.exit(payload.ok ? 0 : 1);
  })
  .catch((error) => {
    const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
    try {
      fs.mkdirSync(atomicDir, { recursive: true });
      fs.writeFileSync(path.join(atomicDir, 'broker-proof-last.json'), JSON.stringify(payload, null, 2));
    } catch {
      /* best-effort */
    }
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else console.error(payload.error);
    process.exit(1);
  });
