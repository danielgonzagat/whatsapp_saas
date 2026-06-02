#!/usr/bin/env node
/**
 * Proves the no-restart Atomic MCP runtime boundary:
 * 1. registered tool callbacks are wrapped and can delegate to a fresh runtime;
 * 2. non-stale callbacks still execute in-process;
 * 3. dist/server.js supports one-shot single tool calls without opening stdio MCP.
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '..', '..', '..');
const {
  DISABLE_HOT_RELOAD_ENV,
  FORCE_HOT_RELOAD_ENV,
  installHotReloadingToolCallbacks,
  shouldDelegateToFreshRuntimeState,
} = await import(path.join(dir, 'dist', 'server-helpers-hot-reload.js'));
const results = [];

function check(name, cond, detail = '') {
  const passed = Boolean(cond);
  results.push({ name, passed, detail });
  console.log(passed ? '  PASS ' : '  FAIL ', name, detail ? `— ${detail}` : '');
}

{
  const matchingFresh = { fresh: true, distHash: 'boot-hash' };
  check('DECISION stays local when boot hash still matches dist', shouldDelegateToFreshRuntimeState('boot-hash', matchingFresh, {}) === false);
  check(
    'DECISION delegates when dist hash changed after boot',
    shouldDelegateToFreshRuntimeState('boot-hash', { fresh: true, distHash: 'new-hash' }, {}) === true,
  );
  check('DECISION delegates when dist freshness check is stale', shouldDelegateToFreshRuntimeState('boot-hash', { fresh: false, reason: 'source changed' }, {}) === true);
  check(
    'DECISION force env delegates even when dist hash matches',
    shouldDelegateToFreshRuntimeState('boot-hash', matchingFresh, { [FORCE_HOT_RELOAD_ENV]: '1' }) === true,
  );
  check(
    'DECISION disable env wins over force and stale dist',
    shouldDelegateToFreshRuntimeState('boot-hash', { fresh: false, reason: 'source changed' }, {
      [DISABLE_HOT_RELOAD_ENV]: '1',
      [FORCE_HOT_RELOAD_ENV]: '1',
    }) === false,
  );
  check('DECISION missing boot hash stays local for fresh dist', shouldDelegateToFreshRuntimeState(null, matchingFresh, {}) === false);
}

{
  let wrapped;
  let staleCalls = 0;
  let freshCalls = 0;
  const fakeServer = {
    registerTool(name, config, callback) {
      wrapped = callback;
      return { name, config };
    },
  };
  const registry = installHotReloadingToolCallbacks(fakeServer, {
    atomicRoot: dir,
    shouldDelegate: () => true,
    callFreshTool: async (name, args) => {
      freshCalls += 1;
      return { source: 'fresh', name, args };
    },
  });
  fakeServer.registerTool('demo_tool', {}, async () => {
    staleCalls += 1;
    return { source: 'stale' };
  });
  const result = await wrapped({ value: 7 }, {});
  check('HOT-RELOAD registry stores original callback', registry.has('demo_tool'));
  check('HOT-RELOAD delegates when runtime is stale/forced', result?.source === 'fresh');
  check('HOT-RELOAD passes tool name to fresh runtime', result?.name === 'demo_tool');
  check('HOT-RELOAD passes args to fresh runtime', result?.args?.value === 7);
  check('HOT-RELOAD does not execute stale callback when delegating', staleCalls === 0);
  check('HOT-RELOAD called fresh runtime exactly once', freshCalls === 1);
}

{
  let wrapped;
  let localCalls = 0;
  const fakeServer = {
    registerTool(_name, _config, callback) {
      wrapped = callback;
      return {};
    },
  };
  installHotReloadingToolCallbacks(fakeServer, {
    atomicRoot: dir,
    shouldDelegate: () => false,
  });
  fakeServer.registerTool('local_tool', {}, async (args) => {
    localCalls += 1;
    return { source: 'local', args };
  });
  const result = await wrapped({ ok: true }, {});
  check('HOT-RELOAD keeps fresh callbacks in-process', result?.source === 'local');
  check('HOT-RELOAD invokes local callback exactly once', localCalls === 1);
}

{
  const child = spawnSync(process.execPath, [path.join(dir, 'dist', 'server.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '1',
      ATOMIC_SINGLE_TOOL_NAME: 'atomic_lens',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: JSON.stringify({ scope: 'scripts/mcp/atomic-edit/server-tools-converge.ts' }),
      ATOMIC_DISABLE_HOT_RELOAD: '1',
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const payload = JSON.parse(child.stdout.trim() || '{}');
  const content = Array.isArray(payload.result?.content) ? payload.result.content : [];
  const machine = content.length > 0 ? JSON.parse(content[content.length - 1].text) : null;
  check('SINGLE-CALL exits successfully', child.status === 0, child.stderr.trim());
  check('SINGLE-CALL returns ok payload', payload.ok === true);
  check('SINGLE-CALL can invoke atomic_lens without stdio session', machine?.ok === true);
  check('SINGLE-CALL result is scoped to requested file', machine?.scope === 'scripts/mcp/atomic-edit/server-tools-converge.ts');
}

{
  const child = spawnSync(process.execPath, [path.join(dir, 'dist', 'server.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '1',
      ATOMIC_SINGLE_TOOL_NAME: 'atomic_dispatch_tool',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: JSON.stringify({
        toolName: 'atomic_lens',
        args: { scope: 'scripts/mcp/atomic-edit/server-tools-converge.ts' },
      }),
      ATOMIC_DISABLE_HOT_RELOAD: '1',
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const payload = JSON.parse(child.stdout.trim() || '{}');
  const content = Array.isArray(payload.result?.content) ? payload.result.content : [];
  const machine = content.length > 0 ? JSON.parse(content[content.length - 1].text) : null;
  const freshContent = Array.isArray(machine?.freshResult?.content) ? machine.freshResult.content : [];
  const freshMachine = freshContent.length > 0 ? JSON.parse(freshContent[freshContent.length - 1].text) : null;
  check('DISPATCH exits successfully', child.status === 0, child.stderr.trim());
  check('DISPATCH returns ok payload', payload.ok === true);
  check('DISPATCH reports target tool name', machine?.dispatchedTool === 'atomic_lens');
  check('DISPATCH invokes fresh target tool', freshMachine?.ok === true);
  check('DISPATCH preserves target args', freshMachine?.scope === 'scripts/mcp/atomic-edit/server-tools-converge.ts');
}

{
  const child = spawnSync(process.execPath, [path.join(dir, 'dist', 'server.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '1',
      ATOMIC_SINGLE_TOOL_NAME: 'atomic_dispatch_tool',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: JSON.stringify({ toolName: 'atomic_dispatch_tool' }),
      ATOMIC_DISABLE_HOT_RELOAD: '1',
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const payload = JSON.parse(child.stdout.trim() || '{}');
  const content = Array.isArray(payload.result?.content) ? payload.result.content : [];
  const machine = content.length > 0 ? JSON.parse(content[content.length - 1].text) : null;
  check('DISPATCH self-recursion exits successfully', child.status === 0, child.stderr.trim());
  check('DISPATCH refuses self-dispatch without recursion', payload.ok === true && payload.result?.isError === true && String(machine?.error ?? '').includes('refuses self-dispatch'));
}

const passedCount = results.filter((result) => result.passed).length;
const failedCount = results.length - passedCount;
console.log(`\n${passedCount} passed, ${failedCount} failed`);
if (failedCount > 0) process.exit(1);
