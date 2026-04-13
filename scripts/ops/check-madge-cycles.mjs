#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const madgeBin = path.join(repoRoot, 'node_modules', '.bin', 'madge');
const EXCLUDE_RE =
  '(\\.spec\\.ts$|\\.test\\.(ts|tsx)$|(^|/)test/|(^|/)__tests__/|(^|/)dist/|(^|/)node_modules/)';

const TARGETS = [
  {
    workspace: 'backend',
    source: 'backend/src',
    tsConfig: 'backend/tsconfig.json',
  },
  {
    workspace: 'frontend',
    source: 'frontend/src',
    tsConfig: 'frontend/tsconfig.json',
  },
  {
    workspace: 'worker',
    source: 'worker',
    tsConfig: 'worker/tsconfig.json',
  },
];

function parseArgs(argv) {
  return {
    strict: argv.includes('--strict'),
  };
}

function runMadge(target) {
  const result = spawnSync(
    madgeBin,
    [
      '--circular',
      '--json',
      '--extensions',
      'ts,tsx',
      '--exclude',
      EXCLUDE_RE,
      '--ts-config',
      target.tsConfig,
      target.source,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (!result.stdout) {
    throw new Error(result.stderr || `madge failed for workspace ${target.workspace}`);
  }

  const parsed = JSON.parse(result.stdout);
  const cycles = Array.isArray(parsed) ? parsed : [];
  return {
    workspace: target.workspace,
    cycles,
  };
}

export function collectMadgeCycles() {
  const results = TARGETS.map(runMadge);
  return {
    totalCycles: results.reduce((sum, result) => sum + result.cycles.length, 0),
    results,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = collectMadgeCycles();
  console.log(JSON.stringify(result, null, 2));

  if (options.strict && result.totalCycles > 0) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`[madge-cycles] ${(error && error.message) || String(error)}`);
    process.exit(1);
  }
}
