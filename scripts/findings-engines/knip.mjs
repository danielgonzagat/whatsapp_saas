#!/usr/bin/env node
/**
 * knip findings engine — normalized Finding[] from `knip --reporter json`.
 * NOT constitution-locked.
 */

import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, fingerprint } from './_schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const MAPPING = [
  {
    key: 'files',
    category: 'dead-code',
    severity: 'medium',
    rule: 'knip/orphan-file',
    msgTpl: (n) => `unused file: ${n}`,
  },
  {
    key: 'dependencies',
    category: 'dep-cve',
    severity: 'low',
    rule: 'knip/unused-dependency',
    msgTpl: (n) => `unused dependency: ${n}`,
  },
  {
    key: 'devDependencies',
    category: 'dep-cve',
    severity: 'low',
    rule: 'knip/unused-devdependency',
    msgTpl: (n) => `unused devDependency: ${n}`,
  },
  {
    key: 'unlisted',
    category: 'import-broken',
    severity: 'high',
    rule: 'knip/unlisted-dependency',
    msgTpl: (n) => `unlisted import: ${n}`,
  },
  {
    key: 'unresolved',
    category: 'import-broken',
    severity: 'high',
    rule: 'knip/unresolved',
    msgTpl: (n) => `unresolved: ${n}`,
  },
  {
    key: 'exports',
    category: 'dead-code',
    severity: 'low',
    rule: 'knip/unused-export',
    msgTpl: (n) => `unused export: ${n}`,
  },
  {
    key: 'types',
    category: 'dead-code',
    severity: 'low',
    rule: 'knip/unused-type',
    msgTpl: (n) => `unused type: ${n}`,
  },
  {
    key: 'duplicates',
    category: 'dead-code',
    severity: 'medium',
    rule: 'knip/duplicate-export',
    msgTpl: (n) => `duplicate export: ${n}`,
  },
  {
    key: 'enumMembers',
    category: 'dead-code',
    severity: 'low',
    rule: 'knip/unused-enum-member',
    msgTpl: (n) => `unused enum member: ${n}`,
  },
  {
    key: 'classMembers',
    category: 'dead-code',
    severity: 'low',
    rule: 'knip/unused-class-member',
    msgTpl: (n) => `unused class member: ${n}`,
  },
  {
    key: 'binaries',
    category: 'dep-cve',
    severity: 'medium',
    rule: 'knip/unused-binary',
    msgTpl: (n) => `unused binary: ${n}`,
  },
];

function entryName(entry) {
  return typeof entry === 'string' ? entry : (entry?.name ?? 'unknown');
}

function addFinding(findings, file, entry, { category, severity, rule, msgTpl }) {
  const name = entryName(entry);
  const line = entry && typeof entry === 'object' ? entry.line : undefined;
  const col = entry && typeof entry === 'object' ? entry.col : undefined;

  findings.push({
    file,
    ...(typeof line === 'number' ? { line } : {}),
    ...(typeof col === 'number' ? { column: col } : {}),
    category,
    severity,
    engine: 'knip',
    rule,
    message: msgTpl(name),
    fingerprint: fingerprint({ file, line, rule, message: msgTpl(name) }),
  });
}

function emitError(reason, durationMs, version) {
  const report = buildReport('knip', version, [], {
    status: 'error',
    error: reason,
    durationMs,
  });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}

// --- Version detection ---
let version = 'unknown';
try {
  version = execFileSync('npx', ['--no-install', 'knip', '--version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 15000,
  }).trim();
} catch {
  // fallback: unknown
}

// --- Run knip ---
const start = Date.now();
let result;
try {
  result = spawnSync('npx', ['--no-install', 'knip', '--reporter', 'json', '--no-progress'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 180000,
  });
} catch (err) {
  emitError(`spawn failed: ${err.message}`, Date.now() - start, version);
}

const durationMs = Date.now() - start;

if (result.error) {
  emitError(`Failed to run knip: ${result.error.message}`, durationMs, version);
}

// --- Parse knip output ---
let parsed;
try {
  parsed = JSON.parse(result.stdout);
} catch {
  emitError('Failed to parse knip output', durationMs, version);
}

// --- Map to findings ---
const findings = [];

function processEntryList(issueFile, entries, mapping) {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    addFinding(findings, issueFile, entry, mapping);
  }
}

// Top-level files[] (orphan files outside issues)
if (Array.isArray(parsed.files)) {
  processEntryList(repoRoot, parsed.files, MAPPING[0]);
}

// Issue-level entries
for (const issue of parsed.issues || []) {
  const issueFile = typeof issue.file === 'string' ? issue.file : '';
  for (const m of MAPPING) {
    processEntryList(issueFile, issue[m.key], m);
  }
}

const report = buildReport('knip', version, findings, { status: 'ok', durationMs });
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
