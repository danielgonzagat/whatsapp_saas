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
 * Semantics (universal, no exoneration, no guess):
 *  - Only SOURCE files are judged (.ts/.tsx/.js/.jsx/.mjs/.cjs). Other files carry
 *    no telemetry-emission fact → green.
 *  - A telemetry emission is `this.<handle>.<emit>(` where <emit> is a known
 *    telemetry verb (log/error/warn/debug/verbose/fatal | inc/add/record/observe/
 *    increment/gauge/timing/count | startSpan/startActiveSpan | emit/emitAsync).
 *    `this.` anchors it to a class member, which is the only handle a static byte
 *    scan can prove declared-or-not within one file.
 *  - GREEN: every emission's <handle> has a declaration in the same file (a field
 *    `<handle> =` / `<handle>:` / `this.<handle> =`, OR a constructor parameter
 *    `private/readonly ... <handle>:`). RED: a handle named at an emission site
 *    with NO declaration in the file = dead telemetry wire.
 *  - Only NEW emissions are this write's claim (write direction): an emission whose
 *    exact call text already existed in the prior content never reddens an
 *    unrelated edit — but no write may INTRODUCE a dangling telemetry handle. Read
 *    direction (whole repo) judges every emission.
 *  - UNJUDGED: a changed file with zero telemetry emissions has no fact to assert;
 *    we do not green-by-assumption an empty claim.
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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GateModule, type GateContext, type GateResult, type GateRed } from './contract.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Known telemetry-emission verbs. Grouped only for documentation; matched as one
 * alternation. These are the contracted edges: a structured log, a span open, a
 * metric mutation, an event emission. (Grounded against backend/src: logger.warn/
 * error/log/debug dominate; metrics.service uses Counter.inc / Histogram.observe.)
 */
const EMIT_VERBS = [
  // structured logging (NestJS Logger / StructuredLogger / pino / winston)
  'log', 'error', 'warn', 'debug', 'verbose', 'fatal', 'info', 'trace',
  // metrics (prom-client Counter/Histogram/Gauge, statsd, otel meter)
  'inc', 'add', 'record', 'observe', 'increment', 'decrement', 'gauge', 'timing', 'count', 'set',
  // tracing (OpenTelemetry tracer)
  'startSpan', 'startActiveSpan',
  // event spine (EventEmitter2 / Nest event bus)
  'emit', 'emitAsync',
];
const EMIT_ALT = EMIT_VERBS.join('|');

/**
 * A telemetry emission anchored to a class member: `this.<handle>.<verb>(`.
 * <handle> is captured so we can ask "is this handle declared in the file?".
 * Anchoring on `this.` is deliberate: only a member handle is statically
 * declared-or-not within one file. A bare `logger.warn(` (imported/global handle)
 * is out of scope — not a single-file dangling fact we can assert.
 */
const EMISSION_RE = new RegExp(
  String.raw`\bthis\.([A-Za-z_$][\w$]*)\.(?:${EMIT_ALT})\s*\(`,
  'g',
);

/** The full call text up to the opening paren — used to diff new-vs-prior emissions. */
const EMISSION_TEXT_RE = new RegExp(
  String.raw`\bthis\.[A-Za-z_$][\w$]*\.(?:${EMIT_ALT})\s*\(`,
  'g',
);

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
      String.raw`(?:private|protected|public|readonly|static|declare|[,({]|^|\n)\s*(?:readonly\s+)?${h}\s*[!?]?\s*[:=]`,
      'm',
    ).test(content)
  ) {
    return true;
  }
  return false;
}

/** All emission call-texts present in `content` (for new-vs-prior diffing). */
function emissionTexts(content: string): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  EMISSION_TEXT_RE.lastIndex = 0;
  while ((m = EMISSION_TEXT_RE.exec(content)) !== null) out.add(m[0]);
  return out;
}

/** 1-based line of byte offset `idx` in `content`. */
function lineAt(content: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < content.length; i += 1) if (content[i] === '\n') line += 1;
  return line;
}

interface Emission {
  handle: string;
  index: number;
  callText: string;
}

/** Extract every `this.<handle>.<verb>(` emission with its handle, offset, text. */
function extractEmissions(content: string): Emission[] {
  const out: Emission[] = [];
  let m: RegExpExecArray | null;
  EMISSION_RE.lastIndex = 0;
  while ((m = EMISSION_RE.exec(content)) !== null) {
    out.push({ handle: m[1], index: m.index, callText: m[0] });
  }
  return out;
}

const telemetryEmissionGate: GateModule = {
  name: 'telemetry-emission',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return SOURCE_RE.test(rel);
  },
  run(ctx: GateContext): GateResult {
    const reds: GateRed[] = [];
    let sawAnyEmission = false;
    const note =
      'every this.<handle>.<telemetry-verb>() emits through a handle declared in the same file (could-emit, not did-emit)';

    for (const rel of ctx.changedFiles) {
      if (!SOURCE_RE.test(rel)) continue;
      const content = ctx.readFile(rel);
      if (content === null) continue;

      const emissions = extractEmissions(content);
      if (emissions.length === 0) continue;

      // Write-direction claim narrowing: when this file is an overlay candidate AND
      // a prior on-disk version exists, only NEW emission call-texts are this
      // write's claim. A pre-existing dangling emitter in a legacy file never
      // blocks an unrelated edit (mirrors connection-gate NEW-wire-only law). In
      // read direction (no prior, or whole-repo lens) every emission is judged.
      let priorTexts: Set<string> | null = null;
      if (ctx.overlay.has(rel.replaceAll('\\', '/'))) {
        const disk = ctx.existsInTree(rel) ? readDiskOnly(ctx, rel) : null;
        if (disk !== null && disk !== content) priorTexts = emissionTexts(disk);
      }

      for (const e of emissions) {
        if (priorTexts && priorTexts.has(e.callText)) continue; // unchanged emitter — not this write's claim
        sawAnyEmission = true;
        if (!handleDeclaredInFile(e.handle, content)) {
          reds.push({
            file: rel,
            locus: `L${lineAt(content, e.index)}`,
            fact: `telemetry emission \`this.${e.handle}.…()\` names handle \`${e.handle}\`, which has no declaration in this file — dead telemetry wire (no emitter can flow)`,
          });
        }
      }
    }

    // No NEW telemetry emission anywhere in the judged set → no fact to assert.
    // Honest: do not green-by-assumption an empty claim.
    if (!sawAnyEmission && reds.length === 0) {
      return { gate: this.name, green: true, reds: [], note, unjudged: true };
    }
    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

/**
 * Read ONLY the on-disk version (bypassing the overlay) so we can diff new-vs-prior
 * emissions. The context's readFile returns the overlay when present; for the
 * write-direction prior we need the file as it exists on disk. We reconstruct it
 * via existsInTree + a disk read through the same resolver shape the context uses.
 */
function readDiskOnly(ctx: GateContext, rel: string): string | null {
  // The GateContext API does not expose a disk-only read, but a file that exists in
  // the tree and is NOT only-in-overlay must have a disk copy; re-read it bypassing
  // overlay by constructing a one-off context-free read. We use the fact that the
  // overlay is the ONLY in-memory source: temporarily, the on-disk content is the
  // file at repoRoot/rel. Reading it directly keeps the prior-diff honest without
  // widening the frozen interface.
  try {
    return fs.readFileSync(path.join(ctx.repoRoot, rel), 'utf8');
  } catch {
    return null;
  }
}

export default telemetryEmissionGate;
