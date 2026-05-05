/**
 * Findings Watch — engine: scoped ESLint runs, aggregate patching,
 * and sidecar emission for individual file changes.
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, relative, join, sep } from 'node:path';
import crypto from 'node:crypto';
import { SEVERITY_WEIGHT, assertFinding } from '../../../findings-engines/_schema.mjs';
import {
  state,
  log,
  writeAtomic,
  sidecarPathFor,
  buildSidecar,
  dominantSeverity,
  readAggregate,
  emitSingleSidecar,
  REPO_ROOT,
  AGGREGATE_PATH,
  eslintSeverityToSeverity,
  findWorkspaceRoot,
  workspaceRelative,
  SOURCE_MIRROR_DIR,
  FAST_LANE_EXTENSIONS,
} from './helpers.mjs';

// ---------------------------------------------------------------------------
// Aggregate patch helpers (fast lane)
// ---------------------------------------------------------------------------

/**
 * Patch the aggregate: replace ESLint findings for a single file.
 * @param {string} repoRelative — repo-relative path (forward slashes)
 * @param {any[]} newFindings — new Finding[] from scoped ESLint run
 */
export function patchAggregate(repoRelative, newFindings) {
  let agg = readAggregate();
  if (!agg || !Array.isArray(agg.files)) {
    agg = {
      generatedAt: new Date().toISOString(),
      repoRoot: REPO_ROOT,
      engines: {},
      totals: {
        findings: 0,
        filesWithFindings: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      },
      files: [],
    };
  }

  const generatedAt = new Date().toISOString();
  agg.generatedAt = generatedAt;

  // Remove the file entry if it exists (we rebuild it)
  const idx = agg.files.findIndex((f) => f.file === repoRelative);

  let fileEntry;
  if (idx >= 0) {
    fileEntry = agg.files[idx];
    // Remove old ESLint findings
    fileEntry.findings = fileEntry.findings.filter((f) => f.engine !== 'eslint');
  }

  if (newFindings.length === 0 && idx < 0) {
    // No file entry and no new findings — nothing to do
    return;
  }

  if (newFindings.length === 0 && idx >= 0) {
    // No new findings, and we removed ESLint ones. If file has no findings left, remove it.
    if (fileEntry.findings.length === 0) {
      agg.files.splice(idx, 1);
    } else {
      // Recalculate stats
      fileEntry.count = fileEntry.findings.length;
      fileEntry.dominantSeverity = dominantSeverity(fileEntry.findings);
      fileEntry.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      fileEntry.categories = [];
      const catSet = new Set();
      for (const f of fileEntry.findings) {
        fileEntry.severityCounts[f.severity]++;
        catSet.add(f.category);
      }
      fileEntry.categories = Array.from(catSet).sort();
    }
  }

  if (newFindings.length > 0) {
    if (idx >= 0) {
      // Merge into existing entry
      fileEntry.findings.push(...newFindings);
      fileEntry.count = fileEntry.findings.length;
      fileEntry.dominantSeverity = dominantSeverity(fileEntry.findings);
      fileEntry.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      const catSet = new Set();
      for (const f of fileEntry.findings) {
        fileEntry.severityCounts[f.severity]++;
        catSet.add(f.category);
      }
      fileEntry.categories = Array.from(catSet).sort();
    } else {
      // New file entry
      const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      const catSet = new Set();
      for (const f of newFindings) {
        sevCounts[f.severity]++;
        catSet.add(f.category);
      }
      fileEntry = {
        file: repoRelative,
        count: newFindings.length,
        dominantSeverity: dominantSeverity(newFindings),
        severityCounts: sevCounts,
        categories: Array.from(catSet).sort(),
        findings: newFindings,
      };
      agg.files.push(fileEntry);
    }
  }

  // Re-sort files
  agg.files.sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.dominantSeverity] ?? 0;
    const sb = SEVERITY_WEIGHT[b.dominantSeverity] ?? 0;
    if (sa !== sb) return sb - sa;
    if (a.count !== b.count) return b.count - a.count;
    return a.file.localeCompare(b.file);
  });

  // Recalculate totals
  let total = 0;
  const sevs = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of agg.files) {
    total += f.count;
    for (const s of ['critical', 'high', 'medium', 'low']) {
      sevs[s] += f.severityCounts[s];
    }
  }
  agg.totals = {
    findings: total,
    filesWithFindings: agg.files.length,
    bySeverity: sevs,
  };

  // Update eslint engine metadata
  if (agg.engines && agg.engines.eslint) {
    let eslintTotal = 0;
    for (const f of agg.files) {
      eslintTotal += f.findings.filter((x) => x.engine === 'eslint').length;
    }
    agg.engines.eslint.findingsCount = eslintTotal;
    agg.engines.eslint.ranAt = generatedAt;
  }

  try {
    writeFileSync(AGGREGATE_PATH, JSON.stringify(agg, null, 2));
  } catch (e) {
    log('error', `patchAggregate write failed: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Scoped ESLint (fast lane)
// ---------------------------------------------------------------------------

/**
 * Run scoped ESLint for a single file and convert to Finding[].
 * @param {string} absPath — absolute path to the changed file
 * @returns {Promise<any[]>}
 */
export function runScopedEslint(absPath) {
  return new Promise((resolvePromise) => {
    const wsRoot = findWorkspaceRoot(absPath);
    if (!wsRoot) {
      resolvePromise([]);
      return;
    }

    const relPath = workspaceRelative(wsRoot, absPath);
    const start = Date.now();

    const child = spawn(
      'npx',
      ['--no-install', 'eslint', '--format', 'json', '--no-error-on-unmatched-pattern', relPath],
      {
        cwd: wsRoot,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      if (code === null) {
        log('error', `eslint-fast: killed for ${absPath}`);
        resolvePromise([]);
        return;
      }

      if (stderr.trim() && code !== 0) {
        // ESLint may write warnings to stderr even on success, only log if non-zero
        log('error', `eslint-fast stderr (exit ${code}): ${stderr.slice(0, 300)}`);
      }

      let results;
      try {
        results = JSON.parse(stdout);
      } catch {
        log('error', `eslint-fast: stdout not JSON for ${absPath}`);
        resolvePromise([]);
        return;
      }

      if (!Array.isArray(results) || results.length === 0) {
        resolvePromise([]);
        return;
      }

      const findings = [];
      const repoRel = relative(REPO_ROOT, absPath).split(sep).join('/');

      for (const fileResult of results) {
        if (!fileResult.messages) continue;
        for (const m of fileResult.messages) {
          if (
            m.ruleId === 'eslint' &&
            m.message === 'File ignored because no matching configuration was supplied.'
          ) {
            continue;
          }
          const sev = eslintSeverityToSeverity(m.severity);
          const line = m.line !== undefined && m.line > 0 ? m.line : undefined;
          const column = m.column !== undefined && m.column > 0 ? m.column : undefined;

          const fingerprint = crypto
            .createHash('sha1')
            .update(`${repoRel}:${line ?? 0}:${m.ruleId || 'unknown'}:${m.message}`)
            .digest('hex')
            .slice(0, 16);

          const finding = {
            file: repoRel,
            line,
            column,
            category: 'lint',
            severity: sev,
            engine: 'eslint',
            rule: m.ruleId || 'unknown',
            message: m.message,
            fingerprint,
          };

          try {
            assertFinding(finding);
            findings.push(finding);
          } catch {
            // Skip invalid finding
          }
        }
      }

      log('eslint-fast', `${repoRel} → ${findings.length} findings (${durationMs}ms)`);
      resolvePromise(findings);
    });

    child.on('error', (e) => {
      log('error', `eslint-fast spawn error for ${absPath}: ${e.message}`);
      resolvePromise([]);
    });
  });
}

// ---------------------------------------------------------------------------
// Fast lane handler
// ---------------------------------------------------------------------------

/**
 * Process a file change in the fast lane (scoped ESLint).
 * @param {string} absPath
 */
export function handleFastLane(absPath) {
  // Get extension to verify it's a fast-lane eligible file
  const ext = absPath.includes('.') ? '.' + absPath.split('.').pop().toLowerCase() : '';

  if (!FAST_LANE_EXTENSIONS.has(ext)) return;

  // Verify the file still exists before spawning ESLint. MacOS fs.watch
  // may deliver rename events out of order, and the file might have
  // already been removed by the time the debounce fires.
  if (!existsSync(absPath)) return;

  const repoRel = relative(REPO_ROOT, absPath).split(sep).join('/');

  runScopedEslint(absPath)
    .then((findings) => {
      patchAggregate(repoRel, findings);

      // Write the sidecar directly from the scoped results so we are
      // not gated on the aggregate being in a consistent state (it may
      // not exist yet, or may have been pruned by a concurrent unlink
      // of a sibling path).
      const scPath = sidecarPathFor(repoRel);

      if (findings.length > 0) {
        const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
        const catSet = new Set();
        for (const f of findings) {
          sevCounts[f.severity]++;
          catSet.add(f.category);
        }
        const sc = {
          schema: 'kloel.findings.v1',
          file: repoRel,
          generatedAt: new Date().toISOString(),
          count: findings.length,
          dominantSeverity: dominantSeverity(findings),
          severityCounts: sevCounts,
          categories: Array.from(catSet).sort(),
          findings: findings.map((f) => ({
            line: f.line,
            column: f.column,
            category: f.category,
            severity: f.severity,
            engine: f.engine,
            rule: f.rule,
            message: f.message,
            fingerprint: f.fingerprint,
          })),
        };
        writeAtomic(scPath, JSON.stringify(sc, null, 2));
      } else {
        // No ESLint findings — remove via emitSingleSidecar which
        // only removes if no other engines have findings for this file.
        emitSingleSidecar(repoRel);
      }
    })
    .catch((e) => {
      log('error', `fast lane handler error for ${repoRel}: ${e.message}`);
    });
}
