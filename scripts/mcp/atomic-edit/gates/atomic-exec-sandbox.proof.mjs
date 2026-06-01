#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * atomic_exec sandbox proof.
 *
 * Asserts that atomic_exec confines every command under a real OS sandbox:
 * cwd-only writes, network denied, byte-effect proven. With the out-of-sandbox
 * broker now backing host-launched mode (macOS forbids nested sandbox-exec),
 * host mode is byte-for-byte identical to non-host mode — cwd-only writes,
 * tempRoot=cwd, per-command network denial — so this proof runs the SAME
 * assertions in both modes (the broker engine label is 'macos-broker-sandbox',
 * the direct engine label is 'macos-sandbox-exec'; both report active:true,
 * fileWrites:'cwd-only', network:'denied'). Host mode additionally forces
 * proveEffect on EVERY command, so a trace-only command without proveEffect is
 * refused (asserted below).
 */
const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const fixture = path.join(sourceDir, '.atomic-exec-sandbox-' + process.pid + '-' + Date.now());
const forbidden = path.join(repoRoot, '.atomic-exec-sandbox-forbidden-' + process.pid + '-' + Date.now() + '.tmp');
const tmpForbidden = path.join('/tmp', '.atomic-exec-sandbox-forbidden-' + process.pid + '-' + Date.now() + '.tmp');

function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('invalid JSON tool result: ' + text.slice(0, 2000));
  }
}

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

async function callAtomicExec(client, command, args = {}) {
  const result = await client.callTool({
    name: 'atomic_exec',
    arguments: {
      command,
      timeoutMs: 30000,
      ...args,
    },
  });
  return parseToolResult(result);
}

function serverTransport() {
  const inheritedHostEnv = {
    ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX ?? '',
    ATOMIC_HOST_ATOMIC_ONLY: process.env.ATOMIC_HOST_ATOMIC_ONLY ?? '',
    ATOMIC_HOST_WRITE_ROOT: process.env.ATOMIC_HOST_WRITE_ROOT ?? '',
    ATOMIC_EXEC_BROKER_SOCKET: process.env.ATOMIC_EXEC_BROKER_SOCKET ?? '',
    TMPDIR: process.env.TMPDIR ?? '',
    TMP: process.env.TMP ?? '',
    TEMP: process.env.TEMP ?? '',
  };
  const compiledServer = path.join(sourceDir, 'dist', 'server.js');
  if (fs.existsSync(compiledServer)) {
    return new StdioClientTransport({
      command: process.execPath,
      args: [compiledServer],
      cwd: repoRoot,
      stderr: 'pipe',
      env: inheritedHostEnv,
    });
  }
  return new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(sourceDir, 'server.ts')],
    cwd: repoRoot,
    stderr: 'pipe',
    env: inheritedHostEnv,
  });
}

async function main() {
  const results = [];
  const hostMode = process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' && process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
  // With the broker, host mode is identical to non-host mode: cwd-only writes,
  // tempRoot=cwd, network denied. Only the engine label differs.
  const expectedWriteMode = 'cwd-only';
  const expectedTempRoot = fixture;
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.mkdirSync(fixture, { recursive: true });
  fs.rmSync(forbidden, { force: true });
  fs.rmSync(tmpForbidden, { force: true });

  const transport = serverTransport();
  const client = new Client({ name: 'atomic-exec-sandbox-proof', version: '1.0.0' });

  try {
    await client.connect(transport);

    const allowed = await callAtomicExec(
      client,
      'node -e "require(\\"node:fs\\").writeFileSync(\\"allowed.tmp\\",\\"ok\\")"',
      { cwd: fixture, proveEffect: true },
    );
    const allowedEffectFiles = Array.isArray(allowed.effect?.files) ? allowed.effect.files : [];
    const allowedEffectSummary = allowed.effect
      ? {
          changedFiles: allowed.effect.changedFiles,
          limitReached: allowed.effect.limitReached,
          files: allowedEffectFiles.map((entry) => ({
            file: entry.file,
            change: entry.change,
            bytesBefore: entry.bytesBefore,
            bytesAfter: entry.bytesAfter,
          })),
        }
      : null;
    const allowedFileCaptured = allowedEffectFiles.some(
      (entry) => entry.file === 'allowed.tmp' && entry.change === 'created',
    );
    record(
      results,
      'cwd write is allowed and byte-effect-proven under sandbox',
      allowed.ok === true &&
        allowed.atomicEnvelope?.sandbox?.active === true &&
        allowed.atomicEnvelope?.sandbox?.network === 'denied' &&
        allowed.atomicEnvelope?.sandbox?.fileWrites === expectedWriteMode &&
        allowed.atomicEnvelope?.sandbox?.tempRoot === expectedTempRoot &&
        allowed.effect?.limitReached === false &&
        allowedFileCaptured &&
        allowed.effect?.changedFiles === 1 &&
        fs.existsSync(path.join(fixture, 'allowed.tmp')),
      {
        ok: allowed.ok,
        sandbox: allowed.atomicEnvelope?.sandbox,
        effect: allowedEffectSummary,
        allowedFileCaptured,
      },
    );

    const readOnlyTmp = await callAtomicExec(client, 'pwd > "$TMP_FORBIDDEN"', {
      cwd: fixture,
      env: { TMP_FORBIDDEN: tmpForbidden },
    });
    const readOnlyTmpText = String((readOnlyTmp.stdout ?? '') + '\n' + (readOnlyTmp.stderr ?? ''));
    record(
      results,
      'trace-only read command cannot write temp bytes outside snapshot',
      readOnlyTmp.ok === false &&
        !fs.existsSync(tmpForbidden) &&
        (hostMode
          ? /effect proof required|host-sandboxed atomic_exec requires proveEffect/i.test(String(readOnlyTmp.error ?? '') + readOnlyTmpText)
          : readOnlyTmp.atomicEnvelope?.sandbox?.fileWrites === 'denied' &&
            /EPERM|EACCES|Operation not permitted|not permitted/i.test(readOnlyTmpText)),
      { ok: readOnlyTmp.ok, sandbox: readOnlyTmp.atomicEnvelope?.sandbox, stdout: readOnlyTmp.stdout, stderr: readOnlyTmp.stderr, error: readOnlyTmp.error },
    );

    // Real denial tests — identical in both modes now (the broker re-applies a
    // fresh per-command sandbox-exec in host mode; non-host applies it directly).
    const denied = await callAtomicExec(
      client,
      'node -e "require(\\"node:fs\\").writeFileSync(process.env.FORBIDDEN,\\"x\\")"',
      { cwd: fixture, proveEffect: true, env: { FORBIDDEN: forbidden } },
    );
    const deniedText = String((denied.stdout ?? '') + '\n' + (denied.stderr ?? ''));
    record(
      results,
      'outside-cwd write is denied by sandbox',
      denied.ok === false &&
        denied.atomicEnvelope?.sandbox?.active === true &&
        denied.atomicEnvelope?.sandbox?.fileWrites === expectedWriteMode &&
        !fs.existsSync(forbidden) &&
        /EPERM|EACCES|Operation not permitted|not permitted/i.test(deniedText),
      { ok: denied.ok, sandbox: denied.atomicEnvelope?.sandbox, stdout: denied.stdout, stderr: denied.stderr },
    );

    const deniedTmp = await callAtomicExec(
      client,
      "node -e 'require(\"node:fs\").writeFileSync(process.env.TMP_FORBIDDEN,\"x\")'",
      { cwd: fixture, proveEffect: true, env: { TMP_FORBIDDEN: tmpForbidden } },
    );
    const deniedTmpText = String((deniedTmp.stdout ?? '') + '\n' + (deniedTmp.stderr ?? ''));
    record(
      results,
      'byte-effect command cannot write temp bytes outside cwd snapshot',
      deniedTmp.ok === false &&
        deniedTmp.atomicEnvelope?.sandbox?.fileWrites === expectedWriteMode &&
        !fs.existsSync(tmpForbidden) &&
        /EPERM|EACCES|Operation not permitted|not permitted/i.test(deniedTmpText),
      { ok: deniedTmp.ok, sandbox: deniedTmp.atomicEnvelope?.sandbox, stdout: deniedTmp.stdout, stderr: deniedTmp.stderr },
    );

    const networkCommand =
      'node -e "const net=require(\\"node:net\\"); const s=net.connect(9,\\"127.0.0.1\\"); s.on(\\"error\\", e => { console.error(e.code || e.message); process.exit((e.code===\\"EPERM\\" || e.code===\\"EACCES\\") ? 0 : 1); }); setTimeout(() => process.exit(2), 1000);"';
    const network = await callAtomicExec(client, networkCommand, { cwd: fixture, proveEffect: true });
    const networkText = String((network.stdout ?? '') + '\n' + (network.stderr ?? ''));
    record(
      results,
      'network connect is denied by sandbox',
      network.ok === true &&
        network.atomicEnvelope?.sandbox?.active === true &&
        network.atomicEnvelope?.sandbox?.fileWrites === expectedWriteMode &&
        /EPERM|EACCES|Operation not permitted|not permitted/i.test(networkText),
      { ok: network.ok, sandbox: network.atomicEnvelope?.sandbox, stdout: network.stdout, stderr: network.stderr },
    );
  } finally {
    try {
      await client.close();
    } catch {}
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(forbidden, { force: true });
    fs.rmSync(tmpForbidden, { force: true });
  }

  const ok = results.every((entry) => entry.ok);
  return { ok, results };
}

main()
  .then((payload) => {
    if (jsonMode) {
      console.log(JSON.stringify(payload, null, 2));
    } else if (!payload.ok) {
      console.error(JSON.stringify(payload, null, 2));
    }
    process.exit(payload.ok ? 0 : 1);
  })
  .catch((error) => {
    const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else console.error(payload.error);
    process.exit(1);
  });
