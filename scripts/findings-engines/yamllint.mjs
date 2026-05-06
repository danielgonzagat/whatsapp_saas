#!/usr/bin/env node
/**
 * yamllint findings engine — lint .yml/.yaml files.
 * NOT constitution-locked.
 *
 * Requires: yamllint (brew install yamllint)
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
  const r = spawnSync('yamllint', ['--version'], { encoding: 'utf-8' });
  if (r.status === 0 && r.stdout) {
    const m = r.stdout.match(/yamllint\s+([\d.]+)/);
    return m ? `yamllint ${m[1]}` : 'yamllint unknown';
  }
  return 'yamllint unknown';
}

function globFiles(exts) {
  const args = ['-type', 'f', '-name'];
  const conditions = [];
  for (const ext of exts) {
    conditions.push('-name', `*${ext}`);
  }
  // Build: find . -type f \( -name '*.yml' -o -name '*.yaml' \) ...
  const findArgs = [REPO_ROOT, '-type', 'f'];
  // Exclude directories
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
  const result = spawnSync(
    'find',
    [
      ...findArgs,
      ...excludeArgs,
      '(',
      conditions.flatMap((c, i) => (i > 0 ? ['-o', c] : [c])),
      ')',
    ].flat(),
    {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) return [];
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((p) => relative(REPO_ROOT, p))
    .sort();
}

// yamllint -f parsable output: file:line:col:error/warning:message
function parseYamllintOutput(stdout) {
  const findings = [];
  const lines = stdout.trim().split('\n');
  for (const line of lines) {
    if (!line) continue;
    const m = line.match(/^([^:]+):(\d+):(\d+):(\w+):(.*)$/);
    if (!m) continue;
    const [, fileRaw, lineStr, colStr, sevRaw, message] = m;
    const severity = sevRaw === 'error' ? 'high' : 'medium';
    const file = relative(REPO_ROOT, resolve(REPO_ROOT, fileRaw)).replace(/\\/g, '/');
    findings.push({
      file,
      line: Number(lineStr),
      column: Number(colStr),
      category: 'lint',
      severity,
      engine: 'yamllint',
      rule: `yamllint:${sevRaw}`,
      message: message.trim(),
      fingerprint: fingerprint({
        file,
        line: Number(lineStr),
        rule: `yamllint:${sevRaw}`,
        message: message.trim(),
      }),
    });
  }
  return findings;
}

const start = Date.now();

if (!toolExists('yamllint')) {
  const report = buildReport('yamllint', 'unavailable', [], {
    durationMs: Date.now() - start,
    status: 'error',
    error: 'yamllint not installed — install via: brew install yamllint',
  });
  report.engine_unavailable = true;
  process.stderr.write('yamllint not installed — install via: brew install yamllint\n');
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const version = getVersion();
const files = globFiles(['.yml', '.yaml']);
const allFindings = [];

for (const file of files) {
  const absPath = resolve(REPO_ROOT, file);
  if (!existsSync(absPath)) continue;
  const r = spawnSync('yamllint', ['-f', 'parsable', absPath], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
  });
  if (r.stdout) {
    allFindings.push(...parseYamllintOutput(r.stdout));
  }
}

const durationMs = Date.now() - start;
const report = buildReport('yamllint', version, allFindings, { durationMs, status: 'ok' });

process.stdout.write(JSON.stringify(report, null, 2));
