#!/usr/bin/env node
// V2: faster — only check (commit, file) pairs that the commit actually touched.
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
}

const KERNEL_RE = /\b(discover[A-Z]\w*|derive[A-Z]\w*|deriveStringUnionMembersFromTypeContract|deriveUnitValue|deriveZeroValue)\b/g;
function kernelCount(text) {
  if (!text) return 0;
  const matches = text.match(KERNEL_RE);
  return matches ? matches.length : 0;
}

// 24h commits touching scripts/pulse
const recentShas = git(['log', '--since=24 hours ago', '--format=%H', '--', 'scripts/pulse']).split('\n').filter(Boolean);
console.log(`24h commits: ${recentShas.length}`);

// For each commit, get list of scripts/pulse/* files it touched
const fileToShas = new Map();
let i = 0;
for (const sha of recentShas) {
  i++;
  if (i % 50 === 0) process.stderr.write(`  scanning commit ${i}/${recentShas.length}\n`);
  let files;
  try {
    files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n')
      .filter((f) => f.startsWith('scripts/pulse/') && f.endsWith('.ts'));
  } catch { continue; }
  for (const f of files) {
    if (!fileToShas.has(f)) fileToShas.set(f, []);
    fileToShas.get(f).push(sha);
  }
}
console.log(`Unique files modified in 24h: ${fileToShas.size}`);

// For each file: get current kernel count, find best across versions
const candidates = [];
i = 0;
for (const [rel, shas] of fileToShas) {
  i++;
  if (i % 50 === 0) process.stderr.write(`  evaluating file ${i}/${fileToShas.size}\n`);
  let curContent;
  try { curContent = readFileSync(join(REPO, rel), 'utf8'); } catch { continue; }
  const curKernel = kernelCount(curContent);
  let bestSha = null, bestKernel = curKernel;
  for (const sha of shas) {
    let content;
    try { content = git(['show', `${sha}:${rel}`]); } catch { continue; }
    const k = kernelCount(content);
    if (k > bestKernel) { bestKernel = k; bestSha = sha; }
  }
  if (bestSha) {
    candidates.push({
      file: rel,
      currentKernel: curKernel,
      bestKernel,
      bestSha,
      kernelGain: bestKernel - curKernel,
    });
  }
}
candidates.sort((a, b) => b.kernelGain - a.kernelGain);

mkdirSync(join(REPO, 'artifacts/pulse-liquefaction'), { recursive: true });
writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/best-kernel-version-v2.json'),
  JSON.stringify({ total: candidates.length, candidates }, null, 2),
);

console.log(`\nFiles with kernel-gain > 0: ${candidates.length}`);
console.log('\n=== Top 30 ===');
for (const c of candidates.slice(0, 30)) {
  console.log(`+${String(c.kernelGain).padStart(3)}  cur=${String(c.currentKernel).padStart(3)} best=${String(c.bestKernel).padStart(3)}  ${c.file} (sha ${c.bestSha.slice(0, 8)})`);
}
console.log('\nReport: artifacts/pulse-liquefaction/best-kernel-version-v2.json');
