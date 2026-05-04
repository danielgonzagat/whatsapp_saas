#!/usr/bin/env node
/**
 * eslint findings engine — normalized Finding[] from ESLint --format json.
 * NOT constitution-locked. Locked configs are CONSUMED, not modified.
 *
 * Run: node scripts/findings-engines/eslint.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, fingerprint, assertEngineReport } from './_schema.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

const WORKSPACES = ['backend', 'frontend', 'worker'];

const SECURITY_RULES = new Set(['no-eval', 'no-implied-eval', 'no-script-url', 'no-new-func']);

function isSecurityRule(ruleId) {
  if (ruleId.startsWith('security/') || ruleId.startsWith('security-node/')) return true;
  if (SECURITY_RULES.has(ruleId)) return true;
  return false;
}

function pickCategory(ruleId, fatal) {
  if (fatal || (ruleId && ruleId.startsWith('parser/'))) return 'syntax';

  if (isSecurityRule(ruleId)) return 'security';

  if (ruleId === 'no-unused-vars' || ruleId === '@typescript-eslint/no-unused-vars') {
    return 'dead-code';
  }

  if (ruleId && ruleId.startsWith('unused-imports/')) return 'import-unused';

  if (
    ruleId === 'complexity' ||
    ruleId === 'max-lines' ||
    ruleId === 'max-lines-per-function' ||
    ruleId === 'max-depth' ||
    ruleId === 'max-params' ||
    ruleId === 'sonarjs/cognitive-complexity'
  ) {
    return 'complexity';
  }

  if (ruleId && ruleId.startsWith('@typescript-eslint/')) return 'type';

  return 'lint';
}

function pickSeverity(fatal, severity) {
  if (fatal) return 'critical';
  if (severity === 2) return 'high';
  if (severity === 1) return 'medium';
  return 'low';
}

function runEslint(workspace) {
  const workspacePath = resolve(REPO_ROOT, workspace);
  const result = spawnSync(
    'npx',
    ['--no-install', 'eslint', '.', '--format', 'json', '--no-error-on-unmatched-pattern'],
    {
      cwd: workspacePath,
      maxBuffer: 256 * 1024 * 1024,
      encoding: 'utf-8',
      timeout: 300_000,
    },
  );

  if (result.error) {
    return { error: result.error.message, findings: [] };
  }

  if (!result.stdout || result.stdout.trim() === '') {
    if (result.stderr) {
      return { error: result.stderr.trim(), findings: [] };
    }
    return { findings: [] };
  }

  try {
    const raw = JSON.parse(result.stdout);
    if (!Array.isArray(raw)) {
      return { error: 'ESLint output is not an array', findings: [] };
    }
    return { findings: raw };
  } catch {
    return {
      error: `Failed to parse ESLint JSON: ${result.stderr || 'unknown error'}`,
      findings: [],
    };
  }
}

// Skip build output / generated files: ESLint emits parse errors for them
// (parserOptions.project rejects them) but they aren't first-class source.
const NOISE_PATH_RE =
  /(^|\/)(dist|build|coverage|\.next|\.turbo|\.vercel|\.railway|node_modules|generated)(\/|$)/;

function mapFindings(rawResults) {
  const findings = [];

  for (const result of rawResults) {
    const file = relative(REPO_ROOT, result.filePath).replace(/\\/g, '/');
    if (NOISE_PATH_RE.test(file)) continue;

    for (const msg of result.messages) {
      const rule = msg.ruleId ?? 'eslint-fatal';
      const fatal = msg.fatal === true;

      findings.push({
        file,
        line: msg.line,
        column: msg.column,
        engine: 'eslint',
        rule,
        message: msg.message,
        category: pickCategory(rule, fatal),
        severity: pickSeverity(fatal, msg.severity),
        fingerprint: fingerprint({ file, line: msg.line, rule, message: msg.message }),
      });
    }
  }

  return findings;
}

function getEslintVersion() {
  const result = spawnSync('npx', ['--no-install', 'eslint', '--version'], {
    encoding: 'utf-8',
  });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return 'unknown';
}

const start = Date.now();
const version = getEslintVersion();
const allFindings = [];
const errors = [];

for (const workspace of WORKSPACES) {
  const configPath = resolve(REPO_ROOT, workspace, 'eslint.config.mjs');
  if (!existsSync(configPath)) continue;

  const { findings, error } = runEslint(workspace);
  if (error) {
    errors.push(`${workspace}: ${error}`);
  }
  if (findings && findings.length) {
    allFindings.push(...mapFindings(findings));
  }
}

const durationMs = Date.now() - start;
const status = errors.length > 0 ? (allFindings.length > 0 ? 'partial' : 'error') : 'ok';

const report = buildReport('eslint', version, allFindings, {
  durationMs,
  status,
  ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
});

process.stdout.write(JSON.stringify(report, null, 2));
