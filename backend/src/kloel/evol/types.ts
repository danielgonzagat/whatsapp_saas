/**
 * EVOL types — Camada XXXII: Self-Evolution under absolute human governance.
 *
 * UTP-EVOL-001..010. All types are read-only at the contract level.
 */

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';

export type CommercialImpact = 'revenue_blocking' | 'trust_eroding' | 'quality_degrading' | 'opportunity_missed' | 'neutral';

export type RTier = 'tier_1_functional' | 'tier_2_partial' | 'tier_3_facade' | 'tier_4_shell';

export type AuthorizationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type Role = 'advisory' | 'tool_limited' | 'human_required';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ViolationKind = 'protected_file_touch' | 'codacy_weakening' | 'bypass_suppression' | 'governance_breach';

export interface SelfGap {
  readonly id: string;
  readonly workspaceId: string;
  readonly domain: string;
  readonly description: string;
  readonly severity: GapSeverity;
  readonly commercialImpact: CommercialImpact;
  readonly estimatedRevenueRiskCents: number;
  readonly detectedAt: string;
  readonly sourceEvidence: readonly string[];
  readonly confidence: number;
}

export interface ImprovementProposal {
  readonly id: string;
  readonly gapId: string;
  readonly workspaceId: string;
  readonly description: string;
  readonly targetFiles: readonly string[];
  readonly expectedDelta: string;
  readonly riskAssessment: 'safe' | 'normal' | 'high' | 'critical';
  readonly evidence: readonly string[];
  readonly generatedAt: string;
  readonly status: 'draft' | 'submitted' | 'authorized' | 'rejected';
}

export interface HumanAuthorization {
  readonly id: string;
  readonly proposalId: string;
  readonly workspaceId: string;
  readonly status: AuthorizationStatus;
  readonly authorityLevel: Role;
  readonly humanPrincipal: string;
  readonly reason: string;
  readonly authorizedAt: string | null;
  readonly expiresAt: string;
  readonly scope: readonly string[];
}

export interface AgentOrchestrationBridge {
  readonly id: string;
  readonly authorizationId: string;
  readonly workspaceId: string;
  readonly targetAgent: string;
  readonly targetFiles: readonly string[];
  readonly instructions: string;
  readonly status: 'queued' | 'dispatched' | 'completed' | 'failed';
  readonly dispatchedAt: string | null;
  readonly completedAt: string | null;
  readonly resultHash: string | null;
  readonly errorMessage: string | null;
}

export interface ExperimentRun {
  readonly id: string;
  readonly proposalId: string;
  readonly workspaceId: string;
  readonly hypproofExperimentId: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly evidenceCount: number;
  readonly verdict: 'confirmed' | 'refuted' | 'inconclusive' | null;
}

export interface RTierDelta {
  readonly workspaceId: string;
  readonly module: string;
  readonly previousTier: RTier;
  readonly currentTier: RTier;
  readonly metrics: Readonly<Record<string, number>>;
  readonly changedAt: string;
  readonly direction: 'upgraded' | 'downgraded' | 'unchanged';
  readonly reason: string;
}

export interface AutomaticRollback {
  readonly id: string;
  readonly proposalId: string;
  readonly workspaceId: string;
  readonly triggeredAt: string;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly executedAt: string | null;
  readonly status: 'pending' | 'executed' | 'failed';
  readonly rollbackDurationMs: number;
  readonly wasAutomatic: boolean;
}

export interface ProtectedFilesFirewall {
  readonly violationId: string;
  readonly filePath: string;
  readonly agentIdentity: string;
  readonly violationKind: ViolationKind;
  readonly blockedAt: string;
  readonly reason: string;
  readonly escalationRequired: boolean;
}

export interface CodacyRigorCheck {
  readonly checkId: string;
  readonly baseline: Readonly<Record<string, boolean>>;
  readonly current: Readonly<Record<string, boolean>>;
  readonly violations: readonly string[];
  readonly status: 'compliant' | 'degraded' | 'violated';
  readonly checkedAt: string;
}

export interface EvolutionAudit {
  readonly entryId: string;
  readonly workspaceId: string;
  readonly action: string;
  readonly actor: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly recordedAt: string;
  readonly correlationId: string;
  readonly authorizationId: string | null;
}

export function clamp(domain: [number, number], value: number): number {
  return Math.min(domain[1], Math.max(domain[0], value));
}

export function commercialImpactWeight(impact: CommercialImpact): number {
  const weights: Record<CommercialImpact, number> = {
    revenue_blocking: 1.0,
    trust_eroding: 0.9,
    quality_degrading: 0.7,
    opportunity_missed: 0.5,
    neutral: 0.1,
  };
  return weights[impact];
}

export function tierToNumber(tier: RTier): number {
  const map: Record<RTier, number> = {
    tier_1_functional: 1,
    tier_2_partial: 2,
    tier_3_facade: 3,
    tier_4_shell: 4,
  };
  return map[tier];
}
