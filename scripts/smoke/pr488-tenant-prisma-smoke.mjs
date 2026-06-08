#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(label, args) {
  process.stdout.write(`[pr488-tenant-prisma-smoke] ${label}\n`);
  execFileSync('node', args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

run('prisma schema single source', ['scripts/ops/check-prisma-schema-single-source.mjs']);
run('tenant isolation static scan', ['scripts/ops/check-tenant-filter.mjs', '--summary']);

process.stdout.write('[pr488-tenant-prisma-smoke] OK\n');
