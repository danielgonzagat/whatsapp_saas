/**
 * UTP-DELEG-001..006 — Camada XIII (Delegation Confidence Tracking).
 *
 * Tracks delegation confidence per workspace per operational area,
 * detects graduation readiness, proposes autonomy expansion with evidence,
 * rolls back when confidence breaks, and packages evidence bundles for
 * human-auditable delegation decisions.
 *
 * Implements B0.2 (R17 metrics) and the Camada XIII semantics from the
 * Cognitive Organism Plan (Parte B — DELEG family).
 */

export type DelegationArea =
  | 'checkout'
  | 'crm'
  | 'whatsapp'
  | 'campaigns'
  | 'member_area'
  | 'affiliate'
  | 'kyc'
  | 'postsale'
  | 'coldstart'
  | 'recovery'
  | 'trust'
  | 'insight'
  | 'maturity'
  | 'wow'
  | 'team'
  | 'clarity'
  | 'offer'
  | 'wisdom';

export type DelegationLevel = 'manual' | 'supervised' | 'semi_autonomous' | 'autonomous';

export const DELEGATION_LEVEL_ORDER: Readonly<Record<DelegationLevel, number>> = {
  manual: 0,
  supervised: 1,
  semi_autonomous: 2,
  autonomous: 3,
};

export const ALL_DELEGATION_AREAS: readonly DelegationArea[] = [
  'checkout',
  'crm',
  'whatsapp',
  'campaigns',
  'member_area',
  'affiliate',
  'kyc',
  'postsale',
  'coldstart',
  'recovery',
  'trust',
  'insight',
  'maturity',
  'wow',
  'team',
  'clarity',
  'offer',
  'wisdom',
];

export interface AreaDelegationState {
  readonly area: DelegationArea;
  readonly workspaceId: string;
  readonly currentLevel: DelegationLevel;
  readonly proposedLevel: DelegationLevel;
  readonly confidenceScore: number;
  readonly evidenceCount: number;
  readonly lastGraduatedAt: string | null;
  readonly lastDemotedAt: string | null;
  readonly cyclesAtCurrentLevel: number;
  readonly gatePassRate: number;
  readonly errorRate: number;
  readonly updatedAt: string;
}

export interface DelegationSnapshotInput {
  readonly area: DelegationArea;
  readonly workspaceId: string;
  readonly gatePassCount: number;
  readonly gateFailCount: number;
  readonly errorCount: number;
  readonly totalEvents: number;
  readonly consecutiveCyclesOk: number;
  readonly trustScore: number;
  readonly nowMs: number;
}

export interface GraduationVerdict {
  readonly area: DelegationArea;
  readonly workspaceId: string;
  readonly verdict: 'promote' | 'hold' | 'demote';
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly suggestedLevel: DelegationLevel;
  readonly generatedAt: string;
}

export interface AutonomySuggestion {
  readonly suggestionId: string;
  readonly area: DelegationArea;
  readonly workspaceId: string;
  readonly currentLevel: DelegationLevel;
  readonly proposedLevel: DelegationLevel;
  readonly evidenceEventIds: readonly string[];
  readonly confidence: number;
  readonly businessImpact: string;
  readonly riskAssessment: string;
  readonly generatedAt: string;
}

export interface RollbackPolicy {
  readonly area: DelegationArea;
  readonly workspaceId: string;
  readonly triggerEvent: string;
  readonly triggeredAt: string;
  readonly fromLevel: DelegationLevel;
  readonly toLevel: DelegationLevel;
  readonly reason: string;
  readonly recoveryThreshold: number;
}

export interface DelegationEvidence {
  readonly evidenceId: string;
  readonly area: DelegationArea;
  readonly workspaceId: string;
  readonly eventsAnalyzed: number;
  readonly gatePassCount: number;
  readonly gateFailCount: number;
  readonly errorCount: number;
  readonly consecutiveCyclesOk: number;
  readonly trustScore: number;
  readonly recommendationConfidence: number;
  readonly r17Score: number;
  readonly generatedAt: string;
}

export const DELEGATION_GRADUATION_THRESHOLD = 0.8;
export const DELEGATION_DEMOTION_THRESHOLD = 0.3;
export const DELEGATION_MIN_CYCLES_FOR_GRADUATION = 3;
export const DELEGATION_MIN_EVIDENCE_FOR_GRADUATION = 10;
export const DELEGATION_COOLDOWN_DAYS = 7;

export function nextDelegationLevel(current: DelegationLevel): DelegationLevel {
  const order = DELEGATION_LEVEL_ORDER[current];
  if (order >= 3) {
    return 'autonomous';
  }
  const entry = Object.entries(DELEGATION_LEVEL_ORDER).find(([, v]) => v === order + 1);
  return (entry?.[0] as DelegationLevel) ?? 'autonomous';
}

export function previousDelegationLevel(current: DelegationLevel): DelegationLevel {
  const order = DELEGATION_LEVEL_ORDER[current];
  if (order <= 0) {
    return 'manual';
  }
  const entry = Object.entries(DELEGATION_LEVEL_ORDER).find(([, v]) => v === order - 1);
  return (entry?.[0] as DelegationLevel) ?? 'manual';
}
