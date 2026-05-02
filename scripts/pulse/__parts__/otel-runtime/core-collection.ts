import type {
  OtelRuntimeSource,
  OtelRuntimeSourceDetails,
  OtelTrace,
  RuntimeCallGraphEvidence,
} from '../../types.otel-runtime';
import { emptyTraceSummary, isRuntimeObservedSource, nowIso, stableNumber } from './helpers';
import { loadAstGraphContext, loadStructuralGraphContext } from './graph-loading';
import { computeTraceSummary } from './summary';
import { buildSpanToPathMappings } from './span-matching';
import { buildStaticTraceSeed, generateAstBasedTraces } from './trace-generation';
import { loadTracesFromFile } from './trace-loading';
import { saveRuntimeTracesArtifact, saveTraceDiffArtifact } from './artifacts';
import { compareWithStaticGraph } from './comparison';

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
    source = 'manual';
    sourceDetails = {
      kind: 'manual_tracer',
      runtimeObserved: true,
      deterministic: false,
      reason: null,
    };
  } else if (!useSimulation && options?.traceFile) {
    try {
      traces = loadTracesFromFile(options.traceFile);
      source = options.traceSource || 'real';
      sourceDetails = {
        kind: 'trace_file',
        runtimeObserved: isRuntimeObservedSource(source),
        deterministic: false,
        reason: null,
      };
    } catch (err) {
      console.warn(
        `[otel-runtime] Failed to load ${options.traceFile}: ${String(err)}. Runtime traces are not available.`,
      );
      traces = [];
      source = 'not_available';
      sourceDetails = {
        kind: 'none',
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
    source = 'not_available';
    sourceDetails = {
      kind: 'otel_collector',
      runtimeObserved: false,
      deterministic: true,
      reason: 'collector URL requires an external OTLP fetcher or local trace file',
    };
  } else {
    const graphSeed = buildStaticTraceSeed(astCtx, structCtx);
    traces = generateAstBasedTraces(astCtx, structCtx, 8 + stableNumber(`${graphSeed}:count`, 8));
    source = 'simulated';
    sourceDetails = {
      kind: 'ast_static_map',
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
