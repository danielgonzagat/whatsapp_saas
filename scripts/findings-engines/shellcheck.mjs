#!/usr/bin/env node
/**
 * shellcheck findings engine — lint .sh files.
 * NOT constitution-locked.
 *
 * Requires: shellcheck (brew install shellcheck)
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
  const r = spawnSync('shellcheck', ['--version'], { encoding: 'utf-8' });
  if (r.status === 0 && r.stdout) {
    const m = r.stdout.match(/version:\s+([\d.]+)/);
    return m ? `shellcheck ${m[1]}` : 'shellcheck unknown';
  }
  return 'shellcheck unknown';
}

function findShellFiles() {
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
  const r = spawnSync('find', [REPO_ROOT, '-type', 'f', '-name', '*.sh', ...excludeArgs], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) return [];
  return r.stdout.trim().split('\n').filter(Boolean).sort();
}

const SEVERITY_MAP = {
  error: 'high',
  warning: 'medium',
  info: 'low',
  style: 'low',
};

function parseShellcheckOutput(stdout) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return findings;
  }
  // shellcheck -f json returns an array of files, each with "comments" array
  for (const fileResult of parsed) {
    const file = relative(REPO_ROOT, fileResult.file).replace(/\\/g, '/');
    if (!fileResult.comments) continue;
    for (const comment of fileResult.comments) {
      const severity = SEVERITY_MAP[comment.level] || 'medium';
      findings.push({
        file,
        line: comment.line > 0 ? comment.line : undefined,
        column: comment.column > 0 ? comment.column : undefined,
        category: 'lint',
        severity,
        engine: 'shellcheck',
        rule: `SC${comment.code}`,
        message: comment.message,
        fingerprint: fingerprint({
          file,
          line: comment.line > 0 ? comment.line : undefined,
          rule: `SC${comment.code}`,
          message: comment.message,
        }),
      });
    }
  }
  return findings;
}

const start = Date.now();

if (!toolExists('shellcheck')) {
  const report = buildReport('shellcheck', 'unavailable', [], {
    durationMs: Date.now() - start,
    status: 'error',
    error: 'shellcheck not installed — install via: brew install shellcheck',
  });
  report.engine_unavailable = true;
  process.stderr.write('shellcheck not installed — install via: brew install shellcheck\n');
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const version = getVersion();
const files = findShellFiles();
const allFindings = [];

if (files.length > 0) {
  const r = spawnSync('shellcheck', ['-f', 'json', ...files], {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
  });
  if (r.stdout) {
    allFindings.push(...parseShellcheckOutput(r.stdout));
  }
}

const durationMs = Date.now() - start;
const status = 'ok';
const report = buildReport('shellcheck', version, allFindings, { durationMs, status });

process.stdout.write(JSON.stringify(report, null, 2));
