#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * atomic_exec explicit-indirection denial proof.
 *
 * Shell eval and alias definitions re-parse or rename command text after the
 * admission scanner has made its decision. They are therefore refused as
 * invariant laws before spawn. The proof calls the compiled atomic_exec handler
 * directly and uses benign command bodies so older denylist laws cannot mask the
 * new refusal reason.
 */
const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseToolResponse(response) {
  const text = response.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('invalid JSON tool response: ' + text.slice(0, 2000));
  }
}

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function responseText(payload) {
  return String((payload.error ?? '') + '\n' + (payload.stdout ?? '') + '\n' + (payload.stderr ?? ''));
}

function refusedFor(payload, pattern) {
  const text = responseText(payload);
  return (
    payload.ok === false &&
    /atomic_exec refused.*invariant law/i.test(text) &&
    pattern.test(text) &&
    !/effect proof required|broker unreachable|failed to spawn|exitCode/i.test(text)
  );
}

async function atomicExecHandler() {
  const compiled = path.join(sourceDir, 'dist', 'server-tools-exec.js');
  if (!fs.existsSync(compiled)) {
    throw new Error('compiled server-tools-exec.js is missing; run node build.mjs first');
  }
  const mod = await import(pathToFileURL(compiled).href + '?proof=' + Date.now());
  let captured = null;
  const fakeServer = {
    registerTool(name, _definition, handler) {
      if (name === 'atomic_exec') captured = handler;
    },
  };
  mod.registerToolsExec(fakeServer);
  if (!captured) throw new Error('atomic_exec handler was not registered');
  return captured;
}

async function main() {
  const results = [];
  const handler = await atomicExecHandler();

  const evalRefusal = parseToolResponse(
    await handler({
      command: 'eval "printf atomic"',
      cwd: sourceDir,
      timeoutMs: 30000,
    }),
  );
  record(results, 'shell eval is refused as explicit indirection before spawn', refusedFor(evalRefusal, /shell eval/i), {
    ok: evalRefusal.ok,
    error: evalRefusal.error,
  });

  const aliasRefusal = parseToolResponse(
    await handler({
      command: 'alias atomically_hidden="printf atomic"; atomically_hidden',
      cwd: sourceDir,
      timeoutMs: 30000,
    }),
  );
  record(results, 'shell alias definition is refused as explicit indirection before spawn', refusedFor(aliasRefusal, /alias definitions/i), {
    ok: aliasRefusal.ok,
    error: aliasRefusal.error,
  });

  const sourceRefusal = parseToolResponse(
    await handler({
      command: 'source ./atomic-hidden-indirection.sh',
      cwd: sourceDir,
      timeoutMs: 30000,
    }),
  );
  record(results, 'shell source is refused as explicit indirection before spawn', refusedFor(sourceRefusal, /source\/dot indirection/i), {
    ok: sourceRefusal.ok,
    error: sourceRefusal.error,
  });

  const dotRefusal = parseToolResponse(
    await handler({
      command: '. ./atomic-hidden-indirection.sh',
      cwd: sourceDir,
      timeoutMs: 30000,
    }),
  );
  record(results, 'shell dot command is refused as explicit indirection before spawn', refusedFor(dotRefusal, /source\/dot indirection/i), {
    ok: dotRefusal.ok,
    error: dotRefusal.error,
  });

  return { ok: results.every((entry) => entry.ok), results };
}

main()
  .then((payload) => {
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
    process.exit(payload.ok ? 0 : 1);
  })
  .catch((error) => {
    const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else console.error(payload.error);
    process.exit(1);
  });
