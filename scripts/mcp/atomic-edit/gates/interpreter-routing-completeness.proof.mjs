#!/usr/bin/env node
/**
 * gates/interpreter-routing-completeness.proof.mjs — proves the rank-1 no-bypass fix.
 *
 * BEFORE: atomic-only-hook.mjs `shouldRouteThroughAtomicExec` routed only a fixed verb
 * allowlist; every non-listed interpreter/binary (python3, python, ruby, perl, php,
 * osascript, Rscript, lua, go run, `./local-bin`, `/abs/path/bin`) ran NATIVELY — fully
 * outside the atomic envelope. `osascript -e` alone can drive the macOS GUI + network.
 *
 * AFTER (route-by-default): every command that is NOT a genuine escape (network /
 * git-mutate / interactive-login / package-install — `hasEscapeToken`) is forced through
 * atomic_exec (the hook returns `deny` steering to the envelope). Escapes still pass
 * native (atomic_exec cannot/should-not run them). This proof spawns the REAL hook with
 * crafted Bash tool calls (the same end-to-end pattern as no-bypass-static-policy.proof)
 * and asserts the routed/escape partition, plus parity with bypass-classify.mjs.
 *
 * Monotonic: every verb the old allowlist routed (node/git/ls/...) still routes — the
 * coverage only grows.
 */
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyToolCall } from '../bypass-classify.mjs';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(sourceDir, 'atomic-only-hook.mjs');

function runHook(command) {
  const r = childProcess.spawnSync(process.execPath, [HOOK], {
    cwd: sourceDir,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    timeout: 10000,
    // Explicitly enable routing so the test is deterministic regardless of the ambient
    // session env (ATOMIC_EXEC_MANDATORY=0 would disable routing by owner config).
    env: { ...process.env, ATOMIC_EXEC_MANDATORY: '1' },
  });
  let parsed = {};
  try {
    parsed = JSON.parse(r.stdout || '{}');
  } catch {
    parsed = {};
  }
  const decision =
    parsed?.hookSpecificOutput?.permissionDecision ?? parsed?.permissionDecision ?? null;
  return { status: r.status, decision };
}

// Non-escape commands that MUST now route (deny → steered to atomic_exec). The first
// block is the rank-1 leak (interpreters + arbitrary binaries); the tail is regression
// (verbs the old allowlist already routed must still route).
const ROUTED = [
  'python3 build.py',
  'python script.py',
  'ruby task.rb',
  'perl gen.pl',
  'osascript -e "return 1"',
  'php artisan migrate',
  'go run main.go',
  'Rscript analyze.R',
  'lua script.lua',
  './local-bin --flag',
  '/usr/local/bin/custom run',
  'node dist/server.js',
  'ls -la',
  'git status --short',
];

// Genuine escapes that MUST still pass native (no deny): atomic_exec cannot/should-not
// run network, repo-mutating git, package installs, or interactive/login programs.
const ESCAPE = [
  'git push origin main',
  'git commit -m wip',
  'curl https://example.com',
  'wget https://example.com/x',
  'npm install lodash',
  'pip install requests',
  'sudo systemctl restart x',
  'vim notes.txt',
  'psql -c "select 1"',
  'gh pr list',
];

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

for (const cmd of ROUTED) {
  const r = runHook(cmd);
  rec(`ROUTED -> atomic envelope: ${cmd}`, r.status === 0 && r.decision === 'deny', r);
}
for (const cmd of ESCAPE) {
  const r = runHook(cmd);
  rec(`ESCAPE -> native: ${cmd}`, r.status === 0 && r.decision !== 'deny', r);
}

// Parity: bypass-classify.mjs marks the routed interpreters as detectable atomic_exec
// bypasses (an equivalent EXISTS), so the bypass-rate ledger counts them honestly.
for (const cmd of ['python3 x.py', 'ruby x.rb', 'perl x.pl', 'osascript -e 1', 'go run m.go']) {
  const c = classifyToolCall({ tool: 'Bash', toolInput: { command: cmd } });
  rec(
    `CLASSIFY detectable (equiv exists): ${cmd}`,
    c.detectable === true && c.atomicEquivalent === 'atomic_exec',
    c,
  );
}
// Parity: escapes stay non-detectable in classify (atomic_exec has no equivalent for them).
for (const cmd of ['curl https://x', 'sudo restart', 'vim f', 'ssh host uptime']) {
  const c = classifyToolCall({ tool: 'Bash', toolInput: { command: cmd } });
  rec(`CLASSIFY escape non-detectable: ${cmd}`, c.detectable === false, c);
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
