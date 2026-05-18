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
import type { Node, CallExpression, ObjectLiteralExpression } from 'ts-morph';
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
  /**
   * tooldev24 — Preservação Máxima com Mutação Mínima: for op='replace' this
   * is the minimal sub-range actually rewritten (byte offsets into the OLD
   * source), anchoring a byte-identical head/tail. Absent for insert_after /
   * remove (already minimal by construction — pure insertion / deletion).
   * `symbolLength` is the full resolved symbol size so callers can prove the
   * applied delta is << the whole symbol (the founding §6.1/§6.2 invariant).
   */
  changedSpan?: { start: number; end: number; oldLen: number; newLen: number };
  symbolLength?: number;
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
  let changedSpan: SymbolEditResult['changedSpan'];
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
    const cutStart = original.slice(lineStart, removalStart).trim() === '' ? lineStart : removalStart;
    let cutEnd = removalEnd;
    if (original[cutEnd] === '\n') cutEnd++;
    next = original.slice(0, cutStart) + original.slice(cutEnd);
  } else if (op === 'replace') {
    if (code == null) throw new Error(`op "replace" requires code`);
    // tooldev24 — Preservação Máxima com Mutação Mínima (§6.1 "não reescrever
    // se basta trocar", §6.2 "a prova visual deve mostrar só o que mudou"):
    // a localized change inside a symbol must NOT rewrite the whole node.
    // Diff the CURRENT symbol source against the requested new body at the
    // character level and splice ONLY the inner span that genuinely differs,
    // keeping the common head and tail as their ORIGINAL bytes. The resulting
    // file is byte-identical to a full-span replace (the common prefix/suffix
    // are equal by construction, so old[0:p]+new[p:n-s]+old[L-s:] === new),
    // but the persisted edit — hence git/trace/churn — is the true minimal
    // delta. Degenerate case (no common prefix/suffix) reduces exactly to the
    // previous full-span behaviour.
    const oldSymbolText = original.slice(start, end);
    const newSymbolText = reindent(code, indent);
    const oldLen = oldSymbolText.length;
    const newLen = newSymbolText.length;
    let p = 0;
    while (p < oldLen && p < newLen && oldSymbolText[p] === newSymbolText[p]) p++;
    let s = 0;
    while (
      s < oldLen - p &&
      s < newLen - p &&
      oldSymbolText[oldLen - 1 - s] === newSymbolText[newLen - 1 - s]
    ) {
      s++;
    }
    const editStart = start + p;
    const editEnd = end - s;
    const replacement = newSymbolText.slice(p, newLen - s);
    next = original.slice(0, editStart) + replacement + original.slice(editEnd);
    changedSpan = {
      start: editStart,
      end: editEnd,
      oldLen: editEnd - editStart,
      newLen: replacement.length,
    };
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
    changedSpan,
    symbolLength: end - start,
  };
}

export interface CrossFileRenameResult {
  symbol: string;
  /** repo-relative path -> new content (only files that changed) */
  changes: Map<string, string>;
  totalReferences: number;
  /** tooldev22: reference nodes actually renamed (definition + every true ref) */
  renamedRefs: number;
  /**
   * tooldev22: `name`-matching member accesses the engine deliberately did
   * NOT rename, with file:line + why. A DIFFERENT class's same-named member
   * still resolves and is correctly preserved → NOT listed. An entry here
   * means a true reference escaped coverage. Empty ⇒ ONE call sufficed.
   */
  residualUnresolved: { at: string; reason: string }[];
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
  // tooldev22: a tsconfig (esp. *.build.json) routinely EXCLUDES `*.spec.ts` /
  // `*.test.ts`, yet test call sites (incl. NestJS DI `module.get(Class)`
  // variables, statically typed as the class) are TRUE references. Build from
  // tsconfig for resolution fidelity, then WIDEN the project to the full
  // package source tree — tests INCLUDED — so findReferences() sees every
  // real reference and ONE call truly renames them all. Purely additive
  // (ts-morph dedupes already-loaded files); resolution stays type/binding-
  // precise because it is still driven by symbol/declaration identity below,
  // never by text.
  const pkgRoot = tsconfig ? path.dirname(tsconfig) : path.dirname(absFile);
  project.addSourceFilesAtPaths([
    path.join(pkgRoot, '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'),
    `!${path.join(pkgRoot, '**/node_modules/**')}`,
    `!${path.join(pkgRoot, '**/dist/**')}`,
    `!${path.join(pkgRoot, '**/build/**')}`,
    `!${path.join(pkgRoot, '**/.next/**')}`,
    `!${path.join(pkgRoot, '**/coverage/**')}`,
  ]);

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
  // Type/binding-precise reference set: findReferences resolves the SYMBOL of
  // the declaration (not text), so it never touches a string literal equal to
  // the name (e.g. an `@Get('overview')` route), a same-named member on a
  // DIFFERENT class, or unrelated identifiers/comments. With the spec/test
  // files now in the project, DI call sites resolve here as true references.
  let totalReferences = renameable
    .findReferences()
    .reduce((n, r) => n + r.getReferences().length, 0);

  renameable.rename(newName);

  // ── tooldev29: complete the cross-file reference set with the two UNIVERSAL
  //    Jest/CommonJS forms the TS language service cannot type-link — a
  //    `require()` / `await import()` / `requireActual()` destructuring binding
  //    (RHS is `any`, so the binding is NOT the export symbol) and a
  //    `jest.mock(spec, factory)` factory's returned object-literal KEY (a
  //    plain property, not the export symbol). STRICTLY module-specifier
  //    scoped: a binding/key is touched ONLY when the specifier resolves to the
  //    SAME source file that DECLARES the renamed symbol (relative + tsconfig
  //    paths, resolved exactly like td21/22) — never an unrelated same-named
  //    property, a string literal, or `describe('OLD')` prose. Deterministic
  //    range edits collected from the pre-mutation tree, then applied per file
  //    descending so offsets stay valid; ts-morph reparses so the existing
  //    all-or-nothing validate() pipeline still gates every write byte.
  const norm29 = (p: string): string => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  const declFiles = new Set<string>();
  for (const d of renameable.getSymbol()?.getDeclarations() ?? []) {
    const fp = d.getSourceFile().getFilePath();
    declFiles.add(fp);
    declFiles.add(norm29(fp));
  }
  {
    const fp = sf.getFilePath();
    declFiles.add(fp);
    declFiles.add(norm29(fp));
  }
  const compilerOptions29 = project.getCompilerOptions() as ts.CompilerOptions;
  const modResCache29 = ts.createModuleResolutionCache(
    repoRoot,
    (x) => x,
    compilerOptions29,
  );
  const EXT29 = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs'];
  const resolvesToDecl = (spec: string, containingFile: string): boolean => {
    if (!spec) return false;
    let resolved: string | undefined;
    try {
      resolved = ts.resolveModuleName(
        spec,
        containingFile,
        compilerOptions29,
        ts.sys,
        modResCache29,
      ).resolvedModule?.resolvedFileName;
    } catch {
      resolved = undefined;
    }
    if (!resolved && spec.startsWith('.')) {
      const base = path.resolve(path.dirname(containingFile), spec);
      const cands = [base];
      for (const e of EXT29) cands.push(base + e, path.join(base, `index${e}`));
      for (const c of cands) {
        try {
          if (fs.statSync(c).isFile()) {
            resolved = c;
            break;
          }
        } catch {
          /* keep looking */
        }
      }
    }
    if (!resolved) return false;
    return declFiles.has(resolved) || declFiles.has(norm29(resolved));
  };
  const litText29 = (n: Node | undefined): string | undefined => {
    if (!n) return undefined;
    const sl =
      n.asKind(ts.SyntaxKind.StringLiteral) ??
      n.asKind(ts.SyntaxKind.NoSubstitutionTemplateLiteral);
    return sl ? sl.getLiteralText() : undefined;
  };
  const requireLikeSpec = (call: CallExpression): string | undefined => {
    const e = call.getExpression();
    const k = e.getKind();
    let reqLike = false;
    if (
      k === ts.SyntaxKind.Identifier &&
      (e.getText() === 'require' || e.getText() === 'requireActual')
    ) {
      reqLike = true;
    } else if (k === ts.SyntaxKind.ImportKeyword) {
      reqLike = true;
    } else if (k === ts.SyntaxKind.PropertyAccessExpression) {
      const t = e.getText();
      if (
        t === 'jest.requireActual' ||
        t === 'jest.requireMock' ||
        t === 'require.requireActual'
      ) {
        reqLike = true;
      }
    }
    if (!reqLike) return undefined;
    return litText29(call.getArguments()[0]);
  };
  type Range29 = { start: number; end: number; text: string };
  const edits29 = new Map<string, Map<number, Range29>>();
  const addEdit29 = (file: string, start: number, end: number, t: string): boolean => {
    let m = edits29.get(file);
    if (!m) {
      m = new Map();
      edits29.set(file, m);
    }
    if (m.has(start)) return false;
    m.set(start, { start, end, text: t });
    return true;
  };
  let extraRenamed = 0;
  for (const f of project.getSourceFiles()) {
    const fpath = f.getFilePath();
    if (!f.getFullText().includes(oldName)) continue;
    // (1) require / dynamic import / requireActual destructuring binding
    for (const vd of f.getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration)) {
      const nameNode = vd.getNameNode();
      if (nameNode.getKind() !== ts.SyntaxKind.ObjectBindingPattern) continue;
      let init = vd.getInitializer();
      if (init && init.getKind() === ts.SyntaxKind.AwaitExpression) {
        init = init.asKindOrThrow(ts.SyntaxKind.AwaitExpression).getExpression();
      }
      if (!init || init.getKind() !== ts.SyntaxKind.CallExpression) continue;
      const spec = requireLikeSpec(init.asKindOrThrow(ts.SyntaxKind.CallExpression));
      if (spec === undefined || !resolvesToDecl(spec, fpath)) continue;
      for (const be of nameNode
        .asKindOrThrow(ts.SyntaxKind.ObjectBindingPattern)
        .getElements()) {
        const pn = be.getPropertyNameNode();
        if (pn) {
          // `{ OLD: alias }` — rename ONLY the export key, keep the alias.
          if (pn.getText() === oldName) {
            addEdit29(fpath, pn.getStart(), pn.getEnd(), newName);
            extraRenamed++;
          }
        } else {
          // shorthand `{ OLD }` — rename the local binding AND every in-file
          // use (incl. `jest.mocked(OLD)` / `OLD(...)`) → `{ NEW }`.
          const nm = be.getNameNode();
          if (
            nm.getKind() === ts.SyntaxKind.Identifier &&
            nm.getText() === oldName
          ) {
            const idn = nm.asKindOrThrow(ts.SyntaxKind.Identifier);
            for (const rn of idn.findReferencesAsNodes()) {
              addEdit29(
                rn.getSourceFile().getFilePath(),
                rn.getStart(),
                rn.getEnd(),
                newName,
              );
            }
            addEdit29(fpath, idn.getStart(), idn.getEnd(), newName);
            extraRenamed++;
          }
        }
      }
    }
    // (2) jest.mock / jest.doMock factory returned object-literal key
    for (const call of f.getDescendantsOfKind(ts.SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (expr.getKind() !== ts.SyntaxKind.PropertyAccessExpression) continue;
      const pae = expr.asKindOrThrow(ts.SyntaxKind.PropertyAccessExpression);
      if (pae.getExpression().getText() !== 'jest') continue;
      const meth = pae.getNameNode().getText();
      if (meth !== 'mock' && meth !== 'doMock') continue;
      const args = call.getArguments();
      if (args.length < 2) continue;
      const spec = litText29(args[0]);
      if (spec === undefined || !resolvesToDecl(spec, fpath)) continue;
      const objs: ObjectLiteralExpression[] = [];
      const collect = (n: Node | undefined): void => {
        if (!n) return;
        if (n.getKind() === ts.SyntaxKind.ParenthesizedExpression) {
          collect(
            n.asKindOrThrow(ts.SyntaxKind.ParenthesizedExpression).getExpression(),
          );
          return;
        }
        if (n.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
          objs.push(n.asKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression));
          return;
        }
        if (n.getKind() === ts.SyntaxKind.ArrowFunction) {
          collect(n.asKindOrThrow(ts.SyntaxKind.ArrowFunction).getBody());
          return;
        }
        if (n.getKind() === ts.SyntaxKind.FunctionExpression) {
          const body = n.asKindOrThrow(ts.SyntaxKind.FunctionExpression).getBody();
          if (body) {
            for (const ret of body.getDescendantsOfKind(
              ts.SyntaxKind.ReturnStatement,
            )) {
              collect(ret.getExpression());
            }
          }
          return;
        }
        if (n.getKind() === ts.SyntaxKind.Block) {
          for (const ret of n.getDescendantsOfKind(ts.SyntaxKind.ReturnStatement)) {
            collect(ret.getExpression());
          }
        }
      };
      collect(args[1]);
      for (const ol of objs) {
        for (const prop of ol.getProperties()) {
          if (prop.getKind() === ts.SyntaxKind.PropertyAssignment) {
            const nn = prop
              .asKindOrThrow(ts.SyntaxKind.PropertyAssignment)
              .getNameNode();
            if (nn.getKind() === ts.SyntaxKind.Identifier && nn.getText() === oldName) {
              addEdit29(fpath, nn.getStart(), nn.getEnd(), newName);
              extraRenamed++;
            } else if (
              nn.getKind() === ts.SyntaxKind.StringLiteral &&
              nn.asKindOrThrow(ts.SyntaxKind.StringLiteral).getLiteralText() ===
                oldName
            ) {
              const q = nn.getText().trim()[0];
              addEdit29(fpath, nn.getStart(), nn.getEnd(), `${q}${newName}${q}`);
              extraRenamed++;
            }
          } else if (prop.getKind() === ts.SyntaxKind.ShorthandPropertyAssignment) {
            const snn = prop
              .asKindOrThrow(ts.SyntaxKind.ShorthandPropertyAssignment)
              .getNameNode();
            if (snn.getText() === oldName) {
              // `{ OLD }` → `{ NEW }`
              addEdit29(fpath, snn.getStart(), snn.getEnd(), newName);
              extraRenamed++;
            }
          }
        }
      }
    }
  }
  // ── tooldev32: complete the cross-file reference set with the UNIVERSAL
  //    NestJS DI provider-mock form the TS language service cannot type-link.
  //    `Test.createTestingModule({ providers: [{ provide: AuditService,
  //    useValue: { log: jest.fn() } }] })` — the mock object's KEY is a plain
  //    object property (NOT the class method symbol), `useFactory: () => ({
  //    log: jest.fn() })` returns one, and `const m = { log: … }; { provide:
  //    AuditService, useValue: m }` binds one indirectly. STRICTLY token-
  //    scoped: a key/usage is touched ONLY when the provider's `provide:`
  //    token resolves (ts-morph symbol, alias-followed exactly like td21/22)
  //    to the SAME class declaration that DECLARES the renamed member — never
  //    an unrelated same-named key on a different provider, `console.log`,
  //    `logger.log`, a string literal, or `describe('OLD')` prose. Edits flow
  //    through the SAME edits29 range map so the existing all-or-nothing
  //    validate() pipeline still gates every write byte.
  const ownerKey32 = (n: Node): string =>
    `${n.getSourceFile().getFilePath()}|${n.getStart()}`;
  const classDeclsOf32 = (n: Node): Node[] => {
    const out: Node[] = [];
    let sym;
    try {
      sym = n.getSymbol();
    } catch {
      sym = undefined;
    }
    if (!sym) return out;
    const syms = [sym];
    try {
      const al = sym.getAliasedSymbol?.();
      if (al) syms.push(al);
    } catch {
      /* not an alias */
    }
    for (const s of syms) {
      for (const d of s.getDeclarations() ?? []) {
        if (
          d.getKind() === ts.SyntaxKind.ClassDeclaration ||
          d.getKind() === ts.SyntaxKind.ClassExpression
        ) {
          out.push(d);
        } else {
          const c =
            d.getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration) ??
            d.getFirstAncestorByKind(ts.SyntaxKind.ClassExpression);
          if (c) out.push(c);
        }
      }
    }
    return out;
  };
  const ownerClassKeys32 = new Set<string>();
  for (const d of renameable.getSymbol()?.getDeclarations() ?? []) {
    const c =
      d.getKind() === ts.SyntaxKind.ClassDeclaration ||
      d.getKind() === ts.SyntaxKind.ClassExpression
        ? d
        : d.getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration) ??
          d.getFirstAncestorByKind(ts.SyntaxKind.ClassExpression);
    if (c) ownerClassKeys32.add(ownerKey32(c));
  }
  const unwrap32 = (n: Node): Node => {
    let v = n;
    while (
      v.getKind() === ts.SyntaxKind.ParenthesizedExpression ||
      v.getKind() === ts.SyntaxKind.AsExpression
    ) {
      v =
        v.getKind() === ts.SyntaxKind.ParenthesizedExpression
          ? v.asKindOrThrow(ts.SyntaxKind.ParenthesizedExpression).getExpression()
          : v.asKindOrThrow(ts.SyntaxKind.AsExpression).getExpression();
    }
    return v;
  };
  const tokenResolvesToOwner32 = (provideVal: Node): boolean => {
    if (ownerClassKeys32.size === 0) return false;
    for (const c of classDeclsOf32(unwrap32(provideVal))) {
      if (ownerClassKeys32.has(ownerKey32(c))) return true;
    }
    return false;
  };
  const renameObjLitKey32 = (ol: ObjectLiteralExpression, fp: string): void => {
    for (const prop of ol.getProperties()) {
      const pk = prop.getKind();
      if (pk === ts.SyntaxKind.PropertyAssignment) {
        const nn = prop
          .asKindOrThrow(ts.SyntaxKind.PropertyAssignment)
          .getNameNode();
        if (nn.getKind() === ts.SyntaxKind.Identifier && nn.getText() === oldName) {
          if (addEdit29(fp, nn.getStart(), nn.getEnd(), newName)) extraRenamed++;
        } else if (
          nn.getKind() === ts.SyntaxKind.StringLiteral &&
          nn.asKindOrThrow(ts.SyntaxKind.StringLiteral).getLiteralText() ===
            oldName
        ) {
          const q = nn.getText().trim()[0];
          if (addEdit29(fp, nn.getStart(), nn.getEnd(), `${q}${newName}${q}`))
            extraRenamed++;
        }
      } else if (pk === ts.SyntaxKind.ShorthandPropertyAssignment) {
        const snn = prop
          .asKindOrThrow(ts.SyntaxKind.ShorthandPropertyAssignment)
          .getNameNode();
        if (snn.getText() === oldName) {
          if (addEdit29(fp, snn.getStart(), snn.getEnd(), newName)) extraRenamed++;
        }
      } else if (pk === ts.SyntaxKind.MethodDeclaration) {
        const nn = prop
          .asKindOrThrow(ts.SyntaxKind.MethodDeclaration)
          .getNameNode();
        if (nn.getText() === oldName) {
          if (addEdit29(fp, nn.getStart(), nn.getEnd(), newName)) extraRenamed++;
        }
      }
    }
  };
  const collectObjs32 = (
    n: Node | undefined,
    out: ObjectLiteralExpression[],
  ): void => {
    if (!n) return;
    const k = n.getKind();
    if (k === ts.SyntaxKind.ParenthesizedExpression) {
      collectObjs32(
        n.asKindOrThrow(ts.SyntaxKind.ParenthesizedExpression).getExpression(),
        out,
      );
      return;
    }
    if (k === ts.SyntaxKind.AsExpression) {
      collectObjs32(
        n.asKindOrThrow(ts.SyntaxKind.AsExpression).getExpression(),
        out,
      );
      return;
    }
    if (k === ts.SyntaxKind.ObjectLiteralExpression) {
      out.push(n.asKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression));
      return;
    }
    if (k === ts.SyntaxKind.ArrowFunction) {
      collectObjs32(n.asKindOrThrow(ts.SyntaxKind.ArrowFunction).getBody(), out);
      return;
    }
    if (
      k === ts.SyntaxKind.FunctionExpression ||
      k === ts.SyntaxKind.MethodDeclaration
    ) {
      const body =
        k === ts.SyntaxKind.FunctionExpression
          ? n.asKindOrThrow(ts.SyntaxKind.FunctionExpression).getBody()
          : n.asKindOrThrow(ts.SyntaxKind.MethodDeclaration).getBody();
      if (body) {
        for (const ret of body.getDescendantsOfKind(
          ts.SyntaxKind.ReturnStatement,
        )) {
          collectObjs32(ret.getExpression(), out);
        }
      }
      return;
    }
    if (k === ts.SyntaxKind.Block) {
      for (const ret of n.getDescendantsOfKind(ts.SyntaxKind.ReturnStatement)) {
        collectObjs32(ret.getExpression(), out);
      }
    }
  };
  const handleUseValue32 = (val: Node, fp: string): void => {
    const v = unwrap32(val);
    if (v.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
      renameObjLitKey32(
        v.asKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression),
        fp,
      );
      return;
    }
    if (v.getKind() === ts.SyntaxKind.Identifier) {
      const idn = v.asKindOrThrow(ts.SyntaxKind.Identifier);
      let sym;
      try {
        sym = idn.getSymbol();
      } catch {
        sym = undefined;
      }
      for (const d of sym?.getDeclarations() ?? []) {
        if (d.getKind() !== ts.SyntaxKind.VariableDeclaration) continue;
        const rawInit = d
          .asKindOrThrow(ts.SyntaxKind.VariableDeclaration)
          .getInitializer();
        const init: Node | undefined = rawInit
          ? unwrap32(rawInit)
          : undefined;
        if (!init || init.getKind() !== ts.SyntaxKind.ObjectLiteralExpression)
          continue;
        renameObjLitKey32(
          init.asKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression),
          d.getSourceFile().getFilePath(),
        );
        // also rename `m.OLD` member-access uses bound to this variable.
        for (const rn of idn.findReferencesAsNodes()) {
          const par = rn.getParent();
          if (
            par &&
            par.getKind() === ts.SyntaxKind.PropertyAccessExpression
          ) {
            const pae = par.asKindOrThrow(
              ts.SyntaxKind.PropertyAccessExpression,
            );
            const exp = pae.getExpression();
            if (
              exp.getSourceFile().getFilePath() ===
                rn.getSourceFile().getFilePath() &&
              exp.getStart() === rn.getStart() &&
              pae.getNameNode().getText() === oldName
            ) {
              const nm = pae.getNameNode();
              if (
                addEdit29(
                  rn.getSourceFile().getFilePath(),
                  nm.getStart(),
                  nm.getEnd(),
                  newName,
                )
              )
                extraRenamed++;
            }
          }
        }
      }
    }
  };
  for (const f of project.getSourceFiles()) {
    const fpath = f.getFilePath();
    if (!f.getFullText().includes(oldName)) continue;
    for (const ol of f.getDescendantsOfKind(
      ts.SyntaxKind.ObjectLiteralExpression,
    )) {
      const provideProp = ol.getProperty('provide');
      if (
        !provideProp ||
        provideProp.getKind() !== ts.SyntaxKind.PropertyAssignment
      )
        continue;
      const provideVal = provideProp
        .asKindOrThrow(ts.SyntaxKind.PropertyAssignment)
        .getInitializer();
      if (!provideVal || !tokenResolvesToOwner32(provideVal)) continue;
      const uvProp = ol.getProperty('useValue');
      if (uvProp && uvProp.getKind() === ts.SyntaxKind.PropertyAssignment) {
        const uv = uvProp
          .asKindOrThrow(ts.SyntaxKind.PropertyAssignment)
          .getInitializer();
        if (uv) handleUseValue32(uv, fpath);
      }
      const ufProp = ol.getProperty('useFactory');
      if (ufProp) {
        let factoryNode: Node | undefined;
        if (ufProp.getKind() === ts.SyntaxKind.PropertyAssignment) {
          factoryNode = ufProp
            .asKindOrThrow(ts.SyntaxKind.PropertyAssignment)
            .getInitializer();
        } else if (ufProp.getKind() === ts.SyntaxKind.MethodDeclaration) {
          factoryNode = ufProp;
        }
        if (factoryNode) {
          const objs32: ObjectLiteralExpression[] = [];
          collectObjs32(factoryNode, objs32);
          for (const o of objs32) renameObjLitKey32(o, fpath);
        }
      }
    }
  }

  for (const [fpath, m] of edits29) {
    const tgt = project.getSourceFile(fpath);
    if (!tgt) continue;
    const ranges = [...m.values()].sort((a, b) => b.start - a.start);
    for (const r of ranges) tgt.replaceText([r.start, r.end], r.text);
  }
  totalReferences += extraRenamed;

  // tooldev22 residual proof. After the rename, scan the SAME widened project
  // for any surviving member access `.oldName`. One that still resolves to a
  // real declaration is a DIFFERENT same-named member (correctly preserved —
  // NOT residual). One whose name node no longer resolves to ANY declaration
  // is a true reference the rename failed to cover (e.g. a file that escaped
  // project scope) and is reported with file:line + why. Empty ⇒ ONE call
  // covered every true reference. Pre-filtered by a cheap text test so this
  // stays O(files-mentioning-name), not O(whole package).
  const residualUnresolved: CrossFileRenameResult['residualUnresolved'] = [];
  for (const f of project.getSourceFiles()) {
    if (!f.getFullText().includes(oldName)) continue;
    for (const pae of f.getDescendantsOfKind(ts.SyntaxKind.PropertyAccessExpression)) {
      const nn = pae.getNameNode();
      if (nn.getText() !== oldName) continue;
      let resolved = false;
      try {
        resolved = (nn.getSymbol()?.getDeclarations().length ?? 0) > 0;
      } catch {
        resolved = false;
      }
      if (resolved) continue;
      const lc = f.getLineAndColumnAtPos(nn.getStart());
      const rel = path.relative(repoRoot, f.getFilePath()).split(path.sep).join('/');
      residualUnresolved.push({
        at: `${rel}:${lc.line}`,
        reason:
          `unresolved member access '.${oldName}' survived the rename — ` +
          'a true reference the engine could not AST-resolve (out of project scope?)',
      });
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
  return {
    symbol: `${oldName} -> ${newName}`,
    changes,
    totalReferences,
    renamedRefs: totalReferences,
    residualUnresolved,
    validations,
  };
}

// ── v3: import + object-property semantic ops (adopted from Codex's
//        semantic-edit, but routed through validate()+atomic write so they
//        cannot persist broken code, unlike the original). ───────────────────

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

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
        (ni) => ni.getName() === name && (ni.getAliasNode()?.getText() ?? ni.getName()) === local,
      );
    if (exists) {
      return {
        newText: original,
        validation: validate(file, original, original),
        detail: { action: 'already-present', moduleSpecifier, name },
      };
    }
  }
  const action = decls.length === 0 ? 'created-declaration' : 'added-specifier';
  return guardedMutation(
    file,
    original,
    { action, moduleSpecifier, name, alias: alias ?? null },
    () => {
      if (decls.length === 0) {
        sf.addImportDeclaration({
          moduleSpecifier,
          namedImports: [alias ? { name, alias } : { name }],
        });
      } else {
        decls[0].addNamedImport(alias ? { name, alias } : { name });
      }
      return sf.getFullText();
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
