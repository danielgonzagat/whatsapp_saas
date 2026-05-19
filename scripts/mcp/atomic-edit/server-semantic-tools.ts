import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { addNamedImport, editSymbol, previewDiff, removeNamedImport, renameSymbolCrossFile, replacePropertyValue, type SemanticEditResult, type SymbolOp } from './advanced.js';
import { resolveSafeTarget, REPO_ROOT } from './guard.js';
import { atomicWrite, fail, guardSha, log, ok, readUtf8, sha256, type ToolOk } from './server-core.js';
export function registerSemanticTools(server: McpServer): void {
// ───────────────────────── v2: symbol-named edits + cross-file rename ──────
server.registerTool(
  "atomic_edit_symbol",
  {
    title: "Replace / insert-after / remove a named AST entity",
    description:
      "CodeStruct editCode: structurally edit a symbol by selector — op='replace' (swap its whole " +
      "definition), 'insert_after' (add a sibling after it), 'remove' (delete it). Indentation preserved, " +
      "syntax revalidated, atomic write. The block-level operator the literature shows beats fragile " +
      "offsets for function/class changes. Supports preview (dry-run).",
    inputSchema: {
      file: z.string(),
      selector: z.string(),
      op: z.enum(["replace", "insert_after", "remove"]),
      code: z.string().optional().describe("required for replace / insert_after; omit for remove"),
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
      const r = await editSymbol(relPath, before, a.selector, a.op as SymbolOp, a.code);
      if (!r.validation.ok) {
        return fail(
          `rejected: ${a.op} on ${r.selector} would introduce a syntax error. ${r.validation.introduced ?? ""}`,
        );
      }
      if (r.newText === before) return ok({ ok: true, changed: false, note: "no change", file: relPath });
      if (a.preview ?? false) {
        return ok({
          ok: true,
          preview: true,
          changed: false,
          file: relPath,
          selector: r.selector,
          op: r.op,
          diff: previewDiff(before, r.newText, relPath),
        });
      }
      atomicWrite(absPath, r.newText);
      log(`edit_symbol ${a.op} ${r.selector} in ${relPath}`);
      return ok({ ok: true, changed: true, file: relPath, selector: r.selector, op: r.op });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);
server.registerTool(
  "atomic_rename_symbol_cross_file",
  {
    title: "Scope-correct rename across the whole project",
    description:
      "True semantic rename via the TypeScript language service (nearest tsconfig): renames the symbol " +
      "at (line,column) and ALL its references across every file, respecting scope/shadowing. " +
      "All-or-nothing: if a touched file would break, NOTHING is written. This is the Kiro " +
      "'use program analysis, not LLM guessing' operator. Supports preview.",
    inputSchema: {
      file: z.string(),
      line: z.number().int().min(1),
      column: z.number().int().min(1),
      newName: z.string().min(1),
      preview: z.boolean().optional().describe("dry-run: list files + refs, do not write"),
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
            bad.map((b) => `${b.file} (${b.introduced ?? "syntax error"})`).join("; ") +
            " — NOTHING written.",
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
    return fail(`rejected: would introduce a syntax error. ${r.validation.introduced ?? ""}`);
  }
  if (r.newText === before) {
    return ok({ ok: true, changed: false, note: "no change", file: relPath, ...r.detail });
  }
  if (preview) {
    return ok({
      ok: true,
      preview: true,
      changed: false,
      file: relPath,
      ...r.detail,
      diff: previewDiff(before, r.newText, relPath),
    });
  }
  atomicWrite(absPath, r.newText);
  log(`semantic edit ${JSON.stringify(r.detail)} in ${relPath}`);
  return ok({ ok: true, changed: true, file: relPath, afterSha256: sha256(r.newText), ...r.detail });
}
const shaArg = {
  expectedSha256: z
    .string()
    .optional()
    .describe("optimistic-concurrency guard: refuse if the file's sha256 differs"),
  preview: z.boolean().optional().describe("dry-run: validate + return diff, do not write"),
};
server.registerTool(
  "atomic_add_import",
  {
    title: "Add a named import (deduped)",
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
  "atomic_remove_import",
  {
    title: "Remove a named import",
    description:
      "Remove a named import by imported-or-local name; drops the whole declaration if it was the last " +
      "specifier. Syntax-validated, atomic — no dangling commas or broken lines.",
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
  "atomic_replace_property_value",
  {
    title: "Replace an object property's value",
    description:
      "Replace the initializer of property `property` with `value` (raw code), optionally scoped to a " +
      "symbol selector so identically-named properties elsewhere are untouched. Refuses ambiguity. " +
      "Syntax-validated, atomic.",
    inputSchema: {
      file: z.string(),
      property: z.string(),
      value: z.string().describe("replacement initializer source (e.g. 'null', \"'x'\", '{ a: 1 }')"),
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
}
