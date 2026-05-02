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
  const r = spawnSync('npx', ['--no-install', 'markdownlint-cli2', '--version'], {
    encoding: 'utf-8',
  });
  if (r.status === 0 && r.stdout) return `markdownlint-cli2 ${r.stdout.trim()}`;
  return 'markdownlint-cli2 unknown';
}

function parseMarkdownlintOutput(stdout) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return findings;
  }
  if (!Array.isArray(parsed)) return findings;
  for (const result of parsed) {
    const file = relative(REPO_ROOT, result.fileName).replace(/\\/g, '/');
    if (!result.violations) continue;
    for (const v of result.violations) {
      findings.push({
        file,
        line: v.lineNumber > 0 ? v.lineNumber : undefined,
        column: v.columnNumber > 0 ? v.columnNumber : undefined,
        category: 'lint',
        severity: 'medium',
        engine: 'markdownlint',
        rule: (() => {
          if (!v.ruleNames) return 'markdownlint/unknown';
          const raw = Array.isArray(v.ruleNames) ? v.ruleNames.join('/') : String(v.ruleNames);
          return raw || 'markdownlint/unknown';
        })(),
        message: v.ruleDescription || v.ruleNames?.toString() || v.ruleName || 'Formatting issue',
        fingerprint: fingerprint({
          file,
          line: v.lineNumber > 0 ? v.lineNumber : undefined,
          rule: (() => {
            if (!v.ruleNames) return 'markdownlint/unknown';
            const raw = Array.isArray(v.ruleNames) ? v.ruleNames.join('/') : String(v.ruleNames);
            return raw || 'markdownlint/unknown';
          })(),
          message: v.ruleDescription || 'Formatting issue',
        }),
      });
    }
  }
  return findings;
}

const start = Date.now();

// Probe: check if markdownlint-cli2 is available
const probe = spawnSync('npx', ['--no-install', 'markdownlint-cli2', '--version'], {
  encoding: 'utf-8',
  timeout: 10_000,
});
if (probe.status !== 0 && probe.error) {
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
  'npx',
  [
    '--no-install',
    'markdownlint-cli2',
    '**/*.md',
    '--json',
    '--no-globs',
    // Exclude patterns
    '--ignore',
    'node_modules',
    '--ignore',
    '.git',
    '--ignore',
    '99 - Espelho do Codigo',
    '--ignore',
    'dist',
    '--ignore',
    'build',
    '--ignore',
    '.next',
    '--ignore',
    'coverage',
  ],
  {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
  },
);

if (r.stdout) {
  allFindings.push(...parseMarkdownlintOutput(r.stdout));
}

// Also check stderr for JSON (some versions output there)
if (r.stderr && r.stderr.trim().startsWith('[')) {
  allFindings.push(...parseMarkdownlintOutput(r.stderr));
}

const durationMs = Date.now() - start;
const report = buildReport('markdownlint', version, allFindings, { durationMs, status: 'ok' });

process.stdout.write(JSON.stringify(report, null, 2));
