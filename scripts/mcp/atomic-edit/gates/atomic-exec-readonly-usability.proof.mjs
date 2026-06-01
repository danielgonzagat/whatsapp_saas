#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * atomic_exec read-only usability proof.
 *
 * The no-bypass shell operator must still be useful for mandatory read-side
 * repo inspection. Read-only commands are not negative byte actions: they must
 * not be blocked by protected-file write heuristics, and the sandbox must allow
 * non-persistent device writes that common read-only tooling performs when it
 * opens /dev/null.
 */
const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');

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
      cwd: repoRoot,
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
  return new StdioClientTransport({
    command: process.execPath,
    args: [compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
    env: inheritedHostEnv,
  });
}

async function main() {
  const results = [];
  const client = new Client({ name: 'atomic-exec-readonly-usability-proof', version: '1.0.0' });
  await client.connect(serverTransport());

  try {
    const protectedRead = await callAtomicExec(
      client,
      "sed -n '1,1p' CLAUDE.md",
      { intent: 'proof read protected governance file without shell write' },
    );
    record(
      results,
      'read-only sed may inspect protected governance file without being classified as shell write',
      protectedRead.ok === true &&
        protectedRead.commandClass === 'read-only' &&
        protectedRead.atomicEnvelope?.sandbox?.fileWrites === 'denied' &&
        String(protectedRead.stdout ?? '').length > 0,
      {
        ok: protectedRead.ok,
        commandClass: protectedRead.commandClass,
        sandbox: protectedRead.atomicEnvelope?.sandbox,
        stdoutBytes: String(protectedRead.stdout ?? '').length,
        error: protectedRead.error,
        stderr: protectedRead.stderr,
      },
    );

    const protectedWrite = await callAtomicExec(
      client,
      "sed -i '' -e 's/__atomic_never__/__atomic_never__/g' CLAUDE.md",
      { intent: 'proof protected governance sed write remains refused' },
    );
    record(
      results,
      'sed in-place write to protected governance file remains refused before spawn',
      protectedWrite.ok === false && /governance-protected|Protected files are owner-only/i.test(String(protectedWrite.error ?? '')),
      {
        ok: protectedWrite.ok,
        error: protectedWrite.error,
        stdoutBytes: String(protectedWrite.stdout ?? '').length,
        stderr: protectedWrite.stderr,
      },
    );

    const gitStatus = await callAtomicExec(
      client,
      'git status --short --branch',
      { intent: 'proof git read-only inspection works inside atomic sandbox' },
    );
    const gitText = String((gitStatus.stdout ?? '') + '\n' + (gitStatus.stderr ?? ''));
    record(
      results,
      'read-only git status works inside sandbox despite /dev/null usage',
      gitStatus.ok === true &&
        gitStatus.commandClass === 'read-only' &&
        gitStatus.atomicEnvelope?.sandbox?.fileWrites === 'denied' &&
        !/could not open '\/dev\/null'|Operation not permitted/i.test(gitText),
      {
        ok: gitStatus.ok,
        commandClass: gitStatus.commandClass,
        sandbox: gitStatus.atomicEnvelope?.sandbox,
        stdoutBytes: String(gitStatus.stdout ?? '').length,
        stderr: gitStatus.stderr,
      },
    );
  } finally {
    await client.close().catch(() => {});
  }

  return { ok: results.every((entry) => entry.ok), results };
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
