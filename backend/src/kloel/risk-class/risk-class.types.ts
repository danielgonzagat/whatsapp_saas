/**
 * Camada XIII — Delegation Confidence Tracking (R-tier classification).
 *
 * RiskClassService classifies any action into R1..R4 with autonomy mode,
 * required evidence level, and rollback strategies.
 *
 * Part of UTP-DELEG-001: delegation-state-tracker.
 */

type ActionKind =
  | 'message_send'
  | 'discount_offer'
  | 'lead_block'
  | 'payment_action'
  | 'public_response'
  | 'context_org';

export type ActionTarget = 'self' | 'lead' | 'team' | 'public';

export interface ActionDescriptor {
  readonly kind: ActionKind;
  readonly target: ActionTarget;
  readonly reversible: boolean;
  readonly financialImpactCents?: number;
}

export type RiskClass = 'R1' | 'R2' | 'R3' | 'R4';

export type AutonomyMode =
  | 'allowed_alone'
  | 'requires_approval'
  | 'must_escalate'
  | 'forbidden';

export type EvidenceLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6';

export interface RiskClassification {
  readonly class: RiskClass;
  readonly autonomyMode: AutonomyMode;
  readonly requiredEvidenceLevel: EvidenceLevel;
  readonly rollback: readonly string[];
}
