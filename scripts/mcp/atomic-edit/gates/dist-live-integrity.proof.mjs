#!/usr/bin/env node
/**
 * Proof: build.mjs must not expose an invalid live dist while rebuilding Atomic.
 * The live dist is an agent runtime surface; deleting it before emit creates a
 * bypass-sized window where a concurrent MCP process can load server.js without
 * its imported helpers. Build must stage, validate, then publish.
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const atomicRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(atomicRoot, '..', '..', '..');
const buildSource = fs.readFileSync(path.join(atomicRoot, 'build.mjs'), 'utf8');
const results = [];
const rec = (name, ok, detail = {}) => results.push({ name, ok: Boolean(ok), detail });

function order(before, after) {
  const a = buildSource.indexOf(before);
  const b = buildSource.indexOf(after);
  return a >= 0 && b >= 0 && a < b;
}

const required = [
  'server.js',
  'server-helpers-hot-reload.js',
  'server-helpers-io.js',
  'server-helpers-effect.js',
  'server-tools-exec.js',
  'server-tools-self.js',
  'server-tools-y.js',
  'engine.js',
  'trace.js',
  'gates/contract.js',
  'gates/algebra.js',
  'gates/converge-operator.js',
  'gates/reachability-gate.proof.js',
  'gates/binding-gate.proof.js',
  'gates/probe-convergence-gate.proof.js',
  'gates/formal-gate.proof.js',
  'gates/property-gate.proof.js',
  'gates/findings-delta-gate.proof.js',
  'gates/contract-edge-gate.proof.js',
];
const missingRequired = required.filter((rel) => !buildSource.includes(rel));

rec(
  'build compiles into a staging outDir instead of the live dist directory',
  buildSource.includes('BUILD_OUT') && buildSource.includes('outDir: BUILD_OUT') && !buildSource.includes('outDir: OUT'),
  { hasBuildOut: buildSource.includes('BUILD_OUT'), hasLiveOutDir: buildSource.includes('outDir: OUT') },
);

rec(
  'build does not delete the live dist directory before emit',
  !buildSource.includes('fs.rmSync(OUT, { recursive: true, force: true })'),
  { destructiveLiveDistRemove: buildSource.includes('fs.rmSync(OUT, { recursive: true, force: true })') },
);

rec(
  'build declares critical dist artifacts as an explicit contract',
  buildSource.includes('REQUIRED_DIST_ARTIFACTS') && missingRequired.length === 0,
  { missingRequired, requiredCount: required.length },
);

rec(
  'staged artifacts are validated before publish',
  order('assertRequiredBuildArtifacts(BUILD_OUT)', 'publishBuildOutput(BUILD_OUT, OUT)'),
  { hasAssert: buildSource.includes('assertRequiredBuildArtifacts(BUILD_OUT)'), hasPublish: buildSource.includes('publishBuildOutput(BUILD_OUT, OUT)') },
);

rec(
  'server.js entrypoint is published last from the validated staging tree',
  buildSource.includes("const entrypointRel = 'server.js'") && buildSource.includes('skipRel: entrypointRel'),
  { hasEntrypointRel: buildSource.includes("const entrypointRel = 'server.js'"), hasSkip: buildSource.includes('skipRel: entrypointRel') },
);

{
  const run = childProcess.spawnSync(process.execPath, [path.join(atomicRoot, "dist", "server.js")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '1',
      ATOMIC_SINGLE_TOOL_NAME: 'code_file_stat',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: JSON.stringify({ file: 'scripts/mcp/atomic-edit/server.ts' }),
      ATOMIC_DISABLE_HOT_RELOAD: '1',
      CODEX_PROJECT_DIR: repoRoot,
    },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 30000,
  });
  let parsed = null;
  try { parsed = JSON.parse((run.stdout || '').trim()); } catch {}
  rec(
    'current dist entrypoint can execute a single read-only tool after build',
    run.status === 0 && parsed && parsed.ok === true,
    { status: run.status, stdout: (run.stdout || '').slice(0, 500), stderr: (run.stderr || '').slice(0, 500) },
  );
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
