#!/usr/bin/env node
// For each scripts/pulse file, walk all 24h commits and find the version with
// the most kernel-call imports (proxy for "best liquefaction state").
// Output: list of (file, sha, currentKernelCount, bestKernelCount) for cases
// where best > current.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
}

const KERNEL_RE = /\b(discover[A-Z]\w*|derive[A-Z]\w*|deriveStringUnionMembersFromTypeContract|deriveUnitValue|deriveZeroValue|deriveHttpStatus)\b/g;
const HARDCODE_PROXY_RE = /(['"`])(?!\1)[^\1]{2,}\1/g; // crude: counts non-empty quoted literals

function kernelCount(text) {
  if (!text) return 0;
  const matches = text.match(KERNEL_RE);
  return matches ? matches.length : 0;
}
function hardcodeProxy(text) {
  if (!text) return 0;
  const matches = text.match(HARDCODE_PROXY_RE);
  return matches ? matches.length : 0;
}

// List all .ts files in scripts/pulse
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

// Last 24h commits affecting scripts/pulse
const recentShas = git(['log', '--since=24 hours ago', '--format=%H', '--', 'scripts/pulse']).split('\n').filter(Boolean);
console.log(`24h commits touching scripts/pulse: ${recentShas.length}`);

const allFiles = listAllPulseTs();
console.log(`Total .ts files in scripts/pulse: ${allFiles.length}`);

const candidates = [];
let i = 0;
for (const rel of allFiles) {
  i++;
  if (i % 50 === 0) process.stderr.write(`  ${i}/${allFiles.length}\n`);
  let curContent;
  try { curContent = readFileSync(join(REPO, rel), 'utf8'); } catch { continue; }
  const curKernel = kernelCount(curContent);
  const curHardcode = hardcodeProxy(curContent);
  const curLoc = curContent.split('\n').length;

  // Find versions across recent commits where kernel count > current
  let bestSha = null, bestKernel = curKernel, bestLoc = curLoc, bestHardcode = curHardcode;
  for (const sha of recentShas) {
    let content;
    try { content = git(['show', `${sha}:${rel}`]); } catch { continue; }
    const k = kernelCount(content);
    if (k > bestKernel) {
      bestKernel = k;
      bestSha = sha;
      bestLoc = content.split('\n').length;
      bestHardcode = hardcodeProxy(content);
    }
  }
  if (bestSha) {
    candidates.push({
      file: rel,
      currentKernel: curKernel,
      currentLoc: curLoc,
      currentHardcode: curHardcode,
      bestKernel,
      bestSha,
      bestLoc,
      bestHardcode,
      kernelGain: bestKernel - curKernel,
      hardcodeDelta: bestHardcode - curHardcode,
    });
  }
}

candidates.sort((a, b) => b.kernelGain - a.kernelGain);

mkdirSync(join(REPO, 'artifacts/pulse-liquefaction'), { recursive: true });
writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/best-kernel-version-candidates.json'),
  JSON.stringify({ total: candidates.length, candidates }, null, 2),
);

console.log(`\nFiles with kernelGain > 0: ${candidates.length}`);
console.log('\n=== Top 30 candidates ===');
for (const c of candidates.slice(0, 30)) {
  console.log(`+${String(c.kernelGain).padStart(3)} kernel  cur=${String(c.currentKernel).padStart(3)} best=${String(c.bestKernel).padStart(3)}  hardΔ=${c.hardcodeDelta > 0 ? '+' : ''}${c.hardcodeDelta}  ${c.file} (sha ${c.bestSha.slice(0, 8)})`);
}
console.log(`\nReport: artifacts/pulse-liquefaction/best-kernel-version-candidates.json`);
