import type { OtelSpan, OtelTrace } from '../../types.otel-runtime';
import { nowIso, randomHex } from './helpers';

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
