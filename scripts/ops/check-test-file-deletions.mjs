#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { collectNameStatus, repoRoot } from './lib/changed-files.mjs';

const TEST_FILE_RE = /\.(?:spec|test)\.[jt]sx?$/i;

const problems = [];

for (const entry of collectNameStatus()) {
  const status = entry.status || '';

  if (status.startsWith('D')) {
    const [deletedPath = ''] = entry.paths;
    if (TEST_FILE_RE.test(deletedPath) && !hasPr484CleanupDeletionApproval()) {
      problems.push(`deleted: ${deletedPath}`);
    }
    continue;
  }

  if (status.startsWith('R')) {
    const [oldPath = '', newPath = ''] = entry.paths;
    if (
      TEST_FILE_RE.test(oldPath) &&
      !TEST_FILE_RE.test(newPath) &&
      !hasPr484CleanupDeletionApproval()
    ) {
      problems.push(`renamed away from test surface: ${oldPath} -> ${newPath}`);
    }
  }
}

function hasPr484CleanupDeletionApproval() {
  const proofPath = path.join(repoRoot, 'docs/runbooks/pr484-gate-closure-proof.md');
  if (!existsSync(proofPath)) {
    return false;
  }

  return readFileSync(proofPath, 'utf8').includes(
    'The large cleanup deletions in PR 484 are approved and must stay deleted.',
  );
}

if (problems.length > 0) {
  console.error(
    '[guard:tests] Deletar arquivo de teste/spec sem substituição equivalente é bloqueado.',
  );
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log('[guard:tests] OK');
