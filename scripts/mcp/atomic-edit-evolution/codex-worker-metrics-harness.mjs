#!/usr/bin/env node
/**
 * codex-worker-metrics-harness.mjs — external truth adapter for Codex-worker
 * A/B rounds. It observes isolated workspaces against a shared baseline and
 * emits scoreable arms without relying on provider-specific JSONL telemetry.
 *
 * The harness is intentionally read-only: it never launches workers, executes
 * validations, or writes to workspaces. Validation exits and outputs must be
 * supplied as files produced by the orchestrator.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MODES, scoreRound } from './ab-round-harness.mjs';

const DEFAULT_EXCLUDES = Object.freeze(['node_modules', '.git', '.DS_Store']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function pathExists(file) {
  try {
    fs.accessSync(file, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeRoot(root) {
  if (!nonEmptyString(root)) return null;
  return path.resolve(root.trim());
}

function shouldExclude(relPath, excludeNames) {
  const parts = relPath.split(path.sep);
  return parts.some((part) => excludeNames.includes(part));
}

function walkFiles(root, options = {}) {
  const excludeNames = Array.isArray(options.excludeNames) ? options.excludeNames : DEFAULT_EXCLUDES;
  const out = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (shouldExclude(rel, excludeNames)) continue;
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }
  visit(root);
  return out.sort();
}

function lineDiffCounts(beforeText, afterText) {
  const before = beforeText.length === 0 ? [] : beforeText.split('\n');
  const after = afterText.length === 0 ? [] : afterText.split('\n');
  const dp = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const common = dp[0][0];
  return {
    insertions: after.length - common,
    deletions: before.length - common,
  };
}

function safeReadUtf8(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) return null;
  return buffer.toString('utf8');
}

function compareFile(baseFile, workspaceFile) {
  const beforeExists = pathExists(baseFile);
  const afterExists = pathExists(workspaceFile);
  if (!beforeExists && !afterExists) return null;
  if (beforeExists && afterExists) {
    const beforeHash = sha256File(baseFile);
    const afterHash = sha256File(workspaceFile);
    if (beforeHash === afterHash) return null;
    const beforeText = safeReadUtf8(baseFile);
    const afterText = safeReadUtf8(workspaceFile);
    const lineStats = beforeText !== null && afterText !== null
      ? lineDiffCounts(beforeText, afterText)
      : { insertions: fs.statSync(workspaceFile).size, deletions: fs.statSync(baseFile).size };
    return { status: 'M', beforeHash, afterHash, ...lineStats };
  }
  if (afterExists) {
    const afterText = safeReadUtf8(workspaceFile);
    const insertions = afterText !== null ? (afterText.length === 0 ? 0 : afterText.split('\n').length) : fs.statSync(workspaceFile).size;
    return { status: 'A', beforeHash: null, afterHash: sha256File(workspaceFile), insertions, deletions: 0 };
  }
  const beforeText = safeReadUtf8(baseFile);
  const deletions = beforeText !== null ? (beforeText.length === 0 ? 0 : beforeText.split('\n').length) : fs.statSync(baseFile).size;
  return { status: 'D', beforeHash: sha256File(baseFile), afterHash: null, insertions: 0, deletions };
}

function observeDiff(baselineRoot, workspaceRoot, options = {}) {
  const baselineFiles = walkFiles(baselineRoot, options);
  const workspaceFiles = walkFiles(workspaceRoot, options);
  const allRelPaths = [...new Set([...baselineFiles, ...workspaceFiles])].sort();
  const changed = [];
  for (const relPath of allRelPaths) {
    const result = compareFile(path.join(baselineRoot, relPath), path.join(workspaceRoot, relPath));
    if (result) changed.push({ path: relPath, ...result });
  }
  return {
    changedFiles: changed,
    diffStats: {
      files: changed.length,
      insertions: changed.reduce((sum, item) => sum + item.insertions, 0),
      deletions: changed.reduce((sum, item) => sum + item.deletions, 0),
    },
  };
}

function readExitCode(exitFile) {
  if (!nonEmptyString(exitFile)) return null;
  const text = fs.readFileSync(path.resolve(exitFile), 'utf8').trim();
  const code = Number.parseInt(text, 10);
  return Number.isFinite(code) ? code : null;
}

function fileHashOrNull(file) {
  if (!nonEmptyString(file)) return null;
  const resolved = path.resolve(file);
  return pathExists(resolved) ? sha256File(resolved) : null;
}

function observeValidation(validation = []) {
  if (!Array.isArray(validation)) return [];
  return validation.map((item) => {
    const exitCode = readExitCode(item.exitFile);
    return {
      command: String(item.command ?? ''),
      ok: exitCode === 0,
      exitCode,
      stdoutSha256: fileHashOrNull(item.stdoutFile ?? item.outputFile),
      stderrSha256: fileHashOrNull(item.stderrFile),
    };
  });
}

function scoreValidation(validation) {
  return validation.map((item) => ({ command: item.command, ok: item.ok }));
}

function observeArm(input, baselineRoot, roundStartedAtMs, roundFinishedAtMs) {
  const workspaceRoot = normalizeRoot(input.workspaceRoot);
  if (!workspaceRoot) return fail('arm.workspaceRoot must be a non-empty path');
  if (!Object.values(MODES).includes(input.mode)) return fail(`arm.mode must be ${Object.values(MODES).join(' or ')}`);
  const diff = observeDiff(baselineRoot, workspaceRoot, input.diffOptions ?? {});
  const validation = observeValidation(input.validation);
  const status = nonEmptyString(input.status)
    ? input.status
    : validation.length > 0 && validation.every((item) => item.ok) ? 'DONE' : 'FAILED';
  const traceRefs = Array.isArray(input.traceRefs) ? input.traceRefs.filter(nonEmptyString) : [];
  const tooling = {
    atomicEditOperations: finiteNumber(input.tooling?.atomicEditOperations) ? input.tooling.atomicEditOperations : traceRefs.length,
    forbiddenWrites: finiteNumber(input.tooling?.forbiddenWrites) ? input.tooling.forbiddenWrites : 0,
    shellWriteOperations: finiteNumber(input.tooling?.shellWriteOperations) ? input.tooling.shellWriteOperations : 0,
  };
  const arm = {
    armId: input.armId,
    mode: input.mode,
    status,
    startedAtMs: finiteNumber(input.startedAtMs) ? input.startedAtMs : roundStartedAtMs,
    finishedAtMs: finiteNumber(input.finishedAtMs) ? input.finishedAtMs : roundFinishedAtMs,
    workspaceRoot,
    changedFiles: diff.changedFiles.map((item) => item.path),
    diffStats: diff.diffStats,
    validation: scoreValidation(validation),
    tooling,
    metrics: isRecord(input.metrics) ? input.metrics : undefined,
  };
  return { ok: true, arm, observed: { ...arm, changedFileDetails: diff.changedFiles, validationDetails: validation, traceRefs } };
}

export function observeCodexWorkerRound(input) {
  if (!isRecord(input)) return fail('input must be a JSON object');
  for (const field of ['roundId', 'task', 'baselineRoot', 'baselineCommit']) {
    if (!nonEmptyString(input[field])) return fail(`${field} must be a non-empty string`);
  }
  if (!Array.isArray(input.arms) || input.arms.length !== 2) return fail('arms must contain exactly two worker arms');
  const baselineRoot = normalizeRoot(input.baselineRoot);
  if (!baselineRoot || !pathExists(baselineRoot)) return fail('baselineRoot must exist');
  const roundStartedAtMs = finiteNumber(input.roundStartedAtMs) ? input.roundStartedAtMs : 0;
  const roundFinishedAtMs = finiteNumber(input.roundFinishedAtMs) ? input.roundFinishedAtMs : roundStartedAtMs;
  const observedArms = [];
  for (const rawArm of input.arms) {
    const verdict = observeArm(rawArm, baselineRoot, roundStartedAtMs, roundFinishedAtMs);
    if (verdict.ok !== true) return verdict;
    observedArms.push(verdict.observed);
  }
  const round = {
    roundId: input.roundId,
    task: input.task,
    baselineCommit: input.baselineCommit,
    arms: observedArms.map(({ changedFileDetails, validationDetails, traceRefs, ...arm }) => arm),
  };
  const scoredRound = scoreRound(round);
  if (scoredRound.ok !== true) return fail(scoredRound.error ?? 'round scoring failed', { round });
  return {
    ok: true,
    round,
    observedArms,
    scoredRound,
    honestCeiling: 'Read-only external observation of isolated workspaces, supplied validation artifacts, and supplied trace refs. It does not launch or supervise Codex subagents and cannot recover provider token counts unless supplied in arm.metrics.',
  };
}

function parseJsonInput(stdinText) {
  try {
    return { ok: true, value: JSON.parse(stdinText || '{}') };
  } catch (error) {
    return { ok: false, error: `invalid JSON input: ${error.message}` };
  }
}

export function runCli(argv, stdinText) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--observe-codex-round')) {
    const parsed = parseJsonInput(stdinText);
    if (!parsed.ok) return parsed;
    return observeCodexWorkerRound(parsed.value);
  }
  return fail('usage: node codex-worker-metrics-harness.mjs --observe-codex-round < input.json');
}

function isCliMain() {
  return process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
}

if (isCliMain()) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const result = runCli(process.argv.slice(2), Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}
