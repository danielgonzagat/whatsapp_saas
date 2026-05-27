#!/usr/bin/env node
// Sweep historical commits to find the auditor minimum.
// Uses git worktree add at each candidate sha, runs auditor, removes.
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync, spawnSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';

function git(args, cwd = REPO) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
}
function gitSafe(args, cwd = REPO) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function auditAt(targetCwd) {
  // Run ts-node from main worktree (has node_modules) but pass targetCwd to auditor
  const code = `try{const p=process.argv[1];process.stdout.write(""+require("./scripts/pulse/no-hardcoded-reality-audit").auditPulseNoHardcodedReality(p).findings.length)}catch(e){process.stderr.write("CRASH:"+(e.message||e));process.exit(2)}`;
  const out = spawnSync(
    'backend/node_modules/.bin/ts-node',
    [
      '--transpile-only',
      '--project', 'scripts/pulse/tsconfig.json',
      '-e', code,
      targetCwd,
    ],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 },
  );
  if (out.status !== 0) return { ok: false, err: (out.stderr || '').slice(0, 300) };
  const n = Number(out.stdout.trim());
  if (!Number.isFinite(n)) return { ok: false, err: 'non-numeric: ' + out.stdout.slice(0, 100) };
  return { ok: true, count: n };
}

// Build sha sweep: focus on last 24h (223 commits) where minimum was achieved
const targets = [
  'HEAD',          // 176745 (known, ~current)
  'HEAD~10',       // E9 wave commits region
  'HEAD~25',
  'HEAD~50',       // 104161 (known)
  'HEAD~75',
  'HEAD~100',
  'HEAD~150',
  'HEAD~200',
  'HEAD~222',      // edge of 24h
];
const explicitShas = []; // skip PR198 specific shas — they're outside 24h

const allShas = [];
for (const t of targets) {
  try {
    const sha = git(['rev-parse', t]).trim();
    if (sha) allShas.push({ ref: t, sha });
  } catch {}
}
for (const sha of explicitShas) {
  try {
    const full = git(['rev-parse', sha]).trim();
    if (full) allShas.push({ ref: `pr198-${sha}`, sha: full });
  } catch {}
}
// Deduplicate by sha
const seen = new Set();
const unique = [];
for (const item of allShas) {
  if (!seen.has(item.sha)) { seen.add(item.sha); unique.push(item); }
}
console.log(`Sweeping ${unique.length} unique shas`);

const results = [];
const WORKBASE = '/tmp/ceo-audit-sweep';
mkdirSync(WORKBASE, { recursive: true });

for (let i = 0; i < unique.length; i++) {
  const { ref, sha } = unique[i];
  const wtPath = join(WORKBASE, `wt-${sha.slice(0, 10)}`);
  console.log(`[${i+1}/${unique.length}] ${ref} ${sha.slice(0, 10)} → adding worktree`);
  // Cleanup if exists
  if (existsSync(wtPath)) {
    gitSafe(['worktree', 'remove', '--force', wtPath]);
    try { rmSync(wtPath, { recursive: true, force: true }); } catch {}
  }
  const add = gitSafe(['worktree', 'add', '--detach', wtPath, sha]);
  if (add.code !== 0) {
    console.log(`  worktree add failed: ${add.stderr.slice(0, 200)}`);
    results.push({ ref, sha, error: 'worktree-add-failed' });
    continue;
  }
  const a = auditAt(wtPath);
  console.log(`  audit: ${a.ok ? a.count : 'CRASH ' + a.err}`);
  results.push({ ref, sha, audit: a.ok ? a.count : null, error: a.ok ? null : a.err });
  gitSafe(['worktree', 'remove', '--force', wtPath]);
  try { rmSync(wtPath, { recursive: true, force: true }); } catch {}
}

results.sort((a, b) => (a.audit || 999999) - (b.audit || 999999));
console.log('\n=== SWEEP RESULTS (sorted by audit asc) ===');
for (const r of results) {
  console.log(`audit=${r.audit ?? 'CRASH'}  ${r.ref.padEnd(20)}  ${r.sha.slice(0, 10)}`);
}

writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/audit-history-sweep.json'),
  JSON.stringify({ results }, null, 2),
);
console.log('\nReport: artifacts/pulse-liquefaction/audit-history-sweep.json');
