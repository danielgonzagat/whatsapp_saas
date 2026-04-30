import type { PulseSignalGraph, PulseSignalNode } from './signal-graph';

export type PulsePredicateKind =
  | 'external_input'
  | 'durable_mutation'
  | 'external_effect'
  | 'public_exposure'
  | 'missing_control_evidence'
  | 'observed_failure'
  | 'validation_gap'
  | 'observability_gap'
  | 'recovery_gap'
  | 'hardcoded_reality';

export interface PulsePredicateNode {
  id: string;
  kind: PulsePredicateKind;
  signalIds: string[];
  confidence: number;
  summary: string;
}

export interface PulsePredicateGraph {
  generatedAt: string;
  predicates: PulsePredicateNode[];
}

interface PredicateRule {
  kind: PulsePredicateKind;
  evidence: RegExp;
}

const PREDICATE_RULES: PredicateRule[] = [
  {
    kind: 'external_input',
    evidence: /\b(input|request|form|query|body|param|payload|webhook)\b/i,
  },
  {
    kind: 'durable_mutation',
    evidence: /\b(write|create|update|delete|persist|database|schema|mutation)\b/i,
  },
  {
    kind: 'external_effect',
    evidence: /\b(send|call|provider|api|webhook|queue|email|message)\b/i,
  },
  { kind: 'public_exposure', evidence: /\b(public|route|endpoint|ui|page|browser|external)\b/i },
  {
    kind: 'missing_control_evidence',
    evidence: /\b(missing|without|no evidence|absent|uncovered)\b/i,
  },
  { kind: 'observed_failure', evidence: /\b(fail|error|exception|timeout|regression|observed)\b/i },
  { kind: 'validation_gap', evidence: /\b(validation|schema|contract|assertion|boundary)\b/i },
  { kind: 'observability_gap', evidence: /\b(metric|trace|log|alert|observability)\b/i },
  { kind: 'recovery_gap', evidence: /\b(recovery|rollback|backup|restore|retry)\b/i },
  {
    kind: 'hardcoded_reality',
    evidence: /\b(hardcode|allowlist|fixed list|literal|threshold|gate|profile)\b/i,
  },
];

function predicateId(kind: PulsePredicateKind, signal: PulseSignalNode): string {
  return `${kind}:${signal.id}`;
}

function evidenceText(signal: PulseSignalNode): string {
  return `${signal.summary} ${signal.detail ?? ''} ${signal.tags.join(' ')}`;
}

export function buildPredicateGraph(signalGraph: PulseSignalGraph): PulsePredicateGraph {
  const predicates: PulsePredicateNode[] = [];

  for (const signal of signalGraph.nodes) {
    const text = evidenceText(signal);
    for (const rule of PREDICATE_RULES) {
      if (!rule.evidence.test(text)) {
        continue;
      }
      predicates.push({
        id: predicateId(rule.kind, signal),
        kind: rule.kind,
        signalIds: [signal.id],
        confidence: signal.confidence,
        summary: `${rule.kind} inferred from ${signal.source}/${signal.detector}`,
      });
    }
  }

  return {
    generatedAt: signalGraph.generatedAt,
    predicates,
  };
}
