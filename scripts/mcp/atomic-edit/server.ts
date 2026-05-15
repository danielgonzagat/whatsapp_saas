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
  type TextEditSpec,
  type ApplyResult,
  type ValidationResult,
} from './engine.js';
import { resolveSafeTarget, REPO_ROOT } from './guard.js';
import { buildTrace, levelFor, shapePayload } from './trace.js';
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

interface ToolOk {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  /** SDK CallToolResult is an open record; satisfy its index signature. */
  [x: string]: unknown;
}

function ok(payload: Record<string, unknown>): ToolOk {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
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
    });
  }
  const level = levelFor(preview);
  const operator = String(
    (extra as Record<string, unknown>).op ??
      (extra as Record<string, unknown>).operator ??
      'atomic_edit',
  );
  const inlinePreview = characterDiff(before, result.newText, relPath);
  const trace = buildTrace({
    file: relPath,
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
      shapePayload(
        level,
        {
          ok: true,
          preview: true,
          changed: false,
          note: 'dry-run: validated, NOT written',
          file: relPath,
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
  atomicWrite(absPath, result.newText);
  log(`wrote ${relPath} (+${result.newText.length - before.length} bytes net)`);
  return ok(
    shapePayload(
      level,
      {
        ok: true,
        changed: true,
        file: relPath,
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
}

const server = new McpServer({ name: 'kloel-atomic-edit', version: '3.0.0' });

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
      'atomic op. PREFER THIS over the builtin edit for any multi-line/block change: it is just as easy and it ' +
      'refuses to persist broken code. Requires a unique match (add surrounding context) or an explicit ' +
      'occurrence index. Supports preview + expectedSha256.',
    inputSchema: {
      file: z.string(),
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
      preview: z.boolean().optional().describe('dry-run: validate + return diff, do not write'),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = replaceText(relPath, before, a.oldText, a.newText, a.occurrence);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false);
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
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = await replaceLiteral(relPath, before, a.currentText, a.newText, a.onLine);
      if (!r.validation.ok) {
        return fail(
          `rejected: edit would introduce a syntax error. ${r.validation.introduced ?? ''}`,
        );
      }
      atomicWrite(absPath, r.newText);
      log(`replaced literal in ${relPath} at ${r.matched[0].line}:${r.matched[0].column}`);
      return ok({ ok: true, changed: true, file: relPath, matched: r.matched });
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
      'locate the file before reading its structure.',
    inputSchema: { dir: z.string().describe("repo-relative directory, '.' for root") },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.dir || '.');
      return ok({ ok: true, dir: relPath || '.', entries: browse(absPath) });
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
      'read primitive. Use before editing so you address symbols by name, not by guessed line numbers.',
    inputSchema: { file: z.string() },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const o = await outline(relPath, readUtf8(absPath));
      return ok({ ok: true, file: relPath, ...o });
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
      'positions. Refuses ambiguous selectors with the candidate list.',
    inputSchema: {
      file: z.string(),
      selector: z.string().describe("unscoped 'name' or scoped 'Class.method' / 'A.B.c'"),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const r = await readSymbol(relPath, readUtf8(absPath), a.selector);
      return ok({ ok: true, file: relPath, ...r });
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
      const { absPath, relPath } = resolveSafeTarget(a.file);
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
      const symTrace = buildTrace({
        file: relPath,
        operator: `edit_symbol:${r.op}`,
        before,
        newText: r.newText,
        inlinePreview: symInline,
        validation: {
          language: r.validation.language,
          before: r.validation.before,
          after: r.validation.after,
        },
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
      atomicWrite(absPath, r.newText);
      log(`edit_symbol ${a.op} ${r.selector} in ${relPath}`);
      return ok(
        shapePayload(
          symLevel,
          { ok: true, changed: true, file: relPath, selector: r.selector, op: r.op },
          {
            inlinePreview: symInline,
            legacyDiff: previewDiff(before, r.newText, relPath),
            trace: symTrace,
          },
        ),
      );
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
    },
  },
  async (a) => {
    try {
      const { absPath } = resolveSafeTarget(a.file);
      const r = await renameSymbolCrossFile(absPath, REPO_ROOT, a.line, a.column, a.newName);
      const bad = r.validations.filter((v) => !v.ok);
      if (bad.length > 0) {
        return fail(
          `rejected: rename would break ${bad.length} file(s): ` +
            bad.map((b) => `${b.file} (${b.introduced ?? 'syntax error'})`).join('; ') +
            ' — NOTHING written.',
        );
      }
      // every change target must also pass the governance guard
      for (const rel of r.changes.keys()) resolveSafeTarget(rel);
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
      for (const [rel, content] of r.changes) {
        atomicWrite(path.join(REPO_ROOT, rel), content);
      }
      log(`cross-file rename ${r.symbol}: ${r.changes.size} file(s), ${r.totalReferences} refs`);
      return ok({
        ok: true,
        changed: true,
        symbol: r.symbol,
        references: r.totalReferences,
        files: [...r.changes.keys()],
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
): ToolOk {
  if (!r.validation.ok) {
    return fail(`rejected: would introduce a syntax error. ${r.validation.introduced ?? ''}`);
  }
  if (r.newText === before) {
    return ok({ ok: true, changed: false, note: 'no change', file: relPath, ...r.detail });
  }
  const semLevel = levelFor(preview);
  const semInline = characterDiff(before, r.newText, relPath);
  const semTrace = buildTrace({
    file: relPath,
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
      shapePayload(
        semLevel,
        { ok: true, preview: true, changed: false, file: relPath, ...r.detail },
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
  return ok(
    shapePayload(
      semLevel,
      { ok: true, changed: true, file: relPath, afterSha256: sha256(r.newText), ...r.detail },
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
