#!/usr/bin/env ts-node

import * as path from 'node:path';
import * as fs from 'node:fs';
import { collectRuntimeProbes, computeProbeSummary } from './executor';

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main(): void {
  const rootDir = process.env.PULSE_ROOT_DIR || process.cwd();
  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir);

  const probes = collectRuntimeProbes();
  const summary = computeProbeSummary(probes);

  const evidence = {
    executed: summary.executed > 0,
    executedChecks: probes.filter((p) => p.executed).map((p) => p.probeId),
    blockingFindingEvents: [] as string[],
    artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json'],
    summary: `Runtime evidence: ${summary.executed}/${summary.total} probes executed, ${summary.passed} passed, ${summary.failed} failed (${summary.coveragePercent}% coverage).`,
    probes,
    runtimeProbeSummary: summary,
  };

  const outPath = path.join(pulseDir, 'PULSE_RUNTIME_EVIDENCE.json');
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.error(`Runtime probes written to ${outPath}`);
  console.error(`Coverage: ${summary.coveragePercent}% (${summary.executed}/${summary.total} executed, ${summary.passed} passed)`);

  if (summary.coveragePercent === 0) {
    console.error('WARNING: 0% runtime evidence coverage. PULSE --deep requires a running backend.');
    process.exit(2);
  }

  if (summary.failed > 0) {
    console.error(`WARNING: ${summary.failed} probe(s) failed.`);
    process.exit(1);
  }
}

main();
