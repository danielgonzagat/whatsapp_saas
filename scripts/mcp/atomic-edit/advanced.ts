/**
 * Symbol-named edits + cross-file semantic rename + preview diff.
 *
 * CodeStruct's `editCode` (insert/replace/removal over named AST entities)
 * dominates EFFICIENCY in their ablation (removing it: +38.7% cost from extra
 * validation cycles). "To Diff or Not to Diff?" (2026) shows block-level
 * rewrites of syntactically coherent units (functions/classes) beat fragile
 * offsets. Kiro's program-analysis argument: semantic rename must come from
 * the language service, not LLM text guessing. This module implements all
 * three, each producing a syntactically validated, all-or-nothing change set.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { validate, type ValidationResult } from "./engine.js";
import { resolveSymbol } from "./symbols.js";

export type SymbolOp = "replace" | "insert_after" | "remove";

export interface SymbolEditResult {
  newText: string;
  validation: ValidationResult;
  selector: string;
  op: SymbolOp;
  startLine: number;
  endLine: number;
}

function leadingIndent(text: string, atOffset: number): string {
  const lineStart = text.lastIndexOf("\n", atOffset - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(lineStart, atOffset + 200));
  return m ? m[0] : "";
}

/**
 * Shift `code` into the target column by prefixing the container `indent` to
 * every line after the first. The caller's first line lands right after the
 * indentation already present in the original slice; subsequent lines keep
 * their OWN relative indentation (we only add the container prefix). For a
 * top-level symbol (indent === "") the code is returned unchanged.
 */
function reindent(code: string, indent: string): string {
  if (indent === "") return code;
  const lines = code.split("\n");
  if (lines.length === 1) return code;
  return lines.map((l, i) => (i === 0 || l === "" ? l : indent + l)).join("\n");
}

/**
 * Replace / insert-after / remove a named AST entity. Indentation of the
 * target is preserved (CodeStruct GetIndentation) and the result is reparsed
 * (HasSyntaxError) before the caller is allowed to persist.
 */
export async function editSymbol(
  file: string,
  original: string,
  selector: string,
  op: SymbolOp,
  code?: string,
): Promise<SymbolEditResult> {
  const { Project } = await import("ts-morph");
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  const sf = project.createSourceFile(file, original, { overwrite: true });
  const { node, info } = resolveSymbol(sf, selector);
  const start = node.getStart();
  const end = node.getEnd();
  const indent = leadingIndent(original, start);

  let next: string;
  if (op === "remove") {
    // Drop the node, its own line's leading indentation, and the trailing
    // newline so no blank gap is left behind.
    const lineStart = original.lastIndexOf("\n", start - 1) + 1;
    const cutStart = original.slice(lineStart, start).trim() === "" ? lineStart : start;
    let cutEnd = end;
    if (original[cutEnd] === "\n") cutEnd++;
    next = original.slice(0, cutStart) + original.slice(cutEnd);
  } else if (op === "replace") {
    if (code == null) throw new Error(`op "replace" requires code`);
    next = original.slice(0, start) + reindent(code, indent) + original.slice(end);
  } else {
    if (code == null) throw new Error(`op "insert_after" requires code`);
    next = `${original.slice(0, end)}\n\n${indent}${reindent(code, indent)}${original.slice(end)}`;
  }

  return {
    newText: next,
    validation: validate(file, original, next),
    selector: info.selector,
    op,
    startLine: info.startLine,
    endLine: info.endLine,
  };
}

export interface CrossFileRenameResult {
  symbol: string;
  /** repo-relative path -> new content (only files that changed) */
  changes: Map<string, string>;
  totalReferences: number;
  validations: { file: string; ok: boolean; introduced?: string }[];
}

function findNearestTsconfig(absFile: string, repoRoot: string): string | undefined {
  let dir = path.dirname(absFile);
  for (;;) {
    const cand = path.join(dir, "tsconfig.json");
    if (fs.existsSync(cand)) return cand;
    if (dir === repoRoot || dir === path.dirname(dir)) return undefined;
    dir = path.dirname(dir);
  }
}

/**
 * True cross-file, scope-correct rename via the TypeScript language service
 * (loaded from the nearest tsconfig). All-or-nothing: every touched file is
 * revalidated; if a would regress syntactically, NOTHING is written and the
 * caller is told which file failed.
 */
export async function renameSymbolCrossFile(
  absFile: string,
  repoRoot: string,
  line: number,
  column: number,
  newName: string,
): Promise<CrossFileRenameResult> {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) {
    throw new Error(`invalid identifier: ${JSON.stringify(newName)}`);
  }
  const tsconfig = findNearestTsconfig(absFile, repoRoot);
  const { Project } = await import("ts-morph");
  const project = tsconfig
    ? new Project({ tsConfigFilePath: tsconfig })
    : new Project({ compilerOptions: { allowJs: true, noEmit: true } });
  if (!tsconfig) project.addSourceFilesAtPaths(path.join(path.dirname(absFile), "**/*.{ts,tsx,js,jsx}"));

  const sf = project.getSourceFile(absFile) ?? project.addSourceFileAtPath(absFile);
  const original = new Map<string, string>();
  for (const f of project.getSourceFiles()) original.set(f.getFilePath(), f.getFullText());

  const text = sf.getFullText();
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf("\n", offset);
    if (nl === -1) throw new Error(`line ${line} out of range`);
    offset = nl + 1;
  }
  offset += column - 1;
  const node = sf.getDescendantAtPos(offset);
  if (!node) throw new Error(`no node at ${line}:${column}`);
  const id =
    node.getKindName() === "Identifier"
      ? node
      : node.getFirstAncestorByKind?.(ts.SyntaxKind.Identifier);
  if (!id || id.getKindName() !== "Identifier") {
    throw new Error(`position ${line}:${column} is not an identifier (got ${node.getKindName()})`);
  }
  const oldName = id.getText();
  const renameable = id.asKindOrThrow(ts.SyntaxKind.Identifier);
  const totalReferences = renameable
    .findReferences()
    .reduce((n, r) => n + r.getReferences().length, 0);

  renameable.rename(newName);

  const changes = new Map<string, string>();
  const validations: CrossFileRenameResult["validations"] = [];
  for (const f of project.getSourceFiles()) {
    const p = f.getFilePath();
    const before = original.get(p) ?? "";
    const after = f.getFullText();
    if (after === before) continue;
    const rel = path.relative(repoRoot, p).split(path.sep).join("/");
    const v = validate(rel, before, after);
    validations.push({ file: rel, ok: v.ok, introduced: v.introduced });
    changes.set(rel, after);
  }
  return { symbol: `${oldName} -> ${newName}`, changes, totalReferences, validations };
}

// ── v3: import + object-property semantic ops (adopted from Codex's
//        semantic-edit, but routed through validate()+atomic write so they
//        cannot persist broken code, unlike the original). ───────────────────

const TS_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

function assertTs(file: string, op: string): void {
  const i = file.lastIndexOf(".");
  const ext = i < 0 ? "" : file.slice(i).toLowerCase();
  if (!TS_EXT.has(ext)) throw new Error(`${op} only supports TS/JS files, got ${ext || "(none)"}`);
}

async function tsmProject(file: string, text: string) {
  const { Project } = await import("ts-morph");
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  return project.createSourceFile(file, text, { overwrite: true });
}

export interface SemanticEditResult {
  newText: string;
  validation: ValidationResult;
  detail: Record<string, unknown>;
}

/**
 * ts-morph validates on manipulation and THROWS when the produced tree is
 * unparseable. Wrap mutations so the engine contract stays uniform: return a
 * failed-validation result (newText unchanged) instead of throwing, exactly
 * like applyEdits/editSymbol. Genuine "no such symbol/property" errors still
 * throw (caller-actionable), only manipulation-produced syntax breakage is
 * converted.
 */
function guardedMutation(
  file: string,
  original: string,
  detail: Record<string, unknown>,
  mutate: () => string,
): SemanticEditResult {
  try {
    const next = mutate();
    return { newText: next, validation: validate(file, original, next), detail };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/manipulation|syntax|parse|Error replacing/i.test(msg)) {
      return {
        newText: original,
        validation: { language: "ts", before: 0, after: 1, ok: false, introduced: msg.split("\n")[0] },
        detail,
      };
    }
    throw e;
  }
}

/** Add a named import; dedupes, creates the declaration if absent, supports alias. */
export async function addNamedImport(
  file: string,
  original: string,
  moduleSpecifier: string,
  name: string,
  alias?: string,
): Promise<SemanticEditResult> {
  assertTs(file, "add_import");
  const sf = await tsmProject(file, original);
  const decls = sf.getImportDeclarations().filter((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (decls.length > 1) throw new Error(`module "${moduleSpecifier}" has ${decls.length} import declarations; ambiguous`);
  const local = alias ?? name;
  if (decls.length === 1) {
    const exists = decls[0]
      .getNamedImports()
      .some((ni) => ni.getName() === name && (ni.getAliasNode()?.getText() ?? ni.getName()) === local);
    if (exists) {
      return { newText: original, validation: validate(file, original, original), detail: { action: "already-present", moduleSpecifier, name } };
    }
  }
  const action = decls.length === 0 ? "created-declaration" : "added-specifier";
  return guardedMutation(file, original, { action, moduleSpecifier, name, alias: alias ?? null }, () => {
    if (decls.length === 0) {
      sf.addImportDeclaration({ moduleSpecifier, namedImports: [alias ? { name, alias } : { name }] });
    } else {
      decls[0].addNamedImport(alias ? { name, alias } : { name });
    }
    return sf.getFullText();
  });
}

/** Remove a named import by imported-or-local name; drops the declaration if it was the last. */
export async function removeNamedImport(
  file: string,
  original: string,
  moduleSpecifier: string,
  name: string,
): Promise<SemanticEditResult> {
  assertTs(file, "remove_import");
  const sf = await tsmProject(file, original);
  const decls = sf.getImportDeclarations().filter((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (decls.length !== 1) throw new Error(`module "${moduleSpecifier}" matched ${decls.length} import declarations`);
  const decl = decls[0];
  const named = decl.getNamedImports();
  const target = named.find((ni) => ni.getName() === name || (ni.getAliasNode()?.getText() ?? ni.getName()) === name);
  if (!target) throw new Error(`named import "${name}" not found for "${moduleSpecifier}"`);
  const dropDecl = named.length === 1 && !decl.getDefaultImport() && !decl.getNamespaceImport();
  return guardedMutation(
    file,
    original,
    { action: dropDecl ? "removed-declaration" : "removed-specifier", moduleSpecifier, name },
    () => {
      if (dropDecl) decl.remove();
      else target.remove();
      return sf.getFullText();
    },
  );
}

/**
 * Replace the initializer of an object property by name, optionally scoped to
 * a symbol selector so identically-named properties elsewhere are untouched.
 * Refuses ambiguous matches.
 */
export async function replacePropertyValue(
  file: string,
  original: string,
  property: string,
  valueCode: string,
  selector?: string,
): Promise<SemanticEditResult> {
  assertTs(file, "replace_property_value");
  const { SyntaxKind } = await import("ts-morph");
  const sf = await tsmProject(file, original);
  const scopeNode = selector ? resolveSymbol(sf, selector).node : sf;
  const hits = scopeNode
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((pa) => {
      const n = pa.getNameNode();
      const k = n.getKind();
      const nm =
        k === SyntaxKind.Identifier || k === SyntaxKind.StringLiteral || k === SyntaxKind.NumericLiteral
          ? n.getText().replace(/^['"]|['"]$/g, "")
          : null;
      return nm === property;
    });
  if (hits.length === 0) throw new Error(`property "${property}" not found${selector ? ` in ${selector}` : ""}`);
  if (hits.length > 1) {
    throw new Error(
      `property "${property}" matched ${hits.length} assignments (lines ${hits
        .map((h) => h.getStartLineNumber())
        .join(", ")}); pass a selector to disambiguate`,
    );
  }
  const line = hits[0].getStartLineNumber();
  return guardedMutation(file, original, { property, selector: selector ?? null, line }, () => {
    hits[0].getInitializerOrThrow().replaceWithText(valueCode);
    return sf.getFullText();
  });
}

/** Minimal unified-style line diff — for PREVIEW DISPLAY only (the edit
 * itself is atomic; this is just so the agent/human can verify before
 * commit, addressing the "blind edit" failure mode). */
export function previewDiff(before: string, after: string, label: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  // simple LCS-free context diff: find first/last divergence
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tailA = a.length - 1;
  let tailB = b.length - 1;
  while (tailA >= head && tailB >= head && a[tailA] === b[tailB]) {
    tailA--;
    tailB--;
  }
  const ctx = 2;
  const from = Math.max(0, head - ctx);
  const lines: string[] = [`--- ${label} (before)`, `+++ ${label} (after)`];
  for (let i = from; i < head; i++) lines.push(`  ${a[i]}`);
  for (let i = head; i <= tailA; i++) lines.push(`- ${a[i]}`);
  for (let i = head; i <= tailB; i++) lines.push(`+ ${b[i]}`);
  for (let i = tailA + 1; i <= Math.min(a.length - 1, tailA + ctx); i++) lines.push(`  ${a[i]}`);
  return lines.join("\n");
}
