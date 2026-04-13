#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRatchetMetrics } from './collect-ratchet-metrics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const ratchetPath = path.join(repoRoot, 'ratchet.json');

function parseArgs(argv) {
  return {
    bootstrap: argv.includes('--bootstrap'),
    writeIfImproved: argv.includes('--write-if-improved'),
    refreshPulse: argv.includes('--refresh-pulse'),
  };
}

function loadRatchetFile() {
  if (!existsSync(ratchetPath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(ratchetPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.ratchet !== 'object') {
    throw new Error('ratchet.json must contain a top-level "ratchet" object.');
  }

  return parsed;
}

function writeRatchetFile(measurement, existing = null) {
  const next = {
    version: 1,
    updatedAt: measurement.generatedAt,
    source: measurement.source,
    mode: 'mechanical-ratchet',
    note: 'These numbers are the current floor/ceiling for measurable code quality. _max metrics must never go up. _min metrics must never go down.',
    ratchet: measurement.ratchet,
  };

  if (existing && existing.version) {
    next.version = existing.version;
  }

  writeFileSync(ratchetPath, JSON.stringify(next, null, 2) + '\n');
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

  throw new Error(`Unsupported metric suffix for ${name}. Expected _max or _min.`);
}

function formatSample(sample) {
  if (!sample) return '';
  if (sample.lines) return `${sample.file} (${sample.lines} lines)`;
  if (sample.line) return `${sample.file}:${sample.line} :: ${sample.content}`;
  return sample.file || JSON.stringify(sample);
}

function printFailures(failures, details) {
  console.error('[ratchet] Regressions detected:');
  for (const failure of failures) {
    console.error(
      `- ${failure.name} ${failure.direction}: baseline=${failure.baseline}, current=${failure.current}, delta=${failure.delta >= 0 ? `+${failure.delta}` : failure.delta}`,
    );
    const metricDetails = details[failure.name];
    const samples = metricDetails?.samples || [];
    for (const sample of samples.slice(0, 5)) {
      console.error(`  ${formatSample(sample)}`);
    }
  }
}

function printImprovements(improvements) {
  if (improvements.length === 0) return;
  console.log('[ratchet] Improvements detected:');
  for (const improvement of improvements) {
    console.log(`- ${improvement.name}: ${improvement.previous} -> ${improvement.current}`);
  }
}

function printNewMetrics(metricNames, measurement) {
  if (metricNames.length === 0) return;
  console.log('[ratchet] New metrics discovered:');
  for (const name of metricNames) {
    console.log(`- ${name}: ${measurement.ratchet[name]}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const measurement = collectRatchetMetrics({
    refreshPulse: options.refreshPulse,
  });
  const existing = loadRatchetFile();

  if (options.bootstrap || !existing) {
    writeRatchetFile(measurement, existing);
    console.log(`[ratchet] Baseline written to ${path.relative(repoRoot, ratchetPath)}.`);
    return;
  }

  const failures = [];
  const improvements = [];
  const baselineMetrics = existing.ratchet;
  const missingMetrics = Object.keys(measurement.ratchet).filter(
    (name) => !(name in baselineMetrics),
  );

  for (const [name, baselineRaw] of Object.entries(baselineMetrics)) {
    const currentRaw = measurement.ratchet[name];
    if (typeof baselineRaw !== 'number') {
      throw new Error(`ratchet.json metric ${name} must be numeric.`);
    }
    if (typeof currentRaw !== 'number') {
      throw new Error(`Current measurement did not produce metric ${name}.`);
    }

    const result = compareMetric(name, baselineRaw, currentRaw);
    if (!result.ok) {
      failures.push({
        name,
        baseline: baselineRaw,
        current: currentRaw,
        delta: result.delta,
        direction: result.direction,
      });
      continue;
    }

    if (result.direction === 'improved') {
      improvements.push({
        name,
        previous: baselineRaw,
        current: currentRaw,
      });
    }
  }

  if (failures.length > 0) {
    printFailures(failures, measurement.details);
    process.exit(1);
  }

  printImprovements(improvements);
  printNewMetrics(missingMetrics, measurement);

  if (options.writeIfImproved && (improvements.length > 0 || missingMetrics.length > 0)) {
    const nextMeasurement = {
      ...measurement,
      ratchet: { ...existing.ratchet, ...measurement.ratchet },
    };
    writeRatchetFile(nextMeasurement, existing);
    console.log(`[ratchet] Baseline tightened in ${path.relative(repoRoot, ratchetPath)}.`);
  } else {
    console.log('[ratchet] OK — no measured metric regressed.');
  }
}

try {
  main();
} catch (error) {
  console.error(`[ratchet] ${(error && error.message) || String(error)}`);
  process.exit(1);
}
