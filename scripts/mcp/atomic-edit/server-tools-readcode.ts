/**
 * server-tools-readcode.ts — Unified adaptive readCode tool (CodeStruct port).
 *
 * Replaces the three-tool pattern (code_browse + code_outline + code_read_symbol)
 * with ONE tool that auto-adapts its output based on the context:
 *
 *   Mode 1 — Directory: list files (like `code_browse`)
 *   Mode 2 — File, no selector, small: return FULL content (CodeStruct <6K chars by default)
 *   Mode 3 — File, no selector, large: return compact signatures (like `code_outline`)
 *   Mode 4 — File + selector: return full implementation of matched symbol
 *            (like `code_read_symbol` with 5-tier fuzzy matching)
 *
 * This matches CodeStruct's Section 3.2 (Algorithm 1) design: the agent expresses
 * WHAT it wants to read via a path + optional selector; the tool decides HOW to
 * deliver it. One tool = fewer LLM decisions = fewer tokens burned = higher
 * Pass@1 (CodeStruct §4.4.1 ablation shows readCode is the dominant accuracy lever).
 *
 * The existing tools (code_browse, code_outline, code_read_symbol) are preserved
 * for backward compatibility — this is an ADDITION, not a replacement.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { activeWorkspaceRoot, resolveSafeTarget } from './guard.js';
import { readUtf8, sha256 } from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { browse } from './nav.js';
import { extToGrammar } from './engine-universal.js';
import { fuzzyMatch } from './fuzzy-match.js';
import { selectorNotFound } from './llm-errors.js';

// Re-use the existing outline/readSymbol for the heavy lifting
let _outlineFn: ((file: string, text: string) => Promise<{
  language: string;
  lineCount: number;
  charCount: number;
  symbols: Array<{ selector: string; kind: string; startLine: number; endLine: number; signature: string }>;
}>) | null = null;
let _readSymbolFn: ((file: string, text: string, selector: string, position?: { line: number; column: number }) => Promise<{
  selector: string;
  kind: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  code: string;
  fileSha256?: string;
}>) | null = null;

// Lazy-load to avoid circular dependency at module init
async function loadNav(): Promise<void> {
  if (_outlineFn) return;
  const nav = await import('./nav.js');
  _outlineFn = nav.outline;
  _readSymbolFn = nav.readSymbol;
}

// ──────────────────────── thresholds ──────────────────────────

const SMALL_FILE_LIMIT = 3000; // compact summary threshold retained for explicit callers
const CONTEXT_FILE_LIMIT = 6000; // default read payload budget for small behavior/context files
const BATCH_CONTEXT_BUDGET = 32000;
const BATCH_COMPACT_ITEM_THRESHOLD = 5;
const BATCH_COMPACT_SYMBOL_LIMIT = 8;
const DIRECTORY_INLINE_CONTEXT_BUDGET = 14000;
const DIRECTORY_INLINE_FILE_LIMIT = 6;
const LARGE_DIR_LIMIT = 200; // files — show summary not full listing
const MAX_SYMBOLS_INLINE = 25; // compact summary cutoff
const SHALLOW_TREE_DEPTH = 2;
const SHALLOW_TREE_ENTRY_LIMIT = 80;
const SHALLOW_TREE_SKIP = new Set(['.git', 'node_modules', 'dist', 'dist-lkg', 'coverage', '.next', '.turbo']);
const MISSING_PATH_SCAN_LIMIT = 500;
const MISSING_PATH_SUGGESTION_LIMIT = 6;
const MISSING_PATH_RECOVERY_LIMIT = 3;
const MISSING_PATH_RECOVERY_BUDGET = 18000;
const MISSING_PATH_SCORE_MIN = 18;
const MISSING_PATH_READABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.md',
]);

interface DirectoryShallowTree {
  path: string;
  type: 'dir' | 'file';
  depth: number;
  entryLimit: number;
  truncated?: boolean;
  children?: DirectoryShallowTree[];
}

interface DirectoryInlineFile {
  ok: true;
  mode: 'full';
  file: string;
  target: { root: 'active-workspace'; file: string };
  language: string;
  lineCount: number;
  charCount: number;
  fullContentThreshold: number;
  symbolCount: number;
  content: string;
  fileSha256: string;
  symbolSelectors: string[];
}

// ──────────────────────── helpers ──────────────────────────

interface FormatSignaturesOptions {
  symbols: Array<{ selector: string; kind: string; startLine: number; endLine: number; signature: string }>;
  file: string;
  maxInline: number;
}

function formatSignaturesCompact(opts: FormatSignaturesOptions): string[] {
  const { symbols, file, maxInline } = opts;
  const lines: string[] = [];
  lines.push(`Signatures in ${file} (${symbols.length} symbols):`);
  for (const s of symbols.slice(0, maxInline)) {
    lines.push(`  L${s.startLine}: ${s.selector} (${s.kind})${s.signature ? ` — ${s.signature.slice(0, 80)}` : ''}`);
  }
  if (symbols.length > maxInline) {
    lines.push(`  … and ${symbols.length - maxInline} more symbols. Use a selector to read a specific one.`);
  }
  return lines;
}

function formatSymbolFull(opts: FormatSignaturesOptions): string {
  const { symbols, file } = opts;
  return [
    `Full content of ${file} (${symbols.length} symbols)`,
    '',
    ...formatSignaturesCompact(opts),
  ].join('\n');
}

function joinReadPath(dir: string, name: string): string {
  const cleanDir = dir === '.' ? '' : dir.replace(/\/+$/, '');
  return cleanDir ? `${cleanDir}/${name}` : name;
}

function workspaceDisplayPath(absPath: string, relPath: string): string {
  const activeRel = path.relative(activeWorkspaceRoot(), absPath).split(path.sep).join('/');
  if (activeRel === '') return '.';
  if (!activeRel.startsWith('..') && !path.isAbsolute(activeRel)) return activeRel;
  return relPath || '.';
}

function readcodeTargetDetails(displayPath: string): Record<string, unknown> {
  return {
    target: {
      root: 'active-workspace',
      file: displayPath,
    },
  };
}

function sortedDirectoryEntries(absPath: string): fs.Dirent[] {
  return fs
    .readdirSync(absPath, { withFileTypes: true })
    .filter((entry) => !SHALLOW_TREE_SKIP.has(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function readcodeDirectoryTree(
  displayPath: string,
  absPath: string,
  depth: number = SHALLOW_TREE_DEPTH,
): DirectoryShallowTree {
  const normalizedPath = displayPath || '.';
  if (depth <= 0) {
    return {
      path: normalizedPath,
      type: 'dir',
      depth,
      entryLimit: SHALLOW_TREE_ENTRY_LIMIT,
      truncated: false,
      children: [],
    };
  }

  const entries = sortedDirectoryEntries(absPath);
  const visible = entries.slice(0, SHALLOW_TREE_ENTRY_LIMIT);
  const children = visible.map((entry) => {
    const childPath = joinReadPath(normalizedPath, entry.name);
    const childAbsPath = path.join(absPath, entry.name);
    if (entry.isDirectory()) return readcodeDirectoryTree(childPath, childAbsPath, depth - 1);
    return {
      path: childPath,
      type: 'file' as const,
      depth: 0,
      entryLimit: SHALLOW_TREE_ENTRY_LIMIT,
      children: [],
    };
  });

  return {
    path: normalizedPath,
    type: 'dir',
    depth,
    entryLimit: SHALLOW_TREE_ENTRY_LIMIT,
    truncated: entries.length > visible.length,
    children,
  };
}

function formatShallowTreeSummary(tree: DirectoryShallowTree): string {
  const lines: string[] = [];
  const walk = (node: DirectoryShallowTree, indent: number): void => {
    const pad = ' '.repeat(indent);
    lines.push(`${pad}${node.path}${node.type === 'dir' ? '/' : ''}`);
    for (const child of node.children ?? []) walk(child, indent + 2);
    if (node.truncated) lines.push(`${pad}  ...truncated at ${node.entryLimit} entries`);
  };
  walk(tree, 0);
  return lines.join('\n');
}

async function readcodeInlineFilesForDirectory(
  dir: string,
  absPath: string,
  entries: Array<{ name: string; type: string }>,
): Promise<{
  inlineFiles: DirectoryInlineFile[];
  inlineFileCount: number;
  inlineContextBytes: number;
  inlineContextBudget: number;
  inlineSkipped: Array<{ path: string; reason: string; charCount?: number }>;
  inlineTruncated: boolean;
}> {
  const directFiles = entries.filter((entry) => entry.type === 'file');
  const inlineFiles: DirectoryInlineFile[] = [];
  const inlineSkipped: Array<{ path: string; reason: string; charCount?: number }> = [];
  let inlineContextBytes = 0;

  if (directFiles.length > DIRECTORY_INLINE_FILE_LIMIT) {
    for (const entry of directFiles) {
      inlineSkipped.push({ path: joinReadPath(dir || '.', entry.name), reason: 'too-many-direct-files' });
    }
    return {
      inlineFiles,
      inlineFileCount: 0,
      inlineContextBytes,
      inlineContextBudget: DIRECTORY_INLINE_CONTEXT_BUDGET,
      inlineSkipped,
      inlineTruncated: true,
    };
  }

  for (const entry of directFiles) {
    const filePath = joinReadPath(dir || '.', entry.name);
    const childAbsPath = path.join(absPath, entry.name);
    const text = readUtf8(childAbsPath);
    if (text.length >= CONTEXT_FILE_LIMIT) {
      inlineSkipped.push({ path: filePath, reason: 'file-above-inline-limit', charCount: text.length });
      continue;
    }
    if (inlineContextBytes + text.length > DIRECTORY_INLINE_CONTEXT_BUDGET) {
      inlineSkipped.push({ path: filePath, reason: 'directory-inline-budget-exceeded', charCount: text.length });
      continue;
    }
    const o = await _outlineFn!(filePath, text);
    const lineCount = text.split('\n').length;
    inlineContextBytes += text.length;
    inlineFiles.push({
      ok: true,
      mode: 'full',
      file: filePath,
      ...(readcodeTargetDetails(filePath) as { target: { root: 'active-workspace'; file: string } }),
      language: o.language,
      lineCount,
      charCount: text.length,
      fullContentThreshold: CONTEXT_FILE_LIMIT,
      symbolCount: o.symbols.length,
      content: text,
      fileSha256: sha256(text),
      symbolSelectors: o.symbols.map((symbol) => symbol.selector),
    });
  }

  return {
    inlineFiles,
    inlineFileCount: inlineFiles.length,
    inlineContextBytes,
    inlineContextBudget: DIRECTORY_INLINE_CONTEXT_BUDGET,
    inlineSkipped,
    inlineTruncated: inlineSkipped.length > 0,
  };
}

function collectShallowTreeFiles(tree: DirectoryShallowTree, out: string[] = []): string[] {
  if (tree.type === 'file') {
    out.push(tree.path);
    return out;
  }
  for (const child of tree.children ?? []) collectShallowTreeFiles(child, out);
  return out;
}

function readcodeBatchNextForDirectory(
  dir: string,
  entries: Array<{ name: string; type: string }>,
  shallowTree?: DirectoryShallowTree,
): { tool: 'code_readcode_batch'; reason: string; items: Array<{ path: string }> } | null {
  const seen = new Set<string>();
  const items: Array<{ path: string }> = [];
  const addPath = (filePath: string): void => {
    if (seen.has(filePath) || items.length >= 20) return;
    seen.add(filePath);
    items.push({ path: filePath });
  };
  for (const entry of entries) {
    if (entry.type === 'file') addPath(joinReadPath(dir || '.', entry.name));
  }
  if (items.length < 2 && shallowTree) {
    for (const filePath of collectShallowTreeFiles(shallowTree)) addPath(filePath);
  }
  if (items.length < 2) return null;
  return {
    tool: 'code_readcode_batch',
    reason:
      'Directory exposes a small file cluster in its shallow tree; batch-read these paths before issuing repeated single-path code_readcode calls.',
    items,
  };
}

interface MissingPathSuggestion {
  readonly path: string;
  readonly score: number;
  readonly reason: string;
}

function readcodePathWords(value: string): Set<string> {
  const words = new Set<string>();
  for (const raw of value.split(/[^A-Za-z0-9]+/g)) {
    const word = raw.trim().toLowerCase();
    if (word.length >= 2) words.add(word);
  }
  for (const raw of value.split(/[\/._-]+/g)) {
    const word = raw.trim().toLowerCase();
    if (word.length >= 2) words.add(word);
  }
  return words;
}

function compactReadcodePath(absPath: string): string {
  return path.relative(activeWorkspaceRoot(), absPath).split(path.sep).join('/');
}

function collectReadcodeCandidateFiles(root = activeWorkspaceRoot(), limit = MISSING_PATH_SCAN_LIMIT): string[] {
  const candidates: string[] = [];
  const walk = (dir: string): void => {
    if (candidates.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (candidates.length >= limit) return;
      if (SHALLOW_TREE_SKIP.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!MISSING_PATH_READABLE_EXTENSIONS.has(ext)) continue;
      candidates.push(compactReadcodePath(abs));
    }
  };
  walk(root);
  return candidates;
}

function scoreMissingReadcodePath(missingPath: string, candidatePath: string): MissingPathSuggestion | null {
  const missing = missingPath.split(path.sep).join('/').replace(/^\.\//, '').toLowerCase();
  const candidate = candidatePath.toLowerCase();
  const missingBase = path.posix.basename(missing);
  const candidateBase = path.posix.basename(candidate);
  const missingStem = missingBase.replace(/\.[^.]+$/, '');
  const candidateStem = candidateBase.replace(/\.[^.]+$/, '');
  let score = 0;
  const reasons: string[] = [];

  if (missing === candidate) {
    score += 120;
    reasons.push('exact path');
  }
  if (missingBase === candidateBase) {
    score += 72;
    reasons.push('same filename');
  } else if (missingStem === candidateStem) {
    score += 54;
    reasons.push('same filename stem');
  } else if (missingStem.length >= 4 && candidateStem.includes(missingStem)) {
    score += 32;
    reasons.push('candidate filename contains requested stem');
  } else if (candidateStem.length >= 4 && missingStem.includes(candidateStem)) {
    score += 26;
    reasons.push('requested filename contains candidate stem');
  }

  if (path.posix.extname(missingBase) === path.posix.extname(candidateBase)) {
    score += 10;
    reasons.push('same extension');
  }
  if (candidate.endsWith('/' + missingBase)) {
    score += 10;
    reasons.push('path ends with requested filename');
  }

  const missingWords = readcodePathWords(missing);
  const candidateWords = readcodePathWords(candidate);
  let sharedWords = 0;
  for (const word of missingWords) {
    if (candidateWords.has(word) || candidate.includes(word)) sharedWords += 1;
  }
  if (sharedWords > 0) {
    score += Math.min(30, sharedWords * 6);
    reasons.push(`${sharedWords} shared path token(s)`);
  }

  const missingDir = path.posix.dirname(missing);
  const candidateDir = path.posix.dirname(candidate);
  const missingDirTail = missingDir.split('/').filter(Boolean).at(-1);
  if (missingDirTail && candidateDir.includes(missingDirTail)) {
    score += 8;
    reasons.push('requested directory token appears in candidate path');
  }

  if (score < MISSING_PATH_SCORE_MIN) return null;
  return { path: candidatePath, score, reason: reasons.join(', ') || 'path similarity' };
}

function isReadcodeMissingPathError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOENT') || message.includes('no such file or directory');
}

function readcodeMissingPathSuggestions(missingPath: string): MissingPathSuggestion[] {
  const scored: MissingPathSuggestion[] = [];
  for (const candidate of collectReadcodeCandidateFiles()) {
    const suggestion = scoreMissingReadcodePath(missingPath, candidate);
    if (suggestion) scored.push(suggestion);
  }
  return scored
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, MISSING_PATH_SUGGESTION_LIMIT);
}

async function readcodeRecoveredFileContext(filePath: string, fullLimit: number): Promise<Record<string, unknown>> {
  const { absPath, relPath } = resolveSafeTarget(filePath);
  const st = fs.statSync(absPath);
  if (st.isDirectory()) {
    throw new Error('missing-path recovery only recovers files, not directories');
  }
  const text = readUtf8(absPath);
  const displayPath = workspaceDisplayPath(absPath, relPath);
  const fileSha = sha256(text);
  const ext = path.extname(absPath).toLowerCase();
  const grammar = extToGrammar(ext);
  const o = await _outlineFn!(relPath, text);
  const lineCount = text.split('\n').length;
  if (text.length < fullLimit && text.length < MISSING_PATH_RECOVERY_BUDGET) {
    return {
      ok: true,
      mode: 'full',
      file: displayPath,
      ...readcodeTargetDetails(displayPath),
      language: o.language,
      lineCount,
      charCount: text.length,
      fullContentThreshold: fullLimit,
      symbolCount: o.symbols.length,
      content: text,
      fileSha256: fileSha,
      symbolSelectors: o.symbols.map((symbol) => symbol.selector),
    };
  }
  return {
    ok: true,
    mode: 'summary',
    file: displayPath,
    ...readcodeTargetDetails(displayPath),
    language: o.language,
    lineCount,
    charCount: text.length,
    fullContentThreshold: fullLimit,
    symbolCount: o.symbols.length,
    symbols: o.symbols,
    fileSha256: fileSha,
    compactSignatures: formatSignaturesCompact({
      symbols: o.symbols,
      file: displayPath,
      maxInline: MAX_SYMBOLS_INLINE,
    }),
  };
}

// ──────────────────────── main tool ──────────────────────────

export function registerReadCodeTool(server: McpServer): void {
  server.registerTool(
    'code_readcode',
    {
      title: 'Unified adaptive code reader (CodeStruct readCode port)',
      description:
        'ONE tool for all code reading — automatically adapts its output:\n' +
        '• Directory → file listing + bounded shallow tree\n' +
        '• File, no selector, small (<6K chars by default) → FULL content\n' +
        '• File, no selector, large → compact signature summary\n' +
        '• File + selector → full implementation of the matched symbol\n' +
        '\n' +
        'Selectors support 5-tier fuzzy matching: exact, case-insensitive, prefix,\n' +
        'CamelCase initials (UM→UserManager), subsequence (usrmgr→UserManager),\n' +
        'and consonant skeleton. Use unscoped names (load) or scoped (User.load).\n' +
        '\n' +
        'This is the recommended read-side primary tool for one path/selector. Directory responses include batchNext ' +
        'with a ready code_readcode_batch call when a small file cluster is visible. When several paths are known, ' +
        'prefer code_readcode_batch over repeated code_browse/code_readcode calls; when several symbols are already known, ' +
        'prefer code_read_symbols_batch over repeated code_readcode/code_read_symbol calls. Both batch tools reduce serial ' +
        'read surface and token cost for macro transactions. code_browse, code_outline, and code_read_symbol remain available ' +
        'for explicit mode selection.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'File path, directory path, or repo-relative path. ' +
            "Use '.' for repo root, 'src/' for a subdirectory, 'src/foo.ts' for a file.",
          ),
        selector: z
          .string()
          .optional()
          .describe(
            "Optional AST selector. Unscoped: 'load', 'UserService'. Scoped: 'User.load', 'Auth.login'. " +
            'Fuzzy matching recovers from minor typos/hallucinations (e.g. calcuator→Calculator). ' +
            'When omitted, adaptive summarization mode is used (full content or signatures).',
          ),
        maxFullChars: z.number().int().min(1).max(50000).optional().describe(
          'Optional cutoff for returning full content without a selector. Defaults to the normal 6K readCode threshold.',
        ),
      },
    },
    async (a) => {
      try {
        await loadNav();
        const { absPath, relPath } = resolveSafeTarget(a.path || '.');

        // ── Mode 1: Directory ──
        const st = fs.statSync(absPath);
        if (st.isDirectory()) {
          const entries = browse(absPath);
          const dir = workspaceDisplayPath(absPath, relPath);
          const displayPath = dir;
          const shallowTree = readcodeDirectoryTree(dir, absPath);
          const batchNext = readcodeBatchNextForDirectory(dir, entries, shallowTree);
          const inline = await readcodeInlineFilesForDirectory(dir, absPath, entries);
          if (entries.length <= LARGE_DIR_LIMIT) {
            return ok({
              ok: true,
              mode: 'directory',
              dir,
              ...readcodeTargetDetails(displayPath),
              entries,
              shallowTree,
              batchNext,
              ...inline,
              summaryForHuman:
                `Directory: ${dir} (${entries.length} entries)\n` +
                entries.map((e) => `  ${e.name}${e.type === 'dir' ? '/' : ''}`).join('\n') +
                `\n\nShallow tree:\n${formatShallowTreeSummary(shallowTree)}` +
                (inline.inlineFileCount > 0
                  ? `\n\nInline small files: ${inline.inlineFileCount} direct file(s), ${inline.inlineContextBytes}/${inline.inlineContextBudget} chars already included.`
                  : '') +
                (batchNext ? `\n\nRecommended next call: ${batchNext.tool} for ${batchNext.items.length} file(s) in this directory.` : ''),
            });
          }
          return ok({
            ok: true,
            mode: 'directory',
            dir,
            ...readcodeTargetDetails(displayPath),
            entryCount: entries.length,
            shallowTree,
            note: `Directory has ${entries.length} entries. Use a more specific path or a file selector.`,
            summaryForHuman:
              `Directory: ${dir} (${entries.length} entries — too many to list). ` +
              'Navigate into a subdirectory or specify a file.' +
              `\n\nShallow tree:\n${formatShallowTreeSummary(shallowTree)}`,
          });
        }

        // ── File ──
        const text = readUtf8(absPath);
        const displayPath = workspaceDisplayPath(absPath, relPath);
        const fileSha = sha256(text);
        const ext = path.extname(absPath).toLowerCase();
        const grammar = extToGrammar(ext);
        const fullLimit = typeof a.maxFullChars === 'number' ? a.maxFullChars : CONTEXT_FILE_LIMIT;

        // ── Mode 4: File + selector ──
        const selectorWildcard = a.selector?.trim() === '*';
        if (a.selector && !selectorWildcard) {
          try {
            const r = await _readSymbolFn!(relPath, text, a.selector);
            return ok({
              ok: true,
              mode: 'symbol',
              file: displayPath,
              ...readcodeTargetDetails(displayPath),
              resolvedSelector: r.selector,
              kind: r.kind,
              startLine: r.startLine,
              startColumn: r.startColumn,
              endLine: r.endLine,
              endColumn: r.endColumn,
              code: r.code,
              fileSha256: fileSha,
              language: grammar ?? 'text',
              summaryForHuman:
                `Symbol "${r.selector}" (${r.kind}) at ${displayPath}:${r.startLine}-${r.endLine} ` +
                `(${r.endLine - r.startLine + 1} lines, ${r.code.length} chars, ${grammar ?? 'text'}). ` +
                `Code is in the structured JSON payload.`,
            });
          } catch (symbolErr) {
            // fuzzy match fallback — show candidates inline
            const o = await _outlineFn!(relPath, text);
            const candidates = o.symbols.map((s) => s.selector);
            const fuzzyResults = fuzzyMatch(a.selector, candidates, { minScore: 50, maxCandidates: 10 });
            throw new Error(
              selectorNotFound({
                selector: a.selector,
                file: displayPath,
                available: candidates,
                fuzzyCandidates: fuzzyResults.length > 0 ? fuzzyResults : undefined,
                language: grammar ?? 'text',
              }),
            );
          }
        }

        // ── Mode 2 & 3: File, no selector ──
        if (text.length < fullLimit) {
          // Mode 2: small file → FULL content
          const o = await _outlineFn!(relPath, text);
          const lineCount = text.split('\n').length;
          return ok({
            ok: true,
            mode: 'full',
            selectorWildcard,
            file: displayPath,
            ...readcodeTargetDetails(displayPath),
            language: o.language,
            lineCount,
            charCount: text.length,
            fullContentThreshold: fullLimit,
            symbolCount: o.symbols.length,
            content: text,
            fileSha256: fileSha,
            symbolSelectors: o.symbols.map((symbol) => symbol.selector),
            summaryForHuman:
              `Full content of ${displayPath} (${lineCount} lines, ${o.symbols.length} symbols, ` +
              `${grammar ?? 'text'}, ${text.length} chars). Content is in the structured JSON payload.`,
          });
        }

        // Mode 3: large file → compact signatures
        const o = await _outlineFn!(relPath, text);
        const lineCount = text.split('\n').length;
        const compactLines = formatSignaturesCompact({
          symbols: o.symbols,
          file: displayPath,
          maxInline: MAX_SYMBOLS_INLINE,
        });
        return ok({
          ok: true,
          mode: 'summary',
          selectorWildcard,
          file: displayPath,
          ...readcodeTargetDetails(displayPath),
          language: o.language,
          lineCount,
          charCount: text.length,
          fullContentThreshold: fullLimit,
          symbolCount: o.symbols.length,
          symbols: o.symbols,
          fileSha256: fileSha,
          summaryForHuman:
            compactLines.join('\n') +
            `\n\nFile is ${lineCount} lines (${text.length} chars). Use a selector to read a specific symbol.`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );


  server.registerTool(
    'code_readcode_batch',
    {
      title: 'Batch adaptive code reader for clustered context',
      description:
        'Batch form of code_readcode: read several directories/files/symbols in one tool call. ' +
        'Use this before repeated code_browse/code_readcode calls when a task spans a small cluster of known paths. ' +
        'Each item adapts independently: directory listing, full small file, compact large-file summary, or selected symbol. ' +
        'Broad no-selector batches are also aggregate-budgeted: when the combined full-content payload would exceed ' +
        'the batch context budget, small files are returned as compact summaries with fullReadNext follow-ups. ' +
        'If a requested path is missing, the batch response includes bounded missingPathSuggestions and recoveredResults ' +
        'from high-confidence real files so agents can avoid serial glob/list retries. ' +
        'This reduces serial read overhead without forcing whole-file reads when a selector is provided.',
      inputSchema: {
        items: z.array(z.object({
          path: z.string().describe('repo-relative path or absolute path inside the active workspace'),
          selector: z.string().optional().describe('optional AST selector; when present, only that symbol body is returned'),
        })).min(1).max(20).describe('Directories/files/symbols to read as one adaptive context batch'),
        maxFullCharsPerFile: z.number().int().min(1).max(50000).optional().describe(
          'Optional small-file cutoff for returning full content. Defaults to the normal 6K readCode threshold.',
        ),
      },
    },
    async (a) => {
      try {
        await loadNav();
        const hasExplicitFullLimit = typeof a.maxFullCharsPerFile === 'number';
        const fullLimit = hasExplicitFullLimit ? a.maxFullCharsPerFile! : CONTEXT_FILE_LIMIT;
        let projectedFullChars = 0;
        if (!hasExplicitFullLimit && a.items.length >= BATCH_COMPACT_ITEM_THRESHOLD) {
          for (const item of a.items) {
            if (item.selector && item.selector.trim() !== '*') continue;
            try {
              const { absPath } = resolveSafeTarget(item.path || '.');
              const st = fs.statSync(absPath);
              if (!st.isDirectory()) {
                const text = readUtf8(absPath);
                if (text.length < fullLimit) projectedFullChars += text.length;
              }
            } catch {
              // Per-item errors are reported in the normal read loop below.
            }
          }
        }
        const compactBatchContext =
          !hasExplicitFullLimit &&
          a.items.length >= BATCH_COMPACT_ITEM_THRESHOLD &&
          projectedFullChars > BATCH_CONTEXT_BUDGET;
        const results = [];
        for (const item of a.items) {
          try {
            const { absPath, relPath } = resolveSafeTarget(item.path || '.');
            const st = fs.statSync(absPath);
            if (st.isDirectory()) {
              const entries = browse(absPath);
              const dir = workspaceDisplayPath(absPath, relPath);
              const displayPath = dir;
              const shallowTree = readcodeDirectoryTree(dir, absPath);
              const inline = await readcodeInlineFilesForDirectory(dir, absPath, entries);
              results.push({
                ok: true,
                mode: 'directory',
                dir,
                ...readcodeTargetDetails(displayPath),
                entries: entries.length <= LARGE_DIR_LIMIT ? entries : undefined,
                shallowTree,
                entryCount: entries.length,
                truncated: entries.length > LARGE_DIR_LIMIT,
                batchNext: readcodeBatchNextForDirectory(dir, entries, shallowTree),
                ...inline,
              });
              continue;
            }

            const text = readUtf8(absPath);
            const displayPath = workspaceDisplayPath(absPath, relPath);
            const fileSha = sha256(text);
            const ext = path.extname(absPath).toLowerCase();
            const grammar = extToGrammar(ext);
            const itemSelectorWildcard = item.selector?.trim() === '*';
            if (item.selector && !itemSelectorWildcard) {
              const r = await _readSymbolFn!(relPath, text, item.selector);
              results.push({
                ok: true,
                mode: 'symbol',
                file: displayPath,
                ...readcodeTargetDetails(displayPath),
                requestedSelector: item.selector,
                resolvedSelector: r.selector,
                kind: r.kind,
                startLine: r.startLine,
                startColumn: r.startColumn,
                endLine: r.endLine,
                endColumn: r.endColumn,
                code: r.code,
                fileSha256: fileSha,
                language: grammar ?? 'text',
              });
              continue;
            }

            const o = await _outlineFn!(relPath, text);
            const lineCount = text.split('\n').length;
            const shouldCompactFullContent = compactBatchContext && text.length < fullLimit;
            if (shouldCompactFullContent) {
              results.push({
                ok: true,
                mode: 'summary',
                selectorWildcard: itemSelectorWildcard,
                batchContextCompacted: true,
                compactionReason:
                  `Batch projected ${projectedFullChars} full-content chars, above ${BATCH_CONTEXT_BUDGET}.`,
                file: displayPath,
                ...readcodeTargetDetails(displayPath),
                language: o.language,
                lineCount,
                charCount: text.length,
                fullContentThreshold: fullLimit,
                batchContextBudget: BATCH_CONTEXT_BUDGET,
                batchProjectedFullChars: projectedFullChars,
                symbolCount: o.symbols.length,
                symbolSelectors: o.symbols.slice(0, BATCH_COMPACT_SYMBOL_LIMIT).map((symbol) => symbol.selector),
                fileSha256: fileSha,
                compactSignatures: formatSignaturesCompact({
                  symbols: o.symbols,
                  file: displayPath,
                  maxInline: BATCH_COMPACT_SYMBOL_LIMIT,
                }),
              });
              continue;
            }
            if (text.length < fullLimit) {
              results.push({
                ok: true,
                mode: 'full',
                selectorWildcard: itemSelectorWildcard,
                file: displayPath,
                ...readcodeTargetDetails(displayPath),
                language: o.language,
                lineCount,
                charCount: text.length,
                fullContentThreshold: fullLimit,
                symbolCount: o.symbols.length,
                content: text,
                fileSha256: fileSha,
                symbolSelectors: o.symbols.map((symbol) => symbol.selector),
              });
              continue;
            }

            results.push({
              ok: true,
              mode: 'summary',
              selectorWildcard: itemSelectorWildcard,
              file: displayPath,
              ...readcodeTargetDetails(displayPath),
              language: o.language,
              lineCount,
              charCount: text.length,
              fullContentThreshold: fullLimit,
              symbolCount: o.symbols.length,
              symbols: o.symbols,
              fileSha256: fileSha,
              compactSignatures: formatSignaturesCompact({
                symbols: o.symbols,
                file: displayPath,
                maxInline: MAX_SYMBOLS_INLINE,
              }),
            });
          } catch (itemErr) {
            const allowsMissingPathRecovery = isReadcodeMissingPathError(itemErr);
            const missingPathSuggestions = allowsMissingPathRecovery
              ? readcodeMissingPathSuggestions(item.path)
              : [];
            const recoveredResults: Record<string, unknown>[] = [];
            let recoveryContextBytes = 0;
            if (allowsMissingPathRecovery) {
              for (const suggestion of missingPathSuggestions.slice(0, MISSING_PATH_RECOVERY_LIMIT)) {
                try {
                  const recovered = await readcodeRecoveredFileContext(suggestion.path, fullLimit);
                  const recoveredBytes = Buffer.byteLength(JSON.stringify(recovered), 'utf8');
                  if (recoveryContextBytes + recoveredBytes > MISSING_PATH_RECOVERY_BUDGET) continue;
                  recoveryContextBytes += recoveredBytes;
                  recoveredResults.push({
                    ...recovered,
                    recoveredFromMissingPath: item.path,
                    missingPathSuggestionScore: suggestion.score,
                  });
                } catch {
                  // Suggestions are advisory; a failed recovery must not mask the original per-item error.
                }
              }
            }
            results.push({
              ok: false,
              path: item.path,
              selector: item.selector,
              error: itemErr instanceof Error ? itemErr.message : String(itemErr),
              missingPathSuggestions,
              recoveredResults,
              recoveredCount: recoveredResults.length,
              recoveryContextBytes,
            });
          }
        }
        const failed = results.filter((result) => result.ok !== true);
        const compactedFiles = results
          .filter((result: any) => result.ok === true && result.batchContextCompacted && typeof result.file === 'string')
          .map((result: any) => ({ path: result.file }));
        const fullReadNext: {
          tool: 'code_readcode_batch';
          arguments: { items: Array<{ path: string }>; maxFullCharsPerFile: number };
          reason: string;
        } | undefined = compactedFiles.length > 0
          ? {
              tool: 'code_readcode_batch',
              arguments: { items: compactedFiles, maxFullCharsPerFile: fullLimit },
              reason: 'Batch aggregate context was compacted; run this follow-up only if full content for every compacted file is required.',
            }
          : undefined;
        return ok({
          ok: failed.length === 0,
          mode: 'readcode-batch',
          requested: a.items.length,
          returned: results.length - failed.length,
          failed: failed.length,
          batchContextCompacted: compactBatchContext,
          batchContextBudget: BATCH_CONTEXT_BUDGET,
          batchProjectedFullChars: projectedFullChars,
          fullReadNext,
          results,
          summaryForHuman:
            'code_readcode_batch returned ' + (results.length - failed.length) + '/' + a.items.length +
            ' adaptive context item(s); ' + failed.length + ' failed.' +
            (failed.some((result: any) => Array.isArray(result.recoveredResults) && result.recoveredResults.length > 0)
              ? ' Some missing paths include recoveredResults from high-confidence real files; inspect them before issuing glob/list retries.'
              : '') +
            (compactBatchContext
              ? ` Batch full-content payload compacted (${projectedFullChars} projected chars > ${BATCH_CONTEXT_BUDGET} budget); request a specific symbol/file or pass maxFullCharsPerFile when full content is required.`
              : ''),
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'code_read_symbols_batch',
    {
      title: 'Read multiple symbols in one compact batch',
      description:
        'Batch form of code_readcode(file+selector): read 1-N specific symbols across files in one tool call. ' +
        'Use this before repeated code_readcode/code_read_symbol calls when a clustered edit needs several known ' +
        'methods/interfaces/types. It returns only requested symbol bodies plus per-file sha256, not whole files, ' +
        'so it reduces duplicate read surface and token cost for macro transactions.',
      inputSchema: {
        items: z.array(z.object({
          path: z.string().describe('repo-relative file path or absolute path inside the active workspace'),
          selector: z.string().describe("AST selector to read, e.g. 'FieldSchema' or 'BinarySerde.computeSize'"),
        })).min(1).max(20).describe('Symbols to read as one compact batch'),
      },
    },
    async (a) => {
      try {
        await loadNav();
        const results = [];
        for (const item of a.items) {
          try {
            const { absPath, relPath } = resolveSafeTarget(item.path);
            const text = readUtf8(absPath);
            const displayPath = workspaceDisplayPath(absPath, relPath);
            const fileSha = sha256(text);
            const ext = path.extname(absPath).toLowerCase();
            const grammar = extToGrammar(ext);
            const selectorWildcard = item.selector?.trim() === '*';
            if (selectorWildcard) {
              const o = await _outlineFn!(relPath, text);
              const lineCount = text.split('\n').length;
              if (text.length < CONTEXT_FILE_LIMIT) {
                results.push({
                  ok: true,
                  mode: 'full',
                  selectorWildcard: true,
                  file: displayPath,
                  ...readcodeTargetDetails(displayPath),
                  requestedSelector: item.selector,
                  language: o.language,
                  lineCount,
                  charCount: text.length,
                  fullContentThreshold: CONTEXT_FILE_LIMIT,
                  symbolCount: o.symbols.length,
                  content: text,
                  fileSha256: fileSha,
                  symbolSelectors: o.symbols.map((symbol) => symbol.selector),
                });
              } else {
                results.push({
                  ok: true,
                  mode: 'summary',
                  selectorWildcard: true,
                  file: displayPath,
                  ...readcodeTargetDetails(displayPath),
                  requestedSelector: item.selector,
                  language: o.language,
                  lineCount,
                  charCount: text.length,
                  fullContentThreshold: CONTEXT_FILE_LIMIT,
                  symbolCount: o.symbols.length,
                  symbols: o.symbols,
                  fileSha256: fileSha,
                  compactSignatures: formatSignaturesCompact({
                    symbols: o.symbols,
                    file: displayPath,
                    maxInline: MAX_SYMBOLS_INLINE,
                  }),
                });
              }
              continue;
            }
            const r = await _readSymbolFn!(relPath, text, item.selector);
            results.push({
              ok: true,
              file: displayPath,
              ...readcodeTargetDetails(displayPath),
              requestedSelector: item.selector,
              resolvedSelector: r.selector,
              kind: r.kind,
              startLine: r.startLine,
              startColumn: r.startColumn,
              endLine: r.endLine,
              endColumn: r.endColumn,
              code: r.code,
              fileSha256: fileSha,
              language: grammar ?? 'text',
            });
          } catch (itemErr) {
            results.push({
              ok: false,
              file: item.path,
              selector: item.selector,
              error: itemErr instanceof Error ? itemErr.message : String(itemErr),
            });
          }
        }
        const failed = results.filter((result) => result.ok !== true);
        return ok({
          ok: failed.length === 0,
          mode: 'symbols-batch',
          requested: a.items.length,
          returned: results.length - failed.length,
          failed: failed.length,
          results,
          summaryForHuman:
            `code_read_symbols_batch returned ${results.length - failed.length}/${a.items.length} requested symbol(s); ` +
            `${failed.length} failed.`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
