#!/usr/bin/env node
/**
 * Coverage Sidecar Emitter — CLI entrypoint (main function).  Runs the
 * full sidecar emission pipeline and prints a summary to stderr.
 *
 * Usage:
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs           # emit
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs --dry     # preview
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs --emit    # explicit emit
 *   node scripts/orchestration/coverage-sidecar-emitter.mjs --threshold 70
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseArgs,
  sidecarRepoPath,
  mirrorRelPath,
  writeAtomic,
  findExistingSidecars,
  collectCoverage,
  handleBelowTag,
  SOURCE_MIRROR_DIR,
} from './helpers.mjs';

export function main() {
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

main();
