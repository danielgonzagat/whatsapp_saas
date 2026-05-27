/**
 * UTP-CASH-001..008 — Camada XXII (Cognitive Organism — Cash Protection).
 *
 * Caixa preservado como oxigênio. This module tracks cash position across
 * time windows, projects receivables and payables, calculates runway,
 * detects early warning risks, tracks volatility, suggests protective
 * actions, and blocks unsafe financial operations.
 *
 * All services are pure logic — no Prisma, no external dependencies.
 * Monetary amounts are in bigint cents. Derived metrics are number.
 */

export type CashEntryCategory = 'actual' | 'projected_receivable' | 'projected_payable';

export interface CashEntry {
  readonly workspaceId: string;
  readonly amountCents: bigint;
  readonly entryDate: string;
  readonly category: CashEntryCategory;
  readonly confidence: number;
  readonly source: string;
}

export interface CashPosition {
  readonly workspaceId: string;
  readonly currentBalanceCents: bigint;
  readonly trend7d: number;
  readonly trend14d: number;
  readonly trend30d: number;
  readonly minBalance7d: bigint;
  readonly maxBalance7d: bigint;
  readonly projectedBalance30d: bigint;
  readonly calculatedAt: string;
}

export interface ReceivablesProjection {
  readonly workspaceId: string;
  readonly totalExpectedCents: bigint;
  readonly dueNext7d: bigint;
  readonly dueNext14d: bigint;
  readonly dueNext30d: bigint;
  readonly confidence: number;
  readonly projectedAt: string;
}

export interface PayablesProjection {
  readonly workspaceId: string;
  readonly totalExpectedCents: bigint;
  readonly dueNext7d: bigint;
  readonly dueNext14d: bigint;
  readonly dueNext30d: bigint;
  readonly confidence: number;
  readonly projectedAt: string;
}

export interface RunwayCalculation {
  readonly workspaceId: string;
  readonly runwayDays: number;
  readonly burnRateDailyCents: number;
  readonly marginOfSafety: number;
  readonly runwayDate: string;
  readonly calculatedAt: string;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskDetection {
  readonly workspaceId: string;
  readonly riskDetected: boolean;
  readonly riskLevel: RiskLevel;
  readonly triggers: readonly string[];
  readonly detectedAt: string;
}

export interface RiskInput {
  readonly position: CashPosition;
  readonly runway: RunwayCalculation;
  readonly volatility: VolatilityTracking;
  readonly receivables: ReceivablesProjection;
  readonly payables: PayablesProjection;
}

export interface VolatilityTracking {
  readonly workspaceId: string;
  readonly dailyVolatility: number;
  readonly weeklyVolatility: number;
  readonly monthlyVolatility: number;
  readonly trend: 'increasing' | 'decreasing' | 'stable';
  readonly trackedAt: string;
}

export type ProtectiveActionKind =
  | 'freeze_spending'
  | 'reduce_burn'
  | 'accelerate_collections'
  | 'renegotiate_payables'
  | 'emergency_fund';

type ActionUrgency = 'now' | 'soon' | 'planned';

export interface ProtectiveAction {
  readonly actionId: string;
  readonly workspaceId: string;
  readonly kind: ProtectiveActionKind;
  readonly description: string;
  readonly urgency: ActionUrgency;
  readonly impact: number;
}

type BlockerKind =
  | 'insufficient_balance'
  | 'runway_critical'
  | 'risk_critical'
  | 'volatility_extreme';

export interface UnsafeOperationBlock {
  readonly workspaceId: string;
  readonly blocked: boolean;
  readonly reason: string;
  readonly operationType: string;
  readonly amountCents: bigint;
  readonly blockerKind: BlockerKind;
}
export function entriesByCategory(
  entries: readonly CashEntry[],
  category: CashEntryCategory,
): readonly CashEntry[] {
  return entries.filter((e) => e.category === category);
}

export function entriesForWorkspace(
  entries: readonly CashEntry[],
  workspaceId: string,
): readonly CashEntry[] {
  return entries.filter((e) => e.workspaceId === workspaceId);
}

export function entriesInWindow(
  entries: readonly CashEntry[],
  windowDays: number,
  nowMs: number,
): readonly CashEntry[] {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000;
  return entries.filter((e) => {
    const ts = Date.parse(e.entryDate);
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

export function sumAmounts(entries: readonly CashEntry[]): bigint {
  return entries.reduce((sum, e) => sum + e.amountCents, 0n);
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) {return 0;}
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}
