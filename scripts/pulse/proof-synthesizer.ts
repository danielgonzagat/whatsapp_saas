import type { PulseGeneratedDiagnostic } from './diagnostic-synthesizer';

export interface PulseProofRequirement {
  kind: string;
  reason: string;
  predicateKind: string;
  signalIds: string[];
}

export interface PulseSynthesizedProofPlan {
  diagnosticId: string;
  requirements: PulseProofRequirement[];
}

function proofKindFor(predicateKind: string): string {
  const normalized = predicateKind
    .toLowerCase()
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      const isAsciiLetter = code >= 97 && code <= 122;
      const isAsciiDigit = code >= 48 && code <= 57;
      return isAsciiLetter || isAsciiDigit ? char : '_';
    })
    .join('')
    .split('_')
    .filter(Boolean)
    .join('_');

  return normalized ? `prove_${normalized}` : 'prove_evidence';
}

export function synthesizeProofPlan(
  diagnostic: PulseGeneratedDiagnostic,
): PulseSynthesizedProofPlan {
  const predicateContracts =
    diagnostic.proofContract.predicates.length > 0
      ? diagnostic.proofContract.predicates
      : diagnostic.predicateKinds.map((kind) => ({
          kind,
          signalIds: diagnostic.evidenceIds,
        }));
  const requirementByKind = new Map<string, PulseProofRequirement>();

  for (const predicate of predicateContracts) {
    const kind = proofKindFor(predicate.kind);
    const existing = requirementByKind.get(kind);

    requirementByKind.set(kind, {
      kind,
      predicateKind: predicate.kind,
      signalIds: [...new Set([...(existing?.signalIds ?? []), ...predicate.signalIds])],
      reason: `Required by generated diagnostic predicate ${predicate.kind}.`,
    });
  }

  const requirements = [...requirementByKind.values()];

  if (!diagnostic.blockingEligible) {
    requirements.unshift({
      kind: 'prove_blocking_grade_evidence',
      predicateKind: 'truth_observed_or_confirmed_static',
      signalIds: diagnostic.evidenceIds,
      reason:
        'Weak or inferred-only signals cannot block by themselves; PULSE must confirm with observed or static evidence before treating this as final truth.',
    });
  }

  if (requirements.length === 0) {
    requirements.push({
      kind: 'prove_evidence',
      predicateKind: 'evidence',
      signalIds: [],
      reason: 'No predicate carried enough confidence to produce a specialized proof.',
    });
  }

  return {
    diagnosticId: diagnostic.id,
    requirements,
  };
}
