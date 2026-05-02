import type { RuntimeCallGraphEvidence } from '../../types.otel-runtime';
import type { AstCallGraph } from '../../types.ast-graph';
import { isRuntimeObservedSource } from './helpers';
import { readJsonFile } from '../../safe-fs';

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
      missingFromRuntime: Math.max(0, structuralGraph.edges.length - observedInRuntime),
      coveragePercent:
        structuralGraph.edges.length > 0
          ? Math.round((observedInRuntime / structuralGraph.edges.length) * 100)
          : 100,
    },
    runtimeOnlyEdges,
  };
}

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
      missingFromRuntime: Math.max(0, graph.edges.length - observedInRuntime),
      coveragePercent:
        graph.edges.length > 0 ? Math.round((observedInRuntime / graph.edges.length) * 100) : 100,
    },
    runtimeOnlyEdges,
  };
}
