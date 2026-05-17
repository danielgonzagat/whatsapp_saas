
export type ToneClass =
  | 'assertivo'
  | 'consultivo'
  | 'empatico'
  | 'analitico'
  | 'urgente'
  | 'neutro';

export interface DecisionPattern {
  readonly pattern: string;
  readonly count: number;
  readonly weight: number;
}

export interface WeeklyBehaviorSnapshot {
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly messagesSent: number;
  readonly decisionsRanked: readonly string[];
  readonly conversionsAttributed: number;
  readonly narrativeStyleHash: string;
  readonly toneClassification: Record<ToneClass, number>;
  readonly decisionPatterns: readonly DecisionPattern[];
  readonly computedAt: string;
}

export interface DriftDimension {
  readonly dimension: string;
  readonly before: number | string;
  readonly after: number | string;
  readonly score: number;
  readonly drifted: boolean;
}

export interface DriftResult {
  readonly snapshotId: string;
  readonly comparedSnapshotId: string;
  readonly workspaceId: string;
  readonly driftedDimensions: readonly string[];
  readonly magnitude: number;
  readonly narrative: string;
  readonly details: readonly DriftDimension[];
  readonly computedAt: string;
}

interface MetricBundle {
  readonly conversionRate: number;
  readonly avgResponseMinutes: number;
  readonly avgConversionHours: number;
  readonly objectionMix: Record<string, number>;
  readonly paymentSuccessRate: number;
  readonly churnRate: number;
}

export interface BehaviorSnapshot {
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly metrics: MetricBundle;
  readonly eventCount: number;
  readonly leadCount: number;
  readonly conversionCount: number;
  readonly computedAt: string;
}export interface AttributedCause {
  readonly eventRef: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly confidence: number;
  readonly reasoning: string;
}

export interface AttributedDrift {
  readonly driftId: string;
  readonly workspaceId: string;
  readonly attribution: readonly AttributedCause[];
  readonly primaryCause: AttributedCause | undefined;
  readonly computedAt: string;
}