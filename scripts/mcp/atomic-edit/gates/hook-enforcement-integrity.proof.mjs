#!/usr/bin/env node
/**
 * gates/hook-enforcement-integrity.proof.mjs — proves two atomic-only-hook hardenings:
 *
 *  RANK 7 (prose-only native Write): a native Write/Edit may target ONLY genuine prose
 *  (.md/.txt/…). Code AND secret/config-bearing non-code (.env, .html, .csv, extensionless
 *  dotfiles like .npmrc / Dockerfile) are DENIED → routed through atomic so they are
 *  security-scanned. The old `!CODE_EXT` allow let a `.env` with `sk_live_…` land native.
 *
 *  RANK 6 (host-gated self-disable): ATOMIC_EXEC_MANDATORY=0 disables routing ONLY outside
 *  an atomic-only host envelope. Inside a host-launched session (ATOMIC_HOST_ATOMIC_ONLY=1)
 *  the disable is IGNORED, so a closed-loop session cannot neutralize routing.
 *
 * Spawns the real hook (no-bypass-static-policy.proof pattern).
 */
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(sourceDir, 'atomic-only-hook.mjs');

function runHook(event, extraEnv = {}) {
  const r = childProcess.spawnSync(process.execPath, [HOOK], {
    cwd: sourceDir,
    input: JSON.stringify(event),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, ATOMIC_EXEC_MANDATORY: '1', ...extraEnv },
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
const write = (file_path, extraEnv) =>
  runHook({ tool_name: 'Write', tool_input: { file_path, content: 'x' } }, extraEnv);
const bash = (command, extraEnv) =>
  runHook({ tool_name: 'Bash', tool_input: { command } }, extraEnv);

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

// ── RANK 7: prose-only native Write ──────────────────────────────────────────────────
const WRITE_DENY = [
  'backend/.env',
  'public/index.html',
  'data/export.csv',
  'Dockerfile',
  '.npmrc',
  'config.toml',
  'src/app.ts', // code (regression: still denied)
];
const WRITE_ALLOW = ['README.md', 'docs/guide.markdown', 'notes.txt', 'CHANGELOG.text'];
for (const f of WRITE_DENY) {
  const r = write(f);
  rec(`RANK7 deny native Write: ${f}`, r.status === 0 && r.decision === 'deny', r);
}
for (const f of WRITE_ALLOW) {
  const r = write(f);
  rec(`RANK7 allow native Write (prose): ${f}`, r.status === 0 && r.decision !== 'deny', r);
}

// ── RANK 6: host-gated self-disable ──────────────────────────────────────────────────
{
  // outside the host envelope, ATOMIC_EXEC_MANDATORY=0 disables routing (owner config honored)
  const r = bash('node dist/server.js', {
    ATOMIC_EXEC_MANDATORY: '0',
    ATOMIC_HOST_ATOMIC_ONLY: '',
  });
  rec(
    'RANK6 disable honored OUTSIDE host envelope (allow)',
    r.status === 0 && r.decision !== 'deny',
    r,
  );
}
{
  // inside an atomic-only host envelope, the disable is IGNORED — routing stays active
  const r = bash('node dist/server.js', {
    ATOMIC_EXEC_MANDATORY: '0',
    ATOMIC_HOST_ATOMIC_ONLY: '1',
  });
  rec(
    'RANK6 disable IGNORED inside host envelope (deny/route)',
    r.status === 0 && r.decision === 'deny',
    r,
  );
}
{
  // sanity: default (mandatory=1) routes
  const r = bash('node dist/server.js', { ATOMIC_EXEC_MANDATORY: '1' });
  rec('RANK6 default mandatory routes (deny)', r.status === 0 && r.decision === 'deny', r);
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
