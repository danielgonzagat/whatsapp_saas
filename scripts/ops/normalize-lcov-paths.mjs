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

const BACKSLASH_RE = /\\/g;
const LEADING_DOT_SLASH_RE = /^\.?\//;

function normalizeSfPath(rawPath, workspace) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return trimmed;

  const unixPath = trimmed.replace(BACKSLASH_RE, '/');
  if (path.isAbsolute(unixPath)) {
    const relative = path.relative(repoRoot, unixPath).replace(BACKSLASH_RE, '/');
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

  return `${workspace}/${unixPath.replace(LEADING_DOT_SLASH_RE, '')}`;
}

let touchedReports = 0;

for (const report of REPORTS) {
  const reportPath = path.join(repoRoot, report.file);
  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: reportPath is path.join(repoRoot, report.file) where report.file is a hardcoded constant from REPORTS; no user input.
  if (!fs.existsSync(reportPath)) {
    continue;
  }

  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: reportPath is path.join(repoRoot, report.file) where report.file is a hardcoded constant from REPORTS; no user input.
  const original = fs.readFileSync(reportPath, 'utf8');
  const normalized = original
    .split('\n')
    .map((line) =>
      line.startsWith('SF:') ? `SF:${normalizeSfPath(line.slice(3), report.workspace)}` : line,
    )
    .join('\n');

  if (normalized !== original) {
    // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
    // Safe: reportPath is path.join(repoRoot, report.file) where report.file is a hardcoded constant from REPORTS; no user input.
    fs.writeFileSync(reportPath, normalized);
    touchedReports += 1;
  }
}

console.log(`[normalize-lcov-paths] normalized ${touchedReports} report(s) relative to repo root.`);
