#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirPath, removePath } from './broker-fixture-io.mjs';
import { installInheritedAtomicHostEnv } from './proof-host-env.mjs';

/**
 * atomic_exec pre-admission proof.
 *
 * Rollback is recovery, not proof. Mutable-or-unknown commands must run with
 * byte-effect proof: omitted proveEffect auto-enables proof, while explicit
 * proveEffect:false is refused before spawn. This proof calls the compiled
 * atomic_exec handler directly, so admission is verified before any nested MCP
 * server or broker socket can become part of the result.
 */
const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const fixture = path.join(sourceDir, '.atomic-exec-prove-effect-required-' + process.pid + '-' + Date.now());

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

function writeCommand(file, text) {
  const code =
    'const fs=require("node:fs");' +
    `fs.writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(text)});` +
    'process.exit(0);';
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(code)}`;
}

function writeTmpdirCommand(fileName, text) {
  const code =
    'const fs=require("node:fs");' +
    'const path=require("node:path");' +
    'fs.mkdirSync(process.env.TMPDIR,{recursive:true});' +
    `fs.writeFileSync(path.join(process.env.TMPDIR, ${JSON.stringify(fileName)}), ${JSON.stringify(text)});` +
    'process.exit(0);';
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(code)}`;
}

function isOutsidePath(child, root) {
  const rel = path.relative(path.resolve(root), path.resolve(child));
  return rel.startsWith('..') || path.isAbsolute(rel);
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
  removePath(fixture);
  mkdirPath(fixture);

  try {
    installInheritedAtomicHostEnv(repoRoot);
    const handler = await atomicExecHandler();
    const autoProofFile = 'auto-proof.tmp';
    const autoProof = parseToolResponse(
      await handler({
        command: writeCommand(autoProofFile, 'proved'),
        cwd: fixture,
        rollbackOnNonZero: true,
        timeoutMs: 30000,
        intent: 'proof omitted proveEffect auto-runs byte-effect proof before mutable spawn',
      }),
    );
    record(
      results,
      'omitted proveEffect auto-runs byte-effect proof for mutable command',
      autoProof.ok === true &&
        autoProof.commandClass === 'mutable-or-unknown' &&
        autoProof.atomicEnvelope?.effectProven === true &&
        autoProof.atomicEnvelope?.effectProofAuto === true &&
        autoProof.atomicEnvelope?.effectProofExplicit === false &&
        autoProof.effect?.changedFiles === 1 &&
        autoProof.effect?.files?.[0]?.file === autoProofFile &&
        fs.existsSync(path.join(fixture, autoProofFile)),
      {
        ok: autoProof.ok,
        exitCode: autoProof.exitCode,
        commandClass: autoProof.commandClass,
        envelope: autoProof.atomicEnvelope,
        effect: autoProof.effect,
        fileExists: fs.existsSync(path.join(fixture, autoProofFile)),
        error: autoProof.error,
      },
    );
    if (fs.existsSync(path.join(fixture, autoProofFile))) fs.unlinkSync(path.join(fixture, autoProofFile));

    const explicitFalseFile = 'explicit-false.tmp';
    const explicitFalse = parseToolResponse(
      await handler({
        command: writeCommand(explicitFalseFile, 'unproved'),
        cwd: fixture,
        rollbackOnNonZero: true,
        proveEffect: false,
        timeoutMs: 30000,
        intent: 'proof explicit false refuses mutable shell effects before spawn',
      }),
    );
    const explicitFalseText = String(
      (explicitFalse.error ?? '') + '\n' + (explicitFalse.stdout ?? '') + '\n' + (explicitFalse.stderr ?? ''),
    );
    record(
      results,
      'explicit proveEffect:false is refused before mutable command spawn',
      explicitFalse.ok === false &&
        /explicit proveEffect:false|effect proof required|mutable-or-unknown/i.test(explicitFalseText) &&
        !/broker unreachable|failed to spawn|exitCode/i.test(explicitFalseText) &&
        !fs.existsSync(path.join(fixture, explicitFalseFile)),
      {
        ok: explicitFalse.ok,
        exitCode: explicitFalse.exitCode,
        error: explicitFalse.error,
        fileExists: fs.existsSync(path.join(fixture, explicitFalseFile)),
      },
    );

    const tmpOnlyFile = 'atomic-exec-temp-cache.tmp';
    const tmpOnly = parseToolResponse(
      await handler({
        command: writeTmpdirCommand(tmpOnlyFile, 'cache'),
        cwd: fixture,
        effectRoot: fixture,
        proveEffect: true,
        timeoutMs: 30000,
        intent: 'proof TMPDIR scratch writes do not become product byte effects',
      }),
    );
    const leakedTempPath = path.join(fixture, tmpOnlyFile);
    const tempRoot = tmpOnly.atomicEnvelope?.sandbox?.tempRoot;
    const tempRootEscapesEffectRoot =
      typeof tempRoot === 'string' && isOutsidePath(tempRoot, fixture);
    record(
      results,
      'proveEffect TMPDIR writes use isolated scratch outside effectRoot',
      tmpOnly.ok === true &&
        tmpOnly.atomicEnvelope?.effectProven === true &&
        tmpOnly.effect?.changedFiles === 0 &&
        typeof tempRoot === 'string' &&
        tempRootEscapesEffectRoot &&
        !fs.existsSync(leakedTempPath),
      {
        ok: tmpOnly.ok,
        effect: tmpOnly.effect,
        tempRoot,
        fixture,
        tempRootEscapesEffectRoot,
        leakedTempPath,
        leakedTempExists: fs.existsSync(leakedTempPath),
        error: tmpOnly.error,
      },
    );

    const source = fs.readFileSync(path.join(sourceDir, 'server-tools-exec.ts'), 'utf8');
    const compiled = fs.readFileSync(path.join(sourceDir, 'dist', 'server-tools-exec.js'), 'utf8');
    record(
      results,
      'source and compiled runtime do not use rollback as effect admission',
      !source.includes('!a.proveEffect && !a.rollbackOnNonZero') &&
        !source.includes('a.proveEffect || a.rollbackOnNonZero ? cwd : null') &&
        !compiled.includes('!a.proveEffect && !a.rollbackOnNonZero') &&
        !compiled.includes('a.proveEffect || a.rollbackOnNonZero ? cwd : null'),
      {
        sourceAdmissionAllowsRollback: source.includes('!a.proveEffect && !a.rollbackOnNonZero'),
        sourceEffectRootAllowsRollback: source.includes('a.proveEffect || a.rollbackOnNonZero ? cwd : null'),
        compiledAdmissionAllowsRollback: compiled.includes('!a.proveEffect && !a.rollbackOnNonZero'),
        compiledEffectRootAllowsRollback: compiled.includes('a.proveEffect || a.rollbackOnNonZero ? cwd : null'),
      },
    );
  } finally {
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
