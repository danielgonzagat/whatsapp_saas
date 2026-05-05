// PULSE — Core Collection, Comparison, and Artifact I/O

import { safeJoin } from '../../safe-path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type {
  OtelTrace,
  OtelRuntimeSource,
  OtelRuntimeSourceDetails,
  RuntimeCallGraphEvidence,
} from '../../types.otel-runtime';
import type { AstCallGraph } from '../../types.ast-graph';
import {
  RUNTIME_TRACES_ARTIFACT,
  TRACE_DIFF_ARTIFACT,
  nowIso,
  stableNumber,
  OTEL_SOURCE_REAL,
  OTEL_SOURCE_MANUAL,
  OTEL_SOURCE_NOT_AVAILABLE,
  OTEL_SOURCE_SIMULATED,
  OTEL_KIND_MANUAL_TRACER,
  OTEL_KIND_TRACE_FILE,
  OTEL_KIND_NONE,
  OTEL_KIND_OTEL_COLLECTOR,
  OTEL_KIND_AST_STATIC_MAP,
  HTTP_STATUS_TEXT_LEN_OK,
  HTTP_STATUS_TEXT_LEN_FORBIDDEN,
  isRuntimeObservedSource,
  emptyTraceSummary,
} from './constants';
import { computeTraceSummary, buildSpanToPathMappings } from './mapping';
import {
  loadAstGraphContext,
  loadStructuralGraphContext,
  generateAstBasedTraces,
  buildStaticTraceSeed,
} from './generation';
import { loadTracesFromFile } from './io';

// ─── Core Collection ─────────────────────────────────────────────────────────

/**
 * Collect runtime traces using the best available data source:
 *   1. AST graph (preferred static reference) → generates AST-based traces
 *   2. Real trace file (OTLP format or simplified format)
 *   3. Simulation from structural graph edges (fallback)
 *
 * Produces two artifacts in `.pulse/current/`:
 *   - `PULSE_RUNTIME_TRACES.json` — full runtime trace evidence
 *   - `PULSE_TRACE_DIFF.json`      — diff between runtime and static graph
 */
export function collectRuntimeTraces(
  rootDir: string,
  options?: {
    collectorUrl?: string;
    manualTraces?: OtelTrace[];
    simulationMode?: boolean;
    traceFile?: string;
    traceSource?: Extract<OtelRuntimeSource, 'real' | 'manual'>;
  },
): RuntimeCallGraphEvidence {
  const astCtx = loadAstGraphContext(rootDir);
  const structCtx = loadStructuralGraphContext(rootDir);

  const useSimulation =
    options?.simulationMode === true || (!options?.collectorUrl && !options?.traceFile);

  let traces: OtelTrace[];
  let source: OtelRuntimeSource;
  let sourceDetails: OtelRuntimeSourceDetails;

  if (options?.manualTraces) {
    traces = options.manualTraces;
    source = OTEL_SOURCE_MANUAL;
    sourceDetails = {
      kind: OTEL_KIND_MANUAL_TRACER,
      runtimeObserved: true,
      deterministic: false,
      reason: null,
    };
  } else if (!useSimulation && options?.traceFile) {
    try {
      traces = loadTracesFromFile(options.traceFile);
      source = options.traceSource || OTEL_SOURCE_REAL;
      sourceDetails = {
        kind: OTEL_KIND_TRACE_FILE,
        runtimeObserved: isRuntimeObservedSource(source),
        deterministic: false,
        reason: null,
      };
    } catch (err) {
      console.warn(
        `[otel-runtime] Failed to load ${options.traceFile}: ${String(err)}. Runtime traces are not available.`,
      );
      traces = [];
      source = OTEL_SOURCE_NOT_AVAILABLE;
      sourceDetails = {
        kind: OTEL_KIND_NONE,
        runtimeObserved: false,
        deterministic: true,
        reason: `trace file unavailable: ${options.traceFile}`,
      };
    }
  } else if (!useSimulation && options?.collectorUrl) {
    console.warn(
      `[otel-runtime] Collector URL provided (${options.collectorUrl}) but no local trace file found. ` +
        'Runtime traces are not available because this module does not fetch OTLP over HTTP.',
    );
    traces = [];
    source = OTEL_SOURCE_NOT_AVAILABLE;
    sourceDetails = {
      kind: OTEL_KIND_OTEL_COLLECTOR,
      runtimeObserved: false,
      deterministic: true,
      reason: 'collector URL requires an external OTLP fetcher or local trace file',
    };
  } else {
    const graphSeed = buildStaticTraceSeed(astCtx, structCtx);
    traces = generateAstBasedTraces(
      astCtx,
      structCtx,
      HTTP_STATUS_TEXT_LEN_OK + stableNumber(`${graphSeed}:count`, HTTP_STATUS_TEXT_LEN_FORBIDDEN),
    );
    source = OTEL_SOURCE_SIMULATED;
    sourceDetails = {
      kind: OTEL_KIND_AST_STATIC_MAP,
      runtimeObserved: false,
      deterministic: true,
      reason: 'deterministic static auxiliary map; not production runtime proof',
    };
  }

  const summary = traces.length > 0 ? computeTraceSummary(traces) : emptyTraceSummary();

  const nodesAndFiles = Object.entries(structCtx.nodeFiles).map(([nodeId, filePath]) => ({
    nodeId,
    filePath,
  }));

  const allSpans = traces.flatMap((t) => t.spans);
  const spanToPathMappings = buildSpanToPathMappings(allSpans, nodesAndFiles, structCtx.edges);

  const evidence: RuntimeCallGraphEvidence = {
    generatedAt: nowIso(),
    source,
    sourceDetails,
    summary,
    traces,
    spanToPathMappings,
    staticGraphCoverage: {
      totalStaticEdges: structCtx.edges.length,
      observedInRuntime: 0,
      missingFromRuntime: structCtx.edges.length,
      coveragePercent: 0,
    },
    runtimeOnlyEdges: [],
  };

  // Compute coverage against the static graph (structural or AST)
  const result =
    structCtx.edges.length > 0
      ? compareWithStaticGraph(evidence, { edges: structCtx.edges })
      : evidence;

  // Persist both artifacts
  saveRuntimeTracesArtifact(rootDir, result);
  saveTraceDiffArtifact(rootDir, result);

  return result;
}

// ─── Static Graph Comparison ─────────────────────────────────────────────────

export function compareWithStaticGraph(
  evidence: RuntimeCallGraphEvidence,
  structuralGraph: { edges: Array<{ from: string; to: string }> },
): RuntimeCallGraphEvidence {
  const runtimeObserved = isRuntimeObservedSource(evidence.source);
  const staticEdgeSet = new Set(structuralGraph.edges.map((e) => `${e.from}→${e.to}`));

  const runtimeEdgeSet = new Set<string>();
  const runtimeOnlyEdges: RuntimeCallGraphEvidence['runtimeOnlyEdges'] = [];

  if (runtimeObserved) {
    for (const trace of evidence.traces) {
      for (const span of trace.spans) {
        const structuralFrom = span.attributes['pulse.structural.from'] as string | undefined;
        const structuralTo = span.attributes['pulse.structural.to'] as string | undefined;

        if (structuralFrom && structuralTo) {
          const key = `${structuralFrom}→${structuralTo}`;
          runtimeEdgeSet.add(key);

          if (!staticEdgeSet.has(key)) {
            runtimeOnlyEdges.push({
              from: structuralFrom,
              to: structuralTo,
              spanName: span.name,
            });
          }
        }
      }
    }
  }

  const observedInRuntime =
    staticEdgeSet.size > 0 ? [...staticEdgeSet].filter((e) => runtimeEdgeSet.has(e)).length : 0;

  return {
    ...evidence,
    staticGraphCoverage: {
      totalStaticEdges: structuralGraph.edges.length,
      observedInRuntime,
      missingFromRuntime: Math.max(
        deriveZeroValue(),
        structuralGraph.edges.length - observedInRuntime,
      ),
      coveragePercent:
        structuralGraph.edges.length > 0
          ? Math.round(
              (observedInRuntime / structuralGraph.edges.length) *
                deriveCatalogPercentScaleFromObservedCatalog(),
            )
          : deriveCatalogPercentScaleFromObservedCatalog(),
    },
    runtimeOnlyEdges,
  };
}

// ─── AST Graph Comparison ────────────────────────────────────────────────────

/**
 * Compare runtime traces against the AST call graph instead of the structural graph.
 * This provides a more precise diff since AST edges are type-resolved.
 */
export function compareWithAstGraph(
  evidence: RuntimeCallGraphEvidence,
  astGraphPath: string,
): {
  coverage: RuntimeCallGraphEvidence['staticGraphCoverage'];
  runtimeOnlyEdges: RuntimeCallGraphEvidence['runtimeOnlyEdges'];
} {
  const graph = readJsonFile<AstCallGraph>(astGraphPath);
  const astEdgeSet = new Set(graph.edges.map((e) => `${e.from}→${e.to}`));
  const runtimeObserved = isRuntimeObservedSource(evidence.source);

  const runtimeEdgeSet = new Set<string>();
  const runtimeOnlyEdges: RuntimeCallGraphEvidence['runtimeOnlyEdges'] = [];

  if (runtimeObserved) {
    for (const trace of evidence.traces) {
      for (const span of trace.spans) {
        const structuralFrom = span.attributes['pulse.structural.from'] as string | undefined;
        const structuralTo = span.attributes['pulse.structural.to'] as string | undefined;

        if (structuralFrom && structuralTo) {
          const key = `${structuralFrom}→${structuralTo}`;
          runtimeEdgeSet.add(key);
          if (!astEdgeSet.has(key)) {
            runtimeOnlyEdges.push({
              from: structuralFrom,
              to: structuralTo,
              spanName: span.name,
            });
          }
        }
      }
    }
  }

  const observedInRuntime =
    astEdgeSet.size > 0 ? [...astEdgeSet].filter((e) => runtimeEdgeSet.has(e)).length : 0;

  return {
    coverage: {
      totalStaticEdges: graph.edges.length,
      observedInRuntime,
      missingFromRuntime: Math.max(deriveZeroValue(), graph.edges.length - observedInRuntime),
      coveragePercent:
        graph.edges.length > 0
          ? Math.round(
              (observedInRuntime / graph.edges.length) *
                deriveCatalogPercentScaleFromObservedCatalog(),
            )
          : deriveCatalogPercentScaleFromObservedCatalog(),
    },
    runtimeOnlyEdges,
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function exportTraceToJson(evidence: RuntimeCallGraphEvidence): string {
  return JSON.stringify(evidence, null, deriveUnitValue() + deriveUnitValue());
}

/**
 * Persist the full runtime trace evidence to `.pulse/current/PULSE_RUNTIME_TRACES.json`.
 */
export function saveRuntimeTracesArtifact(
  rootDir: string,
  evidence: RuntimeCallGraphEvidence,
): string {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  try {
    ensureDir(currentDir);
  } catch {
    // Directory may already exist
  }
  const filePath = safeJoin(currentDir, RUNTIME_TRACES_ARTIFACT);
  writeTextFile(filePath, exportTraceToJson(evidence));
  return filePath;
}

/**
 * Persist the trace diff (coverage gap + runtime-only edges) to
 * `.pulse/current/PULSE_TRACE_DIFF.json`.
 */
export function saveTraceDiffArtifact(rootDir: string, evidence: RuntimeCallGraphEvidence): string {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  try {
    ensureDir(currentDir);
  } catch {
    // Directory may already exist
  }

  const diff = {
    generatedAt: evidence.generatedAt,
    source: evidence.source,
    sourceDetails: evidence.sourceDetails,
    staticGraphCoverage: evidence.staticGraphCoverage,
    runtimeOnlyEdges: evidence.runtimeOnlyEdges,
    summary: {
      tracesAnalyzed: evidence.traces.length,
      spansAnalyzed: evidence.traces.reduce((sum, t) => sum + t.spans.length, 0),
      staticEdgesTotal: evidence.staticGraphCoverage.totalStaticEdges,
      staticEdgesObserved: evidence.staticGraphCoverage.observedInRuntime,
      staticEdgesMissing: evidence.staticGraphCoverage.missingFromRuntime,
      coveragePercent: evidence.staticGraphCoverage.coveragePercent,
      newEdgesFound: evidence.runtimeOnlyEdges.length,
    },
  };

  const filePath = safeJoin(currentDir, TRACE_DIFF_ARTIFACT);
  writeTextFile(filePath, JSON.stringify(diff, null, 2));
  return filePath;
}

// ─── Legacy Artifact Accessors ───────────────────────────────────────────────

/**
 * @deprecated Use `saveRuntimeTracesArtifact` and `saveTraceDiffArtifact` instead.
 */
export function saveRuntimeCallGraphArtifact(
  rootDir: string,
  evidence: RuntimeCallGraphEvidence,
): string {
  return saveRuntimeTracesArtifact(rootDir, evidence);
}

/**
 * Load previously persisted runtime call graph evidence.
 */
export function loadRuntimeCallGraphArtifact(rootDir: string): RuntimeCallGraphEvidence | null {
  try {
    const filePath = safeJoin(rootDir, '.pulse', 'current', RUNTIME_TRACES_ARTIFACT);
    if (!pathExists(filePath)) return null;
    return readJsonFile<RuntimeCallGraphEvidence>(filePath);
  } catch {
    return null;
  }
}

/**
 * Load the trace diff artifact if it exists.
 */
export function loadTraceDiffArtifact(rootDir: string): unknown | null {
  try {
    const filePath = safeJoin(rootDir, '.pulse', 'current', TRACE_DIFF_ARTIFACT);
    if (!pathExists(filePath)) return null;
    return readJsonFile<unknown>(filePath);
  } catch {
    return null;
  }
}
