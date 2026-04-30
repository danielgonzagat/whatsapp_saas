import type { Break } from './types';
import { calculateDynamicRisk } from './dynamic-risk-model';
import { synthesizeDiagnostic } from './diagnostic-synthesizer';
import { buildPredicateGraph } from './predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from './signal-graph';

function truthModeFromBreak(item: Break): PulseSignalEvidence['truthMode'] {
  const source = item.source ?? '';
  if (/\b(runtime|sentry|datadog|prometheus|playwright|e2e|probe|scenario)\b/i.test(source)) {
    return 'observed';
  }
  if (
    /\b(ast|dataflow|structural|graph|contract|schema|codacy|typescript|ts-morph)\b/i.test(source)
  ) {
    return 'confirmed_static';
  }
  if (/\b(regex|pattern|string scan|heuristic|allowlist|hardcoded list)\b/i.test(source)) {
    return 'weak_signal';
  }
  return 'inferred';
}

export function convertBreakToSignal(item: Break): PulseSignalEvidence {
  return {
    source: item.source ?? 'legacy-break-adapter',
    detector: 'legacy-compatibility',
    truthMode: truthModeFromBreak(item),
    summary: item.description,
    detail: item.detail,
    location: {
      file: item.file,
      line: item.line,
    },
  };
}

export function synthesizeDiagnosticFromBreaks(breaks: readonly Break[]) {
  const signalGraph = buildPulseSignalGraph(breaks.map(convertBreakToSignal));
  const predicateGraph = buildPredicateGraph(signalGraph);
  const risk = calculateDynamicRisk({ predicateGraph });
  return synthesizeDiagnostic(signalGraph, predicateGraph, risk);
}
