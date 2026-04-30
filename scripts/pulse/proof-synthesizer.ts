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
  if (predicateKind.includes('observability')) return 'runtime_signal_probe';
  if (predicateKind.includes('recovery')) return 'rollback_or_recovery_probe';
  if (predicateKind.includes('validation')) return 'contract_or_boundary_probe';
  if (predicateKind.includes('hardcoded')) return 'dynamic_discovery_replacement_proof';
  if (predicateKind.includes('durable') || predicateKind.includes('mutation'))
    return 'state_effect_probe';
  if (predicateKind.includes('external')) return 'boundary_effect_probe';
  return 'evidence_confirmation_probe';
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
      kind: 'evidence_confirmation_probe',
      reason: 'No predicate carried enough confidence to produce a specialized proof.',
    });
  }

  return {
    diagnosticId: diagnostic.id,
    requirements,
  };
}
