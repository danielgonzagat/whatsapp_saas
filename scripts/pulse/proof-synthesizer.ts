import type { PulseGeneratedDiagnostic } from './diagnostic-synthesizer';

export interface PulseProofRequirement {
  kind: string;
  reason: string;
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
  const requirements = [...new Set(diagnostic.predicateKinds.map(proofKindFor))].map((kind) => ({
    kind,
    reason: `Required by generated diagnostic predicate for ${diagnostic.title}.`,
  }));

  if (requirements.length === 0) {
    requirements.push({
      kind: 'prove_evidence',
      reason: 'No predicate carried enough confidence to produce a specialized proof.',
    });
  }

  return {
    diagnosticId: diagnostic.id,
    requirements,
  };
}
