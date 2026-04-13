#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const REPORTS = [
  { file: 'backend/coverage/lcov.info', workspace: 'backend' },
  { file: 'frontend/coverage/lcov.info', workspace: 'frontend' },
  { file: 'worker/coverage/lcov.info', workspace: 'worker' },
];

function normalizeSfPath(rawPath, workspace) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return trimmed;

  const unixPath = trimmed.replace(/\\/g, '/');
  if (path.isAbsolute(unixPath)) {
    const relative = path.relative(repoRoot, unixPath).replace(/\\/g, '/');
    return relative.startsWith('..') ? unixPath : relative;
  }

  if (unixPath.startsWith(`${workspace}/`)) {
    return unixPath;
  }

  if (workspace === 'backend') {
    if (unixPath.startsWith('src/')) return `backend/${unixPath}`;
    if (unixPath.startsWith('prisma/')) return `backend/${unixPath}`;
  }

  if (workspace === 'frontend' && unixPath.startsWith('src/')) {
    return `frontend/${unixPath}`;
  }

  return `${workspace}/${unixPath.replace(/^\.?\//, '')}`;
}

let touchedReports = 0;

for (const report of REPORTS) {
  const reportPath = path.join(repoRoot, report.file);
  if (!fs.existsSync(reportPath)) {
    continue;
  }

  const original = fs.readFileSync(reportPath, 'utf8');
  const normalized = original
    .split('\n')
    .map((line) =>
      line.startsWith('SF:') ? `SF:${normalizeSfPath(line.slice(3), report.workspace)}` : line,
    )
    .join('\n');

  if (normalized !== original) {
    fs.writeFileSync(reportPath, normalized);
    touchedReports += 1;
  }
}

console.log(`[normalize-lcov-paths] normalized ${touchedReports} report(s) relative to repo root.`);
