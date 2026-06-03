#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdirPath, removePath } from './broker-fixture-io.mjs';
import { installInheritedAtomicHostEnv } from './proof-host-env.mjs';

/**
 * external-runtime-denial proof.
 *
 * Asserts atomic_exec refuses known external-or-host-effect commands
 * (network/database/provider/package) BEFORE spawn, and that a hidden inline
 * interpreter network attempt routed through atomic_exec is denied at the OS
 * level. With the out-of-sandbox broker backing host mode (macOS forbids nested
 * sandbox-exec, and the Claude host sandbox must allow network for the Anthropic
 * API), per-command network denial is provided by the broker in host mode and by
 * sandbox-exec directly in non-host mode — so the SAME atomic_exec assertion holds
 * in both modes.
 */
const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const fixture = path.join(sourceDir, '.external-runtime-denial-' + process.pid + '-' + Date.now());

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
  return { result, payload: parseToolResult(result) };
}

function serverTransport() {
  const inheritedHostEnv = installInheritedAtomicHostEnv(repoRoot);
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

async function expectExternalRefusal(client, results, name, command) {
  const { result, payload } = await callAtomicExec(client, command, { cwd: fixture, proveEffect: true });
  record(
    results,
    name,
    result.isError === true &&
      payload.ok === false &&
      /external-or-host-effect command refused under Y admission|external effect unproved/i.test(String(payload.error ?? '')),
    { isError: result.isError === true, error: payload.error },
  );
}

async function main() {
  const results = [];
  removePath(fixture);
  mkdirPath(fixture);

  const transport = serverTransport();
  const client = new Client({ name: 'external-runtime-denial-proof', version: '1.0.0' });

  try {
    await client.connect(transport);

    await expectExternalRefusal(client, results, 'network CLI refused before spawn', 'curl https://example.com');
    await expectExternalRefusal(client, results, 'database CLI refused before spawn', 'psql -c "select 1"');
    await expectExternalRefusal(client, results, 'provider CLI refused before spawn', 'railway status');
    await expectExternalRefusal(client, results, 'package install refused before spawn', 'npm install left-pad');

    // Hidden inline-interpreter network attempt routed through atomic_exec is
    // denied at the OS level (broker in host mode, sandbox-exec in non-host).
    const networkCommand =
      'node -e "const net=require(\\"node:net\\"); const s=net.connect(9,\\"127.0.0.1\\"); s.on(\\"error\\", e => { console.error(e.code || e.message); process.exit((e.code===\\"EPERM\\" || e.code===\\"EACCES\\") ? 0 : 1); }); setTimeout(() => process.exit(2), 1000);"';
    const hiddenNetwork = await callAtomicExec(client, networkCommand, { cwd: fixture, proveEffect: true });
    const hiddenText = String((hiddenNetwork.payload.stdout ?? '') + '\n' + (hiddenNetwork.payload.stderr ?? ''));
    record(
      results,
      'hidden interpreter network denied by sandbox',
      hiddenNetwork.payload.ok === true &&
        hiddenNetwork.payload.atomicEnvelope?.sandbox?.active === true &&
        hiddenNetwork.payload.atomicEnvelope?.sandbox?.network === 'denied' &&
        /EPERM|EACCES|Operation not permitted|not permitted/i.test(hiddenText),
      {
        ok: hiddenNetwork.payload.ok,
        sandbox: hiddenNetwork.payload.atomicEnvelope?.sandbox,
        stdout: hiddenNetwork.payload.stdout,
        stderr: hiddenNetwork.payload.stderr,
      },
    );
  } finally {
    try {
      await client.close();
    } catch {}
    removePath(fixture);
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
