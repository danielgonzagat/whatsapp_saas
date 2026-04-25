import type { PulseStructuralRole } from './types';
import type { PulseDoDStatus } from './types.capabilities';
import type {
  CapabilityRoleEvidence,
  StructuralRole as DoDStructuralRole,
} from './definition-of-done';

/**
 * Definition-of-Done helpers for `capability-model.ts`.
 *
 * Extracted as a sibling so the parent module stays under the 600-line
 * touched-file architecture cap. The exported values preserve their
 * previous behaviour exactly.
 */

/**
 * Required DoD roles for a runtime-critical product capability.
 * A capability is "done" when these roles are evidenced + truth mode meets target
 * + zero high Codacy issues + no phantom/latent critical signal.
 */
export const CAPABILITY_REQUIRED_DOD_ROLES: DoDStructuralRole[] = [
  'interface',
  'orchestration',
  'persistence',
  'side_effect',
  'validation',
  'scenario_coverage',
];

/** Map a PULSE capability snapshot into DoD role-evidence records. */
export function buildCapabilityDoDEvidence(args: {
  rolesPresent: PulseStructuralRole[];
  hasRuntimeEvidence: boolean;
  hasScenarioCoverage: boolean;
  hasObservability: boolean;
  hasValidation: boolean;
  highSeverityIssueCount: number;
  truthMode: 'observed' | 'inferred' | 'aspirational';
}): CapabilityRoleEvidence[] {
  const evidence: CapabilityRoleEvidence[] = [];
  const tm = args.truthMode;
  const includes = (role: PulseStructuralRole): boolean => args.rolesPresent.includes(role);

  evidence.push({ role: 'interface', present: includes('interface'), truthMode: tm });
  evidence.push({ role: 'api_surface', present: includes('interface'), truthMode: tm });
  evidence.push({ role: 'orchestration', present: includes('orchestration'), truthMode: tm });
  evidence.push({ role: 'persistence', present: includes('persistence'), truthMode: tm });
  evidence.push({ role: 'side_effect', present: includes('side_effect'), truthMode: tm });
  evidence.push({
    role: 'runtime_evidence',
    present: args.hasRuntimeEvidence,
    truthMode: args.hasRuntimeEvidence ? 'observed' : 'aspirational',
  });
  evidence.push({
    role: 'validation',
    present: args.hasValidation,
    truthMode: args.hasValidation ? tm : 'aspirational',
  });
  evidence.push({
    role: 'scenario_coverage',
    present: args.hasScenarioCoverage,
    truthMode: args.hasScenarioCoverage ? 'observed' : 'aspirational',
  });
  evidence.push({
    role: 'observability',
    present: args.hasObservability,
    truthMode: args.hasObservability ? 'inferred' : 'aspirational',
  });
  evidence.push({
    role: 'codacy_hygiene',
    present: args.highSeverityIssueCount === 0,
    truthMode: 'observed',
  });

  return evidence;
}

/** Translate PULSE capability/flow status to DoD status enum. */
export function toDoDStatus(args: {
  done: boolean;
  pulseStatus: 'real' | 'partial' | 'latent' | 'phantom';
}): PulseDoDStatus {
  if (args.done) {
    return 'done';
  }
  if (args.pulseStatus === 'phantom') {
    return 'phantom';
  }
  if (args.pulseStatus === 'latent') {
    return 'latent';
  }
  return 'partial';
}
