#!/usr/bin/env node
/**
 * gates/destructive-git-escape-denial.proof.mjs — proves the atomic-only hook DENIES the
 * destructive worktree escapes that `hasEscapeToken` would otherwise wave through to native
 * Bash. `git restore` is an ABSOLUTE prohibition in this repo (CLAUDE.md); `git reset
 * --hard`, `git clean -f`, and `git checkout -- <path>` / `git checkout .` silently destroy
 * uncommitted work and atomic_exec cannot reverse them (no whole-repo snapshot). Branch ops
 * (checkout <branch>, switch, reset --soft, commit, push) must STILL pass native.
 *
 * Spawns the real hook (same pattern as no-bypass-static-policy.proof) and asserts the
 * deny/allow partition + that destructive denials cite the destructive reason (not the
 * generic route message).
 */
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(sourceDir, 'atomic-only-hook.mjs');

function runHook(command) {
  const r = childProcess.spawnSync(process.execPath, [HOOK], {
    cwd: sourceDir,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, ATOMIC_EXEC_MANDATORY: '1' },
  });
  let parsed = {};
  try {
    parsed = JSON.parse(r.stdout || '{}');
  } catch {
    parsed = {};
  }
  const out = parsed?.hookSpecificOutput ?? parsed ?? {};
  return {
    status: r.status,
    decision: out.permissionDecision ?? null,
    reason: out.permissionDecisionReason ?? '',
  };
}

// MUST be denied with the DESTRUCTIVE reason (not routed, not allowed).
const DESTRUCTIVE = [
  'git restore src/app.ts',
  'git restore .',
  'git restore --staged --worktree src/',
  'git reset --hard',
  'git reset --hard HEAD~3',
  'git clean -fd',
  'git clean -xfd',
  'git checkout -- src/app.ts',
  'git checkout .',
  'git checkout HEAD -- package.json',
];

// MUST pass native (no deny): branch / history ops that do NOT discard the worktree.
const SAFE_NATIVE = [
  'git checkout main',
  'git checkout -b feat/new',
  'git switch develop',
  'git reset --soft HEAD~1',
  'git commit -m wip',
  'git push origin main',
  'git stash',
  'git clean -n', // dry-run: lists only, no -f, deletes nothing
];

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

for (const cmd of DESTRUCTIVE) {
  const r = runHook(cmd);
  const citesDestructive = /restore|destroy|discard|reset --hard|working tree/i.test(r.reason);
  rec(`DENY destructive: ${cmd}`, r.status === 0 && r.decision === 'deny' && citesDestructive, r);
}
for (const cmd of SAFE_NATIVE) {
  const r = runHook(cmd);
  rec(`ALLOW native (non-destructive): ${cmd}`, r.status === 0 && r.decision !== 'deny', r);
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
