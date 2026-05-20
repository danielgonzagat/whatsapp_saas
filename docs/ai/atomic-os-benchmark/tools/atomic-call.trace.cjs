'use strict';

const fs = require('node:fs');
const path = require('node:path');
const REPO_ROOT = process.env.ATOMIC_OS_REPO_ROOT || path.resolve(__dirname, '..', '..', '..', '..');

function compactOperationResult(operation) {
  const summary = { tool: operation.tool };
  if (operation.selector) summary.selector = operation.selector;
  if (operation.importName) summary.importName = operation.importName;
  const output = operation.output;
  if (output && typeof output === 'object') {
    summary.ok = output.ok !== false;
    if (output.changed !== undefined) summary.changed = output.changed;
    if (output.skipped !== undefined) summary.skipped = output.skipped;
    if (output.reason) summary.reason = output.reason;
    if (output.tracePath) summary.tracePath = output.tracePath;
    if (output.operation) summary.operation = output.operation;
    return summary;
  }
  const text = String(output || '');
  summary.ok = !/\b(ERROR|failed|ok["']?\s*:\s*false)\b/i.test(text);
  const traceMatch = text.match(/Trace:\s*([^\s]+)/) || text.match(/["']tracePath["']\s*:\s*["']([^"']+)["']/);
  if (traceMatch) summary.tracePath = traceMatch[1];
  const changedMatch = text.match(/["']changed["']\s*:\s*(true|false)/);
  if (changedMatch) summary.changed = changedMatch[1] === 'true';
  return summary;
}

function tracePathFromOutput(rawOutput, output) {
  if (output && typeof output === 'object' && typeof output.tracePath === 'string') return output.tracePath;
  const text = String(rawOutput || output || '');
  const match = text.match(/Trace:\s*([^\s]+)/) || text.match(/["']tracePath["']\s*:\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

function worktreeRelativePath(absPath) {
  return path.relative(process.cwd(), absPath).split(path.sep).join('/');
}

function safeTraceAbsPath(tracePath) {
  if (typeof tracePath !== 'string' || !tracePath) return null;
  const absPath = path.isAbsolute(tracePath) ? tracePath : path.join(process.cwd(), tracePath);
  const cwdPrefix = process.cwd() + path.sep;
  if (absPath !== process.cwd() && !absPath.startsWith(cwdPrefix)) return null;
  return absPath;
}

function readTraceSummary(traceAbsPath) {
  if (!traceAbsPath || !fs.existsSync(traceAbsPath)) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(traceAbsPath, 'utf8'));
  } catch {
    return null;
  }
  return {
    tracePath: worktreeRelativePath(traceAbsPath),
    operationId: parsed.operationId || null,
    ts: parsed.ts || null,
    file: parsed.file || null,
    operation: parsed.operation || parsed.operator || null,
    changed: parsed.changed !== false,
    targetUnit: parsed.targetUnit || null,
  };
}

function updateMacroTraceManifest(traceSummary) {
  if (!traceSummary || !traceSummary.tracePath || traceSummary.changed === false) return null;
  const dir = path.join(process.cwd(), '.atomic', 'macro-traces');
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'active-worktree-task.json');
  let previous = { childTraces: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      previous = { childTraces: [] };
    }
  }
  const byTracePath = new Map((Array.isArray(previous.childTraces) ? previous.childTraces : [])
    .filter((trace) => trace && typeof trace.tracePath === 'string')
    .map((trace) => [trace.tracePath, trace]));
  byTracePath.set(traceSummary.tracePath, traceSummary);
  const childTraces = [...byTracePath.values()].sort((left, right) => String(left.tracePath).localeCompare(String(right.tracePath)));
  const productBatchUnits = [...new Set(childTraces.map((trace) => trace.file).filter(Boolean))].sort();
  const manifest = {
    traceVersion: '1.0',
    manifestKind: 'macro_trace_consolidation',
    worktree: process.cwd(),
    updatedAt: new Date().toISOString(),
    decisionAuthority: 'derived from child atomic traces and their target files in the current worktree; no fixed trace budget, file name, or method name is used',
    productBatchUnitCount: productBatchUnits.length,
    productBatchUnits,
    childTraceCount: childTraces.length,
    childTraces,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return worktreeRelativePath(manifestPath);
}

function recordMacroTraceFromOutput(rawOutput, output) {
  const tracePath = tracePathFromOutput(rawOutput, output);
  const traceAbsPath = safeTraceAbsPath(tracePath);
  const traceSummary = readTraceSummary(traceAbsPath);
  return updateMacroTraceManifest(traceSummary);
}

function compactPayload(payload) {
  return {
    ok: payload.ok,
    operation: payload.operation,
    idempotent: payload.idempotent || undefined,
    sourceFile: payload.sourceFile,
    targetFile: payload.targetFile,
    selectors: payload.selectors,
    functionNames: payload.functionNames,
    importModule: payload.importModule,
    validation: payload.validation,
    operationCount: Array.isArray(payload.operations) ? payload.operations.length : 0,
    operationSummary: Array.isArray(payload.operations) ? payload.operations.map(compactOperationResult) : [],
  };
}

function emitPayload(payload, options = {}) {
  const reportMode = options.report || options.reportMode || process.env.ATOMIC_CALL_REPORT || '';
  const printable = reportMode === 'compact' ? compactPayload(payload) : payload;
  console.log(JSON.stringify(printable, null, 2));
}

module.exports = {
  compactOperationResult,
  tracePathFromOutput,
  worktreeRelativePath,
  safeTraceAbsPath,
  readTraceSummary,
  updateMacroTraceManifest,
  recordMacroTraceFromOutput,
  compactPayload,
  emitPayload,
};
