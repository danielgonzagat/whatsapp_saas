/**
 * gates/binding-gate.ts — the exoneration-free BINDING fact.
 *
 * The atom this gate dissolves (LSP definition/references): a referenced name in
 * a changed region BINDS to exactly one declaration reachable in the overlay+tree
 * — a local/param/declared name, an imported name (whose module resolves via the
 * shared resolveRelImport, or is bare), or a known global — OR it is UNBOUND.
 * That is a FACT, not a heuristic: the name resolves to a declaration or it does
 * not. No language server at runtime, no daemon, no human (we GROUND-checked the
 * fact against lsp_definition / lsp_references to prove the byte-fact equals the
 * LSP fact — see binding-gate.proof.ts).
 *
 * Tiered precision, exactly like engine-rename.ts:
 *   - Tier 1 (ts-morph, if installed) — scope-correct symbol resolution for TS/JS.
 *     A free reference whose Symbol has zero declarations and is not a known
 *     global is unbound. This is the same machinery the LSP uses.
 *   - Tier 3 (regex word-boundary floor) — language-agnostic: collect declared
 *     identifiers (decl keywords + params + import/require names) and assert each
 *     referenced call-target binds to a declaration, import, or known global.
 * (Tier 2 — tree-sitter scope — is deliberately omitted here: web-tree-sitter is
 *  not guaranteed present, and ts-morph already covers TS/JS scope-correctly while
 *  the regex floor covers everything else. The middle tier would add cost without
 *  changing the verdict on the languages we can actually decide.)
 *
 * NEW-unbound-only semantics (mirrors connection-gate's `beforeSpecs` diff): only
 * a name UNBOUND in the new content but NOT already unbound in the file's prior
 * content is this change's claim. A pre-existing dangling reference in legacy code
 * never blocks an unrelated edit — but no change may INTRODUCE one.
 *
 * Mutation Firewall: this gate is a PERCEPTION — it LOCATES unbound spans and
 * states the fact. It never splices bytes; the engine does that.
 *
 * Honest ceiling (returned as unjudged / left to the LSP, never faked green):
 *   - Type-directed resolution (overload sets, generics, dynamic dispatch) is not
 *     decidable from a single file's bytes — but BINDING (does this free name reach
 *     a declaration at all) is, which is exactly the LSP definition/references fact.
 *   - Runtime-only bindings (globalThis injection, `eval`, ambient `declare global`
 *     in a foreign .d.ts) leave the bytes → covered by the known-global allowlist
 *     and, when undecidable, by returning unjudged rather than a guessed red.
 *   - On a language we cannot parse (no ts-morph for TS/JS, unknown extension on
 *     the floor) the gate returns unjudged for that file — never red-by-guess.
 */
import { type GateModule, type GateContext, type GateResult, type GateRed } from './contract.js';

const TS_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java)$/;

/**
 * Known globals — names that BIND to the host environment, not to a declaration
 * in the bytes. A free reference to one of these is bound-by-environment, never a
 * red. (ts-morph runs with noLib so it cannot see these; the floor cannot either.)
 * This is the "known global" branch the binding fact names explicitly.
 */
const KNOWN_GLOBALS = new Set<string>([
  // JS/TS language + host globals
  'console', 'process', 'globalThis', 'global', 'window', 'document', 'self',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol',
  'BigInt', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  'Function', 'Buffer', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'queueMicrotask', 'fetch', 'structuredClone', 'btoa', 'atob',
  'require', 'module', 'exports', '__dirname', '__filename', 'import',
  'undefined', 'NaN', 'Infinity', 'arguments', 'super', 'this',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer',
  'DataView', 'AbortController', 'AbortSignal', 'Event', 'EventTarget',
  'Intl', 'WeakRef', 'FinalizationRegistry', 'performance', 'crypto', 'eval',
  'BigInt64Array', 'BigUint64Array', 'SharedArrayBuffer', 'Atomics', 'EvalError',
  'ReferenceError', 'URIError', 'AggregateError', 'Iterator', 'navigator',
  // test-runner ambient globals (jest / vitest / mocha — injected, not imported)
  'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
  'jest', 'vi', 'vitest', 'xit', 'xdescribe', 'fit', 'fdescribe', 'suite', 'mock',
  'fail', 'pending', 'spyOn', 'done', 'xtest', 'context', 'specify', 'before', 'after',
  // WHATWG / Web Platform / DOM host globals (Node 18+ runtime + browser + jsdom)
  'Request', 'Response', 'Headers', 'FormData', 'Blob', 'File', 'FileReader', 'FileList',
  'ReadableStream', 'WritableStream', 'TransformStream', 'CompressionStream', 'DecompressionStream',
  'localStorage', 'sessionStorage', 'StorageEvent', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'PerformanceObserver',
  'DOMParser', 'XMLSerializer', 'DOMException', 'CustomEvent', 'MessageChannel', 'MessagePort',
  'BroadcastChannel', 'WebSocket', 'EventSource', 'Image', 'Audio', 'DataTransfer', 'XMLHttpRequest',
  'confirm', 'prompt', 'alert', 'getComputedStyle', 'matchMedia', 'location', 'customElements',
  'Notification', 'Worker', 'Element', 'Node', 'NodeList', 'Document', 'HTMLDocument', 'CSS',
  // Python builtins (floor only)
  'print', 'len', 'range', 'dict', 'list', 'set', 'tuple', 'int', 'float',
  'str', 'bool', 'bytes', 'type', 'isinstance', 'enumerate', 'zip', 'map',
  'filter', 'sorted', 'sum', 'min', 'max', 'abs', 'open', 'super', 'self',
  'None', 'True', 'False', 'Exception', 'ValueError', 'KeyError', 'TypeError',
]);

interface Unbound {
  name: string;
  line: number;
  col: number;
}

/**
 * Tier 1 — ts-morph scope-correct binding for a single TS/JS source file.
 * Returns the list of UNBOUND free references, or null if ts-morph is unavailable
 * (→ caller treats the file as undecidable / unjudged, never red-by-guess).
 */
async function tsMorphUnbound(rel: string, text: string): Promise<Unbound[] | null> {
  let tsMorph: typeof import('ts-morph');
  try {
    tsMorph = await import('ts-morph');
  } catch {
    return null; // ts-morph not installed → undecidable for this file
  }
  const { Project, SyntaxKind, Node } = tsMorph;
  // Type positions never name a VALUE binding (RegExpExecArray, Record, Promise, a
  // type-alias rhs, an import-type qualifier). Type resolution is the type-checker's
  // job — the documented ceiling — so binding skips them rather than red-by-guess
  // under noLib (where lib type names have no declaration and would all look unbound).
  const TYPE_CTX = new Set<number>([
    SyntaxKind.TypeReference, SyntaxKind.ImportType, SyntaxKind.QualifiedName,
    SyntaxKind.TypeQuery, SyntaxKind.TypeParameter, SyntaxKind.IndexedAccessType,
    SyntaxKind.TypeOperator, SyntaxKind.ExpressionWithTypeArguments, SyntaxKind.TypePredicate,
    SyntaxKind.MappedType, SyntaxKind.FunctionType, SyntaxKind.ConstructorType,
  ]);
  let sf: import('ts-morph').SourceFile;
  try {
    const proj = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      // noLib: do not resolve the entire DOM/ES lib (heavy + would mark every
      // global "bound" via lib.d.ts); we cover globals with KNOWN_GLOBALS instead,
      // so an unbound name is a real free-variable fact, not a lib lookup.
      compilerOptions: { allowJs: true, noLib: true, noResolve: true },
    });
    const ext = TS_RE.exec(rel)?.[1] ?? 'ts';
    sf = proj.createSourceFile(`/__binding__.${ext}`, text, { overwrite: true });
  } catch {
    return null; // could not even construct the file → undecidable
  }
  const out: Unbound[] = [];
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const name = id.getText();
    if (KNOWN_GLOBALS.has(name)) continue;
    const parent = id.getParent();
    // Exclude positions that are NOT free references:
    //  - the .name of a property access  (o.log  → `log` is a member, not a binding)
    //  - the right of a qualified type name (A.B → `B`)
    //  - an object/property key            ({ log: 1 } / interface { x } → `log`/`x`)
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;
    if (Node.isQualifiedName(parent) && parent.getRight() === id) continue;
    if (
      (Node.isPropertyAssignment(parent) || Node.isPropertySignature(parent) ||
        Node.isPropertyDeclaration(parent) || Node.isMethodDeclaration(parent) ||
        Node.isMethodSignature(parent) || Node.isEnumMember(parent)) &&
      typeof parent.getNameNode === 'function' && parent.getNameNode() === id
    ) {
      continue;
    }
    if (Node.isShorthandPropertyAssignment(parent)) continue; // { foo } — its own binding rule
    if (Node.isBindingElement(parent) && parent.getPropertyNameNode() === id) continue; // const { key: local } — key is a property name, not a reference
    if (parent.getKind() === SyntaxKind.MetaProperty) continue; // import.meta / new.target
    if (
      (Node.isJsxOpeningElement(parent) || Node.isJsxSelfClosingElement(parent) || Node.isJsxClosingElement(parent)) &&
      /^[a-z]/.test(name)
    ) {
      continue; // <div>/<span> — lowercase JSX intrinsic tag, resolved by the JSX runtime, not a binding
    }
    if (Node.isNamedTupleMember(parent)) continue; // [name: T] — tuple element label, not a reference
    if (/^(?:HTML|SVG)[A-Za-z]*Element$/.test(name)) continue; // DOM element constructor host globals
    // Skip identifiers that are not VALUE references: JSDoc/comment identifiers
    // (e.g. "@Controller(" written in a docstring) and any type-context name.
    const ancestors = id.getAncestors();
    if (
      ancestors.some((a) => {
        const k = a.getKind();
        // type positions, JSDoc, and the names inside an import/export statement
        // (the `validate` in `{ validate as treeValidate }` is a propertyName, not a
        // reference; the bound local is resolved by getSymbol where it's USED).
        return (
          TYPE_CTX.has(k) ||
          k === SyntaxKind.ImportDeclaration ||
          k === SyntaxKind.ExportDeclaration ||
          a.getKindName().startsWith('JSDoc')
        );
      })
    ) {
      continue;
    }
    const sym = id.getSymbol();
    const decls = sym ? sym.getDeclarations() : [];
    if (!sym || decls.length === 0) {
      const start = id.getStart();
      const lc = sf.getLineAndColumnAtPos(start);
      out.push({ name, line: lc.line, col: lc.column });
    }
  }
  return out;
}

/**
 * Tier 3 — language-agnostic regex word-boundary FLOOR.
 * Collects declared identifiers (decl keywords, function/class names, params,
 * import/require/from targets) and reports referenced CALL targets that bind to
 * none of: a declaration, an import, or a known global.
 *
 * The floor is intentionally conservative — it judges only call-site targets
 * (`name(`), where a free reference is unambiguous — so it never red-by-guesses a
 * property access or a string. If it cannot find any call site to judge it returns
 * an empty list (the caller then folds it into unjudged when nothing was decided).
 */
/** Length-preserving blanking of comments + string/template literals so the floor's
 *  `name(` match never fires INSIDE a string or comment — the floor's only FP source.
 *  Covers //, #, block comments, and ' " ` literals (the langs the floor targets). */
function blankNonCode(text: string): string {
  const out = text.split('');
  const n = text.length;
  let i = 0;
  const blankTo = (end: number): void => {
    for (let k = i; k < end && k < n; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      while (j < n && text[j] !== '\n') j += 1;
      blankTo(j);
      i = j;
    } else if (c === '#') {
      let j = i + 1;
      while (j < n && text[j] !== '\n') j += 1;
      blankTo(j);
      i = j;
    } else if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j += 1;
      j = Math.min(j + 2, n);
      blankTo(j);
      i = j;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      j = Math.min(j + 1, n);
      blankTo(j);
      i = j;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

function regexFloorUnbound(rawText: string): Unbound[] | null {
  const text = blankNonCode(rawText);
  const declared = new Set<string>();
  const add = (re: RegExp): void => {
    for (const m of text.matchAll(re)) {
      const g = m[1];
      if (g) declared.add(g);
    }
  };
  // declarations / bindings (TS/JS + python + go-ish)
  add(/\b(?:const|let|var|function|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/g);
  add(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g);
  add(/\b(?:def|func)\s+([A-Za-z_$][\w$]*)/g);
  // imports: import x / import {a, b} / import * as ns / require('m') bound name / from m import a
  add(/\bimport\s+([A-Za-z_$][\w$]*)\b/g);
  add(/\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g);
  add(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(/g);
  for (const m of text.matchAll(/\bimport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const nm = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (nm && /^[A-Za-z_$][\w$]*$/.test(nm)) declared.add(nm);
    }
  }
  // params: function/arrow/def parameter lists
  for (const m of text.matchAll(/(?:function\b[^(]*|def\s+[A-Za-z_$][\w$]*\s*|=>\s*|\)\s*=>|\b)\(([^)]*)\)/g)) {
    for (const part of m[1].split(',')) {
      const nm = part.trim().replace(/[:=].*$/, '').replace(/^\.\.\./, '').trim();
      if (nm && /^[A-Za-z_$][\w$]*$/.test(nm)) declared.add(nm);
    }
  }
  // assigned locals: `name =` (not `==`/`=>`/`>=`/`<=`/`!=`)
  for (const m of text.matchAll(/(?:^|[;{,(\s])([A-Za-z_$][\w$]*)\s*=(?![=>])/gm)) {
    declared.add(m[1]);
  }

  // judge call-site targets only (unambiguous free references): `name(`
  const out: Unbound[] = [];
  let judged = false;
  for (const m of text.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    // skip control-flow keywords that look like calls
    if (/^(if|for|while|switch|catch|return|typeof|await|new|function|super|do)$/.test(name)) continue;
    judged = true;
    if (declared.has(name) || KNOWN_GLOBALS.has(name)) continue;
    const before = text.slice(0, m.index ?? 0);
    const line = before.split('\n').length;
    const col = (m.index ?? 0) - before.lastIndexOf('\n');
    out.push({ name, line, col });
  }
  return judged ? out : null; // nothing judged → undecidable on the floor
}

/** Resolve which unbound names are NEW (present now, not already unbound before). */
function newOnly(before: Unbound[] | null, now: Unbound[]): Unbound[] {
  const priorNames = new Set((before ?? []).map((u) => u.name));
  return now.filter((u) => !priorNames.has(u.name));
}

const bindingGate: GateModule = {
  name: 'binding',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return SOURCE_RE.test(rel);
  },
  async run(ctx: GateContext): Promise<GateResult> {
    const reds: GateRed[] = [];
    let anyDecided = false;
    let anyUndecided = false;

    for (const rel of ctx.changedFiles) {
      if (!this.appliesTo(rel)) continue;
      const now = ctx.readFile(rel);
      if (now === null) continue;

      const isTs = TS_RE.test(rel);
      // before-content via the SHARED context (consistent with every other gate):
      // ctx.priorOf is the prior disk bytes in the WRITE direction (NEW-unbound-only
      // delta) and '' in the LENS/read direction (judge the whole file/candidate
      // absolutely). '' → null → every unbound name is this claim. This is what lets
      // the repair engine judge a candidate-in-overlay absolutely, not delta-vs-disk.
      const beforeRaw = ctx.priorOf(rel);
      const beforeText: string | null = beforeRaw === '' ? null : beforeRaw;

      let nowUnbound: Unbound[] | null;
      let beforeUnbound: Unbound[] | null;
      if (isTs) {
        nowUnbound = await tsMorphUnbound(rel, now);
        beforeUnbound = beforeText === null ? null : await tsMorphUnbound(rel, beforeText);
      } else {
        nowUnbound = regexFloorUnbound(now);
        beforeUnbound = beforeText === null ? null : regexFloorUnbound(beforeText);
      }

      if (nowUnbound === null) {
        anyUndecided = true; // could not parse this file → honest, no guess
        continue;
      }
      anyDecided = true;
      for (const u of newOnly(beforeUnbound, nowUnbound)) {
        reds.push({
          file: rel,
          locus: `L${u.line}:${u.col}`,
          fact: `referenced name '${u.name}' binds to no declaration, import, or known global (unbound)`,
        });
      }
    }

    if (reds.length > 0) {
      return { gate: this.name, green: false, reds, note: NOTE };
    }
    // No reds. If we decided at least one file, that is a real green. If every
    // applicable file was unparseable, be honest: unjudged, not green-by-assumption.
    if (!anyDecided && anyUndecided) {
      return { gate: this.name, green: true, reds: [], note: NOTE, unjudged: true };
    }
    return { gate: this.name, green: true, reds: [], note: NOTE };
  },
};

const NOTE = 'every referenced name binds to a declaration, import, or known global (NEW-unbound only)';

/**
 * Read the pre-write content from disk (NOT overlay) so the NEW-unbound diff has a
 * real "before". Uses only the context's tree view: existsInTree + a disk read via
 * a fresh context that ignores the overlay for this one path. We cannot reach fs
 * directly here without re-importing it, so we exploit the fact that an empty
 * overlay makes ctx.readFile return disk content.
 */
function readPriorFromDisk(ctx: GateContext, rel: string): string | null {
  // Build a disk-only reader: makeContext with an EMPTY overlay reads from disk.
  // Avoid importing makeContext to keep this gate's only relative import = contract.js
  // (byte-floor connection gate requirement). Instead, temporarily consult the tree
  // by stripping the overlay entry for this read.
  const key = rel.replaceAll('\\', '/');
  const saved = ctx.overlay.get(key);
  ctx.overlay.delete(key);
  try {
    return ctx.readFile(rel);
  } finally {
    if (saved !== undefined) ctx.overlay.set(key, saved);
  }
}

export default bindingGate;
