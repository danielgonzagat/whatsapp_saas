#!/usr/bin/env node
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
  const session = read('scripts/mcp/atomic-edit/server-tools-session.ts');
  const exec = read('scripts/mcp/atomic-edit/server-tools-exec.ts');
  const io = read('scripts/mcp/atomic-edit/server-helpers-io.ts');
  const launcher = read('scripts/mcp/atomic-edit-mcp-launcher-impl.sh');
  return {
    guardHasWorkspaceEnv:
      guard.includes('ATOMIC_WORKSPACE_ROOT') &&
      guard.includes('ATOMIC_DECLARED_WORKSPACE_ROOT') &&
      guard.includes('export function activeWorkspaceRoot()'),
    invalidEnvWorkspaceDoesNotPoisonBind:
      guard.includes('function validatedEnvWorkspaceRoot()') &&
      guard.includes('const envRoot = validatedEnvWorkspaceRoot();') &&
      guard.includes("envRoot ? \'environment\' : \'repo-root-default\'") &&
      !guard.includes('const envRoot = validateWorkspaceRoot(ENV_WORKSPACE_ROOT);'),
    relativeTargetsResolveAgainstWorkspace:
      guard.includes('const baseRoot = activeWorkspaceRoot();') &&
      guard.includes('path.resolve(baseRoot, file)'),
    absoluteTargetsAreWorkspaceChecked:
      guard.includes('export function assertInsideActiveWorkspace') &&
      guard.includes("assertInsideActiveWorkspace(absPath, \'target\');") &&
      !guard.includes('allowRegisteredWorktreeWhenRepoRootWorkspace'),
    sessionExposesPreflightTools:
      session.includes("'atomic_workspace_bind'") &&
      session.includes("'atomic_workspace_status'") &&
      session.includes('bindWorkspaceRoot(a.root)') &&
      session.includes('workspaceBindingStatus()'),
    execCwdUsesWorkspaceRoot:
      exec.includes('const baseRoot = activeWorkspaceRoot();') &&
      exec.includes("assertInsideActiveWorkspace(candidate, \'exec cwd\')"),
    execNoLongerFallsBackDirectlyInHostSandbox:
      !exec.includes('host-mode read-only direct fallback') &&
      exec.includes('requires a live running broker'),
    writesGateAgainstContainingRoot:
      io.includes('const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;') &&
      io.includes('runSyncWriteGatesAt(repoRoot, relPath, content)') &&
      io.includes('repoRoot,'),
    launcherPreservesCallerWorkspace:
      launcher.includes('CALLER_WORKSPACE_ROOT="$(pwd -P)"') &&
      launcher.includes('export ATOMIC_WORKSPACE_ROOT="${ATOMIC_WORKSPACE_ROOT:-${CALLER_WORKSPACE_ROOT}}"'),
    launcherBrokerStateRecoveryIsOptIn:
      launcher.includes('ATOMIC_RECOVER_HOST_FROM_STATE') &&
      launcher.includes('if [[ "${ATOMIC_RECOVER_HOST_FROM_STATE:-}" == "1" ]]; then'),
  };
}


function dynamicGuardProof() {
  const proofRoot = path.join(repoRoot, '.atomic', `workspace-root-binding-proof-${process.pid}-${Date.now()}`);
  const workspace = path.join(proofRoot, 'worker');
  const sibling = path.join(proofRoot, 'sibling');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.mkdirSync(path.join(sibling, 'src'), { recursive: true });
  const script = `
    import * as path from 'node:path';
    import {
      activeWorkspaceRoot,
      bindWorkspaceRoot,
      resolveSafeTarget,
      workspaceBindingStatus,
    } from ${JSON.stringify(path.join(sourceDir, 'dist', 'guard.js'))};
    const workspace = ${JSON.stringify(workspace)};
    const sibling = ${JSON.stringify(sibling)};
    const rel = resolveSafeTarget('src/target.ts');
    const status = workspaceBindingStatus();
    let outsideMessage = '';
    try {
      resolveSafeTarget(path.join(sibling, 'src', 'target.ts'));
    } catch (error) {
      outsideMessage = error instanceof Error ? error.message : String(error);
    }
    const bound = bindWorkspaceRoot(workspace);
    let conflictMessage = '';
    try {
      bindWorkspaceRoot(sibling);
    } catch (error) {
      conflictMessage = error instanceof Error ? error.message : String(error);
    }
    const result = {
      activeWorkspaceRoot: activeWorkspaceRoot(),
      relAbsPath: rel.absPath,
      relRepoRoot: rel.repoRoot,
      relPath: rel.relPath,
      declaredBy: status.declaredBy,
      boundDeclaredBy: bound.declaredBy,
      outsideMessage,
      conflictMessage,
    };
    process.stdout.write(JSON.stringify(result));
  `;
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
      parsed.activeWorkspaceRoot === workspace &&
      parsed.relAbsPath === path.join(workspace, 'src', 'target.ts') &&
      parsed.relRepoRoot === proofRoot &&
      parsed.relPath === 'worker/src/target.ts' &&
      parsed.declaredBy === 'environment' &&
      parsed.boundDeclaredBy === 'atomic_workspace_bind' &&
      /outside declared workspace root/.test(parsed.outsideMessage ?? '') &&
      /already fixed by environment/.test(parsed.conflictMessage ?? ''),
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
    record(results, 'guard resolves relative targets inside declared workspace and refuses outside absolutes', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}


const result = main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(result.ok ? 0 : 1);
