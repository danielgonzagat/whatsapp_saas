#!/usr/bin/env node
/**
 * gitleaks findings engine — detect secrets in repo files.
 * NOT constitution-locked.
 *
 * Requires: gitleaks (brew install gitleaks)
 *
 * Note: runs with --no-git so it scans files directly (not git history).
 */

import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, fingerprint } from './_schema.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

function toolExists(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf-8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function getVersion() {
  const r = spawnSync('gitleaks', ['version'], { encoding: 'utf-8' });
  if (r.status === 0 && r.stdout) {
    return `gitleaks ${r.stdout.trim()}`;
  }
  return 'gitleaks unknown';
}

function parseGitleaksOutput(stdout) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return findings;
  }
  if (!Array.isArray(parsed)) return findings;
  for (const leak of parsed) {
    const file = relative(REPO_ROOT, leak.File || '').replace(/\\/g, '/');
    if (!file) continue;
    const rule = leak.RuleID || 'gitleaks/unknown';
    const message = leak.Description || `Secret detected: ${rule}`;
    findings.push({
      file,
      line: leak.StartLine > 0 ? leak.StartLine : undefined,
      column: leak.StartColumn > 0 ? leak.StartColumn : undefined,
      category: 'security',
      severity: 'critical',
      engine: 'gitleaks',
      rule,
      message,
      fingerprint: fingerprint({
        file,
        line: leak.StartLine > 0 ? leak.StartLine : undefined,
        rule,
        message,
      }),
      extra: { secret: leak.Secret ? '[REDACTED]' : undefined, match: leak.Match },
    });
  }
  return findings;
}

const start = Date.now();

if (!toolExists('gitleaks')) {
  const report = buildReport('gitleaks', 'unavailable', [], {
    durationMs: Date.now() - start,
    status: 'error',
    error: 'gitleaks not installed — install via: brew install gitleaks',
  });
  report.engine_unavailable = true;
  process.stderr.write('gitleaks not installed — install via: brew install gitleaks\n');
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const version = getVersion();
const allFindings = [];

const r = spawnSync(
  'gitleaks',
  ['detect', '--source', REPO_ROOT, '--no-git', '--report-format', 'json', '--exit-code', '0'],
  {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  },
);

if (r.stdout) {
  allFindings.push(...parseGitleaksOutput(r.stdout));
}

const durationMs = Date.now() - start;
const report = buildReport('gitleaks', version, allFindings, { durationMs, status: 'ok' });

process.stdout.write(JSON.stringify(report, null, 2));
