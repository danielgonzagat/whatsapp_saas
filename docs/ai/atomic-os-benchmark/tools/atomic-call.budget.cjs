'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { trimCommandOutput } = require('./atomic-call.cli.cjs');

function runValidationStep(label, command, args, options = {}) {
  const startedAt = Date.now();
  const spawnOptions = {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
  };
  const timeoutMs = options.timeoutMs ?? optionalPositiveNumber(process.env.ATOMIC_VALIDATION_TIMEOUT_MS);
  const maxBuffer = options.maxBuffer ?? optionalPositiveNumber(process.env.ATOMIC_VALIDATION_MAX_BUFFER);
  if (timeoutMs !== undefined) spawnOptions.timeout = timeoutMs;
  if (maxBuffer !== undefined) spawnOptions.maxBuffer = maxBuffer;
  const result = spawnSync(command, args, spawnOptions);
  const status = typeof result.status === 'number' ? result.status : 124;
  const ok = typeof options.okStatus === 'function' ? options.okStatus(status, result) : status === 0;
  return {
    label,
    ok,
    status,
    signal: result.signal || null,
    durationMs: Date.now() - startedAt,
    stdout: trimCommandOutput(result.stdout),
    stderr: trimCommandOutput(result.stderr),
  };
}

function syntheticValidationStep(label, ok, message = '') {
  return {
    label,
    ok,
    status: ok ? 0 : 1,
    signal: null,
    durationMs: 0,
    stdout: ok ? trimCommandOutput(message) : '',
    stderr: ok ? '' : trimCommandOutput(message),
  };
}

function isAdvisoryCheck(check) {
  return check.advisory === true || check.mode === 'advisory' || check.severity === 'advisory';
}

function budgetValidationStep(label, ok, payload, check) {
  const advisory = isAdvisoryCheck(check);
  return syntheticValidationStep(
    advisory ? `${label} (advisory)` : label,
    advisory ? true : ok,
    JSON.stringify({ ...payload, advisory, observedOk: ok }),
  );
}

function countFileLines(absFile) {
  if (!fs.existsSync(absFile)) return null;
  const text = fs.readFileSync(absFile, 'utf8');
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function runLineBudgetChecks(cwd, checks = []) {
  return checks.map((check) => {
    const files = Array.isArray(check.files) ? check.files : [check.file || check.path].filter(Boolean);
    const counts = files.map((fileName) => ({
      file: fileName,
      lines: countFileLines(path.join(cwd, fileName)),
    }));
    const missing = counts.filter((entry) => entry.lines === null);
    const total = counts.reduce((sum, entry) => sum + (entry.lines || 0), 0);
    const maxLines = Number.isFinite(Number(check.maxLines)) ? Number(check.maxLines) : null;
    const maxTotalLines = Number.isFinite(Number(check.maxTotalLines)) ? Number(check.maxTotalLines) : maxLines;
    const ok = missing.length === 0 && (maxTotalLines === null || total <= maxTotalLines);
    return budgetValidationStep(
      check.label || 'line budget',
      ok,
      { total, maxTotalLines, counts, missing },
      check,
    );
  });
}

function sourceChurnForPathspecs(cwd, pathspecs = []) {
  const result = spawnSync('git', ['diff', '--numstat', '--', ...pathspecs], { cwd, encoding: 'utf8' });
  const totals = { insertions: 0, deletions: 0, untrackedInsertions: 0, churn: 0 };
  if (result.status === 0) {
    for (const line of String(result.stdout || '').split(/\r?\n/)) {
      const [addRaw, delRaw] = line.trim().split(/\s+/);
      const add = Number(addRaw);
      const del = Number(delRaw);
      if (Number.isFinite(add)) totals.insertions += add;
      if (Number.isFinite(del)) totals.deletions += del;
    }
  }
  for (const fileName of gitOutputLines(cwd, ['ls-files', '--others', '--exclude-standard', '--', ...pathspecs])) {
    const lines = countFileLines(path.join(cwd, fileName));
    if (lines !== null) totals.untrackedInsertions += lines;
  }
  totals.churn = totals.insertions + totals.deletions + totals.untrackedInsertions;
  return totals;
}

function runSourceChurnBudgetChecks(cwd, checks = []) {
  return checks.map((check) => {
    const pathspecs = Array.isArray(check.pathspecs) && check.pathspecs.length
      ? check.pathspecs
      : [check.path || check.file || 'backend/src/kloel'].filter(Boolean);
    const totals = sourceChurnForPathspecs(cwd, pathspecs);
    const maxChurn = Number.isFinite(Number(check.maxChurn)) ? Number(check.maxChurn) : null;
    const ok = maxChurn === null || totals.churn <= maxChurn;
    return budgetValidationStep(
      check.label || 'source churn budget',
      ok,
      { pathspecs, maxChurn, ...totals },
      check,
    );
  });
}

function gitOutputLines(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function deriveValidationScanFiles(cwd, options = {}) {
  if (Array.isArray(options.scanFiles) && options.scanFiles.length) {
    return [...new Set(options.scanFiles)].filter((fileName) => fs.existsSync(path.join(cwd, fileName)));
  }
  const pathspecs = Array.isArray(options.scanPathspecs) && options.scanPathspecs.length
    ? options.scanPathspecs
    : [];
  const separator = ['--'];
  const tracked = gitOutputLines(cwd, ['diff', '--name-only', ...separator, ...pathspecs]);
  const untracked = gitOutputLines(cwd, ['ls-files', '--others', '--exclude-standard', ...separator, ...pathspecs]);
  return [...new Set([...tracked, ...untracked])]
    .filter((fileName) => /\.[cm]?[jt]sx?$/.test(fileName))
    .filter((fileName) => !fileName.startsWith('.atomic/traces/'))
    .filter((fileName) => fs.existsSync(path.join(cwd, fileName)));
}


module.exports = {
  runValidationStep,
  syntheticValidationStep,
  isAdvisoryCheck,
  budgetValidationStep,
  countFileLines,
  runLineBudgetChecks,
  sourceChurnForPathspecs,
  runSourceChurnBudgetChecks,
  gitOutputLines,
  deriveValidationScanFiles,
};
