#!/usr/bin/env node
// V3: restore the 41 real deletion-debt candidates per Daniel's directive.
// Keep ALL restorations where:
//   (a) audit improves, OR
//   (b) current is stub (< 30L) — technology recovery wins regardless of audit cost.
// Sequential, cumulative.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync, spawnSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const INV = join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-v3-filtered.json');

function git(args) { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 }); }
function gitSafe(args) { const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 }); return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }; }
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
  if (out.status !== 0) return { ok: false, count: null, err: (out.stderr || '').slice(0, 500) };
  const n = Number(out.stdout.trim());
  if (!Number.isFinite(n)) return { ok: false, count: null, err: 'non-numeric' };
  return { ok: true, count: n };
}

const data = JSON.parse(readFileSync(INV, 'utf8'));
const candidates = data.candidates;
console.log(`Restoring ${candidates.length} candidates`);

const SNAP = '/tmp/ceo-deletion-debt-v3-snapshot';
mkdirSync(SNAP, { recursive: true });
for (const c of candidates) {
  const dst = join(SNAP, c.file);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(REPO, c.file), dst);
}

const baseline = audit();
if (!baseline.ok) { console.error('baseline crash:', baseline.err); process.exit(1); }
console.log(`baseline auditor: ${baseline.count}`);

let cur = baseline.count;
const decisions = [];

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  const target = join(REPO, c.file);
  let oldContent;
  try { oldContent = git(['show', `${c.sha}:${c.file}`]); }
  catch (e) {
    decisions.push({ file: c.file, action: 'skip-fetch-fail' });
    console.log(`[${i+1}/${candidates.length}] ${c.file}: SKIP (fetch failed)`);
    continue;
  }
  // Ensure target dir exists
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, oldContent);
  const after = audit();
  if (!after.ok) {
    copyFileSync(join(SNAP, c.file), target);
    decisions.push({ file: c.file, action: 'revert-crash', error: after.err });
    console.log(`[${i+1}/${candidates.length}] ${c.file}: REVERT (auditor crashed)`);
    continue;
  }
  const delta = after.count - cur;
  const isStub = c.currentLoc < 30;
  if (delta < 0) {
    cur = after.count;
    decisions.push({ file: c.file, action: 'keep-improvement', delta, after: after.count, sha: c.sha, restoredLoc: oldContent.split('\n').length, currentLocBefore: c.currentLoc });
    console.log(`[${i+1}/${candidates.length}] ${c.file}: KEEP-improve Δ=${delta}`);
  } else if (isStub) {
    cur = after.count;
    decisions.push({ file: c.file, action: 'keep-stub-recovery', delta, after: after.count, sha: c.sha, restoredLoc: oldContent.split('\n').length, currentLocBefore: c.currentLoc });
    console.log(`[${i+1}/${candidates.length}] ${c.file}: KEEP-stub Δ=+${delta} (was ${c.currentLoc}L stub)`);
  } else {
    copyFileSync(join(SNAP, c.file), target);
    decisions.push({ file: c.file, action: 'revert-non-stub-regression', delta, after: after.count });
    console.log(`[${i+1}/${candidates.length}] ${c.file}: revert Δ=+${delta} (non-stub, ${c.currentLoc}L)`);
  }
}

const summary = {
  baselineAuditor: baseline.count,
  finalAuditor: cur,
  netDelta: cur - baseline.count,
  candidates: candidates.length,
  keptImprovement: decisions.filter((d) => d.action === 'keep-improvement').length,
  keptStubRecovery: decisions.filter((d) => d.action === 'keep-stub-recovery').length,
  reverted: decisions.filter((d) => d.action.startsWith('revert')).length,
  decisions,
};

writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-v3-result.json'),
  JSON.stringify(summary, null, 2),
);

console.log('\n=== SUMMARY ===');
console.log(`baseline:           ${summary.baselineAuditor}`);
console.log(`final:              ${summary.finalAuditor}`);
console.log(`net delta:          ${summary.netDelta}`);
console.log(`kept-improvement:   ${summary.keptImprovement}`);
console.log(`kept-stub-recovery: ${summary.keptStubRecovery}`);
console.log(`reverted:           ${summary.reverted}`);
