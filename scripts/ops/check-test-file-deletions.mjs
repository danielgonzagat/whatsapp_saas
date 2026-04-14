#!/usr/bin/env node

import { collectNameStatus } from './lib/changed-files.mjs';

const TEST_FILE_RE = /\.(?:spec|test)\.[jt]sx?$/i;

const problems = [];

for (const entry of collectNameStatus()) {
  const status = entry.status || '';

  if (status.startsWith('D')) {
    const [deletedPath = ''] = entry.paths;
    if (TEST_FILE_RE.test(deletedPath)) {
      problems.push(`deleted: ${deletedPath}`);
    }
    continue;
  }

  if (status.startsWith('R')) {
    const [oldPath = '', newPath = ''] = entry.paths;
    if (TEST_FILE_RE.test(oldPath) && !TEST_FILE_RE.test(newPath)) {
      problems.push(`renamed away from test surface: ${oldPath} -> ${newPath}`);
    }
  }
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
