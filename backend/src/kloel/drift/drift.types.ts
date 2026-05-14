import type { SpineEventRef } from '../mind/mind.types';

export interface MetricBundle {
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
}

export interface MetricDeviation {
  readonly metricName: keyof MetricBundle;
  readonly currentValue: number;
  readonly historicalMean: number;
  readonly historicalStdDev: number;
  readonly deviationSigma: number;
  readonly direction: 'up' | 'down';
  readonly isDrift: boolean;
}

export interface DriftReport {
  readonly driftId: string;
  readonly workspaceId: string;
  readonly snapshotId: string;
  readonly comparedSnapshotIds: readonly string[];
  readonly deviations: readonly MetricDeviation[];
  readonly significantCount: number;
  readonly overallDriftMagnitude: number;
  readonly computedAt: string;
}

export interface AttributedCause {
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

export interface DriftExplanation {
  readonly driftId: string;
  readonly workspaceId: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly computedAt: string;
}

export interface DriftStoryBeat {
  readonly metric: string;
  readonly beforeValue: number | string;
  readonly afterValue: number | string;
  readonly changeDirection: 'improved' | 'worsened' | 'stable';
  readonly explanation: string;
}

export interface DriftNarrative {
  readonly workspaceId: string;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly headline: string;
  readonly story: readonly DriftStoryBeat[];
  readonly computedAt: string;
}

export interface EvidenceBundle {
  readonly driftId: string;
  readonly workspaceId: string;
  readonly before: {
    readonly snapshots: readonly BehaviorSnapshot[];
    readonly summary: string;
  };
  readonly after: {
    readonly snapshot: BehaviorSnapshot;
    readonly summary: string;
  };
  readonly attributingEvents: readonly SpineEventRef[];
  readonly computedAt: string;
}

export interface WeekBucket {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly events: readonly SpineEventRef[];
}
