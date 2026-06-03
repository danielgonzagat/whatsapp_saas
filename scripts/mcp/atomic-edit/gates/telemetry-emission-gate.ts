/**
 * gates/telemetry-emission-gate.ts — the exoneration-free TELEMETRY-EMISSION fact.
 *
 * ATOM dissolved: OpenTelemetry's inferred half. A declared telemetry edge
 * (logger.X / tracer.startSpan / metric.inc / structured-log emit) resolves to an
 * emitter that REALLY EXISTS — a handle declared in scope — or it is a DEAD
 * TELEMETRY WIRE: the code names an emitter the contract promises, but no such
 * emitter is declared, so nothing can ever flow through it.
 *
 * This is the byte-floor-decidable half of the telemetry contract. The dominant
 * shape in this repo (grounded by grep over backend/src) is the NestJS structured
 * logger: a class declares `private readonly logger = new Logger(X.name)` (or
 * `StructuredLogger.from(...)`), then methods emit `this.logger.warn(...)`. Same
 * for metrics (`this.httpCounter = new Counter(...)` → `this.httpCounter.inc(...)`)
 * and tracers/event-emitters. The emission handle is a member; the FACT we assert
 * is that the handle named at the call site is actually declared in the same file.
 * (lsp_definition on `httpCounter.inc` in metrics.service.ts returns a real
 * declaration; an undeclared handle returns []. This gate replicates that
 * resolution from bytes alone — no daemon, no language server.)
 *
 * MUTATION FIREWALL / PERCEPTION ORGAN: the emission set is read through the ONE
 * perception organ (gates/perception.ts → calls(content, rel)), which SELECTS real
 * tree-sitter `call_expression` nodes and keeps the member callee whole
 * (`this.logger.warn`). A `this.logger.warn(` written inside a STRING, a COMMENT, or
 * a TEMPLATE literal is a `string`/`comment`/`template_string` node — NOT a
 * `call_expression` — so it is never extracted as an emission. The previous regex
 * (`\bthis\.<h>\.<verb>\s*\(`) matched those textual look-alikes and could RED a
 * `tracer`/`counter` named only inside a string/comment as a "dead wire". This
 * rewrite removes that whole class of string/comment/template false-positive.
 *
 * Semantics (universal, no exoneration, no guess):
 *  - Only SOURCE files are judged (.ts/.tsx/.js/.jsx/.mjs/.cjs). Other files carry
 *    no telemetry-emission fact → green.
 *  - A telemetry emission is a `call_expression` whose callee is exactly
 *    `this.<handle>.<emit>` where <emit> is a known telemetry verb
 *    (log/error/warn/debug/verbose/fatal | inc/add/record/observe/increment/gauge/
 *    timing/count | startSpan/startActiveSpan | emit/emitAsync). `this.` anchors it
 *    to a class member, the only handle a static byte scan can prove
 *    declared-or-not within one file.
 *  - GREEN: every emission's <handle> has a declaration in the same file (a field
 *    `<handle> =` / `<handle>:` / `this.<handle> =`, OR a constructor parameter
 *    `private/readonly ... <handle>:`). RED: a handle named at an emission site
 *    with NO declaration in the file = dead telemetry wire.
 *  - Only NEW emissions are this write's claim (write direction): an emission whose
 *    exact callee already existed in the prior content never reddens an unrelated
 *    edit — but no write may INTRODUCE a dangling telemetry handle. Read direction
 *    (the lens, priorOf === '') judges every emission absolutely.
 *  - NOT_APPLICABLE: a perceivable changed file with zero telemetry emissions has
 *    no telemetry fact to assert. UNJUDGED is reserved for files whose grammar is
 *    unavailable (perception returns null) — never red-by-guess, never green-by-
 *    assumption.
 *
 * CEILING (carried as unjudged — TRUTH_INFERRED, never TRUTH_OBSERVED): this gate
 * proves the emitter EXISTS and (with the reachability gate's spirit) COULD emit.
 * It can NEVER prove it DID emit in production. That is the live tier — pulse
 * otel-runtime calls it OTEL_SOURCE_SIMULATED / OTEL_KIND_AST_STATIC_MAP
 * (buildStaticTraceSeed derives a trace from the AST graph, NOT real spans), vs
 * OTEL_SOURCE_REAL / isRuntimeObservedSource for actually-observed spans. Empirical
 * proof of the gap: Sentry project `node` reported total_events:0 over 24h — a
 * point this gate certifies "could emit" produced ZERO observed events. p99 /
 * observed-span / "did it boot" is the world, not the bytes → deferred to the live
 * probe gate.
 */
import { type GateModule, type GateContext, type GateResult, type GateRed } from './contract.js';
import { calls, type CallFact } from './perception.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Known telemetry-emission verbs. Grouped only for documentation; the set is the
 * contracted edges: a structured log, a span open, a metric mutation, an event
 * emission. (Grounded against backend/src: logger.warn/error/log/debug dominate;
 * metrics.service uses Counter.inc / Histogram.observe.)
 */
const EMIT_VERBS = new Set<string>([
  // structured logging (NestJS Logger / StructuredLogger / pino / winston)
  'log', 'error', 'warn', 'debug', 'verbose', 'fatal', 'info', 'trace',
  // metrics (prom-client Counter/Histogram/Gauge, statsd, otel meter)
  'inc', 'add', 'record', 'observe', 'increment', 'decrement', 'gauge', 'timing', 'count', 'set',
  // tracing (OpenTelemetry tracer)
  'startSpan', 'startActiveSpan',
  // event spine (EventEmitter2 / Nest event bus)
  'emit', 'emitAsync',
]);

interface Emission {
  /** the class-member handle named at the call site, e.g. `logger` */
  handle: string;
  /** the full whole-callee text, e.g. `this.logger.warn` — the new-vs-prior delta key */
  callee: string;
  line: number;
}

/**
 * Is `<handle>` declared somewhere in this file? Byte-floor resolution of the same
 * fact lsp_definition would answer. Accepts the forms that actually declare a
 * member handle in this codebase:
 *   - class field:        `private readonly logger = new Logger(...)`  →  `logger =`
 *   - typed field:        `private httpCounter: Counter;`              →  `httpCounter:`
 *   - assigned in ctor:   `this.httpCounter = new Counter(...)`        →  `this.httpCounter =`
 *   - constructor param:  `constructor(private readonly tracer: Tracer)`→ `tracer:` inside ()
 * A declaration is any of: `this.<h> =`, a field/param `<h>:` or `<h> =` at member
 * position. We over-accept declaration forms on purpose — the gate must never
 * RED a real handle (no false dead-wire); it only REDs a handle with no plausible
 * declaration anywhere in the file.
 */
function handleDeclaredInFile(handle: string, content: string): boolean {
  const h = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `this.<h> =` — assigned as a member (covers ctor assignment + lazy init)
  if (new RegExp(String.raw`\bthis\.${h}\s*[=:]`).test(content)) return true;
  // field or constructor-parameter declaration: `<h>:` or `<h> =` or `<h>!:`
  // require it to look like a declaration (preceded by a modifier, `(`, `,`,
  // newline, or `{` — i.e. member/param position, not a property *access*).
  if (
    new RegExp(
      String.raw`(?:private|protected|public|readonly|static|declare|[,({)]|^|\n)\s*(?:readonly\s+)?${h}\s*[!?]?\s*[:=]`,
      'm',
    ).test(content)
  ) {
    return true;
  }
  // get/set accessor: `get <h>(` / `set <h>(` — a getter is a real member declaration
  if (new RegExp(String.raw`\b(?:get|set)\s+${h}\s*\(`).test(content)) return true;
  return false;
}

/**
 * Parse a whole member callee into a telemetry emission iff it is exactly
 * `this.<handle>.<verb>` with <verb> a known telemetry verb. Anchoring on a single
 * member segment between `this.` and the verb mirrors the prior gate's shape
 * (`\bthis\.<h>\.<verb>`): a bare `logger.warn` (imported/global handle) or a nested
 * `this.a.b.record` is out of scope — not a single-member handle we can prove
 * declared-or-not in one file. Returns null when the callee is not such an emission.
 */
function asEmission(c: CallFact): Emission | null {
  const parts = c.callee.split('.');
  if (parts.length !== 3) return null; // exactly this.<handle>.<verb>
  if (parts[0] !== 'this') return null; // member anchored on `this.`
  const handle = parts[1];
  const verb = parts[2];
  if (!/^[A-Za-z_$][\w$]*$/.test(handle)) return null;
  if (!EMIT_VERBS.has(verb)) return null;
  return { handle, callee: c.callee, line: c.line };
}

/**
 * Extract every `this.<handle>.<verb>` telemetry emission from `content`, via the
 * perception organ (real `call_expression` nodes — token-correct). Returns null when
 * the grammar is unavailable so the caller degrades to unjudged.
 */
async function emissionsOf(content: string, rel: string): Promise<Emission[] | null> {
  const found = await calls(content, rel);
  if (found === null) return null;
  const out: Emission[] = [];
  for (const c of found) {
    const e = asEmission(c);
    if (e) out.push(e);
  }
  return out;
}

const telemetryEmissionGate: GateModule = {
  name: 'telemetry-emission',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return SOURCE_RE.test(rel);
  },
  async run(ctx: GateContext): Promise<GateResult> {
    const reds: GateRed[] = [];
    let sawAnyEmission = false;
    let sawUnjudgedSource = false;
    const note =
      'every this.<handle>.<telemetry-verb>() emits through a handle declared in the same file (could-emit, not did-emit)';

    for (const rel of ctx.changedFiles) {
      if (!SOURCE_RE.test(rel)) continue;
      const content = ctx.readFile(rel);
      if (content === null) continue;

      const emissions = await emissionsOf(content, rel);
      if (emissions === null) {
        sawUnjudgedSource = true;
        continue; // no grammar → cannot decide this file (unjudged)
      }
      if (emissions.length === 0) continue;

      // Write-direction claim narrowing: only emission callees absent from the
      // prior content are this write's claim. A pre-existing dangling emitter in a
      // legacy file never blocks an unrelated edit (mirrors connection-gate
      // NEW-wire-only law). priorOf is '' in the lens (read) direction, so every
      // emission is judged absolutely there. The prior is parsed through the SAME
      // perception organ, so the delta key is token-correct on both sides.
      const prior = ctx.priorOf(rel);
      let priorCallees: Set<string> | null = null;
      if (prior !== '' && prior !== content) {
        const priorEmissions = await emissionsOf(prior, rel);
        if (priorEmissions !== null) priorCallees = new Set(priorEmissions.map((e) => e.callee));
      }

      for (const e of emissions) {
        if (priorCallees && priorCallees.has(e.callee)) continue; // unchanged emitter — not this write's claim
        sawAnyEmission = true;
        if (!handleDeclaredInFile(e.handle, content)) {
          reds.push({
            file: rel,
            locus: `L${e.line}`,
            fact: `telemetry emission \`this.${e.handle}.…()\` names handle \`${e.handle}\`, which has no declaration in this file — dead telemetry wire (no emitter can flow)`,
          });
        }
      }
    }

    // No NEW telemetry emission anywhere in the judged set → no fact to assert.
    // If every changed source was perceivable, that is explicit non-applicability.
    // A file whose grammar was unavailable still makes the empty run unjudged.
    if (!sawAnyEmission && reds.length === 0) {
      return sawUnjudgedSource
        ? { gate: this.name, green: true, reds: [], note, unjudged: true }
        : { gate: this.name, green: true, reds: [], note, notApplicable: true };
    }
    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default telemetryEmissionGate;
