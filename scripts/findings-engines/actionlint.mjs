#!/usr/bin/env node
/**
 * actionlint findings engine — stricter lint for GitHub Actions workflows.
 * NOT constitution-locked.
 *
 * Requires: actionlint (brew install actionlint)
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, fingerprint } from './_schema.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

function toolExists(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf-8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function getVersion() {
  const r = spawnSync('actionlint', ['--version'], { encoding: 'utf-8' });
  if (r.status === 0 && r.stdout) {
    return `actionlint ${r.stdout.trim()}`;
  }
  return 'actionlint unknown';
}

function findWorkflowFiles() {
  const workflowsDir = resolve(REPO_ROOT, '.github', 'workflows');
  if (!existsSync(workflowsDir)) return [];
  const r = spawnSync(
    'find',
    [workflowsDir, '-type', 'f', '-name', '*.yml', '-o', '-name', '*.yaml'],
    {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (r.status !== 0) return [];
  return r.stdout.trim().split('\n').filter(Boolean).sort();
}

// actionlint outputs: file:line:col: severity message [rule-id]
// Example: .github/workflows/ci.yml:10:3: error: SC2086: Double quote to prevent globbing
function parseActionlintOutput(stdout) {
  const findings = [];
  const lines = stdout.trim().split('\n');
  for (const line of lines) {
    if (!line) continue;
    // Try two formats:
    // Format 1: file:line:col: severity rule: message
    const m = line.match(/^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)$/);
    if (m) {
      const [, fileRaw, lineStr, colStr, severityType, rest] = m;
      // Try to extract rule ID from rest: "SC2086: Double quote..." or just "message"
      const ruleMatch = rest.match(/^(\w[\w-]*):\s*(.+)$/);
      const rule = ruleMatch ? ruleMatch[1] : 'actionlint';
      const message = ruleMatch ? ruleMatch[2] : rest;
      const file = relative(REPO_ROOT, resolve(REPO_ROOT, fileRaw)).replace(/\\/g, '/');
      findings.push({
        file,
        line: Number(lineStr),
        column: Number(colStr),
        category: 'lint',
        severity: severityType === 'error' ? 'high' : 'medium',
        engine: 'actionlint',
        rule,
        message: message.trim(),
        fingerprint: fingerprint({ file, line: Number(lineStr), rule, message: message.trim() }),
      });
    }
  }
  return findings;
}

const start = Date.now();

if (!toolExists('actionlint')) {
  const report = buildReport('actionlint', 'unavailable', [], {
    durationMs: Date.now() - start,
    status: 'error',
    error: 'actionlint not installed — install via: brew install actionlint',
  });
  report.engine_unavailable = true;
  process.stderr.write('actionlint not installed — install via: brew install actionlint\n');
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const version = getVersion();
const files = findWorkflowFiles();
const allFindings = [];

for (const file of files) {
  if (!existsSync(file)) continue;
  const r = spawnSync('actionlint', ['-ignore', 'SC2086', file], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
  });
  if (r.stdout) {
    allFindings.push(...parseActionlintOutput(r.stdout));
  }
  if (r.stderr) {
    allFindings.push(...parseActionlintOutput(r.stderr));
  }
}

const durationMs = Date.now() - start;
const report = buildReport('actionlint', version, allFindings, { durationMs, status: 'ok' });

process.stdout.write(JSON.stringify(report, null, 2));
