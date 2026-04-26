#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..');

/**
 * Resolve `relativeSegments` against `rootDir` and assert the result still
 * lives inside it. Throws on traversal attempts. Used to build the
 * ts-node candidate list so each candidate is provably bounded before
 * fs.existsSync looks at it.
 */
function safeRepoBin(...relativeSegments) {
  const resolved = path.resolve(rootDir, ...relativeSegments);
  const boundary = rootDir + path.sep;
  if (resolved !== rootDir && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside repo root`);
  }
  return resolved;
}

const tsNodeCandidates = [
  safeRepoBin('node_modules', '.bin', 'ts-node'),
  safeRepoBin('backend', 'node_modules', '.bin', 'ts-node'),
  safeRepoBin('worker', 'node_modules', '.bin', 'ts-node'),
  safeRepoBin('e2e', 'node_modules', '.bin', 'ts-node'),
];

const tsNodeBin = tsNodeCandidates.find((candidate) => fs.existsSync(candidate));

if (!tsNodeBin) {
  console.error(
    'PULSE runner could not find ts-node in the root, backend, worker, or e2e workspaces.',
  );
  process.exit(1);
}

const args = [
  '--project',
  path.join(rootDir, 'scripts', 'pulse', 'tsconfig.json'),
  path.join(rootDir, 'scripts', 'pulse', 'index.ts'),
  ...process.argv.slice(2),
];

const result = spawnSync(tsNodeBin, args, {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`PULSE runner failed: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
