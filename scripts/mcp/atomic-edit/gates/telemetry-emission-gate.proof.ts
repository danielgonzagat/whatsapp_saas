/**
 * telemetry-emission-gate.proof.ts — standalone tsx proof.
 *
 * Run: npx tsx scripts/mcp/atomic-edit/gates/telemetry-emission-gate.proof.ts
 *
 * Builds in-memory overlays (no disk write), calls makeContext(...) then the
 * gate's run(ctx), and asserts:
 *   RED   — a planted telemetry emission `this.tracer.startSpan(...)` whose handle
 *           `tracer` is NEVER declared in the file = dead telemetry wire.
 *   GREEN — the same emission where `tracer` IS declared as a class field.
 *   GREEN — the dominant NestJS shape: `private readonly logger = new Logger(...)`
 *           declared, then `this.logger.warn(...)` emitted (handle resolves).
 *   NOT_APPLICABLE — a changed source file with ZERO telemetry emissions (no fact
 *           to assert, explicitly not applicable).
 *   CEILING — printed: static proves "could emit", never "did emit" (TRUTH_INFERRED
 *           vs TRUTH_OBSERVED). Sentry node project = 0 observed events / 24h.
 *
 * Prints "PROOF PASS"/"PROOF FAIL" and process.exit accordingly.
 */
import { makeContext } from './contract.js';
import gate from './telemetry-emission-gate.js';

const REPO = process.cwd();

async function run(files: Record<string, string>) {
  const overlay = new Map(Object.entries(files));
  const ctx = makeContext(REPO, overlay, Object.keys(files));
  // gate.run is async (it perceives via the tree-sitter perception organ) — await it.
  return (await gate.run(ctx)) as Awaited<ReturnType<typeof gate.run>> & {
    green: boolean;
    reds: { file: string; locus?: string; fact: string }[];
    notApplicable?: boolean;
    unjudged?: boolean;
  };
}

let pass = true;
const log = (ok: boolean, label: string, detail = '') => {
  pass &&= ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

// gate.run is async (it perceives via the tree-sitter perception organ), and tsx
// emits CJS here (no "type":"module") where top-level await is unsupported — so the
// whole proof body runs inside main(), invoked at the bottom (mirrors the sibling
// probe-convergence proof). The module-level `pass`/`log` stay in scope.
async function main(): Promise<void> {
// ── RED: telemetry handle named at the emission site is never declared ──────────
// `this.tracer.startSpan(...)` is a contracted telemetry edge, but no `tracer`
// field / ctor-param / assignment exists → dead wire (the emitter cannot exist).
const RED_FILE = 'backend/src/_proof/telemetry-dead.ts';
const redOverlay = {
  [RED_FILE]: [
    'import { Injectable } from "@nestjs/common";',
    '',
    '@Injectable()',
    'export class TelemetryDeadService {',
    '  private readonly logger = console;', // a DIFFERENT handle is declared, to prove the gate is per-handle
    '',
    '  handle(): void {',
    '    const span = this.tracer.startSpan("checkout.process");', // tracer: NEVER declared
    '    span.end();',
    '  }',
    '}',
    '',
  ].join('\n'),
};
const redRes = await run(redOverlay);
log(
  !redRes.green && !redRes.unjudged && redRes.reds.length === 1,
  'RED on dangling telemetry handle `tracer`',
  `green=${redRes.green} unjudged=${redRes.unjudged ?? false} reds=${redRes.reds.length}`,
);
if (redRes.reds[0]) {
  const r = redRes.reds[0];
  log(
    r.file === RED_FILE && /tracer/.test(r.fact) && /dead telemetry wire/.test(r.fact),
    'RED carries file + locus + exact dead-wire fact',
    `${r.file} ${r.locus ?? '?'} :: ${r.fact}`,
  );
}

// ── GREEN: same emission, but `tracer` IS declared as a class field ─────────────
const GREEN_FILE = 'backend/src/_proof/telemetry-live.ts';
const greenOverlay = {
  [GREEN_FILE]: [
    'import { Injectable } from "@nestjs/common";',
    'import { trace, type Tracer } from "@opentelemetry/api";',
    '',
    '@Injectable()',
    'export class TelemetryLiveService {',
    '  private readonly tracer: Tracer = trace.getTracer("checkout");', // tracer declared
    '',
    '  handle(): void {',
    '    const span = this.tracer.startSpan("checkout.process");',
    '    span.end();',
    '  }',
    '}',
    '',
  ].join('\n'),
};
const greenRes = await run(greenOverlay);
log(
  greenRes.green && !greenRes.unjudged && greenRes.reds.length === 0,
  'GREEN when telemetry handle `tracer` is declared',
  `green=${greenRes.green} reds=${greenRes.reds.length}`,
);

// ── GREEN: the dominant NestJS structured-logger shape (real-repo grounded) ─────
const LOGGER_FILE = 'backend/src/_proof/logger-live.ts';
const loggerOverlay = {
  [LOGGER_FILE]: [
    'import { Injectable, Logger } from "@nestjs/common";',
    '',
    '@Injectable()',
    'export class LoggerLiveService {',
    '  private readonly logger = new Logger(LoggerLiveService.name);',
    '  private httpCounter!: { inc: (l?: unknown) => void };',
    '',
    '  process(): void {',
    '    this.logger.warn("retry exhausted");',
    '    this.logger.error("failed");',
    '    this.httpCounter.inc({ route: "/checkout" });',
    '  }',
    '}',
    '',
  ].join('\n'),
};
const loggerRes = await run(loggerOverlay);
log(
  loggerRes.green && !loggerRes.unjudged && loggerRes.reds.length === 0,
  'GREEN on declared logger.warn/error + counter.inc (NestJS shape)',
  `green=${loggerRes.green} reds=${loggerRes.reds.length}`,
);

// ── NOT_APPLICABLE: a changed source file with ZERO telemetry emissions ─────────
const PLAIN_FILE = 'backend/src/_proof/plain.ts';
const plainOverlay = {
  [PLAIN_FILE]: [
    'export function add(a: number, b: number): number {',
    '  return a + b;',
    '}',
    '',
  ].join('\n'),
};
const plainRes = await run(plainOverlay);
log(
  plainRes.green && plainRes.notApplicable === true && plainRes.unjudged !== true && plainRes.reds.length === 0,
  'NOT_APPLICABLE on a file with no telemetry emission (no fact to assert)',
  `green=${plainRes.green} notApplicable=${plainRes.notApplicable ?? false} unjudged=${plainRes.unjudged ?? false}`,
);

// ── non-source file carries no telemetry fact → never red ───────────────────────
const jsonRes = await run({ 'backend/src/_proof/data.json': '{"this":{"tracer":"x"}}' });
log(
  jsonRes.green && jsonRes.reds.length === 0,
  'non-source file (.json) carries no telemetry fact',
  `green=${jsonRes.green} reds=${jsonRes.reds.length}`,
);

// ── FP REMOVED: telemetry look-alikes inside a STRING / COMMENT / TEMPLATE ──────
// The previous gate extracted emissions with a whole-file regex
// (`\bthis\.<h>\.<verb>\s*\(`), so `this.tracer.startSpan(` written inside a string,
// `this.counter.inc()` in a comment, and `this.bus.emit(` in a template literal all
// matched — and since tracer/counter/bus are NEVER declared here, the regex gate
// REDDENED all three as "dead telemetry wires" (false positives from prose, not code).
// The rewritten gate reads emissions through the perception organ (real
// `call_expression` nodes only): a token inside a `string`/`comment`/`template_string`
// node is NEVER a call_expression, so those three are not extracted at all. The ONE
// real emission (`this.logger.warn`, logger declared) keeps the file judged + GREEN.
const FP_FILE = 'backend/src/_proof/telemetry-fp.ts';
const fpOverlay = {
  [FP_FILE]: [
    'import { Injectable, Logger } from "@nestjs/common";',
    '',
    '@Injectable()',
    'export class TelemetryFpService {',
    '  private readonly logger = new Logger(TelemetryFpService.name);',
    '',
    '  handle(): void {',
    '    this.logger.warn("the only real emission");',
    '    const s = "this.tracer.startSpan(checkout)";',
    '    // this.counter.inc() — a comment look-alike: counter UNDECLARED',
    '    const t = `this.bus.emit(\"x\")`;',
    '    void s; void t;',
    '  }',
    '}',
    '',
  ].join('\n'),
};
const fpRes = await run(fpOverlay);
const fpReddenedNames = fpRes.reds.map((r) => r.fact).join(' | ');
log(
  fpRes.green &&
    !fpRes.unjudged &&
    fpRes.reds.length === 0 &&
    !/tracer|counter|\bbus\b/.test(fpReddenedNames),
  'FP REMOVED: string/comment/template telemetry look-alikes are NOT emissions (perception, not regex)',
  `green=${fpRes.green} reds=${fpRes.reds.length} (old regex would have RED tracer/counter/bus)`,
);

// ── CEILING (honest, unjudged tier): static says could-emit, never did-emit ─────
console.log('');
console.log('CEILING (carried as unjudged — TRUTH_INFERRED, NOT TRUTH_OBSERVED):');
console.log('  static proves the emitter HANDLE EXISTS → the point COULD emit.');
console.log('  it CANNOT prove the point DID emit in production (p99/observed-span).');
console.log('  pulse otel-runtime: this is OTEL_SOURCE_SIMULATED / OTEL_KIND_AST_STATIC_MAP');
console.log('  (buildStaticTraceSeed derives a trace from the AST graph, not real spans),');
console.log('  vs OTEL_SOURCE_REAL / isRuntimeObservedSource for actually-observed spans.');
console.log('  EMPIRICAL: Sentry node project reported total_events=0 over 24h — a point this');
console.log('  gate certifies "could emit" produced ZERO observed events → deferred to live probe.');
console.log('');

  console.log(pass ? 'PROOF PASS' : 'PROOF FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  console.log('PROOF FAIL');
  process.exit(1);
});
