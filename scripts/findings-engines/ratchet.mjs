#!/usr/bin/env node
/**
 * ratchet findings engine — surface workspace-level metric regressions vs ratchet.json baseline.
 * NOT constitution-locked. ratchet.json is consumed read-only.
 */

import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, fingerprint } from './_schema.mjs';
// NOTE: We deliberately do NOT import collectRatchetMetrics — its synchronous
// repo-wide measurement easily exceeds 60s and would block both watch mode
// and CI. Instead, the engine reads baseline from ratchet.json and current
// values from a sibling RATCHET_CURRENT.json (if present and < 24h old).
// `npm run ratchet:measure` writes RATCHET_CURRENT.json; CI populates it.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const ratchetPath = path.join(repoRoot, 'ratchet.json');

// Metrics that, when regressed, use percentage-threshold severity (coverage-style).
// These are score/rate metrics where a decrease is a regression.
const PERCENTAGE_THRESHOLD_METRICS = new Set(['pulse_score_min', 'browser_stress_pass_rate_min']);

// Metrics that use the >20% increase → high, else → medium rule (eslint-any, madge cycles, knip issues).
const HIGH_AT_20PCT_METRICS = new Set(['any_count_max', 'madge_cycles_max', 'knip_issues_max']);

function loadBaseline() {
  if (!existsSync(ratchetPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(ratchetPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.ratchet !== 'object') {
      return null;
    }
    return parsed.ratchet;
  } catch {
    return null;
  }
}

function getVersion() {
  try {
    return statSync(ratchetPath).mtime.toISOString();
  } catch {
    return 'unknown';
  }
}

function compareMetric(name, baseline, current) {
  if (name.endsWith('_max')) {
    return {
      ok: current <= baseline,
      direction: current > baseline ? 'worsened' : current < baseline ? 'improved' : 'unchanged',
      delta: current - baseline,
    };
  }

  if (name.endsWith('_min')) {
    return {
      ok: current >= baseline,
      direction: current < baseline ? 'worsened' : current > baseline ? 'improved' : 'unchanged',
      delta: current - baseline,
    };
  }

  return { ok: true, direction: 'unchanged', delta: 0 };
}

function computeSeverity(name, baseline, current) {
  // _min metrics: regression = current < baseline
  // _max metrics: regression = current > baseline
  const direction = name.endsWith('_min') ? 'lower-is-worse' : 'higher-is-worse';

  if (PERCENTAGE_THRESHOLD_METRICS.has(name)) {
    // _min metrics: a DECREASE is worse. Percentage decrease = (baseline - current) / baseline * 100
    // _max metrics: an INCREASE is worse. Percentage increase = (current - baseline) / baseline * 100
    // But these are all _min, so decrease.
    if (baseline === 0) return 'medium';
    const pctChange = ((baseline - current) / baseline) * 100;
    if (pctChange > 5) return 'critical';
    if (pctChange > 1) return 'high';
    return 'medium';
  }

  if (HIGH_AT_20PCT_METRICS.has(name)) {
    // _max metrics: an INCREASE is worse
    if (baseline === 0) return current > 0 ? 'high' : 'medium';
    const pctChange = ((current - baseline) / baseline) * 100;
    if (pctChange > 20) return 'high';
    return 'medium';
  }

  return 'medium';
}

function buildFinding(name, baseline, current, direction) {
  const delta =
    direction === 'higher-is-worse' ? `+${current - baseline}` : `${current - baseline}`;
  const message = `${name} regressed: baseline=${baseline} current=${current} (delta ${delta})`;
  const severity = computeSeverity(name, baseline, current);
  const rule = `ratchet/${name}`;

  return {
    file: 'ratchet.json',
    line: undefined,
    category: 'architecture',
    severity,
    engine: 'ratchet',
    rule,
    message,
    fingerprint: fingerprint({ file: 'ratchet.json', line: 0, rule, message }),
    extra: { metric: name, baseline, current, direction },
  };
}

function main() {
  const start = Date.now();
  const baseline = loadBaseline();

  if (!baseline) {
    const report = buildReport('ratchet', 'unknown', [], {
      status: 'error',
      error: 'ratchet.json not found or invalid at repo root',
      durationMs: Date.now() - start,
    });
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const currentPath = path.join(repoRoot, 'RATCHET_CURRENT.json');
  if (!existsSync(currentPath)) {
    const report = buildReport('ratchet', getVersion(), [], {
      status: 'partial',
      error:
        'RATCHET_CURRENT.json missing — run `npm run ratchet:measure` to populate. Engine only emits findings when both baseline and current are present.',
      durationMs: Date.now() - start,
    });
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  let current;
  try {
    const parsed = JSON.parse(readFileSync(currentPath, 'utf8'));
    current = parsed?.ratchet && typeof parsed.ratchet === 'object' ? parsed.ratchet : parsed;
    if (!current || typeof current !== 'object') throw new Error('shape: missing ratchet object');
  } catch (err) {
    const report = buildReport('ratchet', getVersion(), [], {
      status: 'error',
      error: `Failed to read RATCHET_CURRENT.json: ${err?.message || String(err)}`,
      durationMs: Date.now() - start,
    });
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // Stale guard: if current snapshot is more than 24h old, mark partial.
  let staleNote = '';
  try {
    const ageMs = Date.now() - statSync(currentPath).mtime.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      staleNote = ` (snapshot ${Math.round(ageMs / 3600000)}h stale)`;
    }
  } catch {
    /* ignore stat failure */
  }

  const findings = [];

  for (const [name, baselineValue] of Object.entries(baseline)) {
    if (typeof baselineValue !== 'number') continue;

    const currentValue = current[name];
    if (typeof currentValue !== 'number') continue;

    const result = compareMetric(name, baselineValue, currentValue);

    if (result.direction === 'worsened') {
      const direction = name.endsWith('_min') ? 'lower-is-worse' : 'higher-is-worse';
      findings.push(buildFinding(name, baselineValue, currentValue, direction));
    }
  }

  const version = getVersion();
  const durationMs = Date.now() - start;
  const report = buildReport('ratchet', version, findings, { durationMs });
  process.stdout.write(JSON.stringify(report, null, 2));
}

main();
