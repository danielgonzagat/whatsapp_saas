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

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { validate, type ValidationResult } from './engine.js';
import { resolveSymbol } from './symbols.js';
import { graphemeDiff } from './textunit.js';

export type SymbolOp = 'replace' | 'insert_after' | 'remove';

export interface SymbolEditResult {
  newText: string;
  validation: ValidationResult;
  selector: string;
  op: SymbolOp;
  startLine: number;
  endLine: number;
}

function leadingIndent(text: string, atOffset: number): string {
  const lineStart = text.lastIndexOf('\n', atOffset - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(lineStart, atOffset + 200));
  return m ? m[0] : '';
}

/**
 * Shift `code` into the target column by prefixing the container `indent` to
 * every line after the first. The caller's first line lands right after the
 * indentation already present in the original slice; subsequent lines keep
 * their OWN relative indentation (we only add the container prefix). For a
 * top-level symbol (indent === "") the code is returned unchanged.
 */
function reindent(code: string, indent: string): string {
  if (indent === '') return code;
  const lines = code.split('\n');
  if (lines.length === 1) return code;
  return lines.map((l, i) => (i === 0 || l === '' ? l : indent + l)).join('\n');
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
  const { Project, Node } = await import('ts-morph');
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
  if (op === 'remove') {
    // A selector for `const foo = ...` resolves to the declarator. Removing
    // only that node leaves invalid residue such as `const ;`, so single
    // declarator statements are removed as one syntactic unit.
    let removalStart = start;
    let removalEnd = end;
    if (Node.isVariableDeclaration(node)) {
      const statement = node.getFirstAncestorByKind(ts.SyntaxKind.VariableStatement);
      if (statement) {
        const declarations = statement.getDeclarations();
        if (declarations.length === 1) {
          removalStart = statement.getStart();
          removalEnd = statement.getEnd();
        } else {
          const index = declarations.findIndex((declaration) => declaration === node);
          if (index === 0) {
            const nextDeclaration = declarations[1];
            if (nextDeclaration) removalEnd = nextDeclaration.getStart();
          } else if (index > 0) {
            const previousDeclaration = declarations[index - 1];
            if (previousDeclaration) removalStart = previousDeclaration.getEnd();
          }
        }
      }
    }
    // Drop the node, its own line's leading indentation, and the trailing
    // newline so no blank gap is left behind.
    const lineStart = original.lastIndexOf('\n', removalStart - 1) + 1;
    const cutStart =
      original.slice(lineStart, removalStart).trim() === '' ? lineStart : removalStart;
    let cutEnd = removalEnd;
    if (original[cutEnd] === '\n') cutEnd++;
    next = original.slice(0, cutStart) + original.slice(cutEnd);
  } else if (op === 'replace') {
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
    const cand = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(cand)) return cand;
    if (dir === repoRoot || dir === path.dirname(dir)) return undefined;
    dir = path.dirname(dir);
  }
}

/**
 * True cross-file, scope-correct rename via the TypeScript language service
 * (loaded from the nearest tsconfig). All-or-nothing: every touched file is
 * revalidated; if any would regress syntactically, NOTHING is written and the
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
  const { Project } = await import('ts-morph');
  const project = tsconfig
    ? new Project({ tsConfigFilePath: tsconfig })
    : new Project({ compilerOptions: { allowJs: true, noEmit: true } });
  if (!tsconfig)
    project.addSourceFilesAtPaths(path.join(path.dirname(absFile), '**/*.{ts,tsx,js,jsx}'));

  const sf = project.getSourceFile(absFile) ?? project.addSourceFileAtPath(absFile);
  const original = new Map<string, string>();
  for (const f of project.getSourceFiles()) original.set(f.getFilePath(), f.getFullText());

  const text = sf.getFullText();
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) throw new Error(`line ${line} out of range`);
    offset = nl + 1;
  }
  offset += column - 1;
  const node = sf.getDescendantAtPos(offset);
  if (!node) throw new Error(`no node at ${line}:${column}`);
  const id =
    node.getKindName() === 'Identifier'
      ? node
      : node.getFirstAncestorByKind?.(ts.SyntaxKind.Identifier);
  if (!id || id.getKindName() !== 'Identifier') {
    throw new Error(`position ${line}:${column} is not an identifier (got ${node.getKindName()})`);
  }
  const oldName = id.getText();
  const renameable = id.asKindOrThrow(ts.SyntaxKind.Identifier);
  const totalReferences = renameable
    .findReferences()
    .reduce((n, r) => n + r.getReferences().length, 0);

  renameable.rename(newName);

  const changes = new Map<string, string>();
  const validations: CrossFileRenameResult['validations'] = [];
  for (const f of project.getSourceFiles()) {
    const p = f.getFilePath();
    const before = original.get(p) ?? '';
    const after = f.getFullText();
    if (after === before) continue;
    const rel = path.relative(repoRoot, p).split(path.sep).join('/');
    const v = validate(rel, before, after);
    validations.push({ file: rel, ok: v.ok, introduced: v.introduced });
    changes.set(rel, after);
  }
  return { symbol: `${oldName} -> ${newName}`, changes, totalReferences, validations };
}

// ── v3: import + object-property semantic ops (adopted from Codex's
//        semantic-edit, but routed through validate()+atomic write so they
//        cannot persist broken code, unlike the original). ───────────────────

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const RESERVED_IDENTIFIER_KEYS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

function assertTs(file: string, op: string): void {
  const i = file.lastIndexOf('.');
  const ext = i < 0 ? '' : file.slice(i).toLowerCase();
  if (!TS_EXT.has(ext)) throw new Error(`${op} only supports TS/JS files, got ${ext || '(none)'}`);
}

async function tsmProject(file: string, text: string) {
  const { Project } = await import('ts-morph');
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  return project.createSourceFile(file, text, { overwrite: true });
}

function preferredImportQuote(original: string): string {
  const counts: Record<string, number> = { "'": 0, '"': 0 };
  for (const match of original.matchAll(/\bfrom\s+(['"])[^'"\n]+?\1/g)) {
    counts[match[1] ?? "'"] = (counts[match[1] ?? "'"] ?? 0) + 1;
  }
  for (const match of original.matchAll(/^\s*import\s+(['"])[^'"\n]+?\1/gm)) {
    counts[match[1] ?? "'"] = (counts[match[1] ?? "'"] ?? 0) + 1;
  }
  return (counts["'"] ?? 0) >= (counts['"'] ?? 0) ? "'" : '"';
}

function escapeRegExp(value: string): string {
  const slash = String.fromCharCode(92);
  const specialChars = new Set([
    '^',
    '$',
    '.',
    '*',
    '+',
    '?',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    '|',
    slash,
  ]);
  let escaped = '';
  for (const char of value) {
    escaped += specialChars.has(char) ? slash + char : char;
  }
  return escaped;
}

function normalizeModuleSpecifierQuote(
  text: string,
  moduleSpecifier: string,
  quote: string,
): string {
  if (quote !== "'" || moduleSpecifier.includes("'")) return text;
  const escapedModule = escapeRegExp(moduleSpecifier);
  return text
    .replace(
      new RegExp('\\bfrom\\s+"' + escapedModule + '"', 'g'),
      "from '" + moduleSpecifier + "'",
    )
    .replace(
      new RegExp('\\bimport\\s+"' + escapedModule + '"', 'g'),
      "import '" + moduleSpecifier + "'",
    );
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
        validation: {
          language: 'ts',
          before: 0,
          after: 1,
          ok: false,
          introduced: msg.split('\n')[0],
        },
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
  typeOnly = false,
): Promise<SemanticEditResult> {
  assertTs(file, 'add_import');
  const sf = await tsmProject(file, original);
  const decls = sf
    .getImportDeclarations()
    .filter((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (decls.length > 1)
    throw new Error(
      `module "${moduleSpecifier}" has ${decls.length} import declarations; ambiguous`,
    );
  const local = alias ?? name;
  if (decls.length === 1) {
    const exists = decls[0]
      .getNamedImports()
      .some(
        (ni) =>
          ni.getName() === name &&
          (ni.getAliasNode()?.getText() ?? ni.getName()) === local &&
          ni.isTypeOnly() === typeOnly,
      );
    if (exists) {
      return {
        newText: original,
        validation: validate(file, original, original),
        detail: { action: 'already-present', moduleSpecifier, name, typeOnly },
      };
    }
  }
  const action = decls.length === 0 ? 'created-declaration' : 'added-specifier';
  return guardedMutation(
    file,
    original,
    { action, moduleSpecifier, name, alias: alias ?? null, typeOnly },
    () => {
      if (decls.length === 0) {
        sf.addImportDeclaration({
          moduleSpecifier,
          namedImports: [
            alias ? { name, alias, isTypeOnly: typeOnly } : { name, isTypeOnly: typeOnly },
          ],
        });
      } else {
        decls[0].addNamedImport(
          alias ? { name, alias, isTypeOnly: typeOnly } : { name, isTypeOnly: typeOnly },
        );
      }
      return normalizeModuleSpecifierQuote(
        sf.getFullText(),
        moduleSpecifier,
        preferredImportQuote(original),
      );
    },
  );
}

/** Remove a named import by imported-or-local name; drops the declaration if it was the last. */
export async function removeNamedImport(
  file: string,
  original: string,
  moduleSpecifier: string,
  name: string,
): Promise<SemanticEditResult> {
  assertTs(file, 'remove_import');
  const sf = await tsmProject(file, original);
  const decls = sf
    .getImportDeclarations()
    .filter((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (decls.length !== 1)
    throw new Error(`module "${moduleSpecifier}" matched ${decls.length} import declarations`);
  const decl = decls[0];
  const named = decl.getNamedImports();
  const target = named.find(
    (ni) => ni.getName() === name || (ni.getAliasNode()?.getText() ?? ni.getName()) === name,
  );
  if (!target) throw new Error(`named import "${name}" not found for "${moduleSpecifier}"`);
  const dropDecl = named.length === 1 && !decl.getDefaultImport() && !decl.getNamespaceImport();
  return guardedMutation(
    file,
    original,
    { action: dropDecl ? 'removed-declaration' : 'removed-specifier', moduleSpecifier, name },
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
  assertTs(file, 'replace_property_value');
  const { SyntaxKind } = await import('ts-morph');
  const sf = await tsmProject(file, original);
  const scopeNode = selector ? resolveSymbol(sf, selector).node : sf;
  const hits = scopeNode.getDescendantsOfKind(SyntaxKind.PropertyAssignment).filter((pa) => {
    const n = pa.getNameNode();
    const k = n.getKind();
    const nm =
      k === SyntaxKind.Identifier ||
      k === SyntaxKind.StringLiteral ||
      k === SyntaxKind.NumericLiteral
        ? n.getText().replace(/^['"]|['"]$/g, '')
        : null;
    return nm === property;
  });
  if (hits.length === 0)
    throw new Error(`property "${property}" not found${selector ? ` in ${selector}` : ''}`);
  if (hits.length > 1) {
    throw new Error(
      `property "${property}" matched ${hits.length} assignments (lines ${hits
        .map((h) => h.getStartLineNumber())
        .join(', ')}); pass a selector to disambiguate`,
    );
  }
  const line = hits[0].getStartLineNumber();
  return guardedMutation(file, original, { property, selector: selector ?? null, line }, () => {
    hits[0].getInitializerOrThrow().replaceWithText(valueCode);
    return sf.getFullText();
  });
}

/**
 * Rename an object property key while preserving its initializer/value exactly.
 * The operator is intentionally narrow: identifiers only for the new key,
 * optional selector scope, and ambiguous matches are refused.
 */
export async function renamePropertyKey(
  file: string,
  original: string,
  property: string,
  newKey: string,
  selector?: string,
): Promise<SemanticEditResult> {
  assertTs(file, 'rename_property_key');
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newKey) || RESERVED_IDENTIFIER_KEYS.has(newKey)) {
    throw new Error(`invalid new key identifier: ${JSON.stringify(newKey)}`);
  }
  const { SyntaxKind } = await import('ts-morph');
  const sf = await tsmProject(file, original);
  const scopeNode = selector ? resolveSymbol(sf, selector).node : sf;
  const hits = scopeNode.getDescendantsOfKind(SyntaxKind.PropertyAssignment).filter((pa) => {
    const nameNode = pa.getNameNode();
    const kind = nameNode.getKind();
    const name =
      kind === SyntaxKind.Identifier ||
      kind === SyntaxKind.StringLiteral ||
      kind === SyntaxKind.NumericLiteral
        ? nameNode.getText().replace(/^['"]|['"]$/g, '')
        : null;
    return name === property;
  });
  if (hits.length === 0) {
    throw new Error(`property "${property}" not found${selector ? ` in ${selector}` : ''}`);
  }
  if (hits.length > 1) {
    throw new Error(
      `property "${property}" matched ${hits.length} assignments (lines ${hits
        .map((hit) => hit.getStartLineNumber())
        .join(', ')}); pass a selector to disambiguate`,
    );
  }
  const hit = hits[0];
  const nameNode = hit.getNameNode();
  const initializerText = hit.getInitializerOrThrow().getText();
  const line = hit.getStartLineNumber();
  return guardedMutation(
    file,
    original,
    { property, newKey, selector: selector ?? null, line, preservedValue: initializerText },
    () => {
      nameNode.replaceWithText(newKey);
      return sf.getFullText();
    },
  );
}

/**
 * Find a CallExpression by callee name/text and optional selector scope;
 * wrap exactly that call expression as `await <callText>`, preserving
 * callee, arguments, and call text. Refuses missing target, ambiguity,
 * already-awaited call, non-async context, and syntax regression.
 */
export async function addAwaitToCall(
  file: string,
  original: string,
  callee: string,
  selector?: string,
): Promise<SemanticEditResult> {
  assertTs(file, 'add_await_to_call');
  const { SyntaxKind, Node } = await import('ts-morph');
  const sf = await tsmProject(file, original);
  const scopeNode = selector ? resolveSymbol(sf, selector).node : sf;
  const calls = scopeNode.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression();
    return (
      expr.getText() === callee ||
      (Node.isPropertyAccessExpression(expr) && expr.getName() === callee)
    );
  });
  if (calls.length === 0) {
    throw new Error(`call "${callee}" not found${selector ? ` in ${selector}` : ''}`);
  }
  if (calls.length > 1) {
    throw new Error(
      `call "${callee}" matched ${calls.length} call expressions (lines ${calls
        .map((c) => c.getStartLineNumber())
        .join(', ')}); pass a selector to disambiguate`,
    );
  }
  const call = calls[0];
  if (call.getParentIfKind(SyntaxKind.AwaitExpression)) {
    throw new Error(`call "${callee}" is already awaited`);
  }
  const functionScope = call.getFirstAncestor(
    (node) =>
      Node.isFunctionDeclaration(node) ||
      Node.isFunctionExpression(node) ||
      Node.isArrowFunction(node) ||
      Node.isMethodDeclaration(node),
  ) as
    | import('ts-morph').FunctionDeclaration
    | import('ts-morph').FunctionExpression
    | import('ts-morph').ArrowFunction
    | import('ts-morph').MethodDeclaration
    | undefined;
  if (
    !functionScope
      ?.getModifiers()
      .some((modifier) => modifier.getKind() === SyntaxKind.AsyncKeyword)
  ) {
    throw new Error(`call "${callee}" is not inside an async function or method`);
  }
  const line = call.getStartLineNumber();
  const callText = call.getText();
  return guardedMutation(
    file,
    original,
    { callee, selector: selector ?? null, line, callText },
    () => {
      call.replaceWithText(`await ${callText}`);
      return sf.getFullText();
    },
  );
}

/** Minimal unified-style line diff — for PREVIEW DISPLAY only (the edit
 * itself is atomic; this is just so the agent/human can verify before
 * commit, addressing the "blind edit" failure mode). */
export function previewDiff(before: string, after: string, label: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
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
  return lines.join('\n');
}

// ─── Atomic char-level diff ──────────────────────────────────────────────
// previewDiff above is the line-oriented +/- block the CLI harness already
// paints (whole line red / whole line green even for a 1-char change).
// characterDiff below is the TRUE atomic proof: preserved chars stay
// neutral, removed chars are red inside [- -], added chars green inside
// {+ +}. A whole line only shows as line-removed/added when the whole line
// was genuinely born or destroyed. ANSI-colored AND bracket-marked so it
// stays legible on no-color terminals (git --word-diff convention). This
// is returned in every mutating tool's payload, so the operator SEES the
// atomicity in the tool output even though the harness's own +/- block
// (which we cannot disable) keeps rendering line-level beside it.

const ESC = '[';
const RESET = `${ESC}0m`;
const RED = `${ESC}31m`;
const GREEN = `${ESC}32m`;
const DIM = `${ESC}2m`;

// LCS char-diff is O(n*m); only the divergent line block is fed to it, but
// cap it so a genuine large rewrite falls back to line markers (honest
// there — the whole block really did change) instead of blowing memory.
const CHAR_DIFF_CAP = 6000;

/**
 * Inline [-removed-]{+added+} diff. Operates on GRAPHEME CLUSTERS via
 * textunit.graphemeDiff — never splits a surrogate pair, combining mark or
 * ZWJ sequence, so the rendered proof can't show half an emoji (the silent
 * failure a UTF-16-index diff produces). The accent/emoji smoke cases lock
 * this in.
 */
function renderCharDiff(oldStr: string, newStr: string): string {
  return graphemeDiff(oldStr, newStr, {
    del: (s) => `${RED}[-${s}-]${RESET}`,
    add: (s) => `${GREEN}{+${s}+}${RESET}`,
  });
}

/**
 * Character-granular inline diff of `before`→`after`. Trims common leading
 * and trailing lines, char-diffs only the divergent block, and prints it
 * with 2 lines of neutral context for orientation.
 */
export function characterDiff(before: string, after: string, label: string): string {
  if (before === after) return `${DIM}= ${label} (no change)${RESET}`;
  const a = before.split('\n');
  const b = after.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tailA = a.length - 1;
  let tailB = b.length - 1;
  while (tailA >= head && tailB >= head && a[tailA] === b[tailB]) {
    tailA--;
    tailB--;
  }
  const oldBlock = a.slice(head, tailA + 1).join('\n');
  const newBlock = b.slice(head, tailB + 1).join('\n');
  const ctx = 2;
  const out: string[] = [`${DIM}--- ${label} (atomic char-level)${RESET}`];
  for (let i = Math.max(0, head - ctx); i < head; i++) out.push(`  ${a[i]}`);
  if (oldBlock.length + newBlock.length > CHAR_DIFF_CAP) {
    for (let i = head; i <= tailA; i++) out.push(`${RED}- ${a[i]}${RESET}`);
    for (let i = head; i <= tailB; i++) out.push(`${GREEN}+ ${b[i]}${RESET}`);
  } else {
    for (const ln of renderCharDiff(oldBlock, newBlock).split('\n')) out.push(`  ${ln}`);
  }
  for (let i = tailA + 1; i <= Math.min(a.length - 1, tailA + ctx); i++) out.push(`  ${a[i]}`);
  return out.join('\n');
}
