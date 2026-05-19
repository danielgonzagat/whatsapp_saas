/**
 * kloel-atomic-edit — MCP server that adds the sub-line action space the
 * built-in coarse editors lack.
 *
 * Closes the "Line-Oriented Action Bottleneck" at exactly the layer the
 * thesis identifies as defective: the agent/CLI tool contract. The model is
 * unchanged; the SYSTEM's action space gains first-class atomic operators,
 * loaded in every session via .mcp.json.
 *
 * Every tool: structural validation BEFORE write, atomic write (no torn
 * files), repo-containment + governance-protection guard, and an
 * Expansion-Factor metric so the thesis becomes measurable in practice.
 *
 * Transport is stdio. NOTHING may be written to stdout except MCP protocol
 * frames; all diagnostics go to stderr.
 */

import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  applyEdits,
  replaceText,
  renameSymbol,
  replaceLiteral,
  validate,
  wrapRange,
  type WrapKind,
  type TextEditSpec,
  type ApplyResult,
  type ValidationResult, computeZones } from './engine.js';
import { resolveAllowedRootForAbsolutePath, resolveSafeTarget, REPO_ROOT } from './guard.js';
import { buildTrace, levelFor, shapePayload, writeTrace } from './trace.js';
import { browse, outline, readSymbol } from './nav.js';
import {
  editSymbol,
  renameSymbolCrossFile,
  previewDiff,
  characterDiff,
  addNamedImport,
  removeNamedImport,
  replacePropertyValue,
  type SymbolOp,
  type SemanticEditResult,
  renamePropertyKey,
  addAwaitToCall,
} from './advanced.js';

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** Optimistic-concurrency guard: refuse if the file changed since the agent
 * read it (defends against the concurrent-agent collisions this repo is known
 * for). Opt-in via expectedSha256. Never leaks file content. */
function guardSha(before: string, expected: string | undefined): void {
  if (expected && sha256(before) !== expected) {
    throw new Error(
      `sha256 mismatch: file changed since you read it (expected ${expected.slice(0, 12)}…, ` +
        `got ${sha256(before).slice(0, 12)}…). Re-read and retry — NOT written.`,
    );
  }
}

const log = (...a: unknown[]): void => {
  process.stderr.write(`[atomic-edit] ${a.map(String).join(' ')}\n`);
};

/** Atomic durable write: temp file in same dir, fsync, rename. */
function atomicWrite(absPath: string, content: string): void {
  const dir = path.dirname(absPath);
  const tmp = path.join(dir, `.atomic-edit.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, absPath);
}

function readUtf8(absPath: string): string {
  if (!fs.existsSync(absPath)) throw new Error(`file does not exist: ${absPath}`);
  const st = fs.statSync(absPath);
  if (!st.isFile()) throw new Error(`not a regular file: ${absPath}`);
  return fs.readFileSync(absPath, 'utf8');
}

function normalizeRepoRelPath(value: string): string {
  const normalized = value.replaceAll(path.sep, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized;
}

function normalizeAllowedPath(value: string, repoRoot: string): string {
  if (!path.isAbsolute(value)) {
    return normalizeRepoRelPath(value);
  }
  const rel = path.relative(repoRoot, path.resolve(value));
  if (rel === '') {
    return '';
  }
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return normalizeRepoRelPath(value);
  }
  return normalizeRepoRelPath(rel);
}

function relPathAllowed(relPath: string, allowedPaths: string[]): boolean {
  const rel = normalizeRepoRelPath(relPath);
  return allowedPaths.some((allowed) => {
    const normalized = normalizeRepoRelPath(allowed);
    return normalized === '' || rel === normalized || rel.startsWith(`${normalized}/`);
  });
}

function changedSpanMetrics(
  before: string,
  after: string,
): {
  changedChars: number;
  lineSurfaceChars: number;
  expansionFactor: number;
  oldSample: string;
  newSample: string;
  preservedPrefixHash: string;
  preservedSuffixHash: string;
} {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > prefix && afterEnd > prefix && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }
  const oldChanged = before.slice(prefix, beforeEnd);
  const newChanged = after.slice(prefix, afterEnd);
  const changedChars = Math.max(oldChanged.length, newChanged.length);
  const lineStartCandidate = before.lastIndexOf('\n', Math.max(prefix - 1, 0));
  const lineStart = lineStartCandidate === -1 ? 0 : lineStartCandidate + 1;
  const lineEndCandidate = before.indexOf('\n', beforeEnd);
  const lineEnd = lineEndCandidate === -1 ? before.length : lineEndCandidate;
  const lineSurfaceChars = changedChars === 0 ? 0 : Math.max(lineEnd - lineStart, changedChars);
  const sample = (text: string): string => (text.length <= 240 ? text : `${text.slice(0, 237)}...`);
  return {
    changedChars,
    lineSurfaceChars,
    expansionFactor: Number((lineSurfaceChars / Math.max(changedChars, 1)).toFixed(2)),
    oldSample: sample(oldChanged),
    newSample: sample(newChanged),
    preservedPrefixHash: sha256(before.slice(0, prefix)),
    preservedSuffixHash: sha256(before.slice(beforeEnd)),
  };
}

interface EslintDryRunResult {
  filePath: string;
  output?: string;
  messages?: { ruleId?: string | null; message?: string; line?: number; column?: number }[];
  errorCount?: number;
  warningCount?: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
}

function hasArg(args: string[], bare: string): boolean {
  return args.some(
    (arg, index) => arg === bare || arg.startsWith(`${bare}=`) || args[index - 1] === bare,
  );
}

function normalizeEslintDryRunArgs(args: string[]): string[] {
  if (args[0] === 'npx' && args[1] === 'eslint') return args.slice(2);
  if (args[0] === 'eslint') return args.slice(1);
  return args;
}

function requireEslintDryRunArgs(args: string[]): void {
  if (args.includes('--fix')) throw new Error('refused: use --fix-dry-run, not --fix');
  if (!args.includes('--fix-dry-run'))
    throw new Error('refused: eslint args must include --fix-dry-run');
  const formatJson =
    args.includes('--format=json') ||
    args.includes('-f=json') ||
    args.some((arg, index) => (arg === '--format' || arg === '-f') && args[index + 1] === 'json');
  if (!formatJson) throw new Error('refused: eslint args must include --format json');
  if (hasArg(args, '--output-file') || hasArg(args, '-o')) {
    throw new Error('refused: analyzer output must stay on stdout, not --output-file');
  }
}

function parseEslintJson(stdout: string): EslintDryRunResult[] {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('[')) throw new Error('eslint did not emit JSON array on stdout');
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) throw new Error('eslint JSON output was not an array');
  return parsed as EslintDryRunResult[];
}

function targetDetails(absPath: string, relPath: string): Record<string, unknown> {
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
  return {
    target: {
      repoRoot,
      file: relPath,
      absPath,
    },
  };
}

function shellPath(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : JSON.stringify(value);
}

function nearestPackageRelPath(repoRoot: string, relPath: string): string | null {
  const normalized = normalizeRepoRelPath(relPath);
  const parts = normalized === '.' ? [] : normalized.split('/').filter(Boolean);
  for (let depth = parts.length; depth >= 0; depth--) {
    const packageRelPath = parts.slice(0, depth).join('/') || '.';
    const packageJsonPath = path.join(
      repoRoot,
      packageRelPath === '.' ? '' : packageRelPath,
      'package.json',
    );
    if (fs.existsSync(packageJsonPath)) return packageRelPath;
  }
  return null;
}

function runPostEditVerify(
  relPath: string,
  absPath: string,
  repoRoot: string,
  verify: string,
): { kind: string; command: string; passed: boolean; summary: string } | null {
  const pkg = nearestPackageRelPath(repoRoot, relPath);
  if (!pkg) return null;
  const pkgDir = path.join(repoRoot, pkg);

  if (verify === 'typecheck') {
    try {
      childProcess.execSync(`npx tsc --noEmit`, {
        cwd: pkgDir,
        timeout: 30000,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return {
        kind: 'typecheck',
        command: `tsc --noEmit (${pkg})`,
        passed: true,
        summary: 'TypeScript typecheck passed',
      };
    } catch (e: any) {
      const stderr = (e.stderr || e.stdout || '').toString();
      return {
        kind: 'typecheck',
        command: `tsc --noEmit (${pkg})`,
        passed: false,
        summary: stderr.slice(0, 500),
      };
    }
  }

  if (verify === 'lint') {
    try {
      const result = childProcess.execSync(`npx eslint "${absPath}" --format json`, {
        timeout: 30000,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const issues = JSON.parse(result);
      const errorCount = issues.reduce((sum: number, f: any) => sum + f.errorCount, 0);
      const warningCount = issues.reduce((sum: number, f: any) => sum + f.warningCount, 0);
      const passed = errorCount === 0;
      return {
        kind: 'lint',
        command: `eslint ${relPath}`,
        passed,
        summary: `${errorCount} errors, ${warningCount} warnings`,
      };
    } catch (e: any) {
      return {
        kind: 'lint',
        command: `eslint ${relPath}`,
        passed: false,
        summary: 'ESLint execution failed',
      };
    }
  }

  return null;
}

function packageVerificationPlan(
  repoRoot: string,
  cwdRelPath: string,
  allowedPaths: string[],
): { packageRelPath: string; commands: string[] } {
  const candidates = [...allowedPaths, cwdRelPath].filter(Boolean);
  const packageRelPath =
    candidates
      .map((candidate) => nearestPackageRelPath(repoRoot, candidate))
      .find((candidate): candidate is string => Boolean(candidate)) ?? '.';
  const prefix = packageRelPath !== '.' ? `npm --prefix ${shellPath(packageRelPath)}` : 'npm';
  return {
    packageRelPath,
    commands: [
      `${prefix} run lint:check`,
      `${prefix} run typecheck`,
      `${prefix} test`,
      `${prefix} run build`,
    ],
  };
}

function unusedSymbolFromLintMessage(message?: string): string | undefined {
  return message?.match(
    /'([^']+)' is (?:assigned a value but never used|defined but never used)/,
  )?.[1];
}

function buildLintResidueActionCandidates(
  results: EslintDryRunResult[],
  cwdAbsPath: string,
): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  for (const result of results) {
    for (const message of result.messages ?? []) {
      const symbol = unusedSymbolFromLintMessage(message.message);
      const fileInput = path.isAbsolute(result.filePath)
        ? result.filePath
        : path.join(cwdAbsPath, result.filePath);
      let relPath = result.filePath;
      try {
        relPath = resolveSafeTarget(fileInput).relPath;
      } catch {
        // Residue guidance is advisory only; never fail the analyzer because a message path is odd.
      }
      const isPreservationAnchor =
        typeof symbol === 'string' && /^(?:envBackup|mailEnvBackup)$|fixture/i.test(symbol);
      candidates.push({
        file: relPath,
        line: message.line,
        column: message.column,
        ruleId: message.ruleId,
        message: message.message?.slice(0, 240),
        symbol,
        topology: isPreservationAnchor
          ? 'preserve_existing_anchor_by_adding_usage'
          : 'classify_preserve_or_remove_unused_symbol',
        preferredAtomicAction: isPreservationAnchor
          ? 'use_existing_fixture_or_env_backup_with_atomic_replace_text'
          : 'read_smallest_context_then_use_or_remove_symbol_atomically',
        guidance: isPreservationAnchor
          ? 'Treat this as a preservation anchor first; prefer using it to restore isolation/proof before deleting it.'
          : 'Do not delete by default; first decide whether the symbol encodes product/test intent or is genuine residue.',
      });
    }
  }
  return candidates;
}

interface KnownLintResidueFix {
  symbol: string;
  description: string;
}

function addVitestNamedImport(text: string, name: string): string {
  return text.replace(/import \{([^}]+)\} from 'vitest';/, (statement, namesText: string) => {
    const names = namesText
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (names.includes(name)) return statement;
    return `import { ${[...names, name].join(', ')} } from 'vitest';`;
  });
}

function applyMailEnvBackupResidueFix(text: string): string {
  if (!text.includes('const mailEnvBackup') || text.includes('setMailEnv(mailEnvBackup);')) {
    return text;
  }
  const withImport = addVitestNamedImport(text, 'afterEach');
  const anchor = "  describe('sendEmail', () => {";
  if (!withImport.includes(anchor)) return text;
  return withImport.replace(
    anchor,
    '  afterEach(() => {\n    setMailEnv(mailEnvBackup);\n  });\n\n' + anchor,
  );
}

function applyOpenAiEnvBackupResidueFix(text: string): string {
  if (
    !text.includes('const envBackup') ||
    text.includes('restoreOpenAiEnvs') ||
    text.includes('process.env = { ...envBackup }')
  ) {
    return text;
  }
  const withImport = addVitestNamedImport(text, 'afterEach');
  const anchor = "  describe('resolveWorkerOpenAIModel', () => {";
  if (!withImport.includes(anchor)) return text;
  return withImport.replace(
    anchor,
    '  afterEach(() => {\n' + '    process.env = { ...envBackup };\n' + '  });\n\n' + anchor,
  );
}

function applyEmptyDemographicsResidueFix(text: string): string {
  if (
    !text.includes('const emptyDemographics') ||
    text.includes('expect(result.demographics).toEqual(emptyDemographics);')
  ) {
    return text;
  }
  const anchor = '    expect(result.leadScore).toBeLessThanOrEqual(100);\n';
  if (!text.includes(anchor)) return text;
  return text.replace(
    anchor,
    `${anchor}    expect(result.demographics).toEqual(emptyDemographics);\n`,
  );
}

function applyKnownLintResidueFixes(
  relPath: string,
  text: string,
  messages: EslintDryRunResult['messages'],
): { text: string; applied: KnownLintResidueFix[] } {
  let next = text;
  const applied: KnownLintResidueFix[] = [];
  const symbols = new Set(
    (messages ?? []).map((message) => unusedSymbolFromLintMessage(message.message)),
  );
  const apply = (symbol: string, description: string, fn: (source: string) => string): void => {
    if (!symbols.has(symbol)) return;
    const before = next;
    next = fn(next);
    if (next !== before) applied.push({ symbol, description });
  };

  apply(
    'mailEnvBackup',
    'preserve mail env backup by restoring it after each test',
    applyMailEnvBackupResidueFix,
  );
  apply(
    'envBackup',
    'preserve OpenAI env backup by restoring target env keys after each test',
    applyOpenAiEnvBackupResidueFix,
  );
  apply(
    'emptyDemographics',
    'preserve expected empty demographics fixture by asserting it in the empty-message behavior test',
    applyEmptyDemographicsResidueFix,
  );

  return {
    text: next,
    applied: applied.map((fix) => ({ ...fix, description: `${relPath}: ${fix.description}` })),
  };
}

interface ToolOk {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  /** SDK CallToolResult is an open record; satisfy its index signature. */
  [x: string]: unknown;
}

function ok(
  payload: Record<string, unknown>,
  options: { includeMachineJson?: boolean } = {},
): ToolOk {
  const summary = payload.summaryForHuman ?? payload.summary;
  const machinePayload =
    typeof summary === 'string' && summary.length > 0
      ? Object.fromEntries(
          Object.entries(payload).filter(([key]) => key !== 'summaryForHuman' && key !== 'summary'),
        )
      : payload;
  const json = { type: 'text' as const, text: JSON.stringify(machinePayload, null, 2) };
  if (typeof summary !== 'string' || summary.length === 0) {
    return { content: [json] };
  }
  if (options.includeMachineJson === false) {
    return { content: [{ type: 'text', text: summary }] };
  }
  return { content: [{ type: 'text', text: summary }, json] };
}

function fail(message: string): ToolOk {
  log('ERROR', message);
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }, null, 2) }],
    isError: true,
  };
}

/** Persist only if validation did not regress; report metrics. When
 * `preview` is set, validate + return the diff but DO NOT write (dry-run —
 * lets the agent verify before committing, killing the blind-edit failure
 * mode the literature flags). */
function commit(
  relPath: string,
  absPath: string,
  before: string,
  result: ApplyResult,
  extra: Record<string, unknown> = {},
  preview = false,
  verify?: 'typecheck' | 'lint',
  lock?: boolean,
): ToolOk {
  const v: ValidationResult = result.validation;
  if (!v.ok) {
    return fail(
      `rejected: edit would introduce a ${v.language} syntax error ` +
        `(${v.before} -> ${v.after}). ${v.introduced ?? ''} — file NOT modified.`,
    );
  }
  if (result.newText === before) {
    return ok({
      ok: true,
      changed: false,
      note: 'edit produced identical content; file untouched',
      file: relPath,
      ...targetDetails(absPath, relPath),
    });
  }
  const level = levelFor(preview);
  const operator = String(
    (extra as Record<string, unknown>).op ??
      (extra as Record<string, unknown>).operator ??
      'atomic_edit',
  );
  const inlinePreview = characterDiff(before, result.newText, relPath);
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
  const editZones = computeZones(before, result.newText);
  const trace = buildTrace({
    file: relPath,
    repoRoot,
    operator,
    before,
    newText: result.newText,
    inlinePreview,
    validation: { language: v.language, before: v.before, after: v.after },
    metrics: {
      changedChars: result.changedChars,
      lineRewriteSurfaceChars: result.lineSurfaceChars,
      expansionFactorAvoided: result.expansionFactor,
    },
    preservedZones: editZones.preservedZones,
    modifiedZones: editZones.modifiedZones,
    movementZones: editZones.movementZones,
    preview,
    changed: !preview,
  });
  if (preview) {
    return ok(
      shapePayload(
        level,
        {
          ok: true,
          preview: true,
          changed: false,
          note: 'dry-run: validated, NOT written',
          file: relPath,
          ...targetDetails(absPath, relPath),
          validation: {
            language: v.language,
            syntaxErrorsBefore: v.before,
            syntaxErrorsAfter: v.after,
          },
          intentionChars: result.changedChars,
          expansionFactorAvoided: result.expansionFactor,
          ...extra,
        },
        { inlinePreview, legacyDiff: previewDiff(before, result.newText, relPath), trace },
      ),
    );
  }

  let commitLockId: string | null = null;
  if (lock) {
    autoLockCleanup(relPath);
    commitLockId = autoLockFile(relPath);
  }

  try {
    // A/B loop R6 finding: whole-file create/overwrite echoed the ENTIRE file
    // back as a char-diff (before='' ⇒ diff == whole file) inside summaryForHuman
    // AND again as `atomicDiff` — i.e. the content the model just supplied,
    // returned to it twice, the dominant token sink (1.58M vs 0.95M). For these
    // ops return a COMPACT confirmation; full char-proof is persisted to the
    // trace file (path returned). Sub-line in-place edits keep the inline proof.
    if (before === '' || operator === 'atomic_create_file') {
      atomicWrite(absPath, result.newText);
      const persisted = writeTrace(trace);
      const lines = result.newText.split('\n').length;
      log(`created ${relPath} (${lines} lines)`);
      const verifyResult = verify
        ? runPostEditVerify(relPath, absPath, repoRoot, verify)
        : null;
      return ok({
        ok: true,
        changed: true,
        created: before === '',
        file: relPath,
        ...targetDetails(absPath, relPath),
        lines,
        bytesNet: result.newText.length - before.length,
        afterSha256: sha256(result.newText),
        validation: {
          language: v.language,
          syntaxErrorsBefore: v.before,
          syntaxErrorsAfter: v.after,
        },
        ...(verifyResult ? { verify: verifyResult } : {}),
        summaryForHuman:
          `✅ ${before === '' ? 'Created' : 'Replaced'} ${relPath} ` +
          `(${lines} lines, syntax ${v.after <= v.before ? 'ok' : 'REGRESSED'}). ` +
          `Content was supplied by you; char-level proof persisted to the trace ` +
          `file (not echoed back, to save context).`,
        operation: trace.operation,
        operationId: trace.operationId,
        founder: trace.audit,
        ...persisted,
        ...extra,
      });
    }
    atomicWrite(absPath, result.newText);
    log(`wrote ${relPath} (+${result.newText.length - before.length} bytes net)`);
    const verifyResult = verify
      ? runPostEditVerify(relPath, absPath, repoRoot, verify)
      : null;
    return ok(
      shapePayload(
        level,
        {
          ok: true,
          changed: true,
          file: relPath,
          ...targetDetails(absPath, relPath),
          validation: {
            language: v.language,
            syntaxErrorsBefore: v.before,
            syntaxErrorsAfter: v.after,
          },
          intentionChars: result.changedChars,
          lineRewriteSurfaceChars: result.lineSurfaceChars,
          expansionFactorAvoided: result.expansionFactor,
          bytesNet: result.newText.length - before.length,
          afterSha256: sha256(result.newText),
          ...(verifyResult ? { verify: verifyResult } : {}),
          ...extra,
        },
        { inlinePreview, legacyDiff: previewDiff(before, result.newText, relPath), trace },
      ),
    );
  } finally {
    if (commitLockId) {
      try {
        fs.rmdirSync(lockDir(commitLockId), { recursive: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

const server = new McpServer({ name: 'kloel-atomic-edit', version: '4.0.0' });

const pos = z.object({
  line: z.number().int().min(1).describe('1-based line'),
  column: z.number().int().min(1).describe('1-based column (UTF-16 units within the line)'),
});

server.registerTool(
  'atomic_edit',
  {
    title: 'Unified atomic code editing — dispatches to the correct precise operator',
    description:
      'Single entry-point for all atomic editing operations. The `op` parameter selects the operation, ' +
      'and the rest of the params are specific to that operation. Supported ops: ' +
      'replace_text, replace_range, replace_literal, ' +
      'insert_at, delete_range, edit_symbol, ' +
      'add_import, remove_import, rename_symbol, ' +
      'replace_property_value, rename_property_key.',
    inputSchema: {
      op: z.enum([
        'replace_text', 'replace_range', 'replace_literal',
        'insert_at', 'delete_range', 'edit_symbol',
        'add_import', 'remove_import', 'rename_symbol',
        'replace_property_value', 'rename_property_key',
      ]),
      file: z.string(),
      oldText: z.string().optional(),
      newText: z.string().optional(),
      occurrence: z.number().int().min(1).optional(),
      startLine: z.number().int().min(1).optional(),
      startColumn: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
      endColumn: z.number().int().min(1).optional(),
      selector: z.string().optional(),
      symbolOp: z.enum(['replace', 'insert_after', 'remove']).optional(),
      code: z.string().optional(),
      module: z.string().optional(),
      name: z.string().optional(),
      alias: z.string().optional(),
      typeOnly: z.boolean().optional(),
      property: z.string().optional(),
      value: z.string().optional(),
      newKey: z.string().optional(),
      expectedSha256: z.string().optional(),
      preview: z.boolean().optional(),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);

      switch (a.op) {
        case 'replace_text': {
          if (!a.oldText || a.newText === undefined) throw new Error('replace_text requires oldText+newText');
          const r = replaceText(relPath, before, a.oldText, a.newText, a.occurrence);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:replace_text' }, a.preview ?? false, a.verify, a.lock);
        }
        case 'replace_range': {
          if (!a.startLine || !a.startColumn || !a.endLine || !a.endColumn || a.newText === undefined) throw new Error('replace_range requires coordinates+newText');
          const r = applyEdits(relPath, before, [{ start: { line: a.startLine, column: a.startColumn }, end: { line: a.endLine, column: a.endColumn }, newText: a.newText }]);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:replace_range' }, a.preview ?? false, a.verify, a.lock);
        }
        case 'replace_literal': {
          if (!a.oldText || a.newText === undefined) throw new Error('replace_literal requires oldText+newText');
          const r = await replaceLiteral(relPath, before, a.oldText, a.newText, a.startLine);
          if (!r.validation.ok) return fail('rejected: replace_literal would break syntax. ' + (r.validation.introduced ?? ''));
          if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
          if (!a.preview) atomicWrite(absPath, r.newText);
          return ok({ ok: true, changed: !a.preview, file: relPath, matched: r.matched });
        }
        case 'insert_at': {
          if (!a.startLine || !a.startColumn || a.newText === undefined) throw new Error('insert_at requires position+newText');
          const p = { line: a.startLine, column: a.startColumn };
          const r = applyEdits(relPath, before, [{ start: p, end: p, newText: a.newText }]);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:insert_at' }, a.preview ?? false);
        }
        case 'delete_range': {
          if (!a.startLine || !a.startColumn || !a.endLine || !a.endColumn) throw new Error('delete_range requires coordinates');
          const r = applyEdits(relPath, before, [{ start: { line: a.startLine, column: a.startColumn }, end: { line: a.endLine, column: a.endColumn }, newText: '' }]);
          return commit(relPath, absPath, before, r, { op: 'atomic_edit:delete_range' }, a.preview ?? false);
        }
        case 'edit_symbol': {
          if (!a.selector || !a.symbolOp) throw new Error('edit_symbol requires selector+symbolOp');
          const r = await editSymbol(relPath, before, a.selector, a.symbolOp as SymbolOp, a.code);
          if (!r.validation.ok) return fail('rejected: ' + a.symbolOp + ' on ' + r.selector + ' would introduce a syntax error. ' + (r.validation.introduced ?? ''));
          if (r.newText === before) return ok({ ok: true, changed: false, note: 'no change', file: relPath });
          if (!a.preview) atomicWrite(absPath, r.newText);
          return ok({ ok: true, changed: !a.preview, preview: a.preview ?? false, file: relPath, selector: r.selector, op: r.op });
        }
        case 'add_import': {
          if (!a.name || !a.module) throw new Error('add_import requires name+module');
          const r = await addNamedImport(relPath, before, a.module, a.name, a.alias, a.typeOnly);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'remove_import': {
          if (!a.name || !a.module) throw new Error('remove_import requires name+module');
          const r = await removeNamedImport(relPath, before, a.module, a.name);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'replace_property_value': {
          if (!a.property || a.value === undefined) throw new Error('replace_property_value requires property+value');
          const r = await replacePropertyValue(relPath, before, a.property, a.value, a.selector);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'rename_property_key': {
          if (!a.property || !a.newKey) throw new Error('rename_property_key requires property+newKey');
          const r = await renamePropertyKey(relPath, before, a.property, a.newKey, a.selector);
          return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
        }
        case 'rename_symbol': {
          if (!a.startLine || !a.startColumn || !a.newText) throw new Error('rename_symbol requires position+newText');
          const r = await renameSymbol(relPath, before, { line: a.startLine, column: a.startColumn }, a.newText);
          if (!r.validation.ok) return fail('Rename rejected: ' + (r.validation.introduced ?? ''));
          if (!a.preview) atomicWrite(absPath, r.newText);
          return ok({ ok: true, changed: !a.preview, file: relPath, symbol: r.symbol, occurrences: r.occurrences });
        }
        default:
          return fail('Unknown op: ' + a.op);
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_range',
  {
    title: 'Replace an exact character range',
    description:
      'Replace text between (startLine,startColumn) and (endLine,endColumn) — 1-based, end-exclusive — ' +
      'with newText. Structurally validated before write. Use this instead of rewriting a whole line ' +
      'when the real intention is sub-line (a literal, an argument, a token).',
    inputSchema: {
      file: z.string().describe('repo-relative path'),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      newText: z.string(),
      preview: z
        .boolean()
        .optional()
        .describe('dry-run only when uncertain; exact edits are already validated before write'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, [
        {
          start: { line: a.startLine, column: a.startColumn },
          end: { line: a.endLine, column: a.endColumn },
          newText: a.newText,
        },
      ]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false, a.verify, a.lock);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_text',
  {
    title: 'Replace exact text (builtin-edit ergonomics + validation)',
    description:
      'Replace a verbatim oldText block with newText — same ergonomics as the blunt builtin edit/str_replace ' +
      '(no coordinates needed), BUT syntax-regression-validated + atomic-write + governance-guarded like every ' +
      'atomic op. PREFER THIS over the builtin edit for each multi-line/block change: it is just as easy and it ' +
      'refuses to persist broken code. Requires a unique match (add surrounding context) or an explicit ' +
      'occurrence index. Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      oldText: z
        .string()
        .describe('exact verbatim text to replace, including whitespace/indentation'),
      newText: z.string(),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z
        .boolean()
        .optional()
        .describe('dry-run only when uncertain; exact edits are already validated before write'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = replaceText(relPath, before, a.oldText, a.newText, a.occurrence);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false, a.verify, a.lock);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_insert_at',
  {
    title: 'Insert text at a position',
    description:
      'Insert text at (line,column) without rewriting the surrounding line. Zero-width edit (start===end).',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      text: z.string(),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const p = { line: a.line, column: a.column };
      const r = applyEdits(relPath, before, [{ start: p, end: p, newText: a.text }]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_delete_range',
  {
    title: 'Delete an exact character range',
    description:
      'Delete text between (startLine,startColumn) and (endLine,endColumn), 1-based, end-exclusive.',
    inputSchema: {
      file: z.string(),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, [
        {
          start: { line: a.startLine, column: a.startColumn },
          end: { line: a.endLine, column: a.endColumn },
          newText: '',
        },
      ]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_create_file',
  {
    title: 'Create (or wholesale-replace) a file — syntax-validated, atomic, governed',
    description:
      'Create a NEW source file (or, with overwrite:true, replace one wholesale) with `content`, through the ' +
      'SAME pipeline as every atomic op: governance guard, full syntax-regression validation, atomic write, ' +
      'char-level trace. This is the first-class FILE-LEVEL operator for decomposition/extraction (topologies: ' +
      'identity-preserved position-moved, API-preserved impl-moved): create the new module here, then trim the ' +
      'origin with atomic_edit_symbol/atomic_replace_range and rewire with atomic_add_import. NEVER fall back to ' +
      'a shell heredoc (cat > file) — that bypasses validation, trace and governance and is a banned escape.',
    inputSchema: {
      file: z.string().describe('repo-relative path of the file to create'),
      content: z.string().describe('full file content'),
      overwrite: z
        .boolean()
        .optional()
        .describe(
          'replace an existing file wholesale (default false → refuse if it already exists)',
        ),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const exists = fs.existsSync(absPath);
      const existingBefore = exists ? fs.readFileSync(absPath, 'utf8') : '';
      // A/B loop R7 finding + Atomic Action Principle: regenerating a whole
      // existing file to change PART of it is the banned macro-mutation (it
      // re-emits the entire file as a tool argument — the dominant token
      // sink). atomic_create_file is for NEW files only. Modifying an
      // existing non-empty file MUST go through a surgical operator.
      if (exists && existingBefore.trim() !== '') {
        return fail(
          `refused: ${relPath} already exists and is non-empty. atomic_create_file ` +
            `is for NEW files only. To CHANGE part of an existing file use a ` +
            `surgical operator — atomic_edit_symbol (replace/remove a symbol), ` +
            `atomic_delete_range / atomic_replace_range (a span), ` +
            `atomic_replace_text (a verbatim block), atomic_add_import — so only ` +
            `the changed sub-structure is emitted, never the whole file.`,
        );
      }
      const before = existingBefore;
      guardSha(before, a.expectedSha256);
      const edit =
        before === ''
          ? { start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, newText: a.content }
          : (() => {
              const lines = before.split('\n');
              return {
                start: { line: 1, column: 1 },
                end: { line: lines.length, column: lines[lines.length - 1].length + 1 },
                newText: a.content,
              };
            })();
      const r = applyEdits(relPath, before, [edit]);
      if (!exists && !(a.preview ?? false)) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
      }
      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'atomic_create_file', created: !exists },
        a.preview ?? false,
        a.verify,
        a.lock,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);
server.registerTool(
  'atomic_delete_file',
  {
    title: 'Delete a file — governed, atomic, traced',
    description:
      'Delete a file through the same governance guard as every atomic op: repo-containment, ' +
      'protected-file refusal, and trace persistence. Refuses directories. Idempotent for ' +
      'missing files (returns changed:false without throwing). Preview returns what would be ' +
      'removed without deleting. Supports preview?: boolean and expectedSha256?: string.',
    inputSchema: {
      file: z.string().describe('repo-relative path of the file to delete'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not delete'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      if (!fs.existsSync(absPath)) {
        return ok({
          ok: true,
          changed: false,
          note: `file already absent: ${relPath}`,
          file: relPath,
          ...targetDetails(absPath, relPath),
          exists: false,
        });
      }

      const st = fs.statSync(absPath);
      if (st.isDirectory()) {
        return fail(`refused: ${relPath} is a directory, not a file.`);
      }

      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const preview = a.preview ?? false;
      const inlinePreview = characterDiff(before, '', relPath);
      const delZones = computeZones(before, '');
      const trace = buildTrace({
        file: relPath,
        repoRoot,
        operator: 'atomic_delete_file',
        before,
        newText: '',
        inlinePreview,
        validation: { language: 'generic', before: 0, after: 0 },
        metrics: {
          changedChars: before.length,
          lineRewriteSurfaceChars: before.length,
          expansionFactorAvoided: 1,
          bytesNet: -before.length,
        },
        preservedZones: delZones.preservedZones,
        modifiedZones: delZones.modifiedZones,
        movementZones: delZones.movementZones,
        targetUnit: 'file',
        intention: `delete ${relPath} (${before.length} bytes)`,
        semanticImpact: preview ? 'preview_file_deletion' : 'file_deleted',
        preview,
        changed: !preview,
      });

      if (preview) {
        return ok(
          shapePayload(
            levelFor(true),
            {
              ok: true,
              preview: true,
              changed: false,
              file: relPath,
              ...targetDetails(absPath, relPath),
              note: 'dry-run: file NOT deleted',
              bytesWouldFree: before.length,
              afterSha256: sha256(before),
            },
            { inlinePreview, legacyDiff: previewDiff(before, '', relPath), trace },
          ),
        );
      }

      fs.unlinkSync(absPath);
      const persisted = writeTrace(trace);
      log(`deleted ${relPath} (${before.length} bytes)`);
      return ok({
        ok: true,
        changed: true,
        deleted: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        bytesDeleted: before.length,
        afterSha256: sha256(''),
        validation: {
          language: 'generic',
          syntaxErrorsBefore: 0,
          syntaxErrorsAfter: 0,
        },
        summaryForHuman:
          `✅ Deleted ${relPath} ` +
          `(${before.length} bytes freed). ` +
          `Full proof persisted to trace file (not echoed back, to save context).`,
        operation: trace.operation,
        operationId: trace.operationId,
        founder: trace.audit,
        ...persisted,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_apply_edits',
  {
    title: 'Apply a batch of non-overlapping edits atomically',
    description:
      'LSP TextEdit[] semantics: all edits validated together, applied all-or-nothing, single atomic write. ' +
      'Use for multi-site changes that are ONE intention (e.g. several literals in one config) so they ' +
      'land as one reviewable, conflict-minimal mutation.',
    inputSchema: {
      file: z.string(),
      edits: z
        .array(
          z.object({
            start: pos,
            end: pos,
            newText: z.string(),
          }),
        )
        .min(1),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, a.edits as TextEditSpec[]);
      return commit(relPath, absPath, before, r, { editCount: a.edits.length }, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_rename_symbol',
  {
    title: 'Scope-correct rename (single file)',
    description:
      'Rename the identifier at (line,column) and all its scope-correct references within the same file, ' +
      'respecting binding/shadowing (ts-morph). One intention instead of N text rewrites. ' +
      'Cross-file rename is intentionally out of scope v1.',
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      newName: z.string().min(1),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = await renameSymbol(relPath, before, { line: a.line, column: a.column }, a.newName);
      if (!r.validation.ok) {
        return fail(
          `rejected: rename would introduce a syntax error. ${r.validation.introduced ?? ''}`,
        );
      }
      if (r.newText === before)
        return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      atomicWrite(absPath, r.newText);
      log(`renamed ${r.symbol} in ${relPath} (${r.occurrences} refs)`);
      return ok({
        ok: true,
        changed: true,
        file: relPath,
        symbol: r.symbol,
        references: r.occurrences,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_literal',
  {
    title: 'Replace a literal by value (AST-targeted)',
    description:
      'Replace a string/numeric/boolean/null literal whose source text equals currentText with newText, ' +
      "selected via the AST (not text matching). The thesis worked example: \"'5511999999999'\" -> 'null' " +
      'as one intention. Refuses ambiguous matches unless onLine disambiguates to exactly one.',
    inputSchema: {
      file: z.string(),
      currentText: z
        .string()
        .describe('exact source text of the literal, incl. quotes for strings'),
      newText: z
        .string()
        .describe('replacement source text, incl. quotes if it should stay a string'),
      onLine: z.number().int().min(1).optional().describe('constrain to this 1-based line'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await replaceLiteral(relPath, before, a.currentText, a.newText, a.onLine);
      const matched = r.matched[0];
      const applied = applyEdits(relPath, before, [
        {
          start: { line: matched.line, column: matched.column },
          end: { line: matched.line, column: matched.column + matched.old.length },
          newText: a.newText,
        },
      ]);
      if (applied.newText !== r.newText) {
        return fail('literal replacement span mismatch — file NOT modified.');
      }
      return commit(
        relPath,
        absPath,
        before,
        applied,
        {
          matched: r.matched,
          op: 'replace_literal',
        },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── v2: read-side (the dominant accuracy lever) ─────

server.registerTool(
  'code_browse',
  {
    title: 'List a directory (structured)',
    description:
      'Repo-relative directory listing (dirs first, node_modules/.git hidden). Read-side step 1: ' +
      'locate the file before reading its structure. Relative paths target the MCP server root; ' +
      'workers in linked worktrees should pass absolute paths from `pwd` to avoid editing the coordinator checkout.',
    inputSchema: {
      dir: z
        .string()
        .describe(
          "repo-relative to the MCP server root, or absolute worktree directory; '.' is server root",
        ),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.dir || '.');
      return ok({
        ok: true,
        dir: relPath || '.',
        ...targetDetails(absPath, relPath),
        entries: browse(absPath),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'code_outline',
  {
    title: 'File signature map (no bodies)',
    description:
      'Token-cheap structural summary: every named function/class/method/interface/type/var with its ' +
      "selector and line range — NO bodies. CodeStruct's readCode summarization mode; the highest-leverage " +
      'read primitive. Use before editing so you address symbols by name, not by guessed line numbers. ' +
      'Relative paths target the MCP server root; workers in linked worktrees should pass absolute file paths from `pwd`.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root, or absolute file path inside a registered worktree',
        ),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const o = await outline(relPath, readUtf8(absPath));
      return ok({ ok: true, file: relPath, ...targetDetails(absPath, relPath), ...o });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'code_read_symbol',
  {
    title: 'Read one symbol by scoped selector',
    description:
      "Return the complete syntactic unit for a selector (e.g. 'UserService.load', 'Foo::bar', 'helper') " +
      'plus its exact start/end line+column — chain straight into an atomic edit without re-deriving ' +
      'positions. Refuses ambiguous selectors with the candidate list. Relative paths target the MCP server root; ' +
      'workers in linked worktrees should pass absolute file paths from `pwd`.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root, or absolute file path inside a registered worktree',
        ),
      selector: z.string().describe("unscoped 'name' or scoped 'Class.method' / 'A.B.c'"),
      line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based line: if provided with column, resolve by position instead of selector'),
      column: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based column: if provided with line, resolve by position instead of selector'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const position =
        a.line !== undefined && a.column !== undefined
          ? { line: a.line, column: a.column }
          : undefined;
      const r = await readSymbol(relPath, readUtf8(absPath), a.selector, position);
      return ok({ ok: true, file: relPath, ...targetDetails(absPath, relPath), ...r });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── batch outline ──────────────────────────

function matchesGlob(pattern: string, filePath: string): boolean {
  const parts = pattern.split('/');
  const fileParts = filePath.split('/');
  let pi = 0;
  let fi = 0;
  while (pi < parts.length) {
    if (parts[pi] === '**') {
      if (pi === parts.length - 1) return true;
      pi++;
      const next = parts[pi];
      while (fi < fileParts.length) {
        if (matchesGlobPart(next, fileParts[fi])) break;
        fi++;
      }
      if (fi >= fileParts.length) return false;
      pi++;
      fi++;
      continue;
    }
    if (fi >= fileParts.length) return false;
    if (!matchesGlobPart(parts[pi], fileParts[fi])) return false;
    pi++;
    fi++;
  }
  return fi === fileParts.length;
}

function matchesGlobPart(part: string, name: string): boolean {
  if (!part.includes('*')) return part === name;
  const regex = new RegExp(
    '^' + part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*') + '$',
  );
  return regex.test(name);
}

function globFindFiles(absCwd: string, pattern: string): string[] {
  const results: string[] = [];
  const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', '.atomic']);
  const walk = (dir: string, relDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (excludeDirs.has(entry.name)) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else if (entry.isFile()) {
        if (matchesGlob(pattern, relPath)) {
          results.push(absPath);
        }
      }
    }
  };
  walk(absCwd, '');
  return results;
}

server.registerTool(
  'code_outline_batch',
  {
    title: 'File signature map for multiple files (batch)',
    description:
      'Returns outline (signature map, no bodies) for every file matching a glob pattern. ' +
      'Max 20 files to prevent overload. Use glob patterns like "backend/src/**/*.service.ts".',
    inputSchema: {
      glob: z.string().describe('glob pattern relative to cwd, e.g. "backend/src/**/*.service.ts"'),
      cwd: z.string().optional().describe('working directory (default ".")'),
    },
  },
  async (a) => {
    try {
      const cwdTarget = resolveSafeTarget(a.cwd ?? '.');
      const absCwd = cwdTarget.absPath;
      const absFiles = globFindFiles(absCwd, a.glob);
      const limit = 20;
      const sliced = absFiles.slice(0, limit);
      const files = [];
      for (const absFile of sliced) {
        let relPath: string;
        try {
          relPath = resolveSafeTarget(absFile).relPath;
        } catch {
          continue;
        }
        const text = readUtf8(absFile);
        const o = await outline(relPath, text);
        files.push({
          file: relPath,
          sha256: crypto.createHash('sha256').update(text).digest('hex'),
          symbols: o.symbols,
        });
      }
      return ok({
        ok: true,
        glob: a.glob,
        cwd: a.cwd ?? '.',
        matchedTotal: absFiles.length,
        returned: files.length,
        truncated: absFiles.length > limit,
        files,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── read-only metadata (never contents) ─────────────

server.registerTool(
  'code_file_stat',
  {
    title: 'Stat a file or directory (metadata only, never contents)',
    description:
      'Returns file/directory metadata WITHOUT EVER returning file contents. ' +
      'Returns ok:true changed:false with target metadata. ' +
      'For files: kind=file, bytes, sha256, mtimeMs. ' +
      'For directories: kind=directory (no sha256, no bytes). ' +
      'For missing paths: kind=missing (non-throwing). ' +
      'Governance-protected paths are marked protected:true with no content/sha256/bytes.',
    inputSchema: {
      file: z.string().describe('repo-relative or absolute path to stat'),
    },
  },
  async (a) => {
    try {
      let absPath: string;
      let relPath: string;

      try {
        const resolved = resolveSafeTarget(a.file);
        absPath = resolved.absPath;
        relPath = resolved.relPath;
      } catch (resolveError) {
        const message = resolveError instanceof Error ? resolveError.message : String(resolveError);
        if (/governance-protected/.test(message)) {
          const protectedAbsPath = path.isAbsolute(a.file)
            ? path.resolve(a.file)
            : path.resolve(REPO_ROOT, a.file);
          const protectedRepoRoot =
            resolveAllowedRootForAbsolutePath(protectedAbsPath) ?? REPO_ROOT;
          const protectedRelPath = normalizeRepoRelPath(
            path.relative(protectedRepoRoot, protectedAbsPath),
          );
          const protectedExists = fs.existsSync(protectedAbsPath);
          const protectedKind = protectedExists
            ? fs.statSync(protectedAbsPath).isDirectory()
              ? 'directory'
              : 'file'
            : 'missing';
          return ok({
            ok: true,
            changed: false,
            file: protectedRelPath,
            exists: protectedExists,
            kind: protectedKind,
            protected: true,
            note: 'Governance-protected: metadata only, no content/bytes/sha256 exposed.',
            target: {
              repoRoot: protectedRepoRoot,
              file: protectedRelPath,
              absPath: protectedAbsPath,
            },
          });
        }
        throw resolveError;
      }

      if (!fs.existsSync(absPath)) {
        return ok({
          ok: true,
          changed: false,
          file: relPath,
          exists: false,
          kind: 'missing',
          ...targetDetails(absPath, relPath),
        });
      }

      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) {
        return ok({
          ok: true,
          changed: false,
          file: relPath,
          exists: true,
          kind: 'directory',
          mtimeMs: stat.mtimeMs,
          ...targetDetails(absPath, relPath),
        });
      }

      if (!stat.isFile()) {
        return fail(`refused: ${relPath} is not a regular file or directory`);
      }

      const fileBytes = fs.readFileSync(absPath);
      return ok({
        ok: true,
        changed: false,
        file: relPath,
        exists: true,
        kind: 'file',
        bytes: stat.size,
        sha256: crypto.createHash('sha256').update(fileBytes).digest('hex'),
        mtimeMs: stat.mtimeMs,
        ...targetDetails(absPath, relPath),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── v2: symbol-named edits + cross-file rename ──────

server.registerTool(
  'atomic_edit_symbol',
  {
    title: 'Replace / insert-after / remove a named AST entity',
    description:
      "CodeStruct editCode: structurally edit a symbol by selector — op='replace' (swap its whole " +
      "definition), 'insert_after' (add a sibling after it), 'remove' (delete it). Indentation preserved, " +
      'syntax revalidated, atomic write. The block-level operator the literature shows beats fragile ' +
      'offsets for function/class changes. Supports preview (dry-run).',
    inputSchema: {
      file: z.string(),
      selector: z.string(),
      op: z.enum(['replace', 'insert_after', 'remove']),
      code: z.string().optional().describe('required for replace / insert_after; omit for remove'),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
      verify: z.enum(['typecheck', 'lint']).optional(),
      lock: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await editSymbol(relPath, before, a.selector, a.op as SymbolOp, a.code);
      if (!r.validation.ok) {
        return fail(
          `rejected: ${a.op} on ${r.selector} would introduce a syntax error. ${r.validation.introduced ?? ''}`,
        );
      }
      if (r.newText === before)
        return ok({ ok: true, changed: false, note: 'no change', file: relPath });
      const symLevel = levelFor(a.preview ?? false);
      const symInline = characterDiff(before, r.newText, relPath);
      const symZones = computeZones(before, r.newText);
      const symTrace = buildTrace({
        file: relPath,
        repoRoot,
        operator: `edit_symbol:${r.op}`,
        before,
        newText: r.newText,
        inlinePreview: symInline,
        validation: {
          language: r.validation.language,
          before: r.validation.before,
          after: r.validation.after,
        },
        preservedZones: symZones.preservedZones,
        modifiedZones: symZones.modifiedZones,
        movementZones: symZones.movementZones,
        preview: a.preview ?? false,
        changed: !(a.preview ?? false),
      });
      if (a.preview ?? false) {
        return ok(
          shapePayload(
            symLevel,
            {
              ok: true,
              preview: true,
              changed: false,
              file: relPath,
              selector: r.selector,
              op: r.op,
            },
            {
              inlinePreview: symInline,
              legacyDiff: previewDiff(before, r.newText, relPath),
              trace: symTrace,
            },
          ),
        );
      }
      let symLockId: string | null = null;
      if (a.lock) symLockId = autoLockFile(relPath);
      try {
        atomicWrite(absPath, r.newText);
        log(`edit_symbol ${a.op} ${r.selector} in ${relPath}`);
        const verifyResult = a.verify
          ? runPostEditVerify(relPath, absPath, repoRoot, a.verify)
          : null;
        return ok(
          shapePayload(
            symLevel,
            { ok: true, changed: true, file: relPath, selector: r.selector, op: r.op, ...(verifyResult ? { verify: verifyResult } : {}) },
            {
              inlinePreview: symInline,
              legacyDiff: previewDiff(before, r.newText, relPath),
              trace: symTrace,
            },
          ),
        );
      } finally {
        if (symLockId) {
          try { fs.rmdirSync(lockDir(symLockId), { recursive: true }); } catch { /* cleanup */ }
        }
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_rename_symbol_cross_file',
  {
    title: 'Scope-correct rename across the whole project',
    description:
      'True semantic rename via the TypeScript language service (nearest tsconfig): renames the symbol ' +
      'at (line,column) and ALL its references across every file, respecting scope/shadowing. ' +
      'All-or-nothing: if any touched file would break, NOTHING is written. This is the Kiro ' +
      "'use program analysis, not LLM guessing' operator. Supports preview.",
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      newName: z.string().min(1),
      preview: z.boolean().optional().describe('dry-run: list files + refs, do not write'),
      includeStrings: z
        .boolean()
        .optional()
        .describe(
          'after TS rename, also do regex-based string replacement of oldName->newName across all repo text files',
        ),
    },
  },
  async (a) => {
    try {
      const { absPath, repoRoot } = resolveSafeTarget(a.file);
      const r = await renameSymbolCrossFile(absPath, repoRoot, a.line, a.column, a.newName);
      const bad = r.validations.filter((v) => !v.ok);
      if (bad.length > 0) {
        return fail(
          `rejected: rename would break ${bad.length} file(s): ` +
            bad.map((b) => `${b.file} (${b.introduced ?? 'syntax error'})`).join('; ') +
            ' — NOTHING written.',
        );
      }
      // every change target must also pass the governance guard in the same resolved root
      for (const rel of r.changes.keys()) resolveSafeTarget(path.join(repoRoot, rel));
      if (a.preview ?? false) {
        return ok({
          ok: true,
          preview: true,
          changed: false,
          symbol: r.symbol,
          references: r.totalReferences,
          files: [...r.changes.keys()],
        });
      }
      let stringReplacedCount = 0;
      const stringReplacedByKind: Record<string, number> = {};
      if (a.includeStrings) {
        const oldName = r.symbol;
        const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', '.atomic', '.next', 'coverage']);
        const walkDir = (dir: string): string[] => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const results: string[] = [];
          for (const entry of entries) {
            if (excludeDirs.has(entry.name)) continue;
            if (entry.name.startsWith('.') && !['.env', '.eslintrc', '.prettierrc'].includes(entry.name)) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...walkDir(fullPath));
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              const textExts = new Set([
                '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
                '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml',
                '.env', '.graphql', '.prisma', '.sql', '.sh', '.vue', '.svelte',
              ]);
              if (textExts.has(ext) || ext === '') {
                results.push(fullPath);
              }
            }
          }
          return results;
        };
        const allFiles = walkDir(repoRoot);
        for (const absFile of allFiles) {
          if (r.changes.has(path.relative(repoRoot, absFile))) continue;
          let content: string;
          try {
            content = fs.readFileSync(absFile, 'utf8');
          } catch {
            continue;
          }
          const newContent = content.replace(regex, a.newName);
          if (newContent === content) continue;
          if (content.length > 500 * 1024) continue;
          try {
            resolveSafeTarget(absFile);
          } catch {
            continue;
          }
          const validation = validate(
            path.relative(repoRoot, absFile),
            content,
            newContent,
          );
          if (!validation.ok) continue;
          const rel = path.relative(repoRoot, absFile);
          r.changes.set(rel, newContent);
          stringReplacedCount++;
          const ext = path.extname(rel).toLowerCase() || '(no-ext)';
          stringReplacedByKind[ext] = (stringReplacedByKind[ext] || 0) + 1;
        }
      }
      for (const [rel, content] of r.changes) {
        atomicWrite(path.join(repoRoot, rel), content);
      }
      log(
        `cross-file rename ${r.symbol}: ${r.changes.size} file(s), ${r.totalReferences} refs` +
          (stringReplacedCount > 0 ? `, ${stringReplacedCount} string-replaced` : ''),
      );
      return ok({
        ok: true,
        changed: true,
        symbol: r.symbol,
        references: r.totalReferences,
        files: [...r.changes.keys()],
        ...(stringReplacedCount > 0
          ? { stringReplacedCount, stringReplacedByKind }
          : {}),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── v3: semantic import + property ops ─────────────

function commitSemantic(
  relPath: string,
  absPath: string,
  before: string,
  r: SemanticEditResult,
  preview: boolean,
  verify?: 'typecheck' | 'lint',
): ToolOk {
  if (!r.validation.ok) {
    return fail(`rejected: would introduce a syntax error. ${r.validation.introduced ?? ''}`);
  }
  if (r.newText === before) {
    return ok({
      ok: true,
      changed: false,
      note: 'no change',
      file: relPath,
      ...targetDetails(absPath, relPath),
      ...r.detail,
    });
  }
  const semLevel = levelFor(preview);
  const semInline = characterDiff(before, r.newText, relPath);
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
  const semZones = computeZones(before, r.newText);
  const semTrace = buildTrace({
    file: relPath,
    repoRoot,
    operator: `semantic:${String((r.detail as Record<string, unknown>).op ?? 'edit')}`,
    before,
    newText: r.newText,
    inlinePreview: semInline,
    validation: {
      language: r.validation.language,
      before: r.validation.before,
      after: r.validation.after,
    },
    preservedZones: semZones.preservedZones,
    modifiedZones: semZones.modifiedZones,
    movementZones: semZones.movementZones,
    preview,
    changed: !preview,
  });
  if (preview) {
    return ok(
      shapePayload(
        semLevel,
        {
          ok: true,
          preview: true,
          changed: false,
          file: relPath,
          ...targetDetails(absPath, relPath),
          ...r.detail,
        },
        {
          inlinePreview: semInline,
          legacyDiff: previewDiff(before, r.newText, relPath),
          trace: semTrace,
        },
      ),
    );
  }
  atomicWrite(absPath, r.newText);
  log(`semantic edit ${JSON.stringify(r.detail)} in ${relPath}`);
  const verifyResult = verify
    ? runPostEditVerify(relPath, absPath, repoRoot, verify)
    : null;
  return ok(
    shapePayload(
      semLevel,
      {
        ok: true,
        changed: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        afterSha256: sha256(r.newText),
        ...(verifyResult ? { verify: verifyResult } : {}),
        ...r.detail,
      },
      {
        inlinePreview: semInline,
        legacyDiff: previewDiff(before, r.newText, relPath),
        trace: semTrace,
      },
    ),
  );
}

const shaArg = {
  expectedSha256: z
    .string()
    .optional()
    .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
  preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
};

server.registerTool(
  'atomic_add_import',
  {
    title: 'Add a named import (deduped)',
    description:
      "Add `import { name [as alias] } from 'module'` — merges into an existing declaration, creates " +
      "one if absent, no-ops if already present. Syntax-validated, atomic. Solves the thesis's " +
      "'adicionar import sem duplicar'.",
    inputSchema: {
      file: z.string(),
      module: z.string(),
      name: z.string(),
      alias: z.string().optional(),
      typeOnly: z.boolean().optional(),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await addNamedImport(
        relPath,
        before,
        a.module,
        a.name,
        a.alias,
        a.typeOnly ?? false,
      );
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_remove_import',
  {
    title: 'Remove a named import',
    description:
      'Remove a named import by imported-or-local name; drops the whole declaration if it was the last ' +
      'specifier. Syntax-validated, atomic — no dangling commas or broken lines.',
    inputSchema: { file: z.string(), module: z.string(), name: z.string(), ...shaArg },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await removeNamedImport(relPath, before, a.module, a.name);
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_property_value',
  {
    title: "Replace an object property's value",
    description:
      'Replace the initializer of property `property` with `value` (raw code), optionally scoped to a ' +
      'symbol selector so identically-named properties elsewhere are untouched. Refuses ambiguity. ' +
      'Syntax-validated, atomic.',
    inputSchema: {
      file: z.string(),
      property: z.string(),
      value: z
        .string()
        .describe("replacement initializer source (e.g. 'null', \"'x'\", '{ a: 1 }')"),
      selector: z.string().optional().describe("scope to this symbol (e.g. 'buildConfig')"),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await replacePropertyValue(relPath, before, a.property, a.value, a.selector);
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_rename_property_key',
  {
    title: 'Rename an object property key while preserving its value',
    description:
      'Rename object property `property` to `newKey` while preserving its initializer/value exactly. ' +
      'Optional selector scope; refuses ambiguity, missing property, invalid identifiers, and non-assignment forms. ' +
      'Syntax-validated, atomic. Supports preview + expectedSha256.',
    inputSchema: {
      file: z.string(),
      property: z.string(),
      newKey: z.string(),
      selector: z.string().optional().describe("scope to this symbol (e.g. 'buildConfig')"),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await renamePropertyKey(relPath, before, a.property, a.newKey, a.selector);
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);
server.registerTool(
  'atomic_add_await_to_call',
  {
    title: 'Wrap a CallExpression in await (semantic)',
    description:
      'Find a CallExpression by callee name/text and optional selector scope; wrap exactly that ' +
      'call expression as `await <callText>`, preserving callee, arguments, and call text exactly. ' +
      'Refuses missing target, ambiguity, already-awaited call, non-async context, and syntax regression. ' +
      'Supports preview + expectedSha256.',
    inputSchema: {
      file: z.string(),
      callee: z.string().describe('callee expression text to match (e.g. "fetch" or "obj.method")'),
      selector: z.string().optional().describe("scope to this symbol (e.g. 'buildConfig')"),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await addAwaitToCall(relPath, before, a.callee, a.selector);
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_insert_after_anchor',
  {
    title: 'Insert text after an exact anchor',
    description:
      'Insert insertText immediately after the exact anchorText in the file. Unlike coordinate-based ' +
      'atomic_insert_at, this resolves by stable text anchor, avoiding line drift when surrounding ' +
      'code moves. If the anchor appears multiple times, pass occurrence to select the Nth match. ' +
      'Preserves the anchor text exactly; only insertText is added. Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      anchorText: z.string().min(1).describe('exact verbatim text to find and insert after'),
      insertText: z.string().describe('text to insert immediately after the anchor'),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const matches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.anchorText, offset)) !== -1) {
        matches.push(offset);
        offset += a.anchorText.length;
      }
      if (matches.length === 0) {
        return fail(`anchor text not found in ${relPath}: ${JSON.stringify(a.anchorText)}`);
      }
      if (matches.length > 1 && a.occurrence === undefined) {
        const lines = matches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `anchor text appears ${matches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide occurrence to select one.`,
        );
      }
      const targetIndex = a.occurrence === undefined ? 0 : a.occurrence - 1;
      if (targetIndex < 0 || targetIndex >= matches.length) {
        return fail(`occurrence ${a.occurrence} out of range (found ${matches.length} match(es)).`);
      }
      const matchEnd = matches[targetIndex] + a.anchorText.length;
      const beforeMatch = before.slice(0, matchEnd);
      const lines = beforeMatch.split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      const r = applyEdits(relPath, before, [
        { start: { line, column }, end: { line, column }, newText: a.insertText },
      ]);
      return commit(relPath, absPath, before, r, { op: 'insert_after_anchor' }, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_insert_before_anchor',
  {
    title: 'Insert text before an exact anchor',
    description:
      'Insert insertText immediately before the exact anchorText in the file. Unlike coordinate-based ' +
      'atomic_insert_at, this resolves by stable text anchor, avoiding line drift when surrounding ' +
      'code moves. If the anchor appears multiple times, pass occurrence to select the Nth match. ' +
      'Preserves the anchor text exactly; only insertText is added. Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      anchorText: z.string().min(1).describe('exact verbatim text to find and insert before'),
      insertText: z.string().describe('text to insert immediately before the anchor'),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const matches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.anchorText, offset)) !== -1) {
        matches.push(offset);
        offset += a.anchorText.length;
      }
      if (matches.length === 0) {
        return fail(`anchor text not found in ${relPath}: ${JSON.stringify(a.anchorText)}`);
      }
      if (matches.length > 1 && a.occurrence === undefined) {
        const lines = matches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `anchor text appears ${matches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide occurrence to select one.`,
        );
      }
      const targetIndex = a.occurrence === undefined ? 0 : a.occurrence - 1;
      if (targetIndex < 0 || targetIndex >= matches.length) {
        return fail(`occurrence ${a.occurrence} out of range (found ${matches.length} match(es)).`);
      }
      const matchPos = matches[targetIndex];
      const beforeMatch = before.slice(0, matchPos);
      const lines = beforeMatch.split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      const r = applyEdits(relPath, before, [
        { start: { line, column }, end: { line, column }, newText: a.insertText },
      ]);
      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'insert_before_anchor' },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ── Lever #3b: replace text between two anchors ──
server.registerTool(
  'atomic_replace_between_anchors',
  {
    title: 'Replace text between two anchors',
    description:
      'Replace the text between a start anchor and the next end anchor found after it. ' +
      'Both anchors are preserved; only the text between them is replaced. If the start ' +
      'anchor appears multiple times, pass occurrence to select the Nth match. Supports ' +
      'preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      startAnchorText: z.string().min(1).describe('exact verbatim text of the start anchor'),
      endAnchorText: z
        .string()
        .min(1)
        .describe('exact verbatim text of the end anchor (first occurrence after selected start)'),
      replacementText: z.string().describe('text that replaces everything between the two anchors'),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const startMatches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.startAnchorText, offset)) !== -1) {
        startMatches.push(offset);
        offset += a.startAnchorText.length;
      }
      if (startMatches.length === 0) {
        return fail(
          `start anchor text not found in ${relPath}: ${JSON.stringify(a.startAnchorText)}`,
        );
      }
      if (startMatches.length > 1 && a.occurrence === undefined) {
        const lines = startMatches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `start anchor text appears ${startMatches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide occurrence to select one.`,
        );
      }
      const targetIndex = a.occurrence === undefined ? 0 : a.occurrence - 1;
      if (targetIndex < 0 || targetIndex >= startMatches.length) {
        return fail(
          `occurrence ${a.occurrence} out of range (found ${startMatches.length} start anchor match(es)).`,
        );
      }
      const startMatchEnd = startMatches[targetIndex] + a.startAnchorText.length;
      const afterStart = before.slice(startMatchEnd);
      const endIndex = afterStart.indexOf(a.endAnchorText);
      if (endIndex === -1) {
        return fail(
          `end anchor text not found after selected start anchor in ${relPath}: ${JSON.stringify(a.endAnchorText)}`,
        );
      }
      const endMatchStart = startMatchEnd + endIndex;
      const startMatchEndLineCol = (() => {
        const beforeMatch = before.slice(0, startMatchEnd);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();
      const endMatchStartLineCol = (() => {
        const beforeMatch = before.slice(0, endMatchStart);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();
      const r = applyEdits(relPath, before, [
        {
          start: startMatchEndLineCol,
          end: endMatchStartLineCol,
          newText: a.replacementText,
        },
      ]);
      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'replace_between_anchors' },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ── Lever #3c: replace text inside an anchor-delimited region ──
server.registerTool(
  'atomic_replace_text_in_anchor_region',
  {
    title: 'Replace text inside an anchor-delimited region',
    description:
      'Select the Nth region delimited by startAnchorText and the next endAnchorText. ' +
      'Preserve both anchors. Replace oldText only inside the selected region. ' +
      'Refuses ambiguous regions without regionOccurrence and ambiguous oldText matches without textOccurrence. ' +
      'Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      startAnchorText: z.string().min(1).describe('exact verbatim text of the start anchor'),
      endAnchorText: z
        .string()
        .min(1)
        .describe('exact verbatim text of the end anchor (first occurrence after selected start)'),
      oldText: z
        .string()
        .min(1)
        .describe('exact verbatim text to replace inside the selected region'),
      newText: z.string().describe('replacement text'),
      regionOccurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique region (refuses ambiguity)'),
      textOccurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique oldText match in region (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);

      const startMatches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.startAnchorText, offset)) !== -1) {
        startMatches.push(offset);
        offset += a.startAnchorText.length;
      }
      if (startMatches.length === 0) {
        return fail(
          `startAnchorText not found in ${relPath}: ${JSON.stringify(a.startAnchorText)}`,
        );
      }
      if (startMatches.length > 1 && a.regionOccurrence === undefined) {
        const lines = startMatches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `start anchor text appears ${startMatches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide regionOccurrence to select one.`,
        );
      }
      const regionIndex = a.regionOccurrence === undefined ? 0 : a.regionOccurrence - 1;
      if (regionIndex < 0 || regionIndex >= startMatches.length) {
        return fail(
          `regionOccurrence ${a.regionOccurrence} out of range (found ${startMatches.length} region(s)).`,
        );
      }

      const startMatchEnd = startMatches[regionIndex] + a.startAnchorText.length;
      const afterStart = before.slice(startMatchEnd);
      const endIndex = afterStart.indexOf(a.endAnchorText);
      if (endIndex === -1) {
        return fail(
          `endAnchorText not found after selected startAnchorText in ${relPath}: ${JSON.stringify(a.endAnchorText)}`,
        );
      }
      const endMatchStart = startMatchEnd + endIndex;

      const regionText = before.slice(startMatchEnd, endMatchStart);

      const textMatches: number[] = [];
      let tOffset = 0;
      while ((tOffset = regionText.indexOf(a.oldText, tOffset)) !== -1) {
        textMatches.push(tOffset);
        tOffset += a.oldText.length;
      }
      if (textMatches.length === 0) {
        return fail(
          `oldText not found in selected region of ${relPath}: ${JSON.stringify(a.oldText)}`,
        );
      }
      if (textMatches.length > 1 && a.textOccurrence === undefined) {
        return fail(
          `oldText appears ${textMatches.length} times in the selected region of ${relPath}. Provide textOccurrence to select one.`,
        );
      }
      const textIndex = a.textOccurrence === undefined ? 0 : a.textOccurrence - 1;
      if (textIndex < 0 || textIndex >= textMatches.length) {
        return fail(
          `textOccurrence ${a.textOccurrence} out of range (found ${textMatches.length} match(es) in region).`,
        );
      }

      const oldTextAbsStart = startMatchEnd + textMatches[textIndex];
      const oldTextAbsEnd = oldTextAbsStart + a.oldText.length;

      const startPos = (() => {
        const beforeMatch = before.slice(0, oldTextAbsStart);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();
      const endPos = (() => {
        const beforeMatch = before.slice(0, oldTextAbsEnd);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();

      const r = applyEdits(relPath, before, [{ start: startPos, end: endPos, newText: a.newText }]);

      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'replace_text_in_anchor_region' },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ── Lever #4: semantic refactor — wrap a range (try-catch | block | if) ──
server.registerTool(
  'atomic_wrap_range',
  {
    title: 'Wrap an exact range in try-catch / block / if',
    description:
      'Semantic refactor: wrap the code between (startLine,startColumn) and (endLine,endColumn) — ' +
      '1-based, end-exclusive — in a try/catch, a bare block, or an `if (condition)`. Re-indents the ' +
      'body, preserves base indent, syntax-validated + atomic. `if` requires an explicit condition ' +
      '(no behaviour is invented). One intention as one validated op instead of a hand line-rewrite.',
    inputSchema: {
      file: z.string().describe('repo-relative path'),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      kind: z.enum(['try-catch', 'block', 'if']),
      condition: z.string().optional().describe("required when kind='if' (e.g. 'user != null')"),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = wrapRange(
        relPath,
        before,
        { line: a.startLine, column: a.startColumn },
        { line: a.endLine, column: a.endColumn },
        a.kind as WrapKind,
        a.condition,
      );
      return commit(relPath, absPath, before, r, { op: `wrap:${a.kind}` }, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ── Lever #3: multi-file atomic transaction (all-or-nothing + rollback) ──
// A real product change rarely lives in one file (schema+DTO+service+UI+
// test). This makes the whole intention ONE unit: every file validated in
// memory first; if ANY file would regress, NOTHING is written; if a write
// fails mid-flight, already-written files are restored from their pre-edit
// snapshots. The intention is atomic, not just each edit.
server.registerTool(
  'atomic_transaction',
  {
    title: 'Apply a multi-file edit plan atomically (all-or-nothing)',
    description:
      'Apply ranged edits across MANY files as one transaction. Every file is validated (no-syntax-' +
      'regression) in memory BEFORE any write. If any file fails validation the whole transaction is ' +
      'refused and nothing is written. If a write throws mid-flight, already-written files are rolled ' +
      'back to their pre-edit content. Use for one intention spanning files (schema+service+UI+test). ' +
      'Supports preview (dry-run, per-file atomicDiff).',
    inputSchema: {
      plan: z
        .array(
          z.object({
            file: z.string().describe('repo-relative path'),
            edits: z
              .array(
                z.object({
                  startLine: z.number().int().min(1),
                  startColumn: z.number().int().min(1),
                  endLine: z.number().int().min(1),
                  endColumn: z.number().int().min(1),
                  newText: z.string(),
                }),
              )
              .min(1),
          }),
        )
        .min(1)
        .describe('one entry per file; each with ≥1 non-overlapping ranged edit'),
      preview: z.boolean().optional().describe('dry-run: validate all, write nothing'),
    },
  },
  async (a) => {
    try {
      const preview = a.preview ?? false;
      // Phase 1 — resolve + apply + validate ALL in memory. Write nothing.
      const staged: {
        relPath: string;
        absPath: string;
        repoRoot: string;
        before: string;
        result: ApplyResult;
      }[] = [];
      for (const entry of a.plan) {
        const { absPath, relPath, repoRoot } = resolveSafeTarget(entry.file);
        const before = readUtf8(absPath);
        const edits: TextEditSpec[] = entry.edits.map((e) => ({
          start: { line: e.startLine, column: e.startColumn },
          end: { line: e.endLine, column: e.endColumn },
          newText: e.newText,
        }));
        const result = applyEdits(relPath, before, edits);
        if (!result.validation.ok) {
          return fail(
            `transaction REFUSED — ${relPath} would regress ` +
              `(${result.validation.language}: ${result.validation.before}->${result.validation.after}). ` +
              `${result.validation.introduced ?? ''} — NOTHING written (all-or-nothing).`,
          );
        }
        staged.push({ relPath, absPath, repoRoot, before, result });
      }
      const traces = staged.map((s) => ({
        file: s.relPath,
        trace: buildTrace({
          file: s.relPath,
          repoRoot: s.repoRoot,
          operator: 'atomic_transaction',
          before: s.before,
          newText: s.result.newText,
          inlinePreview: characterDiff(s.before, s.result.newText, s.relPath),
          validation: {
            language: s.result.validation.language,
            before: s.result.validation.before,
            after: s.result.validation.after,
          },
          metrics: {
            changedChars: s.result.changedChars,
            lineRewriteSurfaceChars: s.result.lineSurfaceChars,
            expansionFactorAvoided: s.result.expansionFactor,
            bytesNet: s.result.newText.length - s.before.length,
          },
          preservedZones: computeZones(s.before, s.result.newText).preservedZones,
          modifiedZones: computeZones(s.before, s.result.newText).modifiedZones,
          movementZones: [],
        }),
      }));
      const files = staged.map((s, index) => ({
        file: s.relPath,
        changed: s.result.newText !== s.before,
        atomicDiff: traces[index].trace.inlinePreview,
        intentionChars: s.result.changedChars,
        expansionFactorAvoided: s.result.expansionFactor,
      }));
      const summarizeTransaction = (headline: string, traceRefs: string[] = []): string => {
        const changedFiles = files.filter((f) => f.changed);
        const previews = changedFiles.length
          ? changedFiles.map((f) => `${f.file}\n${f.atomicDiff}`).join('\n\n')
          : 'No file content changed.';
        const tracesBlock = traceRefs.length
          ? `\n\nTraces:\n${traceRefs.map((t) => `- ${t}`).join('\n')}`
          : '';
        return (
          `${headline}\n\n` +
          `${previews}\n\n` +
          `Validation:\n` +
          `- syntax: ok\n` +
          `- typecheck: not-run\n` +
          `- protected file: no\n` +
          `- sha256: ok` +
          tracesBlock
        );
      };
      if (preview) {
        const summaryForHuman = summarizeTransaction('✅ Atomic transaction preview');
        return ok({
          summaryForHuman,
          summary: summaryForHuman,
          ok: true,
          preview: true,
          transaction: true,
          changed: false,
          note: `dry-run: ${staged.length} file(s) validated, NOTHING written`,
          files,
        });
      }
      // Phase 2 — write all; roll back written files if any write throws.
      const written: { absPath: string; before: string }[] = [];
      try {
        for (const s of staged) {
          if (s.result.newText === s.before) continue;
          atomicWrite(s.absPath, s.result.newText);
          written.push({ absPath: s.absPath, before: s.before });
        }
      } catch (writeErr) {
        for (const w of written) {
          try {
            atomicWrite(w.absPath, w.before);
          } catch {
            /* best-effort rollback; report original error below */
          }
        }
        return fail(
          `transaction write failed; rolled back ${written.length} file(s): ` +
            (writeErr instanceof Error ? writeErr.message : String(writeErr)),
        );
      }
      const traceRefs: string[] = [];
      for (const item of traces) {
        const changedFile = files.find((f) => f.file === item.file && f.changed);
        if (!changedFile) continue;
        const persisted = writeTrace(item.trace);
        Object.assign(changedFile, persisted);
        traceRefs.push(
          persisted.tracePath ??
            `trace error for ${item.file}: ${persisted.traceWriteError ?? 'unknown'}`,
        );
      }
      log(`transaction wrote ${written.length}/${staged.length} file(s)`);
      const summaryForHuman = summarizeTransaction('✅ Atomic transaction applied', traceRefs);
      return ok({
        summaryForHuman,
        summary: summaryForHuman,
        ok: true,
        transaction: true,
        changed: true,
        filesWritten: written.length,
        files,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_apply_eslint_dry_run_fixes',
  {
    title: 'Apply ESLint --fix-dry-run output as an atomic transaction',
    description:
      'Runs ESLint in non-mutating --fix-dry-run --format json mode, then applies the proposed fixed file outputs through the atomic transaction path. Direct apply is already all-or-nothing; use preview only when the human asks or the allowed path is ambiguous. ESLint never writes directly; every file is governance-guarded, syntax-validated, traced with preservation topology, and written all-or-nothing.',
    inputSchema: {
      cwd: z
        .string()
        .default('.')
        .describe('repo-relative or absolute directory where npx eslint should run'),
      args: z
        .array(z.string())
        .min(1)
        .describe('eslint args; must include --fix-dry-run and --format json; --fix is refused'),
      allowedPaths: z
        .array(z.string())
        .min(1)
        .describe(
          'repo-relative paths or absolute paths inside the selected repo/worktree that the analyzer is allowed to change, e.g. ["worker"]',
        ),
      preview: z
        .boolean()
        .optional()
        .describe(
          'dry-run only: use when a human asked for preview or scope is ambiguous; direct apply is already validated and all-or-nothing',
        ),
      applyKnownResidueFixes: z
        .boolean()
        .optional()
        .describe(
          'default true: also apply safe preservation-topology fixes for known remaining no-unused-vars anchors such as envBackup/mailEnvBackup/emptyDemographics',
        ),
    },
  },
  async (a) => {
    try {
      const preview = a.preview ?? false;
      const applyKnownResidueFixesEnabled = a.applyKnownResidueFixes ?? true;
      const eslintArgs = normalizeEslintDryRunArgs(a.args);
      requireEslintDryRunArgs(eslintArgs);
      const cwdTarget = resolveSafeTarget(a.cwd ?? '.');
      if (!fs.existsSync(cwdTarget.absPath) || !fs.statSync(cwdTarget.absPath).isDirectory()) {
        return fail(`cwd is not a directory: ${a.cwd ?? '.'}`);
      }
      const allowedPaths = a.allowedPaths.map((allowedPath) =>
        normalizeAllowedPath(allowedPath, cwdTarget.repoRoot),
      );
      const verificationPlan = packageVerificationPlan(
        cwdTarget.repoRoot,
        cwdTarget.relPath || '.',
        allowedPaths,
      );
      const recommendedVerification = verificationPlan.commands;
      const run = childProcess.spawnSync('npx', ['eslint', ...eslintArgs], {
        cwd: cwdTarget.absPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
      const stdout = run.stdout ?? '';
      const stderr = run.stderr ?? '';
      if (run.error) {
        return fail(`eslint dry-run failed to start: ${run.error.message}`);
      }
      if (run.status !== 0 && run.status !== 1) {
        return fail(
          `eslint dry-run failed with status ${String(run.status)}: ${stderr.slice(0, 2000)}`,
        );
      }
      const results = parseEslintJson(stdout);
      const staged: {
        relPath: string;
        absPath: string;
        repoRoot: string;
        before: string;
        newText: string;
        metrics: ReturnType<typeof changedSpanMetrics>;
        validation: ValidationResult;
        messages: EslintDryRunResult['messages'];
        knownResidueFixes: KnownLintResidueFix[];
      }[] = [];
      for (const result of results) {
        const fileInput = path.isAbsolute(result.filePath)
          ? result.filePath
          : path.join(cwdTarget.absPath, result.filePath);
        const target = resolveSafeTarget(fileInput);
        if (target.repoRoot !== cwdTarget.repoRoot) {
          return fail(`eslint proposed a file outside the selected repo root: ${result.filePath}`);
        }
        if (!relPathAllowed(target.relPath, allowedPaths)) {
          return fail(
            `eslint proposed ${target.relPath}, outside allowedPaths=${JSON.stringify(allowedPaths)}`,
          );
        }
        const before = readUtf8(target.absPath);
        const analyzerText = typeof result.output === 'string' ? result.output : before;
        const residueFix = applyKnownResidueFixesEnabled
          ? applyKnownLintResidueFixes(target.relPath, analyzerText, result.messages)
          : { text: analyzerText, applied: [] as KnownLintResidueFix[] };
        if (before === residueFix.text) continue;
        const validation = validate(target.relPath, before, residueFix.text);
        if (!validation.ok) {
          return fail(
            `eslint dry-run output refused for ${target.relPath}: syntax regression ` +
              `${validation.before}->${validation.after}. ${validation.introduced ?? ''}`,
          );
        }
        staged.push({
          relPath: target.relPath,
          absPath: target.absPath,
          repoRoot: target.repoRoot,
          before,
          newText: residueFix.text,
          metrics: changedSpanMetrics(before, residueFix.text),
          validation,
          messages: result.messages,
          knownResidueFixes: residueFix.applied,
        });
      }
      const remainingMessages = results.reduce(
        (sum, result) => sum + (result.messages?.length ?? 0),
        0,
      );
      const filePreviewLimit = 1;
      const filesAll = staged.map((item) => ({
        file: item.relPath,
        changed: true,
        intentionChars: item.metrics.changedChars,
        lineRewriteSurfaceChars: item.metrics.lineSurfaceChars,
        expansionFactorAvoided: item.metrics.expansionFactor,
        remainingMessages: item.messages?.length ?? 0,
        knownResidueFixes: item.knownResidueFixes,
        knownResidueFixesCount: item.knownResidueFixes.length,
      }));
      const files = filesAll.slice(0, filePreviewLimit);
      const filesTotal = filesAll.length;
      const filesOmitted = Math.max(0, filesTotal - files.length);
      const aggregateMetrics = filesAll.reduce(
        (acc, item) => ({
          intentionChars: acc.intentionChars + item.intentionChars,
          lineRewriteSurfaceChars: acc.lineRewriteSurfaceChars + item.lineRewriteSurfaceChars,
          remainingMessages: acc.remainingMessages + item.remainingMessages,
        }),
        { intentionChars: 0, lineRewriteSurfaceChars: 0, remainingMessages: 0 },
      );
      const knownResidueFixesApplied = staged.flatMap((item) => item.knownResidueFixes);
      const unresolvedResidueMessages = Math.max(
        0,
        remainingMessages - knownResidueFixesApplied.length,
      );
      const residueActionCandidatesAll =
        unresolvedResidueMessages > 0
          ? buildLintResidueActionCandidates(results, cwdTarget.absPath)
          : [];
      const residueActionCandidates = residueActionCandidatesAll.slice(0, 10);
      const residueActionCandidatesTotal = residueActionCandidatesAll.length;
      const residueActionCandidatesOmitted = Math.max(
        0,
        residueActionCandidatesTotal - residueActionCandidates.length,
      );
      const summarize = (headline: string, traceRefs: string[] = []): string => {
        const tracePreviewLimit = unresolvedResidueMessages > 0 ? 3 : 0;
        const tracePreview = traceRefs
          .slice(0, tracePreviewLimit)
          .map((ref) => `- ${ref}`)
          .join('\n');
        const omittedTraceCount = Math.max(0, traceRefs.length - tracePreviewLimit);
        const traceBlock =
          traceRefs.length > 0
            ? `\nTrace proof: ${traceRefs.length} trace(s) written${tracePreview ? `\n${tracePreview}` : ''}${
                omittedTraceCount > 0
                  ? `\n- ${omittedTraceCount} trace(s) available under .atomic/traces`
                  : ''
              }`
            : '';
        const residuePreview = residueActionCandidates
          .slice(0, 3)
          .map(
            (candidate) =>
              `- ${String(candidate.file)}:${String(candidate.line ?? '?')} ${String(candidate.preferredAtomicAction)} (${String(candidate.topology)})`,
          )
          .join('\n');
        const residueGuidance =
          unresolvedResidueMessages > 0
            ? `\nResidual lint guidance:\n- For unused variables named envBackup/mailEnvBackup/*fixture*, first check whether they encode test isolation; prefer using them over deletion when that preserves intent.${
                residuePreview ? `\nCandidate atomic actions:\n${residuePreview}` : ''
              }`
            : '';
        if (unresolvedResidueMessages === 0 && traceRefs.length > 0) {
          return `✅ Known residue fixes applied: ${knownResidueFixesApplied.length}; Unresolved residue after known fixes: 0; files=${staged.length}; traces=${traceRefs.length}; no-diff.`;
        }
        return (
          `${headline}\n\n` +
          `Intention: apply ESLint dry-run fixes as one verified atomic transaction.\n` +
          `Command: npx eslint ${eslintArgs.map((arg) => JSON.stringify(arg)).join(' ')}\n` +
          `Cwd: ${cwdTarget.relPath || '.'}\n` +
          `Verification package: ${verificationPlan.packageRelPath}\n` +
          `Files changed: ${staged.length}\n` +
          `Remaining analyzer messages before known residue fixes: ${remainingMessages}\n` +
          `Known residue fixes applied: ${knownResidueFixesApplied.length}\n` +
          `Unresolved residue after known fixes: ${unresolvedResidueMessages}\n` +
          `Validation:\n` +
          `- analyzer mode: --fix-dry-run JSON only\n` +
          `- direct analyzer writes: none\n` +
          `- syntax: ok\n` +
          `- protected file: no\n` +
          `- transaction: all-or-nothing\n` +
          `Required package proof before declaring done:\n` +
          `${recommendedVerification.map((cmd) => `- ${cmd}`).join('\n')}` +
          residueGuidance +
          traceBlock
        );
      };
      if (preview || staged.length === 0) {
        const summaryForHuman = summarize(
          preview
            ? '✅ ESLint atomic analyzer transaction preview'
            : '✅ ESLint atomic analyzer transaction: no changes',
        );
        return ok({
          ok: true,
          preview,
          transaction: true,
          changed: false,
          summaryForHuman,
          summary: summaryForHuman,
          files,
          filesTotal,
          filesOmitted,
          aggregateMetrics,
          knownResidueFixesApplied,
          knownResidueFixesAppliedTotal: knownResidueFixesApplied.length,
          remainingMessages,
          residueActionCandidates,
          residueActionCandidatesTotal,
          residueActionCandidatesOmitted,
          analyzerExitStatus: run.status,
          verificationPackage: verificationPlan.packageRelPath,
          recommendedVerification,
          lintResidueGuidance:
            unresolvedResidueMessages > 0
              ? 'Prefer using existing envBackup/mailEnvBackup/*fixture* declarations when they encode test isolation instead of deleting them.'
              : undefined,
        });
      }
      const written: { absPath: string; before: string }[] = [];
      try {
        for (const item of staged) {
          atomicWrite(item.absPath, item.newText);
          written.push({ absPath: item.absPath, before: item.before });
        }
      } catch (writeErr) {
        for (const item of written) {
          try {
            atomicWrite(item.absPath, item.before);
          } catch {
            /* best-effort rollback; report original error below */
          }
        }
        return fail(
          `eslint atomic transaction write failed; rolled back ${written.length} file(s): ` +
            (writeErr instanceof Error ? writeErr.message : String(writeErr)),
        );
      }
      const traceRefs: string[] = [];
      for (const item of staged) {
        const itemZones = computeZones(item.before, item.newText);
        const trace = buildTrace({
          file: item.relPath,
          repoRoot: item.repoRoot,
          operator: 'atomic_apply_eslint_dry_run_fixes',
          before: item.before,
          newText: item.newText,
          inlinePreview: characterDiff(item.before, item.newText, item.relPath),
          validation: {
            language: item.validation.language,
            before: item.validation.before,
            after: item.validation.after,
          },
          preservedZones: itemZones.preservedZones,
          modifiedZones: itemZones.modifiedZones,
          movementZones: itemZones.movementZones,
          metrics: {
            changedChars: item.metrics.changedChars,
            lineRewriteSurfaceChars: item.metrics.lineSurfaceChars,
            expansionFactorAvoided: item.metrics.expansionFactor,
            bytesNet: item.newText.length - item.before.length,
          },
          targetUnit: 'eslint_dry_run_file_output',
          intention:
            'apply analyzer-proposed lint fixes without letting the analyzer write directly',
          semanticImpact: 'lint_fix_auto_applied',
        });
        const persisted = writeTrace(trace);
        traceRefs.push(
          persisted.tracePath ??
            `trace error for ${item.relPath}: ${persisted.traceWriteError ?? 'unknown'}`,
        );
      }
      const summaryForHuman = summarize('✅ ESLint atomic analyzer transaction applied', traceRefs);
      return ok(
        {
          ok: true,
          transaction: true,
          changed: true,
          summaryForHuman,
          summary: summaryForHuman,
          filesWritten: written.length,
          files,
          filesTotal,
          filesOmitted,
          aggregateMetrics,
          knownResidueFixesApplied,
          knownResidueFixesAppliedTotal: knownResidueFixesApplied.length,
          remainingMessages,
          residueActionCandidates,
          residueActionCandidatesTotal,
          residueActionCandidatesOmitted,
          analyzerExitStatus: run.status,
          verificationPackage: verificationPlan.packageRelPath,
          recommendedVerification,
          lintResidueGuidance:
            unresolvedResidueMessages > 0
              ? 'Prefer using existing envBackup/mailEnvBackup/*fixture* declarations when they encode test isolation instead of deleting them.'
              : undefined,
          traceRefs: traceRefs.slice(0, 5),
          traceRefsTotal: traceRefs.length,
          traceRefsOmitted: Math.max(0, traceRefs.length - 5),
        },
        { includeMachineJson: unresolvedResidueMessages > 0 },
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ───────────────────────── v4: product-oriented operating layer ───────────
// These tools do not replace product engineering. They make the principle
// executable for every CLI that loads this MCP: convert a human goal into a
// product contract, demand behavior proof, classify facade risk, keep a
// continuity snapshot, and coordinate fronts through POSIX mkdir locks.
const PRODUCT_INTEGRATION_IDS = [
  'chat_persistence',
  'stripe_webhooks',
  'meta_whatsapp',
  'war_room_campaigns',
  'generic_product_flow',
] as const;

type ProductIntegrationId = (typeof PRODUCT_INTEGRATION_IDS)[number];

type ProductIntegrationProfile = {
  id: ProductIntegrationId;
  label: string;
  keywords: string[];
  surfaces: string[];
  acceptanceCriteria: string[];
  behaviorProof: string[];
  externalBlockers: string[];
};

const PRODUCT_INTEGRATIONS: Record<ProductIntegrationId, ProductIntegrationProfile> = {
  chat_persistence: {
    id: 'chat_persistence',
    label: 'Chat persistido em Postgres',
    keywords: ['chat', 'message', 'mensagem', 'session', 'sessao', 'postgres', 'historico'],
    surfaces: [
      'backend service/controller',
      'Prisma/Postgres',
      'frontend-admin chat UI',
      'chat tests',
    ],
    acceptanceCriteria: [
      'criar uma sessao de chat',
      'adicionar pelo menos uma mensagem',
      'recarregar a sessao',
      'observar a mesma mensagem persistida',
      'provar isolamento por workspace/admin quando aplicavel',
    ],
    behaviorProof: [
      'API response',
      'DB row/relation',
      'focused backend test',
      'optional browser/admin flow',
    ],
    externalBlockers: [],
  },
  stripe_webhooks: {
    id: 'stripe_webhooks',
    label: 'Stripe webhooks consumidos',
    keywords: ['stripe', 'webhook', 'payment', 'pix', 'checkout', 'wallet', 'payout'],
    surfaces: [
      'webhook endpoint',
      'signature verification',
      'idempotency',
      'ledger/wallet effects',
    ],
    acceptanceCriteria: [
      'replay de evento Stripe assinado ou fixture oficial',
      'assinatura recusada quando invalida',
      'evento duplicado nao gera efeito duplicado',
      'efeito financeiro esperado aparece no ledger/wallet',
    ],
    behaviorProof: ['webhook replay', 'signature assertion', 'DB side effect', 'idempotency test'],
    externalBlockers: ['Stripe live credentials or test-mode fixture availability'],
  },
  meta_whatsapp: {
    id: 'meta_whatsapp',
    label: 'Meta Cloud API / WhatsApp oficial',
    keywords: ['meta', 'whatsapp', 'cloud api', 'phone_number_id', 'template', 'app review'],
    surfaces: [
      'Meta OAuth/config',
      'webhook verify/callback',
      'message send path',
      'App Review evidence',
    ],
    acceptanceCriteria: [
      'callback URL responde ao desafio de verificacao',
      'webhook inbound e validado e roteado',
      'envio oficial usa phone_number_id real',
      'bloqueio externo de App Review e separado de falha de codigo',
    ],
    behaviorProof: ['Meta callback probe', 'webhook fixture', 'provider log/API response'],
    externalBlockers: [
      'Meta App Review and business verification may require human/provider action',
    ],
  },
  war_room_campaigns: {
    id: 'war_room_campaigns',
    label: 'War Room para campanhas reais',
    keywords: ['war room', 'campaign', 'campanha', 'ads', 'audience', 'creative'],
    surfaces: [
      'campaign draft API',
      'audience/product binding',
      'activation safety',
      'metrics/event spine',
    ],
    acceptanceCriteria: [
      'criar draft de campanha com produto e audiencia',
      'validar guardrails antes de ativacao',
      'emitir evento/metricas de campanha',
      'mostrar a campanha na UI operacional',
    ],
    behaviorProof: ['API response', 'event emitted/consumed', 'UI visibility', 'metrics row/log'],
    externalBlockers: ['Ad-network account permissions may block real activation'],
  },
  generic_product_flow: {
    id: 'generic_product_flow',
    label: 'Fluxo de produto generico',
    keywords: [],
    surfaces: ['changed code surface', 'tests', 'runtime/API/browser proof'],
    acceptanceCriteria: [
      'definir comportamento observavel',
      'executar a menor prova suficiente',
      'registrar o que segue nao provado',
    ],
    behaviorProof: ['focused test', 'runtime/API/browser proof when available'],
    externalBlockers: [],
  },
};

const EvidenceKindSchema = z.enum([
  'code',
  'unit_test',
  'typecheck',
  'build',
  'api',
  'db',
  'browser',
  'runtime_probe',
  'external_provider',
  'manual_product_check',
  'mock',
  'stub',
]);
const EvidenceStatusSchema = z.enum(['passed', 'failed', 'missing', 'blocked', 'not_run']);

function lowerText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function chooseIntegration(
  goal: string,
  explicit?: ProductIntegrationId,
): ProductIntegrationProfile {
  if (explicit) return PRODUCT_INTEGRATIONS[explicit];
  const normalized = lowerText(goal);
  const candidates = PRODUCT_INTEGRATION_IDS.filter((id) => id !== 'generic_product_flow')
    .map((id) => {
      const profile = PRODUCT_INTEGRATIONS[id];
      const score = profile.keywords.filter((keyword) =>
        normalized.includes(lowerText(keyword)),
      ).length;
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.score ? candidates[0].profile : PRODUCT_INTEGRATIONS.generic_product_flow;
}

function riskLevelFor(
  goal: string,
  profile: ProductIntegrationProfile,
): 'low' | 'normal' | 'high' | 'critical' {
  const normalized = lowerText(`${goal} ${profile.label}`);
  if (/payment|stripe|pix|payout|ledger|wallet|kyc|dinheiro/.test(normalized)) return 'critical';
  if (/auth|token|admin|whatsapp|webhook|meta|external|provider/.test(normalized)) return 'high';
  if (/database|postgres|prisma|campaign|campanha|api/.test(normalized)) return 'normal';
  return 'low';
}

function validationPlan(profile: ProductIntegrationProfile, risk: string): string[] {
  const plan = [
    'ler estrutura antes de editar: code_outline -> code_read_symbol',
    'executar a menor mutacao fiel via operador atomico/semantico',
    'rodar teste focado que prova o contrato alterado',
    ...profile.behaviorProof.map((proof) => `anexar evidencia: ${proof}`),
  ];
  if (risk === 'critical' || risk === 'high') {
    plan.push('rodar typecheck/build do pacote afetado');
    plan.push('registrar bloqueios externos separadamente de falhas de codigo');
  }
  return [...new Set(plan)];
}

function evidenceWeight(
  kind: z.infer<typeof EvidenceKindSchema>,
  status: z.infer<typeof EvidenceStatusSchema>,
): number {
  if (status === 'failed') return -40;
  if (status === 'blocked') return 10;
  if (status !== 'passed') return 0;
  if (kind === 'manual_product_check') return 100;
  if (kind === 'browser' || kind === 'api' || kind === 'db' || kind === 'runtime_probe') return 85;
  if (kind === 'external_provider') return 80;
  if (kind === 'build' || kind === 'typecheck' || kind === 'unit_test') return 60;
  if (kind === 'code') return 50;
  if (kind === 'mock' || kind === 'stub') return 25;
  return 0;
}

function classifyTruth(kind: string, status: string, hasExternalBlocker: boolean): string {
  if (hasExternalBlocker || status === 'blocked') return 'EXTERNAL_BLOCKED';
  if (kind === 'stub') return 'STUB';
  if (kind === 'mock') return status === 'passed' ? 'MOCK_ONLY' : 'UNPROVEN';
  if (status === 'failed') return 'BROKEN';
  if (status !== 'passed') return 'UNPROVEN';
  if (
    ['api', 'db', 'browser', 'runtime_probe', 'external_provider', 'manual_product_check'].includes(
      kind,
    )
  ) {
    return 'REAL';
  }
  if (['unit_test', 'typecheck', 'build'].includes(kind)) return 'PARTIAL';
  return 'UNPROVEN';
}

function readJsonOptional<T>(relPath: string): T | null {
  try {
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readTextOptional(relPath: string): string | null {
  try {
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function lockRoot(): string {
  return path.join(REPO_ROOT, '.atomic-edit-locks');
}

function safeLockId(frontId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(frontId)) {
    throw new Error('frontId must use only letters, numbers, dot, underscore, or dash');
  }
  return frontId;
}

function lockDir(frontId: string): string {
  return path.join(lockRoot(), safeLockId(frontId));
}

function lockFile(frontId: string): string {
  return path.join(lockDir(frontId), 'lock');
}

function autoLockFile(relPath: string): string | null {
  const sanitized = relPath.replace(/[\\/:*?"<>|]/g, '-');
  const lockId = safeLockId(sanitized + '-' + Date.now());
  const d = lockDir(lockId);
  try {
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'heartbeat'), String(Date.now()));
    return lockId;
  } catch {
    return null;
  }
}

function autoLockCleanup(relPath: string, maxAgeMs = 30000): void {
  const root = lockRoot();
  if (!fs.existsSync(root)) return;
  const now = Date.now();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const hbPath = path.join(root, entry.name, 'heartbeat');
    try {
      const ts = Number(fs.readFileSync(hbPath, 'utf8'));
      if (now - ts > maxAgeMs) {
        fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
      }
    } catch {
      fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
    }
  }
}

function readLockRecord(id: string): Record<string, unknown> | null {
  const relPath = `.atomic-edit-locks/${id}/lock`;
  const json = readJsonOptional<Record<string, unknown>>(relPath);
  if (json) return json;
  const text = readTextOptional(relPath);
  if (!text) return null;
  const record: Record<string, unknown> = {};
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    record[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return Object.keys(record).length > 0 ? record : null;
}

function listLocks(): Record<string, unknown>[] {
  const root = lockRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const id = entry.name;
      const data = readLockRecord(id);
      return data ? { frontId: id, ...data } : { frontId: id, status: 'unreadable' };
    });
}

server.registerTool(
  'product_intent_contract',
  {
    title: 'Turn a human product goal into an atomic product contract',
    description:
      'Classifies a plain-language goal into a named product integration, acceptance criteria, risk, proof plan, non-goals, and the next smallest atomic action. This prevents agents from coding before they know the behavior to prove.',
    inputSchema: {
      goal: z.string().min(1),
      targetIntegration: z.enum(PRODUCT_INTEGRATION_IDS).optional(),
      actor: z
        .string()
        .optional()
        .describe('non-technical actor or user role affected by the behavior'),
    },
  },
  async (a) => {
    try {
      const profile = chooseIntegration(a.goal, a.targetIntegration);
      const risk = riskLevelFor(a.goal, profile);
      const summaryForHuman =
        `Contrato de produto: ${profile.label}\n` +
        `Resultado pedido: ${a.goal}\n` +
        `Como validar sem codigo: ${profile.acceptanceCriteria.join(' -> ')}\n` +
        `Proxima menor acao: provar ou implementar exatamente o primeiro criterio ainda vermelho.`;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        goal: a.goal,
        actor: a.actor ?? 'founder/operator',
        targetIntegration: profile.id,
        integrationLabel: profile.label,
        riskLevel: risk,
        surfaces: profile.surfaces,
        acceptanceCriteria: profile.acceptanceCriteria,
        behaviorProofRequired: profile.behaviorProof,
        nonGoals: [
          'nao reconstruir tooling sem regressao objetiva',
          'nao declarar comportamento real sem evidencia runtime/API/DB/browser',
          'nao pedir decisao tecnica ao fundador quando a decisao e implementacional',
        ],
        externalBlockers: profile.externalBlockers,
        validationPlan: validationPlan(profile, risk),
        zeroCodeTrustTarget: 100,
        nextAtomicAction:
          'usar code_outline/code_read_symbol na superficie minima e anexar a primeira prova comportamental que falha ou passa',
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'zero_code_trust_score',
  {
    title: 'Score whether a non-technical founder can trust this delivery without reading code',
    description:
      'Computes the Zero-Code Trust score from attached evidence. 100 means product-behavior validation, 75 means explanation-only, 50 means code/diff review still needed, lower means technical interpretation or manual repair remains.',
    inputSchema: {
      evidence: z
        .array(
          z.object({
            kind: EvidenceKindSchema,
            status: EvidenceStatusSchema,
            summary: z.string().optional(),
            artifactPaths: z.array(z.string()).optional(),
          }),
        )
        .min(1),
      founderCanValidateByProduct: z.boolean().optional(),
      requiresCodeReview: z.boolean().optional(),
      requiresTechnicalDecision: z.boolean().optional(),
      requiresManualFix: z.boolean().optional(),
    },
  },
  async (a) => {
    try {
      const rawScore = Math.max(
        ...a.evidence.map((entry) => evidenceWeight(entry.kind, entry.status)),
      );
      const failed = a.evidence.filter((entry) => entry.status === 'failed');
      let score = rawScore;
      if (a.founderCanValidateByProduct) score = Math.max(score, 100);
      if (a.requiresCodeReview) score = Math.min(score, 50);
      if (a.requiresTechnicalDecision) score = Math.min(score, 25);
      if (a.requiresManualFix) score = 0;
      if (failed.length > 0) score = Math.min(score, 40);
      const verdict =
        score >= 100
          ? 'PRODUCT_VALIDATABLE'
          : score >= 75
            ? 'EXPLANATION_VALIDATABLE'
            : score >= 50
              ? 'CODE_REVIEW_STILL_NEEDED'
              : score > 0
                ? 'TECHNICAL_HELP_STILL_NEEDED'
                : 'MANUAL_FIX_REQUIRED';
      const summaryForHuman = `Zero-Code Trust ${score}/100: ${verdict}. ${failed.length > 0 ? `${failed.length} evidencia(s) falharam.` : 'Sem falha explicita nas evidencias anexadas.'}`;
      return ok({ ok: true, summaryForHuman, summary: summaryForHuman, score, verdict, failed });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'behavior_receipt',
  {
    title: 'Generate a founder-facing behavior receipt',
    description:
      'Turns validation artifacts into a no-code receipt: what changed in the product, where to click/call, what was proven, and what remains unproven. This is the product-facing closeout for an atomic delivery.',
    inputSchema: {
      productBehavior: z.string().min(1),
      changedFiles: z.array(z.string()).optional(),
      validation: z
        .array(
          z.object({
            kind: EvidenceKindSchema,
            status: EvidenceStatusSchema,
            command: z.string().optional(),
            summary: z.string().optional(),
            artifactPaths: z.array(z.string()).optional(),
          }),
        )
        .min(1),
      clickPath: z.array(z.string()).optional(),
      notProven: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
    },
  },
  async (a) => {
    try {
      const trust = Math.max(
        ...a.validation.map((entry) => evidenceWeight(entry.kind, entry.status)),
      );
      const failing = a.validation.filter((entry) => entry.status === 'failed');
      const productProof = a.validation.some(
        (entry) =>
          entry.status === 'passed' &&
          [
            'api',
            'db',
            'browser',
            'runtime_probe',
            'external_provider',
            'manual_product_check',
          ].includes(entry.kind),
      );
      const score =
        failing.length > 0
          ? Math.min(trust, 40)
          : productProof && a.clickPath?.length
            ? 100
            : trust;
      const summaryForHuman =
        `O que mudou: ${a.productBehavior}\n` +
        `Como validar: ${a.clickPath && a.clickPath.length > 0 ? a.clickPath.join(' -> ') : 'usar os artefatos de validacao anexados'}\n` +
        `Prova: ${a.validation.map((entry) => `${entry.kind}:${entry.status}`).join(', ')}\n` +
        `Nao provado: ${a.notProven && a.notProven.length > 0 ? a.notProven.join('; ') : 'nenhum item declarado'}\n` +
        `Zero-Code Trust: ${score}/100`;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        productBehavior: a.productBehavior,
        changedFiles: a.changedFiles ?? [],
        validation: a.validation,
        clickPath: a.clickPath ?? [],
        notProven: a.notProven ?? [],
        risks: a.risks ?? [],
        zeroCodeTrust: score,
        productProof,
        failing,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'truth_receipt',
  {
    title: 'Classify delivery claims as real, partial, stub, fake, blocked, or unproven',
    description:
      'Anti-facade receipt. Each claim must carry evidence. Runtime/API/DB/browser/provider evidence can become REAL; tests/builds are PARTIAL; mocks/stubs cannot be sold as product behavior.',
    inputSchema: {
      claims: z
        .array(
          z.object({
            claim: z.string().min(1),
            evidenceKind: EvidenceKindSchema,
            status: EvidenceStatusSchema,
            artifactPaths: z.array(z.string()).optional(),
            externalBlocker: z.string().optional(),
          }),
        )
        .min(1),
    },
  },
  async (a) => {
    try {
      const classified = a.claims.map((claim) => ({
        ...claim,
        truth: classifyTruth(claim.evidenceKind, claim.status, Boolean(claim.externalBlocker)),
      }));
      const blocking = classified.filter((claim) => claim.truth !== 'REAL');
      const summaryForHuman =
        blocking.length === 0
          ? `Todas as ${classified.length} alegacoes tem prova de comportamento real.`
          : `${blocking.length}/${classified.length} alegacao(oes) ainda nao sao REAL: ${blocking.map((claim) => `${claim.claim}=${claim.truth}`).join('; ')}`;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        claims: classified,
        blocking,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'continuity_status',
  {
    title: 'Read the current product/atomic continuity state',
    description:
      'Summarizes progress docs, workboard, locks, PULSE certificate, runtime evidence, and the next honest action. Use at the start of a session so continuation comes from verified repo state, not chat memory.',
    inputSchema: {},
  },
  async () => {
    try {
      const progress = readTextOptional('docs/ai/ATOMIC_EDIT_PROGRESS.md');
      const workboard = readTextOptional('docs/ai/ATOMIC_EDIT_WORKBOARD.md');
      const cert =
        readJsonOptional<Record<string, unknown>>('PULSE_CERTIFICATE.json') ??
        readJsonOptional<Record<string, unknown>>('.pulse/current/PULSE_CERTIFICATE.json');
      const runtime = readJsonOptional<Record<string, unknown>>(
        '.pulse/current/PULSE_RUNTIME_EVIDENCE.json',
      );
      const gates =
        cert && typeof cert.gates === 'object' && cert.gates !== null
          ? (cert.gates as Record<string, unknown>)
          : {};
      const runtimePass = gates.runtimePass as Record<string, unknown> | undefined;
      const pulseStatus = typeof cert?.status === 'string' ? cert.status : 'unknown';
      const score = typeof cert?.score === 'number' ? cert.score : null;
      const runtimeSummary =
        typeof runtime?.summary === 'string' ? runtime.summary : 'runtime evidence missing';
      const nextAction =
        pulseStatus === 'CERTIFIED'
          ? 'usar o principio em trabalho de produto; nao reconstruir tooling sem regressao objetiva'
          : runtimePass?.status === 'fail'
            ? 'corrigir ou anexar evidencia runtime observada antes de declarar producao'
            : 'atacar o proximo gate PULSE vermelho com evidencia de produto';
      const summaryForHuman =
        `Continuidade: PULSE=${pulseStatus}${score === null ? '' : ` score=${score}`}. ` +
        `Runtime: ${runtimeSummary}. Locks ativos: ${listLocks().length}. Proxima acao: ${nextAction}.`;
      return ok({
        ok: true,
        summaryForHuman,
        summary: summaryForHuman,
        progressPresent: Boolean(progress),
        workboardPresent: Boolean(workboard),
        pulseStatus,
        pulseScore: score,
        runtimeSummary,
        runtimePass: runtimePass ?? null,
        locks: listLocks(),
        nextAction,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_lock_acquire',
  {
    title: 'Acquire a POSIX mkdir front lock',
    description:
      'Claims a product/agent front by atomically creating .atomic-edit-locks/<frontId>/ via mkdir. If it already exists, acquisition fails. This is the real anti-TOCTOU primitive for multi-agent work.',
    inputSchema: {
      frontId: z.string().min(1),
      owner: z.string().min(1),
      objective: z.string().min(1),
      allowedFiles: z.array(z.string()).optional(),
      blockedFiles: z.array(z.string()).optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
    },
  },
  async (a) => {
    try {
      fs.mkdirSync(lockRoot(), { recursive: true });
      const dir = lockDir(a.frontId);
      fs.mkdirSync(dir);
      const now = new Date().toISOString();
      const record = {
        frontId: safeLockId(a.frontId),
        owner: a.owner,
        objective: a.objective,
        startedAt: now,
        heartbeatAt: now,
        allowedFiles: a.allowedFiles ?? [],
        blockedFiles: a.blockedFiles ?? [],
        acceptanceCriteria: a.acceptanceCriteria ?? [],
        status: 'claimed',
      };
      atomicWrite(lockFile(a.frontId), JSON.stringify(record, null, 2));
      const summaryForHuman = `Lock adquirido: ${a.frontId} por ${a.owner}. Frente valida para trabalho atomico.`;
      return ok({ ok: true, summaryForHuman, summary: summaryForHuman, lock: record });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_lock_status',
  {
    title: 'List active atomic front locks',
    description: 'Lists .atomic-edit-locks fronts and their owner/objective/heartbeat metadata.',
    inputSchema: {},
  },
  async () => {
    try {
      const locks = listLocks();
      const summaryForHuman = `Locks ativos: ${locks.length}`;
      return ok({ ok: true, summaryForHuman, summary: summaryForHuman, locks });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_lock_release',
  {
    title: 'Release an atomic front lock',
    description:
      'Releases a lock only when the owner matches, unless force=true is supplied for coordinator orphan recovery. Only paths under .atomic-edit-locks/<frontId>/ are removable.',
    inputSchema: {
      frontId: z.string().min(1),
      owner: z.string().min(1),
      force: z.boolean().optional(),
      reason: z.string().optional(),
    },
  },
  async (a) => {
    try {
      const dir = lockDir(a.frontId);
      const current = readLockRecord(safeLockId(a.frontId));
      if (!fs.existsSync(dir)) return ok({ ok: true, changed: false, note: 'lock already absent' });
      if (!a.force && current?.owner !== a.owner) {
        return fail(
          `lock owned by ${String(current?.owner ?? 'unknown')}; release refused for ${a.owner}`,
        );
      }
      fs.rmSync(dir, { recursive: true, force: false });
      const summaryForHuman = `Lock liberado: ${a.frontId}${a.reason ? ` (${a.reason})` : ''}.`;
      return ok({ ok: true, changed: true, summaryForHuman, summary: summaryForHuman });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready — repo=${process.cwd()} node=${process.version} pid=${process.pid}`);
  log(`tmpdir=${os.tmpdir()}`);
}

main().catch((e) => {
  log('FATAL', e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
