/**
 * UTP-AGENCY-001..008 — Camada XXV (Agency Intelligence).
 *
 * Operar multiplos clientes sem perder contexto, margem ou prioridade.
 * Zero vazamento de conhecimento entre clientes.
 */

export type ClientHealthStatus = 'healthy' | 'at_risk' | 'critical' | 'dormant' | 'offboarded';

export type PriorityTier = 'agora' | 'esta_semana' | 'em_breve' | 'sustentar';

export type ChurnRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export type MarginTrend = 'improving' | 'stable' | 'declining' | 'negative';

export type LeakSeverity = 'none' | 'low' | 'moderate' | 'high' | 'critical';

export type HandoffUrgency = 'now' | 'this_week' | 'next_week' | 'background';

export interface ClientContextBundle {
  readonly clientId: string;
  readonly workspaceId: string;
  readonly clientName: string;
  readonly relationshipAgeDays: number;
  readonly activeProjects: number;
  readonly monthlyRevenueCents: bigint;
  readonly lastContactAt: string;
  readonly openIssues: number;
  readonly satisfactionScore: number;
  readonly contractRenewalAt: string | null;
  readonly bundledAt: string;
  readonly tags: readonly string[];
}

export interface PortfolioState {
  readonly workspaceId: string;
  readonly totalClients: number;
  readonly activeClients: number;
  readonly atRiskClients: number;
  readonly criticalClients: number;
  readonly totalMonthlyRevenueCents: bigint;
  readonly averageSatisfactionScore: number;
  readonly healthScore: number;
  readonly assessedAt: string;
}

export interface PriorityRanking {
  readonly clientId: string;
  readonly workspaceId: string;
  readonly rank: number;
  readonly score: number;
  readonly tier: PriorityTier;
  readonly drivers: readonly string[];
  readonly rankedAt: string;
}

export interface MarginPerClient {
  readonly clientId: string;
  readonly workspaceId: string;
  readonly revenueCents: bigint;
  readonly costCents: bigint;
  readonly marginCents: bigint;
  readonly marginPercent: number;
  readonly trend: MarginTrend;
  readonly trendDeltaPercent: number;
  readonly assessedAt: string;
}

export interface ChurnRiskPerClient {
  readonly clientId: string;
  readonly workspaceId: string;
  readonly riskLevel: ChurnRiskLevel;
  readonly riskProbability: number;
  readonly signals: readonly string[];
  readonly daysSinceLastContact: number;
  readonly daysUntilRenewal: number | null;
  readonly assessedAt: string;
}

export interface TeamLoadBalance {
  readonly workspaceId: string;
  readonly teamMembers: readonly TeamMemberLoad[];
  readonly overworkedMembers: readonly string[];
  readonly underutilizedMembers: readonly string[];
  readonly recommendation: string;
  readonly assessedAt: string;
}

export interface TeamMemberLoad {
  readonly memberId: string;
  readonly memberName: string;
  readonly assignedClients: number;
  readonly maxCapacity: number;
  readonly loadPercent: number;
  readonly totalClientRevenueCents: bigint;
}

export interface InternalKnowledgeLeak {
  readonly workspaceId: string;
  readonly leakDetected: boolean;
  readonly severity: LeakSeverity;
  readonly affectedBundles: readonly LeakDetail[];
  readonly assessedAt: string;
}

export interface LeakDetail {
  readonly sourceClientId: string;
  readonly targetClientId: string;
  readonly leakedField: string;
  readonly severity: LeakSeverity;
}

export interface HandoffPackage {
  readonly handoffId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string | null;
  readonly clientId: string;
  readonly workspaceId: string;
  readonly urgency: HandoffUrgency;
  readonly contextBundle: ClientContextBundle;
  readonly priority: PriorityRanking | null;
  readonly margin: MarginPerClient | null;
  readonly churnRisk: ChurnRiskPerClient | null;
  readonly handoffNote: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface PortfolioInput {
  readonly bundles: readonly ClientContextBundle[];
  readonly workspaceId: string;
  readonly nowMs?: number;
}

export interface BundleInput {
  readonly clientId: string;
  readonly workspaceId: string;
  readonly clientName: string;
  readonly relationshipAgeDays: number;
  readonly activeProjects: number;
  readonly monthlyRevenueCents: bigint;
  readonly lastContactAt: string;
  readonly openIssues: number;
  readonly satisfactionScore: number;
  readonly contractRenewalAt: string | null;
  readonly nowMs?: number;
  readonly tags?: readonly string[];
}

export interface PriorityInput {
  readonly bundles: readonly ClientContextBundle[];
  readonly workspaceId: string;
  readonly nowMs?: number;
}

export interface MarginInput {
  readonly clientId: string;
  readonly workspaceId: string;
  readonly revenueCents: bigint;
  readonly costCents: bigint;
  readonly previousMarginPercent?: number;
  readonly nowMs?: number;
}

export interface ChurnInput {
  readonly bundle: ClientContextBundle;
  readonly recentContactDays: number;
  readonly delayedPayment: boolean;
  readonly complaintCount: number;
  readonly scopeReduction: boolean;
  readonly nowMs?: number;
}

export interface LoadInput {
  readonly workspaceId: string;
  readonly members: readonly TeamMemberInput[];
  readonly bundles: readonly ClientContextBundle[];
  readonly assignments: Readonly<Record<string, readonly string[]>>;
  readonly nowMs?: number;
}

export interface TeamMemberInput {
  readonly memberId: string;
  readonly memberName: string;
  readonly maxCapacity: number;
}

export interface LeakGuardInput {
  readonly workspaceId: string;
  readonly bundles: readonly ClientContextBundle[];
  readonly nowMs?: number;
}

export interface HandoffInput {
  readonly fromMemberId: string;
  readonly toMemberId: string | null;
  readonly clientId: string;
  readonly workspaceId: string;
  readonly urgency: HandoffUrgency;
  readonly note: string;
  readonly bundle: ClientContextBundle;
  readonly priority: PriorityRanking | null;
  readonly margin: MarginPerClient | null;
  readonly churnRisk: ChurnRiskPerClient | null;
  readonly createdBy: string;
  readonly nowMs?: number;
}

export const HIGH_PRIORITY_THRESHOLD = 0.7;
export const MEDIUM_PRIORITY_THRESHOLD = 0.4;
export const CHURN_CRITICAL_THRESHOLD = 0.7;
export const CHURN_HIGH_THRESHOLD = 0.5;
export const CHURN_MODERATE_THRESHOLD = 0.3;
export const OVERLOAD_THRESHOLD = 0.85;
export const UNDERLOAD_THRESHOLD = 0.3;
export const LEAK_CHECK_FIELDS = [
  'clientName',
  'monthlyRevenueCents',
  'openIssues',
  'satisfactionScore',
] as const satisfies readonly (keyof ClientContextBundle)[];
export const MAX_DAYS_WITHOUT_CONTACT_BEFORE_AT_RISK = 14;
export const MAX_DAYS_WITHOUT_CONTACT_BEFORE_CRITICAL = 30;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampScore(value: number): number {
  return clamp(value, 0, 1);
}

export function daysSince(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return 0;
  }
  return Math.max(0, (nowMs - ts) / (1000 * 60 * 60 * 24));
}

let _handoffSeq = 0;

export function nextHandoffId(): string {
  _handoffSeq++;
  return `handoff_${String(_handoffSeq).padStart(6, '0')}`;
}
