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
import { validate, type ValidationResult, TS_EXT, extOf } from './engine.js';
import { resolveSymbol } from './symbols.js';
import { universalEditSymbol } from './engine-universal-symbols.js';
import { lspRequirementMessage } from './engine-lsp-registry.js';
import { extToGrammar } from './engine-universal.js';
export { previewDiff, characterDiff } from './advanced-diff.js';

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
  if (!TS_EXT.has(extOf(file))) {
    return universalEditSymbol(file, original, selector, op, code, extOf(file));
  }
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
  if (!TS_EXT.has(extOf(absFile))) {
    throw new Error(lspRequirementMessage(extToGrammar(extOf(absFile)) ?? extOf(absFile), 'rename_symbol_cross_file'));
  }
  const tsconfig = findNearestTsconfig(absFile, repoRoot);
  const { Project } = await import('ts-morph');
  const project = tsconfig
    ? new Project({ tsConfigFilePath: tsconfig })
    : new Project({ compilerOptions: { allowJs: true, noEmit: true } });
  if (!tsconfig)
    project.addSourceFilesAtPaths(path.join(path.dirname(absFile), '**/*.{ts,tsx,js,jsx}'));
  // A tsconfig commonly EXCLUDES test files (e.g. "**/*spec.ts"), but a correct
  // cross-file rename must still reach references that live INSIDE specs — test
  // object keys ({ method: jest.fn() }), `Pick<Class,'method'>` string-literal
  // type members, and property access on typed test doubles. Without loading
  // them the language service silently under-collects, forcing manual fixups.
  // Explicitly add the test/spec sources (node_modules/dist excluded).
  {
    const projRoot = tsconfig ? path.dirname(tsconfig) : path.dirname(absFile);
    project.addSourceFilesAtPaths([
      path.join(projRoot, '**/*.spec.{ts,tsx}'),
      path.join(projRoot, '**/*.test.{ts,tsx}'),
      `!${path.join(projRoot, '**/node_modules/**')}`,
      `!${path.join(projRoot, '**/dist/**')}`,
    ]);
  }

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
  // Owning class/interface of the renamed member (for binding-aware test-double
  // key coverage after the symbol rename); undefined for free symbols.
  let ownerTypeName: string | undefined;
  type WalkNode = { getKind: () => number; getParent: () => unknown; getName?: () => string | undefined };
  let cur = renameable.getParent() as WalkNode | undefined;
  while (cur) {
    const pk = cur.getKind();
    if (pk === ts.SyntaxKind.ClassDeclaration || pk === ts.SyntaxKind.InterfaceDeclaration) {
      ownerTypeName = cur.getName?.();
      break;
    }
    cur = cur.getParent() as WalkNode | undefined;
  }
  const totalReferences = renameable
    .findReferences()
    .reduce((n, r) => n + r.getReferences().length, 0);

  renameable.rename(newName);

  // Binding-aware coverage for test-double property keys with NO symbol link to
  // the renamed member (ts-morph's rename cannot reach them): NestJS DI provider
  // doubles `{ provide: <OwnerType>, useValue|useFactory: { <oldName>: ... } }`
  // and object literals typed `Partial<OwnerType>` / `Pick<OwnerType, ...>`. Only
  // a key provably bound to OwnerType is renamed — never an unrelated same-name key.
  if (ownerTypeName) {
    const K = ts.SyntaxKind;
    const renameKeyIn = (obj: unknown): void => {
      const o = obj as { getKind?: () => number; getProperties?: () => unknown[] } | undefined;
      if (!o || o.getKind?.() !== K.ObjectLiteralExpression) return;
      for (const prop of o.getProperties?.() ?? []) {
        const p = prop as { getKind?: () => number; getNameNode?: () => { getText?: () => string; replaceWithText?: (t: string) => void } | undefined };
        const pk = p.getKind?.();
        if (pk !== K.PropertyAssignment && pk !== K.MethodDeclaration && pk !== K.GetAccessor && pk !== K.SetAccessor) continue;
        const nameNode = p.getNameNode?.();
        const raw = nameNode?.getText?.() ?? '';
        const q = raw.length > 1 && (raw[0] === "'" || raw[0] === '"' || raw[0] === '`') ? raw[0] : '';
        const bare = q ? raw.slice(1, -1) : raw;
        if (bare === oldName) nameNode?.replaceWithText?.(q ? q + newName + q : newName);
      }
    };
    const factoryObj = (init: unknown): unknown => {
      const f = init as { getKind?: () => number; getBody?: () => unknown } | undefined;
      const k = f?.getKind?.();
      if (k !== K.ArrowFunction && k !== K.FunctionExpression) return undefined;
      const body = f?.getBody?.() as { getKind?: () => number; getExpression?: () => unknown; getStatements?: () => unknown[] } | undefined;
      const bk = body?.getKind?.();
      if (bk === K.ParenthesizedExpression) return body?.getExpression?.();
      if (bk === K.ObjectLiteralExpression) return body;
      if (bk === K.Block) {
        for (const st of body?.getStatements?.() ?? []) {
          const s = st as { getKind?: () => number; getExpression?: () => unknown };
          if (s.getKind?.() === K.ReturnStatement) {
            const e = s.getExpression?.() as { getKind?: () => number; getExpression?: () => unknown } | undefined;
            return e?.getKind?.() === K.ParenthesizedExpression ? e.getExpression?.() : e;
          }
        }
      }
      return undefined;
    };
    // After renaming a test-double KEY, the bound variable's PROPERTY ACCESSES
    // (`dbl.oldName(...)`, `expect(dbl.oldName)...`) still name the old member —
    // ts-morph's rename cannot reach them because the double is an untyped /
    // structurally-typed object with no symbol link to OwnerType. Rename those
    // accesses too, but ONLY on the exact variable proven to be the double.
    const renameAccessesOfVar = (nameNode: unknown): void => {
      const n = nameNode as { findReferencesAsNodes?: () => unknown[] } | undefined;
      let refs: unknown[] = [];
      try { refs = n?.findReferencesAsNodes?.() ?? []; } catch { return; }
      for (const ref of refs) {
        const r = ref as { getParent?: () => unknown };
        const parent = r.getParent?.() as { getKind?: () => number; getExpression?: () => unknown; getNameNode?: () => { getText?: () => string; replaceWithText?: (t: string) => void } | undefined } | undefined;
        if (parent?.getKind?.() !== K.PropertyAccessExpression) continue;
        if (parent.getExpression?.() !== ref) continue; // ref must be the object, not the member name
        const nn = parent.getNameNode?.();
        if (nn?.getText?.() === oldName) nn.replaceWithText?.(newName);
      }
    };
    // Peel casts/parens so `useValue: dbl as never` / `(dbl)` / `dbl!` resolve to
    // the underlying identifier or object literal. These wrappers are pervasive in
    // strict codebases (e.g. `as never` to satisfy unsafe-cast gates) and would
    // otherwise hide the DI double from binding-aware coverage.
    const PEEL = new Set([K.AsExpression, K.ParenthesizedExpression, K.NonNullExpression, K.SatisfiesExpression, K.TypeAssertionExpression]);
    const unwrap = (n: unknown): unknown => {
      let cur = n as { getKind?: () => number; getExpression?: () => unknown } | undefined;
      let guard = 0;
      while (cur && cur.getKind && PEEL.has(cur.getKind()) && cur.getExpression && guard++ < 10) {
        cur = cur.getExpression() as typeof cur;
      }
      return cur;
    };
    for (const f of project.getSourceFiles()) {
      try {
        for (const obj of f.getDescendantsOfKind(K.ObjectLiteralExpression)) {
          const o = obj as unknown as { getProperty?: (n: string) => { getInitializer?: () => unknown } | undefined };
          const provideVal = unwrap(o.getProperty?.('provide')?.getInitializer?.()) as { getText?: () => string } | undefined;
          if (provideVal?.getText?.() !== ownerTypeName) continue;
          const useValue = unwrap(o.getProperty?.('useValue')?.getInitializer?.()) as { getKind?: () => number; getSymbol?: () => { getValueDeclaration?: () => { getInitializer?: () => unknown } | undefined } | undefined } | undefined;
          if (useValue?.getKind?.() === K.ObjectLiteralExpression) renameKeyIn(useValue);
          else if (useValue?.getKind?.() === K.Identifier) {
            const vdecl = useValue.getSymbol?.()?.getValueDeclaration?.() as { getInitializer?: () => unknown; getNameNode?: () => unknown } | undefined;
            renameKeyIn(vdecl?.getInitializer?.());
            renameAccessesOfVar(vdecl?.getNameNode?.());
          }
          renameKeyIn(factoryObj(o.getProperty?.('useFactory')?.getInitializer?.()));
        }
        for (const v of f.getDescendantsOfKind(K.VariableDeclaration)) {
          const vd = v as unknown as { getTypeNode?: () => { getText?: () => string } | undefined; getInitializer?: () => unknown };
          const tn = vd.getTypeNode?.()?.getText?.() ?? '';
          if (tn !== ownerTypeName && !new RegExp(`\\b(?:Partial|Pick|Record|Mocked)\\s*<\\s*${ownerTypeName}\\b`).test(tn)) continue;
          const init = vd.getInitializer?.();
          if ((init as { getKind?: () => number } | undefined)?.getKind?.() === K.ObjectLiteralExpression) renameKeyIn(init);
          renameAccessesOfVar((v as unknown as { getNameNode?: () => unknown }).getNameNode?.());
        }
      } catch { /* never let coverage break the validated rename */ }
    }
  }

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

/**
 * Name-addressed cross-file rename: resolve a class/interface MEMBER by NAME
 * (no line/column) and delegate to renameSymbolCrossFile. Removes the coordinate
 * surface a weak model fumbles ("position N:M is not an identifier") and the
 * retry fragmentation that follows — the macro/intention form of the rename
 * operator. All coverage (test-double accesses, cast unwrap, all-or-nothing
 * validation) is inherited unchanged from renameSymbolCrossFile.
 */
export async function renameMemberCrossFile(
  absFile: string,
  repoRoot: string,
  className: string,
  memberName: string,
  newName: string,
): Promise<CrossFileRenameResult> {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) {
    throw new Error(`invalid identifier: ${JSON.stringify(newName)}`);
  }
  if (!TS_EXT.has(extOf(absFile))) {
    throw new Error(lspRequirementMessage(extToGrammar(extOf(absFile)) ?? extOf(absFile), 'rename_member'));
  }
  const { Project } = await import('ts-morph');
  const probe = new Project({ compilerOptions: { allowJs: true, noEmit: true } });
  const sf = probe.addSourceFileAtPath(absFile);
  const owner =
    (sf.getClass?.(className) as { getMembers?: () => unknown[] } | undefined) ??
    (sf.getInterface?.(className) as { getMembers?: () => unknown[] } | undefined);
  if (!owner) {
    throw new Error(`class/interface "${className}" not found in ${path.basename(absFile)}`);
  }
  let nameNode: { getStart?: () => number } | undefined;
  for (const m of owner.getMembers?.() ?? []) {
    const mm = m as { getName?: () => string | undefined; getNameNode?: () => unknown };
    if (mm.getName?.() === memberName) {
      nameNode = mm.getNameNode?.() as { getStart?: () => number } | undefined;
      break;
    }
  }
  if (!nameNode?.getStart) {
    throw new Error(`member "${memberName}" not found on ${className} in ${path.basename(absFile)}`);
  }
  const pos = sf.getLineAndColumnAtPos(nameNode.getStart());
  return renameSymbolCrossFile(absFile, repoRoot, pos.line, pos.column, newName);
}

export {
  addNamedImport,
  removeNamedImport,
  replacePropertyValue,
  renamePropertyKey,
  addAwaitToCall,
} from './advanced-imports.js';
export type { SemanticEditResult } from './advanced-imports.js';
