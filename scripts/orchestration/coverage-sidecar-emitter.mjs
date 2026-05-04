#!/usr/bin/env node
/**
 * Coverage Sidecar Emitter — reads coverage data from lcov.info and/or
 * coverage-final.json across backend/, frontend/, worker/ workspaces,
 * normalizes per-file statistics, and writes `<source-path>.coverage.json`
 * sidecars alongside mirror `.md` nodes in the Obsidian vault `_source/` tree.
 *
 * Also injects `coverage/below-threshold` tag into mirror frontmatter when
 * line coverage pct < threshold (default 80).
 *
 * NOT constitution-locked.
 *
 * Usage:
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs           # emit
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs --dry     # preview
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs --emit    # explicit emit
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs --threshold 70
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { rewriteMirrorFrontmatterTags } from '../obsidian-mirror-daemon-indexes.mjs';

// ── Constants ────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || process.cwd());
const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');

const COVERAGE_SOURCES = [
  { dir: join(REPO_ROOT, 'backend', 'coverage'), label: 'backend' },
  { dir: join(REPO_ROOT, 'frontend', 'coverage'), label: 'frontend' },
  { dir: join(REPO_ROOT, 'worker', 'coverage'), label: 'worker' },
];

const SIDECAR_SUFFIX = '.coverage.json';
const COVERAGE_TAG_PREFIX = 'coverage/';
const BELOW_THRESHOLD_TAG = 'coverage/below-threshold';

// ── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const emit = args.includes('--emit') || !dry;
  let threshold = 80;
  const ti = args.indexOf('--threshold');
  if (ti !== -1 && args[ti + 1]) {
    const n = Number(args[ti + 1]);
    if (Number.isFinite(n) && n >= 0 && n <= 100) threshold = n;
  }
  return { dry, emit, threshold };
}

// ── Coverage source discovery ────────────────────────────────────────────────

function findCoverageFiles(dir) {
  const files = { lcov: null, json: null };
  if (!existsSync(dir)) return files;
  const lcovPath = join(dir, 'lcov.info');
  if (existsSync(lcovPath)) files.lcov = lcovPath;
  const jsonPath = join(dir, 'coverage-final.json');
  if (existsSync(jsonPath)) files.json = jsonPath;
  return files;
}

// ── LCOV parser ──────────────────────────────────────────────────────────────

function parseLcov(content) {
  /** @type {Map<string, {linesHit:number,linesFound:number,branchesHit:number,branchesFound:number}>} */
  const map = new Map();
  let current = null;
  let linesHit = 0;
  let linesFound = 0;
  let branchesHit = 0;
  let branchesFound = 0;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line === 'end_of_record') {
      if (current) {
        // Use summary values; fall back to DA/BRDA counts if no summary
        if (linesHit > 0 || linesFound > 0) {
          current.linesHit = linesHit;
          current.linesFound = linesFound;
        }
        if (branchesHit > 0 || branchesFound > 0) {
          current.branchesHit = branchesHit;
          current.branchesFound = branchesFound;
        }
      }
      current = null;
      linesHit = 0;
      linesFound = 0;
      branchesHit = 0;
      branchesFound = 0;
      continue;
    }
    if (line.startsWith('SF:')) {
      const file = line.slice(3);
      if (!map.has(file))
        map.set(file, { linesHit: 0, linesFound: 0, branchesHit: 0, branchesFound: 0 });
      current = map.get(file);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('DA:')) {
      const parts = line.slice(3).split(',');
      current.linesFound++;
      if (Number(parts[1]) > 0) current.linesHit++;
    } else if (line.startsWith('LH:')) {
      linesHit = Number(line.slice(3));
    } else if (line.startsWith('LF:')) {
      linesFound = Number(line.slice(3));
    } else if (line.startsWith('BRH:')) {
      branchesHit = Number(line.slice(4));
    } else if (line.startsWith('BRF:')) {
      branchesFound = Number(line.slice(4));
    }
  }
  return map;
}

// ── Istanbul / coverage-final.json parser ────────────────────────────────────

function parseIstanbul(content) {
  /** @type {Map<string, {linesHit:number,linesFound:number,branchesHit:number,branchesFound:number}>} */
  const map = new Map();
  const obj = JSON.parse(content);
  for (const [file, stats] of Object.entries(obj)) {
    let linesHit = 0;
    let linesFound = 0;
    let branchesHit = 0;
    let branchesFound = 0;
    if (stats.s) {
      for (const v of Object.values(stats.s)) {
        linesFound++;
        if (Number(v) > 0) linesHit++;
      }
    }
    if (stats.b) {
      for (const v of Object.values(stats.b)) {
        if (Array.isArray(v)) {
          branchesFound += v.length;
          branchesHit += v.filter((x) => Number(x) > 0).length;
        }
      }
    }
    map.set(file, { linesHit, linesFound, branchesHit, branchesFound });
  }
  return map;
}

// ── Normalizer ───────────────────────────────────────────────────────────────

function toCoverageEntry(raw) {
  const linesCovered = raw.linesHit;
  const linesTotal = raw.linesFound;
  const linesPct = linesTotal > 0 ? Math.round((linesCovered / linesTotal) * 10000) / 100 : 0;
  const branchesCovered = raw.branchesHit;
  const branchesTotal = raw.branchesFound;
  const branchesPct =
    branchesTotal > 0 ? Math.round((branchesCovered / branchesTotal) * 10000) / 100 : 0;
  return {
    lines: { covered: linesCovered, total: linesTotal, pct: linesPct },
    branches: { covered: branchesCovered, total: branchesTotal, pct: branchesPct },
  };
}

// ── Source path → repo-relative ──────────────────────────────────────────────

function repoRelative(absPath) {
  const rel = relative(REPO_ROOT, absPath);
  if (rel.startsWith('..')) return null;
  return rel.replace(/\\/g, '/');
}

// ── Mirror sidecar path ─────────────────────────────────────────────────────

function sidecarRepoPath(repoRel) {
  return join(SOURCE_MIRROR_DIR, repoRel + SIDECAR_SUFFIX);
}

function mirrorRelPath(repoRel) {
  return repoRel + '.md';
}

// ── Atomic write ─────────────────────────────────────────────────────────────

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

// ── Find existing coverage sidecars (for stale removal) ──────────────────────

function findExistingSidecars(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && e.name.endsWith(SIDECAR_SUFFIX)) {
        out.push(p);
      }
    }
  }
  return out;
}

// ── Collect coverage from all workspaces ─────────────────────────────────────

function collectCoverage() {
  const allCoverage = new Map(); // repoRel → { stats, source }
  const workspacesFound = [];

  for (const ws of COVERAGE_SOURCES) {
    const cov = findCoverageFiles(ws.dir);
    if (!cov.lcov && !cov.json) continue;
    workspacesFound.push(ws.label);

    if (cov.lcov) {
      try {
        const content = readFileSync(cov.lcov, 'utf8');
        const parsed = parseLcov(content);
        for (const [absPath, raw] of parsed) {
          const rel = repoRelative(absPath);
          if (!rel) continue;
          if (!allCoverage.has(rel) || allCoverage.get(rel).source !== 'lcov') {
            allCoverage.set(rel, { stats: toCoverageEntry(raw), source: 'lcov' });
          }
        }
      } catch (e) {
        process.stderr.write(`  ! lcov parse error ${ws.label}: ${e.message}\n`);
      }
    }

    if (cov.json) {
      try {
        const content = readFileSync(cov.json, 'utf8');
        const parsed = parseIstanbul(content);
        for (const [absPath, raw] of parsed) {
          const rel = repoRelative(absPath);
          if (!rel) continue;
          if (!allCoverage.has(rel)) {
            allCoverage.set(rel, { stats: toCoverageEntry(raw), source: 'jest' });
          }
        }
      } catch (e) {
        process.stderr.write(`  ! json parse error ${ws.label}: ${e.message}\n`);
      }
    }
  }

  return { allCoverage, workspacesFound };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { dry, emit, threshold } = parseArgs();
  const lastRun = new Date().toISOString();

  const { allCoverage, workspacesFound } = collectCoverage();

  if (workspacesFound.length === 0) {
    process.stderr.write(
      'coverage-sidecar-emitter: no coverage files found in backend/coverage/, frontend/coverage/, or worker/coverage/\n',
    );
    const summary = {
      workspacesFound: 0,
      filesWithCoverage: 0,
      taggedBelow: 0,
      sidecarsWritten: 0,
      lastRun,
    };
    process.stderr.write(JSON.stringify(summary) + '\n');
    process.exit(0);
  }

  const filesWithCoverage = allCoverage.size;

  // Build sidecar payloads
  let sidecarsWritten = 0;
  let sidecarsSkipped = 0;
  let taggedBelow = 0;

  const wanted = new Set(); // sidecar paths we wrote/want

  for (const [repoRel, { stats, source }] of allCoverage) {
    const sidecarPath = sidecarRepoPath(repoRel);
    wanted.add(sidecarPath);

    const sidecar = {
      schema: 'kloel.coverage.v1',
      lines: stats.lines,
      branches: stats.branches,
      lastRun,
      source,
    };
    const content = JSON.stringify(sidecar, null, 2) + '\n';

    // Idempotency check (ignore lastRun)
    if (existsSync(sidecarPath)) {
      try {
        const existing = JSON.parse(readFileSync(sidecarPath, 'utf8'));
        if (
          existing.lines &&
          existing.lines.covered === stats.lines.covered &&
          existing.lines.total === stats.lines.total &&
          existing.branches &&
          existing.branches.covered === stats.branches.covered &&
          existing.branches.total === stats.branches.total &&
          existing.source === source
        ) {
          sidecarsSkipped++;
          // Still check tag below
          const relMirror = mirrorRelPath(repoRel);
          const mirrorAbs = join(SOURCE_MIRROR_DIR, relMirror);
          if (stats.lines.pct < threshold && existsSync(mirrorAbs)) {
            handleBelowTag(relMirror, mirrorAbs, dry, threshold, stats.lines.pct);
            taggedBelow++;
          }
          continue;
        }
      } catch {
        /* re-write */
      }
    }

    if (emit && !dry) {
      writeAtomic(sidecarPath, content);
    }
    sidecarsWritten++;

    // Tag below-threshold
    if (stats.lines.pct < threshold) {
      const relMirror = mirrorRelPath(repoRel);
      const mirrorAbs = join(SOURCE_MIRROR_DIR, relMirror);
      if (existsSync(mirrorAbs)) {
        const changed = handleBelowTag(relMirror, mirrorAbs, dry, threshold, stats.lines.pct);
        if (changed) taggedBelow++;
      }
    }
  }

  // Remove stale sidecars
  const existingSidecars = findExistingSidecars(SOURCE_MIRROR_DIR);
  let staleRemoved = 0;
  for (const p of existingSidecars) {
    if (!wanted.has(p)) {
      if (emit && !dry) {
        try {
          unlinkSync(p);
          staleRemoved++;
        } catch (e) {
          process.stderr.write(`  ! failed to remove stale sidecar ${p}: ${e.message}\n`);
        }
      }
    }
  }

  // Top 5 worst / best 5 for smoke
  const sorted = [...allCoverage.entries()].sort(
    (a, b) => a[1].stats.lines.pct - b[1].stats.lines.pct,
  );

  process.stderr.write('--- top 5 worst-covered files ---\n');
  for (const [file, { stats }] of sorted.slice(0, 5)) {
    process.stderr.write(
      `  ${stats.lines.pct.toFixed(1)}% ${file} (lines ${stats.lines.covered}/${stats.lines.total})\n`,
    );
  }

  process.stderr.write('--- top 5 best-covered files ---\n');
  for (const [file, { stats }] of [...sorted].reverse().slice(0, 5)) {
    process.stderr.write(
      `  ${stats.lines.pct.toFixed(1)}% ${file} (lines ${stats.lines.covered}/${stats.lines.total})\n`,
    );
  }

  const summary = {
    workspacesFound: workspacesFound.length,
    filesWithCoverage,
    taggedBelow,
    sidecarsWritten,
    sidecarsSkippedUnchanged: sidecarsSkipped,
    staleRemoved,
    lastRun,
  };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

function handleBelowTag(relMirror, mirrorAbs, dry, threshold, pct) {
  if (!existsSync(mirrorAbs)) return false;
  const content = readFileSync(mirrorAbs, 'utf8');
  if (!content.startsWith('---\n')) return false;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return false;
  const frontmatter = content.slice(4, end).split('\n');
  const existing = [];
  let inTags = false;
  for (const line of frontmatter) {
    if (line === 'tags:') {
      inTags = true;
      continue;
    }
    if (inTags) {
      if (line.startsWith('  - ')) {
        existing.push(line.slice(4));
        continue;
      }
      inTags = false;
    }
  }

  const merged = existing.filter((t) => !t.startsWith(COVERAGE_TAG_PREFIX));
  if (pct < threshold) {
    merged.push(BELOW_THRESHOLD_TAG);
  }
  merged.sort();

  if (JSON.stringify(merged) === JSON.stringify(existing)) return false;
  if (dry) return true;
  return rewriteMirrorFrontmatterTags(relMirror, merged);
}

main();
