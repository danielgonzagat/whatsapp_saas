// PULSE — Live Codebase Nervous System
// OpenTelemetry Runtime Call Graph types

/** OpenTelemetry span shape — represents a single operation in a distributed trace. */
export interface OtelSpan {
  /** Unique span identifier (hex string). */
  spanId: string;
  /** Parent span identifier or null for root spans. */
  parentSpanId: string | null;
  /** Trace identifier shared across all spans in the same trace. */
  traceId: string;
  /** Human-readable operation name (e.g. "GET /api/users"). */
  name: string;
  /** Span kind as defined by the OpenTelemetry specification. */
  kind: 'server' | 'client' | 'internal' | 'producer' | 'consumer';
  /** Service name that generated this span. */
  serviceName: string;
  /** Key-value attributes attached to the span. */
  attributes: Record<string, string | number | boolean>;
  /** ISO-8601 start timestamp. */
  startTime: string;
  /** ISO-8601 end timestamp. */
  endTime: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Status of the span. */
  status: 'ok' | 'error' | 'unset';
  /** Error message when status is 'error', null otherwise. */
  statusMessage: string | null;
  /** Time-stamped events that occurred within the span. */
  events: Array<{ name: string; timestamp: string; attributes: Record<string, string> }>;
}

/** A complete distributed trace — a tree of spans sharing the same traceId. */
export interface OtelTrace {
  /** Trace identifier shared across all spans. */
  traceId: string;
  /** The root span (parentSpanId is null). */
  rootSpan: OtelSpan;
  /** All spans in the trace. */
  spans: OtelSpan[];
  /** Total wall-clock duration of the trace in milliseconds. */
  totalDurationMs: number;
  /** Count of spans with status 'error'. */
  errorSpans: number;
  /** Count of service boundaries crossed within this trace. */
  serviceBoundaries: number;
}

/** Aggregate statistics computed across all collected traces. */
export interface OtelTraceSummary {
  /** Total number of traces collected. */
  totalTraces: number;
  /** Total number of spans across all traces. */
  totalSpans: number;
  /** Traces containing at least one error span. */
  errorTraces: number;
  /** Average trace duration in milliseconds. */
  avgDurationMs: number;
  /** 95th percentile trace duration in milliseconds. */
  p95DurationMs: number;
  /** 99th percentile trace duration in milliseconds. */
  p99DurationMs: number;
  /** Service name → span count mapping. */
  serviceMap: Record<string, number>;
  /** Route pattern → trace count mapping. */
  endpointMap: Record<string, number>;
}

/** Provenance class for OTel runtime evidence. */
export type OtelRuntimeSource = 'real' | 'manual' | 'simulated' | 'not_available';

/** Source details that separate runtime proof from static auxiliary maps. */
export interface OtelRuntimeSourceDetails {
  /** Data path that produced the artifact. */
  kind: 'otel_collector' | 'trace_file' | 'manual_tracer' | 'ast_static_map' | 'none';
  /** True only when traces came from an observed runtime execution. */
  runtimeObserved: boolean;
  /** True when generated content is stable for the same static inputs. */
  deterministic: boolean;
  /** Human-readable reason for fallback or absence. */
  reason: string | null;
}

/** Mapping from a runtime span to static graph nodes and file paths. */
export interface SpanToPathMapping {
  /** Name of the span that was matched. */
  spanName: string;
  /** IDs of structural graph nodes that correspond to this span. */
  matchedNodeIds: string[];
  /** File paths associated with the matched structural nodes. */
  matchedFilePaths: string[];
  /** Confidence score for this mapping (0–1). */
  confidence: number;
}

/**
 * Complete runtime call graph evidence collected from distributed traces.
 *
 * This is the primary output of the OTel runtime module and is persisted as
 * an artifact for downstream PULSE gates.
 */
export interface RuntimeCallGraphEvidence extends Record<string, unknown> {
  /** ISO-8601 timestamp when this evidence was generated. */
  generatedAt: string;
  /** Source of the trace data. */
  source: OtelRuntimeSource;
  /** Detailed source contract used by downstream proof gates. */
  sourceDetails: OtelRuntimeSourceDetails;
  /** Aggregate statistics across all collected traces. */
  summary: OtelTraceSummary;
  /** All collected traces. */
  traces: OtelTrace[];
  /** Mappings from span names to static graph nodes and files. */
  spanToPathMappings: SpanToPathMapping[];
  /** Coverage statistics comparing runtime-observed edges against the static graph. */
  staticGraphCoverage: {
    /** Total number of edges in the static structural graph. */
    totalStaticEdges: number;
    /** Edges from the static graph that were also observed at runtime. */
    observedInRuntime: number;
    /** Static graph edges that were NOT observed at runtime. */
    missingFromRuntime: number;
    /** Percentage of static edges observed at runtime (0–100). */
    coveragePercent: number;
  };
  /**
   * Edges observed at runtime that do not appear in the static structural graph.
   * These indicate connections the static analyzer missed.
   */
  runtimeOnlyEdges: Array<{
    from: string;
    to: string;
    spanName: string;
  }>;
}
