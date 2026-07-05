#!/usr/bin/env node
/**
 * Proof for intent-scope mutation policy: a workspace may declare the mutation
 * surface for an agent intent without restricting reads. The byte floor refuses
 * writes inside forbidden or unlisted paths before materialization.
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function sourceAssertions() {
  const guard = read('scripts/mcp/atomic-edit/guard.ts');
  const io = read('scripts/mcp/atomic-edit/server-helpers-io.ts');
  return {
    guardLoadsWorkspaceIntentScope:
      guard.includes('intent-scope.json') &&
      guard.includes('allowedMutationPaths') &&
      guard.includes('forbiddenMutationPaths') &&
      guard.includes('export function assertIntentMutationAllowed'),
    guardStatusExposesPolicy:
      guard.includes('intentScopePolicyPath') &&
      guard.includes('intentScopePolicy: intentScope.policy'),
    atomicWriteCallsIntentScopeBeforeMaterialization: (() => {
      const atomicWriteStart = io.indexOf('export function atomicWrite(');
      const intentGuardIndex = io.indexOf('assertIntentMutationAllowed(absPath', atomicWriteStart);
      const materializationIndex = io.indexOf('writeAtomicBytesDirect(absPath', atomicWriteStart);
      return atomicWriteStart >= 0 && intentGuardIndex > atomicWriteStart && materializationIndex > intentGuardIndex;
    })(),
  };
}

function dynamicGuardProof() {
  const proofRoot = path.join(repoRoot, '.atomic', 'intent-scope-proof-' + process.pid + '-' + Date.now());
  const workspace = path.join(proofRoot, 'worker');
  fs.mkdirSync(path.join(workspace, '.atomic'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src', 'serializer'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src', '__tests__'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.atomic', 'intent-scope.json'), JSON.stringify({
    reason: 'proof fixture: only serializer implementation files may be mutated',
    allowedMutationPaths: ['src/serializer/**'],
    forbiddenMutationPaths: ['src/__tests__/**', '**/*.test.ts'],
  }, null, 2) + '\n');
  const guardImport = JSON.stringify(path.join(sourceDir, 'dist', 'guard.js'));
  const script = [
    "import * as path from 'node:path';",
    "import { assertIntentMutationAllowed, intentScopeStatus } from " + guardImport + ";",
    "const workspace = " + JSON.stringify(workspace) + ";",
    "const allowed = path.join(workspace, 'src', 'serializer', 'binary.ts');",
    "const forbidden = path.join(workspace, 'src', '__tests__', 'serializer.test.ts');",
    "const unlisted = path.join(workspace, 'src', 'reactive', 'store.ts');",
    "const internal = path.join(workspace, '.atomic', 'traces', 'op.json');",
    "let allowedOk = true;",
    "let internalOk = true;",
    "let forbiddenMessage = '';",
    "let unlistedMessage = '';",
    "try { assertIntentMutationAllowed(allowed, 'proof allowed'); } catch (error) { allowedOk = false; }",
    "try { assertIntentMutationAllowed(internal, 'proof internal'); } catch (error) { internalOk = false; }",
    "try { assertIntentMutationAllowed(forbidden, 'proof forbidden'); } catch (error) { forbiddenMessage = error instanceof Error ? error.message : String(error); }",
    "try { assertIntentMutationAllowed(unlisted, 'proof unlisted'); } catch (error) { unlistedMessage = error instanceof Error ? error.message : String(error); }",
    "process.stdout.write(JSON.stringify({ allowedOk, internalOk, forbiddenMessage, unlistedMessage, status: intentScopeStatus() }));",
  ].join('\n');
  const spawned = childProcess.spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ATOMIC_EDIT_REPO_ROOT: proofRoot,
      ATOMIC_WORKSPACE_ROOT: workspace,
      ATOMIC_EDIT_ALLOWED_ROOTS: '',
    },
    encoding: 'utf8',
    timeout: 10000,
  });
  let parsed = {};
  try {
    parsed = JSON.parse(spawned.stdout || '{}');
  } catch (error) {
    parsed = { parseError: error instanceof Error ? error.message : String(error), stdout: spawned.stdout };
  }
  fs.rmSync(proofRoot, { recursive: true, force: true });
  return {
    ok:
      spawned.status === 0 &&
      parsed.allowedOk === true &&
      parsed.internalOk === true &&
      /forbiddenMutationPaths/.test(parsed.forbiddenMessage ?? '') &&
      /outside allowedMutationPaths/.test(parsed.unlistedMessage ?? '') &&
      parsed.status?.policy?.allowedMutationPaths?.includes('src/serializer/**') &&
      parsed.status?.policy?.forbiddenMutationPaths?.includes('src/__tests__/**'),
    status: spawned.status,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
    parsed,
  };
}

function main() {
  const results = [];
  const source = sourceAssertions();
  for (const [name, ok] of Object.entries(source)) record(results, name, ok, { ok });
  if (!fs.existsSync(path.join(sourceDir, 'dist', 'guard.js'))) {
    record(results, 'dynamic guard import has built dist/guard.js', false, { missing: 'dist/guard.js' });
  } else {
    const dynamic = dynamicGuardProof();
    record(results, 'intent scope admits allowed mutation and refuses forbidden/unlisted paths', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
