#!/usr/bin/env node
/**
 * check-redis-resolver-sync.mjs
 *
 * Enforces invariant "single Redis URL resolver" introduced in PR P2-3.
 *
 * The canonical resolveRedisUrl exists in two places and they MUST be
 * byte-for-byte identical:
 *
 *   backend/src/common/redis/resolve-redis-url.ts
 *   worker/resolve-redis-url.ts
 *
 * Why two copies instead of an import? The worker is a sibling
 * package with its own node_modules and no shared workspace package,
 * so it cannot import from the backend at runtime. Duplicating the
 * file and enforcing identity in CI is simpler than introducing a
 * third package.
 *
 * To regenerate the worker copy after a backend change:
 *
 *   cp backend/src/common/redis/resolve-redis-url.ts \
 *      worker/resolve-redis-url.ts
 *
 * Both files together replace the four divergent copies of the
 * resolver that existed before P2-3 (backend bootstrap, backend util,
 * worker bootstrap, worker resolve-redis.ts).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const BACKEND = path.join(repoRoot, 'backend', 'src', 'common', 'redis', 'resolve-redis-url.ts');
const WORKER = path.join(repoRoot, 'worker', 'resolve-redis-url.ts');

function fail(msg) {
  console.error(`[check-redis-resolver-sync] ${msg}`);
  process.exit(1);
}

if (!existsSync(BACKEND)) fail(`Backend resolver missing: ${BACKEND}`);
if (!existsSync(WORKER)) fail(`Worker resolver missing: ${WORKER}`);

const backendContent = readFileSync(BACKEND, 'utf8');
const workerContent = readFileSync(WORKER, 'utf8');

if (backendContent !== workerContent) {
  console.error('[check-redis-resolver-sync] Resolvers have drifted.');
  console.error(`  backend: ${BACKEND}`);
  console.error(`  worker:  ${WORKER}`);
  console.error('');
  console.error('To re-sync (treats backend as source of truth):');
  console.error(`  cp ${path.relative(repoRoot, BACKEND)} \\`);
  console.error(`     ${path.relative(repoRoot, WORKER)}`);
  process.exit(1);
}

console.log('[check-redis-resolver-sync] OK — backend and worker resolvers are identical.');
process.exit(0);
