#!/usr/bin/env node
/**
 * check-prisma-schema-single-source.mjs
 *
 * Enforces invariant "single Prisma schema" introduced in PR P2-1.
 *
 * The backend's Prisma schema (backend/prisma/schema.prisma) remains
 * authoritative. The worker must stay byte-for-byte aligned with it,
 * either via a symlink or via a materialized copy.
 *
 * The materialized-copy path exists because isolated worker deploys
 * (for example Railway builds rooted at worker/) do not preserve a
 * symlink that points outside the build context.
 *
 * This script verifies:
 *
 *   1. backend/prisma/schema.prisma exists and is a real file.
 *   2. worker/prisma/schema.prisma exists.
 *   3. It is either:
 *      - a symlink that resolves to the backend schema, or
 *      - a regular file with identical contents to the backend schema.
 *
 * If any of these checks fails the script exits non-zero so CI blocks
 * the merge. The historic failure mode this prevents:
 *
 *   - Someone changes the worker schema without keeping it aligned
 *     with the backend schema.
 *
 *   - A deploy rooted at worker/ ships a dangling symlink and the
 *     worker cannot run `prisma generate`.
 */

import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const BACKEND_SCHEMA = path.join(repoRoot, 'backend', 'prisma', 'schema.prisma');
const WORKER_SCHEMA = path.join(repoRoot, 'worker', 'prisma', 'schema.prisma');

function fail(msg) {
  console.error(`[check-prisma-schema-single-source] ${msg}`);
  process.exit(1);
}

if (!existsSync(BACKEND_SCHEMA)) {
  fail(`Backend schema missing: ${BACKEND_SCHEMA}`);
}
const backendStat = lstatSync(BACKEND_SCHEMA);
if (!backendStat.isFile() || backendStat.isSymbolicLink()) {
  fail(`Backend schema must be a real file (not a symlink): ${BACKEND_SCHEMA}`);
}

if (!existsSync(WORKER_SCHEMA)) {
  fail(
    `Worker schema missing: ${WORKER_SCHEMA}\n` +
      `Expected either:\n` +
      `  1. a symlink to ../../backend/prisma/schema.prisma, or\n` +
      `  2. a file copied from backend/prisma/schema.prisma`,
  );
}

const workerStat = lstatSync(WORKER_SCHEMA);
const backendResolved = realpathSync(BACKEND_SCHEMA);

if (workerStat.isSymbolicLink()) {
  const linkTarget = readlinkSync(WORKER_SCHEMA);
  const resolvedTarget = realpathSync(WORKER_SCHEMA);
  if (resolvedTarget !== backendResolved) {
    fail(
      `Worker schema symlink does not resolve to the backend schema.\n` +
        `  link target: ${linkTarget}\n` +
        `  resolved:    ${resolvedTarget}\n` +
        `  expected:    ${BACKEND_SCHEMA}`,
    );
  }

  console.log('[check-prisma-schema-single-source] OK — worker schema symlinks to backend schema.');
  process.exit(0);
}

if (!workerStat.isFile()) {
  fail(`Worker schema must be a symlink or regular file: ${WORKER_SCHEMA}`);
}

const backendContents = readFileSync(BACKEND_SCHEMA, 'utf8');
const workerContents = readFileSync(WORKER_SCHEMA, 'utf8');
if (workerContents !== backendContents) {
  fail(
    `Worker schema is a regular file but is out of sync with the backend schema.\n` +
      `Refresh it with:\n` +
      `  cp backend/prisma/schema.prisma worker/prisma/schema.prisma`,
  );
}

console.log('[check-prisma-schema-single-source] OK — worker schema matches backend schema.');
process.exit(0);
