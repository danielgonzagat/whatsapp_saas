// PULSE — Live Codebase Nervous System
// OpenTelemetry Runtime Call Graph Integration
//
// Builds a runtime call graph tracer using OpenTelemetry concepts through a
// lightweight manual span tracing system that works without the real OTel SDK.
//
// Modes:
//   - Manual tracing (default): captures spans during PULSE scenario execution
//   - Simulation mode: generates trace data from the AST/structural graph edges
//   - Real collector mode: reads from an OTel collector endpoint or local trace file
//
// Outputs:
//   - PULSE_RUNTIME_TRACES.json — full runtime trace evidence
//   - PULSE_TRACE_DIFF.json      — diff between runtime traces and static graph

import * as path from 'path';
import * as crypto from 'crypto';
import { safeJoin } from './safe-path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  OtelSpan,
  OtelTrace,
  OtelTraceSummary,
  OtelRuntimeSource,
  OtelRuntimeSourceDetails,
  RuntimeCallGraphEvidence,
  SpanToPathMapping,
} from './types.otel-runtime';
import type { PulseStructuralEdge, PulseStructuralGraph } from './types';
import type { AstCallGraph, AstCallEdge } from './types.ast-graph';

// ─── Constants ───────────────────────────────────────────────────────────────

const RUNTIME_TRACES_ARTIFACT = 'PULSE_RUNTIME_TRACES.json';
const TRACE_DIFF_ARTIFACT = 'PULSE_TRACE_DIFF.json';

const NESTJS_DECORATOR_NAMES = [
  'Controller',
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Injectable',
  'Module',
  'Cron',
  'Interval',
  'Timeout',
  'MessagePattern',
  'EventPattern',
  'WebSocketGateway',
];

const PRISMA_METHODS = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
  'count',
  'aggregate',
  'groupBy',
  'findRaw',
  'executeRaw',
  'queryRaw',
  'runCommandRaw',
  '$transaction',
  '$queryRaw',
  '$executeRaw',
  '$runCommandRaw',
];

const BULLMQ_PATTERNS = [
  'add',
  'addBulk',
  'getJob',
  'getJobs',
  'getActive',
  'getWaiting',
  'getDelayed',
  'getCompleted',
  'getFailed',
  'pause',
  'resume',
  'close',
  'removeJobs',
  'drain',
  'obliterate',
  'trimEvents',
  'process',
  'processJob',
];

const AXIOS_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'request',
  'create',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function randomHex(len: number): string {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString('hex')
    .slice(0, len);
}

function stableHex(input: string, len: number): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, len);
}

function stableNumber(input: string, modulo: number): number {
  if (modulo <= 1) return 0;
  return Number.parseInt(stableHex(input, 12), 16) % modulo;
}

function stableChoice<T>(items: readonly T[], input: string): T {
  return items[stableNumber(input, items.length)];
}

function stableIso(offsetMs: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0) + offsetMs).toISOString();
}

function clampDuration(ms: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, ms));
}

function idFromName(name: string): string {
  return crypto.createHash('md5').update(name).digest('hex').slice(0, 12);
}

function normalizePath(input: string): string {
  return input.split(path.sep).join('/');
}

function isRuntimeObservedSource(source: OtelRuntimeSource): boolean {
  return source === 'real' || source === 'manual';
}

function emptyTraceSummary(): OtelTraceSummary {
  return {
    totalTraces: 0,
    totalSpans: 0,
    errorTraces: 0,
    avgDurationMs: 0,
    p95DurationMs: 0,
    p99DurationMs: 0,
    serviceMap: {},
    endpointMap: {},
  };
}

// ─── Manual Span Tracer ──────────────────────────────────────────────────────

/**
 * A lightweight manual span tracing system that mirrors OpenTelemetry's spans
 * and traces without requiring the real OTel SDK.
 *
 * Use this during PULSE scenario execution to capture a call graph from real
 * code paths instead of relying purely on simulation.
 */
export class ManualSpanTracer {
  private activeSpans = new Map<string, OtelSpan>();
  private completedSpans = new Map<string, OtelSpan[]>();
  private spanCounter = 0;

  /**
   * Start a new span within a trace.
   *
   * @param name      - Human-readable operation name (e.g. "POST /api/messages/send")
   * @param kind      - Span kind per OTel spec
   * @param service   - Service name (backend/frontend/worker)
   * @param attributes - Optional key-value attributes
   * @param parentSpanId - Optional parent span ID; creates a root span if null
   * @param traceId   - Optional trace ID; auto-generates if not provided
   * @returns A new OtelSpan in started state.
   */
  startSpan(
    name: string,
    kind: OtelSpan['kind'],
    service: string,
    attributes: Record<string, string | number | boolean> = {},
    parentSpanId: string | null = null,
    traceId?: string,
  ): OtelSpan {
    const spanId = randomHex(16);
    const effectiveTraceId = traceId || randomHex(32);

    const span: OtelSpan = {
      spanId,
      parentSpanId,
      traceId: effectiveTraceId,
      name,
      kind,
      serviceName: service,
      attributes: {
        'service.name': service,
        ...attributes,
      },
      startTime: nowIso(),
      endTime: '',
      durationMs: 0,
      status: 'unset',
      statusMessage: null,
      events: [],
    };

    this.activeSpans.set(spanId, span);
    this.spanCounter++;

    return span;
  }

  /**
   * End an active span, computing its duration and finalizing its state.
   *
   * @param spanId        - The span to end
   * @param status        - Final status (default: 'ok')
   * @param statusMessage - Optional error message when status is 'error'
   */
  endSpan(
    spanId: string,
    status: OtelSpan['status'] = 'ok',
    statusMessage: string | null = null,
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = nowIso();
    span.durationMs = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
    span.status = status;
    span.statusMessage = statusMessage;
    this.activeSpans.delete(spanId);

    const traceSpans = this.completedSpans.get(span.traceId) || [];
    traceSpans.push(span);
    this.completedSpans.set(span.traceId, traceSpans);
  }

  /**
   * Add a time-stamped event to an active span.
   */
  addEvent(spanId: string, name: string, attributes: Record<string, string> = {}): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: nowIso(),
      attributes,
    });
  }

  /**
   * Set an attribute on an active span.
   */
  setAttribute(spanId: string, key: string, value: string | number | boolean): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    span.attributes[key] = value;
  }

  /**
   * Set the status on an active span.
   */
  setStatus(spanId: string, status: OtelSpan['status'], message?: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    span.status = status;
    if (message !== undefined) span.statusMessage = message;
  }

  /**
   * Build a complete trace from all spans sharing the given traceId.
   */
  getTrace(traceId: string): OtelTrace | null {
    const spans = this.completedSpans.get(traceId);
    if (!spans || spans.length === 0) return null;

    const rootSpan = spans.find((s) => s.parentSpanId === null) || spans[0];
    const errorSpans = spans.filter((s) => s.status === 'error').length;
    const serviceBoundaries = new Set(spans.map((s) => s.serviceName)).size - 1;

    return {
      traceId,
      rootSpan,
      spans,
      totalDurationMs: spans.reduce((max, s) => Math.max(max, s.durationMs), 0),
      errorSpans,
      serviceBoundaries: Math.max(0, serviceBoundaries),
    };
  }

  /**
   * Return all completed traces. Optionally end any active spans first.
   */
  getAllTraces(flushActive: boolean = true): OtelTrace[] {
    if (flushActive) {
      for (const spanId of [...this.activeSpans.keys()]) {
        this.endSpan(spanId, 'unset');
      }
    }

    const traceIds = new Set<string>();
    for (const spans of this.completedSpans.values()) {
      for (const s of spans) traceIds.add(s.traceId);
    }

    return [...traceIds].map((id) => this.getTrace(id)!).filter(Boolean);
  }

  /**
   * Flush: end all active spans, collect all traces, and reset internal state.
   */
  flush(): OtelTrace[] {
    const traces = this.getAllTraces(true);
    this.completedSpans.clear();
    this.activeSpans.clear();
    this.spanCounter = 0;
    return traces;
  }

  /** Number of active spans. */
  get activeCount(): number {
    return this.activeSpans.size;
  }

  /** Total spans created in this tracer's lifetime (since last flush). */
  get totalSpanCount(): number {
    return this.spanCounter;
  }
}

/**
 * Create a fresh manual span tracer instance.
 */
export function createManualTracer(): ManualSpanTracer {
  return new ManualSpanTracer();
}

// ─── Auto-Instrumentation Pattern Detection ──────────────────────────────────

/** Hint about an instrumentation point discovered in the codebase. */
export interface InstrumentationHint {
  /** File path where the pattern was found. */
  filePath: string;
  /** Framework or library name. */
  framework: 'nestjs' | 'prisma' | 'bullmq' | 'axios' | 'http' | 'redis';
  /** Method or function name. */
  methodName: string;
  /** HTTP method if applicable. */
  httpMethod?: string;
  /** Route path if applicable. */
  routePath?: string;
  /** Service name. */
  service: string;
}
