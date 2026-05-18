/**
 * move.ts — symbol RELOCATION operators.
 *
 * Princípio da Ação Atômica, topologies #11 (identity preserved, position
 * modified) and #14 (API preserved, implementation moved). The model passes
 * ONLY names + paths; the server reads the symbol body, the imports that
 * symbol needs, deletes it surgically from the origin, (re)creates or appends
 * it in the target, and — when asked — leaves an `export { sym } from './to'`
 * so the public API stays byte-stable. The proven compose-paralysis (the
 * model re-emitting whole file bodies as tool arguments) is eliminated: a
 * decomposition step becomes one cheap call carrying no file content.
 *
 * Reuses the existing engine: validate() for no-syntax-regression, the
 * resolveSymbol() addressing grammar, ts-morph for structural surgery. The
 * caller (server.ts) wraps the two-file write in the same atomic-write +
 * rollback + char-level-trace pipeline every other op uses.
 */

import * as path from 'node:path';
import * as ts from 'typescript';
import { validate, type ValidationResult } from './engine.js';
import { resolveSymbol } from './symbols.js';

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

function assertTs(file: string, op: string): void {
  const i = file.lastIndexOf('.');
  const ext = i < 0 ? '' : file.slice(i).toLowerCase();
  if (!TS_EXT.has(ext)) throw new Error(`${op} only supports TS/JS files, got ${ext || '(none)'}`);
}

async function tsmSource(file: string, text: string) {
  const { Project } = await import('ts-morph');
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  return project.createSourceFile(file, text, { overwrite: true });
}

/** Relative ESM specifier from one repo-relative file to another, extensionless. */
function moduleSpecifier(fromRel: string, toRel: string): string {
  const fromPosix = fromRel.split(path.sep).join('/');
  const toPosix = toRel
    .split(path.sep)
    .join('/')
    .replace(/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i, '');
  let spec = path.posix.relative(path.posix.dirname(fromPosix), toPosix);
  if (!spec.startsWith('.')) spec = `./${spec}`;
  return spec;
}

interface ImportStruct {
  moduleSpecifier: string;
  isTypeOnly: boolean;
  defaultImport?: string;
  namespaceImport?: string;
  namedImports: { name: string; alias?: string }[];
}

export interface MoveFileChange {
  relPath: string;
  before: string;
  after: string;
  validation: ValidationResult;
  created: boolean;
}

export interface MoveSymbolResult {
  symbol: string;
  movedText: string;
  from: MoveFileChange;
  to: MoveFileChange;
  /** module specifiers carried into the target so the symbol still resolves */
  neededImports: string[];
  /** origin-local exported names re-imported into the target */
  backImports: string[];
  leftReExport: boolean;
  /** true when the trimmed origin still used the moved name and a single
   *  consolidated `import { name } from './to'` was auto-added back. */
  originBackImportAdded: boolean;
  /** the moved names the origin still references (exactly what was auto-rewired);
   *  empty ⇒ origin needed nothing ⇒ caller is DONE with zero cleanup. */
  originStillReferences: string[];
}

// ── Princípio da Ação Atômica topologies #11/#12/#13/#14 — class-method
// EXTRACTION. The dominant real shape in a NestJS backend is a service CLASS,
// so a god-file is decomposed by extracting METHODS, not top-level symbols.
// We turn each method into an API-PRESERVING free function: the public class
// surface (method name + signature + decorators + visibility) is byte-stable;
// only the implementation moves. The origin method becomes a thin delegation
// `return helper(this, ...args)`. Conservative: any case where delegation
// could alter behavior is REFUSED with a precise, self-correcting message so
// the model fixes it in ONE follow-up instead of dead-ending.

const FN_REBINDERS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'MethodDeclaration',
  'Constructor',
  'GetAccessor',
  'SetAccessor',
]);

/** Top-level + imported binding names already declared in the target module
 *  (so an extracted helper never shadows or collides). */
async function topLevelNames(file: string, text: string): Promise<Set<string>> {
  const s = new Set<string>();
  if (!text.trim()) return s;
  const sf2 = await tsmSource(file, text);
  for (const f of sf2.getFunctions()) { const n = f.getName(); if (n) s.add(n); }
  for (const c of sf2.getClasses()) { const n = c.getName(); if (n) s.add(n); }
  for (const i of sf2.getInterfaces()) s.add(i.getName());
  for (const t of sf2.getTypeAliases()) s.add(t.getName());
  for (const e of sf2.getEnums()) s.add(e.getName());
  for (const v of sf2.getVariableDeclarations()) s.add(v.getName());
  for (const d of sf2.getImportDeclarations()) {
    const di = d.getDefaultImport()?.getText();
    if (di) s.add(di);
    const ns = d.getNamespaceImport()?.getText();
    if (ns) s.add(ns);
    for (const ni of d.getNamedImports()) s.add(ni.getAliasNode()?.getText() ?? ni.getName());
  }
  return s;
}

/**
 * Rewrite `this` -> `self` for exactly the `this` occurrences that bind to the
 * extracted member's instance. A `this` re-bound by a nested non-arrow
 * function/method is LEFT untouched (it is that inner function's `this`, not
 * the instance) — this is what makes the extraction behavior-preserving.
 * Also reports which `this.<member>` names + ES #private fields were touched
 * so the caller can refuse on private/protected cross-module access.
 */
async function rewriteThisToSelf(bodyText: string): Promise<{
  text: string;
  usedThis: boolean;
  thisMembers: Set<string>;
  privateIdentifierUsed: boolean;
}> {
  const prefix = 'function __h__()';
  const scratch = await tsmSource('__atomic_self__.ts', `${prefix}${bodyText}`);
  const root = scratch.getFunctions()[0];
  const thisMembers = new Set<string>();
  let privateIdentifierUsed = false;
  const edits: { start: number; end: number }[] = [];
  for (const tn of root.getDescendantsOfKind(ts.SyntaxKind.ThisKeyword)) {
    let a: unknown = tn.getParent();
    let rebound = false;
    while (a && a !== root) {
      const node = a as { getKindName: () => string; getParent: () => unknown };
      const ak = node.getKindName();
      if (ak === 'ArrowFunction') {
        a = node.getParent();
        continue;
      }
      if (FN_REBINDERS.has(ak)) {
        rebound = true;
        break;
      }
      a = node.getParent();
    }
    if (rebound) continue;
    const p = tn.getParent();
    if (p && p.getKindName() === 'PropertyAccessExpression') {
      const nn = (p as unknown as {
        getNameNode: () => { getKindName: () => string; getText: () => string };
      }).getNameNode();
      if (nn.getKindName() === 'PrivateIdentifier') privateIdentifierUsed = true;
      else thisMembers.add(nn.getText());
    }
    edits.push({ start: tn.getStart(), end: tn.getEnd() });
  }
  let out = `${prefix}${bodyText}`;
  edits.sort((x, y) => y.start - x.start);
  for (const e of edits) out = out.slice(0, e.start) + 'self' + out.slice(e.end);
  return {
    text: out.slice(prefix.length),
    usedThis: edits.length > 0,
    thisMembers,
    privateIdentifierUsed,
  };
}

interface MethodExtraction {
  helperName: string;
  helperText: string;
  usedThis: boolean;
  className: string;
  /** mutate the origin node IN PLACE into a thin behavior-preserving
   *  delegation; the public signature/decorators/visibility stay byte-stable. */
  applyDelegation: () => void;
}

/**
 * Turn a class METHOD (or arrow/function-expression PROPERTY) into a top-level
 * exported helper, API-preserving. Throws a PRECISE, self-correcting Error
 * (never the generic "nested" message) for every case where relocation could
 * change behavior — so the single residual editFailure becomes an actionable
 * one-follow-up steer instead of a dead end.
 */
async function extractClassMember(opts: {
  node: import('ts-morph').Node;
  classDecl: import('ts-morph').ClassDeclaration;
  selector: string;
  fromRel: string;
  toRel: string;
  toBefore: string;
}): Promise<MethodExtraction> {
  const { node, classDecl, selector, fromRel, toRel, toBefore } = opts;
  // A/B TOOLDEV16: the extractability decision is now ONE pure predicate
  // (analyzeClassMethodExtraction) shared verbatim with the god-class
  // planner (canExtractClassMethod). The guard and the planner can NEVER
  // diverge — both run the SAME analysis. A refusal here throws (the
  // relocation pipeline expects an Error and a precise self-correcting
  // message); the planner maps the SAME verdict to a skip.
  const v = await analyzeClassMethodExtraction({
    node,
    classDecl,
    selector,
    crossModule: toRel !== fromRel,
  });
  if (!v.ok)
    throw new Error(
      `${v.reason} Keep this member in the origin class, or use ` +
        `atomic_edit_symbol for a surgical in-place change (no relocation).`,
    );
  const {
    memberName,
    className,
    params,
    typeParams,
    returnTypeNode,
    isAsync,
    isStatic,
    memberShape,
    self,
    usedThis,
  } = v;

  const taken = await topLevelNames(toRel, toBefore);
  const pascal = memberName.charAt(0).toUpperCase() + memberName.slice(1);
  let helperName = memberName;
  if (taken.has(helperName)) helperName = `${className}${pascal}`;
  let n = 2;
  while (taken.has(helperName)) helperName = `${className}${pascal}${n++}`;

  const tp = typeParams.length
    ? `<${typeParams.map((t) => t.getText()).join(', ')}>`
    : '';
  const sig: string[] = [];
  if (usedThis && !isStatic) sig.push(`self: ${className}`);
  for (const p of params) sig.push(p.getText());
  const rt = returnTypeNode ? `: ${returnTypeNode.getText()}` : '';
  const helperText =
    `export ${isAsync ? 'async ' : ''}function ${helperName}${tp}(${sig.join(', ')})${rt} ${self.text}`;

  const callArgs: string[] = [];
  if (usedThis && !isStatic) callArgs.push('this');
  for (const p of params) {
    const nm = p.getName();
    callArgs.push(p.isRestParameter() ? `...${nm}` : nm);
  }
  const call = `${helperName}(${callArgs.join(', ')})`;
  const applyDelegation = (): void => {
    if (memberShape === 'method') {
      (node as unknown as { setBodyText: (t: string) => void }).setBodyText(
        `return ${call};`,
      );
      return;
    }
    const origParams = params.map((p) => p.getText()).join(', ');
    const pd = node as unknown as { setInitializer: (t: string) => void };
    pd.setInitializer(
      memberShape === 'arrow'
        ? `${isAsync ? 'async ' : ''}(${origParams}) => ${call}`
        : `${isAsync ? 'async ' : ''}function (${origParams}) { return ${call}; }`,
    );
  };

  return { helperName, helperText, usedThis, className, applyDelegation };
}


/**
 * A/B TOOLDEV16 — the SINGLE source of extractability truth.
 *
 * Every `refuse(...)` condition that {@link extractClassMember} used to throw
 * inline now lives here, as ONE pure, side-effect-free, READ-ONLY analysis
 * (no writes, no node mutation — `applyDelegation` and the origin rewrite are
 * built/run by the caller). `extractClassMember` (the real relocation path)
 * and `canExtractClassMethod` (the god-class planner) BOTH call this, so the
 * tooldev12 guard and the planner can never disagree about which methods are
 * safely extractable. Returns the derived shape on success so the caller does
 * not re-parse.
 */
type ClassMethodExtractAnalysis =
  | { ok: false; reason: string }
  | {
      ok: true;
      memberName: string;
      className: string;
      params: import('ts-morph').ParameterDeclaration[];
      typeParams: import('ts-morph').TypeParameterDeclaration[];
      returnTypeNode: import('ts-morph').Node | undefined;
      isAsync: boolean;
      isStatic: boolean;
      memberShape: 'method' | 'arrow' | 'fnexpr';
      self: {
        text: string;
        usedThis: boolean;
        thisMembers: Set<string>;
        privateIdentifierUsed: boolean;
      };
      usedThis: boolean;
    };

async function analyzeClassMethodExtraction(opts: {
  node: import('ts-morph').Node;
  classDecl: import('ts-morph').ClassDeclaration;
  selector: string;
  /** true when the helper would land in a DIFFERENT module than the origin
   *  (the only case that cannot reach private/protected members). The planner
   *  always extracts to a sibling, so it passes true. */
  crossModule: boolean;
}): Promise<ClassMethodExtractAnalysis> {
  const { node, classDecl, selector, crossModule } = opts;
  const kind = node.getKindName();
  const memberName =
    (node as unknown as { getName?: () => string }).getName?.() ??
    (selector.split(/::|\./).pop() as string);
  const bail = (msg: string): { ok: false; reason: string } => ({
    ok: false,
    reason: `atomic move cannot safely extract "${selector}": ${msg}`,
  });

  const className = classDecl.getName();
  if (!className)
    return bail('its enclosing class is anonymous (cannot type the extracted `self`).');

  if (kind === 'Constructor' || kind === 'GetAccessor' || kind === 'SetAccessor')
    return bail('constructors and get/set accessors are out of scope.');

  let params!: import('ts-morph').ParameterDeclaration[];
  let typeParams: import('ts-morph').TypeParameterDeclaration[] = [];
  let returnTypeNode: import('ts-morph').Node | undefined;
  let isAsync = false;
  let isStatic = false;
  let rawBodyText!: string;
  let memberShape!: 'method' | 'arrow' | 'fnexpr';

  type Fnish = {
    getParameters: () => import('ts-morph').ParameterDeclaration[];
    getTypeParameters: () => import('ts-morph').TypeParameterDeclaration[];
    getReturnTypeNode: () => import('ts-morph').Node | undefined;
    isAsync?: () => boolean;
    isGenerator?: () => boolean;
    isAbstract?: () => boolean;
    isStatic?: () => boolean;
    getBody?: () => import('ts-morph').Node | undefined;
    getInitializer?: () => import('ts-morph').Node | undefined;
  };

  if (kind === 'MethodDeclaration') {
    const m = node as unknown as Fnish;
    if (m.isAbstract?.()) return bail('it is abstract (no body to move).');
    const body = m.getBody?.();
    if (!body) return bail('it has no body (overload signature / abstract).');
    if (m.isGenerator?.())
      return bail('generator methods need `yield*` delegation (out of scope).');
    params = m.getParameters();
    typeParams = m.getTypeParameters();
    returnTypeNode = m.getReturnTypeNode();
    isAsync = m.isAsync?.() === true;
    isStatic = m.isStatic?.() === true;
    rawBodyText = (body as { getText: () => string }).getText();
    memberShape = 'method';
  } else if (kind === 'PropertyDeclaration') {
    const pd = node as unknown as Fnish;
    const init = pd.getInitializer?.() as
      | (Fnish & { getKindName: () => string })
      | undefined;
    const ik = init?.getKindName();
    if (ik === 'ArrowFunction') {
      isAsync = init!.isAsync?.() === true;
      params = init!.getParameters();
      typeParams = init!.getTypeParameters();
      returnTypeNode = init!.getReturnTypeNode();
      const ab = init!.getBody?.() as { getKindName: () => string; getText: () => string };
      rawBodyText =
        ab.getKindName() === 'Block' ? ab.getText() : `{ return ${ab.getText()}; }`;
      memberShape = 'arrow';
    } else if (ik === 'FunctionExpression') {
      isAsync = init!.isAsync?.() === true;
      if (init!.isGenerator?.())
        return bail('generator function-property needs `yield*` delegation (out of scope).');
      params = init!.getParameters();
      typeParams = init!.getTypeParameters();
      returnTypeNode = init!.getReturnTypeNode();
      const fb = init!.getBody?.() as { getText: () => string } | undefined;
      if (!fb) return bail('the function-expression property has no body.');
      rawBodyText = fb!.getText();
      memberShape = 'fnexpr';
    } else {
      return bail('it is a data property, not a method/arrow — not extractable as a function.');
    }
    isStatic = (node as unknown as Fnish).isStatic?.() === true;
  } else {
    return bail(`unsupported member kind ${kind}.`);
  }

  if (params.length && params[0].getName() === 'this')
    return bail('it declares an explicit `this` parameter.');
  for (const p of params) {
    if (p.getDecorators().length)
      return bail(
        `parameter "${p.getName() || '?'}" has a decorator (only valid inside a class).`,
      );
    const nk = p.getNameNode().getKindName();
    if (nk === 'ObjectBindingPattern' || nk === 'ArrayBindingPattern' || !p.getName())
      return bail('it has a destructuring parameter (cannot be forwarded by name).');
  }
  if (returnTypeNode) {
    const rt = returnTypeNode.getText();
    if (/(^|[^.\w])this([^\w]|$)/.test(rt))
      return bail('its return type is the polymorphic `this` type.');
  }
  const superScratch = await tsmSource('__atomic_super__.ts', `function __s__()${rawBodyText}`);
  if (
    superScratch.getFunctions()[0].getDescendantsOfKind(ts.SyntaxKind.SuperKeyword)
      .length > 0
  )
    return bail('it references `super` (only valid inside a class).');

  const self = await rewriteThisToSelf(rawBodyText);
  const usedThis = self.usedThis;

  if (isStatic && usedThis)
    return bail(
      'it is `static` and references `this` (= the class itself); extraction ' +
        'would change its meaning.',
    );
  if (usedThis && !classDecl.isExported())
    return bail(
      `class ${className} is not exported, so a cross-module helper cannot type ` +
        `its \`self: ${className}\` parameter (export the class first).`,
    );
  if (usedThis) {
    const scopeOf = (nm: string): string | undefined => {
      for (const mem of classDecl.getMembers()) {
        const g = mem as unknown as {
          getName?: () => string;
          getScope?: () => string;
        };
        if (g.getName?.() === nm && typeof g.getScope === 'function') return g.getScope();
      }
      const ctor = classDecl.getConstructors()[0];
      const pp = ctor?.getParameters().find((p) => p.getName() === nm);
      const ppScope = (pp as unknown as { getScope?: () => string } | undefined)?.getScope;
      return typeof ppScope === 'function' ? ppScope.call(pp) : undefined;
    };
    const offending = new Set<string>();
    for (const nm of self.thisMembers) {
      const sc = scopeOf(nm);
      if (sc === 'private' || sc === 'protected') offending.add(nm);
    }
    if (self.privateIdentifierUsed) offending.add('#private');
    if (offending.size > 0 && crossModule)
      return bail(
        `it accesses private/protected member(s) [${[...offending].join(', ')}] of ` +
          `${className}; a free function in another module cannot reach them. ` +
          `Keep this method in the origin class (extract only public-surface ` +
          `methods), or use atomic_edit_symbol for a surgical change.`,
      );
  }

  return {
    ok: true,
    memberName,
    className,
    params,
    typeParams,
    returnTypeNode,
    isAsync,
    isStatic,
    memberShape,
    self,
    usedThis,
  };
}

/**
 * A/B TOOLDEV16 — PURE, READ-ONLY extractability predicate for the god-class
 * planner. Parses `fromText` in-memory (no disk, no mutation), resolves the
 * `Class.method` selector, and runs the EXACT same checks the real relocation
 * guard runs (via {@link analyzeClassMethodExtraction}, crossModule=true: the
 * planner always extracts to a sibling module). Lets the planner filter its
 * candidate set down to methods the engine will actually accept — so it never
 * proposes a method the all-or-nothing decompose would refuse.
 */
export async function canExtractClassMethod(
  fromRel: string,
  fromText: string,
  selector: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    assertTs(fromRel, 'can_extract_class_method');
    const sf = await tsmSource(fromRel, fromText);
    const { node } = resolveSymbol(sf, selector);
    const k = node.getKindName();
    const classDecl = (
      node as unknown as {
        getFirstAncestorByKind: (
          kk: number,
        ) => import('ts-morph').ClassDeclaration | undefined;
      }
    ).getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration);
    if (!classDecl || (k !== 'MethodDeclaration' && k !== 'PropertyDeclaration'))
      return {
        ok: false,
        reason: `"${selector}" is not an extractable class method/arrow-property.`,
      };
    const v = await analyzeClassMethodExtraction({
      node,
      classDecl,
      selector,
      crossModule: true,
    });
    return v.ok ? { ok: true } : { ok: false, reason: v.reason };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}


/**
 * Move `selector` out of `fromRel` into `toRel`. All-or-nothing is enforced by
 * the caller: both `from`/`to` carry their own no-syntax-regression
 * ValidationResult; the caller refuses to write either file if either failed.
 */
export async function moveSymbolToFile(args: {
  fromRel: string;
  fromBefore: string;
  toRel: string;
  /** '' when the target does not exist yet */
  toBefore: string;
  toExists: boolean;
  selector: string;
  leaveReExport: boolean;
}): Promise<MoveSymbolResult> {
  assertTs(args.fromRel, 'move_symbol');
  assertTs(args.toRel, 'move_symbol');
  const fromPosix = args.fromRel.split(path.sep).join('/');
  const toPosix = args.toRel.split(path.sep).join('/');
  if (fromPosix === toPosix) throw new Error('fromFile and toFile must differ');

  const { Node } = await import('ts-morph');
  const sf = await tsmSource(args.fromRel, args.fromBefore);
  const { node, info } = resolveSymbol(sf, args.selector);

  // The statement that owns the symbol (a `const`/`let` declarator -> its
  // statement, so the move is a coherent syntactic unit).
  let stmt = node;
  if (Node.isVariableDeclaration(node)) {
    const vs = node.getFirstAncestorByKind(ts.SyntaxKind.VariableStatement);
    if (!vs) throw new Error(`cannot locate the variable statement for "${args.selector}"`);
    if (vs.getDeclarations().length !== 1) {
      throw new Error(
        `"${args.selector}" shares a multi-declarator statement; split it before moving`,
      );
    }
    stmt = vs;
  }

  const name = info.selector.split('.').pop() as string;
  // Class-method extraction state (Princípio da Ação Atômica #11/#12/#13/#14):
  // when the resolved symbol is a class member we DON'T move a top-level
  // statement — we extract an API-preserving helper and leave a delegation.
  let methodExtraction = false;
  let helperName = '';
  let usedThis = false;
  let className = '';
  let applyDelegation: (() => void) | null = null;
  let movedText: string;

  if (stmt.getParent()?.getKindName() === 'SourceFile') {
    const stmtText = stmt.getText();
    if (/^export\s+default\b/.test(stmtText.trimStart())) {
      throw new Error('export-default symbols are out of scope; convert to a named export first');
    }
    const isExported = /^export\s/.test(stmtText.trimStart());
    // The target must export it so the origin's `export { name } from './to'`
    // (and every external importer) keeps resolving.
    movedText = isExported ? stmtText : `export ${stmtText}`;
  } else {
    const k = node.getKindName();
    const classDecl = (
      node as unknown as {
        getFirstAncestorByKind: (kk: number) => import('ts-morph').ClassDeclaration | undefined;
      }
    ).getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration);
    if (classDecl && (k === 'MethodDeclaration' || k === 'PropertyDeclaration')) {
      const ex = await extractClassMember({
        node,
        classDecl,
        selector: args.selector,
        fromRel: args.fromRel,
        toRel: args.toRel,
        toBefore: args.toBefore,
      });
      methodExtraction = true;
      helperName = ex.helperName;
      usedThis = ex.usedThis;
      className = ex.className;
      applyDelegation = ex.applyDelegation;
      movedText = ex.helperText;
    } else {
      throw new Error(
        `only top-level symbols can be moved; "${args.selector}" is nested and is ` +
          `not an extractable class method/arrow-property. Use atomic_edit_symbol ` +
          `for a surgical in-place change, or move its enclosing top-level declaration.`,
      );
    }
  }

  // Identifiers referenced inside the symbol (skip member names of property
  // accesses and the declaration's own name).
  const referenced = new Set<string>();
  for (const id of node.getDescendantsOfKind(ts.SyntaxKind.Identifier)) {
    const parent = id.getParent();
    const parentName = (
      parent as unknown as { getNameNode?: () => unknown } | undefined
    )?.getNameNode?.();
    if (parent?.getKindName() === 'PropertyAccessExpression' && parentName === id) continue;
    referenced.add(id.getText());
  }

  // Imports the symbol needs, reconstructed from the origin's import decls.
  const importStructs: ImportStruct[] = [];
  const toNorm = args.toRel
    .split(path.sep)
    .join('/')
    .replace(/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i, '');
  for (const decl of sf.getImportDeclarations()) {
    // Never carry an origin import that resolves to the move TARGET itself
    // back into the target (would become a self-import once a prior
    // same-module move auto-added a back-import to the origin).
    const declSpec = decl.getModuleSpecifierValue();
    if (declSpec.startsWith('.')) {
      const fromDir = path.posix.dirname(args.fromRel.split(path.sep).join('/'));
      const resolved = path.posix
        .normalize(path.posix.join(fromDir, declSpec))
        .replace(/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i, '');
      if (resolved === toNorm) continue;
    }
    const def = decl.getDefaultImport()?.getText();
    const ns = decl.getNamespaceImport()?.getText();
    const named = decl.getNamedImports().map((ni) => ({
      name: ni.getName(),
      alias: ni.getAliasNode()?.getText(),
    }));
    const keepDefault = def && referenced.has(def) ? def : undefined;
    const keepNs = ns && referenced.has(ns) ? ns : undefined;
    const keepNamed = named.filter((n) => referenced.has(n.alias ?? n.name));
    if (!keepDefault && !keepNs && keepNamed.length === 0) continue;
    importStructs.push({
      moduleSpecifier: decl.getModuleSpecifierValue(),
      isTypeOnly:
        (decl as unknown as { isTypeOnly?: () => boolean }).isTypeOnly?.() === true,
      defaultImport: keepDefault,
      namespaceImport: keepNs,
      namedImports: keepNamed.map((n) => ({ name: n.name, alias: n.alias })),
    });
  }
  const neededImports = importStructs.map((s) => s.moduleSpecifier);

  // Origin-local exported symbols the moved code still needs -> import them
  // back from the origin (non-exported origin locals cannot be reached; the
  // symbol is then assumed self-contained for those names).
  const exportedTopLevel = new Set<string>();
  for (const fn of sf.getFunctions()) {
    const n = fn.getName();
    if (n && fn.isExported()) exportedTopLevel.add(n);
  }
  for (const cl of sf.getClasses()) {
    const n = cl.getName();
    if (n && cl.isExported()) exportedTopLevel.add(n);
  }
  for (const ifc of sf.getInterfaces()) if (ifc.isExported()) exportedTopLevel.add(ifc.getName());
  for (const ta of sf.getTypeAliases()) if (ta.isExported()) exportedTopLevel.add(ta.getName());
  for (const en of sf.getEnums()) if (en.isExported()) exportedTopLevel.add(en.getName());
  for (const vs of sf.getVariableStatements()) {
    if (!vs.isExported()) continue;
    for (const d of vs.getDeclarations()) exportedTopLevel.add(d.getName());
  }
  const backImports: string[] = [];
  for (const refName of referenced) {
    if (refName === name) continue;
    if (exportedTopLevel.has(refName)) backImports.push(refName);
  }
  // Method extraction that touches `this` needs the origin class type for the
  // helper's `self: <ClassName>` parameter — carry it back from the origin
  // (extractClassMember already refused if the class is not exported).
  if (methodExtraction && usedThis && className && !backImports.includes(className))
    backImports.push(className);

  // ---- Build TARGET (new module or append) ----
  const target = await tsmSource(args.toRel, args.toBefore);
  const existingByMod = new Map(
    target.getImportDeclarations().map((d) => [d.getModuleSpecifierValue(), d] as const),
  );
  const mergeImport = (s: ImportStruct): void => {
    const ex = existingByMod.get(s.moduleSpecifier);
    if (!ex) {
      const d = target.addImportDeclaration({
        moduleSpecifier: s.moduleSpecifier,
        isTypeOnly: s.isTypeOnly,
        defaultImport: s.defaultImport,
        namespaceImport: s.namespaceImport,
        namedImports: s.namedImports.map((n) =>
          n.alias ? { name: n.name, alias: n.alias } : { name: n.name },
        ),
      });
      existingByMod.set(s.moduleSpecifier, d);
      return;
    }
    const present = new Set(
      ex.getNamedImports().map((ni) => ni.getAliasNode()?.getText() ?? ni.getName()),
    );
    for (const n of s.namedImports) {
      const local = n.alias ?? n.name;
      if (present.has(local)) continue;
      ex.addNamedImport(n.alias ? { name: n.name, alias: n.alias } : { name: n.name });
      present.add(local);
    }
    if (s.defaultImport && !ex.getDefaultImport()) ex.setDefaultImport(s.defaultImport);
    if (s.namespaceImport && !ex.getNamespaceImport()) ex.setNamespaceImport(s.namespaceImport);
  };
  for (const s of importStructs) mergeImport(s);
  if (backImports.length > 0) {
    mergeImport({
      moduleSpecifier: moduleSpecifier(args.toRel, args.fromRel),
      isTypeOnly: false,
      namedImports: backImports.map((n) => ({ name: n })),
    });
  }
  target.addStatements(`\n${movedText}\n`);
  const toAfter = target.getFullText();

  // ---- Build ORIGIN ----
  let originBackImportAdded = false;
  const originStillReferences: string[] = [];
  let leftReExport: boolean;
  if (methodExtraction) {
    // API-PRESERVING extraction: the origin method/property KEEPS its name,
    // signature, decorators and visibility — only the body becomes a thin
    // `return helper(this, ...)` delegation. No top-level symbol left the
    // file, so there is NO re-export; instead the helper is imported back so
    // the delegation resolves (one-shot, zero manual cleanup).
    (applyDelegation as () => void)();
    const spec = moduleSpecifier(args.fromRel, args.toRel);
    const existing = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === spec);
    if (existing) {
      const present = new Set(
        existing.getNamedImports().map((ni) => ni.getAliasNode()?.getText() ?? ni.getName()),
      );
      if (!present.has(helperName)) existing.addNamedImport({ name: helperName });
    } else {
      sf.addImportDeclaration({ moduleSpecifier: spec, namedImports: [{ name: helperName }] });
    }
    originBackImportAdded = true;
    originStillReferences.push(helperName);
    leftReExport = false;
  } else {
    // surgical removal + optional re-export (top-level symbol move)
    (stmt as unknown as { remove: () => void }).remove();
    if (args.leaveReExport) {
      sf.addExportDeclaration({
        namedExports: [name],
        moduleSpecifier: moduleSpecifier(args.fromRel, args.toRel),
      });
    }
    leftReExport = args.leaveReExport;

    // AUTO BACK-IMPORT — a typed re-export (`export { name } from './to'`) is
    // NOT a usable local binding, so if the trimmed origin's OWN remaining
    // code still references the moved name the origin no longer resolves it.
    // Add EXACTLY ONE consolidated `import { name } from '<to>'` (idempotent
    // merge into any existing import from the same specifier) so the
    // decomposition is one-shot — zero manual import cleanup downstream.
    // Conservative: AST refs only; ANY ambiguity / ts-morph failure falls
    // back to current behavior (no back-import) — never corrupt the origin,
    // never throw, all-or-nothing and the re-export are left untouched.
    try {
      const stillUsesName = sf
        .getDescendantsOfKind(ts.SyntaxKind.Identifier)
        .some((id) => {
          if (id.getText() !== name) return false;
          const parent = id.getParent();
          const parentName = (
            parent as unknown as { getNameNode?: () => unknown } | undefined
          )?.getNameNode?.();
          // member name of a property access (obj.name) — not a bare ref
          if (parent?.getKindName() === 'PropertyAccessExpression' && parentName === id)
            return false;
          // the re-export specifier we just added / any export declaration
          if (id.getFirstAncestorByKind(ts.SyntaxKind.ExportDeclaration)) return false;
          // already an import binding, not a bare code reference
          if (id.getFirstAncestorByKind(ts.SyntaxKind.ImportDeclaration)) return false;
          return true;
        });
      if (stillUsesName) {
        const spec = moduleSpecifier(args.fromRel, args.toRel);
        const existing = sf
          .getImportDeclarations()
          .find((d) => d.getModuleSpecifierValue() === spec);
        if (existing) {
          const present = new Set(
            existing
              .getNamedImports()
              .map((ni) => ni.getAliasNode()?.getText() ?? ni.getName()),
          );
          if (!present.has(name)) existing.addNamedImport({ name });
        } else {
          sf.addImportDeclaration({ moduleSpecifier: spec, namedImports: [{ name }] });
        }
        originBackImportAdded = true;
        originStillReferences.push(name);
      }
    } catch {
      // ambiguity / ts-morph failure -> keep current behavior, never corrupt
      originBackImportAdded = false;
      originStillReferences.length = 0;
    }
  }

  const fromAfter = sf.getFullText();

  return {
    symbol: name,
    movedText,
    from: {
      relPath: args.fromRel,
      before: args.fromBefore,
      after: fromAfter,
      validation: validate(args.fromRel, args.fromBefore, fromAfter),
      created: false,
    },
    to: {
      relPath: args.toRel,
      before: args.toBefore,
      after: toAfter,
      validation: validate(args.toRel, args.toBefore, toAfter),
      created: !args.toExists,
    },
    neededImports,
    backImports,
    leftReExport,
    originBackImportAdded,
    originStillReferences,
  };
}
