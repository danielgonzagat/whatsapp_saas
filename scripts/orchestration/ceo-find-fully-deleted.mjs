#!/usr/bin/env node
// Find files that EXISTED in PR198 history but no longer exist in current worktree.
// For each, identify the most-content version and report.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const PR198 = 'chore/codacy-tsdoc-pulse-updates-apr23';

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
}

const mb = git(['merge-base', PR198, 'main']).trim();
console.log(`PR198 merge-base: ${mb}`);

// Step 1: list ALL files that ever existed in scripts/pulse on PR198 history
console.log('Listing all files ever in scripts/pulse on PR198...');
const allEverFiles = new Set();
const everLog = git(['log', '--all', '--name-only', '--format=', '--', 'scripts/pulse/']).split('\n').filter(Boolean);
for (const f of everLog) {
  if (f.endsWith('.ts')) allEverFiles.add(f);
}
console.log(`Files ever existed: ${allEverFiles.size}`);

// Step 2: filter to files NOT existing now
const missing = [];
for (const rel of allEverFiles) {
  if (!existsSync(join(REPO, rel))) missing.push(rel);
}
console.log(`Files missing from current worktree: ${missing.length}`);

// Step 3: for each missing, find most-content version
const enriched = [];
let i = 0;
for (const rel of missing) {
  i++;
  if (i % 100 === 0) process.stderr.write(`  ${i}/${missing.length}\n`);
  let shas;
  try {
    shas = git(['log', '--all', '--format=%H', '--', rel]).split('\n').filter(Boolean);
  } catch { continue; }
  let bestSha = null, bestLoc = 0;
  for (const sha of shas) {
    let content;
    try { content = git(['show', `${sha}:${rel}`]); } catch { continue; }
    const loc = content.split('\n').length;
    if (loc > bestLoc) { bestLoc = loc; bestSha = sha; }
  }
  if (bestSha && bestLoc > 50) {
    enriched.push({ file: rel, bestLoc, bestSha });
  }
}
enriched.sort((a, b) => b.bestLoc - a.bestLoc);

mkdirSync(join(REPO, 'artifacts/pulse-liquefaction'), { recursive: true });
writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/fully-deleted-files.json'),
  JSON.stringify({ total: enriched.length, files: enriched }, null, 2),
);

console.log(`\n=== ${enriched.length} fully-deleted candidates (max LOC > 50) ===`);
for (const f of enriched.slice(0, 30)) {
  console.log(`bestLoc=${String(f.bestLoc).padStart(5)} ${f.file} (sha ${f.bestSha.slice(0, 8)})`);
}
console.log(`\nFull list: artifacts/pulse-liquefaction/fully-deleted-files.json`);
