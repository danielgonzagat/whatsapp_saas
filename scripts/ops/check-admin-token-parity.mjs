#!/usr/bin/env node
/**
 * check-admin-token-parity.mjs
 *
 * Enforces byte-for-byte identity between the design-token file in
 * `frontend/src/lib/design-tokens.ts` (canonical source for app.kloel.com)
 * and the copy in `frontend-admin/src/lib/design-tokens.ts` (used by
 * adm.kloel.com).
 *
 * Rationale: adm.kloel.com ships as a standalone Next.js app that must
 * be visually indistinguishable from the main product. We deliberately
 * copy the design tokens instead of importing across apps (which causes
 * import-resolution hell with the inner `@/lib/*` aliases). The cost of
 * that copy is this guard: the two files must never diverge until a
 * future sub-project extracts them into `packages/ui`.
 *
 * Exit codes:
 *   0 - files match (or both absent, which is a separate problem but not
 *       ours to catch here)
 *   1 - files diverge
 *
 * Runs in pre-push and CI via package.json scripts.
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const canonical = resolve(repoRoot, 'frontend/src/lib/design-tokens.ts');
const admin = resolve(repoRoot, 'frontend-admin/src/lib/design-tokens.ts');

function readOrNull(path) {
  try {
    statSync(path);
    return readFileSync(path);
  } catch {
    return null;
  }
}

const canonicalBuf = readOrNull(canonical);
const adminBuf = readOrNull(admin);

if (!canonicalBuf) {
  console.error(`[admin-token-parity] missing canonical file: ${canonical}`);
  process.exit(1);
}
if (!adminBuf) {
  // Admin app not scaffolded yet — skip silently so this guard can land
  // before frontend-admin exists in older branches.
  console.log(`[admin-token-parity] frontend-admin/src/lib/design-tokens.ts absent — skipped`);
  process.exit(0);
}

if (canonicalBuf.equals(adminBuf)) {
  console.log('[admin-token-parity] design-tokens identical — OK');
  process.exit(0);
}

console.error('[admin-token-parity] FAIL: design-tokens.ts divergiram');
console.error(`  canonical: ${canonical}`);
console.error(`  admin:     ${admin}`);
console.error(
  'Rode: `cp frontend/src/lib/design-tokens.ts frontend-admin/src/lib/design-tokens.ts`',
);
console.error('ou atualize o canônico e repita. Os dois arquivos devem ser idênticos.');
process.exit(1);
