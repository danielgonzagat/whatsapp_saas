/**
 * UTP-AGENCY-009..010 — Camada XXV Agency Intelligence contracts.
 *
 * PortfolioStateService and PerClientContextBundler types with
 * strict client isolation guarantees.
 */

export interface ConsolidatedPortfolioState {
  readonly agencyWorkspaceId: string;
  readonly clientCount: number;
  readonly marginPerClient: readonly MarginSnapshot[];
  readonly churnRiskPerClient: readonly ChurnRiskSnapshot[];
  readonly priorityRanking: readonly PrioritySnapshot[];
  readonly teamLoad: TeamLoadSnapshot | null;
  readonly assessedAt: string;
}

export interface MarginSnapshot {
  readonly clientWorkspaceId: string;
  readonly marginPercent: number;
  readonly marginCents: bigint;
  readonly revenueCents: bigint;
  readonly costCents: bigint;
  readonly trend: MarginTrend;
}
type MarginTrend = 'improving' | 'stable' | 'declining' | 'negative';

export interface ChurnRiskSnapshot {
  readonly clientWorkspaceId: string;
  readonly riskLevel: ChurnRiskLevel;
  readonly riskProbability: number;
  readonly signals: readonly string[];
}
type ChurnRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface PrioritySnapshot {
  readonly clientWorkspaceId: string;
  readonly rank: number;
  readonly score: number;
  readonly tier: PriorityTier;
  readonly drivers: readonly string[];
}
type PriorityTier = 'agora' | 'esta_semana' | 'em_breve' | 'sustentar';

export interface TeamLoadSnapshot {
  readonly totalMembers: number;
  readonly overworkedCount: number;
  readonly underutilizedCount: number;
  readonly recommendation: string;
}

export interface PortfolioResult {
  readonly state: ConsolidatedPortfolioState;
  readonly summary: string;
}

export interface ClientContextBundle {
  readonly clientWorkspaceId: string;
  readonly agencyWorkspaceId: string;
  readonly bundledAt: string;
  readonly isolationToken: string;
  readonly activeProjects: number;
  readonly openIssues: number;
  readonly satisfactionScore: number;
  readonly revenueCents: bigint;
  readonly relationshipDays: number;
  readonly contractRenewalAt: string | null;
  readonly tags: readonly string[];
}

export interface ContextBundleResult {
  readonly bundle: ClientContextBundle;
  readonly isolationVerified: boolean;
  readonly isolationHash: string;
}

export interface BundleBuildInput {
  readonly agencyWorkspaceId: string;
  readonly clientWorkspaceId: string;
  readonly activeProjects?: number;
  readonly openIssues?: number;
  readonly satisfactionScore?: number;
  readonly revenueCents?: bigint;
  readonly relationshipDays?: number;
  readonly contractRenewalAt?: string | null;
  readonly tags?: readonly string[];
  readonly nowMs?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampScore(value: number): number {
  return clamp(value, 0, 1);
}
