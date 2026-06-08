#!/usr/bin/env node
/**
 * Proof for the strict Codex atomic-only hook.
 *
 * It asserts the closed-loop invariant at the hook boundary:
 * - unhosted Codex still admits atomic tools and planner controls for repair;
 * - unhosted native tools are denied before they can run;
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

function isDeny(body) {
  return (
    body?.hookSpecificOutput?.hookEventName === 'PreToolUse' &&
    body?.hookSpecificOutput?.permissionDecision === 'deny' &&
    typeof body?.hookSpecificOutput?.permissionDecisionReason === 'string'
  );
}

function denialReason(body) {
  return String(body?.hookSpecificOutput?.permissionDecisionReason ?? '');
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
check(
  'unhosted Codex still admits atomic tools so a broken session can self-repair',
  unhostedAtomic.status === 0 && unhostedAtomic.stdout === '',
  unhostedAtomic.stdout || unhostedAtomic.stderr,
);

const unhostedNative = run({ tool_name: 'Bash', tool_input: { command: 'pwd' } });
const unhostedNativeBody = parsed(unhostedNative.stdout);
check(
  'unhosted native tool is denied (requires host sandbox)',
  unhostedNative.status === 0 &&
    isDeny(unhostedNativeBody) &&
    /requires the host sandbox/.test(denialReason(unhostedNativeBody)),
  unhostedNative.stdout || unhostedNative.stderr,
);

const unhostedPlanner = run({ tool_name: 'update_goal', tool_input: {} });
check(
  'unhosted planner control is admitted (computation-free)',
  unhostedPlanner.status === 0 && unhostedPlanner.stdout === '',
  unhostedPlanner.stdout || unhostedPlanner.stderr,
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
    isDeny(fakeAtomicPrefixBody) &&
    /atomic_fake_bypass/.test(denialReason(fakeAtomicPrefixBody)),
  fakeAtomicPrefix.stdout || fakeAtomicPrefix.stderr,
);

const nativeExec = run({ tool_name: 'functions.exec_command', tool_input: { cmd: 'date' } }, hostEnv);
const nativeExecBody = parsed(nativeExec.stdout);
check(
  'native exec is denied',
  nativeExec.status === 0 && isDeny(nativeExecBody) && /native\/non-atomic tool/.test(denialReason(nativeExecBody)),
  nativeExec.stdout || nativeExec.stderr,
);

const nativePatch = run({ tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n*** End Patch\n' } }, hostEnv);
const nativePatchBody = parsed(nativePatch.stdout);
check(
  'native patch is denied even before content classification',
  nativePatch.status === 0 && isDeny(nativePatchBody) && /apply_patch/.test(denialReason(nativePatchBody)),
  nativePatch.stdout || nativePatch.stderr,
);

const malformed = run('{not-json');
const malformedBody = parsed(malformed.stdout);
check(
  'malformed input is denied fail-closed',
  malformed.status === 0 && isDeny(malformedBody) && /fail-closed/.test(denialReason(malformedBody)),
  malformed.stdout || malformed.stderr,
);

const missingTool = run({ tool_name: 'tool_search.tool_search_tool', tool_input: { query: 'anything' } }, hostEnv);
const missingToolBody = parsed(missingTool.stdout);
check(
  'denial steers to atomic self-expansion for missing capability',
  missingTool.status === 0 &&
    isDeny(missingToolBody) &&
    /implement the missing computation inside atomic-edit first/.test(denialReason(missingToolBody)),
  missingTool.stdout || missingTool.stderr,
);

// Non-mutating MCP servers (browser inspection / docs / reasoning) are admitted —
// before the host sandbox, like atomic tools — because they cannot mutate local code.
const cdpUnhosted = run({ tool_name: 'mcp__chrome-devtools__navigate_page', tool_input: { url: 'https://example.com' } });
check(
  'unhosted chrome-devtools MCP tool is admitted (browser inspection, no code mutation)',
  cdpUnhosted.status === 0 && cdpUnhosted.stdout === '',
  cdpUnhosted.stdout || cdpUnhosted.stderr,
);

const cdpUnderscore = run({ tool_name: 'mcp__chrome_devtools__navigate_page', tool_input: { url: 'https://example.com' } });
check(
  'underscore chrome_devtools MCP tool is admitted (browser inspection, no code mutation)',
  cdpUnderscore.status === 0 && cdpUnderscore.stdout === '',
  cdpUnderscore.stdout || cdpUnderscore.stderr,
);

const cdpHosted = run({ tool_name: 'mcp__chrome-devtools__take_snapshot', tool_input: {} }, hostEnv);
check('hosted chrome-devtools MCP tool passes silently', cdpHosted.status === 0 && cdpHosted.stdout === '', cdpHosted.stdout || cdpHosted.stderr);

const cdpLiveHosted = run({ tool_name: 'mcp__chrome_devtools_live__take_snapshot', tool_input: {} }, hostEnv);
check('hosted chrome-devtools-live MCP tool passes silently', cdpLiveHosted.status === 0 && cdpLiveHosted.stdout === '', cdpLiveHosted.stdout || cdpLiveHosted.stderr);

const context7 = run({ tool_name: 'mcp__context7__query-docs', tool_input: { q: 'react' } }, hostEnv);
check('hosted context7 docs MCP tool passes silently', context7.status === 0 && context7.stdout === '', context7.stdout || context7.stderr);

const seqThinking = run({ tool_name: 'mcp__sequential-thinking__sequentialthinking', tool_input: {} }, hostEnv);
check('hosted sequential-thinking MCP tool passes silently', seqThinking.status === 0 && seqThinking.stdout === '', seqThinking.stdout || seqThinking.stderr);

// REGRESSION GUARD: a code-editing MCP server (serena can rewrite symbol bodies) is
// NOT on the non-mutating allowlist, so it stays denied — local code mutation keeps
// flowing through atomic-edit only. If this ever passes, the allowlist leaked.
const serenaEdit = run({ tool_name: 'mcp__serena__replace_symbol_body', tool_input: { name: 'foo' } }, hostEnv);
const serenaEditBody = parsed(serenaEdit.stdout);
check(
  'code-editing MCP server (serena) stays denied — atomic-edit invariant preserved',
  serenaEdit.status === 0 && isDeny(serenaEditBody) && /native\/non-atomic tool/.test(denialReason(serenaEditBody)),
  serenaEdit.stdout || serenaEdit.stderr,
);

if (jsonMode) {
  process.stdout.write(JSON.stringify({ ok: failed === 0, passed, failed, failures }) + '\n');
} else {
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
}
process.exit(failed === 0 ? 0 : 1);
