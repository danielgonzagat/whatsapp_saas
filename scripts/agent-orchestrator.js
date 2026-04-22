#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tsNodeCandidates = [
  path.join(rootDir, 'node_modules', '.bin', 'ts-node'),
  path.join(rootDir, 'backend', 'node_modules', '.bin', 'ts-node'),
  path.join(rootDir, 'worker', 'node_modules', '.bin', 'ts-node'),
  path.join(rootDir, 'e2e', 'node_modules', '.bin', 'ts-node'),
];

const tsNodeBin = tsNodeCandidates.find((candidate) => fs.existsSync(candidate));

if (!tsNodeBin) {
  console.error(
    'Agent orchestrator could not find ts-node in the root, backend, worker, or e2e workspaces.',
  );
  process.exit(1);
}

const args = [
  '--project',
  path.join(rootDir, 'scripts', 'pulse', 'tsconfig.json'),
  path.join(rootDir, 'scripts', 'agent-orchestrator.ts'),
  ...process.argv.slice(2),
];

const result = spawnSync(tsNodeBin, args, {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`Agent orchestrator failed: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
