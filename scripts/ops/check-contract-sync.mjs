#!/usr/bin/env node
/**
 * check-contract-sync.mjs
 *
 * Enforces invariant "frontend freeze by contract": the API contract
 * schemas must exist in two locations and be byte-for-byte identical:
 *
 *   backend/src/contracts/schemas.ts                (PR P1-1)
 *   frontend/src/__tests__/contracts/schemas.ts     (PR P1-2)
 *
 * If either file is missing, or if they differ in any way (even
 * whitespace), this script exits non-zero and CI blocks the merge.
 *
 * To regenerate the frontend mirror after a backend schema change:
 *
 *   cp backend/src/contracts/schemas.ts \
 *      frontend/src/__tests__/contracts/schemas.ts
 *
 * Then update both spec files (backend api-contract.spec.ts and
 * frontend api-contract.spec.ts) to cover the new fields.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const BACKEND_SCHEMA = path.join(repoRoot, 'backend', 'src', 'contracts', 'schemas.ts');
const FRONTEND_SCHEMA = path.join(
  repoRoot,
  'frontend',
  'src',
  '__tests__',
  'contracts',
  'schemas.ts',
);

function fail(msg) {
  console.error(`[check-contract-sync] ${msg}`);
  process.exit(1);
}

if (!existsSync(BACKEND_SCHEMA)) {
  fail(`Backend schema missing: ${BACKEND_SCHEMA}`);
}
if (!existsSync(FRONTEND_SCHEMA)) {
  fail(`Frontend schema missing: ${FRONTEND_SCHEMA}`);
}

const backendContent = readFileSync(BACKEND_SCHEMA, 'utf8');
const frontendContent = readFileSync(FRONTEND_SCHEMA, 'utf8');

if (backendContent !== frontendContent) {
  console.error('[check-contract-sync] Schemas have drifted.');
  console.error(`  backend:  ${BACKEND_SCHEMA}`);
  console.error(`  frontend: ${FRONTEND_SCHEMA}`);
  console.error('');
  console.error('To re-sync (treats backend as source of truth):');
  console.error(`  cp ${path.relative(repoRoot, BACKEND_SCHEMA)} \\`);
  console.error(`     ${path.relative(repoRoot, FRONTEND_SCHEMA)}`);
  process.exit(1);
}

console.log('[check-contract-sync] OK — backend and frontend schemas are identical.');
process.exit(0);
