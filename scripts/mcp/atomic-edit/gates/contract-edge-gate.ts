/**
 * gates/contract-edge-gate.ts — the exoneration-free CONTRACT-EDGE fact.
 *
 * A declared interface is a set of edges. A *producer* edge declares "this exists"
 * (a controller route, an emitted event, a GraphQL field, a gRPC method). A
 * *consumer* edge uses it ("call this path", "listen for this event"). The fact:
 *   every consumer edge resolves against some producer edge, or it dangles.
 * No language server, no daemon, no human — pure perception (tree-sitter AST) over
 * the tree of files.
 *
 * PERCEPTION, NOT WHOLE-FILE REGEX. Every edge is read through the frozen perception
 * organ (gates/perception.ts) / astNodes (native-bridge.ts), which SELECTS nodes by
 * their real tree-sitter TYPE. A `@OnEvent('x')` written inside a comment or a
 * template literal is a child of a `comment` / `template_string` node, NOT a
 * `decorator` node — so a decorator query never sees it. An `apiFetch('/x')` written
 * in a doc-comment is a `comment` node, not a `call_expression` — so a call query
 * never sees it. That kills the string/comment/template false-positive a whole-file
 * regex would extract. (Before this rewrite the gate regexed the entire file text:
 * the lens exposed that `@OnEvent('x')` in a template/comment was reddened as a real
 * listener. It is now invisible — proven in contract-edge-gate.proof.ts.)
 *
 * Two edge-kinds are covered SOLIDLY because this repo has real data for them:
 *
 *  (a) HTTP  — producer = NestJS controller routes: @Controller('base') joined to
 *      each @Get/@Post/@Put/@Patch/@Delete(subpath) — all read as real `decorator`
 *      nodes. consumer = apiFetch(...) / fetch(...) path literals read as real
 *      `call_expression` nodes (the callee's leading identifier is normalized so a
 *      type-arg'd `apiFetch<T>(...)` is still recognized). Path-template containment
 *      (param/${interp} → '*', verb-agnostic — verb pairing is value-semantics,
 *      ceiling below). A consumer path whose first concrete segment is owned by SOME
 *      controller but whose arity+literals match NO route → dangling call.
 *
 *  (b) EVENTS — producer = `.emit('name', …)` first-arg literals (backend+worker),
 *      read as real `call_expression` nodes whose callee tail is `emit`. consumer =
 *      `@OnEvent('name')` listener literals, read as real `decorator` nodes. consumer
 *      ∈ producer set or the listener dangles. (This repo currently has emits but
 *      few/no real @OnEvent listeners → this side is usually vacuously green: honest,
 *      not faked.)
 *
 * GraphQL / gRPC are best-effort: if no .graphql/.proto producers exist in the tree
 * the gate asserts nothing about them (no red, no green-by-assumption).
 *
 * Semantics (mirrors connection-gate.ts):
 *  - Only SOURCE consumer files are judged (.ts/.tsx/.js/.jsx/.mjs/.cjs). Other
 *    files carry no contract-consumer fact → not a red here.
 *  - NEW-edge-only: a consumer edge is judged only if it is NOT present in the
 *    file's prior (disk/overlay-before, via ctx.priorOf) content. A pre-existing
 *    dangling call in a legacy file never blocks an unrelated edit — but no write may
 *    INTRODUCE one.
 *  - Undecidable consumers (dynamically-composed first segment, namespace no
 *    controller owns, wildcard listeners, non-literal names) are SKIPPED, never
 *    reddened. The gate states ONE fact it can prove; everything else it declines.
 *  - If a changed file's language has no grammar (perception returns null) its
 *    consumer edges are undecidable → skipped, never red-by-guess.
 *  - If no contract-edge fact exists in this run → notApplicable:true (explicit non-applicability).
 *
 * Ceiling (NOT provable from bytes — deferred to the dynamic/effect gate):
 *  - HTTP verb correctness (path exists but method differs), request/response
 *    SHAPE/value conformance, Next.js proxy-route rewrites (/api/* → backend),
 *    cross-service producers not on this disk, runtime-only event names.
 *  - Perception requires a tree-sitter grammar; with no grammar the file degrades to
 *    unjudged rather than a regex guess.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateContext, type GateModule, type GateRed, type GateResult } from './contract.js';
import { decorators, langOf, type CallFact } from './perception.js';
import { astNodes } from '../native-bridge.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const CONTROLLER_RE = /\.controller\.(ts|js)$/;

const HTTP_VERB_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All']);

/** A producer/consumer edge normalized to canonical comparable form. */
interface HttpRoute {
  /** segments with params/interps collapsed to '*' */
  segs: string[];
}

/* ────────────────────────────── perception: calls ───────────────────────────── */

const unquote = (s: string): string | null => {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === "'" || t[0] === '"' || t[0] === '`') && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return null;
};

/**
 * Call facts read from real `call_expression` nodes only (token-correct: a call
 * written inside a comment/string is a comment/string node, not a call_expression,
 * so it is never returned). This mirrors perception.calls but additionally tolerates
 * a generic type-argument suffix on the callee (`apiFetch<T>(...)`, the dominant
 * frontend pattern) — perception.calls drops those because its callee regex forbids
 * `<`. The callee is normalized to its leading dotted-identifier run (stripping the
 * `<…>` type-args), which is exactly the call target. arg0 is the first
 * string-literal argument, read from THIS node's own text. Returns null when no
 * grammar is available (caller degrades / marks unjudged).
 */
async function callFacts(content: string, rel: string): Promise<CallFact[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang, new Set(['call_expression']));
  if (nodes === null) return null;
  const out: CallFact[] = [];
  for (const n of nodes) {
    const open = n.text.indexOf('(');
    if (open <= 0) continue;
    const rawCallee = n.text.slice(0, open).trim();
    // Strip a trailing generic type-argument suffix: 'apiFetch<Record<string,X>>' → 'apiFetch'.
    const m = /^([A-Za-z_$][\w$.]*)/.exec(rawCallee);
    if (!m) continue; // computed / complex callee (e.g. (a||b)(…), arr[i](…)) → skip
    const callee = m[1];
    // arg0: first string/template literal inside the call's own text.
    const argm = /\(\s*(['"`][^'"`]*['"`])/.exec(n.text);
    const arg0 = argm ? unquote(argm[1]) : null;
    out.push({ callee, arg0, line: n.line, column: n.column });
  }
  return out;
}

/** Tail segment of a (possibly member) callee: 'this.events.emit' → 'emit'. */
const calleeTail = (callee: string): string => {
  const i = callee.lastIndexOf('.');
  return i === -1 ? callee : callee.slice(i + 1);
};

/** HTTP-consumer call targets: a bare `apiFetch`/`fetch`, not a member access. */
function isHttpConsumerCall(callee: string): boolean {
  return callee === 'apiFetch' || callee === 'fetch';
}

/** Emit-producer call targets: any callee whose tail is `emit` (e.g. `this.events.emit`). */
function isEmitCall(callee: string): boolean {
  return calleeTail(callee) === 'emit';
}

/* ────────────────────────────── HTTP producers ───────────────────────────── */

/** Collapse a path into canonical segments: ':p', '{p}', '${…}' segments → '*'. */
function normSegs(rawPath: string): string[] {
  const cleaned = rawPath.replace(/^\/+|\/+$/g, '');
  if (cleaned === '') return [];
  return cleaned.split('/').map((s) => {
    if (s.startsWith(':')) return '*'; // Nest path param
    if (s.startsWith('{') && s.endsWith('}')) return '*'; // OpenAPI/curly param
    if (s.includes('${') || s.includes('+') || /[`]/.test(s)) return '*'; // interp/concat
    return s;
  });
}

const join = (segs: string[]): string => segs.join('/');

/**
 * Extract controller routes from one controller file's text via perception: the
 * @Controller base decorator joined to every HTTP-verb method decorator subpath.
 * Verb is discarded (the fact is path-existence). A verb decorator with no string
 * arg contributes the base only. Decorators are read from real `decorator` nodes,
 * so a `@Controller('x')` written in a comment/string is never extracted. Returns
 * null when the grammar is unavailable.
 */
export async function extractControllerRoutes(content: string, rel: string): Promise<HttpRoute[] | null> {
  const decs = await decorators(content, rel);
  if (decs === null) return null;
  // first @Controller decorator owns the base namespace (one per controller class).
  const baseDec = decs.find((d) => d.name === 'Controller');
  const base = baseDec && baseDec.arg !== null ? normSegs(baseDec.arg) : [];
  const routes: HttpRoute[] = [];
  let sawVerb = false;
  for (const d of decs) {
    if (!HTTP_VERB_DECORATORS.has(d.name)) continue;
    sawVerb = true;
    const sub = d.arg === null ? [] : normSegs(d.arg);
    routes.push({ segs: [...base, ...sub] });
  }
  // a @Controller with no method decorators still owns its base namespace
  if (!sawVerb && base.length > 0) routes.push({ segs: base });
  return routes;
}

/** Recursively collect *.controller.ts files under a dir (bounded, skips node_modules/dist). */
function collectControllerFiles(absDir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const name = e.name;
    if (e.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.git' || name === '.next') continue;
      collectControllerFiles(path.join(absDir, name), out);
    } else if (CONTROLLER_RE.test(name) && !/\.spec\.|\.test\./.test(name)) {
      out.push(path.join(absDir, name));
    }
  }
}

/** Build the full HTTP producer universe: controllers on disk, overridden by overlay. */
async function buildHttpProducers(ctx: GateContext): Promise<{ routes: HttpRoute[]; ownedFirsts: Set<string> }> {
  const routes: HttpRoute[] = [];
  const files: string[] = [];
  for (const root of ['backend/src']) {
    collectControllerFiles(path.join(ctx.repoRoot, root), files);
  }
  const norm = (p: string): string => path.relative(ctx.repoRoot, p).replaceAll('\\', '/');
  // overlay controllers that are not yet on disk (new files in this transaction)
  const seen = new Set(files.map(norm));
  for (const rel of ctx.overlay.keys()) {
    if (CONTROLLER_RE.test(rel) && !/\.spec\.|\.test\./.test(rel) && !seen.has(rel)) {
      files.push(path.join(ctx.repoRoot, rel));
      seen.add(rel);
    }
  }
  const ownedFirsts = new Set<string>();
  for (const abs of files) {
    const rel = norm(abs);
    const text = ctx.readFile(rel);
    if (text === null) continue;
    const extracted = await extractControllerRoutes(text, rel);
    if (extracted === null) continue; // no grammar for this file → skip (cannot read producers)
    for (const r of extracted) {
      routes.push(r);
      if (r.segs.length > 0 && r.segs[0] !== '*') ownedFirsts.add(r.segs[0]);
    }
  }
  return { routes, ownedFirsts };
}

/** Does a concrete consumer path resolve against ANY producer route? (arity + literal/wildcard). */
function httpResolves(consumer: string[], producers: HttpRoute[]): boolean {
  return producers.some((p) => {
    if (p.segs.length !== consumer.length) return false;
    for (let i = 0; i < consumer.length; i++) {
      const ps = p.segs[i];
      const cs = consumer[i];
      if (ps === '*' || cs === '*') continue; // param/interp matches anything at this slot
      if (ps !== cs) return false;
    }
    return true;
  });
}

/* ────────────────────────────── Event edges ───────────────────────────── */

/** Recursively collect source files under a dir (bounded). */
function collectSourceFiles(absDir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const name = e.name;
    if (e.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.git' || name === '.next') continue;
      collectSourceFiles(path.join(absDir, name), out);
    } else if (SOURCE_RE.test(name)) {
      out.push(path.join(absDir, name));
    }
  }
}

/**
 * Extract `.emit('name', …)` first-arg string literals via perception — real
 * `call_expression` nodes whose callee tail is `emit`. An `.emit('x')` written in a
 * comment/string is never returned. Returns null when no grammar is available.
 */
export async function extractEmittedEvents(content: string, rel: string): Promise<string[] | null> {
  const cf = await callFacts(content, rel);
  if (cf === null) return null;
  const out: string[] = [];
  for (const c of cf) {
    if (isEmitCall(c.callee) && c.arg0 !== null) out.push(c.arg0);
  }
  return out;
}

/**
 * Extract `@OnEvent('name')` listener literals via perception — real `decorator`
 * nodes named OnEvent. Skips wildcard/non-literal listeners. A `@OnEvent('x')`
 * written in a template literal or comment is NOT a decorator node → never returned
 * (the FP this rewrite kills). Returns null when no grammar is available.
 */
export async function extractOnEventListeners(content: string, rel: string): Promise<string[] | null> {
  const decs = await decorators(content, rel);
  if (decs === null) return null;
  const out: string[] = [];
  for (const d of decs) {
    if (d.name !== 'OnEvent') continue;
    if (d.arg === null) continue; // non-literal listener → undecidable
    if (d.arg.includes('*')) continue; // wildcard listener → undecidable
    out.push(d.arg);
  }
  return out;
}

/** Extract apiFetch/fetch path literals via perception — real `call_expression` nodes. */
async function extractHttpConsumerPaths(content: string, rel: string): Promise<string[] | null> {
  const cf = await callFacts(content, rel);
  if (cf === null) return null;
  const out: string[] = [];
  for (const c of cf) {
    if (isHttpConsumerCall(c.callee) && c.arg0 !== null) out.push(c.arg0);
  }
  return out;
}

/** Build the emitted-event producer universe (backend+worker), overlay-overridden. */
async function buildEventProducers(ctx: GateContext): Promise<Set<string>> {
  const files: string[] = [];
  for (const root of ['backend/src', 'worker/src']) {
    collectSourceFiles(path.join(ctx.repoRoot, root), files);
  }
  const norm = (p: string): string => path.relative(ctx.repoRoot, p).replaceAll('\\', '/');
  const seen = new Set(files.map(norm));
  for (const rel of ctx.overlay.keys()) {
    if (SOURCE_RE.test(rel) && !seen.has(rel)) {
      files.push(path.join(ctx.repoRoot, rel));
      seen.add(rel);
    }
  }
  const events = new Set<string>();
  for (const abs of files) {
    const rel = norm(abs);
    const text = ctx.readFile(rel);
    if (text === null) continue;
    const emitted = await extractEmittedEvents(text, rel);
    if (emitted === null) continue; // no grammar → skip
    for (const ev of emitted) events.add(ev);
  }
  return events;
}

/* ────────────────────────────── the gate ───────────────────────────── */

async function run(ctx: GateContext): Promise<GateResult> {
  const reds: GateRed[] = [];
  let judgedAny = false;

  // Lazily build producer universes only if a consumer edge of that kind appears.
  let httpProducers: { routes: HttpRoute[]; ownedFirsts: Set<string> } | null = null;
  let eventProducers: Set<string> | null = null;

  for (const rel of ctx.changedFiles) {
    if (!SOURCE_RE.test(rel)) continue;
    const now = ctx.readFile(rel);
    if (now === null) continue;
    const before = ctx.priorOf(rel);

    // Perception over the new + prior content. null ⇒ no grammar ⇒ undecidable file.
    const nowHttp = await extractHttpConsumerPaths(now, rel);
    const nowEvt = await extractOnEventListeners(now, rel);
    if (nowHttp === null && nowEvt === null) continue; // unparseable language → skip, never red-by-guess

    const beforeHttp = new Set((await extractHttpConsumerPaths(before, rel)) ?? []);
    const beforeEvt = new Set((await extractOnEventListeners(before, rel)) ?? []);

    // ── HTTP consumer edges ──
    for (const raw of nowHttp ?? []) {
      if (beforeHttp.has(raw)) continue; // not this write's claim
      if (!raw.startsWith('/')) continue; // relative/external/proxy-composed → not a backend path we own
      if (raw.startsWith('/api/') || raw === '/api') continue; // Next.js App-Router proxy namespace (frontend/src/app/api/**/route.ts) — not the NestJS @Controller graph this gate models
      const segs = normSegs(raw);
      if (segs.length === 0) continue; // root path — nothing to assert
      if (segs[0] === '*') continue; // dynamically-composed first segment → undecidable
      if (httpProducers === null) httpProducers = await buildHttpProducers(ctx);
      // only judge paths under a namespace some controller actually owns
      if (!httpProducers.ownedFirsts.has(segs[0])) continue; // e.g. /api/* Next proxy, external → out of universe
      judgedAny = true;
      if (!httpResolves(segs, httpProducers.routes)) {
        reds.push({
          file: rel,
          locus: raw,
          fact: `HTTP call '${raw}' resolves to no controller route (no @Controller+@Verb produces path '/${join(segs)}')`,
        });
      }
    }

    // ── EVENT consumer edges (@OnEvent listeners) ──
    for (const name of nowEvt ?? []) {
      if (beforeEvt.has(name)) continue;
      if (eventProducers === null) eventProducers = await buildEventProducers(ctx);
      judgedAny = true;
      if (!eventProducers.has(name)) {
        reds.push({
          file: rel,
          locus: `@OnEvent('${name}')`,
          fact: `event listener '@OnEvent('${name}')' has no producer (no .emit('${name}', …) anywhere in backend/worker)`,
        });
      }
    }
  }

  const note =
    'every HTTP call path resolves to a controller route, and every @OnEvent listener has an emitter';
  if (!judgedAny) {
    return { gate: 'contract-edge', green: true, reds: [], note, notApplicable: true };
  }
  return { gate: 'contract-edge', green: reds.length === 0, reds, note };
}

const gate: GateModule = {
  name: 'contract-edge',
  kind: 'static',
  appliesTo: (rel: string): boolean => SOURCE_RE.test(rel),
  run,
};

export default gate;
