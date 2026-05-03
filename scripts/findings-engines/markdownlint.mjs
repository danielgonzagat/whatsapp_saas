#!/usr/bin/env node
/**
 * markdownlint findings engine — lint .md files.
 * NOT constitution-locked.
 *
 * Requires: markdownlint-cli2 (npm install -g markdownlint-cli2 or npx)
 */

import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, fingerprint } from './_schema.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

function toolVersion() {
  const r = spawnSync('markdownlint-cli2', ['--version'], { encoding: 'utf-8', timeout: 10_000 });
  if (r.status === 0 && r.stdout) {
    const m = r.stdout.match(/markdownlint-cli2\s+v?([\d.]+)/);
    return m ? `markdownlint-cli2 ${m[1]}` : 'markdownlint-cli2 unknown';
  }
  return 'markdownlint-cli2 unknown';
}

// Parse v0.22.1 text output format: file:line:column severity rule message
// Example: .agents/file.md:7:121 error MD013/line-length Line length [Expected: 120; Actual: 192]
function parseMarkdownlintOutput(stdout) {
  const findings = [];
  if (!stdout) return findings;
  const lines = stdout.split('\n');
  for (const line of lines) {
    // Skip summary line and empty lines
    if (!line || line.startsWith('Summary:')) continue;
    const m = line.match(/^(.+?):(\d+):(\d+)\s+(error|warning|info)\s+([\w/-]+)\s+(.+)$/);
    if (!m) continue;
    const [, fileRaw, lineStr, colStr, sevRaw, rule, message] = m;
    const severity = sevRaw === 'error' ? 'high' : sevRaw === 'warning' ? 'medium' : 'low';
    const file = relative(REPO_ROOT, resolve(REPO_ROOT, fileRaw)).replace(/\\/g, '/');
    findings.push({
      file,
      line: Number(lineStr),
      column: Number(colStr),
      category: 'lint',
      severity,
      engine: 'markdownlint',
      rule,
      message: message.trim(),
      fingerprint: fingerprint({
        file,
        line: Number(lineStr),
        rule,
        message: message.trim(),
      }),
    });
  }
  return findings;
}

const start = Date.now();

// Probe: check if markdownlint-cli2 is available via which (avoids ENOBUFS from npx glob)
function toolExists(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf-8', timeout: 5_000 });
  return r.status === 0 && r.stdout.trim().length > 0;
}

if (!toolExists('markdownlint-cli2')) {
  const report = buildReport('markdownlint', 'unavailable', [], {
    durationMs: Date.now() - start,
    status: 'error',
    error: 'markdownlint-cli2 not installed — install via: npm install -g markdownlint-cli2',
  });
  report.engine_unavailable = true;
  process.stderr.write(
    'markdownlint-cli2 not installed — install via: npm install -g markdownlint-cli2\n',
  );
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const version = toolVersion();
const allFindings = [];

const r = spawnSync(
  'markdownlint-cli2',
  [
    '**/*.md',
    '#**/node_modules/**',
    '#**/.git/**',
    '#**/99 - Espelho do Codigo/**',
    '#**/dist/**',
    '#**/build/**',
    '#**/.next/**',
    '#**/coverage/**',
    '--no-globs',
  ],
  {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  },
);

if (r.stdout) {
  allFindings.push(...parseMarkdownlintOutput(r.stdout));
}

// stderr may contain output too (some versions)
if (r.stderr) {
  allFindings.push(...parseMarkdownlintOutput(r.stderr));
}

const durationMs = Date.now() - start;
const report = buildReport('markdownlint', version, allFindings, { durationMs, status: 'ok' });

process.stdout.write(JSON.stringify(report, null, 2));
