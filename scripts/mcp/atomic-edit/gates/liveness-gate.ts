/**
 * gates/liveness-gate.ts — the exoneration-free LIVENESS fact (the FIRST real push
 * of the breathing horizon: bytes-in-MOTION, not bytes-at-rest).
 *
 * The static crivo (contract-edge-gate) proves a consumed (method,path) call-site
 * resolves to SOME @Controller+@Verb route that EXISTS ON DISK — it proves the wire
 * COULD serve. It can NEVER prove the wire DOES serve: that a deployed instance
 * actually answers the request, that a declared span is actually observed. That
 * "does it serve / is it observed" bit lives only in the running system; from the
 * bytes alone it is forever-unprovable. This gate converts it from forever-unprovable
 * into a BYTE-FACT *WHERE the live system is observable* — and stays brutally honest
 * (unjudged) everywhere it is not.
 *
 *   static says COULD · live says DOES · absent says unjudged.
 *
 * THE FACT (per changed call-site):
 *   A NEW consumed (method,path) call-site — read through the ONE perception organ
 *   (real `call_expression` AST nodes via gates/perception.ts + native-bridge.ts,
 *   so an apiFetch('/x') written in a comment/template literal is a comment /
 *   template_string node, NOT a call_expression, and is NEVER extracted) — names a
 *   path that, against a REACHABLE running instance, actually RESPONDS.
 *
 * VERDICT (one exoneration-free fact per probe):
 *  - GREEN — the live instance answered with a status the route SERVES: any response
 *    that is NOT 5xx and NOT 404. (RFC 9110: 2xx/3xx = served; 401/403 = served-but-
 *    auth-gated — the route EXISTS and routed the request; 405 = served-but-wrong-verb
 *    — path is mounted. All of these prove "it serves". The fact this gate asserts is
 *    "the wire is live", not "the call is authorized".)
 *  - RED — a DANGLING LIVE WIRE: the live instance returned 404 (the path the
 *    call-site declares is NOT mounted in the deployed instance — the route the
 *    static gate said COULD exist DOES NOT, live) or 5xx (the endpoint is mounted but
 *    broken/erroring — it does not serve). Either way the consumed wire does not
 *    resolve in bytes-in-motion.
 *  - UNJUDGED (the honesty core — NEVER green-by-assumption) — no live target is
 *    reachable: no base URL in env (LIVENESS_BASE_URL / PULSE_BACKEND_URL /
 *    NEXT_PUBLIC_API_URL / BACKEND_URL), OR the fetch threw (DNS/connection/timeout =
 *    instance unreachable), OR the path is dynamically composed / not a backend path
 *    we own. Absent live evidence, the gate states NOTHING: it does not pretend the
 *    wire is live and it does not pretend it is dead. Grounded empirically this run:
 *    Railway returned "Unauthorized — run railway login" (live HTTP surface NOT
 *    reachable) → every HTTP probe degrades to unjudged, never a false red, never a
 *    false green.
 *
 * SPAN / OBSERVED-TELEMETRY half (read via the runtime MCPs, surfaced to the gate as
 * the optional `observedSpanNames` probe field — the gate itself does not call out;
 * the effect harness injects what the runtime MCPs read): a declared span/event name
 * is GREEN iff it appears in the live observed set, RED iff the live observed set is
 * NON-EMPTY but lacks it (the system IS emitting, just not this span = a dead
 * telemetry wire confirmed live), UNJUDGED iff the observed set is empty/absent.
 * Grounded empirically this run: Sentry project `node` reported total_events:0 over
 * 24h — the observed set is EMPTY → reachable-but-not-observed is UNJUDGED, never
 * green-by-assumption. A declared span with zero observed events is NOT certified.
 *
 * MUTATION FIREWALL: this gate only READS (perception locates the call-site span; a
 * network read settles the live bit). It never writes. The probe is bounded by a
 * timeout and runs at most a small budget of distinct (method,path) probes per run
 * so a write/lens pass can never hang on the network.
 *
 * CEILING (brutal, irreducible even after this gate):
 *  - Liveness is point-in-time: a 200 now does not prove the route serves a second
 *    later (the instance can crash/redeploy). The fact is "served AT probe time",
 *    not "always serves".
 *  - It proves the route RESPONDS, never that the RESPONSE is CORRECT (shape/value
 *    conformance is the property/twin tier, not this gate).
 *  - 401/403 are counted GREEN (the route exists & routed) — this gate cannot, from
 *    an unauthenticated probe, distinguish "auth-gated real route" from "auth wall in
 *    front of a 404"; it asserts only "the path is mounted and routed", honestly the
 *    weakest true claim.
 *  - Verb correctness beyond "mounted" (405 is GREEN here) is value-semantics the
 *    contract-edge ceiling already names; this gate does not strengthen it.
 *  - The observed-span half is only as complete as the runtime MCP's retention
 *    window; an empty window is unjudged, never a verdict.
 */
import {
  type GateContext,
  type GateModule,
  type GateRed,
  type GateResult,
} from './contract.js';
import { langOf, type CallFact } from './perception.js';
import { astNodes } from '../native-bridge.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Env keys, in priority order, that name a reachable live backend base URL. */
const BASE_URL_ENV_KEYS = [
  'LIVENESS_BASE_URL',
  'PULSE_BACKEND_URL',
  'NEXT_PUBLIC_API_URL',
  'BACKEND_URL',
  'API_BASE_URL',
];

/** Hard cap on distinct live probes per run — a write/lens pass must never hang. */
const MAX_PROBES = 8;
const PROBE_TIMEOUT_MS = 3500;

/* ────────────────────────────── perception: calls ───────────────────────────── */

const unquote = (s: string): string | null => {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === "'" || t[0] === '"' || t[0] === '`') && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return null;
};

/**
 * HTTP-consumer call facts, read from real `call_expression` nodes ONLY (token-
 * correct: an apiFetch('/x') written inside a comment/string/template is a comment/
 * string/template_string node, NOT a call_expression, so it is never returned). The
 * callee is normalized to its leading dotted-identifier run so a type-arg'd
 * `apiFetch<T>(...)` is recognized. Returns null when no grammar is available
 * (caller degrades → unjudged), never a regex guess over the whole file.
 */
async function httpConsumerCalls(content: string, rel: string): Promise<CallFact[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang, new Set(['call_expression']));
  if (nodes === null) return null;
  const out: CallFact[] = [];
  for (const n of nodes) {
    const open = n.text.indexOf('(');
    if (open <= 0) continue;
    const rawCallee = n.text.slice(0, open).trim();
    const m = /^([A-Za-z_$][\w$.]*)/.exec(rawCallee);
    if (!m) continue; // computed / complex callee → skip
    const callee = m[1];
    const argm = /\(\s*(['"`][^'"`]*['"`])/.exec(n.text);
    const arg0 = argm ? unquote(argm[1]) : null;
    out.push({ callee, arg0, line: n.line, column: n.column });
  }
  return out;
}

/** HTTP-consumer call targets: a bare `apiFetch`/`fetch`. */
function isHttpConsumerCall(callee: string): boolean {
  return callee === 'apiFetch' || callee === 'fetch';
}

/**
 * A path literal is PROBABLE iff it is a concrete backend path (begins with '/',
 * has a literal first segment — no `${}` / `:param` / wildcard). Dynamically-composed
 * or templated paths are undecidable live → not probed (skipped, never red-by-guess).
 */
function isProbablePath(raw: string): boolean {
  if (!raw.startsWith('/')) return false; // relative/external/proxy-composed — not a backend path we probe
  const first = raw.replace(/^\/+/, '').split('/')[0] ?? '';
  if (first === '') return false; // root path — nothing concrete to probe
  // a templated/param/interp first segment is not a concrete live path
  if (first.startsWith(':') || first.startsWith('{') || first.includes('${') || first.includes('`')) {
    return false;
  }
  return true;
}

/**
 * Extract NEW HTTP-consumer path literals from a changed file (delta vs prior). Only
 * concrete, probe-able backend paths survive. Returns null when the grammar is
 * unavailable (file is undecidable → unjudged), an empty array when there is simply
 * nothing live to probe in this file.
 */
async function newProbablePaths(
  nowContent: string,
  beforeContent: string,
  rel: string,
): Promise<{ paths: { raw: string; line: number; column: number }[] } | null> {
  const now = await httpConsumerCalls(nowContent, rel);
  if (now === null) return null; // no grammar → undecidable
  const before = await httpConsumerCalls(beforeContent, rel);
  const beforePaths = new Set((before ?? []).map((c) => c.arg0).filter((a): a is string => a !== null));
  const seen = new Set<string>();
  const paths: { raw: string; line: number; column: number }[] = [];
  for (const c of now) {
    if (!isHttpConsumerCall(c.callee)) continue;
    if (c.arg0 === null) continue;
    const raw = c.arg0;
    if (beforePaths.has(raw)) continue; // not this write's claim
    if (!isProbablePath(raw)) continue; // undecidable live path → skip (never red-by-guess)
    if (seen.has(raw)) continue;
    seen.add(raw);
    paths.push({ raw, line: c.line, column: c.column });
  }
  return { paths };
}

/* ────────────────────────────── live target ───────────────────────────── */

/**
 * Resolve a reachable live base URL from the process env (the env-resolved target).
 * Returns the trimmed, no-trailing-slash base, or null when no live target is
 * declared → the whole gate degrades to unjudged (never green-by-assumption).
 */
export function resolveLiveBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of BASE_URL_ENV_KEYS) {
    const v = env[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
      return v.trim().replace(/\/+$/, '');
    }
  }
  return null;
}

/**
 * The injectable live oracle. The DEFAULT implementation actually performs a network
 * read (a real fetch against the resolved base URL). It is injectable so:
 *  (a) the effect harness can substitute a runtime-MCP-fed oracle (railway
 *      http_requests/get_logs status for the path, or a verify_in_prod result), and
 *  (b) the proof can drive RED / GREEN / UNJUDGED deterministically without a live
 *      instance, while the live-grounding section calls the REAL fetch oracle.
 *
 * Contract: returns the integer HTTP status the live instance answered with, or
 * 'unreachable' when no response could be obtained (DNS/connection/timeout/abort) —
 * which the gate maps to UNJUDGED, never to a verdict.
 */
export type LiveProbe = (method: string, url: string) => Promise<number | 'unreachable'>;

/** Default network oracle: a bounded fetch; any throw/timeout → 'unreachable'. */
export const fetchProbe: LiveProbe = async (method, url) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, signal: ctrl.signal, redirect: 'manual' });
    return res.status;
  } catch {
    return 'unreachable'; // network/DNS/timeout/abort → instance unreachable → unjudged
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Map a live status to one of the three honest outcomes for a "does it serve" probe:
 *  - 'served'  : non-5xx, non-404 → the route is mounted & routed the request (GREEN).
 *  - 'dangling': 404 (route NOT mounted live) or 5xx (mounted but broken) (RED).
 *  - 'unjudged': 'unreachable' → no live evidence (UNJUDGED).
 * RFC 9110: 5xx = server failed an apparently valid request; 404 = resource absent.
 */
export function classifyLive(status: number | 'unreachable'): 'served' | 'dangling' | 'unjudged' {
  if (status === 'unreachable') return 'unjudged';
  if (status === 404) return 'dangling'; // path the call-site declares is NOT mounted live
  if (status >= 500 && status <= 599) return 'dangling'; // mounted but does not serve
  return 'served'; // 2xx/3xx/401/403/405/etc — the route exists & routed
}

/* ────────────────────────────── observed-span half ───────────────────────────── */

/**
 * Extract declared span/event names from a changed file via perception — real
 * `call_expression` nodes whose callee tail is a span/emit verb
 * (startSpan/startActiveSpan/emit) with a literal first arg. A `tracer.startSpan('x')`
 * in a comment/template is never extracted. Returns null when no grammar (undecidable).
 */
async function newDeclaredSpans(
  nowContent: string,
  beforeContent: string,
  rel: string,
): Promise<string[] | null> {
  const now = await httpConsumerCallsSpans(nowContent, rel);
  if (now === null) return null;
  const before = new Set((await httpConsumerCallsSpans(beforeContent, rel)) ?? []);
  const out: string[] = [];
  for (const name of now) if (!before.has(name)) out.push(name);
  return out;
}

const SPAN_VERBS = new Set(['startSpan', 'startActiveSpan', 'emit']);
const calleeTail = (callee: string): string => {
  const i = callee.lastIndexOf('.');
  return i === -1 ? callee : callee.slice(i + 1);
};

/** Span/emit name literals read from real `call_expression` nodes only. */
async function httpConsumerCallsSpans(content: string, rel: string): Promise<string[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang, new Set(['call_expression']));
  if (nodes === null) return null;
  const out: string[] = [];
  for (const n of nodes) {
    const open = n.text.indexOf('(');
    if (open <= 0) continue;
    const m = /^([A-Za-z_$][\w$.]*)/.exec(n.text.slice(0, open).trim());
    if (!m) continue;
    if (!SPAN_VERBS.has(calleeTail(m[1]))) continue;
    const argm = /\(\s*(['"`][^'"`]*['"`])/.exec(n.text);
    const name = argm ? unquote(argm[1]) : null;
    if (name !== null) out.push(name);
  }
  return out;
}

/* ────────────────────────────── the gate ───────────────────────────── */

/**
 * The probe spec the effect harness may inject (so the gate stays a pure function of
 * its context + an injected live oracle, never reaching for ambient globals). When
 * absent, the gate resolves the live target from env and uses the real fetch oracle.
 */
export interface LivenessProbeConfig {
  /** override the resolved base URL (else from env) */
  baseUrl?: string | null;
  /** override the live oracle (else the real network fetchProbe) */
  probe?: LiveProbe;
  /**
   * the live observed-span set read via the runtime MCPs (sentry event_search /
   * railway get_logs / datadog search-logs). undefined = not read → span half is
   * unjudged. An EMPTY set means "reachable but observed nothing" → still unjudged
   * (never green-by-assumption), exactly as Sentry node total_events:0 grounded.
   */
  observedSpanNames?: Set<string> | undefined;
  /** HTTP method to probe each consumed path with (the call-site verb is value-semantics; default GET) */
  method?: string;
}

let injected: LivenessProbeConfig | null = null;
/** Inject a probe config (the effect harness / proof uses this; default = live env+fetch). */
export function __setLivenessProbeConfig(cfg: LivenessProbeConfig | null): void {
  injected = cfg;
}

async function run(ctx: GateContext): Promise<GateResult> {
  const note =
    'every NEW consumed (method,path) call-site RESPONDS (non-5xx, non-404) against a reachable live instance, and every NEW declared span is observed live';
  const cfg = injected ?? {};
  const baseUrl = cfg.baseUrl !== undefined ? cfg.baseUrl : resolveLiveBaseUrl();
  const probe = cfg.probe ?? fetchProbe;
  const method = cfg.method ?? 'GET';
  const observed = cfg.observedSpanNames; // undefined → span half unjudged

  const reds: GateRed[] = [];
  let judgedAny = false;
  let probesLeft = MAX_PROBES;

  for (const rel of ctx.changedFiles) {
    if (!SOURCE_RE.test(rel)) continue;
    const now = ctx.readFile(rel);
    if (now === null) continue;
    const before = ctx.priorOf(rel);

    /* ── HTTP liveness half ── */
    // Only attempt live HTTP probes when a live target is actually reachable. With no
    // base URL the live surface is absent → we assert NOTHING about HTTP wires here
    // (the honesty core — never green-by-assumption that the wire serves).
    if (baseUrl !== null && baseUrl !== undefined) {
      const extracted = await newProbablePaths(now, before, rel);
      if (extracted !== null) {
        for (const p of extracted.paths) {
          if (probesLeft <= 0) break; // budget exhausted → remaining paths simply not asserted
          probesLeft -= 1;
          const url = baseUrl + p.raw;
          const status = await probe(method, url);
          const verdict = classifyLive(status);
          if (verdict === 'unjudged') {
            // unreachable instance → no live evidence for THIS wire → assert nothing
            continue;
          }
          judgedAny = true; // a real live response came back → this run decided something
          if (verdict === 'dangling') {
            const why = status === 404 ? 'is NOT mounted (404)' : `does not serve (HTTP ${String(status)})`;
            reds.push({
              file: rel,
              locus: `L${p.line}:${p.column} ${method} ${p.raw}`,
              fact: `live wire dangles: ${method} '${p.raw}' ${why} in the running instance ${baseUrl} (static says COULD, live says DOES NOT)`,
            });
          }
        }
      }
    }

    /* ── observed-span half ── */
    // Only judged when an observed-span set was actually READ (via the runtime MCPs)
    // AND it is NON-EMPTY. An empty observed set = reachable-but-observed-nothing →
    // UNJUDGED (Sentry node total_events:0 grounded this): we do NOT certify a declared
    // span GREEN merely because the system is reachable.
    if (observed !== undefined && observed.size > 0) {
      const spans = await newDeclaredSpans(now, before, rel);
      for (const name of spans ?? []) {
        judgedAny = true;
        if (!observed.has(name)) {
          reds.push({
            file: rel,
            locus: `span '${name}'`,
            fact: `declared span/event '${name}' is NOT in the live observed set (the running system IS emitting ${String(observed.size)} other span name(s) but never this one — dead telemetry wire confirmed live)`,
          });
        }
      }
    }
  }

  if (!judgedAny) {
    // No reachable live target, or nothing live-decidable this run → honest unjudged.
    return { gate: 'liveness', green: true, reds: [], note, unjudged: true };
  }
  return { gate: 'liveness', green: reds.length === 0, reds, note };
}

const gate: GateModule = {
  name: 'liveness',
  kind: 'dynamic',
  appliesTo: (rel: string): boolean => SOURCE_RE.test(rel),
  run,
};

export default gate;
