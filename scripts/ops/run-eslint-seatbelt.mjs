#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const targets = [
  {
    label: 'backend',
    cwd: path.join(repoRoot, 'backend'),
    bin: path.join(repoRoot, 'backend', 'node_modules', '.bin', 'eslint'),
    args: ['{src,apps,libs,test}/**/*.ts'],
  },
  {
    label: 'frontend',
    cwd: path.join(repoRoot, 'frontend'),
    bin: path.join(repoRoot, 'frontend', 'node_modules', '.bin', 'eslint'),
    args: [
      '.',
      '--ignore-pattern',
      'coverage/**',
      '--ignore-pattern',
      '.next/**',
      '--ignore-pattern',
      'dist/**',
    ],
  },
  {
    label: 'worker',
    cwd: path.join(repoRoot, 'worker'),
    bin: path.join(repoRoot, 'worker', 'node_modules', '.bin', 'eslint'),
    args: ['.', '--ignore-pattern', 'coverage/**', '--ignore-pattern', 'dist/**'],
  },
];

function parseArgs(argv) {
  return {
    bootstrap: argv.includes('--bootstrap'),
    frozen: argv.includes('--frozen'),
    update: argv.includes('--update'),
    force: argv.includes('--force'),
  };
}

function runTarget(target, env) {
  const result = spawnSync(target.bin, target.args, {
    cwd: target.cwd,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `eslint-seatbelt failed for ${target.label} with exit code ${result.status ?? 1}.`,
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = { ...process.env };

  if (!options.bootstrap && !options.frozen && !options.update) {
    throw new Error(
      'Explicit mode required. Use --frozen for CI checks, --update for baseline refreshes, or --bootstrap for first-time setup.',
    );
  }

  if (options.bootstrap) {
    if (!options.force && env.SEATBELT_BOOTSTRAP_FORCE !== '1') {
      throw new Error(
        'Refusing to reset the ESLint seatbelt baseline without explicit confirmation. ' +
          'Re-run with --force or SEATBELT_BOOTSTRAP_FORCE=1.',
      );
    }
    env.SEATBELT_INCREASE = 'ALL';
  }

  if (options.update) {
    if (!options.force && env.SEATBELT_UPDATE_FORCE !== '1') {
      throw new Error(
        'Refusing to refresh the ESLint seatbelt baseline without explicit confirmation. ' +
          'Re-run with --force or SEATBELT_UPDATE_FORCE=1.',
      );
    }
  }

  if (options.frozen) {
    env.SEATBELT_FROZEN = '1';
  }

  for (const target of targets) {
    runTarget(target, env);
  }
}

try {
  main();
} catch (error) {
  console.error(`[seatbelt] ${(error && error.message) || String(error)}`);
  process.exit(1);
}
