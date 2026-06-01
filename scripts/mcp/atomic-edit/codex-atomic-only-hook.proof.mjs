#!/usr/bin/env node
/**
 * Proof for the strict Codex atomic-only hook.
 *
 * It asserts the closed-loop invariant at the hook boundary:
 * - unhosted Codex is denied before any tool call;
 * - atomic-edit tools pass silently only under the host sandbox marker;
 * - native shell/edit/search/plan tools are denied;
 * - bare atomic_ lookalike tool names are denied;
 * - malformed hook input is denied fail-closed;
 * - the denial text steers to atomic self-expansion, not native fallback.
 */
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, 'codex-atomic-only-hook.mjs');
const jsonMode = process.argv.includes('--json');
const hostEnv = { ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec', ATOMIC_HOST_ATOMIC_ONLY: '1' };
const failures = [];
let passed = 0;
let failed = 0;

function run(payload, env = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const childEnv = { ...process.env, ...env };
  if (!Object.prototype.hasOwnProperty.call(env, 'ATOMIC_HOST_SANDBOX')) delete childEnv.ATOMIC_HOST_SANDBOX;
  if (!Object.prototype.hasOwnProperty.call(env, 'ATOMIC_HOST_ATOMIC_ONLY')) delete childEnv.ATOMIC_HOST_ATOMIC_ONLY;
  if (!Object.prototype.hasOwnProperty.call(env, 'ATOMIC_HOST_WRITE_ROOT')) delete childEnv.ATOMIC_HOST_WRITE_ROOT;
  return childProcess.spawnSync(process.execPath, [hook], {
    input,
    encoding: 'utf8',
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function parsed(stdout) {
  try {
    return JSON.parse(stdout || '{}');
  } catch {
    return {};
  }
}

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    if (!jsonMode) process.stdout.write(`  PASS  ${name}\n`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    if (!jsonMode) process.stdout.write(`  FAIL  ${name} ${detail}\n`);
  }
}

const unhostedAtomic = run({ tool_name: 'mcp__atomic_edit.atomic_exec', tool_input: { command: 'pwd' } });
const unhostedAtomicBody = parsed(unhostedAtomic.stdout);
check(
  'unhosted Codex is denied before atomic tools can run',
  unhostedAtomic.status === 0 &&
    unhostedAtomicBody.permissionDecision === 'deny' &&
    /requires the host sandbox/.test(unhostedAtomicBody.reason ?? ''),
  unhostedAtomic.stdout || unhostedAtomic.stderr,
);

const atomic = run({ tool_name: 'mcp__atomic_edit.atomic_exec', tool_input: { command: 'pwd' } }, hostEnv);
check('hosted atomic MCP tool passes silently', atomic.status === 0 && atomic.stdout === '', atomic.stdout || atomic.stderr);

const atomicAlias = run({ tool_name: 'mcp__atomic-edit__atomic_replace_text', tool_input: { file: 'x.ts' } }, hostEnv);
check('hosted hyphenated atomic tool alias passes silently', atomicAlias.status === 0 && atomicAlias.stdout === '', atomicAlias.stdout || atomicAlias.stderr);

const fakeAtomicPrefix = run({ tool_name: 'atomic_fake_bypass', tool_input: { cmd: 'date' } }, hostEnv);
const fakeAtomicPrefixBody = parsed(fakeAtomicPrefix.stdout);
check(
  'bare atomic_ lookalike tool name is denied',
  fakeAtomicPrefix.status === 0 &&
    fakeAtomicPrefixBody.permissionDecision === 'deny' &&
    /atomic_fake_bypass/.test(fakeAtomicPrefixBody.reason ?? ''),
  fakeAtomicPrefix.stdout || fakeAtomicPrefix.stderr,
);

const nativeExec = run({ tool_name: 'functions.exec_command', tool_input: { cmd: 'date' } }, hostEnv);
const nativeExecBody = parsed(nativeExec.stdout);
check(
  'native exec is denied',
  nativeExec.status === 0 && nativeExecBody.permissionDecision === 'deny' && /native\/non-atomic tool/.test(nativeExecBody.reason ?? ''),
  nativeExec.stdout || nativeExec.stderr,
);

const nativePatch = run({ tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n*** End Patch\n' } }, hostEnv);
const nativePatchBody = parsed(nativePatch.stdout);
check(
  'native patch is denied even before content classification',
  nativePatch.status === 0 && nativePatchBody.permissionDecision === 'deny' && /apply_patch/.test(nativePatchBody.reason ?? ''),
  nativePatch.stdout || nativePatch.stderr,
);

const malformed = run('{not-json');
const malformedBody = parsed(malformed.stdout);
check(
  'malformed input is denied fail-closed',
  malformed.status === 0 && malformedBody.permissionDecision === 'deny' && /fail-closed/.test(malformedBody.reason ?? ''),
  malformed.stdout || malformed.stderr,
);

const missingTool = run({ tool_name: 'tool_search.tool_search_tool', tool_input: { query: 'anything' } }, hostEnv);
const missingToolBody = parsed(missingTool.stdout);
check(
  'denial steers to atomic self-expansion for missing capability',
  missingTool.status === 0 &&
    missingToolBody.permissionDecision === 'deny' &&
    /implement the missing computation inside atomic-edit first/.test(missingToolBody.reason ?? ''),
  missingTool.stdout || missingTool.stderr,
);

if (jsonMode) {
  process.stdout.write(JSON.stringify({ ok: failed === 0, passed, failed, failures }) + '\n');
} else {
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
}
process.exit(failed === 0 ? 0 : 1);
