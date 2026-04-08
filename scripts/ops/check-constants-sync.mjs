#!/usr/bin/env node
/**
 * check-constants-sync.mjs
 *
 * Enforces invariant: shared constant files (sales templates,
 * keyword lists, etc.) must be byte-for-byte identical between the
 * backend and the worker. The two packages have separate node_modules
 * trees and cannot import each other at runtime, so the only way to
 * keep their canonical data in sync is to duplicate it and have CI
 * fail when the copies drift.
 *
 * Currently enforced pairs:
 *   backend/src/common/sales-templates.ts
 *   worker/constants/sales-templates.ts
 *
 * To re-sync after a backend change:
 *   cp backend/src/common/sales-templates.ts \
 *      worker/constants/sales-templates.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const PAIRS = [
  {
    backend: 'backend/src/common/sales-templates.ts',
    worker: 'worker/constants/sales-templates.ts',
    name: 'sales-templates',
  },
];

let hasError = false;

for (const pair of PAIRS) {
  const backendPath = path.join(repoRoot, pair.backend);
  const workerPath = path.join(repoRoot, pair.worker);

  if (!existsSync(backendPath)) {
    console.error(`[check-constants-sync] Missing: ${pair.backend}`);
    hasError = true;
    continue;
  }
  if (!existsSync(workerPath)) {
    console.error(`[check-constants-sync] Missing: ${pair.worker}`);
    hasError = true;
    continue;
  }

  const backendContent = readFileSync(backendPath, 'utf8');
  const workerContent = readFileSync(workerPath, 'utf8');

  if (backendContent !== workerContent) {
    console.error(`[check-constants-sync] ${pair.name} has drifted.`);
    console.error(`  backend: ${pair.backend}`);
    console.error(`  worker:  ${pair.worker}`);
    console.error('');
    console.error('To re-sync (treats backend as source of truth):');
    console.error(`  cp ${pair.backend} \\`);
    console.error(`     ${pair.worker}`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}

console.log('[check-constants-sync] OK — all shared constants are identical.');
process.exit(0);
