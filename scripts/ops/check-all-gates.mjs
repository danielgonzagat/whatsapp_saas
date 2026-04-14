#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { repoRoot } from './lib/scan-utils.mjs';

const steps = [
  { label: 'governance-boundary', command: 'node scripts/ops/check-governance-boundary.mjs' },
  { label: 'visual-contract', command: 'node scripts/ops/check-visual-contract.mjs' },
  { label: 'test-integrity', command: 'node scripts/ops/check-test-integrity.mjs' },
  { label: 'unsafe-casts', command: 'node scripts/ops/check-unsafe-casts.mjs' },
  { label: 'unsafe-queries', command: 'node scripts/ops/check-unsafe-queries.mjs' },
  { label: 'security', command: 'node scripts/ops/check-security.mjs' },
  { label: 'architecture', command: 'node scripts/ops/check-architecture.mjs' },
  { label: 'layer-boundaries', command: 'node scripts/ops/check-layer-boundaries.mjs' },
  { label: 'model-strings', command: 'node scripts/ops/check-model-strings.mjs' },
  { label: 'code-quality', command: 'node scripts/ops/check-code-quality.mjs' },
  { label: 'data-integrity', command: 'node scripts/ops/check-data-integrity.mjs' },
  { label: 'ratchet', command: 'npm run ratchet:check' },
  { label: 'lint', command: 'npm run lint && npm --prefix worker run lint:check' },
  { label: 'frontend-typecheck', command: 'npm run frontend:typecheck' },
  { label: 'backend-typecheck', command: 'npm run backend:typecheck' },
  { label: 'worker-typecheck', command: 'npm run worker:typecheck' },
  { label: 'frontend-test', command: 'npm --prefix frontend test' },
  { label: 'backend-test', command: 'npm --prefix backend run test -- --runInBand' },
  { label: 'worker-test', command: 'npm --prefix worker test' },
];

const results = [];
let failed = false;

for (const step of steps) {
  if (failed) {
    results.push({ label: step.label, status: 'skipped' });
    continue;
  }

  console.log(`\n[check-all] ${step.label}`);
  const result = spawnSync(step.command, {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.status === 0) {
    results.push({ label: step.label, status: 'passed' });
    console.log(`✅ ${step.label}`);
    continue;
  }

  failed = true;
  results.push({ label: step.label, status: 'failed' });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  console.error(`❌ ${step.label}`);
}

console.log('\n[check-all] Resumo');
for (const result of results) {
  const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭';
  console.log(`${icon} ${result.label}`);
}

process.exit(failed ? 1 : 0);
