#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * atomic_exec read-only usability proof.
 *
 * The no-bypass shell operator must still be useful for mandatory read-side
 * repo inspection. In direct sandbox mode, read-only commands should run with
 * fileWrites=denied. In host/broker mode, Atomic intentionally requires
 * proveEffect for every command because nested no-write sandboxing is not
 * available; read-only usability is still valid only when the byte-effect proof
 * records no non-ledger file change. Host-mode read-only commands use the small
 * Atomic source directory as effect root so the proof measures usability rather
 * than failing on a whole-monorepo snapshot cap. In both modes protected write
 * attempts remain refused.
 */
const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const hostMode = process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' && process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
const readOnlyArgs = hostMode ? { proveEffect: true } : {};
const readOnlyCwd = hostMode ? sourceDir : repoRoot;
const protectedReadCommand = hostMode ? "sed -n '1,1p' ../../../CLAUDE.md" : "sed -n '1,1p' CLAUDE.md";

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
      cwd: readOnlyCwd,
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

function hostReadOnlyEffectOk(result) {
  const files = Array.isArray(result.effect?.files) ? result.effect.files : [];
  return (
    result.atomicEnvelope?.sandbox?.active === true &&
    result.atomicEnvelope?.sandbox?.fileWrites === 'cwd-only' &&
    result.atomicEnvelope?.effectProven === true &&
    result.effect?.limitReached === false &&
    result.effect?.changedFiles === files.length &&
    files.every((entry) => entry.file === '.atomic/exec-ledger.jsonl')
  );
}

function readOnlySandboxOk(result) {
  if (hostMode) return hostReadOnlyEffectOk(result);
  return result.atomicEnvelope?.sandbox?.fileWrites === 'denied';
}

async function main() {
  const results = [];
  const client = new Client({ name: 'atomic-exec-readonly-usability-proof', version: '1.0.0' });
  await client.connect(serverTransport());

  try {
    const protectedRead = await callAtomicExec(
      client,
      protectedReadCommand,
      { intent: 'proof read protected governance file without shell write', ...readOnlyArgs },
    );
    record(
      results,
      hostMode
        ? 'host/broker read-only sed may inspect protected governance file with no non-ledger byte effect'
        : 'read-only sed may inspect protected governance file without being classified as shell write',
      protectedRead.ok === true &&
        protectedRead.commandClass === 'read-only' &&
        readOnlySandboxOk(protectedRead) &&
        String(protectedRead.stdout ?? '').length > 0,
      {
        ok: protectedRead.ok,
        commandClass: protectedRead.commandClass,
        cwd: protectedRead.cwd,
        sandbox: protectedRead.atomicEnvelope?.sandbox,
        effectProven: protectedRead.atomicEnvelope?.effectProven,
        effect: protectedRead.effect,
        stdoutBytes: String(protectedRead.stdout ?? '').length,
        error: protectedRead.error,
        stderr: protectedRead.stderr,
        hostMode,
      },
    );

    const protectedWrite = await callAtomicExec(
      client,
      "sed -i '' -e 's/__atomic_never__/__atomic_never__/g' CLAUDE.md",
      { cwd: repoRoot, intent: 'proof protected governance sed write remains refused' },
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
      { intent: 'proof git read-only inspection works inside atomic sandbox', ...readOnlyArgs },
    );
    const gitText = String((gitStatus.stdout ?? '') + '\n' + (gitStatus.stderr ?? ''));
    record(
      results,
      hostMode
        ? 'host/broker read-only git status works with no non-ledger byte effect despite /dev/null usage'
        : 'read-only git status works inside sandbox despite /dev/null usage',
      gitStatus.ok === true &&
        gitStatus.commandClass === 'read-only' &&
        readOnlySandboxOk(gitStatus) &&
        !/could not open '\/dev\/null'|Operation not permitted/i.test(gitText),
      {
        ok: gitStatus.ok,
        commandClass: gitStatus.commandClass,
        cwd: gitStatus.cwd,
        sandbox: gitStatus.atomicEnvelope?.sandbox,
        effectProven: gitStatus.atomicEnvelope?.effectProven,
        effect: gitStatus.effect,
        stdoutBytes: String(gitStatus.stdout ?? '').length,
        stderr: gitStatus.stderr,
        hostMode,
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
