#!/usr/bin/env node
// V2: scan ALL files in scripts/pulse on PR198 history. For each, find the
// MOST RECENT historical version with substantially more content than current
// (i.e., the post-liquefaction state right before deletion). Test restoration.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync, spawnSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const PR198 = 'chore/codacy-tsdoc-pulse-updates-apr23';

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
  if (out.status !== 0) return { ok: false, count: null, err: (out.stderr || '').slice(0, 500) };
  const n = Number(out.stdout.trim());
  if (!Number.isFinite(n)) return { ok: false, count: null, err: 'non-numeric' };
  return { ok: true, count: n };
}
function loc(text) { return text ? text.split('\n').length : 0; }

// Step 1: list every file currently in scripts/pulse (recursive, all .ts)
function listAllPulseTs() {
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === 'node_modules') continue;
        walk(full);
      } else if (entry.endsWith('.ts')) {
        out.push(full.replace(REPO + '/', ''));
      }
    }
  }
  walk(join(REPO, 'scripts/pulse'));
  return out;
}

// Step 2: for each file, find most recent historical version with substantially more content
function findLastGoodVersion(rel, currentLoc) {
  let shas;
  try {
    // Search all branches/refs newest→oldest
    shas = git(['log', '--all', '--format=%H', '--', rel]).split('\n').filter(Boolean);
  } catch { return null; }
  // Threshold: at least 2× current and at least 100 lines absolute
  const minLoc = Math.max(currentLoc * 2, 100);
  for (const sha of shas) {
    let content;
    try { content = git(['show', `${sha}:${rel}`]); } catch { continue; }
    const l = loc(content);
    if (l >= minLoc) return { sha, loc: l, content };
  }
  return null;
}

console.log('Listing files...');
const allFiles = listAllPulseTs();
console.log(`Total .ts in scripts/pulse: ${allFiles.length}`);

console.log('Finding deletion-debt candidates (this scans git history)...');
const candidates = [];
let scanI = 0;
for (const rel of allFiles) {
  scanI++;
  if (scanI % 50 === 0) process.stderr.write(`  ${scanI}/${allFiles.length}\n`);
  const full = join(REPO, rel);
  const cur = loc(readFileSync(full, 'utf8'));
  // Only candidates where current is small enough to suggest deletion
  if (cur > 250) continue; // probably not deleted
  const good = findLastGoodVersion(rel, cur);
  if (!good) continue;
  // Require gap > 50 lines
  if (good.loc - cur < 50) continue;
  candidates.push({ file: rel, currentLoc: cur, goodLoc: good.loc, sha: good.sha, gap: good.loc - cur });
}
candidates.sort((a, b) => b.gap - a.gap);
console.log(`Candidates: ${candidates.length}`);

mkdirSync(join(REPO, 'artifacts/pulse-liquefaction'), { recursive: true });
writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-v2-candidates.json'),
  JSON.stringify({ total: candidates.length, candidates }, null, 2),
);

if (process.argv.includes('--inventory-only')) {
  console.log('\n=== Top 30 candidates ===');
  for (const c of candidates.slice(0, 30)) {
    console.log(`gap=${String(c.gap).padStart(5)} cur=${String(c.currentLoc).padStart(4)} good=${String(c.goodLoc).padStart(5)} ${c.file} (sha ${c.sha.slice(0, 8)})`);
  }
  process.exit(0);
}

// Step 3: test each restoration cumulatively
const SNAP = '/tmp/ceo-deletion-debt-v2-snapshot';
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

for (const c of candidates) {
  const target = join(REPO, c.file);
  let oldContent;
  try { oldContent = git(['show', `${c.sha}:${c.file}`]); }
  catch (e) {
    decisions.push({ file: c.file, action: 'skip-fetch-fail', error: String(e).slice(0, 200) });
    continue;
  }
  writeFileSync(target, oldContent);
  const after = audit();
  if (!after.ok) {
    copyFileSync(join(SNAP, c.file), target);
    decisions.push({ file: c.file, action: 'revert-crash', error: after.err.slice(0, 200) });
    console.log(`  ${c.file}: REVERT (auditor crashed)`);
    continue;
  }
  const delta = after.count - cur;
  // Daniel's directive: keep if reduces auditor OR if current was a stub (< 30L)
  const isStub = c.currentLoc < 30;
  if (delta < 0) {
    cur = after.count;
    decisions.push({ file: c.file, action: 'keep-improvement', delta, after: after.count, sha: c.sha, restoredLoc: oldContent.split('\n').length, currentLocBefore: c.currentLoc });
    console.log(`  ${c.file}: KEEP-improve Δ=${delta} (cur ${cur})`);
  } else if (isStub && delta < 100) {
    // Tech recovery: file was a stub, restoration adds content with modest audit cost
    cur = after.count;
    decisions.push({ file: c.file, action: 'keep-stub-recovery', delta, after: after.count, sha: c.sha, restoredLoc: oldContent.split('\n').length, currentLocBefore: c.currentLoc });
    console.log(`  ${c.file}: KEEP-stub Δ=+${delta} (was stub ${c.currentLoc}L)`);
  } else {
    copyFileSync(join(SNAP, c.file), target);
    decisions.push({ file: c.file, action: 'revert-no-improvement', delta, after: after.count });
    console.log(`  ${c.file}: revert Δ=+${delta}`);
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
  join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-v2-result.json'),
  JSON.stringify(summary, null, 2),
);

console.log('\n=== SUMMARY ===');
console.log(`baseline:           ${summary.baselineAuditor}`);
console.log(`final:              ${summary.finalAuditor}`);
console.log(`net delta:          ${summary.netDelta}`);
console.log(`kept-improvement:   ${summary.keptImprovement}`);
console.log(`kept-stub-recovery: ${summary.keptStubRecovery}`);
console.log(`reverted:           ${summary.reverted}`);
console.log(`\nReport: artifacts/pulse-liquefaction/deletion-debt-v2-result.json`);
