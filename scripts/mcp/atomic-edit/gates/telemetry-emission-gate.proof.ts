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
 *   UNJUDGED — a changed source file with ZERO telemetry emissions (no fact to
 *           assert — honest, not green-by-assumption).
 *   CEILING — printed: static proves "could emit", never "did emit" (TRUTH_INFERRED
 *           vs TRUTH_OBSERVED). Sentry node project = 0 observed events / 24h.
 *
 * Prints "PROOF PASS"/"PROOF FAIL" and process.exit accordingly.
 */
import { makeContext } from './contract.js';
import gate from './telemetry-emission-gate.js';

const REPO = process.cwd();

function run(files: Record<string, string>) {
  const overlay = new Map(Object.entries(files));
  const ctx = makeContext(REPO, overlay, Object.keys(files));
  return gate.run(ctx) as ReturnType<typeof gate.run> & {
    green: boolean;
    reds: { file: string; locus?: string; fact: string }[];
    unjudged?: boolean;
  };
}

let pass = true;
const log = (ok: boolean, label: string, detail = '') => {
  pass &&= ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

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
const redRes = run(redOverlay);
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
const greenRes = run(greenOverlay);
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
const loggerRes = run(loggerOverlay);
log(
  loggerRes.green && !loggerRes.unjudged && loggerRes.reds.length === 0,
  'GREEN on declared logger.warn/error + counter.inc (NestJS shape)',
  `green=${loggerRes.green} reds=${loggerRes.reds.length}`,
);

// ── UNJUDGED: a changed source file with ZERO telemetry emissions ───────────────
const PLAIN_FILE = 'backend/src/_proof/plain.ts';
const plainOverlay = {
  [PLAIN_FILE]: [
    'export function add(a: number, b: number): number {',
    '  return a + b;',
    '}',
    '',
  ].join('\n'),
};
const plainRes = run(plainOverlay);
log(
  plainRes.green && plainRes.unjudged === true && plainRes.reds.length === 0,
  'UNJUDGED on a file with no telemetry emission (no fact to assert)',
  `green=${plainRes.green} unjudged=${plainRes.unjudged ?? false}`,
);

// ── non-source file carries no telemetry fact → never red ───────────────────────
const jsonRes = run({ 'backend/src/_proof/data.json': '{"this":{"tracer":"x"}}' });
log(
  jsonRes.green && jsonRes.reds.length === 0,
  'non-source file (.json) carries no telemetry fact',
  `green=${jsonRes.green} reds=${jsonRes.reds.length}`,
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
