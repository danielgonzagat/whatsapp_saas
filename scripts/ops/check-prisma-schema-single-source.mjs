#!/usr/bin/env node
/**
 * check-prisma-schema-single-source.mjs
 *
 * Enforces invariant "single Prisma schema" introduced in PR P2-1.
 *
 * The Big Tech hardening plan declares the backend's Prisma schema
 * (backend/prisma/schema.prisma) as the only authoritative copy.
 * The worker accesses the same schema via a symlink at
 * worker/prisma/schema.prisma → ../../backend/prisma/schema.prisma.
 *
 * This script verifies:
 *
 *   1. backend/prisma/schema.prisma exists and is a real file.
 *   2. worker/prisma/schema.prisma exists and IS a symlink.
 *   3. The symlink resolves to the backend schema.
 *
 * If any of these checks fails the script exits non-zero so CI blocks
 * the merge. The historic failure mode this prevents:
 *
 *   - Someone copies the schema (instead of symlinking) and the two
 *     copies drift over time, producing the 225-line, 11-model gap
 *     audited in 2026-04-08.
 *
 *   - Someone deletes the symlink "to clean up" and the worker tries
 *     to generate a Prisma client from a missing schema.
 */

import { existsSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
      `Expected a symlink pointing to ../../backend/prisma/schema.prisma. Recreate it with:\n` +
      `  cd worker/prisma && ln -s ../../backend/prisma/schema.prisma schema.prisma`,
  );
}

const workerStat = lstatSync(WORKER_SCHEMA);
if (!workerStat.isSymbolicLink()) {
  fail(
    `Worker schema must be a SYMLINK to the backend schema, but it is a regular file.\n` +
      `Run:\n` +
      `  rm worker/prisma/schema.prisma\n` +
      `  cd worker/prisma && ln -s ../../backend/prisma/schema.prisma schema.prisma`,
  );
}

const linkTarget = readlinkSync(WORKER_SCHEMA);
const resolvedTarget = realpathSync(WORKER_SCHEMA);
if (resolvedTarget !== realpathSync(BACKEND_SCHEMA)) {
  fail(
    `Worker schema symlink does not resolve to the backend schema.\n` +
      `  link target: ${linkTarget}\n` +
      `  resolved:    ${resolvedTarget}\n` +
      `  expected:    ${BACKEND_SCHEMA}`,
  );
}

console.log('[check-prisma-schema-single-source] OK — worker schema symlinks to backend schema.');
process.exit(0);
