/**
 * gates/contract-edge-gate.ts — the exoneration-free CONTRACT-EDGE fact.
 *
 * A declared interface is a set of edges. A *producer* edge declares "this exists"
 * (a controller route, an emitted event, a GraphQL field, a gRPC method). A
 * *consumer* edge uses it ("call this path", "listen for this event"). The fact:
 *   every consumer edge resolves against some producer edge, or it dangles.
 * No language server, no daemon, no human — pure bytes + tree-of-files reads.
 *
 * Two edge-kinds are covered SOLIDLY because this repo has real data for them:
 *
 *  (a) HTTP  — producer = NestJS controller routes: @Controller('base') joined to
 *      each @Get/@Post/@Put/@Patch/@Delete(subpath). consumer = apiFetch(...) /
 *      fetch(...) path literals. Path-template containment (param/${interp} → '*',
 *      verb-agnostic — verb pairing is value-semantics, ceiling below). A consumer
 *      path whose first concrete segment is owned by SOME controller but whose
 *      arity+literals match NO route → dangling call.
 *
 *  (b) EVENTS — producer = `.emit('name', …)` first-arg literals (backend+worker).
 *      consumer = `@OnEvent('name')` listener literals. consumer ∈ producer set or
 *      the listener dangles. (This repo currently has emits but few/no real
 *      @OnEvent listeners → this side is usually vacuously green: honest, not faked.)
 *
 * GraphQL / gRPC are best-effort: if no .graphql/.proto producers exist in the tree
 * the gate asserts nothing about them (no red, no green-by-assumption).
 *
 * Semantics (mirrors connection-gate.ts):
 *  - Only SOURCE consumer files are judged (.ts/.tsx/.js/.jsx/.mjs/.cjs). Other
 *    files carry no contract-consumer fact → not a red here.
 *  - NEW-edge-only: a consumer edge is judged only if it is NOT present in the
 *    file's prior (disk/overlay-before) content. A pre-existing dangling call in a
 *    legacy file never blocks an unrelated edit — but no write may INTRODUCE one.
 *  - Undecidable consumers (dynamically-composed first segment, namespace no
 *    controller owns, wildcard listeners, non-literal names) are SKIPPED, never
 *    reddened. The gate states ONE fact it can prove; everything else it declines.
 *  - If nothing decidable was judged this run → unjudged:true (never green-by-default).
 *
 * Ceiling (NOT provable from bytes — deferred to the dynamic/effect gate):
 *  - HTTP verb correctness (path exists but method differs), request/response
 *    SHAPE/value conformance, Next.js proxy-route rewrites (/api/* → backend),
 *    cross-service producers not on this disk, runtime-only event names.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateContext, type GateModule, type GateRed, type GateResult } from './contract.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const CONTROLLER_RE = /\.controller\.(ts|js)$/;

/** A producer/consumer edge normalized to canonical comparable form. */
interface HttpRoute {
  /** segments with params/interps collapsed to '*' */
  segs: string[];
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
 * Extract controller routes from one controller file's text: the @Controller base
 * joined to every HTTP-verb method decorator subpath. Verb is discarded (the fact
 * is path-existence). Decorators with non-literal args contribute the base only.
 */
export function extractControllerRoutes(content: string): HttpRoute[] {
  const baseM = /@Controller\(\s*(['"`])([^'"`]*)\1/.exec(content);
  const base = baseM ? normSegs(baseM[2]) : [];
  const routes: HttpRoute[] = [];
  // every method-verb decorator; capture optional first string-literal arg
  const verbRe = /@(?:Get|Post|Put|Patch|Delete|All)\(\s*(?:(['"`])([^'"`]*)\1)?/g;
  let m: RegExpExecArray | null;
  let sawVerb = false;
  while ((m = verbRe.exec(content)) !== null) {
    sawVerb = true;
    const sub = m[2] === undefined ? [] : normSegs(m[2]);
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
function buildHttpProducers(ctx: GateContext): { routes: HttpRoute[]; ownedFirsts: Set<string> } {
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
    for (const r of extractControllerRoutes(text)) {
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

/* ────────────────────────────── HTTP consumers ───────────────────────────── */

/** Extract apiFetch/fetch path literals (string or template) from consumer text. */
export function extractHttpConsumerPaths(content: string): string[] {
  const out: string[] = [];
  // optional type-arg may contain nested generics (e.g. apiFetch<Record<string, X>>(…)):
  // allow internal '>' but never cross a call-paren or string-quote before the '('.
  const re = /\b(?:apiFetch|fetch)\s*(?:<[^('"`]*?>\s*)?\(\s*([`'"])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[2]);
  return out;
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

/** Extract `.emit('name', …)` first-arg string literals. */
export function extractEmittedEvents(content: string): string[] {
  const out: string[] = [];
  const re = /\.emit\(\s*(['"`])([^'"`]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[2]);
  return out;
}

/** Extract `@OnEvent('name')` listener literals (skips wildcard/non-literal). */
export function extractOnEventListeners(content: string): string[] {
  const out: string[] = [];
  const re = /@OnEvent\(\s*(['"`])([^'"`]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[2];
    if (name.includes('*')) continue; // wildcard listener → undecidable
    out.push(name);
  }
  return out;
}

/** Build the emitted-event producer universe (backend+worker), overlay-overridden. */
function buildEventProducers(ctx: GateContext): Set<string> {
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
    const text = ctx.readFile(norm(abs));
    if (text === null) continue;
    for (const ev of extractEmittedEvents(text)) events.add(ev);
  }
  return events;
}

/* ────────────────────────────── NEW-edge diff ───────────────────────────── */

/** Prior (overlay-before / disk) content for a changed file: null if brand-new. */
function priorContent(ctx: GateContext, rel: string): string | null {
  // overlay holds the NEW text; prior = disk. A file present on disk has a prior.
  try {
    return fs.readFileSync(path.join(ctx.repoRoot, rel), 'utf8');
  } catch {
    return null;
  }
}

/* ────────────────────────────── the gate ───────────────────────────── */

function run(ctx: GateContext): GateResult {
  const reds: GateRed[] = [];
  let judgedAny = false;

  // Lazily build producer universes only if a consumer edge of that kind appears.
  let httpProducers: { routes: HttpRoute[]; ownedFirsts: Set<string> } | null = null;
  let eventProducers: Set<string> | null = null;

  for (const rel of ctx.changedFiles) {
    if (!SOURCE_RE.test(rel)) continue;
    const now = ctx.readFile(rel);
    if (now === null) continue;
    const before = priorContent(ctx, rel);
    const beforeHttp = new Set(before === null ? [] : extractHttpConsumerPaths(before));
    const beforeEvt = new Set(before === null ? [] : extractOnEventListeners(before));

    // ── HTTP consumer edges ──
    for (const raw of extractHttpConsumerPaths(now)) {
      if (beforeHttp.has(raw)) continue; // not this write's claim
      if (!raw.startsWith('/')) continue; // relative/external/proxy-composed → not a backend path we own
      const segs = normSegs(raw);
      if (segs.length === 0) continue; // root path — nothing to assert
      if (segs[0] === '*') continue; // dynamically-composed first segment → undecidable
      if (httpProducers === null) httpProducers = buildHttpProducers(ctx);
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
    for (const name of extractOnEventListeners(now)) {
      if (beforeEvt.has(name)) continue;
      if (eventProducers === null) eventProducers = buildEventProducers(ctx);
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
    return { gate: 'contract-edge', green: true, reds: [], note, unjudged: true };
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
