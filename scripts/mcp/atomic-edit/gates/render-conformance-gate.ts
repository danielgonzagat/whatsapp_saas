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
 */
import {
  type GateContext,
  type GateModule,
  type GateRed,
  type GateResult,
} from './contract.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** React/JSX source we are willing to judge. */
const REACT_SOURCE_RE = /\.(tsx|jsx|ts|js|mjs|cjs)$/;
/** Signals that a file is actually a React/JSX surface (else: no affordance fact). */
const JSX_SIGNAL_RE = /\bon[A-Z][A-Za-z]*\s*=\s*\{|<[A-Z][A-Za-z]/;
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

function lineColOf(text: string, index: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, col: index - last };
}

/**
 * Extract the affordances this content DECLARES.
 *  - handler: `onX={bareIdent}` only (arrow / member / param shapes excluded by
 *    the `}` boundary and the identifier-only capture).
 *  - route: literal absolute path in href= / <Link href> / router.push|replace().
 */
export function extractAffordances(content: string): Affordance[] {
  const out: Affordance[] = [];
  // (A) bare-identifier event handler. The trailing \s*\} guarantees the capture
  // is the WHOLE expression — `onClick={a.b}` / `onClick={()=>x}` will not match.
  const handlerRe = /\bon[A-Z][A-Za-z]*\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = handlerRe.exec(content)) !== null) {
    const lc = lineColOf(content, m.index);
    out.push({ target: m[1], kind: 'handler', line: lc.line, col: lc.col });
  }
  // (B) literal absolute route paths. href="/x" | href={'/x'} | router.push('/x')
  // | router.replace("/x"). Only paths that start with '/' (absolute, app-internal).
  const routeRe =
    /\b(?:href\s*=\s*\{?\s*|router\s*\.\s*(?:push|replace)\s*\(\s*)['"](\/[^'"`]*)['"]/g;
  while ((m = routeRe.exec(content)) !== null) {
    const lc = lineColOf(content, m.index);
    out.push({ target: m[1], kind: 'route', line: lc.line, col: lc.col });
  }
  return out;
}

/**
 * An identifier is BOUND if it appears ANYWHERE in the file other than purely as
 * the handler reference itself — i.e. it is imported, declared, or arrives as a
 * (destructured) prop / param. Exoneration-free & conservative: we red ONLY when
 * the identifier occurs nowhere else, which is the genuine dangling wire (deleted
 * or mistyped handler). This agrees with an LSP "no definition found".
 */
export function identifierIsBound(content: string, ident: string): boolean {
  const re = new RegExp(`(?<![\\w$])${escapeRe(ident)}(?![\\w$])`, 'g');
  let count = 0;
  while (re.exec(content) !== null) {
    count++;
    if (count > 1) return true; // referenced somewhere beyond the handler use
  }
  return false; // the ONLY occurrence is the handler attribute → dangling
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  run(ctx: GateContext): GateResult {
    const reds: GateRed[] = [];
    let routeWiresSeen = 0;
    let routeTrie: { root: RouteNode; observable: boolean } | null = null;

    for (const rel of ctx.changedFiles) {
      if (!this.appliesTo(rel)) continue;
      const newText = ctx.readFile(rel);
      if (newText == null || !JSX_SIGNAL_RE.test(newText)) continue;

      // NEW-affordance-only: prior content = direct disk read (overlay holds the
      // new text). A brand-new file has no prior → every affordance is new.
      const priorText = ctx.priorOf(rel);
      const priorKeys = new Set(
        extractAffordances(priorText).map((a) => `${a.kind}:${a.target}`),
      );

      for (const aff of extractAffordances(newText)) {
        if (priorKeys.has(`${aff.kind}:${aff.target}`)) continue; // unchanged wire

        if (aff.kind === 'handler') {
          if (!identifierIsBound(newText, aff.target)) {
            reds.push({
              file: rel,
              locus: `L${aff.line}:${aff.col}`,
              fact: `event handler {${aff.target}} resolves to no binding (dead UI wire)`,
            });
          }
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
    return { gate: NAME, green: reds.length === 0, reds, note };
  },
};

export default renderConformanceGate;
