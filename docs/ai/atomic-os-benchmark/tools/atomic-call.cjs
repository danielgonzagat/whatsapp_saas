#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('could not find atomic-edit repo root from ' + start);
    dir = parent;
  }
}

const REPO_ROOT = process.env.ATOMIC_OS_REPO_ROOT || findRepoRoot(__dirname);
const requireFromRepo = createRequire(path.join(REPO_ROOT, 'package.json'));
const { Client } = requireFromRepo('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireFromRepo('@modelcontextprotocol/sdk/client/stdio.js');

const PATH_KEYS = new Set(['file', 'dir', 'cwd', 'sourceFile', 'targetFile']);
const PATH_ARRAY_KEYS = new Set(['allowedPaths']);
const ARG_ALIASES = new Map([
  ['filePath', 'file'],
  ['action', 'op'],
]);

function usage(exitCode = 2) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write('Usage: atomic-call.cjs <tool-name|batch|validate_kloel_unified_agent|extract_symbol_to_file|extract_class_methods_to_file|replace_file_with_current_anchor> <json-arguments|json-operations-array>\n');
  process.exit(exitCode);
}

function parseCliJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (firstError) {
    const trimmed = String(raw || '').trim();
    if (/^[{[]/.test(trimmed) && trimmed.includes('\\\"')) {
      try {
        return JSON.parse(trimmed.replace(/\\"/g, '"'));
      } catch {
        // Preserve the original parse failure; it points at the user-supplied argument.
      }
    }
    throw firstError;
  }
}

function normalizePathValue(value, key) {
  if (typeof value !== 'string') return value;
  const cwd = process.cwd();
  const abs = path.isAbsolute(value) ? value : path.resolve(cwd, value);
  const cwdPrefix = `${cwd}${path.sep}`;
  if (abs !== cwd && !abs.startsWith(cwdPrefix)) {
    throw new Error(`refused: ${key} escapes current worktree: ${value}`);
  }
  return abs;
}

function normalizeToolAliases(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return;
  if (tool === 'code_read_symbol' && Object.prototype.hasOwnProperty.call(args, 'specifier') && !Object.prototype.hasOwnProperty.call(args, 'selector')) {
    args.selector = args.specifier;
    delete args.specifier;
  }
  if (tool === 'atomic_add_import') {
    if (Object.prototype.hasOwnProperty.call(args, 'specifier') && !Object.prototype.hasOwnProperty.call(args, 'module')) {
      args.module = args.specifier;
    }
    delete args.specifier;
    if (Object.prototype.hasOwnProperty.call(args, 'importName') && !Object.prototype.hasOwnProperty.call(args, 'name')) {
      args.name = args.importName;
    }
    delete args.importName;
  }
  if (tool === 'atomic_create_file') {
    delete args.expectedSha256;
  }
}

function normalizeWorktreeSafePaths(value, parentKey = '') {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach((item, index) => normalizeWorktreeSafePaths(item, `${parentKey}[${index}]`));
    return value;
  }
  for (const [alias, canonical] of ARG_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(value, alias) && !Object.prototype.hasOwnProperty.call(value, canonical)) {
      value[canonical] = value[alias];
    }
    delete value[alias];
  }
  for (const [key, child] of Object.entries(value)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    if (PATH_KEYS.has(key)) {
      value[key] = normalizePathValue(child, fullKey);
      continue;
    }
    if (PATH_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(child)) {
        throw new Error(`refused: ${fullKey} must be an array of paths`);
      }
      child.forEach((entry, index) => {
        child[index] = normalizePathValue(entry, `${fullKey}[${index}]`);
      });
      continue;
    }
    normalizeWorktreeSafePaths(child, fullKey);
  }
  return value;
}

function trimCommandOutput(value, max = 1200) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n...<trimmed>...\n${text.slice(-half)}`;
}

function optionalPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

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

function runKloelUnifiedAgentValidation(options = {}) {
  const cwd = process.cwd();
  const protectedPaths = [
    'AGENTS.md',
    'CLAUDE.md',
    'CODEX.md',
    'ops',
    'scripts/ops',
    '.github',
    'docs/codacy',
    'docs/design',
    '.codacy.yml',
    'package.json',
    '.husky/pre-push',
    'backend/eslint.config.mjs',
    'frontend/eslint.config.mjs',
    'worker/eslint.config.mjs',
    'scripts/pulse/no-hardcoded-reality-audit.ts',
  ];
  const forbiddenPattern = ['as an'+'y','@'+'ts-ignore','@'+'ts-expect-error','@'+'ts-nocheck','eslint-disable','biome-ignore','codacy:','NO'+'SONAR','no'+'qa'].join('|');
  const scanFiles = deriveValidationScanFiles(cwd, options);
  const backendEslintFiles = Array.isArray(options.eslintFiles) && options.eslintFiles.length
    ? options.eslintFiles
    : scanFiles
        .filter((fileName) => fileName.startsWith('backend/'))
        .map((fileName) => fileName.slice('backend/'.length));
  const unifiedAgentServiceFile = 'backend/src/kloel/unified-agent.service.ts';
  const enforceFinalServiceResidue =
    options.enforceFinalServiceResidue === true ||
    String(options.validationProfile || '').includes('seven-helper');
  const defaultForbiddenTextChecks =
    enforceFinalServiceResidue && fs.existsSync(path.join(cwd, unifiedAgentServiceFile))
      ? [
        {
          file: unifiedAgentServiceFile,
          text: 'toolRouterDeps',
          label: 'service no cached toolRouterDeps facade state',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'routerDeps',
          label: 'service no routerDeps facade accessor',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'get routerDeps',
          label: 'service no routerDeps getter',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'validateAbiPayload',
          label: 'service delegates cognitive ABI validation',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'forEachSequential(',
          label: 'service no inline forEachSequential tool loop',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'buildPredecidedActionDraft(',
          label: 'service no inline predecided draft',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'executePredecidedAgentActions',
          label: 'service no inline predecided executor',
        },
      ]
    : [];
  const forbiddenTextChecks = [
    ...defaultForbiddenTextChecks,
    ...(Array.isArray(options.forbiddenTextChecks) ? options.forbiddenTextChecks : []),
  ];
  const steps = [];
  if (options.includeJest !== false) {
    steps.push(runValidationStep('jest unified-agent', 'npx', ['jest', 'src/kloel/unified-agent.service.spec.ts', '--runInBand', '--silent'], {
      cwd: path.join(cwd, 'backend'),
    }));
  }
  const shouldRunFocusedEslint =
    options.includeEslint === true || enforceFinalServiceResidue;
  if (shouldRunFocusedEslint && backendEslintFiles.length > 0) {
    steps.push(runValidationStep('focused eslint', 'npx', ['eslint', ...backendEslintFiles, '--max-warnings', '0'], {
      cwd: path.join(cwd, 'backend'),
    }));
  }
  if (options.includeTypecheck !== false) {
    steps.push(runValidationStep('backend typecheck', 'npm', ['--prefix', 'backend', 'run', 'typecheck'], { cwd }));
  }
  steps.push(
    runValidationStep('diff check backend/src/kloel', 'git', ['diff', '--check', '--', 'backend/src/kloel'], { cwd }),
    runValidationStep('protected diff empty', 'git', ['diff', '--name-only', '--', ...protectedPaths], {
      cwd,
      okStatus: (status, result) => status === 0 && String(result.stdout || '').trim() === '',
    }),
    ...(scanFiles.length > 0
      ? [runValidationStep('forbidden suppression scan empty', 'rg', ['-n', forbiddenPattern, ...scanFiles], {
          cwd,
          okStatus: (status) => status === 1,
        })]
      : []),
  );
  for (const check of forbiddenTextChecks) {
    const fileName = check.file || check.path;
    const text = check.text;
    if (typeof fileName !== 'string' || typeof text !== 'string') {
      steps.push(syntheticValidationStep('forbidden text check malformed', false, 'forbiddenTextChecks require file/path and text'));
      continue;
    }
    const absFile = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
    const exists = fs.existsSync(absFile);
    const source = exists ? fs.readFileSync(absFile, 'utf8') : '';
    const ok = exists && !source.includes(text);
    steps.push(syntheticValidationStep(
      check.label || `forbidden text absent: ${fileName}`,
      ok,
      ok ? `absent: ${text}` : `found forbidden text ${JSON.stringify(text)} in ${fileName}`,
    ));
  }
  if (Array.isArray(options.requiredTextChecks)) {
    for (const check of options.requiredTextChecks) {
      const fileName = check.file || check.path;
      const text = check.text;
      if (typeof fileName !== 'string' || typeof text !== 'string') {
        steps.push(syntheticValidationStep('required text check malformed', false, 'requiredTextChecks require file/path and text'));
        continue;
      }
      const absFile = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
      const exists = fs.existsSync(absFile);
      const source = exists ? fs.readFileSync(absFile, 'utf8') : '';
      const ok = exists && source.includes(text);
      steps.push(syntheticValidationStep(
        check.label || `required text present: ${fileName}`,
        ok,
        ok ? `present: ${text}` : `missing required text ${JSON.stringify(text)} in ${fileName}`,
      ));
    }
  }
  if (Array.isArray(options.requiredRegexChecks)) {
    for (const check of options.requiredRegexChecks) {
      const fileName = check.file || check.path;
      const pattern = check.pattern || check.regex;
      if (typeof fileName !== 'string' || typeof pattern !== 'string') {
        steps.push(syntheticValidationStep('required regex check malformed', false, 'requiredRegexChecks require file/path and pattern'));
        continue;
      }
      const absFile = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
      const exists = fs.existsSync(absFile);
      const source = exists ? fs.readFileSync(absFile, 'utf8') : '';
      let regex;
      try {
        regex = new RegExp(pattern, check.flags || '');
      } catch (error) {
        steps.push(syntheticValidationStep(
          check.label || `required regex valid: ${fileName}`,
          false,
          `invalid required regex ${JSON.stringify(pattern)}: ${error.message}`,
        ));
        continue;
      }
      const ok = exists && regex.test(source);
      steps.push(syntheticValidationStep(
        check.label || `required regex present: ${fileName}`,
        ok,
        ok ? `present regex: ${pattern}` : `missing required regex ${JSON.stringify(pattern)} in ${fileName}`,
      ));
    }
  }
  if (Array.isArray(options.lineBudgetChecks)) {
    steps.push(...runLineBudgetChecks(cwd, options.lineBudgetChecks));
  }
  if (Array.isArray(options.sourceChurnBudgetChecks)) {
    steps.push(...runSourceChurnBudgetChecks(cwd, options.sourceChurnBudgetChecks));
  }
  return {
    ok: steps.every((step) => step.ok),
    profile: options.validationProfile || 'kloel-unified-agent-extract',
    scanFiles,
    steps,
  };
}


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

function fileHasNamedImport(file, importNames, importModule) {
  if (Array.isArray(importNames) && importNames.length === 0) return true;
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    if (match[2] !== importModule) continue;
    const importedNames = new Set(
      match[1]
        .split(',')
        .map((entry) => entry.trim().split(/\s+as\s+/i)[0].trim())
        .filter(Boolean),
    );
    if (importNames.every((name) => importedNames.has(name))) return true;
  }
  return false;
}

function escapeRegExp(value) {
  return String(value).replace(/[-\/\^$*+?.()|[\]{}]/g, '\\$&');
}

function parseToolArgs(tool, raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.startsWith('@')) {
    const file = normalizePathValue(trimmed.slice(1), 'argsFile');
    return parseCliJson(fs.readFileSync(file, 'utf8'));
  }
  try {
    return parseCliJson(raw);
  } catch (error) {
    if ((tool === 'code_outline' || tool === 'code_file_stat') && trimmed && !/^[{[]/.test(trimmed)) {
      return { file: trimmed };
    }
    throw error;
  }
}

function methodNameFromSelector(selector) {
  const parts = String(selector).split('.');
  return parts[parts.length - 1];
}

function classMethodSelectors(className, methodsOrSelectors) {
  if (!className) return methodsOrSelectors;
  return methodsOrSelectors.map((entry) => String(entry).includes('.') ? String(entry) : className + '.' + entry);
}

function decodeEscapedCodeText(value) {
  return String(value)
    .split('\\r\\n')
    .join('\n')
    .split('\\n')
    .join('\n')
    .split('\\t')
    .join('\t');
}

function replacementEscapesEnabled(scope = {}, replacement = {}) {
  if (replacement.preserveEscapedCodeText === true || scope.preserveEscapedCodeTextInReplacements === true) {
    return false;
  }
  return (
    replacement.decodeEscapedCodeText === true ||
    replacement.decodeEscapedNewlines === true ||
    scope.decodeEscapedCodeTextInReplacements === true ||
    scope.decodeEscapedNewlinesInReplacements === true
  );
}

function dependencyInlineObjectText(scope = {}, indent = '') {
  const container = scope.dependencyContainer || scope.depsContainer;
  const entries = dependencyContainerEntries(container);
  if (!entries.length) {
    throw new Error('dependencyInlineObject placeholder requires dependencyContainer entries');
  }
  const innerIndent = `${indent}  `;
  return [
    '{',
    ...entries.map(([key, value]) => `${innerIndent}${key}: ${value},`),
    `${indent}}`,
  ].join('\n');
}

function replacementText(scope, replacement) {
  const raw = replacement.newText ?? replacement.new;
  if (typeof raw !== 'string') return raw;
  const text = replacementEscapesEnabled(scope, replacement) ? decodeEscapedCodeText(raw) : raw;
  if (!text.includes('{{dependencyInlineObject}}')) return text;
  return text.split('{{dependencyInlineObject}}').join(
    dependencyInlineObjectText(scope, replacement.dependencyIndent || ''),
  );
}

function explicitThisAssignmentNames(replacements = []) {
  const names = new Set();
  if (!Array.isArray(replacements)) return names;
  for (const replacement of replacements) {
    const text = replacementText({}, replacement);
    if (typeof text !== 'string') continue;
    for (const match of text.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*this\.[A-Za-z_$][\w$]*\s*,?\s*$/gm)) {
      names.add(match[1]);
    }
  }
  return names;
}

function normalizeOptionalDepsForExplicitAssignments(header, replacements = []) {
  const assignedNames = explicitThisAssignmentNames(replacements);
  if (!assignedNames.size) return header;
  let normalized = String(header);
  for (const name of assignedNames) {
    const pattern = new RegExp('(\\n\\s*)' + escapeRegExp(name) + '\\?:\\s*([^;\\n]+);', 'g');
    normalized = normalized.replace(pattern, (match, prefix, typeText) => {
      const type = String(typeText).trim();
      if (/\bundefined\b/.test(type)) return prefix + name + ': ' + type + ';';
      return prefix + name + ': ' + type + ' | undefined;';
    });
  }
  return normalized;
}

function dependencyContainerEntries(container) {
  const entries = container && container.entries;
  if (Array.isArray(entries)) {
    return entries.map((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) return [String(entry[0]), String(entry[1])];
      if (entry && typeof entry === 'object') return [String(entry.name || entry.key), String(entry.value)];
      return ['', ''];
    }).filter(([key, value]) => key && value && key !== 'undefined' && value !== 'undefined');
  }
  if (entries && typeof entries === 'object') {
    return Object.entries(entries).map(([key, value]) => [key, String(value)]);
  }
  return [];
}

function buildDependencyGetterReplacement(container) {
  const name = container && container.name;
  const typeName = container && container.typeName;
  const marker = container && (container.insertBeforeClassEndMarker || container.oldText);
  const entries = dependencyContainerEntries(container);
  if (typeof name !== 'string' || !name || typeof typeName !== 'string' || !typeName || typeof marker !== 'string' || !marker || !entries.length) {
    throw new Error('dependencyContainer getter requires name, typeName, entries and insertBeforeClassEndMarker/oldText');
  }
  const getter = [
    `  private get ${name}(): ${typeName} {`,
    '    return {',
    ...entries.map(([key, value]) => `      ${key}: ${value},`),
    '    };',
    '  }',
  ].join('\n');
  const firstMarkerLine = marker.split('\n').find((line) => line.trim());
  return {
    anchorText: container.anchorText || firstMarkerLine || marker,
    newTextPrefix: `${getter}\n\n`,
    expectedCount: container.expectedCount ?? 1,
  };
}

function dependencyContainerPropertyAnchors(container) {
  const declarationAnchor = container.declarationInsertAfter || container.propertyDeclarationAfter || container.declarationAfter;
  const assignmentAnchor = container.constructorAssignmentInsertAfter || container.assignmentInsertAfter || container.constructorAssignmentAfter;
  return { declarationAnchor, assignmentAnchor };
}

function buildDependencyConstructorPropertyReplacements(container) {
  const name = container && container.name;
  const typeName = container && container.typeName;
  const entries = dependencyContainerEntries(container);
  const { declarationAnchor, assignmentAnchor } = dependencyContainerPropertyAnchors(container || {});
  if (typeof name !== 'string' || !name || typeof typeName !== 'string' || !typeName || !entries.length) {
    throw new Error('dependencyContainer constructorProperty requires name, typeName and entries');
  }
  if (typeof declarationAnchor !== 'string' || !declarationAnchor || typeof assignmentAnchor !== 'string' || !assignmentAnchor) {
    throw new Error('dependencyContainer constructorProperty requires declarationInsertAfter and constructorAssignmentInsertAfter');
  }
  const declaration = `  private readonly ${name}: ${typeName};`;
  const assignment = [
    `    this.${name} = {`,
    ...entries.map(([key, value]) => `      ${key}: ${value},`),
    '    };',
  ].join('\n');
  return [
    {
      oldText: declarationAnchor,
      newText: `${declarationAnchor}\n${declaration}`,
      expectedCount: container.declarationExpectedCount ?? container.expectedCount ?? 1,
    },
    {
      oldText: assignmentAnchor,
      newText: `${assignmentAnchor}\n\n${assignment}`,
      expectedCount: container.assignmentExpectedCount ?? container.expectedCount ?? 1,
    },
  ];
}

function resolveAnchoredTailReplacement(file, replacement, scope) {
  if (typeof replacement.anchorText !== 'string' || typeof replacement.newTextPrefix !== 'string') {
    return {
      oldText: replacement.oldText,
      newText: replacementText(scope, replacement),
    };
  }
  const source = fs.readFileSync(file, 'utf8');
  const index = source.lastIndexOf(replacement.anchorText);
  if (index === -1) {
    throw new Error('anchored replacement marker not found: ' + replacement.anchorText);
  }
  const oldText = source.slice(index);
  return {
    oldText,
    newText: replacement.newTextPrefix + oldText,
  };
}

function buildGeneratedPostRemovalReplacements(args = {}) {
  const container = args.dependencyContainer || args.depsContainer;
  if (!container || typeof container !== 'object') return [];
  const style = container.style || 'getter';
  if (style === 'getter') {
    return [buildDependencyGetterReplacement(container)];
  }
  if (style === 'constructorProperty' || style === 'constructor-property' || style === 'property') {
    return buildDependencyConstructorPropertyReplacements(container);
  }
  if (style === 'inlineObject' || style === 'inline-object' || style === 'inline') {
    return [];
  }
  throw new Error('dependencyContainer supports style=getter, style=constructorProperty or style=inlineObject');
}

function normalizeMethodBodyReplacements(adapter = {}) {
  const replacements = adapter.bodyReplacements || adapter.replacements || [];
  if (Array.isArray(replacements)) {
    return replacements
      .map((entry) => ({ oldText: entry.oldText ?? entry.old, newText: replacementText(adapter, entry) }))
      .filter((entry) => typeof entry.oldText === 'string' && typeof entry.newText === 'string');
  }
  if (replacements && typeof replacements === 'object') {
    return Object.entries(replacements).map(([oldText, newText]) => ({
      oldText,
      newText: replacementText(adapter, { newText: String(newText) }),
    }));
  }
  return [];
}

function methodExtractionAdapter(args, name, selector) {
  const adapters = args && args.methodAdapters && typeof args.methodAdapters === 'object'
    ? args.methodAdapters
    : {};
  return adapters[name] || adapters[selector] || args.methodAdapter || {};
}

function classMethodToExportedFunction(methodCode, expectedName, adapter = {}) {
  let code = String(methodCode || '').trimEnd();
  code = code.replace(/^(?:private|public|protected)\s+/, '');
  code = code.replace(/^async\s+([A-Za-z_$][\w$]*)\s*\(/, 'export async function $1(');
  code = code.replace(/^([A-Za-z_$][\w$]*)\s*\(/, 'export function $1(');
  const namePattern = new RegExp('^export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(expectedName) + '\\s*\\(');
  if (!namePattern.test(code)) {
    throw new Error('could not convert class method ' + expectedName + ' to exported function');
  }
  code = code
    .split('\n')
    .map((line, index) => (index === 0 ? line : line.startsWith('  ') ? line.slice(2) : line))
    .join('\n');
  if (adapter.signaturePrefixParam) {
    const signaturePattern = new RegExp('^(export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(expectedName) + '\\s*\\()');
    code = code.replace(signaturePattern, '$1' + adapter.signaturePrefixParam);
  }
  for (const replacement of normalizeMethodBodyReplacements(adapter)) {
    code = code.split(replacement.oldText).join(replacement.newText);
  }
  return code;
}

function fileHasExportedFunctions(file, names) {
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  return names.every((name) => new RegExp('export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(name) + '\\s*\\(').test(source));
}

function fileContainsNone(file, texts) {
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  return texts.every((text) => !source.includes(text));
}

function repoRelativeFromCwd(file, cwd) {
  const absFile = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  const absCwd = path.isAbsolute(cwd) ? cwd : path.resolve(process.cwd(), cwd);
  return path.relative(absCwd, absFile).split(path.sep).join('/');
}

function normalizeLintFixArgs(args, sourceFile, targetFile) {
  const enabled = args.formatWithEslint === true || args.lintFix === true || args.autoFixLint === true;
  if (!enabled) return null;
  const cwd = typeof args.eslintCwd === 'string' ? args.eslintCwd : 'backend';
  const formatOnly = args.formatWithEslint === true && args.lintFix !== true && args.autoFixLint !== true;
  const defaultEslintArgs = [
    repoRelativeFromCwd(sourceFile, cwd),
    repoRelativeFromCwd(targetFile, cwd),
    '--fix-dry-run',
    ...(formatOnly ? ['--fix-type', 'layout'] : []),
    '--format',
    'json',
  ];
  const eslintArgs = Array.isArray(args.eslintArgs) && args.eslintArgs.length
    ? args.eslintArgs
    : defaultEslintArgs;
  const allowedPaths = Array.isArray(args.lintAllowedPaths) && args.lintAllowedPaths.length
    ? args.lintAllowedPaths
    : [sourceFile, targetFile];
  return { cwd, args: eslintArgs, allowedPaths, applyKnownResidueFixes: false };
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  for (;;) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

async function main() {
  const tool = process.argv[2];
  const rawArgs = process.argv[3];
  if (tool === '--help' || tool === '-h') usage(0);
  if (!tool || !rawArgs) usage();

  const client = new Client({ name: 'codex-atomic-worktree-safe-call', version: '1.1.0' });
  const transport = new StdioClientTransport({
    command: 'bash',
    args: [path.join(REPO_ROOT, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh')],
  });

  await client.connect(transport);
  try {
    const callAtomicToolOnce = async (operationTool, operationArgs, label = operationTool) => {
      const result = await client.callTool({ name: operationTool, arguments: operationArgs });
      const rawOutput = result.content?.map((part) => part.text || '').join('\n') || '';
      if (result.isError || /\bMCP error\b/i.test(rawOutput)) {
        if (rawOutput) console.error(rawOutput);
        throw new Error(`${label} failed`);
      }
      let output = rawOutput;
      try {
        output = JSON.parse(rawOutput);
      } catch {
        // Keep non-JSON tool output intact.
      }
      const macroTracePath = recordMacroTraceFromOutput(rawOutput, output);
      return { rawOutput, output, macroTracePath };
    };
    const callAtomicTool = async (operationTool, operationArgs, label = operationTool) => {
      if (operationTool !== 'atomic_replace_text' || !Object.prototype.hasOwnProperty.call(operationArgs || {}, 'expectedCount')) {
        return callAtomicToolOnce(operationTool, operationArgs, label);
      }
      const { expectedCount, ...singleArgs } = operationArgs;
      const count = Number(expectedCount);
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`${label} expectedCount must be a non-negative integer`);
      }
      if (Object.prototype.hasOwnProperty.call(singleArgs, 'occurrence') && count !== 1) {
        throw new Error(`${label} cannot combine occurrence with expectedCount ${count}`);
      }
      if (count === 0) {
        return {
          rawOutput: JSON.stringify({ ok: true, skipped: true, reason: 'expectedCount 0' }),
          output: { ok: true, skipped: true, reason: 'expectedCount 0' },
          macroTracePath: null,
        };
      }
      if (typeof singleArgs.file !== 'string' || typeof singleArgs.oldText !== 'string') {
        throw new Error(`${label} expectedCount requires file and oldText`);
      }
      const observed = countOccurrences(fs.readFileSync(singleArgs.file, 'utf8'), singleArgs.oldText);
      if (observed !== count) {
        throw new Error(`${label} expected ${count} occurrence(s), observed ${observed}`);
      }
      if (count === 1) {
        return callAtomicToolOnce(operationTool, singleArgs, label);
      }
      if (Object.prototype.hasOwnProperty.call(singleArgs, 'expectedSha256')) {
        throw new Error(`${label} cannot use expectedSha256 with expectedCount > 1; use one guarded operation per occurrence`);
      }
      const operations = [];
      for (let index = 0; index < count; index += 1) {
        const step = await callAtomicToolOnce(
          operationTool,
          { ...singleArgs, occurrence: 1 },
          `${label} occurrence ${index + 1}/${count}`,
        );
        operations.push({
          index,
          output: step.output,
          macroTracePath: step.macroTracePath,
        });
      }
      const output = {
        ok: operations.every((operation) => operation.output?.ok !== false),
        operation: operationTool,
        expectedCount: count,
        operations,
      };
      return { rawOutput: JSON.stringify(output, null, 2), output, macroTracePath: null };
    };

    if (tool === 'validate_kloel_unified_agent') {
      const args = parseToolArgs(tool, rawArgs);
      const validation = runKloelUnifiedAgentValidation(args);
      emitPayload({
        ok: validation.ok,
        operation: 'validate_kloel_unified_agent',
        validation,
      }, args);
      if (!validation.ok) {
        throw new Error('validate_kloel_unified_agent failed');
      }
      return;
    }

    if (tool === 'extract_class_methods_to_file') {
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      const sourceFile = args.sourceFile || args.file;
      const targetFile = args.targetFile;
      const methodInputs = args.methods || args.selectors || args.symbols;
      const selectors = Array.isArray(methodInputs) ? classMethodSelectors(args.className, methodInputs) : [];
      const functionNames = args.functionNames || args.importNames || selectors.map(methodNameFromSelector);
      const sourceImportNames =
        args.sourceImportNames || args.serviceImportNames || args.callsiteImportNames || functionNames;
      const importModule = args.importModule || args.module;
      if (!sourceFile || !targetFile || !selectors.length || !Array.isArray(functionNames) || functionNames.length !== selectors.length || !importModule) {
        throw new Error('extract_class_methods_to_file requires sourceFile/file, targetFile, className+methods[] or selectors[], functionNames/importNames[] and importModule/module');
      }
      if (!Array.isArray(sourceImportNames)) {
        throw new Error('extract_class_methods_to_file sourceImportNames/serviceImportNames must be an array when provided');
      }
      const reads = [];
      const sourceReadFailures = [];
      for (const [index, selector] of selectors.entries()) {
        try {
          const read = await callAtomicTool(
            'code_read_symbol',
            { file: sourceFile, selector },
            'extract_class_methods_to_file read ' + selector,
          );
          if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
            throw new Error('extract_class_methods_to_file could not read method ' + selector);
          }
          reads.push({ selector, name: functionNames[index], read });
        } catch (error) {
          sourceReadFailures.push({ selector, error: error.message });
        }
      }
      if (sourceReadFailures.length) {
        const oldCallTexts = functionNames.map((name) => 'this.' + name + '(');
        const targetHasAllFunctions = fileHasExportedFunctions(targetFile, functionNames);
        const sourceAlreadyImports = fileHasNamedImport(sourceFile, sourceImportNames, importModule);
        const sourceCallsitesConverted = fileContainsNone(sourceFile, oldCallTexts);
        if (sourceReadFailures.length === selectors.length && targetHasAllFunctions && sourceAlreadyImports && sourceCallsitesConverted) {
          const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
          const payload = {
            ok: !validation || validation.ok,
            operation: 'extract_class_methods_to_file',
            idempotent: true,
            sourceFile,
            targetFile,
            selectors,
            functionNames,
            sourceImportNames,
            importModule,
            validation,
            operations: [
              { tool: 'idempotent_state_check', output: { sourceReadFailures, targetHasAllFunctions, sourceAlreadyImports, sourceCallsitesConverted } },
            ],
          };
          emitPayload(payload, args);
          if (validation && !validation.ok) {
            throw new Error('extract_class_methods_to_file validation failed');
          }
          return;
        }
        throw new Error('extract_class_methods_to_file source read failed before a complete idempotent state: ' + sourceReadFailures.map((failure) => failure.selector + ': ' + failure.error).join('; '));
      }
      const postRemovalReplacements = [
        ...buildGeneratedPostRemovalReplacements(args),
        ...(Array.isArray(args.postRemovalReplacements) ? args.postRemovalReplacements : []),
      ];
      const targetHeader = typeof args.targetHeader === 'string' && args.targetHeader.trim()
        ? normalizeOptionalDepsForExplicitAssignments(args.targetHeader, postRemovalReplacements).trimEnd() + '\n\n'
        : '';
      const content = targetHeader + reads
        .map(({ selector, name, read }) => classMethodToExportedFunction(
          read.output.code,
          name,
          methodExtractionAdapter(args, name, selector),
        ))
        .join('\n\n') + '\n';
      let create = null;
      if (fs.existsSync(targetFile)) {
        if (!fileHasExportedFunctions(targetFile, functionNames)) {
          throw new Error('extract_class_methods_to_file target file exists but does not contain all requested functions');
        }
        create = { output: { skipped: true, reason: 'target already contains requested functions' } };
      } else {
        create = await callAtomicTool(
          'atomic_create_file',
          { file: targetFile, content },
          'extract_class_methods_to_file create ' + targetFile,
        );
      }
      const importOps = [];
      for (const importName of sourceImportNames) {
        importOps.push(await callAtomicTool(
          'atomic_add_import',
          { file: sourceFile, name: importName, module: importModule },
          'extract_class_methods_to_file import ' + importName,
        ));
      }
      const replacements = Array.isArray(args.callsiteReplacements) && args.callsiteReplacements.length
        ? args.callsiteReplacements
        : functionNames.map((name) => ({ oldText: 'this.' + name + '(', newText: name + '(' }));
      const replacementOps = [];
      const sourceBeforeReplacements = fs.readFileSync(sourceFile, 'utf8');
      for (const replacement of replacements) {
        const oldText = replacement.oldText;
        const newText = replacementText(args, replacement);
        if (!oldText || typeof newText !== 'string') {
          throw new Error('extract_class_methods_to_file callsite replacement requires oldText and newText');
        }
        const expectedCount = replacement.expectedCount ?? countOccurrences(sourceBeforeReplacements, oldText);
        if (expectedCount > 0) {
          for (let occurrenceIndex = 0; occurrenceIndex < expectedCount; occurrenceIndex += 1) {
            replacementOps.push(await callAtomicTool(
              'atomic_replace_text',
              { file: sourceFile, oldText, newText, occurrence: 1 },
              'extract_class_methods_to_file replace callsite ' + oldText,
            ));
          }
        } else {
          replacementOps.push({ output: { skipped: true, oldText, reason: 'already converted or absent' } });
        }
      }
      const removeOps = [];
      for (const selector of selectors) {
        removeOps.push(await callAtomicTool(
          'atomic_edit_symbol',
          { file: sourceFile, selector, op: 'remove' },
          'extract_class_methods_to_file remove ' + selector,
        ));
      }
      const postRemovalReplacementOps = [];
      if (postRemovalReplacements.length) {
        for (const replacement of postRemovalReplacements) {
          const { oldText, newText } = resolveAnchoredTailReplacement(sourceFile, replacement, args);
          if (!oldText || typeof newText !== 'string') {
            throw new Error('extract_class_methods_to_file postRemovalReplacements require oldText/newText or anchorText/newTextPrefix');
          }
          const expectedCount = replacement.expectedCount ?? countOccurrences(fs.readFileSync(sourceFile, 'utf8'), oldText);
          if (expectedCount > 0) {
            postRemovalReplacementOps.push(await callAtomicTool(
              'atomic_replace_text',
              { file: sourceFile, oldText, newText, expectedCount },
              'extract_class_methods_to_file post-removal replacement ' + oldText,
            ));
          } else {
            postRemovalReplacementOps.push({ output: { skipped: true, oldText, reason: 'already converted or absent' } });
          }
        }
      }
      const compactOps = [];
      const gapPatterns = [
        ['\n\n\n  private async ', '\n\n  private async '],
        ['\n\n\n  private ', '\n\n  private '],
        ['\n\n\n  async ', '\n\n  async '],
        ['\n\n\n\n}', '\n\n}'],
        ['\n\n\n}', '\n\n}'],
      ];
      for (const [oldText, newText] of gapPatterns) {
        const expectedCount = countOccurrences(fs.readFileSync(sourceFile, 'utf8'), oldText);
        if (expectedCount === 0) {
          compactOps.push({ output: { skipped: true, oldText, reason: 'gap absent' } });
          continue;
        }
        compactOps.push(await callAtomicTool(
          'atomic_replace_text',
          { file: sourceFile, oldText, newText, expectedCount },
          'extract_class_methods_to_file compact gap',
        ));
      }
      const lintFixArgs = normalizeLintFixArgs(args, sourceFile, targetFile);
      const lintFix = lintFixArgs
        ? await callAtomicTool(
            'atomic_apply_eslint_dry_run_fixes',
            lintFixArgs,
            'extract_class_methods_to_file lint fix',
          )
        : null;
      const postLintReplacementOps = [];
      if (Array.isArray(args.postLintReplacements)) {
        for (const replacement of args.postLintReplacements) {
          const replacementFile = replacement.file || sourceFile;
          const oldText = replacement.oldText;
          const newText = replacementText(args, replacement);
          if (!oldText || typeof newText !== 'string') {
            throw new Error('extract_class_methods_to_file postLintReplacements require oldText and newText');
          }
          const expectedCount = replacement.expectedCount ?? countOccurrences(fs.readFileSync(replacementFile, 'utf8'), oldText);
          if (expectedCount > 0) {
            postLintReplacementOps.push(await callAtomicTool(
              'atomic_replace_text',
              { file: replacementFile, oldText, newText, expectedCount },
              'extract_class_methods_to_file post-lint replacement ' + oldText,
            ));
          } else {
            postLintReplacementOps.push({ output: { skipped: true, oldText, reason: 'already converted or absent' } });
          }
        }
      }
      const postLintFix = postLintReplacementOps.length && lintFixArgs
        ? await callAtomicTool(
            'atomic_apply_eslint_dry_run_fixes',
            lintFixArgs,
            'extract_class_methods_to_file post-lint fix',
          )
        : null;
      const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
      const payload = {
        ok: !validation || validation.ok,
        operation: 'extract_class_methods_to_file',
        sourceFile,
        targetFile,
        selectors,
        functionNames,
        sourceImportNames,
        importModule,
        validation,
        operations: [
          ...reads.map(({ selector, read }) => ({ tool: 'code_read_symbol', selector, output: read.output })),
          { tool: 'atomic_create_file', output: create.output },
          ...importOps.map((op, index) => ({ tool: 'atomic_add_import', importName: sourceImportNames[index], output: op.output })),
          ...replacementOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...removeOps.map((op, index) => ({ tool: 'atomic_edit_symbol', selector: selectors[index], output: op.output })),
          ...postRemovalReplacementOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...compactOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...(lintFix ? [{ tool: 'atomic_apply_eslint_dry_run_fixes', output: lintFix.output }] : []),
          ...postLintReplacementOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...(postLintFix ? [{ tool: 'atomic_apply_eslint_dry_run_fixes', output: postLintFix.output }] : []),
        ],
      };
      emitPayload(payload, args);
      if (validation && !validation.ok) {
        throw new Error('extract_class_methods_to_file validation failed');
      }
      return;
    }

    if (tool === 'extract_symbols_to_file') {
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      const sourceFile = args.sourceFile || args.file;
      const targetFile = args.targetFile;
      const selectors = args.selectors || args.symbols;
      const importNames = args.importNames || selectors;
      const importModule = args.importModule || args.module;
      if (!sourceFile || !targetFile || !Array.isArray(selectors) || !selectors.length || !Array.isArray(importNames) || importNames.length !== selectors.length || !importModule) {
        throw new Error('extract_symbols_to_file requires sourceFile/file, targetFile, selectors/symbols[], importNames[] and importModule/module');
      }
      const reads = [];
      const sourceReadFailures = [];
      for (const selector of selectors) {
        try {
          const read = await callAtomicTool(
            'code_read_symbol',
            { file: sourceFile, selector },
            `extract_symbols_to_file read ${selector}`,
          );
          if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
            throw new Error(`extract_symbols_to_file could not read symbol ${selector}`);
          }
          reads.push({ selector, read });
        } catch (error) {
          sourceReadFailures.push({ selector, error: error.message });
        }
      }
      if (sourceReadFailures.length) {
        const targetReads = [];
        let targetHasAllSymbols = fs.existsSync(targetFile);
        if (targetHasAllSymbols) {
          for (const selector of selectors) {
            try {
              const read = await callAtomicTool(
                'code_read_symbol',
                { file: targetFile, selector },
                `extract_symbols_to_file idempotent read ${selector}`,
              );
              if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
                throw new Error(`extract_symbols_to_file could not read target symbol ${selector}`);
              }
              targetReads.push({ selector, read });
            } catch (error) {
              targetHasAllSymbols = false;
              targetReads.push({ selector, error: error.message });
              break;
            }
          }
        }
        const sourceAlreadyImports = fileHasNamedImport(sourceFile, importNames, importModule);
        if (sourceReadFailures.length === selectors.length && targetHasAllSymbols && sourceAlreadyImports) {
          const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
          const payload = {
            ok: !validation || validation.ok,
            operation: 'extract_symbols_to_file',
            idempotent: true,
            sourceFile,
            targetFile,
            selectors,
            importNames,
            importModule,
            validation,
            operations: [
              ...targetReads.map(({ selector, read }) => ({ tool: 'code_read_symbol', file: targetFile, selector, output: read.output })),
              { tool: 'idempotent_state_check', output: { sourceReadFailures, sourceAlreadyImports } },
            ],
          };
          emitPayload(payload, args);
          if (validation && !validation.ok) {
            throw new Error('extract_symbols_to_file validation failed');
          }
          return;
        }
        throw new Error(`extract_symbols_to_file source read failed before a complete idempotent state: ${sourceReadFailures.map((failure) => failure.selector + ': ' + failure.error).join('; ')}`);
      }
      const existingTarget = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';
      const symbolsToWrite = reads.filter((entry, index) => {
        const importName = importNames[index];
        if (!existingTarget) return true;
        return !new RegExp('export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(importName) + '\\s*\\(').test(existingTarget);
      });
      const content = `${symbolsToWrite
        .map(({ read }) => {
          const symbolCode = read.output.code;
          return /^export\s/.test(symbolCode) ? symbolCode : `export ${symbolCode}`;
        })
        .join('\n\n')}\n`;
      let create = null;
      if (!existingTarget) {
        create = await callAtomicTool(
          'atomic_create_file',
          { file: targetFile, content },
          `extract_symbols_to_file create ${targetFile}`,
        );
      } else if (symbolsToWrite.length > 0) {
        const targetLines = existingTarget.split('\n');
        create = await callAtomicTool(
          'atomic_insert_at',
          {
            file: targetFile,
            line: targetLines.length,
            column: targetLines[targetLines.length - 1].length + 1,
            text: (existingTarget.endsWith('\n') ? '\n' : '\n\n') + content,
          },
          `extract_symbols_to_file append ${targetFile}`,
        );
      } else {
        create = { output: { skipped: true, reason: 'target already contains requested symbols' } };
      }
      const importOps = [];
      for (const importName of importNames) {
        importOps.push(await callAtomicTool(
          'atomic_add_import',
          { file: sourceFile, name: importName, module: importModule },
          `extract_symbols_to_file import ${importName}`,
        ));
      }
      const removeOps = [];
      for (const selector of selectors) {
        removeOps.push(await callAtomicTool(
          'atomic_edit_symbol',
          { file: sourceFile, selector, op: 'remove' },
          `extract_symbols_to_file remove ${selector}`,
        ));
      }
      let compactGap = null;
      try {
        compactGap = await callAtomicTool(
          'atomic_replace_text',
          { file: sourceFile, oldText: '\n\n\n/**', newText: '\n\n/**', expectedCount: 1 },
          'extract_symbols_to_file compact doc gap',
        );
      } catch (error) {
        compactGap = { skipped: true, reason: error.message };
      }
      let compactConstGap = null;
      try {
        compactConstGap = await callAtomicTool(
          'atomic_replace_text',
          { file: sourceFile, oldText: '\n\n\nconst ', newText: '\n\nconst ', expectedCount: 1 },
          'extract_symbols_to_file compact const gap',
        );
      } catch (error) {
        compactConstGap = { skipped: true, reason: error.message };
      }
      const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
      const payload = {
        ok: !validation || validation.ok,
        operation: 'extract_symbols_to_file',
        sourceFile,
        targetFile,
        selectors,
        importNames,
        importModule,
        validation,
        operations: [
          ...reads.map(({ selector, read }) => ({ tool: 'code_read_symbol', selector, output: read.output })),
          { tool: create.output?.skipped ? 'target_state_check' : (existingTarget ? 'atomic_insert_at' : 'atomic_create_file'), output: create.output },
          ...importOps.map((op, index) => ({ tool: 'atomic_add_import', importName: importNames[index], output: op.output })),
          ...removeOps.map((op, index) => ({ tool: 'atomic_edit_symbol', selector: selectors[index], output: op.output })),
          { tool: 'atomic_replace_text', output: compactGap.output || compactGap },
          { tool: 'atomic_replace_text', output: compactConstGap.output || compactConstGap },
        ],
      };
      emitPayload(payload, args);
      if (validation && !validation.ok) {
        throw new Error('extract_symbols_to_file validation failed');
      }
      return;
    }
    if (tool === 'extract_symbol_to_file') {
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      const sourceFile = args.sourceFile || args.file;
      const targetFile = args.targetFile;
      const selector = args.selector;
      const importName = args.importName || selector;
      const importModule = args.importModule || args.module;
      if (!sourceFile || !targetFile || !selector || !importName || !importModule) {
        throw new Error('extract_symbol_to_file requires sourceFile/file, targetFile, selector, importName, and importModule/module');
      }
      const read = await callAtomicTool(
        'code_read_symbol',
        { file: sourceFile, selector },
        `extract_symbol_to_file read ${selector}`,
      );
      if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
        throw new Error(`extract_symbol_to_file could not read symbol ${selector}`);
      }
      const symbolCode = read.output.code;
      const exportedCode = /^export\s/.test(symbolCode) ? symbolCode : `export ${symbolCode}`;
      const content = exportedCode.endsWith('\n') ? exportedCode : `${exportedCode}\n`;
      const create = await callAtomicTool(
        'atomic_create_file',
        { file: targetFile, content },
        `extract_symbol_to_file create ${targetFile}`,
      );
      const addImport = await callAtomicTool(
        'atomic_add_import',
        { file: sourceFile, name: importName, module: importModule },
        `extract_symbol_to_file import ${importName}`,
      );
      const remove = await callAtomicTool(
        'atomic_edit_symbol',
        { file: sourceFile, selector, op: 'remove' },
        `extract_symbol_to_file remove ${selector}`,
      );
      const compactGap = await callAtomicTool(
        'atomic_replace_text',
        { file: sourceFile, oldText: '\n\n\n/**', newText: '\n\n/**', expectedCount: 1 },
        `extract_symbol_to_file compact gap after ${selector}`,
      );
      const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
      const payload = {
        ok: !validation || validation.ok,
        operation: 'extract_symbol_to_file',
        sourceFile,
        targetFile,
        selector,
        importName,
        importModule,
        validation,
        operations: [
          { tool: 'code_read_symbol', output: read.output },
          { tool: 'atomic_create_file', output: create.output },
          { tool: 'atomic_add_import', output: addImport.output },
          { tool: 'atomic_edit_symbol', output: remove.output },
          { tool: 'atomic_replace_text', output: compactGap.output },
        ],
      };
      emitPayload(payload, args);
      if (validation && !validation.ok) {
        throw new Error('extract_symbol_to_file validation failed');
      }
      return;
    }

    if (tool === 'batch') {
      const operations = parseToolArgs(tool, rawArgs);
      if (!Array.isArray(operations)) throw new Error('batch expects a JSON array');
      const outputs = [];
      for (const [index, operation] of operations.entries()) {
        const operationTool = operation?.tool;
        const operationArgs = operation?.args ?? {};
        if (!operationTool || typeof operationTool !== 'string') throw new Error(`batch operation ${index} is missing tool`);
        if (!operationArgs || typeof operationArgs !== 'object' || Array.isArray(operationArgs)) throw new Error(`batch operation ${index} args must be an object`);
        normalizeToolAliases(operationTool, operationArgs);
        normalizeWorktreeSafePaths(operationArgs);
        const result = await callAtomicTool(operationTool, operationArgs, `atomic batch operation ${index} (${operationTool})`);
        const parsedOutput = result.output;
        const macroTracePath = result.macroTracePath;
        outputs.push({ index, tool: operationTool, output: parsedOutput, macroTracePath });
      }
      console.log(JSON.stringify({ ok: true, operations: outputs }, null, 2));
      return;
    }

    if (tool === 'replace_file_with_current_anchor') {
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      if (typeof args.file !== 'string') throw new Error('replace_file_with_current_anchor requires file');
      if (typeof args.newText !== 'string') throw new Error('replace_file_with_current_anchor requires newText');
      const oldText = fs.readFileSync(args.file, 'utf8');
      if (oldText === args.newText) {
        console.log(JSON.stringify({
          ok: true,
          operation: 'replace_file_with_current_anchor',
          changed: false,
          skipped: true,
          reason: 'already matches target text',
          file: args.file,
        }, null, 2));
        return;
      }
      const result = await callAtomicTool(
        'atomic_replace_text',
        {
          file: args.file,
          oldText,
          newText: args.newText,
          expectedCount: 1,
        },
        'replace_file_with_current_anchor',
      );
      console.log(JSON.stringify({
        ok: result.output?.ok !== false,
        operation: 'replace_file_with_current_anchor',
        file: args.file,
        output: result.output,
        macroTracePath: result.macroTracePath,
      }, null, 2));
      return;
    }

    const args = parseToolArgs(tool, rawArgs);
    normalizeToolAliases(tool, args);
    normalizeWorktreeSafePaths(args);
    const primary = await callAtomicTool(tool, args, tool);
    let layoutFix = null;
    if (tool === 'atomic_remove_import' && typeof args.file === 'string') {
      layoutFix = await callAtomicTool(
        'atomic_apply_eslint_dry_run_fixes',
        {
          cwd: 'backend',
          args: [
            repoRelativeFromCwd(args.file, 'backend'),
            '--fix-dry-run',
            '--fix-type',
            'layout',
            '--format',
            'json',
          ],
          allowedPaths: [args.file],
          applyKnownResidueFixes: false,
        },
        'atomic_remove_import layout fix',
      );
    }
    if (layoutFix) {
      console.log(JSON.stringify({ ok: true, operation: tool, output: primary.output, layoutFix: layoutFix.output }, null, 2));
    } else if (primary.rawOutput) {
      console.log(primary.rawOutput);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
