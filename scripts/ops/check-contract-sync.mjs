#!/usr/bin/env node
/**
 * check-contract-sync.mjs
 *
 * Enforces mirrored contract files that must remain byte-for-byte
 * identical across codebases.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const CONTRACT_PAIRS = [
  {
    label: 'frontend ↔ backend API schemas',
    source: path.join(repoRoot, 'backend', 'src', 'contracts', 'schemas.ts'),
    mirror: path.join(repoRoot, 'frontend', 'src', '__tests__', 'contracts', 'schemas.ts'),
  },
  {
    label: 'backend ↔ worker autopilot queue contract',
    source: path.join(repoRoot, 'backend', 'src', 'contracts', 'autopilot-jobs.ts'),
    mirror: path.join(repoRoot, 'worker', 'contracts', 'autopilot-jobs.ts'),
  },
];

function fail(msg) {
  console.error(`[check-contract-sync] ${msg}`);
  process.exit(1);
}

for (const pair of CONTRACT_PAIRS) {
  if (!existsSync(pair.source)) {
    fail(`Contract source missing (${pair.label}): ${pair.source}`);
  }
  if (!existsSync(pair.mirror)) {
    fail(`Contract mirror missing (${pair.label}): ${pair.mirror}`);
  }

  const sourceContent = readFileSync(pair.source, 'utf8');
  const mirrorContent = readFileSync(pair.mirror, 'utf8');

  if (sourceContent !== mirrorContent) {
    console.error(`[check-contract-sync] Contract drift detected for ${pair.label}.`);
    console.error(`  source: ${pair.source}`);
    console.error(`  mirror: ${pair.mirror}`);
    console.error('');
    console.error('To re-sync (treats source as authoritative):');
    console.error(`  cp ${path.relative(repoRoot, pair.source)} \\`);
    console.error(`     ${path.relative(repoRoot, pair.mirror)}`);
    process.exit(1);
  }
}

console.log('[check-contract-sync] OK — all mirrored contracts are identical.');
process.exit(0);
