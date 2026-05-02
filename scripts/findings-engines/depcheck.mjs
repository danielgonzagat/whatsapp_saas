#!/usr/bin/env node
/**
 * depcheck findings engine — detect unused/missing dependencies.
 * NOT constitution-locked.
 *
 * Requires: depcheck (npm install -g depcheck or npx depcheck)
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, fingerprint } from './_schema.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

// Workspaces where we can run depcheck (must have package.json with dependencies)
const WORKSPACES = ['', 'backend', 'frontend', 'worker'];

function toolVersion() {
  const r = spawnSync('npx', ['--no-install', 'depcheck', '--version'], { encoding: 'utf-8' });
  if (r.status === 0 && r.stdout) return `depcheck ${r.stdout.trim()}`;
  return 'depcheck unknown';
}

function runDepcheck(cwd) {
  const configs = [];
  // Try to use .depcheckrc if it exists in the workspace
  const cfgPath = resolve(cwd, '.depcheckrc');
  const cfgJsonPath = resolve(cwd, '.depcheckrc.json');
  if (existsSync(cfgJsonPath)) configs.push('--config', cfgJsonPath);
  else if (existsSync(cfgPath)) configs.push('--config', cfgPath);

  const r = spawnSync('npx', ['--no-install', 'depcheck', '--json', ...configs], {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
  });
  return r;
}

function parseDepcheckOutput(stdout, packagePath) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return findings;
  }
  const pkgFile = packagePath;

  // Unused dependencies
  if (parsed.dependencies && Array.isArray(parsed.dependencies)) {
    for (const dep of parsed.dependencies) {
      findings.push({
        file: pkgFile,
        line: undefined,
        column: undefined,
        category: 'dead-code',
        severity: 'low',
        engine: 'depcheck',
        rule: 'unused-dependency',
        message: `Unused dependency: ${dep}`,
        fingerprint: fingerprint({
          file: pkgFile,
          rule: 'unused-dependency',
          message: `Unused dependency: ${dep}`,
        }),
      });
    }
  }
  // Missing dependencies
  if (parsed.missing && typeof parsed.missing === 'object') {
    for (const [dep, files] of Object.entries(parsed.missing)) {
      if (files.length > 0) {
        findings.push({
          file: pkgFile,
          line: undefined,
          column: undefined,
          category: 'import-broken',
          severity: 'high',
          engine: 'depcheck',
          rule: 'missing-dependency',
          message: `Missing dependency: ${dep} (used in ${files.join(', ')})`,
          fingerprint: fingerprint({
            file: pkgFile,
            rule: 'missing-dependency',
            message: `Missing dependency: ${dep}`,
          }),
        });
      }
    }
  }
  return findings;
}

const start = Date.now();

// Check if depcheck can be run via npx
const probe = spawnSync('npx', ['--no-install', 'depcheck', '--version'], {
  encoding: 'utf-8',
  timeout: 10_000,
});
if (probe.status !== 0 && probe.error) {
  const report = buildReport('depcheck', 'unavailable', [], {
    durationMs: Date.now() - start,
    status: 'error',
    error: 'depcheck not installed — install via: npm install -g depcheck',
  });
  report.engine_unavailable = true;
  process.stderr.write('depcheck not installed — install via: npm install -g depcheck\n');
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const version = toolVersion();
const allFindings = [];

for (const ws of WORKSPACES) {
  const cwd = ws ? resolve(REPO_ROOT, ws) : REPO_ROOT;
  const packageJson = resolve(cwd, 'package.json');
  if (!existsSync(packageJson)) continue;
  const pkgFile = relative(REPO_ROOT, packageJson).replace(/\\/g, '/');

  const r = runDepcheck(cwd);
  if (r.stdout) {
    allFindings.push(...parseDepcheckOutput(r.stdout, pkgFile));
  }
}

const durationMs = Date.now() - start;
const report = buildReport('depcheck', version, allFindings, { durationMs, status: 'ok' });

process.stdout.write(JSON.stringify(report, null, 2));
