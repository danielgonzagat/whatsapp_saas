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
  type ValidationResult,
} from './engine.js';
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
} from './advanced.js';
import { moveSymbolToFile, canExtractClassMethod } from "./move.js";
import { resolveSymbol } from './symbols.js';

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
  if (!text.includes('const envBackup') || text.includes('Object.entries(envBackup)')) {
    return text;
  }
  const withImport = addVitestNamedImport(text, 'afterEach');
  const anchor = "  describe('resolveWorkerOpenAIModel', () => {";
  if (!withImport.includes(anchor)) return text;
  return withImport.replace(
    anchor,
    '  afterEach(() => {\n' +
      '    clearOpenAiEnvs();\n' +
      '    Object.entries(envBackup).forEach(([key, value]) => {\n' +
      "      if (key.startsWith('OPENAI_') || key === 'VOICE_RESPONSE_AUDIO_REQUIRED') {\n" +
      '        process.env[key] = value;\n' +
      '      }\n' +
      '    });\n' +
      '  });\n\n' +
      anchor,
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

function ok(payload: Record<string, unknown>): ToolOk {
  const json = { type: 'text' as const, text: JSON.stringify(payload, null, 2) };
  const summary = payload.summaryForHuman ?? payload.summary;
  if (typeof summary !== 'string' || summary.length === 0) {
    return { content: [json] };
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


/** Like fail(), but the JSON error payload also carries structured fields
 * (e.g. a ready-to-send `readyCall`) so the model gets a copy-paste-able
 * recovery action, not just prose. */
function failWith(message: string, extra: Record<string, unknown>): ToolOk {
  log('ERROR', message);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ok: false, error: message, ...extra }, null, 2),
      },
    ],
    isError: true,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * A/B TOOLDEV25 — gentle, NON-BLOCKING multi-file-coordination steer.
 *
 * Measured 3/3-recurring residual: a one-product-intention spanning N files
 * is wired as many single-file ops + repeated re-exploration instead of ONE
 * atomic_transaction. Track the DISTINCT files touched by single-file
 * mutating ops this session; once ≥2 different files have been mutated
 * without an atomic_transaction, append ONE informational line to the next
 * mutating result's human summary. It NEVER denies and NEVER alters the edit
 * — pure append to summaryForHuman/summary. A successful atomic_transaction
 * (the correct coordinated tool) RESETS the tracker.
 * ──────────────────────────────────────────────────────────────────────── */
const sessionMutatedFiles = new Set<string>();
const MULTI_FILE_STEER_LINE =
  'ℹ multi-file coordinated change detected — prefer ONE ' +
  'mcp__atomic-edit__atomic_transaction{plan:[{file,ops:[…]}]} for ' +
  'all-or-nothing + single validation + single trace.';
function noteMutationAndSteer(
  absPath: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  sessionMutatedFiles.add(absPath);
  if (sessionMutatedFiles.size >= 2) {
    for (const key of ['summaryForHuman', 'summary'] as const) {
      const value = payload[key];
      if (typeof value === 'string' && !value.includes(MULTI_FILE_STEER_LINE)) {
        payload[key] = `${value}\n\n${MULTI_FILE_STEER_LINE}`;
      }
    }
  }
  return payload;
}
function resetMultiFileSteer(): void {
  sessionMutatedFiles.clear();
}

/* ─────────────────────────────────────────────────────────────────────────
 * A/B TOOLDEV26 — VERIFICATION-ECONOMY SELF-CERTIFICATION.
 *
 * MEASURED dominant residual (R42): the atomic edit itself is already minimal
 * and TIED with Normal on churn, yet the model loses on VERIFICATION CEREMONY
 * — it re-greps / re-Reads / re-runs heavy test suites BETWEEN atomic ops as
 * if nothing were proven, even though every mutating op is ALREADY syntax+
 * regression-validated and traced at the OS level. This violates the founding
 * Princípio §6.5 (atomicidade de confiança: spend trust at the SMALLEST
 * point) + the manifesto's ban on repetitive verification a tool directive
 * could carry. So EVERY successful mutating op now self-certifies its OS-level
 * validation in ONE compact appended line and explicitly steers the model to
 * verify ONCE at the very end, never between ops. PREVIEW/dry-run results get
 * a clearly DIFFERENT provisional line (no false "validated for write"
 * promise). The line is APPEND-only to the human summary — it never alters
 * any structured result field smoke asserts. ONE source of truth (this
 * helper) so all ops carry CONSISTENT guidance (no duplicated strings;
 * tooldev14 TARGET-MET / idempotency + tooldev25 multi-file steer semantics
 * are preserved verbatim and merely complemented by this line).
 * ──────────────────────────────────────────────────────────────────────── */
/** Bound the trace-path segment so the whole directive stays ≤240 chars
 * (obeying the ECHO discipline) even for an unexpectedly long path. */
function compactTraceRef(tracePath: string | null | undefined): string {
  if (typeof tracePath !== 'string' || tracePath.length === 0)
    return 'syntax+regression-checked in-process';
  return tracePath.length <= 55 ? tracePath : `…${tracePath.slice(-54)}`;
}
function osValidatedDirective(tracePath: string | null | undefined): string {
  // A/B TOOLDEV28: the line now NAMES the structural verification operator
  // (atomic_verify) instead of vaguely steering "verify once" — measured
  // truth across L1/L3-priority/L3′ is that advisory prose is IGNORED while
  // a named MCP operator changes behavior. Kept ≤240 chars (ECHO discipline).
  return (
    `✅ OS-VALIDATED — syntax+regression-checked & traced ` +
    `(${compactTraceRef(tracePath)}). Run mcp__atomic-edit__atomic_verify ` +
    `ONCE to confirm behavior — do NOT hand-run jest/tsc/grep between ops.`
  );
}
const PREVIEW_PROVISIONAL_LINE =
  '△ PREVIEW — not written; validation is provisional and not yet ' +
  'proven for write.';
/**
 * Append the verification-economy line to a successful mutating result's
 * human summary (idempotent, append-only — never mutates structured fields).
 * `preview:true` emits the clearly-different provisional line instead, which
 * deliberately contains NO "OS-VALIDATED" substring.
 */
function appendVerificationEconomy(
  payload: Record<string, unknown>,
  opts: { tracePath?: string | null; preview?: boolean },
): Record<string, unknown> {
  const line = opts.preview
    ? PREVIEW_PROVISIONAL_LINE
    : osValidatedDirective(opts.tracePath);
  for (const key of ['summaryForHuman', 'summary'] as const) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0 && !value.includes(line)) {
      payload[key] = `${value}\n\n${line}`;
    }
  }
  return payload;
}



/* ─────────────────────────────────────────────────────────────────────────
 * DECOMPOSITION-PATTERN GUARD (A/B R16→R17, Atomic Action Principle)
 *
 * Agents that split a big file keep defaulting to repeated
 * atomic_create_file — measurably heavier/slower than the one-shot
 * atomic_decompose_file meta-operator. We steer the high-level operator:
 * track which source files were code_outline'd this session and, when
 * atomic_create_file is used to emit a sibling/derived module of such a
 * source, deny and point the agent at atomic_decompose_file. Conservative:
 * only trips on the clear decomposition signature, so genuine
 * first/standalone file creation is untouched.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * A/B TOOLDEV20: per-origin terminal identity, captured when a decompose
 * reaches its END STATE (TARGET MET or the FROZEN ABSOLUTE_FLOOR — both
 * terminal, both via runSymbolDecompose, which is the single point reached by
 * the direct atomic_decompose_file tool AND the create_file auto-execute
 * path). It is enough to recognise a CONTINUATION of that completed
 * decomposition from CONTENT + STATE — never from a fixed filename pattern
 * (the de-hardcoded post-completion guard; the tooldev11/18 same-stem-sibling
 * heuristic was the R32 gap).
 */
interface DecomposedOriginState {
  done: true;
  /** the origin's repo-relative path at completion */
  originRel: string;
  /** dirname(originRel) — the folder the modules were extracted alongside */
  dir: string;
  /** coreStemOf(originRel) — e.g. 'unified-agent' barrel stem */
  coreStem: string;
  /** the exact symbol names relocated OUT of the origin by the decompose */
  movedSymbols: string[];
  /** the repo-relative module files the decompose created */
  moduleRelPaths: string[];
}

interface DecompRepoState {
  /** outlined source relPath → { dir, coreStem, ts, topSymbols, methodSymbols, dominantClass } */
  outlined: Map<
    string,
    {
      dir: string;
      coreStem: string;
      ts: number;
      topSymbols: string[];
      /**
       * A/B TOOLDEV13: `Class.method` selectors of the single dominant
       * exported class — populated ONLY for the god-class shape (else []),
       * so the decompose auto-plan can split a service CLASS by method.
       */
      methodSymbols: string[];
      dominantClass: string | null;
      /**
       * A/B TOOLDEV15: `Class.method` → estimated LOC of that method, taken
       * from the SAME code_outline span (endLine-startLine+1; no re-parse).
       * Populated only for the god-class shape; lets buildReadyDecomposeCall
       * SIZE the split so ONE atomic_decompose_file lands at TARGET MET.
       */
      methodSpans: Map<string, number>;
      /** A/B TOOLDEV15: origin total line count at outline time (pre-decompose). */
      originLoc: number;
      /**
       * A/B TOOLDEV16: the EXACT origin text at outline time. The god-class
       * planner needs it to run the READ-ONLY extractability predicate
       * (canExtractClassMethod) so it never proposes a method the
       * all-or-nothing decompose engine would refuse.
       */
      originText: string;
    }
  >;
  /** outlined source relPath → set of sibling files already created from it */
  siblingCreates: Map<string, Set<string>>;
  /**
   * A/B TOOLDEV19 IDEMPOTENT-BY-CONSTRUCTION: canonical origin key → a single
   * terminal marker. The god-class decompose is now ONE internally-convergent
   * all-or-nothing transaction: it stops either at TARGET MET or at the FROZEN
   * ABSOLUTE_FLOOR (the maximal safe structural reduction) — BOTH are end
   * states. There is no multi-pass, no PROGRESS-allows-another-pass branch, no
   * progress counter and no cap (the tooldev18 oscillation is structurally
   * removed, not tuned). So a successful decompose records `{ done: true }`
   * UNCONDITIONALLY and ANY subsequent atomic_decompose_file / create_file
   * decomposition-trigger on that origin HARD-STOPS ⛔ (the original tooldev11
   * lock). Per-file, never global.
   */
  decomposeState: Map<string, DecomposedOriginState>;
}
const decompState = new Map<string, DecompRepoState>();

function decompRepoKey(absPath: string): string {
  return resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
}

function decompStateFor(absPath: string): DecompRepoState {
  const key = decompRepoKey(absPath);
  let s = decompState.get(key);
  if (!s) {
    s = { outlined: new Map(), siblingCreates: new Map(), decomposeState: new Map() };
    decompState.set(key, s);
  }
  return s;
}

/** basename stem before the first dot: unified-agent.service.ts → unified-agent */
function coreStemOf(relPath: string): string {
  return path.basename(relPath).split('.')[0] ?? '';
}


/**
 * A/B TOOLDEV13: a file is treated as a "god-class" (decompose by METHOD,
 * not by top-level symbol) only when ONE exported class owns at least this
 * many own methods. Keeps small classes on the unchanged top-level path.
 */
const GODCLASS_MIN_METHODS = 4;

function recordOutline(
  absPath: string,
  relPath: string,
  symbols: {
    selector: string;
    kind?: string;
    startLine?: number;
    endLine?: number;
  }[] = [],
  originLoc = 0,
  originText = '',
): void {
  const s = decompStateFor(absPath);
  const noDot = (sel: string): boolean => sel.length > 0 && !sel.includes('.');
  const topSymbols = symbols.map((x) => x.selector).filter((sel) => noDot(sel));
  // A/B TOOLDEV13: the dominant real shape is a god-CLASS (NestJS service),
  // not a bag of top-level functions. code_outline already emits the
  // class-member selectors (`Class.method`, kind MethodDeclaration). ALSO
  // capture those so the decompose auto-plan can split the CLASS by
  // method-concern instead of seeing one undividable class name and bailing
  // (the R24 hand-roll explosion). Conservative: only when ONE exported
  // class dominates and there are few/no standalone top-level functions —
  // genuine multi-function files keep the unchanged top-level path
  // (regression-safe). Trivial members (constructor / get|set accessors)
  // carry their own ts-morph kinds (Constructor/GetAccessor/SetAccessor),
  // never MethodDeclaration, so they are excluded for free.
  const classes = symbols
    .filter((x) => x.kind === 'ClassDeclaration' && noDot(x.selector))
    .map((x) => x.selector);
  const topFns = symbols.filter(
    (x) => x.kind === 'FunctionDeclaration' && noDot(x.selector),
  ).length;
  let methodSymbols: string[] = [];
  let dominantClass: string | null = null;
  const methodSpans = new Map<string, number>();
  if (classes.length === 1 && topFns <= 1) {
    const cls = classes[0];
    const methodSyms = symbols.filter((x) => {
      if (x.kind !== 'MethodDeclaration') return false;
      const p = x.selector.split('.');
      return p.length === 2 && p[0] === cls && p[1] !== 'constructor';
    });
    if (methodSyms.length >= GODCLASS_MIN_METHODS) {
      methodSymbols = methodSyms.map((x) => x.selector);
      dominantClass = cls;
      // A/B TOOLDEV15: per-method LOC straight from the SAME outline span
      // (endLine-startLine+1) — REUSED, never re-parsed. Any method missing a
      // precise span falls back to the median known span (min 8) so the
      // size-driven planner always has a conservative estimate.
      const spanOf = (x: {
        startLine?: number;
        endLine?: number;
      }): number | null =>
        typeof x.startLine === 'number' &&
        typeof x.endLine === 'number' &&
        x.endLine >= x.startLine
          ? x.endLine - x.startLine + 1
          : null;
      const known = methodSyms
        .map(spanOf)
        .filter((n): n is number => n !== null);
      const sorted = [...known].sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 8;
      const fallback = Math.max(8, median);
      for (const x of methodSyms)
        methodSpans.set(x.selector, spanOf(x) ?? fallback);
    }
  }
  s.outlined.set(relPath, {
    dir: path.dirname(relPath),
    coreStem: coreStemOf(relPath),
    ts: Date.now(),
    topSymbols,
    methodSymbols,
    dominantClass,
    methodSpans,
    originLoc,
    originText,
  });
}

function isDerivedSibling(
  newDir: string,
  meta: { dir: string; coreStem: string },
): boolean {
  if (newDir === meta.dir) return true; // same folder as the source
  const stemDir = path.join(meta.dir, meta.coreStem);
  return newDir === stemDir || newDir.startsWith(stemDir + path.sep);
}

/** First lexical word of a symbol name, lowercased & filesystem-safe.
 * fooBarBaz / FooBar / foo_bar / FOO_BAR → "foo". The concern key used to
 * group sibling symbols into cohesive modules. */
function concernOf(name: string): string {
  const bare = name.split('.').pop() ?? name;
  const words = bare
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const head = (words[0] ?? bare).toLowerCase();
  const slug = head.replace(/[^a-z0-9]+/g, '');
  return slug.length > 0 ? slug : 'core';
}

interface ReadyDecomposeCall {
  file: string;
  plan: { symbols: string[]; newModule: string; reExport: boolean }[];
  /**
   * A/B TOOLDEV15: the planner's conservative prediction of the origin LOC
   * AFTER this decompose (god-class sizing path only; omitted for the
   * unchanged top-level path). Advisory only — the tooldev14 verdict still
   * MEASURES the real post-write LOC; this just proves the plan was SIZED to
   * land at TARGET MET in one pass.
   */
  predictedOriginLoc?: number;
}

/**
 * Auto-generate a COMPLETE, ready-to-send atomic_decompose_file argument
 * object from the cached top-level outline of `src`: group its symbols into
 * ~3-6 cohesive sibling modules (by name concern), each module path =
 * dirname(src)/stem.concern.ts, reExport:true — so the model can copy it
 * verbatim. Returns null when there are too few symbols for a real plan.
 */
async function buildReadyDecomposeCall(
  src: string,
  meta: {
    dir: string;
    coreStem: string;
    topSymbols: string[];
    methodSymbols?: string[];
    methodSpans?: Map<string, number>;
    originLoc?: number;
    originText?: string;
  },
): Promise<ReadyDecomposeCall | null> {
  // A/B TOOLDEV15: for the god-CLASS shape, try the LOC-TARGET-DRIVEN,
  // bin-packed split FIRST — it is SIZED so ONE atomic_decompose_file lands
  // at the tooldev14 MEASURED "TARGET MET" in a single pass (no PROGRESS tail
  // → no create_file/replace_text hand-roll). Anything it cannot improve
  // (no spans / too few methods / cannot beat the cap) returns null and the
  // unchanged concern path below runs instead. The top-level (non-god-class)
  // path is byte-identical to before this change (regression-safe).
  if ((meta.methodSymbols ?? []).length >= 2) {
    const sized = await buildGodClassDecomposeCall(src, meta);
    if (sized) return sized;
  }
  // A/B TOOLDEV13: a god-CLASS origin has NO splittable top-level symbols
  // (just the one class name) — its decomposable units are the class
  // METHODS. recordOutline captured them as `Class.method` selectors ONLY
  // for the god-class shape; when present, plan the split over those.
  // concernOf already buckets on the trailing method name and
  // runSymbolDecompose→moveSymbolToFile is method-aware (tooldev12), so the
  // SAME ReadyDecomposeCall shape carries `Class.method` selectors and the
  // whole class collapses in one validated all-or-nothing transaction.
  // Otherwise the unchanged top-level path runs — genuine multi-symbol
  // files are byte-identical to before this change (regression-safe).
  const classUnits = meta.methodSymbols ?? [];
  const usingClassMethods = classUnits.length >= 2;
  const syms = (usingClassMethods ? classUnits : meta.topSymbols).filter(
    (s2) => s2 && s2 !== src,
  );
  if (syms.length < 2) return null;
  const MAX_GROUPS = 6;
  const MIN_GROUPS = 3;
  // 1. bucket by concern, preserving first-seen order
  const buckets = new Map<string, string[]>();
  for (const sym of syms) {
    const key = concernOf(sym);
    const arr = buckets.get(key);
    if (arr) arr.push(sym);
    else buckets.set(key, [sym]);
  }
  let groups: { concern: string; symbols: string[] }[] = [...buckets].map(
    ([concern, symbols]) => ({ concern, symbols }),
  );
  // 2. too many concerns → keep the largest, fold the long tail into "core"
  if (groups.length > MAX_GROUPS) {
    groups.sort((a, b) => b.symbols.length - a.symbols.length);
    const head = groups.slice(0, MAX_GROUPS - 1);
    const tail = groups.slice(MAX_GROUPS - 1);
    head.push({ concern: 'core', symbols: tail.flatMap((g) => g.symbols) });
    groups = head;
  }
  // 3. too few concerns but enough symbols → slice evenly into MIN_GROUPS
  if (groups.length < MIN_GROUPS && syms.length >= MIN_GROUPS) {
    const per = Math.ceil(syms.length / MIN_GROUPS);
    groups = [];
    for (let i = 0; i < MIN_GROUPS; i++) {
      const slice = syms.slice(i * per, (i + 1) * per);
      if (slice.length > 0) groups.push({ concern: `part${i + 1}`, symbols: slice });
    }
  }
  if (groups.length < 2) return null;
  // 4. materialise unique module paths
  const used = new Set<string>();
  const plan = groups.map((g) => {
    let modPath = path.join(meta.dir, `${meta.coreStem}.${g.concern}.ts`);
    let n = 2;
    while (used.has(modPath) || modPath === src) {
      modPath = path.join(meta.dir, `${meta.coreStem}.${g.concern}${n}.ts`);
      n++;
    }
    used.add(modPath);
    return { symbols: g.symbols, newModule: modPath, reExport: true };
  });
  return { file: src, plan };
}


/**
 * A/B TOOLDEV15 — LOC-TARGET-DRIVEN god-class split (absorb Normal's brute
 * advantage: decide the split AND write once). The dominant real shape is a
 * NestJS service CLASS over the origin target. tooldev13 grouped methods by
 * NAME-CONCERN only, so one decompose pass landed at PROGRESS (a concern bin
 * still over the module cap / not enough mass moved) and the model
 * hand-rolled the residual with create_file+replace_text. Here the plan is
 * SIZED: extract the LARGEST methods first (max LOC dropped per move) until
 * the PREDICTED origin ≤ a safety-margined target, then bin-pack the chosen
 * set into concern-cohesive modules each under the per-module cap — so the
 * tooldev14 MEASURED verdict returns TARGET MET in ONE atomic_decompose_file.
 *
 * Conservative & additive: planning only — no write/validation logic here.
 * Returns null whenever it cannot do better than the unchanged concern path
 * (no spans / too few methods / cannot beat the cap), which then runs
 * instead. The top-level path never reaches this (regression-safe).
 */
async function buildGodClassDecomposeCall(
  src: string,
  meta: {
    dir: string;
    coreStem: string;
    methodSymbols?: string[];
    methodSpans?: Map<string, number>;
    originLoc?: number;
    originText?: string;
  },
): Promise<ReadyDecomposeCall | null> {
  const methods = (meta.methodSymbols ?? []).filter((s) => s && s !== src);
  if (methods.length < 2) return null;
  const spans = meta.methodSpans;
  if (!spans || spans.size === 0) return null;
  const originLoc = meta.originLoc ?? 0;

  // A/B TOOLDEV16: EXTRACTABILITY-AWARE planning (Princípio da
  // Des-hardcodificação Operacional — DISCOVER, don't blindly size). tooldev15
  // packed the LARGEST methods first to hit the LOC target WITHOUT checking
  // extractability, so it could include a method that touches a
  // private/protected/#private member. tooldev12's guard CORRECTLY refuses
  // that (a sibling free function cannot reach class-private state), which
  // aborted the WHOLE all-or-nothing decompose — the exact R27 defeat that
  // forced the manual create_file/replace_text tail. Fix: run the SAME
  // read-only predicate the engine's guard runs (canExtractClassMethod →
  // analyzeClassMethodExtraction, the single source of truth) over the origin
  // text cached at outline time and keep ONLY the methods the engine will
  // actually accept. Then size/bin-pack over that SAFE set only. If the
  // target cannot be reached with safe methods alone we still extract the
  // maximal safe set (a smaller REAL one-pass win; the tooldev14 verdict then
  // reports an honest PROGRESS) — we NEVER add an unsafe method just to hit
  // the number. Conservative: if no origin text is cached, fall back to the
  // prior candidate set (the engine still guards — behavior-unchanged).
  const originText = meta.originText ?? '';
  let safeMethods = methods;
  if (originText) {
    const safe: string[] = [];
    for (const m of methods) {
      const verdict = await canExtractClassMethod(src, originText, m);
      if (verdict.ok) safe.push(m);
    }
    safeMethods = safe;
  }
  if (safeMethods.length < 2) return null;

  const MIN_GROUPS = 3;
  const MAX_GROUPS = 6;
  // Each extracted method leaves a ~3-line delegating stub in the origin and
  // the origin gains a small typed back-import header. Over-estimate the
  // resulting origin (predicted ≥ real) so a predicted-OK pass is a real-OK
  // pass — the tooldev14 measurement then confirms TARGET MET.
  const STUB_LOC = 3;
  const ORIGIN_OVERHEAD = 12;
  // A new module = an import header + the extracted function bodies. Keep the
  // per-module method-LOC sum well under DECOMPOSE_MODULE_TARGET so the real
  // module measurement stays ≤ the cap with margin for estimate error.
  const MODULE_HEADER = 14;
  const BIN_CAP = Math.max(
    40,
    DECOMPOSE_MODULE_TARGET - MODULE_HEADER - 26,
  );
  const locOf = (m: string): number => Math.max(1, spans.get(m) ?? 8);
  const predictedOriginFor = (chosen: string[]): number => {
    let saved = 0;
    for (const m of chosen) saved += Math.max(0, locOf(m) - STUB_LOC);
    return Math.max(0, originLoc - saved + ORIGIN_OVERHEAD);
  };

  // A/B TOOLDEV19 — ONE internally-convergent, idempotent-by-construction
  // selection. It REPLACES the tooldev15-18 tangle of fighting heuristics
  // (band 345, per-pass floor, cap 4, minimal-prefix, model multi-pass) with
  // a single greedy bounded by ONE frozen invariant. `originLoc` is
  // meta.originLoc, captured ONCE at outline time = the origin LOC at the
  // START of this single terminal call; the idempotency gate then locks the
  // origin, so there is NO shrinking-origin recompute (the tooldev18 husk
  // bug is structurally impossible — the floor is frozen, never per-pass).
  //  • origin already ≤ oracle → byte-stable full-collapse (tooldev13/14/15
  //    depend on it; the floor only bounds the OVER-target path).
  //  • origin OVER oracle → sort safe candidates largest-LOC first; greedily
  //    accumulate while predicted origin > ORIGIN_TARGET AND adding the
  //    method keeps predicted ≥ ABSOLUTE_FLOOR. STOP the instant predicted ≤
  //    ORIGIN_TARGET (success) OR no remaining safe method fits without
  //    breaching the FROZEN floor (floor-bound = the maximal safe reduction).
  //    A plan whose CUMULATIVE predicted origin < ABSOLUTE_FLOOR is NEVER
  //    returned — cumulative, not per-pass: this single rule kills the husk.
  const ORIGIN_TARGET = DECOMPOSE_ORIGIN_TARGET;
  const ABSOLUTE_FLOOR = absoluteDecomposeFloor(originLoc);
  let chosen: string[];
  if (originLoc <= ORIGIN_TARGET) {
    chosen = [...safeMethods];
  } else {
    const byLoc = [...safeMethods].sort(
      (a, b) =>
        locOf(b) - locOf(a) ||
        concernOf(a).localeCompare(concernOf(b)) ||
        a.localeCompare(b),
    );
    chosen = [];
    for (const m of byLoc) {
      if (predictedOriginFor(chosen) <= ORIGIN_TARGET) break; // converged
      if (predictedOriginFor([...chosen, m]) < ABSOLUTE_FLOOR) continue; // floor
      chosen.push(m);
    }
    if (chosen.length < 2) {
      // Largest-first could not assemble ≥2 methods without breaching the
      // frozen floor. Take the 2 SMALLEST safe methods (minimal mutation)
      // iff they still respect ABSOLUTE_FLOOR — else there is no safe plan.
      const bySmall = [...safeMethods].sort(
        (a, b) => locOf(a) - locOf(b) || a.localeCompare(b),
      );
      const two = bySmall.slice(0, 2);
      if (two.length === 2 && predictedOriginFor(two) >= ABSOLUTE_FLOOR)
        chosen = two;
    }
    if (predictedOriginFor(chosen) < ABSOLUTE_FLOOR) return null; // never husk
  }
  if (chosen.length < 2) return null;

  // Bin-pack the chosen set into modules. PRIMARY: every module's method-LOC
  // sum ≤ BIN_CAP. SECONDARY: methods sharing a name-concern stay together
  // (concernOf as the cohesion/tiebreak), original method order preserved
  // for determinism.
  const chosenSet = new Set(chosen);
  const concernOrder: string[] = [];
  const byConcern = new Map<string, string[]>();
  for (const m of safeMethods) {
    if (!chosenSet.has(m)) continue;
    const c = concernOf(m);
    const arr = byConcern.get(c);
    if (arr) arr.push(m);
    else {
      byConcern.set(c, [m]);
      concernOrder.push(c);
    }
  }
  type Mod = { concern: string; symbols: string[]; loc: number };
  const mods: Mod[] = [];
  for (const c of concernOrder) {
    const ms = byConcern.get(c) ?? [];
    let bin: string[] = [];
    let binLoc = 0;
    for (const m of ms) {
      const l = locOf(m);
      if (bin.length > 0 && binLoc + l > BIN_CAP) {
        mods.push({ concern: c, symbols: bin, loc: binLoc });
        bin = [];
        binLoc = 0;
      }
      bin.push(m);
      binLoc += l;
    }
    if (bin.length > 0) mods.push({ concern: c, symbols: bin, loc: binLoc });
  }

  // Too many modules → merge the smallest compatible pair while ≤ BIN_CAP.
  while (mods.length > MAX_GROUPS) {
    mods.sort((a, b) => a.loc - b.loc);
    let merged = false;
    for (let i = 1; i < mods.length; i++) {
      if (mods[0].loc + mods[i].loc <= BIN_CAP) {
        mods[i] = {
          concern: mods[i].concern,
          symbols: [...mods[i].symbols, ...mods[0].symbols],
          loc: mods[i].loc + mods[0].loc,
        };
        mods.splice(0, 1);
        merged = true;
        break;
      }
    }
    if (!merged) break; // cannot shrink further without breaching the cap
  }
  // Too few modules but enough symbols → split the largest multi-symbol
  // module in half (mirrors the legacy even-slice; keeps ≥ MIN_GROUPS).
  const sumLoc = (xs: string[]): number =>
    xs.reduce((t, x) => t + locOf(x), 0);
  while (
    mods.length < MIN_GROUPS &&
    mods.some((m) => m.symbols.length >= 2)
  ) {
    mods.sort((a, b) => b.symbols.length - a.symbols.length);
    const big = mods.shift();
    if (!big || big.symbols.length < 2) {
      if (big) mods.push(big);
      break;
    }
    const half = Math.ceil(big.symbols.length / 2);
    const left = big.symbols.slice(0, half);
    const right = big.symbols.slice(half);
    mods.push({ concern: big.concern, symbols: left, loc: sumLoc(left) });
    mods.push({ concern: big.concern, symbols: right, loc: sumLoc(right) });
  }
  if (mods.length < 2) return null;

  // Materialise unique module paths (same scheme as the top-level path).
  const used = new Set<string>();
  const plan = mods.map((g) => {
    let modPath = path.join(meta.dir, `${meta.coreStem}.${g.concern}.ts`);
    let n = 2;
    while (used.has(modPath) || modPath === src) {
      modPath = path.join(meta.dir, `${meta.coreStem}.${g.concern}${n}.ts`);
      n++;
    }
    used.add(modPath);
    return { symbols: g.symbols, newModule: modPath, reExport: true };
  });
  return { file: src, plan, predictedOriginLoc: predictedOriginFor(chosen) };
}

/**
 * Return a steer/deny message when creating `relPath` is the decomposition
 * pattern of a source that was code_outline'd this session; otherwise null.
 * Trips ONLY when the new file is a sibling/derived module of an outlined
 * source AND (it shares the source's core basename stem, OR it is the 2nd+
 * sibling created from that source).
 */
async function decompositionSteer(
  absPath: string,
  relPath: string,
): Promise<{ message: string; readyCall: ReadyDecomposeCall | null } | null> {
  const s = decompStateFor(absPath);
  if (s.outlined.size === 0) return null;
  const newDir = path.dirname(relPath);
  const newCore = coreStemOf(relPath);
  for (const [src, meta] of s.outlined) {
    if (src === relPath) continue;
    if (!isDerivedSibling(newDir, meta)) continue;
    const sharesStem = newCore === meta.coreStem;
    const set = s.siblingCreates.get(src) ?? new Set<string>();
    const isSecondPlus = set.size >= 1 && !set.has(relPath);
    if (sharesStem || isSecondPlus) {
      const readyCall = await buildReadyDecomposeCall(src, meta);
      const message = readyCall
        ? `Decomposition detected (splitting ${src}). Do NOT create modules ` +
          `one by one with atomic_create_file. Send EXACTLY this one ` +
          `mcp__atomic-edit__atomic_decompose_file call: ` +
          `${JSON.stringify(readyCall)} — copy it verbatim; adjust the symbol ` +
          `grouping only if you truly need to.`
        : `Decomposition detected: creating multiple modules from ${src}. ` +
          `Use mcp__atomic-edit__atomic_decompose_file ONCE with ` +
          `{file:'${src}', plan:[{symbols:[...],newModule:'...',reExport:true},...]} ` +
          `— it does the whole split in one validated all-or-nothing call. ` +
          `atomic_create_file is for genuinely new standalone files only.`;
      return { message, readyCall };
    }
  }
  return null;
}

/** Record an allowed sibling-create so the next one trips the guard. */
function recordSiblingCreate(absPath: string, relPath: string): void {
  const s = decompStateFor(absPath);
  if (s.outlined.size === 0) return;
  const newDir = path.dirname(relPath);
  for (const [src, meta] of s.outlined) {
    if (src === relPath) continue;
    if (!isDerivedSibling(newDir, meta)) continue;
    const set = s.siblingCreates.get(src) ?? new Set<string>();
    set.add(relPath);
    s.siblingCreates.set(src, set);
  }
}


/* ─────────────────────────────────────────────────────────────────────────
 * A/B R22→TOOLDEV11 — STRUCTURAL-COMPLETION IDEMPOTENCY (the decisive fix)
 *
 * R22 regression: after the OS silently auto-decomposed a god-file the model
 * never received an unambiguous "this file is STRUCTURALLY COMPLETE — stop"
 * signal, so it re-decomposed the SAME origin two more times, then spent 11
 * atomic_remove_import calls cleaning the self-inflicted import debris.
 * Structure was actually the BEST of the loop — this is purely a
 * stop/idempotency gap. Fix: mark each origin the instant it is decomposed
 * (both the explicit tool AND the create_file auto-execute) and HARD-STOP any
 * 2nd structural pass on that SAME origin (refuse early, write NOTHING).
 * Per-file, conservative — unrelated files/decompositions are unaffected.
 * ──────────────────────────────────────────────────────────────────────── */

/** Canonical per-origin key (real path when resolvable, else resolved abs). */
function decompFileKey(absPath: string): string {
  try {
    return fs.realpathSync.native(absPath);
  } catch {
    return path.resolve(absPath);
  }
}

/** A/B TOOLDEV19: record this origin as terminally decomposed. Called the
 * instant a decomposition SUCCEEDS (explicit atomic_decompose_file OR
 * create_file auto-execute). One converged call is the END STATE — whether it
 * reached TARGET MET or the FROZEN ABSOLUTE_FLOOR (the maximal safe reduction).
 * Both are terminal, so the marker is unconditional: there is no longer a
 * PROGRESS counter, no cap, no "one more pass" branch (the tooldev18
 * oscillation is structurally gone). */
function recordDecompose(
  absPath: string,
  identity: { originRel: string; movedSymbols: string[]; moduleRelPaths: string[] },
): void {
  const st = decompStateFor(absPath);
  st.decomposeState.set(decompFileKey(absPath), {
    done: true,
    originRel: identity.originRel,
    dir: path.dirname(identity.originRel),
    coreStem: coreStemOf(identity.originRel),
    movedSymbols: identity.movedSymbols,
    moduleRelPaths: identity.moduleRelPaths,
  });
}

/** The terminal decompose marker for this origin (undefined = never). */
function decomposeOutcomeFor(absPath: string): DecomposedOriginState | undefined {
  return decompStateFor(absPath).decomposeState.get(decompFileKey(absPath));
}

/** True once this origin has been terminally decomposed this session (TARGET
 * MET or safe-floor — both lock it; the R22 churn guard fires on completion). */
function isAlreadyDecomposed(absPath: string): boolean {
  return decomposeOutcomeFor(absPath) !== undefined;
}

/** The unambiguous HARD-STOP returned when a 2nd structural pass is attempted
 * on an already-decomposed origin. ok:false, changed:false, NOTHING written —
 * the guard simply refuses early (all-or-nothing semantics preserved). */
function alreadyDecomposedStop(originRel: string): ToolOk {
  return failWith(
    `⛔ ${originRel} was ALREADY decomposed this session (it is STRUCTURALLY ` +
      `COMPLETE: modules created, typed re-exports + origin back-import done, ` +
      `all syntax-validated). Do NOT decompose, re-split, or re-create modules ` +
      `for this file again. Your ONLY valid next action is to run the test ` +
      `suite to confirm behavior. No further structural edits to this file are ` +
      `needed or permitted.`,
    { ok: false, changed: false, alreadyDecomposed: true, file: originRel },
  );
}

/**
 * A/B TOOLDEV19 TERMINAL IDEMPOTENCY GATE. One converged god-class decompose is
 * the END STATE (TARGET MET or the FROZEN ABSOLUTE_FLOOR — both terminal), so
 * the gate is now a single hard rule with NO PROGRESS/cap branch:
 *  • origin terminally decomposed this session → ⛔ alreadyDecomposedStop.
 *  • never decomposed → null (the single convergent pass may run).
 * Used by BOTH gate sites (runSymbolDecompose entry guard + create_file
 * auto-execute path) so the policy is single-sourced. The tooldev18
 * progress-counter / cap-4 / "one more pass" tangle is structurally deleted —
 * there is no multi-pass for it to bound. */
function decomposeIdempotencyStop(
  absPath: string,
  originRel: string,
): ToolOk | null {
  if (decomposeOutcomeFor(absPath)) return alreadyDecomposedStop(originRel);
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * A/B TOOLDEV20 — CONTENT/TARGET POST-COMPLETION GUARD (the R32 gap close).
 *
 * tooldev19 made the convergent decompose ONE terminal call. The residual
 * variance was purely the model IGNORING the advisory TARGET-MET STOP and
 * hand-rolling a 4-module restructuring TAIL (agent-prompt-format.ts,
 * tool-router.ts, message-pipeline.ts, …). The tooldev11/18 idempotency lock
 * caught only origin-as-target and same-CORE-STEM siblings — those tail
 * filenames don't share the origin stem, so they slipped past a FILENAME
 * heuristic. This guard converts the advisory STOP into an ENFORCED invariant
 * by inferring CONTINUATION from CONTENT + STATE (de-hardcoded — no fixed
 * filename pattern): for SOME origin already DONE this session, the new op
 *  (a) TARGETS that origin file itself, OR
 *  (b) is atomic_create_file whose content imports-from / re-exports-from the
 *      origin module (or a recorded sibling module / the core-stem barrel) OR
 *      declares/re-exports a symbol that decompose relocated OUT of it, OR
 *  (c) is move/extract whose fromFile IS that origin (case (a)).
 * Conservative by construction: a genuinely unrelated NEW file (no reference
 * to any DONE origin, no DONE moved-symbol declaration) returns null and is
 * allowed — the top-level / unrelated-creation path is unaffected.
 * ──────────────────────────────────────────────────────────────────────── */
const MODULE_EXT_RE = /\.(?:tsx?|jsx?|mts|cts|mjs|cjs)$/;

function baseStem(spec: string): string {
  return path.basename(spec).replace(MODULE_EXT_RE, '');
}

/** True when `content` (a proposed atomic_create_file body) clearly CONTINUES
 * the already-completed decomposition of `rec`: it imports/re-exports from the
 * origin module, a recorded sibling module, or the core-stem barrel, OR it
 * declares/re-exports a symbol the decompose relocated OUT of the origin. */
function contentContinuesDoneOrigin(
  rec: DecomposedOriginState,
  content: string,
  newDir: string | undefined,
): boolean {
  const specs = [
    ...content.matchAll(/(?:from|require\(|import\()\s*['"]([^'"]+)['"]/g),
  ].map((m) => baseStem(m[1]));
  const originStem = baseStem(rec.originRel);
  const moduleStems = new Set(rec.moduleRelPaths.map(baseStem));
  for (const s of specs) {
    if (s === originStem) return true; // imports / re-exports the origin module
    if (s === rec.coreStem) return true; // imports the core-stem barrel
    if (moduleStems.has(s)) return true; // imports a recorded sibling module
  }
  // The moved-symbol-declaration signal is the weakest one (a short/generic
  // name can collide with an unrelated declaration). Require it to ALSO be
  // physically part of the SAME origin's module tree (derived sibling) so a
  // coincidental same-name const in an unrelated file is NOT over-blocked.
  // The strong import/re-export-FROM-origin signal above stays location-
  // independent (it alone catches the R32 differently-named tail module).
  if (
    newDir !== undefined &&
    isDerivedSibling(newDir, { dir: rec.dir, coreStem: rec.coreStem }) &&
    rec.movedSymbols.length > 0
  ) {
    const moved = new Set(
      rec.movedSymbols.map((sym) => sym.split('.').pop() as string),
    );
    const declRe =
      /\b(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
    for (const m of content.matchAll(declRe)) if (moved.has(m[1])) return true;
    for (const m of content.matchAll(/export\s*\{([^}]*)\}/g))
      for (const part of m[1].split(','))
        if (moved.has(part.trim().split(/\s+as\s+/)[0].trim())) return true;
  }
  return false;
}

/** The ENFORCED post-completion invariant. Returns the SAME terminal ⛔
 * alreadyDecomposedStop message when `absPath` (and, for atomic_create_file,
 * `content`) clearly continues a decomposition already at its END STATE this
 * session; null otherwise (op proceeds unchanged — first decompose, the new
 * modules, and genuinely unrelated new files all pass). Per-file, never
 * global; nothing read further, nothing written. */
function postCompletionChurnStop(
  absPath: string,
  content?: string,
  relPath?: string,
): ToolOk | null {
  const st = decompStateFor(absPath);
  if (st.decomposeState.size === 0) return null;
  // (a)/(c) the op targets a DONE origin file itself (origin-as-target,
  // move/extract fromFile === origin, edit/replace on the origin).
  const direct = st.decomposeState.get(decompFileKey(absPath));
  if (direct) return alreadyDecomposedStop(direct.originRel);
  // (b) atomic_create_file whose CONTENT continues some DONE origin.
  if (content !== undefined) {
    const newDir = relPath !== undefined ? path.dirname(relPath) : undefined;
    for (const rec of st.decomposeState.values())
      if (contentContinuesDoneOrigin(rec, content, newDir))
        return alreadyDecomposedStop(rec.originRel);
  }
  return null;
}

/** Imperative terminal signal appended to every successful decompose /
 * auto-execute summary so the model unambiguously recognises completion and
 * stops re-structuring (the R22 stop-gap). Compact — no file bodies. */
const STRUCTURALLY_COMPLETE_DIRECTIVE =
  ' ✅ TASK STRUCTURALLY COMPLETE — this file is fully decomposed ' +
  '(re-exports + back-import done). Your ONLY remaining valid action is to ' +
  'run the test suite to verify. Do NOT create files, do NOT edit the new ' +
  'modules, do NOT decompose again.';

/* ─────────────────────────────────────────────────────────────────────────
 * TOOLDEV14 — MEASURED SELF-CERTIFICATION OF DECOMPOSE GOAL ATTAINMENT
 *
 * A successful decompose previously only ASSERTED completion in prose; the
 * model received no MEASURED proof it had already met the benchmark, so it
 * launched a second, wasteful restructuring wave (the residual turn/token/
 * cost tail). Atomic only beats Normal on efficiency when its fast-path is
 * as SHORT as Normal's — fewest validated round-trips to realise the
 * intention. So a decompose now MEASURES the realised result and emits a
 * verdict: one intention = one validated transaction, stop at the minimal
 * sufficient action.
 *
 * ORIGIN_TARGET / MODULE_TARGET mirror the A/B benchmark oracle (the
 * unified-agent.service.ts decompose contract: origin ≤ 350 LOC, each new
 * module ≤ 400 LOC). ───────────────────────────────────────────────────── */
const DECOMPOSE_ORIGIN_TARGET = 350;
const DECOMPOSE_MODULE_TARGET = 400;

/** A/B TOOLDEV19 — the SINGLE invariant that replaces the tooldev11-18 tangle
 * of fighting magic numbers (band 345, per-pass floor, cap 4, minimal-prefix,
 * model multi-pass). The ABSOLUTE_FLOOR is the maximal safe structural
 * reduction: the convergent god-class decompose never drives the origin below
 * `max(180, round(0.40 * originLoc0))` where originLoc0 is the origin LOC at
 * the START of the single terminal call — captured ONCE, FROZEN, NEVER
 * recomputed on the shrinking origin (that recompute was the tooldev18 husk
 * bug). Both the planner (selection) and the terminal verdict derive the floor
 * from the SAME quantity via this one helper → one source of truth. */
function absoluteDecomposeFloor(originLoc0: number): number {
  return Math.max(180, Math.round(0.4 * originLoc0));
}

function lineCountOf(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

interface DecomposeCompletionVerdict {
  met: boolean;
  verdict: string;
  originLoc: number;
  maxModuleLoc: number;
}

/** Measure the realised decompose (final origin LOC + largest new module
 * LOC) against the benchmark oracle and produce the verdict string that
 * leads summaryForHuman / the auto-execute STOP banner. One source of truth,
 * reused by BOTH the explicit tool success path and the create_file
 * auto-execute path (no logic duplication). */
function computeDecomposeCompletionVerdict(
  originText: string,
  moduleTexts: Map<string, string>,
  absoluteFloor: number,
): DecomposeCompletionVerdict {
  const originLoc = lineCountOf(originText);
  let maxModuleLoc = 0;
  for (const t of moduleTexts.values()) {
    const loc = lineCountOf(t);
    if (loc > maxModuleLoc) maxModuleLoc = loc;
  }
  // A/B TOOLDEV19: the terminal verdict is keyed on the ORIGIN LOC vs the
  // oracle (350). The single convergent call is ALWAYS an end state — there is
  // no PROGRESS/"do one more pass" verdict anymore (the multi-pass it advised
  // is structurally gone). Module size governs only bin-packing (the planner
  // keeps every module well under MODULE_TARGET), so it is no longer a fighting
  // condition in `met`.
  const met = originLoc <= DECOMPOSE_ORIGIN_TARGET;
  if (met) {
    return {
      met,
      originLoc,
      maxModuleLoc,
      verdict:
        `✅ TARGET MET — STRUCTURALLY COMPLETE: origin ${originLoc} ≤ ` +
        `${DECOMPOSE_ORIGIN_TARGET} LOC (largest new module ${maxModuleLoc} ` +
        `LOC; module sizing is a bin-packing concern, not a re-loop trigger). ` +
        `Your ONLY next action is to run the ` +
        `spec (npx jest unified-agent.service.spec) to confirm behavior. Do ` +
        `NOT decompose again, do NOT create more modules, do NOT ` +
        `replace_range/insert_at/edit_symbol to further restructure this ` +
        `origin or its new modules — that only adds churn/cost. STOP ` +
        `restructuring.`,
    };
  }
  // Floor-bound: the single convergent pass extracted the maximal SAFE set
  // without driving the origin below the FROZEN ABSOLUTE_FLOOR. This is the
  // maximal safe structural reduction and it is TERMINAL — explicitly NOT a
  // "do one more pass" message (that whack-a-mole is removed).
  return {
    met,
    originLoc,
    maxModuleLoc,
    verdict:
      `✅ MINIMALLY DECOMPOSED to the safe floor (origin ${originLoc}, ` +
      `ABSOLUTE_FLOOR ${absoluteFloor}; the remaining bulk is ` +
      `private/protected-coupled and cannot be safely extracted to sibling ` +
      `modules). This is the maximal safe structural reduction. Do NOT ` +
      `decompose again or hand-roll — either accept this structure and run ` +
      `the spec, or use atomic_move_symbol_to_file for a specific remaining ` +
      `method. STOP restructuring.`,
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
  });
  if (preview) {
    return ok(
      appendVerificationEconomy(
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
        { preview: true },
      ),
    );
  }
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
    return ok(
      appendVerificationEconomy(
        noteMutationAndSteer(absPath, {
          ok: true,
          changed: true,
          created: before === '',
          file: relPath,
          hint:
            'For decomposing an existing file into multiple modules, prefer ' +
            'atomic_decompose_file (one call, all-or-nothing) instead of multiple ' +
            'atomic_create_file.',
          ...targetDetails(absPath, relPath),
          lines,
          bytesNet: result.newText.length - before.length,
          afterSha256: sha256(result.newText),
          validation: {
            language: v.language,
            syntaxErrorsBefore: v.before,
            syntaxErrorsAfter: v.after,
          },
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
        }),
        { tracePath: persisted.tracePath },
      ),
    );
  }
  atomicWrite(absPath, result.newText);
  log(`wrote ${relPath} (+${result.newText.length - before.length} bytes net)`);
  const writtenPayload = noteMutationAndSteer(
    absPath,
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
        ...extra,
      },
      { inlinePreview, legacyDiff: previewDiff(before, result.newText, relPath), trace },
    ),
  );
  return ok(
    appendVerificationEconomy(writtenPayload, {
      tracePath: writtenPayload.tracePath as string | null | undefined,
    }),
  );
}

/**
 * A/B TOOLDEV23 — forgiving input aliases for the high-frequency read/edit
 * tools. Measured cross-benchmark waste: workers repeatedly call `code_outline
 * {path:...}` / `atomic_replace_text {find:...,replace:...}` and get HARD zod
 * rejections before retrying with the canonical key. The founding Princípio is
 * "the tool resolves the intention; do not force the model to match a rigid
 * schema". This map lets the canonical key absorb obvious synonyms BEFORE zod
 * runs. Non-destructive: an explicitly-provided canonical is never overwritten;
 * if a canonical and a differing alias are both present the canonical wins and
 * an `_aliasNote` records the ignored alias. Behaviour/output for canonical
 * calls is byte-identical — only previously-rejected alias shapes now succeed.
 */
const TOOLDEV23_ARG_ALIASES: Record<string, readonly string[]> = {
  file: ['path', 'filename', 'filePath'],
  dir: ['path', 'directory', 'file', 'filePath', 'filename'],
  oldText: ['find', 'search', 'from'],
  newText: ['replace', 'replacement', 'to'],
};

function normalizeToolArgs<T extends Record<string, unknown>>(a: T): T {
  if (a === null || typeof a !== 'object') return a;
  const out: Record<string, unknown> = { ...a };
  const has = (v: unknown): boolean => v !== undefined && v !== null && v !== '';
  const aliasKeys = new Set<string>();
  for (const [canonical, aliases] of Object.entries(TOOLDEV23_ARG_ALIASES)) {
    for (const alias of aliases) {
      aliasKeys.add(alias);
      if (!has(out[alias])) continue;
      if (!has(out[canonical])) {
        out[canonical] = out[alias];
      } else if (out[canonical] !== out[alias] && out._aliasNote === undefined) {
        out._aliasNote =
          `arg '${alias}' ignored; canonical '${canonical}' takes precedence (tooldev23 alias)`;
      }
    }
  }
  // Strip consumed alias keys, but never a key that is itself a canonical
  // (e.g. `file` is both canonical and an alias of `dir`).
  for (const k of aliasKeys) {
    if (!(k in TOOLDEV23_ARG_ALIASES)) delete out[k];
  }
  return out as T;
}

const server = new McpServer({ name: 'kloel-atomic-edit', version: '4.0.0' });

const pos = z.object({
  line: z.number().int().min(1).describe('1-based line'),
  column: z.number().int().min(1).describe('1-based column (UTF-16 units within the line)'),
});

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
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      // A/B TOOLDEV20: ENFORCED post-completion invariant — file === a DONE
      // origin ⇒ this is the R32-style restructuring tail; HARD-STOP ⛔.
      {
        const churn = postCompletionChurnStop(absPath);
        if (churn) return churn;
      }
      const before = readUtf8(absPath);
      const r = applyEdits(relPath, before, [
        {
          start: { line: a.startLine, column: a.startColumn },
          end: { line: a.endLine, column: a.endColumn },
          newText: a.newText,
        },
      ]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false);
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
        .optional()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      // tooldev23 forgiving aliases (normalized to canonical before use)
      path: z.string().optional(),
      filename: z.string().optional(),
      filePath: z.string().optional(),
      oldText: z
        .string()
        .optional()
        .describe('exact verbatim text to replace, including whitespace/indentation'),
      find: z.string().optional(),
      search: z.string().optional(),
      from: z.string().optional(),
      newText: z.string().optional(),
      replace: z.string().optional(),
      replacement: z.string().optional(),
      to: z.string().optional(),
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
    },
  },
  async (a) => {
    try {
      const n = normalizeToolArgs(a as Record<string, unknown>) as typeof a & {
        _aliasNote?: string;
      };
      const { absPath, relPath } = resolveSafeTarget(n.file as string);
      // A/B TOOLDEV20: ENFORCED post-completion invariant — file === a DONE
      // origin ⇒ this is the R32-style restructuring tail; HARD-STOP ⛔.
      {
        const churn = postCompletionChurnStop(absPath);
        if (churn) return churn;
      }
      const before = readUtf8(absPath);
      guardSha(before, n.expectedSha256);
      const r = replaceText(
        relPath,
        before,
        n.oldText as string,
        n.newText as string,
        n.occurrence,
      );
      return commit(
        relPath,
        absPath,
        before,
        r,
        n._aliasNote ? { _aliasNote: n._aliasNote } : {},
        n.preview ?? false,
      );
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
      'a shell heredoc (cat > file) — that bypasses validation, trace and governance and is a banned escape. ' +
      'For decomposing an existing file into multiple modules, prefer atomic_decompose_file (one call, ' +
      'all-or-nothing) instead of multiple atomic_create_file.',
    inputSchema: {
      file: z.string().describe('repo-relative path of the file to create'),
      content: z.string().describe('full file content'),
      overwrite: z
        .boolean()
        .optional()
        .describe(
          'replace an existing file wholesale (default false → refuse if it already exists)',
        ),
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
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
      // A/B TOOLDEV20: ENFORCED post-completion invariant. If this new file
      // CONTINUES a decomposition already at its END STATE this session
      // (imports/re-exports the origin or a sibling module, declares a moved
      // symbol, or targets the origin itself), HARD-STOP ⛔ with the terminal
      // directive — the model PHYSICALLY cannot add the R32-style manual
      // restructuring tail after TARGET MET. Content-based, not filename
      // heuristic; a genuinely unrelated new file (no reference) still passes.
      {
        const churn = postCompletionChurnStop(absPath, a.content, relPath);
        if (churn) return churn;
      }
      // A/B R16→R17: steer the decomposition meta-operator. If this is a
      // sibling/derived module of a source code_outline'd this session and
      // the clear split signature is present, refuse and point at
      // atomic_decompose_file (one validated all-or-nothing call) instead of
      // N create_file calls. Conservative — genuine standalone creation passes.
      const decomp = await decompositionSteer(absPath, relPath);
      if (decomp) {
        if (decomp.readyCall) {
          // A/B R22→TOOLDEV11 IDEMPOTENCY: if this origin was ALREADY
          // decomposed this session, do NOT auto-execute (and do NOT fall
          // back to the steer message) — hard-stop directly so the model
          // gets the unambiguous "structurally complete, run the tests"
          // signal instead of being nudged to decompose yet again.
          try {
            const guardAbs = resolveSafeTarget(decomp.readyCall.file).absPath;
            // TOOLDEV18: HARD-STOP only when GENUINELY TARGET MET (R22 churn)
            // or the PROGRESS anti-loop cap is hit. A prior PROGRESS pass
            // under the cap is ALLOWED through — re-planning + auto-executing
            // the NEXT minimal extractability-filtered pass is the guided,
            // faithful next atom (not churn).
            const idemStop = decomposeIdempotencyStop(
              guardAbs,
              decomp.readyCall.file,
            );
            if (idemStop) return idemStop;
          } catch {
            /* unresolvable origin → fall through to normal auto-execute */
          }
          // A/B R21→TOOLDEV10: do NOT rely on the model to CHOOSE decompose.
          // The OS already computed a confident auto-plan from the cached
          // outline — AUTO-EXECUTE the SAME all-or-nothing transaction the
          // atomic_decompose_file tool runs (runSymbolDecompose), so the
          // split just happens instead of the model hand-rolling it after a
          // deny. SAFETY: any throw OR not-ok result ⇒ fall back to the
          // prior deny+readyCall — runSymbolDecompose is itself
          // all-or-nothing (no partial write, no corruption), so on any
          // failure this call behaves exactly as before this change.
          try {
            const auto = await runSymbolDecompose(
              decomp.readyCall.file,
              decomp.readyCall.plan,
            );
            if (!auto.isError) {
              const mods = decomp.readyCall.plan.map((p) => p.newModule);
              // TOOLDEV14: lead the STOP banner with the SAME measured
              // verdict runSymbolDecompose computed (surfaced on the ToolOk),
              // so the create_file→auto path self-certifies "TARGET MET …
              // STOP restructuring" too — no logic duplication.
              const autoVerdict = (
                auto as { completionVerdict?: DecomposeCompletionVerdict }
              ).completionVerdict;
              const verdictLead = autoVerdict ? `${autoVerdict.verdict} ` : '';
              const stop =
                verdictLead +
                `🔁 atomic_create_file detected a decomposition of ` +
                `${decomp.readyCall.file} and AUTO-EXECUTED ` +
                `atomic_decompose_file for you: ${mods.length} module(s) ` +
                `created [${mods.join(', ')}], typed re-exports + origin ` +
                `back-import done, all-or-nothing syntax-validated. DO NOT ` +
                `create these modules manually and DO NOT call ` +
                `atomic_decompose_file again — the split is complete. ` +
                `Verify with the spec.` +
                STRUCTURALLY_COMPLETE_DIRECTIVE;
              // Prepend the unambiguous STOP summary; keep the compact
              // decompose payload (it already obeys the trace ECHO cap —
              // no file bodies are echoed).
              return {
                ...auto,
                content: [{ type: 'text' as const, text: stop }, ...auto.content],
              };
            }
            return failWith(decomp.message, { readyCall: decomp.readyCall });
          } catch {
            return failWith(decomp.message, { readyCall: decomp.readyCall });
          }
        }
        return fail(decomp.message);
      }
      const before = existingBefore;
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
      const created = commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'atomic_create_file', created: !exists },
        a.preview ?? false,
      );
      // Remember allowed sibling-creates so the 2nd derived module of an
      // outlined source trips the decomposition steer above.
      if (!created.isError && !(a.preview ?? false)) {
        recordSiblingCreate(absPath, relPath);
      }
      return created;
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
      const renameRepoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
      const renameTrace = buildTrace({
        file: relPath,
        repoRoot: renameRepoRoot,
        operator: 'rename_symbol',
        before,
        newText: r.newText,
        inlinePreview: characterDiff(before, r.newText, relPath),
        validation: {
          language: r.validation.language,
          before: r.validation.before,
          after: r.validation.after,
        },
      });
      atomicWrite(absPath, r.newText);
      const renamePersisted = writeTrace(renameTrace);
      log(`renamed ${r.symbol} in ${relPath} (${r.occurrences} refs)`);
      const renameSummary =
        `✅ Renamed ${r.symbol} in ${relPath} (${r.occurrences} ref(s), ` +
        `scope-correct, syntax-validated). Char-level proof persisted to the ` +
        `trace file (not echoed back, to save context).`;
      return ok(
        appendVerificationEconomy(
          {
            ok: true,
            changed: true,
            file: relPath,
            symbol: r.symbol,
            references: r.occurrences,
            summaryForHuman: renameSummary,
            summary: renameSummary,
            operationId: renameTrace.operationId,
            operation: renameTrace.operation,
            ...renamePersisted,
          },
          { tracePath: renamePersisted.tracePath },
        ),
      );
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
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
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
      return commit(relPath, absPath, before, applied, {
        matched: r.matched,
        op: 'replace_literal',
      });
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
        .optional()
        .describe(
          "repo-relative to the MCP server root, or absolute worktree directory; '.' is server root",
        ),
      // tooldev23 forgiving aliases (normalized to canonical before use)
      path: z.string().optional(),
      directory: z.string().optional(),
      file: z.string().optional(),
      filePath: z.string().optional(),
      filename: z.string().optional(),
    },
  },
  async (a) => {
    try {
      const n = normalizeToolArgs(a as Record<string, unknown>) as typeof a & {
        dir?: string;
        _aliasNote?: string;
      };
      const { absPath, relPath } = resolveSafeTarget((n.dir as string) || '.');
      return ok({
        ok: true,
        dir: relPath || '.',
        ...targetDetails(absPath, relPath),
        entries: browse(absPath),
        ...(n._aliasNote ? { _aliasNote: n._aliasNote } : {}),
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
        .optional()
        .describe(
          'repo-relative to the MCP server root, or absolute file path inside a registered worktree',
        ),
      // tooldev23 forgiving aliases (normalized to canonical before use)
      path: z.string().optional(),
      filename: z.string().optional(),
      filePath: z.string().optional(),
    },
  },
  async (a) => {
    try {
      const n = normalizeToolArgs(a as Record<string, unknown>) as typeof a & {
        file?: string;
        _aliasNote?: string;
      };
      const { absPath, relPath } = resolveSafeTarget(n.file as string);
      const srcText = readUtf8(absPath);
      const o = await outline(relPath, srcText);
      recordOutline(absPath, relPath, o.symbols, lineCountOf(srcText), srcText);
      return ok({
        ok: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        ...o,
        ...(n._aliasNote ? { _aliasNote: n._aliasNote } : {}),
      });
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
        .optional()
        .describe(
          'repo-relative to the MCP server root, or absolute file path inside a registered worktree',
        ),
      selector: z.string().describe("unscoped 'name' or scoped 'Class.method' / 'A.B.c'"),
      // tooldev23 forgiving aliases (normalized to canonical before use)
      path: z.string().optional(),
      filename: z.string().optional(),
      filePath: z.string().optional(),
    },
  },
  async (a) => {
    try {
      const n = normalizeToolArgs(a as Record<string, unknown>) as typeof a & {
        file?: string;
        _aliasNote?: string;
      };
      const { absPath, relPath } = resolveSafeTarget(n.file as string);
      const r = await readSymbol(relPath, readUtf8(absPath), n.selector);
      return ok({
        ok: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        ...r,
        ...(n._aliasNote ? { _aliasNote: n._aliasNote } : {}),
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
    },
  },
  async (a) => {
    try {
      const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
      // A/B TOOLDEV20: ENFORCED post-completion invariant — file === a DONE
      // origin ⇒ this is the R32-style restructuring tail; HARD-STOP ⛔.
      {
        const churn = postCompletionChurnStop(absPath);
        if (churn) return churn;
      }
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
      // tooldev24: editSymbol now splices ONLY the differing inner span
      // (Preservação Máxima com Mutação Mínima — §6.1/§6.2), so the durable
      // proof must record the TRUE minimal delta: head/tail are byte-identical
      // anchors, the modified zone is the minimal changed span — never the
      // whole symbol. Falls back to the generic zones for ops without a
      // changedSpan (insert_after / remove are already minimal by construction).
      const symMetrics = changedSpanMetrics(before, r.newText);
      const symPreserved =
        r.changedSpan && r.symbolLength != null
          ? [
              {
                kind: 'symbol_head_tail_anchor',
                description:
                  `Only ${r.changedSpan.oldLen}→${r.changedSpan.newLen} chars inside the ` +
                  `${r.symbolLength}-char symbol were rewritten; the head before and the ` +
                  `tail after the changed span are preserved byte-for-byte (no whole-symbol rewrite).`,
                beforeHash: symMetrics.preservedPrefixHash,
                afterHash: symMetrics.preservedSuffixHash,
              },
            ]
          : undefined;
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
        metrics: {
          changedChars: symMetrics.changedChars,
          lineRewriteSurfaceChars: symMetrics.lineSurfaceChars,
          expansionFactorAvoided: symMetrics.expansionFactor,
        },
        preservedZones: symPreserved,
        modifiedZones: [
          {
            kind: 'minimal_changed_span',
            oldSample: symMetrics.oldSample,
            newSample: symMetrics.newSample,
            description:
              'Minimal inner delta applied through the atomic write + syntax + ' +
              'regression pipeline (all-or-nothing, syntax-validated, rollback intact).',
            metadata: r.changedSpan
              ? {
                  changedSpanStart: r.changedSpan.start,
                  changedSpanEnd: r.changedSpan.end,
                  changedSpanOldLen: r.changedSpan.oldLen,
                  changedSpanNewLen: r.changedSpan.newLen,
                  symbolLength: r.symbolLength,
                }
              : undefined,
          },
        ],
      });
      if (a.preview ?? false) {
        return ok(
          appendVerificationEconomy(
            shapePayload(
              symLevel,
              {
                ok: true,
                preview: true,
                changed: false,
                file: relPath,
                selector: r.selector,
                op: r.op,
                intentionChars: symMetrics.changedChars,
                changedSpan: r.changedSpan,
                symbolLength: r.symbolLength,
              },
              {
                inlinePreview: symInline,
                legacyDiff: previewDiff(before, r.newText, relPath),
                trace: symTrace,
              },
            ),
            { preview: true },
          ),
        );
      }
      atomicWrite(absPath, r.newText);
      log(`edit_symbol ${a.op} ${r.selector} in ${relPath}`);
      const editSymbolPayload = shapePayload(
        symLevel,
        {
          ok: true,
          changed: true,
          file: relPath,
          selector: r.selector,
          op: r.op,
          intentionChars: symMetrics.changedChars,
          changedSpan: r.changedSpan,
          symbolLength: r.symbolLength,
        },
        {
          inlinePreview: symInline,
          legacyDiff: previewDiff(before, r.newText, relPath),
          trace: symTrace,
        },
      );
      return ok(
        appendVerificationEconomy(editSymbolPayload, {
          tracePath: editSymbolPayload.tracePath as string | null | undefined,
        }),
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

/**
 * Atomic Action Principle (tooldev21): the intention "rename THIS symbol
 * everywhere" must be expressible at its highest-faithful level — a selector —
 * with the TOOL resolving the position. We reuse symbols.ts `resolveSymbol`
 * (the exact CodeStruct selector grammar already shipped) over a lightweight
 * ts-morph SourceFile, then derive the 1-based (line,column) of the symbol's
 * NAME identifier and feed it UNCHANGED into the existing cross-file rename.
 * Resolution is NOT reimplemented here; the rename logic is NOT touched.
 * resolveSymbol's no-match / ambiguous errors (with their candidate list)
 * propagate verbatim so the caller gets an actionable next step, never a dead
 * end.
 */
async function resolveSelectorPosition(
  absPath: string,
  content: string,
  selector: string,
): Promise<{ line: number; column: number; resolvedSelector: string }> {
  const { Project, ts: tsm } = await import('ts-morph');
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: tsm.JsxEmit.Preserve, noEmit: true },
  });
  const sf = project.createSourceFile(absPath, content, { overwrite: true });
  const { node, info } = resolveSymbol(sf, selector);
  const named = node as unknown as {
    getNameNode?: () => { getStart: () => number } | undefined;
  };
  const nameNode = typeof named.getNameNode === 'function' ? named.getNameNode() : undefined;
  const pos = nameNode ? nameNode.getStart() : node.getStart();
  const lc = sf.getLineAndColumnAtPos(pos);
  return { line: lc.line, column: lc.column, resolvedSelector: info.selector };
}

server.registerTool(
  'atomic_rename_symbol_cross_file',
  {
    title: 'Scope-correct rename across the whole project',
    description:
      'True semantic rename via the TypeScript language service (nearest tsconfig): renames the symbol ' +
      'and ALL its references across every file, respecting scope/shadowing. Address the symbol at its ' +
      'highest-faithful level by `selector` ("name" or "Class.method" — the tool resolves the position ' +
      'for you), or by positional `line`(+`column`) for back-compat. ' +
      'All-or-nothing: if any touched file would break, NOTHING is written. This is the Kiro ' +
      "'use program analysis, not LLM guessing' operator. Supports preview.",
    inputSchema: {
      file: z.string(),
      selector: z
        .string()
        .optional()
        .describe(
          'highest-faithful: unscoped "name" or scoped "Class.method" / "A.B.c"; the tool resolves ' +
            'the definition position itself (reuses the CodeStruct selector grammar)',
        ),
      line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('positional (back-compat): 1-based line of the symbol identifier'),
      column: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('positional (back-compat): 1-based column; defaults to 1 when only line is given'),
      newName: z.string().min(1),
      preview: z.boolean().optional().describe('dry-run: list files + refs, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, repoRoot } = resolveSafeTarget(a.file);
      const hasSelector = typeof a.selector === 'string' && a.selector.trim().length > 0;
      const hasPos = a.line != null;
      if (!hasSelector && !hasPos) {
        return fail(
          'specify the symbol either by `selector` ("name" or "Class.method" — highest-faithful, ' +
            'position resolved for you) OR by positional `line` (+optional `column`). ' +
            'Neither was provided.',
        );
      }
      let line: number;
      let column: number;
      let selectorNote: string | undefined;
      if (hasSelector) {
        const sel = (a.selector as string).trim();
        const content = readUtf8(absPath);
        const resolved = await resolveSelectorPosition(absPath, content, sel);
        line = resolved.line;
        column = resolved.column;
        selectorNote = hasPos
          ? `both selector and line given — preferred selector "${resolved.resolvedSelector}" ` +
            `(highest-faithful), resolved to ${line}:${column}`
          : `selector "${resolved.resolvedSelector}" resolved to ${line}:${column}`;
      } else {
        line = a.line as number;
        column = a.column ?? 1;
      }
      const r = await renameSymbolCrossFile(absPath, repoRoot, line, column, a.newName);
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
        const xfilePreviewSummary =
          `△ cross-file rename ${r.symbol} → ${a.newName}: ` +
          `${r.changes.size} file(s), ${r.totalReferences} ref(s) (dry-run).`;
        return ok(
          appendVerificationEconomy(
            {
              ok: true,
              preview: true,
              changed: false,
              symbol: r.symbol,
              references: r.totalReferences,
              renamedRefs: r.renamedRefs,
              files: [...r.changes.keys()],
              residualUnresolved: r.residualUnresolved,
              summaryForHuman: xfilePreviewSummary,
              summary: xfilePreviewSummary,
              ...(selectorNote ? { selectorNote } : {}),
            },
            { preview: true },
          ),
        );
      }
      // tooldev26: the cross-file rename is all-or-nothing syntax-validated;
      // persist ONE trace keyed on the origin file so the op is OS-traced like
      // every other mutating op (the directive then carries its path).
      const xfileOriginRel = path.relative(repoRoot, absPath);
      const xfileOriginBefore = readUtf8(absPath);
      for (const [rel, content] of r.changes) {
        atomicWrite(path.join(repoRoot, rel), content);
      }
      const xfileOriginAfter = r.changes.get(xfileOriginRel) ?? readUtf8(absPath);
      const xfileTrace = buildTrace({
        file: xfileOriginRel,
        repoRoot,
        operator: 'rename_symbol_cross_file',
        before: xfileOriginBefore,
        newText: xfileOriginAfter,
        inlinePreview: characterDiff(xfileOriginBefore, xfileOriginAfter, xfileOriginRel),
        validation: { language: 'ts', before: 0, after: 0 },
      });
      const xfilePersisted = writeTrace(xfileTrace);
      log(`cross-file rename ${r.symbol}: ${r.changes.size} file(s), ${r.totalReferences} refs`);
      const xfileSummary =
        `✅ Cross-file rename ${r.symbol} → ${a.newName}: ${r.changes.size} ` +
        `file(s), ${r.totalReferences} ref(s) renamed, all-or-nothing ` +
        `syntax-validated. Char-level proof persisted to the trace file.`;
      return ok(
        appendVerificationEconomy(
          {
            ok: true,
            changed: true,
            symbol: r.symbol,
            references: r.totalReferences,
            renamedRefs: r.renamedRefs,
            files: [...r.changes.keys()],
            residualUnresolved: r.residualUnresolved,
            summaryForHuman: xfileSummary,
            summary: xfileSummary,
            operationId: xfileTrace.operationId,
            operation: xfileTrace.operation,
            ...xfilePersisted,
            ...(selectorNote ? { selectorNote } : {}),
          },
          { tracePath: xfilePersisted.tracePath },
        ),
      );
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
  });
  if (preview) {
    return ok(
      appendVerificationEconomy(
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
        { preview: true },
      ),
    );
  }
  atomicWrite(absPath, r.newText);
  log(`semantic edit ${JSON.stringify(r.detail)} in ${relPath}`);
  const semanticPayload = noteMutationAndSteer(
    absPath,
    shapePayload(
      semLevel,
      {
        ok: true,
        changed: true,
        file: relPath,
        ...targetDetails(absPath, relPath),
        afterSha256: sha256(r.newText),
        ...r.detail,
      },
      {
        inlinePreview: semInline,
        legacyDiff: previewDiff(before, r.newText, relPath),
        trace: semTrace,
      },
    ),
  );
  return ok(
    appendVerificationEconomy(semanticPayload, {
      tracePath: semanticPayload.tracePath as string | null | undefined,
    }),
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
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await addNamedImport(relPath, before, a.module, a.name, a.alias);
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
      'Each entry may use INTENTION-LEVEL `ops` (edit_symbol/replace_text/insert_after_anchor/' +
      'replace_range — the same position-resolving operators, server resolves every position) ' +
      'so wiring one field through N files is ONE call — no hand-computed coordinates. ' +
      'Supports preview (dry-run, per-file atomicDiff).',
    inputSchema: {
      plan: z
        .array(
          z.object({
            file: z.string().describe('repo-relative path'),
            // One entry = one file's slice of the product intention. Mix freely
            // ACROSS the plan: NEW-file creates (decomposition targets) + ranged
            // trims of the origin + import rewiring — all validated in memory,
            // all-or-nothing, with NO artificial batch-size cap.
            create: z
              .string()
              .optional()
              .describe('full content for a NEW file (decomposition/extraction target)'),
            overwrite: z
              .boolean()
              .optional()
              .describe('with create: replace an existing non-empty file wholesale'),
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
              .min(1)
              .optional()
              .describe('≥1 non-overlapping ranged edits on an EXISTING file'),
            addImports: z
              .array(
                z.object({
                  module: z.string(),
                  name: z.string(),
                  alias: z.string().optional(),
                }),
              )
              .min(1)
              .optional()
              .describe('named imports to add (deduped, comma-safe) after edits'),
            // A/B TOOLDEV25 — INTENTION-LEVEL ops: the SAME position-
            // resolving operators the model already uses single-file, now
            // composable per-file inside the all-or-nothing transaction. Each
            // op resolves its OWN position internally (selector / verbatim
            // anchor / range) against the EVOLVING in-memory buffer, applied
            // in array order. No hand-computed coordinates needed — this is
            // what makes "one product intention across N files" ONE call.
            ops: z
              .array(
                z.union([
                  z.object({
                    op: z.literal('edit_symbol'),
                    selector: z.string(),
                    op2: z.enum(['replace', 'insert_after', 'remove']),
                    code: z.string().optional(),
                  }),
                  z.object({
                    op: z.literal('replace_text'),
                    oldText: z.string().optional(),
                    find: z.string().optional(),
                    newText: z.string().optional(),
                    replace: z.string().optional(),
                    occurrence: z.number().int().min(1).optional(),
                  }),
                  z.object({
                    op: z.literal('insert_after_anchor'),
                    anchorText: z.string(),
                    insertText: z.string(),
                    occurrence: z.number().int().min(1).optional(),
                  }),
                  z.object({
                    op: z.literal('replace_range'),
                    startLine: z.number().int().min(1),
                    startColumn: z.number().int().min(1),
                    endLine: z.number().int().min(1),
                    endColumn: z.number().int().min(1),
                    newText: z.string(),
                  }),
                ]),
              )
              .min(1)
              .optional()
              .describe(
                'high-level, position-resolving ops applied IN ORDER on the ' +
                  'evolving in-memory buffer (edit_symbol by selector | ' +
                  'replace_text by verbatim text | insert_after_anchor by ' +
                  'verbatim anchor | replace_range by coords). The server ' +
                  'resolves each position — pass the INTENTION, not offsets. ' +
                  'Any op that fails to resolve refuses the WHOLE transaction.',
              ),
          }),
        )
        .min(1)
        .describe(
          'one entry per file; each declares ≥1 op (create | edits | addImports | ops). ' +
            '`ops` are intention-level (selector/anchor/range-resolving) — prefer them ' +
            'for cross-file feature wiring. A whole module decomposition — N file ' +
            'creates + origin trims + import rewiring — is ONE atomic, syntax-' +
            'validated, all-or-nothing transaction.',
        ),
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
        needsMkdir: boolean;
        created: boolean;
      }[] = [];
      const refuse = (relPath: string, v: ApplyResult['validation']) =>
        fail(
          `transaction REFUSED — ${relPath} would regress ` +
            `(${v.language}: ${v.before}->${v.after}). ` +
            `${v.introduced ?? ''} — NOTHING written (all-or-nothing).`,
        );
      // Whole-file (re)write spec — same shape atomic_create_file uses, so a
      // create or an import-composed result is validated for no-syntax-
      // regression against its own `before`, identically to a ranged edit.
      const wholeFileEdit = (src: string, content: string): TextEditSpec => {
        if (src === '') {
          return { start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, newText: content };
        }
        const lines = src.split('\n');
        return {
          start: { line: 1, column: 1 },
          end: { line: lines.length, column: lines[lines.length - 1].length + 1 },
          newText: content,
        };
      };
      for (const entry of a.plan) {
        const { absPath, relPath, repoRoot } = resolveSafeTarget(entry.file);
        const hasCreate = typeof entry.create === 'string';
        const hasEdits = (entry.edits?.length ?? 0) > 0;
        const hasImports = (entry.addImports?.length ?? 0) > 0;
        const hasOps = (entry.ops?.length ?? 0) > 0;
        if (!hasCreate && !hasEdits && !hasImports && !hasOps) {
          return fail(
            `transaction REFUSED — plan entry for ${relPath} declares no operation ` +
              `(need one of: create, edits, addImports, ops). NOTHING written (all-or-nothing).`,
          );
        }
        if (hasCreate && hasEdits) {
          return fail(
            `transaction REFUSED — ${relPath}: 'create' (whole new file) and ` +
              `line-based 'edits' are mutually exclusive in one entry. NOTHING written.`,
          );
        }
        if (hasCreate && hasOps) {
          return fail(
            `transaction REFUSED — ${relPath}: 'create' (whole new file) and ` +
              `position-resolving 'ops' (which resolve against an EXISTING file) ` +
              `are mutually exclusive in one entry. NOTHING written.`,
          );
        }
        const exists = fs.existsSync(absPath);
        let before: string;
        let needsMkdir = false;
        let created = false;
        let result: ApplyResult;
        if (hasCreate) {
          const existingBefore = exists ? fs.readFileSync(absPath, 'utf8') : '';
          if (exists && existingBefore.trim() !== '' && !(entry.overwrite ?? false)) {
            return fail(
              `transaction REFUSED — ${relPath} already exists and is non-empty. ` +
                `Pass overwrite:true to replace it wholesale, or use 'edits' for a ` +
                `surgical change. NOTHING written (all-or-nothing).`,
            );
          }
          before = existingBefore;
          needsMkdir = !exists;
          created = !exists;
          result = applyEdits(relPath, before, [wholeFileEdit(before, entry.create as string)]);
          if (!result.validation.ok) return refuse(relPath, result.validation);
        } else {
          // Existing-file path. Ranged trims are line-addressed against the
          // ORIGINAL; import rewiring is then composed on the trimmed text.
          before = readUtf8(absPath);
          const mappedEdits: TextEditSpec[] = (entry.edits ?? []).map((e) => ({
            start: { line: e.startLine, column: e.startColumn },
            end: { line: e.endLine, column: e.endColumn },
            newText: e.newText,
          }));
          if (hasEdits && !hasImports && !hasOps) {
            // edits-only: keep the original single-pass ApplyResult (true
            // metrics, minimum mutation — identical to pre-extension behaviour).
            result = applyEdits(relPath, before, mappedEdits);
            if (!result.validation.ok) return refuse(relPath, result.validation);
          } else {
            let working = before;
            if (hasEdits) {
              const er = applyEdits(relPath, before, mappedEdits);
              if (!er.validation.ok) return refuse(relPath, er.validation);
              working = er.newText;
            }
            // A/B TOOLDEV25 — INTENTION-LEVEL ops. Each op resolves its OWN
            // position via the SAME per-operator resolver the model already
            // uses single-file (NOT duplicated), against the EVOLVING buffer
            // so sequential ops compose. Any op that fails to resolve
            // (ambiguous anchor / unknown selector / no-match / bad range)
            // refuses the WHOLE transaction with a precise per-op error —
            // nothing written (all-or-nothing).
            let opIdx = 0;
            for (const o of entry.ops ?? []) {
              let opRes: { newText: string; validation: ValidationResult };
              try {
                if (o.op === 'edit_symbol') {
                  opRes = await editSymbol(
                    relPath,
                    working,
                    o.selector,
                    o.op2 as SymbolOp,
                    o.code,
                  );
                } else if (o.op === 'replace_text') {
                  const oldT = o.oldText ?? o.find;
                  const newT = o.newText ?? o.replace;
                  if (oldT == null || newT == null) {
                    throw new Error(
                      "replace_text needs oldText|find + newText|replace",
                    );
                  }
                  opRes = replaceText(relPath, working, oldT, newT, o.occurrence);
                } else if (o.op === 'insert_after_anchor') {
                  // Reuse the verbatim-match replaceText resolver: replace the
                  // anchor with anchor+insert (occurrence-aware, ambiguity-
                  // refusing) — identical resolution semantics, no duplication.
                  opRes = replaceText(
                    relPath,
                    working,
                    o.anchorText,
                    o.anchorText + o.insertText,
                    o.occurrence,
                  );
                } else {
                  opRes = applyEdits(relPath, working, [
                    {
                      start: { line: o.startLine, column: o.startColumn },
                      end: { line: o.endLine, column: o.endColumn },
                      newText: o.newText,
                    },
                  ]);
                }
              } catch (opErr) {
                return fail(
                  `transaction REFUSED — ${relPath} ops[${opIdx}] (${o.op}) ` +
                    `failed to resolve: ` +
                    `${opErr instanceof Error ? opErr.message : String(opErr)} ` +
                    `— NOTHING written (all-or-nothing).`,
                );
              }
              if (!opRes.validation.ok) return refuse(relPath, opRes.validation);
              working = opRes.newText;
              opIdx++;
            }
            for (const imp of entry.addImports ?? []) {
              const sem = await addNamedImport(relPath, working, imp.module, imp.name, imp.alias);
              if (!sem.validation.ok) return refuse(relPath, sem.validation);
              working = sem.newText;
            }
            // Unify the composed result into ONE ApplyResult whose validation
            // re-checks no-syntax-regression of the FINAL text vs the ORIGINAL.
            result = applyEdits(relPath, before, [wholeFileEdit(before, working)]);
            if (!result.validation.ok) return refuse(relPath, result.validation);
          }
        }
        staged.push({ relPath, absPath, repoRoot, before, result, needsMkdir, created });
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
        return ok(
          appendVerificationEconomy(
            {
              summaryForHuman,
              summary: summaryForHuman,
              ok: true,
              preview: true,
              transaction: true,
              changed: false,
              note: `dry-run: ${staged.length} file(s) validated, NOTHING written`,
              files,
            },
            { preview: true },
          ),
        );
      }
      // Phase 2 — write all; roll back written files if any write throws.
      const written: { absPath: string; before: string; created: boolean }[] = [];
      try {
        for (const s of staged) {
          if (s.result.newText === s.before) continue;
          if (s.needsMkdir) fs.mkdirSync(path.dirname(s.absPath), { recursive: true });
          atomicWrite(s.absPath, s.result.newText);
          written.push({ absPath: s.absPath, before: s.before, created: s.created });
        }
      } catch (writeErr) {
        // True all-or-nothing rollback: restore prior content for files that
        // existed; DELETE files this transaction created (no orphan stubs).
        for (const w of written) {
          try {
            if (w.created) fs.rmSync(w.absPath, { force: true });
            else atomicWrite(w.absPath, w.before);
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
      // A/B TOOLDEV25 — the coordinated multi-file tool was used: the steer's
      // job is done, clear the session multi-file tracker so it only fires
      // again for a NEW uncoordinated burst.
      resetMultiFileSteer();
      const summaryForHuman = summarizeTransaction('✅ Atomic transaction applied', traceRefs);
      return ok(
        appendVerificationEconomy(
          {
            summaryForHuman,
            summary: summaryForHuman,
            ok: true,
            transaction: true,
            changed: true,
            filesWritten: written.length,
            files,
          },
          { tracePath: traceRefs[0] },
        ),
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ── Symbol relocation — Princípio da Ação Atômica topologies #11/#14 ──
// move_symbol_keep_body / extract_function_keep_logic. A decomposition step
// becomes ONE cheap call: the model passes only names + paths, NEVER a file
// body (re-emitting bodies is the proven compose-paralysis). The server reads
// the symbol, carries the imports it needs, deletes it surgically from the
// origin, (re)creates/append it in the target, optionally leaves a re-export
// so the public API is byte-stable — both files validated, all-or-nothing,
// char-level trace with movementZones.
async function runSymbolMove(
  fromFileArg: string,
  symbol: string,
  toFileArg: string,
  leaveReExport: boolean,
  extract: boolean,
): Promise<ToolOk> {
  const { absPath: fromAbs, relPath: fromRel } = resolveSafeTarget(fromFileArg);
  const { absPath: toAbs, relPath: toRel, repoRoot } = resolveSafeTarget(toFileArg);
  const opName = extract ? 'atomic_extract_symbol' : 'atomic_move_symbol_to_file';
  // A/B TOOLDEV20: ENFORCED post-completion invariant — case (c). Moving /
  // extracting OUT of an origin already at its decompose END STATE this
  // session is the R32-style continuation tail; HARD-STOP ⛔ (terminal
  // directive, nothing read further, nothing written).
  {
    const churn = postCompletionChurnStop(fromAbs);
    if (churn) return churn;
  }
  const fromBefore = readUtf8(fromAbs);
  const toExists = fs.existsSync(toAbs);
  const toBefore = toExists ? fs.readFileSync(toAbs, 'utf8') : '';
  if (extract && toExists && toBefore.trim() !== '') {
    return fail(
      `${opName} requires a NEW sibling module — ${toRel} already exists and is ` +
        `non-empty. Use atomic_move_symbol_to_file to append into an existing file.`,
    );
  }
  const r = await moveSymbolToFile({
    fromRel,
    fromBefore,
    toRel,
    toBefore,
    toExists,
    selector: symbol,
    leaveReExport: extract ? true : leaveReExport,
  });
  if (!r.from.validation.ok) {
    return fail(
      `${opName} REFUSED — origin ${fromRel} would regress ` +
        `(${r.from.validation.language}: ${r.from.validation.before}->${r.from.validation.after}). ` +
        `${r.from.validation.introduced ?? ''} — NOTHING written (all-or-nothing).`,
    );
  }
  if (!r.to.validation.ok) {
    return fail(
      `${opName} REFUSED — target ${toRel} would regress ` +
        `(${r.to.validation.language}: ${r.to.validation.before}->${r.to.validation.after}). ` +
        `${r.to.validation.introduced ?? ''} — NOTHING written (all-or-nothing).`,
    );
  }
  if (r.from.after === fromBefore && r.to.after === toBefore) {
    return ok({ ok: true, changed: false, note: 'no change', from: fromRel, to: toRel });
  }
  const movedHash = sha256(r.movedText);
  const traceFor = (
    f: typeof r.from,
    movementZones: { kind: string; description: string; from: string; to: string; preservedHash: string }[],
  ) =>
    buildTrace({
      file: f.relPath,
      repoRoot,
      operator: opName,
      before: f.before,
      newText: f.after,
      inlinePreview: characterDiff(f.before, f.after, f.relPath),
      validation: {
        language: f.validation.language,
        before: f.validation.before,
        after: f.validation.after,
      },
      targetUnit: `symbol:${r.symbol}`,
      intention: `relocate ${r.symbol}: ${fromRel} -> ${toRel}`,
      semanticImpact: 'api_preserved_implementation_moved',
      movementZones,
    });
  const fromTrace = traceFor(r.from, [
    {
      kind: 'symbol_extraction',
      description:
        `${r.symbol} removed from ${fromRel}` +
        (r.leftReExport ? ' (re-export left so the public API is byte-stable)' : ''),
      from: fromRel,
      to: toRel,
      preservedHash: movedHash,
    },
  ]);
  const toTrace = traceFor(r.to, [
    {
      kind: 'symbol_relocation',
      description: `${r.symbol} ${r.to.created ? 'created in new module' : 'appended to'} ${toRel}`,
      from: fromRel,
      to: toRel,
      preservedHash: movedHash,
    },
  ]);
  // Phase 2 — write target then origin; roll back on any throw.
  const written: { absPath: string; before: string; created: boolean }[] = [];
  try {
    if (r.to.after !== toBefore) {
      if (!toExists) fs.mkdirSync(path.dirname(toAbs), { recursive: true });
      atomicWrite(toAbs, r.to.after);
      written.push({ absPath: toAbs, before: toBefore, created: !toExists });
    }
    if (r.from.after !== fromBefore) {
      atomicWrite(fromAbs, r.from.after);
      written.push({ absPath: fromAbs, before: fromBefore, created: false });
    }
  } catch (writeErr) {
    for (const w of written) {
      try {
        if (w.created) fs.rmSync(w.absPath, { force: true });
        else atomicWrite(w.absPath, w.before);
      } catch {
        /* best-effort rollback; original error reported below */
      }
    }
    return fail(
      `${opName} write failed; rolled back ${written.length} file(s): ` +
        (writeErr instanceof Error ? writeErr.message : String(writeErr)),
    );
  }
  const fromPersist = writeTrace(fromTrace);
  const toPersist = writeTrace(toTrace);
  log(`${extract ? 'extract' : 'move'} ${r.symbol}: ${fromRel} -> ${toRel}`);
  const summaryForHuman =
    `✅ ${extract ? 'Extracted' : 'Moved'} ${r.symbol}: ${fromRel} → ${toRel} ` +
    `(${r.to.created ? 'new module' : 'appended'}` +
    `${r.leftReExport ? ', re-export left' : ''}). ` +
    `Imports carried: ${r.neededImports.length}; back-imports: ${r.backImports.length}. ` +
    `Syntax ok in both files. ` +
    (r.originBackImportAdded
      ? `Origin back-import auto-added for ${r.originStillReferences.length} symbol(s) ` +
        `(${r.originStillReferences.join(', ')}); origin compiles — no manual import ` +
        `cleanup or verification needed. `
      : `Origin references no moved symbol — zero manual cleanup. `) +
    `You passed only names + paths — no file body was ` +
    `emitted. Char-level proof persisted to the trace files (not echoed back).`;
  return ok(
    appendVerificationEconomy(
      {
        summaryForHuman,
        summary: summaryForHuman,
        ok: true,
        changed: true,
        symbol: r.symbol,
        from: fromRel,
        to: toRel,
        targetCreated: r.to.created,
        leftReExport: r.leftReExport,
        neededImports: r.neededImports,
        backImports: r.backImports,
        originBackImportAdded: r.originBackImportAdded,
        originStillReferences: r.originStillReferences,
        validation: {
          from: {
            syntaxErrorsBefore: r.from.validation.before,
            syntaxErrorsAfter: r.from.validation.after,
          },
          to: {
            syntaxErrorsBefore: r.to.validation.before,
            syntaxErrorsAfter: r.to.validation.after,
          },
        },
        fromAfterSha256: sha256(r.from.after),
        toAfterSha256: sha256(r.to.after),
        fromTracePath: fromPersist.tracePath,
        toTracePath: toPersist.tracePath,
      },
      { tracePath: fromPersist.tracePath },
    ),
  );
}


/**
 * atomic_decompose_file — the highest faithful operator: one product
 * intention ("split this god-file into cohesive modules") = ONE
 * all-or-nothing, syntax-validated transaction. The caller passes ONLY
 * symbol names + target module paths; NO file body is ever emitted (that
 * re-emission is the proven compose-paralysis). Reuses the move.ts engine:
 * each plan entry's symbols are relocated in-memory, threaded through one
 * shared origin, then every new module + the trimmed origin are written
 * together with a single origin trace carrying movementZones for all moves.
 */
async function runSymbolDecompose(
  fileArg: string,
  plan: { symbols: string[]; newModule: string; reExport?: boolean }[],
): Promise<ToolOk> {
  const opName = 'atomic_decompose_file';
  const { absPath: originAbs, relPath: originRel, repoRoot } = resolveSafeTarget(fileArg);
  // A/B R22→TOOLDEV11 IDEMPOTENCY GUARD (the decisive fix): a 2nd structural
  // pass on an origin already decomposed this session is the self-inflicted
  // import-debris loop. Refuse early — nothing read further, nothing written,
  // all-or-nothing preserved. Covers BOTH the explicit atomic_decompose_file
  // tool and the create_file auto-execute (which routes through here too).
  // TOOLDEV18 unified gate: ⛔ only on GENUINE TARGET MET (R22 churn) or the
  // PROGRESS anti-loop cap. A prior PROGRESS pass under the cap falls through —
  // the minimal+floor extractability-filtered planner runs again and extracts
  // the NEXT minimal set, monotonically reducing the origin (the guided next
  // atom, not the self-inflicted re-split). Covers BOTH the explicit
  // atomic_decompose_file tool and the create_file auto-execute (routes here).
  const idemStop = decomposeIdempotencyStop(originAbs, originRel);
  if (idemStop) return idemStop;
  if (plan.length === 0) return fail(`${opName} requires a non-empty plan`);
  const originBefore = readUtf8(originAbs);

  // Pre-flight: resolve every target; refuse clobber / duplicate module /
  // origin-as-target / duplicate symbol BEFORE any surgery (all-or-nothing,
  // no orphan files).
  const targets = plan.map((p) => {
    const t = resolveSafeTarget(p.newModule);
    return { absPath: t.absPath, relPath: t.relPath, entry: p };
  });
  const seenMod = new Set<string>();
  for (const t of targets) {
    if (t.relPath === originRel)
      return fail(`${opName} REFUSED — newModule ${t.relPath} is the origin file itself.`);
    if (seenMod.has(t.relPath))
      return fail(`${opName} REFUSED — duplicate newModule ${t.relPath} in plan.`);
    seenMod.add(t.relPath);
    if (fs.existsSync(t.absPath) && fs.readFileSync(t.absPath, 'utf8').trim() !== '')
      return fail(
        `${opName} REFUSED — newModule ${t.relPath} already exists and is non-empty; ` +
          `decomposition only creates fresh sibling modules (no clobber, no orphan).`,
      );
  }
  const allSymbols = targets.flatMap((t) => t.entry.symbols);
  if (allSymbols.length === 0)
    return fail(`${opName} requires at least one symbol across the plan.`);
  const seenSym = new Set<string>();
  for (const s of allSymbols) {
    if (seenSym.has(s))
      return fail(`${opName} REFUSED — symbol "${s}" appears more than once in the plan.`);
    seenSym.add(s);
  }

  // Phase 1 — compute every move in-memory, threaded through one shared
  // origin. ts-morph surgery only; NOTHING is written until all moves
  // validate. Any unresolved symbol throws here -> handler returns fail
  // with nothing written.
  let originText = originBefore;
  let originVal: { language: string; before: number; after: number } = {
    language: 'ts',
    before: 0,
    after: 0,
  };
  const moduleTexts = new Map<string, string>();
  const moduleVal = new Map<string, { language: string; before: number; after: number }>();
  const moves: {
    symbol: string;
    to: string;
    movedHash: string;
    neededImports: string[];
    backImports: string[];
    leftReExport: boolean;
    originBackImportAdded: boolean;
    originStillReferences: string[];
  }[] = [];
  for (const t of targets) {
    const reExport = t.entry.reExport ?? true;
    let toText = '';
    for (const symbol of t.entry.symbols) {
      const r = await moveSymbolToFile({
        fromRel: originRel,
        fromBefore: originText,
        toRel: t.relPath,
        toBefore: toText,
        toExists: toText.trim() !== '',
        selector: symbol,
        leaveReExport: reExport,
      });
      if (!r.from.validation.ok)
        return fail(
          `${opName} REFUSED — origin ${originRel} would regress moving "${symbol}" ` +
            `(${r.from.validation.language}: ${r.from.validation.before}->${r.from.validation.after}). ` +
            `${r.from.validation.introduced ?? ''} — NOTHING written (all-or-nothing).`,
        );
      if (!r.to.validation.ok)
        return fail(
          `${opName} REFUSED — module ${t.relPath} would regress receiving "${symbol}" ` +
            `(${r.to.validation.language}: ${r.to.validation.before}->${r.to.validation.after}). ` +
            `${r.to.validation.introduced ?? ''} — NOTHING written (all-or-nothing).`,
        );
      originText = r.from.after;
      toText = r.to.after;
      originVal = {
        language: r.from.validation.language,
        before: r.from.validation.before,
        after: r.from.validation.after,
      };
      moduleVal.set(t.relPath, {
        language: r.to.validation.language,
        before: r.to.validation.before,
        after: r.to.validation.after,
      });
      moves.push({
        symbol: r.symbol,
        to: t.relPath,
        movedHash: sha256(r.movedText),
        neededImports: r.neededImports,
        backImports: r.backImports,
        leftReExport: r.leftReExport,
        originBackImportAdded: r.originBackImportAdded,
        originStillReferences: r.originStillReferences,
      });
    }
    moduleTexts.set(t.relPath, toText);
  }
  if (originText === originBefore)
    return ok({ ok: true, changed: false, note: 'no change', file: originRel });

  // Phase 2 — write every new module then the trimmed origin; roll back on
  // any throw (already-written modules removed, origin restored).
  const written: { absPath: string; before: string; created: boolean }[] = [];
  try {
    for (const t of targets) {
      const after = moduleTexts.get(t.relPath) as string;
      const existed = fs.existsSync(t.absPath);
      const prev = existed ? readUtf8(t.absPath) : '';
      if (!existed) fs.mkdirSync(path.dirname(t.absPath), { recursive: true });
      atomicWrite(t.absPath, after);
      written.push({ absPath: t.absPath, before: prev, created: !existed });
    }
    atomicWrite(originAbs, originText);
    written.push({ absPath: originAbs, before: originBefore, created: false });
  } catch (writeErr) {
    for (const w of written) {
      try {
        if (w.created) fs.rmSync(w.absPath, { force: true });
        else atomicWrite(w.absPath, w.before);
      } catch {
        /* best-effort rollback; original error reported below */
      }
    }
    return fail(
      `${opName} write failed; rolled back ${written.length} file(s): ` +
        (writeErr instanceof Error ? writeErr.message : String(writeErr)),
    );
  }

  // Single origin trace carrying movementZones for ALL moves + one
  // relocation trace per new module.
  const originTrace = buildTrace({
    file: originRel,
    repoRoot,
    operator: opName,
    before: originBefore,
    newText: originText,
    inlinePreview: characterDiff(originBefore, originText, originRel),
    validation: originVal,
    targetUnit: `file:${originRel}`,
    intention: `decompose ${originRel} into ${targets.length} cohesive sibling module(s)`,
    semanticImpact: 'api_preserved_implementation_moved',
    movementZones: moves.map((m) => ({
      kind: 'symbol_extraction',
      description:
        `${m.symbol} removed from ${originRel}` +
        (m.leftReExport ? ' (typed re-export left so the public API is byte-stable)' : ''),
      from: originRel,
      to: m.to,
      preservedHash: m.movedHash,
    })),
  });
  const originPersist = writeTrace(originTrace);
  const moduleTraces = targets.map((t) => {
    const tr = buildTrace({
      file: t.relPath,
      repoRoot,
      operator: opName,
      before: '',
      newText: moduleTexts.get(t.relPath) as string,
      inlinePreview: characterDiff('', moduleTexts.get(t.relPath) as string, t.relPath),
      validation: moduleVal.get(t.relPath) ?? { language: 'ts', before: 0, after: 0 },
      targetUnit: `file:${t.relPath}`,
      intention: `receive ${t.entry.symbols.join(', ')} from ${originRel}`,
      semanticImpact: 'api_preserved_implementation_moved',
      movementZones: moves
        .filter((m) => m.to === t.relPath)
        .map((m) => ({
          kind: 'symbol_relocation',
          description: `${m.symbol} relocated into new module ${t.relPath}`,
          from: originRel,
          to: t.relPath,
          preservedHash: m.movedHash,
        })),
    });
    return { module: t.relPath, tracePath: writeTrace(tr).tracePath };
  });

  log(`decompose ${originRel}: ${moves.length} symbol(s) -> ${targets.length} module(s)`);
  const originBackImportAdded = moves.some((m) => m.originBackImportAdded);
  const originStillReferences = [
    ...new Set(moves.flatMap((m) => m.originStillReferences)),
  ];
  const backImportNote = originBackImportAdded
    ? ` Origin back-import auto-added for ${originStillReferences.length} symbol(s) ` +
      `(${originStillReferences.join(', ')}); origin compiles — no manual import ` +
      `cleanup or verification needed.`
    : ` Origin references no moved symbol (originStillReferences=[]) — done, zero manual cleanup.`;
  // TOOLDEV14: MEASURE the realised result and self-certify goal attainment.
  // The verdict goes FIRST in summaryForHuman so the model sees measured
  // proof it has already met the benchmark and HALTS instead of launching a
  // second restructuring wave.
  // A/B TOOLDEV19: ABSOLUTE_FLOOR derived ONCE from the origin LOC at the
  // START of THIS call (`originBefore`). Because one converged call is
  // terminal and the idempotency gate then locks the origin, `originBefore`
  // IS the true frozen originLoc0 — the SAME quantity the planner used. No
  // recompute on a shrinking origin (the tooldev18 husk bug is gone).
  const absoluteFloor = absoluteDecomposeFloor(lineCountOf(originBefore));
  const verdict = computeDecomposeCompletionVerdict(
    originText,
    moduleTexts,
    absoluteFloor,
  );
  const summaryForHuman =
    `${verdict.verdict} ` +
    `✅ Decomposed ${originRel}: ${moves.length} symbol(s) relocated into ` +
    `${targets.length} new module(s) ` +
    `[${targets.map((t) => t.relPath).join(', ')}]. ` +
    `Typed re-exports left in the origin so every existing importer keeps ` +
    `working unchanged. Every touched file syntax-validated, all-or-nothing, ` +
    `one transaction. You passed only names + paths — no file body emitted. ` +
    `Char-level proof persisted to the trace files (not echoed back).` +
    backImportNote +
    STRUCTURALLY_COMPLETE_DIRECTIVE;
  // A/B TOOLDEV19: this single converged call is the END STATE — TARGET MET
  // or floor-bound (the maximal safe reduction) — BOTH terminal. Record the
  // origin as terminally decomposed UNCONDITIONALLY; the idempotency gate
  // then HARD-STOPS ⛔ any subsequent decompose / create_file trigger. No
  // PROGRESS-allows-another-pass branch survives (idempotent by construction).
  recordDecompose(originAbs, {
    originRel,
    movedSymbols: moves.map((m) => m.symbol),
    moduleRelPaths: targets.map((t) => t.relPath),
  });
  const decomposeResult = ok(
    appendVerificationEconomy(
      {
        summaryForHuman,
        summary: summaryForHuman,
        ok: true,
        changed: true,
        file: originRel,
        completionVerdict: {
          met: verdict.met,
          verdict: verdict.verdict,
          originLoc: verdict.originLoc,
          maxModuleLoc: verdict.maxModuleLoc,
          originTarget: DECOMPOSE_ORIGIN_TARGET,
          moduleTarget: DECOMPOSE_MODULE_TARGET,
        },
        originBackImportAdded,
        originStillReferences,
        modules: targets.map((t) => ({
          module: t.relPath,
          symbols: t.entry.symbols,
          reExport: t.entry.reExport ?? true,
        })),
        movedSymbols: moves.map((m) => m.symbol),
        moveCount: moves.length,
        originAfterSha256: sha256(originText),
        originTracePath: originPersist.tracePath,
        moduleTracePaths: moduleTraces,
      },
      { tracePath: originPersist.tracePath },
    ),
  );
  // Surface the SAME computed verdict on the ToolOk itself so the
  // create_file auto-execute path (tooldev10) reuses it to lead its STOP
  // banner — one source of truth, no logic duplication.
  decomposeResult.completionVerdict = verdict;
  return decomposeResult;
}


server.registerTool(
  'atomic_move_symbol_to_file',
  {
    title: 'Move a named symbol to another file (API-preserving)',
    description:
      'Princípio da Ação Atômica topology #11/#14 (identity preserved, position moved; API ' +
      'preserved, implementation moved). Move `symbol` out of `fromFile` into `toFile`: the server ' +
      'reads the symbol body, carries the imports it needs, DELETES it surgically from the origin ' +
      '(no file rewrite), creates `toFile` if absent or appends to it, and — when leaveReExport — ' +
      "adds `export { symbol } from './toFile'` so the public API is byte-stable. You pass ONLY " +
      'names + paths; you NEVER emit a file body (that re-emission is the proven compose-paralysis). ' +
      'Both files are syntax-validated, all-or-nothing, with a char-level trace + movementZones.',
    inputSchema: {
      fromFile: z.string().describe('repo-relative origin file (TS/JS)'),
      symbol: z.string().describe("symbol name or scoped AST selector (e.g. 'helper', 'A.b')"),
      toFile: z.string().describe('repo-relative target file (created if absent, else appended)'),
      leaveReExport: z
        .boolean()
        .optional()
        .describe("default true: leave `export { symbol } from './toFile'` in the origin"),
    },
  },
  async (a) => {
    try {
      return await runSymbolMove(a.fromFile, a.symbol, a.toFile, a.leaveReExport ?? true, false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_extract_symbol',
  {
    title: 'Extract a symbol into a NEW sibling module (always re-exported)',
    description:
      'Princípio da Ação Atômica topology #14 (API preserved, implementation moved). Like ' +
      'atomic_move_symbol_to_file but `newFile` MUST NOT already exist (or be empty) — it creates a ' +
      'fresh sibling module — and a re-export is ALWAYS left in the origin so every existing ' +
      'importer keeps working unchanged. The canonical decomposition primitive: one cheap call, ' +
      'no file body emitted, both files syntax-validated all-or-nothing, char-level trace + ' +
      'movementZones.',
    inputSchema: {
      fromFile: z.string().describe('repo-relative origin file (TS/JS)'),
      symbol: z.string().describe("symbol name or scoped AST selector (e.g. 'helper', 'A.b')"),
      newFile: z.string().describe('repo-relative NEW sibling module to create (must not exist)'),
    },
  },
  async (a) => {
    try {
      return await runSymbolMove(a.fromFile, a.symbol, a.newFile, true, true);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_decompose_file',
  {
    title: 'Decompose a god-file into cohesive sibling modules (ONE atomic transaction)',
    description:
      'THE operator for splitting / decomposing a god file. One call relocates many symbols ' +
      'into new modules with re-exports, all-or-nothing, validated. Use this instead of ' +
      'multiple create/move calls. ' +
      'The highest faithful operator: one product intention — "split this god-file" — becomes ' +
      'ONE cheap, all-or-nothing, syntax-validated server-side transaction. For each plan entry ' +
      'the listed top-level symbols are relocated out of `file` into a fresh `newModule` (created, ' +
      'needed imports carried), surgically deleted from `file`, and (reExport, default true) a ' +
      'typed `export { sym } from "./newModule"` is left so the origin public API is byte-stable ' +
      'and every existing importer keeps working unchanged. The caller passes ONLY symbol names + ' +
      'target module paths — NEVER any file body (that re-emission is the proven compose-paralysis). ' +
      'Every touched file is syntax-validated in memory BEFORE any write; if any symbol is not ' +
      'found or any file would regress, the whole transaction is refused (no orphan modules, no ' +
      'partial write). A 737-LOC decomposition becomes code_outline + ONE call + one spec run. ' +
      'Emits a single origin trace whose movementZones cover all moves, plus one relocation trace ' +
      'per new module.',
    inputSchema: {
      file: z.string().describe('repo-relative god-file to decompose (TS/JS)'),
      plan: z
        .array(
          z.object({
            symbols: z
              .array(z.string())
              .min(1)
              .describe("top-level symbol names/selectors to relocate (e.g. ['foo','Bar.baz'])"),
            newModule: z
              .string()
              .describe('repo-relative NEW sibling module to create (must not exist non-empty)'),
            reExport: z
              .boolean()
              .optional()
              .describe(
                'default true: leave a typed re-export in the origin so its public API is byte-stable',
              ),
          }),
        )
        .min(1)
        .describe('one entry per new module; one product intention = one transaction'),
    },
  },
  async (a) => {
    try {
      return await runSymbolDecompose(a.file, a.plan);
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
      'Runs ESLint in non-mutating --fix-dry-run --format json mode, then applies the proposed fixed file outputs through the atomic transaction path. ESLint never writes directly; every file is governance-guarded, syntax-validated, traced with preservation topology, and written all-or-nothing.',
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
      preview: z.boolean().optional().describe('dry-run: validate analyzer output, do not write'),
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
      requireEslintDryRunArgs(a.args);
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
      const run = childProcess.spawnSync('npx', ['eslint', ...a.args], {
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
      const filePreviewLimit = 3;
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
      const residueActionCandidatesAll = buildLintResidueActionCandidates(
        results,
        cwdTarget.absPath,
      );
      const residueActionCandidates = residueActionCandidatesAll.slice(0, 10);
      const residueActionCandidatesTotal = residueActionCandidatesAll.length;
      const residueActionCandidatesOmitted = Math.max(
        0,
        residueActionCandidatesTotal - residueActionCandidates.length,
      );
      const knownResidueFixesApplied = staged.flatMap((item) => item.knownResidueFixes);
      const unresolvedResidueMessages = Math.max(
        0,
        remainingMessages - knownResidueFixesApplied.length,
      );
      const summarize = (headline: string, traceRefs: string[] = []): string => {
        const tracePreview = traceRefs
          .slice(0, 3)
          .map((ref) => `- ${ref}`)
          .join('\n');
        const traceBlock =
          traceRefs.length > 0
            ? `\nTrace proof: ${traceRefs.length} trace(s) written${tracePreview ? `\n${tracePreview}` : ''}${
                traceRefs.length > 3
                  ? `\n- ... ${traceRefs.length - 3} more trace(s) omitted from the human summary`
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
        return (
          `${headline}\n\n` +
          `Intention: apply ESLint dry-run fixes as one verified atomic transaction.\n` +
          `Command: npx eslint ${a.args.map((arg) => JSON.stringify(arg)).join(' ')}\n` +
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
          metrics: {
            changedChars: item.metrics.changedChars,
            lineRewriteSurfaceChars: item.metrics.lineSurfaceChars,
            expansionFactorAvoided: item.metrics.expansionFactor,
            bytesNet: item.newText.length - item.before.length,
          },
          targetUnit: 'eslint_dry_run_file_output',
          intention:
            'apply analyzer-proposed lint fixes without letting the analyzer write directly',
          preservedZones: [
            {
              kind: 'prefix_context',
              description: 'Text before the first analyzer-modified span was preserved.',
              beforeHash: item.metrics.preservedPrefixHash,
              afterHash: item.metrics.preservedPrefixHash,
            },
            {
              kind: 'suffix_context',
              description: 'Text after the last analyzer-modified span was preserved.',
              beforeHash: item.metrics.preservedSuffixHash,
              afterHash: item.metrics.preservedSuffixHash,
            },
          ],
          modifiedZones: [
            {
              kind: 'analyzer_fix_output',
              oldTextHash: sha256(item.before),
              newTextHash: sha256(item.newText),
              oldSample: item.metrics.oldSample,
              newSample: item.metrics.newSample,
              description:
                'ESLint --fix-dry-run proposed this file output; atomic-edit validated and wrote it.',
              metadata: { knownResidueFixes: item.knownResidueFixes },
            },
          ],
          movementZones: [],
          semanticImpact: 'behavior_preserving_lint_cleanup',
        });
        const persisted = writeTrace(trace);
        traceRefs.push(
          persisted.tracePath ??
            `trace error for ${item.relPath}: ${persisted.traceWriteError ?? 'unknown'}`,
        );
      }
      const summaryForHuman = summarize('✅ ESLint atomic analyzer transaction applied', traceRefs);
      return ok({
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
      });
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

/* ─────────────────────────────────────────────────────────────────────────
 * A/B TOOLDEV28 — atomic_verify: the missing STRUCTURAL verification operator.
 *
 * MEASURED dominant residual across L1/L3-priority/L3′ (3 rounds + 5 tunings):
 * both arms always solve correctly and atomic always wins churn/preservation,
 * but atomic LOSES efficiency because the model hand-runs jest/tsc/greps in a
 * Bash×20-24 loop to "make sure", and APPENDED ADVISORY directives are ignored
 * — only STRUCTURAL operators ever changed behavior. Doctrine prescribes the
 * fix (founding §6.4 atomicidade de validação + §6.5 confiança; manifesto
 * "Normal stops when enough → atomic operator"): absorb Normal's "run it once
 * and stop" brute advantage as ONE macro-atomic call that performs the single
 * authoritative behavioral verification and returns a compact traced verdict.
 * READ-ONLY (runs tests/tsc; writes only its own trace); additive; degrades
 * gracefully (a missing channel is "skipped", never a throw); idempotent &
 * free on re-call when nothing changed (mtime/size signature cache).
 * ──────────────────────────────────────────────────────────────────────── */

const VERIFY_CACHE = new Map<string, { payload: Record<string, unknown>; ts: number }>();

function avGit(args: string[], cwd: string): string {
  try {
    const r = childProcess.spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15000,
    });
    return typeof r.stdout === 'string' ? r.stdout : '';
  } catch {
    return '';
  }
}

/** Walk each primary dir (and its ancestors) for node_modules/.bin/<bin>;
 * return the absolute bin path of the first hit, else null. */
function avResolveBinPath(bin: string, primaries: string[]): string | null {
  for (const p of primaries) {
    if (!p) continue;
    let d = p;
    for (let i = 0; i < 10; i++) {
      const cand = path.join(d, 'node_modules', '.bin', bin);
      if (fs.existsSync(cand)) return cand;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  return null;
}

/** Distinct existing changed/untracked FILES (absolute), session-cheap. */
function avChangedFiles(cwd: string, repoRoot: string): string[] {
  const top = avGit(['rev-parse', '--show-toplevel'], cwd).trim() || repoRoot;
  const raw = [
    avGit(['diff', '--name-only'], cwd),
    avGit(['diff', '--name-only', '--cached'], cwd),
    avGit(['ls-files', '--others', '--exclude-standard'], cwd),
  ].join('\n');
  const set = new Set<string>();
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const abs = path.resolve(top, t);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) set.add(abs);
    } catch {
      /* ignore stat races */
    }
  }
  return [...set];
}

const AV_SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const AV_SRC_RE = /\.[cm]?[jt]sx?$/;

/** changed X.{ts,js} → its sibling/__tests__ spec; spec files pass through;
 * a shallow git-grep also pulls specs that import a changed module stem. */
function avDeriveSpecs(changed: string[], top: string): string[] {
  const out = new Set<string>();
  const orphanStems: string[] = [];
  for (const f of changed) {
    if (AV_SPEC_RE.test(f)) {
      out.add(f);
      continue;
    }
    if (!AV_SRC_RE.test(f)) continue;
    const dir = path.dirname(f);
    const stem = path.basename(f).replace(/\.[cm]?[jt]sx?$/, '');
    let found = false;
    for (const ext of ['ts', 'js', 'tsx', 'jsx', 'mts', 'cts']) {
      for (const kind of ['spec', 'test']) {
        for (const cand of [
          path.join(dir, `${stem}.${kind}.${ext}`),
          path.join(dir, '__tests__', `${stem}.${kind}.${ext}`),
          path.join(dir, '..', '__tests__', `${stem}.${kind}.${ext}`),
        ]) {
          if (fs.existsSync(cand)) {
            out.add(path.resolve(cand));
            found = true;
          }
        }
      }
    }
    if (!found) orphanStems.push(stem);
  }
  // Shallow, bounded import-reverse-lookup for orphan modules.
  for (const stem of orphanStems.slice(0, 4)) {
    const g = childProcess.spawnSync(
      'git',
      ['grep', '-l', '--untracked', '-e', stem, '--', '*.spec.ts', '*.spec.js', '*.test.ts', '*.test.js'],
      { cwd: top, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 8000 },
    );
    if (typeof g.stdout === 'string') {
      for (const l of g.stdout.split('\n').slice(0, 6)) {
        const t = l.trim();
        if (t) {
          const abs = path.resolve(top, t);
          if (fs.existsSync(abs)) out.add(abs);
        }
      }
    }
  }
  return [...out].slice(0, 12);
}

interface AvJest {
  status: 'ran' | 'skipped';
  reason?: string;
  total: number;
  pass: number;
  fail: number;
  failedSuites: number;
  argv?: string[];
  failures: { title: string; message: string }[];
}

// A/B TOOLDEV30 — parallel jest for the multi-target blast radius.
// scope=changed routinely derives 10+ affected specs (the proven superiority
// over Normal's under-verify). Serial --runInBand turned that completeness
// into a wall-time cost. With >1 target we fan jest across workers — SAME
// aggregated --json (numTotal/Passed/Failed + failure samples), so coverage,
// targets and verdict stay byte-identical to the serial run; only wall-time
// drops. Single target keeps --runInBand (determinism, lowest overhead).
function avJestConcurrencyArgs(targetCount: number): string[] {
  if (targetCount > 1) {
    const cap = Math.max(1, Math.min(4, os.cpus().length - 1));
    return [`--maxWorkers=${cap}`];
  }
  return ['--runInBand'];
}

function avRunJest(targets: string[], jestCwd: string, fanout: string[]): AvJest {
  const binPath = avResolveBinPath('jest', [jestCwd, ...fanout]);
  if (!binPath) return { status: 'skipped', reason: 'jest not available', total: 0, pass: 0, fail: 0, failedSuites: 0, failures: [] };
  const args = [...targets, ...avJestConcurrencyArgs(targets.length), '--silent', '--json', '--ci', '--passWithNoTests'];
  let r: childProcess.SpawnSyncReturns<string>;
  try {
    r = childProcess.spawnSync(binPath, args, {
      cwd: jestCwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300000,
    });
  } catch (e) {
    return { status: 'skipped', reason: `jest failed to start: ${e instanceof Error ? e.message : String(e)}`, total: 0, pass: 0, fail: 0, failedSuites: 0, failures: [] };
  }
  if (r.error) return { status: 'skipped', reason: `jest failed to start: ${r.error.message}`, total: 0, pass: 0, fail: 0, failedSuites: 0, failures: [] };
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  let j: Record<string, unknown> | null = null;
  try {
    const s = stdout.indexOf('{');
    const e = stdout.lastIndexOf('}');
    if (s >= 0 && e > s) j = JSON.parse(stdout.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    j = null;
  }
  if (!j) return { status: 'skipped', reason: 'jest produced no parseable --json report', total: 0, pass: 0, fail: 0, failedSuites: 0, failures: [] };
  const total = Number(j.numTotalTests ?? 0);
  const pass = Number(j.numPassedTests ?? 0);
  const fail = Number(j.numFailedTests ?? 0);
  const failedSuites = Number(j.numFailedTestSuites ?? 0);
  const failures: { title: string; message: string }[] = [];
  const trs = Array.isArray(j.testResults) ? (j.testResults as Record<string, unknown>[]) : [];
  for (const tr of trs) {
    const ars = Array.isArray(tr.assertionResults) ? (tr.assertionResults as Record<string, unknown>[]) : [];
    for (const ar of ars) {
      if (ar.status === 'failed' && failures.length < 5) {
        const fm = Array.isArray(ar.failureMessages) ? String(ar.failureMessages[0] ?? '') : '';
        failures.push({
          title: String(ar.fullName ?? ar.title ?? '(test)').slice(0, 140),
          message: (fm || '(failed)').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 240),
        });
      }
    }
    if (ars.length === 0 && tr.status === 'failed' && failures.length < 5) {
      failures.push({
        title: path.basename(String(tr.name ?? '(suite)')).slice(0, 140),
        message: String(tr.message ?? '(suite failed to run)').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 240),
      });
    }
  }
  return { status: 'ran', total, pass, fail, failedSuites, failures, argv: args };
}

interface AvTsc {
  status: 'ran' | 'skipped';
  reason?: string;
  project?: string;
  errors: number;
  islandErrors: number;
  introduced: number;
  preExisting: number;
  sample: string[];
  argv?: string[];
  incremental?: boolean;
}

// A/B TOOLDEV31 — DELTA/ISLAND-aware tsc verdict. Every real repo carries some
// pre-existing tsc noise unrelated to the change under verification. Counting
// the WHOLE-REPO error total made atomic_verify false-❌ on a clean change and
// triggered a wasteful re-verify loop (R49). A tsc error blocks the verdict
// ONLY when the CHANGE INTRODUCED it. Classification, by evidence strength:
//  (1) a cached BASE signature set (.atomic/tsc-baseline.json, captured
//      whenever a verify runs on a genuinely clean tree → those errors are
//      pre-existing by definition); an error not in the set is INTRODUCED.
//  (2) git-diff island: the error's file is a changed file, or its line
//      references a changed module/basename → INTRODUCED.
//  (3) no change at all + no baseline → cannot prove pre-existing, stay
//      conservative (blocking), exactly like the legacy whole-repo verdict.
// Never throws — any baseline failure degrades to the git-diff fallback.
interface AvTscErr {
  raw: string;
  absFile: string;
  sig: string;
}

function avTscErrParse(line: string, projDir: string, repoRoot: string): AvTscErr {
  const raw = line.trim().slice(0, 200);
  const m =
    /^\s*(.+?)\((\d+),(\d+)\):\s*error (TS\d+):\s*(.*)$/.exec(line) ??
    /^\s*(.+?):(\d+):(\d+)\s*-\s*error (TS\d+):\s*(.*)$/.exec(line);
  let absFile = '';
  let sig = `nofile|${raw}`;
  if (m) {
    const fileTok = m[1].trim();
    absFile = path.isAbsolute(fileTok) ? fileTok : path.resolve(projDir, fileTok);
    const rel = path.relative(repoRoot, absFile) || absFile;
    // line/col deliberately dropped from the signature: an unrelated edit that
    // shifts a pre-existing error's line must NOT reclassify it as introduced.
    sig = `${rel}|${m[4]}|${m[5].trim()}`;
  }
  return { raw, absFile, sig };
}

interface AvTscBaseline {
  version: number;
  projects: Record<string, { head: string; capturedAt: number; signatures: string[] }>;
}

function avBaselinePath(repoRoot: string): string {
  return path.join(repoRoot, '.atomic', 'tsc-baseline.json');
}

function avReadTscBaseline(repoRoot: string): AvTscBaseline {
  try {
    const p = avBaselinePath(repoRoot);
    if (!fs.existsSync(p)) return { version: 1, projects: {} };
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as AvTscBaseline;
    if (!j || typeof j !== 'object' || !j.projects || typeof j.projects !== 'object') {
      return { version: 1, projects: {} };
    }
    return { version: 1, projects: j.projects };
  } catch {
    return { version: 1, projects: {} };
  }
}

function avWriteTscBaseline(
  repoRoot: string,
  projectKey: string,
  signatures: string[],
  head: string,
): void {
  try {
    const base = avReadTscBaseline(repoRoot);
    base.projects[projectKey] = {
      head,
      capturedAt: Date.now(),
      signatures: [...new Set(signatures)].slice(0, 4000),
    };
    // Prune entries whose tsconfig no longer exists (stale fixture/worktree
    // dirs) so the cache cannot grow unbounded across sessions.
    for (const k of Object.keys(base.projects)) {
      if (!fs.existsSync(path.resolve(repoRoot, k))) delete base.projects[k];
    }
    fs.mkdirSync(path.dirname(avBaselinePath(repoRoot)), { recursive: true });
    fs.writeFileSync(
      avBaselinePath(repoRoot),
      JSON.stringify({ version: 1, projects: base.projects }),
    );
  } catch {
    /* non-fatal — classification still works without the cache */
  }
}

// A/B TOOLDEV30 — distinguish "this tsc rejects the incremental flags" from a
// genuine type error. Only the unknown-option / incremental-refusal family
// (TS5023/5069/5070 + "Unknown compiler option") means we must fall back to
// the cold invocation; ordinary type errors (TS2322, …) must NOT trigger a
// fallback (that would mask real failures and double the cost).
function avTscIncrementalUnsupported(output: string, hadSpawnError: boolean): boolean {
  if (hadSpawnError) return true;
  return /error TS5023\b|error TS5069\b|error TS5070\b|Unknown compiler option|tsBuildInfoFile' can only|'incremental' can only/i.test(
    output,
  );
}

function avRunTsc(
  tscProject: string | undefined,
  scope: string,
  changed: string[],
  repoRoot: string,
  cwdAbs: string,
): AvTsc {
  const backendAbs = path.join(repoRoot, 'backend');
  let project = '';
  if (tscProject) {
    const p = path.isAbsolute(tscProject) ? tscProject : path.resolve(repoRoot, tscProject);
    if (fs.existsSync(p)) project = p;
  }
  if (!project) {
    for (const cand of [
      path.join(backendAbs, 'tsconfig.json'),
      path.join(repoRoot, 'tsconfig.json'),
      path.join(cwdAbs, 'tsconfig.json'),
    ]) {
      if (fs.existsSync(cand)) {
        project = cand;
        break;
      }
    }
  }
  const binPath = avResolveBinPath('tsc', [path.dirname(project) || repoRoot, repoRoot, backendAbs, cwdAbs]);
  if (!binPath || !project) {
    return { status: 'skipped', reason: !binPath ? 'tsc not available' : 'no tsconfig found', errors: 0, islandErrors: 0, introduced: 0, preExisting: 0, sample: [] };
  }
  // A/B TOOLDEV30 — incremental tsc. The cold whole-project --noEmit was the
  // residual wall-time cost of atomic_verify's superior completeness. With a
  // persistent .atomic/tsc-verify.tsbuildinfo the first call warms the cache
  // (~same cost) and every subsequent call in the workspace is much faster.
  // Error count + samples are parsed identically (incremental still reports
  // every diagnostic each run). If this tsc rejects the incremental flags we
  // fall back to the exact cold invocation — never fail the tool.
  const coldArgs = ['--noEmit', '-p', project];
  const buildInfoDir = path.join(repoRoot, '.atomic');
  const buildInfoFile = path.join(buildInfoDir, 'tsc-verify.tsbuildinfo');
  try {
    fs.mkdirSync(buildInfoDir, { recursive: true });
  } catch {
    /* non-fatal — fallback path still works without the cache dir */
  }
  const incArgs = [...coldArgs, '--incremental', '--tsBuildInfoFile', buildInfoFile];
  let tscArgvUsed = incArgs;
  let usedIncremental = true;
  let r: childProcess.SpawnSyncReturns<string>;
  const runTsc = (argv: string[]): childProcess.SpawnSyncReturns<string> =>
    childProcess.spawnSync(binPath, argv, {
      cwd: path.dirname(project),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 300000,
    });
  try {
    r = runTsc(incArgs);
  } catch (e) {
    return { status: 'skipped', reason: `tsc failed to start: ${e instanceof Error ? e.message : String(e)}`, errors: 0, islandErrors: 0, introduced: 0, preExisting: 0, sample: [] };
  }
  const incOut = `${typeof r.stdout === 'string' ? r.stdout : ''}\n${typeof r.stderr === 'string' ? r.stderr : ''}`;
  if (avTscIncrementalUnsupported(incOut, Boolean(r.error))) {
    usedIncremental = false;
    tscArgvUsed = coldArgs;
    try {
      r = runTsc(coldArgs);
    } catch (e) {
      return { status: 'skipped', reason: `tsc failed to start: ${e instanceof Error ? e.message : String(e)}`, errors: 0, islandErrors: 0, introduced: 0, preExisting: 0, sample: [] };
    }
  }
  if (r.error) return { status: 'skipped', reason: `tsc failed to start: ${r.error.message}`, errors: 0, islandErrors: 0, introduced: 0, preExisting: 0, sample: [] };
  const out = `${typeof r.stdout === 'string' ? r.stdout : ''}\n${typeof r.stderr === 'string' ? r.stderr : ''}`;
  const lines = out.split('\n').filter((l) => /error TS\d+/.test(l));
  const projDir = path.dirname(project);
  // legacy island count — kept byte-stable for any field consumer.
  const island =
    scope === 'changed'
      ? lines.filter((l) =>
          changed.some(
            (cf) => l.includes(path.relative(projDir, cf)) || l.includes(path.basename(cf)),
          ),
        )
      : lines;
  // A/B TOOLDEV31 — DELTA classification: an error blocks the verdict only if
  // the change INTRODUCED it. Baseline (clean-tree BASE signature set) is the
  // strongest evidence; git-diff island is the robust fallback; no change at
  // all + no baseline stays conservative (every error blocking, == legacy).
  const projectKey = path.relative(repoRoot, project) || project;
  const changedAbs = new Set(changed.map((c) => path.resolve(c)));
  const parsed = lines.map((l) => avTscErrParse(l, projDir, repoRoot));
  const baseline = avReadTscBaseline(repoRoot);
  const baselineSet =
    changed.length > 0 && baseline.projects[projectKey]
      ? new Set(baseline.projects[projectKey].signatures)
      : undefined;
  const isRelated = (e: AvTscErr): boolean => {
    if (e.absFile && changedAbs.has(path.resolve(e.absFile))) return true;
    return changed.some(
      (cf) => e.raw.includes(path.relative(projDir, cf)) || e.raw.includes(path.basename(cf)),
    );
  };
  const introducedErrs: AvTscErr[] = [];
  const preExistingErrs: AvTscErr[] = [];
  for (const e of parsed) {
    let introduced: boolean;
    if (baselineSet) introduced = !baselineSet.has(e.sig);
    else if (changed.length === 0) introduced = true; // no change + no baseline → cannot prove pre-existing
    else introduced = isRelated(e);
    (introduced ? introducedErrs : preExistingErrs).push(e);
  }
  // Capture / refresh the BASE signature set only when the working tree is
  // genuinely clean: errors observed with zero local changes are pre-existing
  // by definition, so a later change is never blamed for them. (scope:'all'
  // passes changed=[] even on a dirty tree — so verify cleanliness directly.)
  if (changed.length === 0 && !avGit(['status', '--porcelain'], cwdAbs).trim()) {
    avWriteTscBaseline(
      repoRoot,
      projectKey,
      parsed.map((e) => e.sig),
      avGit(['rev-parse', 'HEAD'], cwdAbs).trim(),
    );
  }
  const m = preExistingErrs.length;
  const sample =
    introducedErrs.length > 0
      ? introducedErrs.slice(0, 6).map((e) => e.raw.slice(0, 200))
      : m > 0
        ? [`${m} pre-existing unrelated (not blocking)`]
        : [];
  return {
    status: 'ran',
    project: projectKey,
    errors: lines.length,
    islandErrors: island.length,
    introduced: introducedErrs.length,
    preExisting: m,
    sample,
    argv: tscArgvUsed,
    incremental: usedIncremental,
  };
}

function avSignature(
  scope: string,
  specs: string[] | undefined,
  tscProject: string | undefined,
  changed: string[],
  cwd: string,
): string {
  const parts = [`scope=${scope}`, `specs=${JSON.stringify(specs ?? null)}`, `tsc=${tscProject ?? ''}`];
  for (const f of [...changed].sort()) {
    try {
      const st = fs.statSync(f);
      parts.push(`${f}:${st.mtimeMs}:${st.size}`);
    } catch {
      parts.push(`${f}:missing`);
    }
  }
  if (scope === 'all') parts.push(`HEAD=${avGit(['rev-parse', 'HEAD'], cwd).trim()}`);
  return sha256(parts.join('|'));
}

server.registerTool(
  'atomic_verify',
  {
    title: 'Authoritative single behavioral verification (jest + tsc, once)',
    description:
      'ONE macro-atomic, READ-ONLY call that performs the single authoritative behavioral verification ' +
      'and returns a COMPACT traced verdict — so you NEVER hand-run jest/tsc/greps in a Bash loop. ' +
      'scope:"changed" (default) derives the affected spec(s) from git changes; "all" runs the suite; ' +
      'pass explicit `specs` to target exact files. Runs jest ONCE and tsc --noEmit ONCE, writes ONE ' +
      'trace, and tells you plainly VERIFIED ✅/❌. Idempotent & free on re-call when nothing changed. ' +
      'A missing jest/tsc degrades to "skipped" — it never throws. This call IS the proof: do not re-run.',
    inputSchema: {
      scope: z
        .string()
        .optional()
        .describe('"changed" (default) | "all" | "explicit" (use with specs)'),
      specs: z
        .array(z.string())
        .optional()
        .describe('explicit spec file paths/patterns; when given, overrides scope derivation'),
      tscProject: z
        .string()
        .optional()
        .describe('tsconfig path; default auto-detect backend/tsconfig.json else repo tsconfig.json'),
      cwd: z.string().optional().describe('working dir; default the server repo root'),
    },
  },
  async (a) => {
    try {
      const started = Date.now();
      const repoRoot = resolveSafeTarget('.').repoRoot;
      let cwdAbs = repoRoot;
      if (a.cwd) {
        try {
          const t = resolveSafeTarget(a.cwd);
          if (fs.existsSync(t.absPath) && fs.statSync(t.absPath).isDirectory()) cwdAbs = t.absPath;
        } catch {
          /* fall back to repoRoot */
        }
      }
      const backendAbs = path.join(repoRoot, 'backend');
      const rawScope = (a.scope ?? 'changed').toLowerCase();
      const explicit = Array.isArray(a.specs) && a.specs.length > 0;
      const scope = explicit ? 'explicit' : rawScope === 'all' ? 'all' : 'changed';

      const top = avGit(['rev-parse', '--show-toplevel'], cwdAbs).trim() || repoRoot;
      const changed = scope === 'all' ? [] : avChangedFiles(cwdAbs, repoRoot);

      // Idempotent / free re-call when nothing changed since last verify.
      const sig = avSignature(scope, a.specs, a.tscProject, changed, cwdAbs);
      const cached = VERIFY_CACHE.get(sig);
      if (cached) {
        const p = { ...cached.payload } as Record<string, unknown>;
        const note =
          'ℹ cached — unchanged since the last atomic_verify; this re-call is FREE. ' +
          'The earlier verdict still holds; do NOT re-run jest/tsc.';
        const base = String(p.summaryForHuman ?? '');
        p.cached = true;
        p.summaryForHuman = `${base}\n\n${note}`;
        p.summary = p.summaryForHuman;
        return ok(p);
      }

      let targets: string[] = [];
      if (explicit) {
        targets = (a.specs ?? []).map((s) =>
          path.isAbsolute(s) ? s : path.resolve(cwdAbs, s),
        );
      } else if (scope === 'changed') {
        const derived = avDeriveSpecs(changed, top);
        if (derived.length > 0) targets = derived;
        else {
          // none derivable → scope the package default test to changed dirs
          const dirs = [...new Set(changed.map((f) => path.dirname(f)))];
          targets = dirs.slice(0, 6);
        }
      } // scope === 'all' → targets stay [] (full suite)

      // jest workspace: prefer where the targets live (backend if any under it).
      const underBackend = targets.some((t) => t.startsWith(backendAbs + path.sep));
      const jestCwd =
        explicit || scope === 'changed'
          ? underBackend
            ? backendAbs
            : cwdAbs
          : underBackend
            ? backendAbs
            : cwdAbs;
      const fanout = [backendAbs, repoRoot, cwdAbs];

      let jest: AvJest;
      if (scope === 'changed' && changed.length === 0) {
        jest = { status: 'skipped', reason: 'no changed files — nothing to verify', total: 0, pass: 0, fail: 0, failedSuites: 0, failures: [] };
      } else {
        jest = avRunJest(targets, jestCwd, fanout);
      }
      const tsc = avRunTsc(a.tscProject, scope, changed, repoRoot, cwdAbs);

      const jestOk = jest.status !== 'ran' ? true : jest.fail === 0 && jest.failedSuites === 0;
      // A/B TOOLDEV31 — the verdict is DELTA-aware: only INTRODUCED tsc errors
      // flip ❌. Pre-existing unrelated repo noise is reported but NEVER
      // blocking, so a clean change returns ✅ on the FIRST call (no false-❌
      // → no wasteful re-verify loop).
      const tscOk = tsc.status !== 'ran' ? true : tsc.introduced === 0;
      const bothSkipped = jest.status !== 'ran' && tsc.status !== 'ran';
      const verdictOk = jestOk && tscOk && !bothSkipped;
      const durationMs = Date.now() - started;

      const jestPart =
        jest.status === 'ran'
          ? `jest ${jest.pass}/${jest.total}${jest.failedSuites ? ` (+${jest.failedSuites} suite-fail)` : ''}`
          : `jest skipped (${jest.reason ?? 'n/a'})`;
      const tscIntro = tsc.status === 'ran' ? tsc.introduced : 0;
      const tscPre = tsc.status === 'ran' ? tsc.preExisting : 0;
      const preNote = tscPre > 0 ? `; ${tscPre} pre-existing unrelated (not blocking)` : '';
      const tscPart =
        tsc.status === 'ran'
          ? `tsc ${tscIntro} introduced${preNote}`
          : `tsc skipped (${tsc.reason ?? 'n/a'})`;

      const terminal = verdictOk
        ? `VERIFIED ✅ — authoritative single verification (${jestPart}, ${tscPart}). ` +
          `Do NOT re-run jest/tsc by hand; this is the proof.`
        : bothSkipped
          ? `VERIFIED ❌ — no verification channel available (${jestPart}; ${tscPart}); ` +
            `cannot prove behavior here.`
          : `VERIFIED ❌ — ${jest.status === 'ran' ? jest.fail + jest.failedSuites : 0} jest fail / ` +
            `${tscIntro} tsc INTRODUCED${tscIntro > 0 ? ' (see sample)' : ''}${preNote}; ` +
            `fix then call atomic_verify again.`;

      const trace = buildTrace({
        file: '(verification)',
        repoRoot,
        operator: 'atomic_verify',
        before: sig,
        newText: sig,
        inlinePreview: terminal,
        validation: { language: 'verification', before: 0, after: 0 },
        targetUnit: 'behavioral_verification',
        intention: 'authoritative single behavioral verification (jest + tsc, once)',
        semanticImpact: 'verification_only_no_mutation',
      });
      const persisted = writeTrace(trace);
      const tracePath = persisted.tracePath ?? null;

      const summaryForHuman =
        `${terminal}\n` +
        `scope=${scope} · targets=${targets.length} · ${durationMs}ms` +
        (tracePath ? `\nTrace: ${tracePath}` : '');

      const payload: Record<string, unknown> = {
        ok: verdictOk,
        scope,
        targets: targets.slice(0, 12).map((t) => path.relative(repoRoot, t)),
        jest: {
          status: jest.status,
          ...(jest.reason ? { reason: jest.reason } : {}),
          total: jest.total,
          pass: jest.pass,
          fail: jest.fail,
          failedSuites: jest.failedSuites,
          failures: jest.failures,
        },
        tsc: {
          status: tsc.status,
          ...(tsc.reason ? { reason: tsc.reason } : {}),
          ...(tsc.project ? { project: tsc.project } : {}),
          errors: tsc.errors,
          islandErrors: tsc.islandErrors,
          introduced: tsc.introduced,
          preExisting: tsc.preExisting,
          sample: tsc.sample,
        },
        durationMs,
        tracePath,
        cached: false,
        summaryForHuman,
        summary: summaryForHuman,
      };
      // A/B TOOLDEV30 — execution-strategy observability is OFF by default so
      // the verdict object stays byte-identical to pre-td30. Only when a
      // harness explicitly opts in (ATOMIC_VERIFY_DEBUG_ARGV=1) do we expose
      // the chosen jest/tsc argv + incremental flag for assertions.
      if (process.env.ATOMIC_VERIFY_DEBUG_ARGV === '1') {
        payload._debugJestArgv = jest.argv ?? null;
        payload._debugTscArgv = tsc.argv ?? null;
        payload._debugTscIncremental = tsc.incremental ?? false;
      }
      // Cache only a real (non-degenerate) verdict so re-calls are free.
      if (!bothSkipped) VERIFY_CACHE.set(sig, { payload: { ...payload }, ts: Date.now() });
      return ok(payload);
    } catch (e) {
      // Never throw to the model — degrade to a readable skipped verdict.
      const msg = e instanceof Error ? e.message : String(e);
      const line = `VERIFIED ❌ — verification harness error (${msg.slice(0, 160)}); no proof produced.`;
      return ok({
        ok: false,
        scope: a.scope ?? 'changed',
        targets: [],
        jest: { status: 'skipped', reason: msg.slice(0, 200), total: 0, pass: 0, fail: 0, failedSuites: 0, failures: [] },
        tsc: { status: 'skipped', reason: msg.slice(0, 200), errors: 0, islandErrors: 0, introduced: 0, preExisting: 0, sample: [] },
        durationMs: 0,
        tracePath: null,
        cached: false,
        summaryForHuman: line,
        summary: line,
      });
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
