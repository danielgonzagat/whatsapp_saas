/**
 * UTP-DELEG-INDISP — Camada XIII (Delegation Confidence Tracking).
 *
 * IndispensabilityTracker mede sinais de habito formado:
 *   - frequencia de uso semanal
 *   - tempo entre sessoes
 *   - churn risk apos pausa de 7d/30d
 *   - perda perceptivel quando feature offline
 *
 * Emite IndispensabilitySignal com score 0-1 e sinais qualitativos.
 *
 * Pure-logic — sem Prisma, sem dependencias externas.
 */

export interface SessionRecord {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly featuresUsed: readonly string[];
  readonly durationMs: number;
  readonly sessionType: 'active' | 'passive' | 'automated';
}

export interface FeatureUnavailabilityRecord {
  readonly workspaceId: string;
  readonly featureName: string;
  readonly offlineStartedAt: string;
  readonly offlineEndedAt: string;
  readonly wasUserAffected: boolean;
  readonly userReportedBlocking: boolean;
}

export interface UsageMetrics {
  readonly workspaceId: string;
  readonly totalSessions: number;
  readonly weeklyAverage: number;
  readonly dailyFrequency: number;
  readonly avgGapHours: number;
  readonly maxGapHours: number;
  readonly lastActivityAt: string;
  readonly activeDaysCount: number;
  readonly observationWindowDays: number;
}

export type ChurnRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ChurnRiskAssessment {
  readonly workspaceId: string;
  readonly riskLevel: ChurnRiskLevel;
  readonly daysSinceLastActivity: number;
  readonly pauseDetected7d: boolean;
  readonly pauseDetected30d: boolean;
  readonly weeklyFrequencyBeforePause: number;
  readonly estimatedRecoveryProbability: number;
}

export interface PerceptibleLossAssessment {
  readonly workspaceId: string;
  readonly lossDetected: boolean;
  readonly featureName: string;
  readonly offlineDurationHours: number;
  readonly userBlockingReported: boolean;
  readonly usageDropAfterOffline: number;
  readonly dependencyScore: number;
}

export interface IndispensabilitySignal {
  readonly workspaceId: string;
  readonly score: number;
  readonly signals: readonly string[];
  readonly assessedAt: string;
}

export type HabitSignal =
  | 'high_weekly_frequency'
  | 'consistent_daily_use'
  | 'short_inter_session_gap'
  | 'regular_pattern_detected'
  | 'habit_forming'
  | 'habit_formed'
  | 'churn_risk_7d'
  | 'churn_risk_30d'
  | 'churn_risk_critical'
  | 'loss_perceptible'
  | 'high_dependency'
  | 'recovery_likely'
  | 'inactive'
  | 'no_habit_detected'
  | 'insufficient_data';

export interface IndispensabilityInput {
  readonly workspaceId: string;
  readonly sessions: readonly SessionRecord[];
  readonly unavailabilityEvents: readonly FeatureUnavailabilityRecord[];
  readonly nowMs: number;
}
