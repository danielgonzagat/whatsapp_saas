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

/** Evidence record for a single structural role within a capability. */
export interface CapabilityRoleEvidence {
  /** The architectural role being evidenced. */
  role: StructuralRole;
  /** Whether evidence of this role was found. */
  present: boolean;
  /** The epistemic certainty level of the evidence. */
  truthMode: TruthMode;
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
  /** Whether the evidence truth mode satisfies the target. */
  truthModeMet: boolean;
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

/**
 * Returns the best (highest-certainty) TruthMode among all present evidence
 * entries. Returns 'aspirational' when no evidence is present.
 */
function bestTruthMode(evidence: CapabilityRoleEvidence[]): TruthMode {
  const presentEvidence = evidence.filter((e) => e.present);
  if (presentEvidence.length === 0) {
    return 'aspirational';
  }
  return presentEvidence.reduce<TruthMode>((best, e) => {
    return TRUTH_MODE_RANK[e.truthMode] > TRUTH_MODE_RANK[best] ? e.truthMode : best;
  }, 'aspirational');
}

/**
 * Evaluates whether a single capability/flow/surface meets the definition of done.
 *
 * Rules:
 * 1. All required roles must have at least one evidence record with present=true.
 * 2. The best truth mode across all present evidence must be >= truthModeTarget.
 * 3. codacyHighCount must be 0.
 * 4. hasPhantom must be false.
 * 5. hasLatentCritical must be false.
 *
 * @param input - The capability evaluation input.
 * @returns A CapabilityDoneResult with done flag, reasons, and diagnostics.
 */
export function evaluateDone(input: CapabilityDoneInput): CapabilityDoneResult {
  const reasons: string[] = [];

  // Build a lookup: role → evidence entries (present=true only)
  const presentByRole = new Map<StructuralRole, CapabilityRoleEvidence[]>();
  for (const ev of input.evidence) {
    if (ev.present) {
      if (!presentByRole.has(ev.role)) {
        presentByRole.set(ev.role, []);
      }
      presentByRole.get(ev.role)!.push(ev);
    }
  }

  // 1. Identify missing required roles
  const missingRoles: StructuralRole[] = input.requiredRoles.filter(
    (role) => !presentByRole.has(role),
  );

  if (missingRoles.length > 0) {
    reasons.push(`Missing required roles: ${missingRoles.join(', ')}`);
  }

  // 2. Truth mode check
  const current = bestTruthMode(input.evidence);
  const truthModeMet = TRUTH_MODE_RANK[current] >= TRUTH_MODE_RANK[input.truthModeTarget];
  if (!truthModeMet) {
    reasons.push(`Truth mode '${current}' does not meet target '${input.truthModeTarget}'`);
  }

  // 3. Codacy hygiene
  if (input.codacyHighCount > 0) {
    reasons.push(`${input.codacyHighCount} high-severity Codacy issue(s) remaining`);
  }

  // 4. Phantom signal
  if (input.hasPhantom) {
    reasons.push('Phantom signal detected (unreachable or dead code path)');
  }

  // 5. Latent critical signal
  if (input.hasLatentCritical) {
    reasons.push('Latent critical signal detected (dormant failure path)');
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
    truthModeMet,
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
