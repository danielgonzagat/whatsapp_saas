#!/usr/bin/env node
// Test restoration of suspect deletion-debt files. For each:
//   1. Snapshot current
//   2. Restore historical max content
//   3. Audit globally
//   4. If audit went DOWN: keep (cumulative)
//   5. Else: revert to current snapshot
// Records per-file delta; final summary contains net improvement.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync, spawnSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const INVENTORY = join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-inventory.json');

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
}
function gitSafe(args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function audit() {
  const out = spawnSync(
    'backend/node_modules/.bin/ts-node',
    [
      '--transpile-only',
      '--project', 'scripts/pulse/tsconfig.json',
      '-e',
      'process.stdout.write(""+require("./scripts/pulse/no-hardcoded-reality-audit").auditPulseNoHardcodedReality(process.cwd()).findings.length)',
    ],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 },
  );
  if (out.status !== 0) return { ok: false, count: null, err: out.stderr };
  const n = Number(out.stdout.trim());
  if (!Number.isFinite(n)) return { ok: false, count: null, err: 'non-numeric: ' + out.stdout };
  return { ok: true, count: n };
}

const inv = JSON.parse(readFileSync(INVENTORY, 'utf8'));
// Take only the 23 strict suspects, sorted by gap desc (most impactful first)
const candidates = inv.findings
  .filter((f) => f.deletionGap > 50 && f.coverageRatio < 0.7)
  .sort((a, b) => b.deletionGap - a.deletionGap);

console.log(`Testing ${candidates.length} restoration candidates`);

const SNAP = '/tmp/ceo-deletion-debt-snapshot';
mkdirSync(SNAP, { recursive: true });
// Snapshot current of every candidate
for (const c of candidates) {
  const dst = join(SNAP, c.file);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(REPO, c.file), dst);
}

const baseline = audit();
if (!baseline.ok) {
  console.error('BASELINE AUDIT FAILED:', baseline.err);
  process.exit(1);
}
console.log(`baseline auditor: ${baseline.count}`);

let cur = baseline.count;
const decisions = [];

for (const c of candidates) {
  const target = join(REPO, c.file);
  // Restore historical max content
  let oldContent;
  try {
    oldContent = git(['show', `${c.historicalMaxSha}:${c.file}`]);
  } catch (e) {
    console.log(`  ${c.file}: cannot fetch historical content — skip`);
    decisions.push({ file: c.file, action: 'skip-fetch-fail', error: String(e).slice(0, 200) });
    continue;
  }
  writeFileSync(target, oldContent);

  const after = audit();
  if (!after.ok) {
    // Auditor crashed — revert immediately
    copyFileSync(join(SNAP, c.file), target);
    console.log(`  ${c.file}: REVERT (auditor crashed) ${after.err.slice(0, 200)}`);
    decisions.push({ file: c.file, action: 'revert-crash', error: after.err.slice(0, 500) });
    continue;
  }
  const delta = after.count - cur;
  if (delta < 0) {
    // Improvement — keep
    cur = after.count;
    console.log(`  ${c.file}: KEEP Δ=${delta} (cur ${cur})`);
    decisions.push({ file: c.file, action: 'keep', delta, after: after.count, sha: c.historicalMaxSha, restoredLoc: oldContent.split('\n').length });
  } else {
    // No improvement — revert
    copyFileSync(join(SNAP, c.file), target);
    console.log(`  ${c.file}: revert Δ=${delta}`);
    decisions.push({ file: c.file, action: 'revert-no-improvement', delta, after: after.count });
  }
}

const summary = {
  baselineAuditor: baseline.count,
  finalAuditor: cur,
  netDelta: cur - baseline.count,
  candidates: candidates.length,
  kept: decisions.filter((d) => d.action === 'keep').length,
  reverted: decisions.filter((d) => d.action.startsWith('revert')).length,
  decisions,
};

writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-restore-result.json'),
  JSON.stringify(summary, null, 2),
);

console.log('\n=== SUMMARY ===');
console.log(`baseline:     ${summary.baselineAuditor}`);
console.log(`final:        ${summary.finalAuditor}`);
console.log(`net delta:    ${summary.netDelta}`);
console.log(`kept:         ${summary.kept}`);
console.log(`reverted:     ${summary.reverted}`);
console.log(`\nReport: artifacts/pulse-liquefaction/deletion-debt-restore-result.json`);
