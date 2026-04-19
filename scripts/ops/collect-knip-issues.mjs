#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const knipBin = path.join(repoRoot, 'node_modules', '.bin', 'knip');
const ISSUE_TYPES = ['files', 'dependencies', 'unlisted', 'unresolved', 'exports', 'types'];
const PATH_SEPARATOR_RE = /[\\/]/;

function inferWorkspace(file) {
  if (typeof file !== 'string' || file.length === 0) return 'root';
  const [segment] = file.split(PATH_SEPARATOR_RE);
  if (['backend', 'frontend', 'worker', 'e2e', 'scripts'].includes(segment)) {
    return segment;
  }
  return 'root';
}

function normalizeIssueEntry(issueType, file, entry) {
  const entryFile =
    typeof entry?.file === 'string'
      ? entry.file
      : typeof entry?.path === 'string'
        ? entry.path
        : typeof entry?.name === 'string' && issueType === 'files'
          ? entry.name
          : typeof entry === 'string'
            ? entry
            : file;
  const symbol =
    typeof entry?.symbol === 'string'
      ? entry.symbol
      : typeof entry?.name === 'string' && issueType !== 'files'
        ? entry.name
        : typeof entry === 'string' && entry !== entryFile
          ? entry
          : '';

  return {
    workspace: inferWorkspace(entryFile || file),
    type: issueType,
    file: entryFile || file,
    symbol,
  };
}

function pushEntriesForType(issueType, file, entries, issues) {
  for (const entry of entries) {
    issues.push(normalizeIssueEntry(issueType, file, entry));
  }
}

function normalizeFileIssues(issueFile, issues) {
  const file = typeof issueFile?.file === 'string' ? issueFile.file : '';
  for (const issueType of ISSUE_TYPES) {
    const entries = Array.isArray(issueFile?.[issueType]) ? issueFile[issueType] : [];
    pushEntriesForType(issueType, file, entries, issues);
  }
}

function normalizeTopLevelIssues(payload, issues) {
  for (const [issueType, issueValue] of Object.entries(payload)) {
    if (!ISSUE_TYPES.includes(issueType) || !Array.isArray(issueValue)) continue;
    pushEntriesForType(issueType, '', issueValue, issues);
  }
}

function normalizeIssues(payload, issues) {
  if (!payload || typeof payload !== 'object') return;

  if (Array.isArray(payload.issues)) {
    for (const issueFile of payload.issues) {
      normalizeFileIssues(issueFile, issues);
    }
    return;
  }

  normalizeTopLevelIssues(payload, issues);
}

export function collectKnipIssues() {
  const stdout = execFileSync(
    knipBin,
    ['--config', 'knip.json', '--reporter', 'json', '--no-progress', '--no-exit-code'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout);
  const issues = [];

  if (Array.isArray(parsed)) {
    for (const workspace of parsed) {
      normalizeIssues(workspace, issues);
    }
  } else {
    normalizeIssues(parsed, issues);
  }

  return {
    totalIssues: issues.length,
    issues,
  };
}

function main() {
  console.log(JSON.stringify(collectKnipIssues(), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`[knip-ratchet] ${error?.message || String(error)}`);
    process.exit(1);
  }
}
