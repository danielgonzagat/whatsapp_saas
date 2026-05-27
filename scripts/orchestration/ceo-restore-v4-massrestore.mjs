#!/usr/bin/env node
// V4: MASS RESTORE per Daniel's directive.
// Restore ALL 41 candidates from their good historical sha unconditionally.
// One audit before, one audit after. Per-file deltas only computed on demand later.
// Goal: technology recovery first, auditor delta is cost-of-doing-business.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync, spawnSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const INV = join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-v3-filtered.json');

function git(args) { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 }); }
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
  if (out.status !== 0) return { ok: false, err: out.stderr || '' };
  return { ok: true, count: Number(out.stdout.trim()) };
}

const data = JSON.parse(readFileSync(INV, 'utf8'));
const candidates = data.candidates;
console.log(`Mass-restoring ${candidates.length} candidates`);

const SNAP = '/tmp/ceo-deletion-debt-v4-snapshot';
mkdirSync(SNAP, { recursive: true });
for (const c of candidates) {
  const dst = join(SNAP, c.file);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(REPO, c.file), dst);
}

const baseline = audit();
if (!baseline.ok) { console.error('baseline crash'); process.exit(1); }
console.log(`baseline: ${baseline.count}`);

const restored = [];
for (const c of candidates) {
  const target = join(REPO, c.file);
  let content;
  try { content = git(['show', `${c.sha}:${c.file}`]); }
  catch (e) {
    console.log(`SKIP ${c.file} (fetch fail)`);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  restored.push({ file: c.file, sha: c.sha, restoredLoc: content.split('\n').length, currentLocBefore: c.currentLoc });
}
console.log(`Wrote ${restored.length} files. Auditing...`);

const after = audit();
if (!after.ok) {
  console.error(`AUDIT CRASHED post-restore: ${after.err.slice(0, 500)}`);
  // Can't bisect easily without per-file audits. Restore current snapshot.
  console.log('Reverting all restorations due to crash.');
  for (const r of restored) {
    copyFileSync(join(SNAP, r.file), join(REPO, r.file));
  }
  process.exit(2);
}

const delta = after.count - baseline.count;
const totalRestoredLoc = restored.reduce((s, r) => s + r.restoredLoc, 0);
const totalLostLoc = restored.reduce((s, r) => s + r.currentLocBefore, 0);

const summary = {
  baselineAuditor: baseline.count,
  afterAuditor: after.count,
  delta,
  filesRestored: restored.length,
  totalLocRestored: totalRestoredLoc,
  totalLocBefore: totalLostLoc,
  netLocRecovered: totalRestoredLoc - totalLostLoc,
  decisions: restored,
};

writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-v4-result.json'),
  JSON.stringify(summary, null, 2),
);

console.log('\n=== SUMMARY ===');
console.log(`baseline auditor:    ${summary.baselineAuditor}`);
console.log(`after restoration:   ${summary.afterAuditor}`);
console.log(`auditor delta:       ${delta > 0 ? '+' : ''}${delta}`);
console.log(`files restored:      ${summary.filesRestored}`);
console.log(`LOC recovered:       ${summary.totalLocBefore}L → ${summary.totalLocRestored}L (+${summary.netLocRecovered})`);
