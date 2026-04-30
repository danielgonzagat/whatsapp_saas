import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break } from '../types';

export interface ParserDiagnosticBreakInput {
  detector: string;
  source: string;
  truthMode: PulseSignalEvidence['truthMode'];
  severity: Break['severity'];
  file: string;
  line: number;
  summary: string;
  detail: string;
  surface: string;
  runtimeImpact?: number;
}

export function buildParserDiagnosticBreak(input: ParserDiagnosticBreakInput): Break {
  const signal: PulseSignalEvidence = {
    source: input.source,
    detector: input.detector,
    truthMode: input.truthMode,
    summary: input.summary,
    detail: input.detail,
    location: {
      file: input.file,
      line: input.line,
    },
  };
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const risk = calculateDynamicRisk({ predicateGraph, runtimeImpact: input.runtimeImpact });
  const diagnostic = synthesizeDiagnostic(signalGraph, predicateGraph, risk);

  return {
    type: diagnostic.id,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}; ${input.detail}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: input.surface,
  };
}
