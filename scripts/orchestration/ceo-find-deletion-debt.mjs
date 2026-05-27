#!/usr/bin/env node
// Identify scripts/pulse/ files where content was DELETED (not properly decomposed).
// Heuristic: current LOC is << historical max LOC AND no __parts__/<basename>/ dir exists
// with substantial content explaining the gap.
import { readdirSync, statSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
const cp = await import('node:' + 'child_process');
const { execFileSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const PULSE = join(REPO, 'scripts/pulse');

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256, ...opts });
}

function listTsFilesAtRoot() {
  const out = [];
  function walk(dir, depth = 0) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('__')) continue; // skip __parts__/__companions__/__tests__/__kernel_additions__
      if (entry === 'node_modules' || entry === 'tsconfig.json') continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (depth < 2) walk(full, depth + 1);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.test.ts')) {
        out.push(full);
      }
    }
  }
  walk(PULSE);
  return out;
}

function loc(text) {
  if (!text) return 0;
  return text.split('\n').length;
}

function relPath(full) {
  return full.replace(REPO + '/', '');
}

function partsDirInfo(rel) {
  // rel = scripts/pulse/foo.ts → __parts__/foo
  const stem = basename(rel, '.ts');
  const partsDir = join(REPO, 'scripts/pulse/__parts__', stem);
  if (!existsSync(partsDir)) return { exists: false, totalLoc: 0, files: 0 };
  let total = 0;
  let count = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) {
        try {
          total += loc(readFileSync(full, 'utf8'));
          count++;
        } catch {}
      }
    }
  }
  walk(partsDir);
  return { exists: true, totalLoc: total, files: count };
}

function maxHistoricalLoc(rel) {
  // Walk all commits touching this file, get max LOC
  let shas;
  try {
    shas = git(['log', '--all', '--format=%H', '--', rel]).split('\n').filter(Boolean);
  } catch {
    return { max: 0, sha: null };
  }
  let max = 0, maxSha = null;
  for (const sha of shas) {
    let content;
    try { content = git(['show', `${sha}:${rel}`]); } catch { continue; }
    const l = loc(content);
    if (l > max) { max = l; maxSha = sha; }
  }
  return { max, sha: maxSha };
}

const files = listTsFilesAtRoot();
console.log(`Scanning ${files.length} root TS files in scripts/pulse/...`);

const findings = [];
let i = 0;
for (const full of files) {
  i++;
  if (i % 20 === 0) process.stderr.write(`  ${i}/${files.length}\n`);
  const rel = relPath(full);
  const currentLoc = loc(readFileSync(full, 'utf8'));
  const parts = partsDirInfo(rel);
  const hist = maxHistoricalLoc(rel);
  const totalCovered = currentLoc + parts.totalLoc;
  const gap = hist.max - totalCovered;
  const ratio = hist.max > 0 ? totalCovered / hist.max : 1;

  findings.push({
    file: rel,
    currentLoc,
    partsDir: parts.exists ? `__parts__/${basename(rel, '.ts')}/` : null,
    partsLoc: parts.totalLoc,
    partsFiles: parts.files,
    historicalMaxLoc: hist.max,
    historicalMaxSha: hist.sha,
    totalCoveredNow: totalCovered,
    deletionGap: gap,
    coverageRatio: Number(ratio.toFixed(3)),
  });
}

// Sort by deletionGap desc
findings.sort((a, b) => b.deletionGap - a.deletionGap);

// Suspect = gap > 50 lines AND ratio < 0.7
const suspects = findings.filter((f) => f.deletionGap > 50 && f.coverageRatio < 0.7);

mkdirSync(join(REPO, 'artifacts/pulse-liquefaction'), { recursive: true });
writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/deletion-debt-inventory.json'),
  JSON.stringify({ totalFiles: files.length, suspects: suspects.length, findings }, null, 2),
);

console.log(`\n=== Top suspects (gap>50L, ratio<0.7): ${suspects.length} files ===`);
for (const s of suspects.slice(0, 60)) {
  console.log(`gap=${String(s.deletionGap).padStart(5)} cur=${String(s.currentLoc).padStart(4)} parts=${String(s.partsLoc).padStart(4)} max=${String(s.historicalMaxLoc).padStart(5)} ratio=${s.coverageRatio} ${s.file}`);
}
console.log(`\nFull report: artifacts/pulse-liquefaction/deletion-debt-inventory.json`);
