#!/usr/bin/env node
/**
 * npm audit findings engine — detect CVEs in dependencies.
 * NOT constitution-locked.
 *
 * Requires: npm (built-in with Node.js)
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, fingerprint } from './_schema.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

const WORKSPACES = ['', 'backend', 'frontend', 'worker'];

const SEVERITY_MAP = {
  critical: 'critical',
  high: 'high',
  moderate: 'medium',
  low: 'low',
};

function parseAuditOutput(stdout, packagePath) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return findings;
  }
  // npm audit returns { "vulnerabilities": { "pkg": { ... } } }
  const vulns = parsed.vulnerabilities || {};
  for (const [name, vuln] of Object.entries(vulns)) {
    if (!vuln || typeof vuln !== 'object') continue;
    const severity = SEVERITY_MAP[vuln.severity] || 'low';
    const viaIds =
      vuln.via && Array.isArray(vuln.via)
        ? vuln.via
            .filter((v) => typeof v === 'object' && v?.url)
            .map((v) => v.url.split('/').pop())
            .filter(Boolean)
        : [];
    const rule = viaIds.length > 0 ? viaIds.join(', ').slice(0, 120) : 'npm/cve';
    const message = vuln.title || `Vulnerability in ${name}`;
    findings.push({
      file: packagePath,
      line: undefined,
      column: undefined,
      category: 'dep-cve',
      severity,
      engine: 'npmaudit',
      rule: rule.slice(0, 120),
      message: `${name}: ${message} (${vuln.severity || 'unknown'})`,
      fingerprint: fingerprint({
        file: packagePath,
        rule: 'npmaudit',
        message: `${name}: ${message}`,
      }),
      extra: { name, severity: vuln.severity, range: vuln.range, fixAvailable: vuln.fixAvailable },
    });
  }
  return findings;
}

function getNpmVersion() {
  const r = spawnSync('npm', ['--version'], { encoding: 'utf-8' });
  if (r.status === 0 && r.stdout) return `npm ${r.stdout.trim()}`;
  return 'npm unknown';
}

const start = Date.now();
const version = getNpmVersion();
const allFindings = [];
const errors = [];

for (const ws of WORKSPACES) {
  const cwd = ws ? resolve(REPO_ROOT, ws) : REPO_ROOT;
  const packageJson = resolve(cwd, 'package.json');
  if (!existsSync(packageJson)) continue;
  const lockFile = resolve(cwd, 'package-lock.json');
  const pkgFile = relative(REPO_ROOT, packageJson).replace(/\\/g, '/');

  // Only run audit if lockfile exists (audit needs it)
  if (!existsSync(lockFile)) continue;

  const r = spawnSync('npm', ['audit', '--json'], {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  // npm audit exits 1 when vulnerabilities found — stdout still contains JSON
  if (r.stdout) {
    allFindings.push(...parseAuditOutput(r.stdout, pkgFile));
  }
  if (r.error) {
    errors.push(`${ws}: ${r.error.message}`);
  }
}

const durationMs = Date.now() - start;
const status = errors.length > 0 ? (allFindings.length > 0 ? 'partial' : 'error') : 'ok';
const report = buildReport('npmaudit', version, allFindings, {
  durationMs,
  status,
  ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
});

process.stdout.write(JSON.stringify(report, null, 2));
