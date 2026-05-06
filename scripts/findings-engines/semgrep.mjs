#!/usr/bin/env node
/**
 * semgrep findings engine — reads PULSE_CODACY_STATE.json (cached Codacy snapshot)
 * and surfaces Semgrep-origin findings as normalized Finding[].
 *
 * NOT constitution-locked. Does NOT make network calls.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildReport, fingerprint, assertEngineReport } from './_schema.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CACHE_PATH = path.join(REPO_ROOT, 'PULSE_CODACY_STATE.json');

const startTime = performance.now();

if (!fs.existsSync(CACHE_PATH)) {
  const report = buildReport('semgrep', 'codacy-cloud', [], {
    durationMs: Math.round(performance.now() - startTime),
    status: 'error',
    error: 'PULSE_CODACY_STATE.json not found — run npm run codacy:sync first',
  });
  process.stdout.write(JSON.stringify(report) + '\n');
  if (process.argv[1] === import.meta.filename) {
    assertEngineReport(report);
  }
  process.exit(0);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
} catch (err) {
  const report = buildReport('semgrep', 'codacy-cloud', [], {
    durationMs: Math.round(performance.now() - startTime),
    status: 'error',
    error: `Failed to parse PULSE_CODACY_STATE.json: ${err.message}`,
  });
  process.stdout.write(JSON.stringify(report) + '\n');
  if (process.argv[1] === import.meta.filename) {
    assertEngineReport(report);
  }
  process.exit(0);
}

const version = state.version ? `codacy-cloud-v${state.version}` : 'codacy-cloud';

const issueArrays = [];
if (Array.isArray(state.highPriorityBatch)) issueArrays.push(state.highPriorityBatch);
if (Array.isArray(state.issues)) issueArrays.push(state.issues);
const allIssues = issueArrays.flat();

const semgrepIssues = allIssues.filter((issue) => {
  const tool = String(issue.tool || '').toLowerCase();
  return tool.includes('semgrep') || tool.includes('opengrep');
});

function mapSeverity(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'critical' || s === 'error' || s === 'blocker') return 'critical';
  if (s === 'high' || s === 'warning' || s === 'major') return 'high';
  if (s === 'medium' || s === 'info' || s === 'minor') return 'medium';
  const n = Number(raw);
  if (!Number.isNaN(n)) {
    if (n === 1) return 'critical';
    if (n === 2) return 'high';
    if (n === 3) return 'medium';
    if (n >= 4) return 'low';
  }
  return 'low';
}

const findings = [];
for (const issue of semgrepIssues) {
  const file = String(issue.filePath || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');

  const line = typeof issue.lineNumber === 'number' && issue.lineNumber > 0 ? issue.lineNumber : 1;

  const rule = issue.patternId || 'semgrep/unknown';
  const message = issue.message || 'No message';
  const sevRaw = issue.severityLevel || issue.severity;
  const severity = mapSeverity(sevRaw);

  if (sevRaw && !['critical', 'high', 'medium', 'low'].includes(mapSeverity(sevRaw))) {
    console.error(`semgrep engine: unclassified severity "${sevRaw}" for issue ${issue.issueId}`);
  }

  const finding = {
    file,
    line,
    category: 'security',
    severity,
    engine: 'semgrep',
    rule,
    message,
  };

  finding.fingerprint = fingerprint(finding);
  findings.push(finding);
}

const durationMs = Math.round(performance.now() - startTime);

let status = 'ok';
let errorMsg;
if (allIssues.length === 0) {
  status = 'partial';
  errorMsg = 'PULSE_CODACY_STATE.json contains no issue records';
} else if (findings.length === 0) {
  status = 'partial';
  errorMsg = 'No Semgrep/Opengrep findings found in PULSE_CODACY_STATE.json';
}

const report = buildReport('semgrep', version, findings, {
  durationMs,
  status,
  ...(errorMsg ? { error: errorMsg } : {}),
});

process.stdout.write(JSON.stringify(report) + '\n');

if (process.argv[1] === import.meta.filename) {
  assertEngineReport(report);
}
