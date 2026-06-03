/**
 * DefinitionOfDoneEngine — PULSE Phase 8
 *
 * Evaluates whether a capability, flow, or surface is "done" based on:
 * - Structural role coverage (all required roles present and evidenced)
 * - Truth mode parity (evidence meets or exceeds target certainty level)
 * - Codacy hygiene (zero high-severity issues)
 * - Absence of phantom or latent-critical signals
 */

import type { StructuralRole, TruthMode } from './types.structural-roles';

export type { StructuralRole, TruthMode };

/** Evidence certainty used by DoD. `not_available` is an explicit proof gap. */
export type DoDEvidenceTruthMode = TruthMode | 'not_available';

/** Evidence record for a single structural role within a capability. */
export interface CapabilityRoleEvidence {
  /** The architectural role being evidenced. */
  role: StructuralRole;
  /** Whether evidence of this role was found. */
  present: boolean;
  /** The epistemic certainty level of the evidence. */
  truthMode: DoDEvidenceTruthMode;
  /** Optional file/symbol path where evidence was located. */
  evidencePath?: string;
}

/** Input to the definition-of-done evaluator for one capability/flow/surface. */
export interface CapabilityDoneInput {
  /** Unique identifier for the capability, flow, or surface. */
  id: string;
  /** Discriminator for the kind of unit being evaluated. */
  kind: 'capability' | 'flow' | 'surface';
  /** The structural roles that must be present for this unit to be done. */
  requiredRoles: StructuralRole[];
  /** Evidence collected for each role (may include non-required roles). */
  evidence: CapabilityRoleEvidence[];
  /** Number of high-severity Codacy issues for this unit. */
  codacyHighCount: number;
  /** Whether a phantom signal (code path that never executes) was detected. */
  hasPhantom: boolean;
  /** Whether a latent critical signal (dormant failure path) was detected. */
  hasLatentCritical: boolean;
  /** The minimum truth mode level required for this unit to be considered done. */
  truthModeTarget: TruthMode;
}

/** Governed validation blocker emitted when proof is missing but AI can validate it. */
export interface CapabilityGovernedValidationBlocker {
  /** Structural role or proof class that still needs evidence. */
  role: StructuralRole | 'codacy_hygiene' | 'phantom_signal' | 'latent_critical';
  /** Missing proof is always routed through governed autonomous validation. */
  executionMode: 'ai_safe';
  /** Why this blocker exists. */
  reason: string;
  /** Expected validation action for an autonomous worker. */
  expectedValidation: string;
}

/** Result of the definition-of-done evaluation for one unit. */
export interface CapabilityDoneResult {
  /** Identifier mirrored from the input. */
  id: string;
  /** True only when all conditions are satisfied. */
  done: boolean;
  /** Human-readable explanations for each failure condition. */
  reasons: string[];
  /** Required roles that had no evidence or were marked absent. */
  missingRoles: StructuralRole[];
  /** Required roles that are present but below the configured truth target. */
  insufficientEvidenceRoles: StructuralRole[];
  /** Whether the evidence truth mode satisfies the target. */
  truthModeMet: boolean;
  /** Governed autonomous validation blockers for missing proof. */
  governedBlockers: CapabilityGovernedValidationBlocker[];
}

/**
 * Ordinal ranking for TruthMode comparison.
 * Higher value = higher certainty.
 */
const TRUTH_MODE_RANK: Record<TruthMode, number> = {
  observed: 2,
  inferred: 1,
  aspirational: 0,
};

const DOD_TRUTH_MODE_RANK: Record<DoDEvidenceTruthMode, number> = {
  observed: 2,
  inferred: 1,
  aspirational: 0,
  not_available: -1,
};

/**
 * Returns the best (highest-certainty) TruthMode among all present evidence
 * entries. Returns 'not_available' when no evidence is present.
 */
function bestTruthMode(evidence: CapabilityRoleEvidence[]): DoDEvidenceTruthMode {
  const presentEvidence = evidence.filter((e) => e.present);
  if (presentEvidence.length === 0) {
    return 'not_available';
  }
  return presentEvidence.reduce<DoDEvidenceTruthMode>((best, e) => {
    return DOD_TRUTH_MODE_RANK[e.truthMode] > DOD_TRUTH_MODE_RANK[best] ? e.truthMode : best;
  }, 'not_available');
}

function bestRoleTruthMode(evidence: CapabilityRoleEvidence[]): DoDEvidenceTruthMode | null {
  const presentEvidence = evidence.filter((e) => e.present);
  if (presentEvidence.length === 0) {
    return null;
  }
  return presentEvidence.reduce<DoDEvidenceTruthMode>((best, e) => {
    return DOD_TRUTH_MODE_RANK[e.truthMode] > DOD_TRUTH_MODE_RANK[best] ? e.truthMode : best;
  }, 'not_available');
}

function expectedValidationForRole(input: CapabilityDoneInput, role: StructuralRole): string {
  const subject = `${input.kind} ${input.id}`;
  switch (role) {
    case 'runtime_evidence':
      return `Run governed runtime evidence collection for ${subject}.`;
    case 'scenario_coverage':
      return `Run governed scenario or flow evidence for ${subject}.`;
    case 'validation':
      return `Run targeted typecheck and tests that exercise ${subject}.`;
    case 'observability':
      return `Run governed observability evidence scan for ${subject}.`;
    case 'codacy_hygiene':
      return `Re-sync Codacy evidence and prove zero HIGH issues for ${subject}.`;
    default:
      return `Run governed structural evidence validation for role ${role} on ${subject}.`;
  }
}

function makeGovernedBlocker(args: {
  role: CapabilityGovernedValidationBlocker['role'];
  reason: string;
  expectedValidation: string;
}): CapabilityGovernedValidationBlocker {
  return {
    role: args.role,
    executionMode: 'ai_safe',
    reason: args.reason,
    expectedValidation: args.expectedValidation,
  };
}

/**
 * Evaluates whether a single capability/flow/surface meets the definition of done.
 *
 * Rules:
 * 1. All required roles must have at least one evidence record with present=true.
 * 2. Every required role's best truth mode must be >= truthModeTarget.
 * 3. codacyHighCount must be 0.
 * 4. hasPhantom must be false.
 * 5. hasLatentCritical must be false.
 *
 * @param input - The capability evaluation input.
 * @returns A CapabilityDoneResult with done flag, reasons, and diagnostics.
 */
export function evaluateDone(input: CapabilityDoneInput): CapabilityDoneResult {
  const reasons: string[] = [];
  const governedBlockers: CapabilityGovernedValidationBlocker[] = [];

  // Build a lookup: role → evidence entries (present=true only)
  const presentByRole = new Map<StructuralRole, CapabilityRoleEvidence[]>();
  for (const ev of input.evidence) {
    if (ev.present) {
      const existing = presentByRole.get(ev.role);
      if (existing) {
        existing.push(ev);
      } else {
        presentByRole.set(ev.role, [ev]);
      }
    }
  }

  // 1. Identify missing required roles
  const missingRoles: StructuralRole[] = input.requiredRoles.filter(
    (role) => !presentByRole.has(role),
  );

  if (missingRoles.length > 0) {
    const reason = `Missing required roles: ${missingRoles.join(', ')}`;
    reasons.push(reason);
    for (const role of missingRoles) {
      governedBlockers.push(
        makeGovernedBlocker({
          role,
          reason: `Missing observed evidence for required role ${role}.`,
          expectedValidation: expectedValidationForRole(input, role),
        }),
      );
    }
  }

  // 2. Truth mode check. A global observed signal cannot upgrade a separate
  // required role that is only inferred or aspirational.
  const current = bestTruthMode(input.evidence);
  const insufficientEvidenceRoles = input.requiredRoles.filter((role) => {
    const roleTruthMode = bestRoleTruthMode(presentByRole.get(role) || []);
    return (
      roleTruthMode !== null &&
      DOD_TRUTH_MODE_RANK[roleTruthMode] < TRUTH_MODE_RANK[input.truthModeTarget]
    );
  });
  const truthModeMet = missingRoles.length === 0 && insufficientEvidenceRoles.length === 0;
  if (!truthModeMet) {
    reasons.push(`Truth mode '${current}' does not meet target '${input.truthModeTarget}'`);
    for (const role of insufficientEvidenceRoles) {
      governedBlockers.push(
        makeGovernedBlocker({
          role,
          reason: `Required role ${role} is below truth target ${input.truthModeTarget}.`,
          expectedValidation: expectedValidationForRole(input, role),
        }),
      );
    }
  }

  // 3. Codacy hygiene
  if (input.codacyHighCount > 0) {
    const reason = `${input.codacyHighCount} high-severity Codacy issue(s) remaining`;
    reasons.push(reason);
    governedBlockers.push(
      makeGovernedBlocker({
        role: 'codacy_hygiene',
        reason,
        expectedValidation: `Run governed Codacy evidence sync for ${input.kind} ${input.id}.`,
      }),
    );
  }

  // 4. Phantom signal
  if (input.hasPhantom) {
    const reason = 'Phantom signal detected (unreachable or dead code path)';
    reasons.push(reason);
    governedBlockers.push(
      makeGovernedBlocker({
        role: 'phantom_signal',
        reason,
        expectedValidation: `Run governed structural and runtime validation to replace phantom proof for ${input.kind} ${input.id}.`,
      }),
    );
  }

  // 5. Latent critical signal
  if (input.hasLatentCritical) {
    const reason = 'Latent critical signal detected (dormant failure path)';
    reasons.push(reason);
    governedBlockers.push(
      makeGovernedBlocker({
        role: 'latent_critical',
        reason,
        expectedValidation: `Run governed critical-path validation for ${input.kind} ${input.id}.`,
      }),
    );
  }

  const done =
    missingRoles.length === 0 &&
    truthModeMet &&
    input.codacyHighCount === 0 &&
    !input.hasPhantom &&
    !input.hasLatentCritical;

  return {
    id: input.id,
    done,
    reasons,
    missingRoles,
    insufficientEvidenceRoles,
    truthModeMet,
    governedBlockers,
  };
}

/**
 * Evaluates a batch of capability/flow/surface inputs.
 *
 * @param inputs - Array of CapabilityDoneInput records.
 * @returns Array of CapabilityDoneResult in the same order as inputs.
 */
export function evaluateBatch(inputs: CapabilityDoneInput[]): CapabilityDoneResult[] {
  return inputs.map(evaluateDone);
}
