#!/usr/bin/env node
/**
 * hadolint findings engine — lint Dockerfiles.
 * NOT constitution-locked.
 *
 * Requires: hadolint (brew install hadolint)
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, fingerprint } from './_schema.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

function toolExists(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf-8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function getVersion() {
  const r = spawnSync('hadolint', ['--version'], { encoding: 'utf-8' });
  if (r.status === 0 && r.stdout) {
    const m = r.stdout.match(/Haskell Dockerfile Linter\s+([\d.]+)/);
    return m ? `hadolint ${m[1]}` : 'hadolint unknown';
  }
  return 'hadolint unknown';
}

function findDockerfiles() {
  const exclude = [
    'node_modules',
    '.git',
    '99 - Espelho do Codigo',
    'dist',
    'build',
    '.next',
    'coverage',
    '.turbo',
  ];
  const excludeArgs = [];
  for (const dir of exclude) {
    excludeArgs.push('-not', '-path', `*/${dir}/*`);
  }
  const r = spawnSync(
    'find',
    [REPO_ROOT, '-type', 'f', '-name', 'Dockerfile', '-o', '-name', 'Dockerfile.*', ...excludeArgs],
    {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (r.status !== 0) return [];
  return r.stdout.trim().split('\n').filter(Boolean).sort();
}

const SEVERITY_MAP = {
  error: 'high',
  warning: 'medium',
  info: 'low',
};

function parseHadolintOutput(stdout) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return findings;
  }
  if (!Array.isArray(parsed)) return findings;
  for (const issue of parsed) {
    const file = relative(REPO_ROOT, issue.file).replace(/\\/g, '/');
    const severity = SEVERITY_MAP[issue.level] || 'medium';
    findings.push({
      file,
      line: issue.line > 0 ? issue.line : undefined,
      column: issue.column > 0 ? issue.column : undefined,
      category: 'lint',
      severity,
      engine: 'hadolint',
      rule: issue.code || 'hadolint/unknown',
      message: issue.message || 'No message',
      fingerprint: fingerprint({
        file,
        line: issue.line > 0 ? issue.line : undefined,
        rule: issue.code || 'hadolint/unknown',
        message: issue.message || 'No message',
      }),
    });
  }
  return findings;
}

const start = Date.now();

if (!toolExists('hadolint')) {
  const report = buildReport('hadolint', 'unavailable', [], {
    durationMs: Date.now() - start,
    status: 'error',
    error: 'hadolint not installed — install via: brew install hadolint',
  });
  report.engine_unavailable = true;
  process.stderr.write('hadolint not installed — install via: brew install hadolint\n');
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const version = getVersion();
const files = findDockerfiles();
const allFindings = [];

for (const file of files) {
  if (!existsSync(file)) continue;
  const r = spawnSync('hadolint', ['-f', 'json', file], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
  });
  if (r.stdout) {
    allFindings.push(...parseHadolintOutput(r.stdout));
  }
}

const durationMs = Date.now() - start;
const report = buildReport('hadolint', version, allFindings, { durationMs, status: 'ok' });

process.stdout.write(JSON.stringify(report, null, 2));
