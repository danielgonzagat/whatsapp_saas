import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, replaceLiteral, replaceText, renameSymbol, type TextEditSpec } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { browse, outline, readSymbol } from './nav.js';
import { atomicWrite, commit, fail, guardSha, log, ok, readUtf8 } from './server-core.js';
export function registerBasicTools(server: McpServer): void {
const pos = z.object({
  line: z.number().int().min(1).describe("1-based line"),
  column: z.number().int().min(1).describe("1-based column (UTF-16 units within the line)"),
});
server.registerTool(
  "atomic_replace_range",
  {
    title: "Replace an exact character range",
    description:
      "Replace text between (startLine,startColumn) and (endLine,endColumn) — 1-based, end-exclusive — " +
      "with newText. Structurally validated before write. Use this instead of rewriting a whole line " +
      "when the real intention is sub-line (a literal, an argument, a token).",
    inputSchema: {
      file: z.string().describe("repo-relative path"),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      newText: z.string(),
      preview: z.boolean().optional().describe("dry-run: validate + return diff, do not write"),
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
  "atomic_replace_text",
  {
    title: "Replace exact text (builtin-edit ergonomics + validation)",
    description:
      "Replace a verbatim oldText block with newText — same ergonomics as the blunt builtin edit/str_replace " +
      "(no coordinates needed), BUT syntax-regression-validated + atomic-write + governance-guarded like every " +
      "atomic op. PREFER THIS over the builtin edit for each multi-line/block change: it is just as easy and it " +
      "refuses to persist broken code. Requires a unique match (add surrounding context) or an explicit " +
      "occurrence index. Supports preview + expectedSha256.",
    inputSchema: {
      file: z.string(),
      oldText: z.string().describe("exact verbatim text to replace, including whitespace/indentation"),
      newText: z.string(),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("1-based; omit to require a unique match (refuses ambiguity)"),
      expectedSha256: z
        .string()
        .optional()
        .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
      preview: z.boolean().optional().describe("dry-run: validate + return diff, do not write"),
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
  "atomic_insert_at",
  {
    title: "Insert text at a position",
    description:
      "Insert text at (line,column) without rewriting the surrounding line. Zero-width edit (start===end).",
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      text: z.string(),
      preview: z.boolean().optional().describe("dry-run: validate + return diff, do not write"),
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
  "atomic_delete_range",
  {
    title: "Delete an exact character range",
    description: "Delete text between (startLine,startColumn) and (endLine,endColumn), 1-based, end-exclusive.",
    inputSchema: {
      file: z.string(),
      startLine: z.number().int().min(1),
      startColumn: z.number().int().min(1),
      endLine: z.number().int().min(1),
      endColumn: z.number().int().min(1),
      preview: z.boolean().optional().describe("dry-run: validate + return diff, do not write"),
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
          newText: "",
        },
      ]);
      return commit(relPath, absPath, before, r, {}, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);
server.registerTool(
  "atomic_apply_edits",
  {
    title: "Apply a batch of non-overlapping edits atomically",
    description:
      "LSP TextEdit[] semantics: all edits validated together, applied all-or-nothing, single atomic write. " +
      "Use for multi-site changes that are ONE intention (e.g. several literals in one config) so they " +
      "land as one reviewable, conflict-minimal mutation.",
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
      preview: z.boolean().optional().describe("dry-run: validate + return diff, do not write"),
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
  "atomic_rename_symbol",
  {
    title: "Scope-correct rename (single file)",
    description:
      "Rename the identifier at (line,column) and all its scope-correct references within the same file, " +
      "respecting binding/shadowing (ts-morph). One intention instead of N text rewrites. " +
      "Cross-file rename is intentionally out of scope v1.",
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
        return fail(`rejected: rename would introduce a syntax error. ${r.validation.introduced ?? ""}`);
      }
      if (r.newText === before) return ok({ ok: true, changed: false, note: "no change", file: relPath });
      atomicWrite(absPath, r.newText);
      log(`renamed ${r.symbol} in ${relPath} (${r.occurrences} refs)`);
      return ok({ ok: true, changed: true, file: relPath, symbol: r.symbol, references: r.occurrences });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);
server.registerTool(
  "atomic_replace_literal",
  {
    title: "Replace a literal by value (AST-targeted)",
    description:
      "Replace a string/numeric/boolean/null literal whose source text equals currentText with newText, " +
      "selected via the AST (not text matching). The thesis worked example: \"'5511999999999'\" -> 'null' " +
      "as one intention. Refuses ambiguous matches unless onLine disambiguates to exactly one.",
    inputSchema: {
      file: z.string(),
      currentText: z.string().describe("exact source text of the literal, incl. quotes for strings"),
      newText: z.string().describe("replacement source text, incl. quotes if it should stay a string"),
      onLine: z.number().int().min(1).optional().describe("constrain to this 1-based line"),
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      const r = await replaceLiteral(relPath, before, a.currentText, a.newText, a.onLine);
      if (!r.validation.ok) {
        return fail(`rejected: edit would introduce a syntax error. ${r.validation.introduced ?? ""}`);
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
  "code_browse",
  {
    title: "List a directory (structured)",
    description:
      "Repo-relative directory listing (dirs first, node_modules/.git hidden). Read-side step 1: " +
      "locate the file before reading its structure.",
    inputSchema: { dir: z.string().describe("repo-relative directory, '.' for root") },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.dir || ".");
      return ok({ ok: true, dir: relPath || ".", entries: browse(absPath) });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);
server.registerTool(
  "code_outline",
  {
    title: "File signature map (no bodies)",
    description:
      "Token-cheap structural summary: every named function/class/method/interface/type/var with its " +
      "selector and line range — NO bodies. CodeStruct's readCode summarization mode; the highest-leverage " +
      "read primitive. Use before editing so you address symbols by name, not by guessed line numbers.",
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
  "code_read_symbol",
  {
    title: "Read one symbol by scoped selector",
    description:
      "Return the complete syntactic unit for a selector (e.g. 'UserService.load', 'Foo::bar', 'helper') " +
      "plus its exact start/end line+column — chain straight into an atomic edit without re-deriving " +
      "positions. Refuses ambiguous selectors with the candidate list.",
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
}
