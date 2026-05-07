#!/usr/bin/env node
/**
 * Aggregate Findings — runs every engine wrapper under scripts/findings-engines/,
 * merges their EngineReport outputs, groups findings by file, and writes
 * FINDINGS_AGGREGATE.json (gitignored) to the repo root.
 *
 * Per-file aggregation includes:
 *   - All findings (lossless)
 *   - dominantSeverity (max across findings) — drives the file's "color" tag
 *   - categories (union of categories present)
 *   - severityCounts ({ critical, high, medium, low })
 *
 * NOT constitution-locked.
 *
 * Usage:
 *   node scripts/ops/aggregate-findings.mjs          # run all engines, write aggregate
 *   node scripts/ops/aggregate-findings.mjs --dry    # don't write file, print summary
 *   node scripts/ops/aggregate-findings.mjs --only=tsc,eslint   # subset
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEngineReport, SEVERITY_WEIGHT } from '../findings-engines/_schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENGINES_DIR = resolve(REPO_ROOT, 'scripts', 'findings-engines');
const AGGREGATE_PATH = resolve(REPO_ROOT, 'FINDINGS_AGGREGATE.json');
const ENGINE_TIMEOUT_MS = 10 * 60 * 1000;
const ENGINE_BUFFER = 256 * 1024 * 1024;

function parseArgs() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  let only = null;
  for (const a of args) {
    if (a.startsWith('--only=')) only = a.slice('--only='.length).split(',').filter(Boolean);
  }
  return { dry, only };
}

function discoverEngines() {
  const entries = readdirSync(ENGINES_DIR);
  const engines = [];
  for (const name of entries) {
    if (name.startsWith('_')) continue;
    if (!name.endsWith('.mjs')) continue;
    engines.push({ id: name.replace(/\.mjs$/, ''), file: join(ENGINES_DIR, name) });
  }
  return engines.sort((a, b) => a.id.localeCompare(b.id));
}

function runEngine(engine) {
  const start = Date.now();
  const proc = spawnSync('node', [engine.file], {
    cwd: REPO_ROOT,
    timeout: ENGINE_TIMEOUT_MS,
    maxBuffer: ENGINE_BUFFER,
    encoding: 'utf8',
    env: { ...process.env },
  });
  const durationMs = Date.now() - start;
  if (proc.error) {
    return {
      ok: false,
      report: {
        engine: engine.id,
        version: 'unknown',
        ranAt: new Date().toISOString(),
        durationMs,
        status: 'error',
        error: `spawn: ${proc.error.message}`,
        findings: [],
      },
      stderr: String(proc.stderr || ''),
    };
  }
  if (proc.status !== 0) {
    return {
      ok: false,
      report: {
        engine: engine.id,
        version: 'unknown',
        ranAt: new Date().toISOString(),
        durationMs,
        status: 'error',
        error: `exit ${proc.status}; stderr: ${String(proc.stderr || '').slice(0, 2000)}`,
        findings: [],
      },
      stderr: String(proc.stderr || ''),
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(proc.stdout);
  } catch (e) {
    return {
      ok: false,
      report: {
        engine: engine.id,
        version: 'unknown',
        ranAt: new Date().toISOString(),
        durationMs,
        status: 'error',
        error: `stdout not JSON: ${e.message}; head=${proc.stdout.slice(0, 400)}`,
        findings: [],
      },
      stderr: String(proc.stderr || ''),
    };
  }
  try {
    assertEngineReport(parsed);
  } catch (e) {
    return {
      ok: false,
      report: {
        engine: engine.id,
        version: parsed?.version ?? 'unknown',
        ranAt: new Date().toISOString(),
        durationMs,
        status: 'error',
        error: `schema invalid: ${e.message}`,
        findings: [],
      },
      stderr: String(proc.stderr || ''),
    };
  }
  return { ok: true, report: parsed, stderr: String(proc.stderr || '') };
}

function dominantSeverity(findings) {
  let max = null;
  let maxW = -1;
  for (const f of findings) {
    const w = SEVERITY_WEIGHT[f.severity] ?? 0;
    if (w > maxW) {
      maxW = w;
      max = f.severity;
    }
  }
  return max;
}

function aggregate(reports) {
  /** @type {Map<string, any>} */
  const byFile = new Map();
  let total = 0;
  const enginesIndex = {};
  for (const { report } of reports) {
    enginesIndex[report.engine] = {
      version: report.version,
      ranAt: report.ranAt,
      durationMs: report.durationMs,
      status: report.status,
      ...(report.error ? { error: report.error } : {}),
      findingsCount: report.findings.length,
    };
    for (const f of report.findings) {
      total++;
      if (!byFile.has(f.file)) {
        byFile.set(f.file, {
          file: f.file,
          findings: [],
          severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
          categories: new Set(),
        });
      }
      const e = byFile.get(f.file);
      e.findings.push(f);
      e.severityCounts[f.severity]++;
      e.categories.add(f.category);
    }
  }
  const files = Array.from(byFile.values())
    .map((e) => ({
      file: e.file,
      count: e.findings.length,
      dominantSeverity: dominantSeverity(e.findings),
      severityCounts: e.severityCounts,
      categories: Array.from(e.categories).sort(),
      findings: e.findings,
    }))
    .sort((a, b) => {
      const sa = SEVERITY_WEIGHT[a.dominantSeverity] ?? 0;
      const sb = SEVERITY_WEIGHT[b.dominantSeverity] ?? 0;
      if (sa !== sb) return sb - sa;
      if (a.count !== b.count) return b.count - a.count;
      return a.file.localeCompare(b.file);
    });
  return {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    engines: enginesIndex,
    totals: {
      findings: total,
      filesWithFindings: files.length,
      bySeverity: files.reduce(
        (acc, f) => {
          for (const sev of ['critical', 'high', 'medium', 'low']) {
            acc[sev] += f.severityCounts[sev];
          }
          return acc;
        },
        { critical: 0, high: 0, medium: 0, low: 0 },
      ),
    },
    files,
  };
}

function main() {
  const { dry, only } = parseArgs();
  let engines = discoverEngines();
  if (only) {
    engines = engines.filter((e) => only.includes(e.id));
    if (engines.length === 0) {
      console.error(
        `aggregate: --only matched 0 engines (available: ${discoverEngines()
          .map((e) => e.id)
          .join(', ')})`,
      );
      process.exit(2);
    }
  }
  if (engines.length === 0) {
    console.error('aggregate: no engines found in', ENGINES_DIR);
    process.exit(2);
  }

  process.stderr.write(
    `aggregate: running ${engines.length} engine(s): ${engines.map((e) => e.id).join(', ')}\n`,
  );

  const reports = [];
  for (const e of engines) {
    process.stderr.write(`  ▸ ${e.id}... `);
    const r = runEngine(e);
    process.stderr.write(
      `${r.report.status} (${r.report.findings.length} findings, ${r.report.durationMs}ms)\n`,
    );
    if (r.stderr.trim()) {
      // surface engine stderr only in verbose mode (CI-friendly: keep aggregate stderr terse)
      // Truncated peek for diagnostic when status != ok
      if (r.report.status !== 'ok') {
        process.stderr.write(`    [stderr peek] ${r.stderr.slice(0, 300).replace(/\n/g, ' ')}\n`);
      }
    }
    reports.push(r);
  }

  const agg = aggregate(reports);

  if (dry) {
    console.log(
      JSON.stringify(
        {
          summary: {
            engines: Object.keys(agg.engines),
            totals: agg.totals,
            topFiles: agg.files
              .slice(0, 10)
              .map((f) => ({ file: f.file, count: f.count, dominantSeverity: f.dominantSeverity })),
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  writeFileSync(AGGREGATE_PATH, JSON.stringify(agg, null, 2));
  process.stderr.write(`aggregate: wrote ${AGGREGATE_PATH}\n`);
  process.stderr.write(`  totals: ${JSON.stringify(agg.totals)}\n`);
  process.stderr.write(`  files affected: ${agg.files.length}\n`);
  process.stdout.write(
    JSON.stringify({
      ok: true,
      path: AGGREGATE_PATH,
      totals: agg.totals,
      files: agg.files.length,
    }) + '\n',
  );
}

main();
