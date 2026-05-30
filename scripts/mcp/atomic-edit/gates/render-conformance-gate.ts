/**
 * render-conformance-gate.ts — the CDP static half: a UI affordance wires to a
 * resolvable target, or it is a dead UI wire. That is a byte/edge FACT, not a
 * heuristic — no browser, no daemon, no painted pixel.
 *
 * A React/JSX component DECLARES interactive affordances. This gate extracts the
 * two affordance classes that are decidable from the bytes the write carries and
 * the route tree on disk, and asserts each declared target resolves:
 *
 *   (A) HANDLER WIRE  — a bare-identifier event handler `onClick={doThing}` /
 *       `onSubmit={save}`. RED iff the identifier has ZERO binding evidence
 *       anywhere in the file (not imported, not declared, not a param/destructured
 *       prop). A deleted/typo'd handler is a button pointing at nothing.
 *       Inline arrows `onClick={() => ...}`, member access `onClick={a.b}` and
 *       param callbacks `onClick={e => ...}` are NOT a single bindable identifier
 *       — no dangling-symbol fact to assert → not judged.
 *
 *   (B) ROUTE WIRE — a literal absolute path in `href="/r"`, `<Link href="/r">`,
 *       `router.push('/r')`, `router.replace('/r')`. RED iff `/r` (query/hash
 *       stripped) does NOT resolve to a real Next.js App-Router page. Template /
 *       variable args are not literals → not judged.
 *
 * TOKEN-CORRECT PERCEPTION (the lens fix): affordances are read through the real
 * tree-sitter parse tree via native-bridge `astNodes`, NEVER by raw-regex over the
 * whole file. The previous regex extractor matched any text that *looked* like an
 * `onClick={x}` / `href="/y"` / `router.push("/z")` — including occurrences sitting
 * inside a STRING literal, a COMMENT, or a TEMPLATE literal (e.g. a doc-comment
 * example, a `title="onClick={...}"` attribute value, or a code-building template
 * string). Those are false dead-wires: the runtime never sees them as affordances.
 * In the parse tree such a token is a `string` / `comment` / `template_string`
 * node, NOT a `jsx_attribute` / `call_expression` node, so this gate never extracts
 * it. Token-correctness by construction; no blanking heuristic needed.
 *
 * Mutation-Firewall law: this module only LOCATES the violated span (line:col) and
 * states the fact; it never writes. Mirrors connection-gate.ts:
 *  - SOURCE/React files only; everything else has no affordance fact → green.
 *  - NEW-affordance-only: an affordance present in the new content but NOT in the
 *    file's prior content is this write's claim. A pre-existing dead wire in a
 *    legacy file never blocks an unrelated edit — but no write may INTRODUCE one.
 *  - Frameworks: Next.js / React. Vue / Svelte / raw-HTML-string → unjudged.
 *
 * Honest ceiling (NOT byte facts — deferred to the dynamic/effect gate, never
 * claimed here): whether the handler actually mutates state, whether the route
 * 200s at runtime, painted pixels, layout, timing, real-network responses. A
 * single dynamic segment `[id]` matches ANY value, so a route landing on one is
 * conservatively GREEN (its concrete value is a runtime fact). When the App-Router
 * tree is not observable at all, route wires return `unjudged` rather than red.
 * When no tree-sitter grammar is available for a file, its affordances are
 * unobservable → that file contributes `unjudged`, never a guessed red/green.
 */
import {
  type GateContext,
  type GateModule,
  type GateRed,
  type GateResult,
} from './contract.js';
import { langOf } from './perception.js';
import { astNodes } from '../native-bridge.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** React/JSX source we are willing to judge. */
const REACT_SOURCE_RE = /\.(tsx|jsx|ts|js|mjs|cjs)$/;
/** App-Router page basenames. */
const PAGE_BASENAMES = new Set([
  'page.tsx', 'page.ts', 'page.jsx', 'page.js',
]);
/** Cap the route-tree walk so the gate can never wedge on a pathological tree. */
const MAX_ROUTE_NODES = 20000;

interface Affordance {
  /** the raw target token: an identifier (handler) or a literal path (route) */
  target: string;
  kind: 'handler' | 'route';
  line: number;
  col: number;
}

/** A directory node in the App-Router trie (built from disk + overlay). */
interface RouteNode {
  /** literal child segment dir -> node (route-group dirs are flattened away) */
  children: Map<string, RouteNode>;
  /** a [seg] dynamic child, if present */
  dynamic?: RouteNode;
  /** a [...seg] or [[...seg]] catch-all child, if present */
  catchAll?: RouteNode;
  /** this directory contains a page.* (so it is a routable leaf) */
  hasPage: boolean;
}

function newNode(): RouteNode {
  return { children: new Map(), hasPage: false };
}

/** Unquote a string/template literal whose own braces have already been stripped. */
function literalValue(raw: string): string | null {
  const t = raw.trim();
  if (
    t.length >= 2 &&
    (t[0] === "'" || t[0] === '"' || t[0] === '`') &&
    t[t.length - 1] === t[0]
  ) {
    const inner = t.slice(1, -1);
    // A template with an interpolation (`...${x}...`) is NOT a literal path.
    if (t[0] === '`' && inner.includes('${')) return null;
    return inner;
  }
  return null;
}

/**
 * Split a `jsx_attribute` node's own text (e.g. `onClick={signOut}`,
 * `href="/r"`, `href={"/r"}`, `title="onClick={x}"`) into name + raw value.
 * The node text is the REAL attribute (code), so this is not parsing prose — the
 * inner `onClick={...}` of a `title="onClick={x}"` value is never seen as a second
 * attribute, because the parse tree already nested it inside this one node.
 */
function splitAttribute(attrText: string): { name: string; value: string } | null {
  const eq = attrText.indexOf('=');
  if (eq < 0) return null; // bare attribute (e.g. `disabled`) — no wire
  const name = attrText.slice(0, eq).trim();
  if (!/^[A-Za-z_][\w-]*$/.test(name)) return null;
  return { name, value: attrText.slice(eq + 1).trim() };
}

/** From a jsx_attribute value, the bare-identifier handler, if the value is `{ident}`. */
function bareHandlerIdent(value: string): string | null {
  const m = /^\{\s*([A-Za-z_$][\w$]*)\s*\}$/.exec(value);
  if (!m) return null;
  // {null}/{undefined} is an explicit no-op handler (a nullable, guarded prop) — not a dead wire.
  if (m[1] === 'null' || m[1] === 'undefined') return null;
  return m[1];
}

/** From a jsx_attribute value, the literal absolute path, if `"/p"` or `{"/p"}`. */
function literalRoutePath(value: string): string | null {
  let v = value;
  const braced = /^\{\s*([\s\S]*?)\s*\}$/.exec(v);
  if (braced) v = braced[1].trim(); // href={'/x'} → '/x'
  const lit = literalValue(v);
  return lit && lit.startsWith('/') ? lit : null;
}

/** First string-literal argument of a call's own text, if `("/p")`-shaped. */
function firstStringArg(callText: string): string | null {
  const open = callText.indexOf('(');
  if (open < 0) return null;
  const m = /\(\s*(['"`][^'"`]*['"`])/.exec(callText.slice(open));
  return m ? literalValue(m[1]) : null;
}

/**
 * Extract the affordances this content DECLARES, token-correctly via the real
 * parse tree. Returns null when no tree-sitter grammar is available for the file
 * (caller degrades that file to unjudged rather than guessing).
 *
 *  - handler: a `jsx_attribute` whose name is `on[A-Z]…` and whose value is a bare
 *    `{identifier}` (arrow / member / param shapes excluded by the brace-ident match).
 *  - route: a `jsx_attribute` named `href` with a literal absolute value, OR a
 *    `call_expression` whose callee is exactly `router.push` / `router.replace`
 *    with a literal absolute first arg. A `router.push("/x")` written inside a
 *    string/comment/template is a string/comment/template_string node, never a
 *    call_expression, so it is never extracted.
 */
export async function extractAffordancesAst(
  content: string,
  rel: string,
): Promise<Affordance[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(
    content,
    lang,
    new Set(['jsx_attribute', 'call_expression']),
  );
  if (nodes === null) return null;
  const out: Affordance[] = [];
  for (const n of nodes) {
    if (n.type === 'jsx_attribute') {
      const a = splitAttribute(n.text);
      if (!a) continue;
      if (/^on[A-Z][A-Za-z]*$/.test(a.name)) {
        const ident = bareHandlerIdent(a.value);
        if (ident) out.push({ target: ident, kind: 'handler', line: n.line, col: n.column });
      } else if (a.name === 'href') {
        const route = literalRoutePath(a.value);
        if (route) out.push({ target: route, kind: 'route', line: n.line, col: n.column });
      }
      continue;
    }
    // call_expression: router.push("/x") / router.replace("/x") only.
    const open = n.text.indexOf('(');
    if (open <= 0) continue;
    const callee = n.text.slice(0, open).trim();
    if (callee !== 'router.push' && callee !== 'router.replace') continue;
    const route = firstStringArg(n.text);
    if (route && route.startsWith('/')) {
      out.push({ target: route, kind: 'route', line: n.line, col: n.column });
    }
  }
  return out;
}

/**
 * An identifier is BOUND if it occurs MORE THAN ONCE across the file's real
 * binding-bearing nodes — `identifier` (imports, declarations, value-position
 * references) and `shorthand_property_identifier_pattern` (destructured props /
 * params). The single occurrence of the JSX handler reference itself is the value
 * being judged; any SECOND occurrence is binding evidence (import, declaration, or
 * destructured prop). Token-correct: a same-named token inside a string/comment is
 * a string/comment node, never counted. We red ONLY when the identifier occurs
 * exactly once (the genuine dangling wire). Returns null when the grammar is
 * unavailable so the caller can decline to judge rather than guess.
 */
export async function identifierBoundAst(
  content: string,
  rel: string,
  ident: string,
): Promise<boolean | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(
    content,
    lang,
    new Set(['identifier', 'shorthand_property_identifier_pattern']),
  );
  if (nodes === null) return null;
  let count = 0;
  for (const n of nodes) {
    if (n.text === ident) {
      count++;
      if (count > 1) return true; // referenced somewhere beyond the handler use
    }
  }
  return false; // the ONLY occurrence is the handler attribute → dangling
}

/** Is this an App-Router route-group dir `(x)` (transparent to the URL)? */
function isRouteGroup(seg: string): boolean {
  return seg.startsWith('(') && seg.endsWith(')');
}
/** Is this a private folder `_x` (not routable) — skip it entirely. */
function isPrivateFolder(seg: string): boolean {
  return seg.startsWith('_');
}

/** Insert one app-relative page path (segments AFTER the `app/` dir) into the trie. */
function insertPagePath(root: RouteNode, segs: string[]): void {
  // segs ends with the page basename; the dirs before it form the URL.
  const dirs = segs.slice(0, -1);
  let node = root;
  for (const raw of dirs) {
    if (isRouteGroup(raw) || isPrivateFolder(raw)) continue; // transparent / skip
    if (raw.startsWith('[[...') || raw.startsWith('[...')) {
      node.catchAll ??= newNode();
      node = node.catchAll;
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      node.dynamic ??= newNode();
      node = node.dynamic;
    } else {
      let child = node.children.get(raw);
      if (!child) {
        child = newNode();
        node.children.set(raw, child);
      }
      node = child;
    }
  }
  node.hasPage = true;
}

/** True if `urlSegs` (already group/empty-stripped) reaches a routable page node. */
function matchRoute(node: RouteNode, urlSegs: string[], i: number): boolean {
  if (i >= urlSegs.length) return node.hasPage;
  const seg = urlSegs[i];
  const literal = node.children.get(seg);
  if (literal && matchRoute(literal, urlSegs, i + 1)) return true;
  if (node.dynamic && matchRoute(node.dynamic, urlSegs, i + 1)) return true;
  // catch-all swallows the entire remaining tail (Next.js semantics).
  if (node.catchAll && node.catchAll.hasPage) return true;
  return false;
}

/** Locate the App-Router root: <repoRoot>/frontend/src/app, then /frontend/app. */
function appRootDir(repoRoot: string): string | null {
  for (const rel of ['frontend/src/app', 'frontend/app', 'src/app', 'app']) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
  }
  return null;
}

/** Bounded recursive walk collecting every page.* under the app dir. */
function walkPages(appAbs: string): string[][] {
  const acc: string[][] = [];
  let budget = MAX_ROUTE_NODES;
  const rec = (dir: string, segs: string[]): void => {
    if (budget-- <= 0) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        rec(path.join(dir, e.name), [...segs, e.name]);
      } else if (PAGE_BASENAMES.has(e.name)) {
        acc.push([...segs, e.name]);
      }
    }
  };
  rec(appAbs, []);
  return acc;
}

/**
 * Build the route trie from disk pages PLUS any overlay file that is itself an
 * App-Router page being created in this same transaction (so a write that adds a
 * page AND links to it converges as a unit).
 */
function buildRouteTrie(ctx: GateContext): { root: RouteNode; observable: boolean } {
  const appAbs = appRootDir(ctx.repoRoot);
  const root = newNode();
  let observable = false;
  if (appAbs) {
    observable = true;
    for (const segs of walkPages(appAbs)) insertPagePath(root, segs);
  }
  // overlay pages (relPath shape: .../app/<segs.../page.*>)
  const appRel = appAbs ? path.relative(ctx.repoRoot, appAbs).replaceAll('\\', '/') : null;
  for (const rel of ctx.overlay.keys()) {
    const n = rel.replaceAll('\\', '/');
    const base = n.slice(n.lastIndexOf('/') + 1);
    if (!PAGE_BASENAMES.has(base)) continue;
    const marker = appRel ? `${appRel}/` : '/app/';
    const idx = appRel ? (n.startsWith(marker) ? marker.length : -1) : n.indexOf(marker);
    if (idx < 0) continue;
    observable = true;
    const after = appRel ? n.slice(idx) : n.slice(idx + marker.length);
    insertPagePath(root, after.split('/').filter(Boolean));
  }
  return { root, observable };
}

/** Normalise an href/route literal into URL segments (strip query/hash/groups). */
function urlSegments(target: string): string[] {
  const clean = target.split('?')[0].split('#')[0];
  return clean.split('/').filter((s) => s.length > 0);
}

const NAME = 'render-conformance';

const renderConformanceGate: GateModule = {
  name: NAME,
  kind: 'static',
  appliesTo(rel: string): boolean {
    const n = rel.replaceAll('\\', '/');
    if (!REACT_SOURCE_RE.test(n)) return false;
    // React surfaces live in frontend/ (app pages, components, hooks).
    return n.includes('frontend/') || n.includes('/app/') || n.includes('/components/');
  },
  async run(ctx: GateContext): Promise<GateResult> {
    const reds: GateRed[] = [];
    let routeWiresSeen = 0;
    let anyUnobservableGrammar = false;
    let anyDecided = false;
    let routeTrie: { root: RouteNode; observable: boolean } | null = null;

    for (const rel of ctx.changedFiles) {
      if (!this.appliesTo(rel)) continue;
      const newText = ctx.readFile(rel);
      if (newText == null) continue;

      // Token-correct extraction. No grammar → this file is unobservable; never
      // guess a red/green from raw bytes.
      const newAff = await extractAffordancesAst(newText, rel);
      if (newAff === null) {
        anyUnobservableGrammar = true;
        continue;
      }
      if (newAff.length === 0) {
        anyDecided = true; // a real, parsed verdict: this file declares no wire
        continue;
      }

      // NEW-affordance-only: prior content via ctx.priorOf (disk in write-direction,
      // '' in the lens so every wire is judged absolutely). A brand-new file has no
      // prior → every affordance is new.
      const priorText = ctx.priorOf(rel);
      const priorAff = priorText ? await extractAffordancesAst(priorText, rel) : [];
      const priorKeys = new Set((priorAff ?? []).map((a) => `${a.kind}:${a.target}`));

      anyDecided = true;
      for (const aff of newAff) {
        if (priorKeys.has(`${aff.kind}:${aff.target}`)) continue; // unchanged wire

        if (aff.kind === 'handler') {
          const bound = await identifierBoundAst(newText, rel, aff.target);
          if (bound === false) {
            reds.push({
              file: rel,
              locus: `L${aff.line}:${aff.col}`,
              fact: `event handler {${aff.target}} resolves to no binding (dead UI wire)`,
            });
          }
          // bound === null: grammar vanished mid-run — decline to judge this wire.
          continue;
        }

        // route wire
        routeWiresSeen++;
        if (!routeTrie) routeTrie = buildRouteTrie(ctx);
        if (!routeTrie.observable) continue; // route tree unobservable → defer
        const segs = urlSegments(aff.target);
        const resolved =
          segs.length === 0 ? routeTrie.root.hasPage : matchRoute(routeTrie.root, segs, 0);
        if (!resolved) {
          reds.push({
            file: rel,
            locus: `L${aff.line}:${aff.col}`,
            fact: `route "${aff.target}" resolves to no Next.js page (dead UI wire)`,
          });
        }
      }
    }

    const note =
      'every declared UI affordance (bare-identifier handler, literal route) resolves to a real target';

    // Brutally honest: if the only thing we had to judge were route wires and the
    // route tree was not observable, we decided nothing → unjudged, not green.
    if (reds.length === 0 && routeWiresSeen > 0 && (!routeTrie || !routeTrie.observable)) {
      return { gate: NAME, green: true, reds, note, unjudged: true };
    }
    // If no applicable file could be parsed at all (no grammar anywhere) and we
    // reached no real verdict, be honest: unjudged, not green-by-assumption.
    if (reds.length === 0 && !anyDecided && anyUnobservableGrammar) {
      return { gate: NAME, green: true, reds, note, unjudged: true };
    }
    return { gate: NAME, green: reds.length === 0, reds, note };
  },
};

export default renderConformanceGate;
