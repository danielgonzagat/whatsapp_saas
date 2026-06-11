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
