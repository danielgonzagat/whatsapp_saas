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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function withoutLegacyLabel(value: string, label: string): string {
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) return normalizeText(value);

  return normalizeText(value.replace(new RegExp(escapeRegExp(normalizedLabel), 'gi'), ''));
}

function sanitizedLegacyText(value: string, item: Break, fallback: string): string {
  const sanitized = withoutLegacyLabel(value, item.type);
  return sanitized || fallback;
}

export function convertBreakToSignal(item: Break): PulseSignalEvidence {
  const source = sanitizedLegacyText(item.source ?? '', item, 'legacy-break-adapter');
  const detail = withoutLegacyLabel(item.detail, item.type);

  return {
    source,
    detector: 'legacy-compatibility',
    truthMode: truthModeFromBreak(item),
    summary: sanitizedLegacyText(item.description, item, 'Legacy compatibility evidence'),
    detail: detail || undefined,
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
