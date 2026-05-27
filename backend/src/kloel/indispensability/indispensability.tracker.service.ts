import { Injectable } from '@nestjs/common';
import type {
  SessionRecord,
  FeatureUnavailabilityRecord,
  UsageMetrics,
  ChurnRiskAssessment,
  PerceptibleLossAssessment,
  IndispensabilitySignal,
  IndispensabilityInput,
  HabitSignal,
} from './indispensability.types';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * IndispensabilityTracker — Camada XIII (Delegation Confidence Tracking).
 *
 * Mede sinais de habito formado por workspace:
 *   - Frequencia de uso semanal
 *   - Tempo medio entre sessoes
 *   - Risco de churn apos pausa de 7d / 30d
 *   - Perda perceptivel quando feature offline
 *
 * Emite IndispensabilitySignal com score 0-1 e sinais qualitativos.
 * Pure-logic — sem Prisma, sem dependencias externas.
 */
@Injectable()
export class IndispensabilityTrackerService {
  public computeUsageMetrics(
    workspaceId: string,
    sessions: readonly SessionRecord[],
    nowMs: number,
  ): UsageMetrics {
    void nowMs;
    const sorted = [...sessions].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    const totalSessions = sorted.length;
    if (totalSessions === 0) {
      return {
        workspaceId,
        totalSessions: 0,
        weeklyAverage: 0,
        dailyFrequency: 0,
        avgGapHours: 0,
        maxGapHours: 0,
        lastActivityAt: new Date(0).toISOString(),
        activeDaysCount: 0,
        observationWindowDays: 0,
      };
    }

    const firstSession = sorted[0];
    const lastSession = sorted[totalSessions - 1];
    if (firstSession === undefined || lastSession === undefined) {
      return {
        workspaceId,
        totalSessions: 0,
        weeklyAverage: 0,
        dailyFrequency: 0,
        avgGapHours: 0,
        maxGapHours: 0,
        lastActivityAt: new Date(0).toISOString(),
        activeDaysCount: 0,
        observationWindowDays: 0,
      };
    }
    const firstMs = new Date(firstSession.startedAt).getTime();
    const lastMs = new Date(lastSession.endedAt).getTime();
    const windowMs = Math.max(lastMs - firstMs, MS_PER_HOUR);
    const windowDays = Math.max(windowMs / MS_PER_DAY, 7);

    const weeklyAverage = (totalSessions / windowDays) * 7;
    const dailyFrequency = totalSessions / windowDays;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev === undefined || curr === undefined) {continue;}
      const prevEnd = new Date(prev.endedAt).getTime();
      const currStart = new Date(curr.startedAt).getTime();
      gaps.push(Math.max(currStart - prevEnd, 0) / MS_PER_HOUR);
    }
    const avgGapHours = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const maxGapHours = gaps.length > 0 ? Math.max(...gaps) : 0;

    const activeDays = new Set<string>();
    for (const s of sorted) {
      const d = new Date(s.startedAt).toISOString().slice(0, 10);
      activeDays.add(d);
    }

    return {
      workspaceId,
      totalSessions,
      weeklyAverage: Math.round(weeklyAverage * 100) / 100,
      dailyFrequency: Math.round(dailyFrequency * 100) / 100,
      avgGapHours: Math.round(avgGapHours * 100) / 100,
      maxGapHours: Math.round(maxGapHours * 100) / 100,
      lastActivityAt: lastSession.endedAt,
      activeDaysCount: activeDays.size,
      observationWindowDays: Math.round(windowDays * 100) / 100,
    };
  }

  public assessChurnRisk(
    workspaceId: string,
    sessions: readonly SessionRecord[],
    nowMs: number,
  ): ChurnRiskAssessment {
    if (sessions.length === 0) {
      return {
        workspaceId,
        riskLevel: 'none',
        daysSinceLastActivity: -1,
        pauseDetected7d: false,
        pauseDetected30d: false,
        weeklyFrequencyBeforePause: 0,
        estimatedRecoveryProbability: 0,
      };
    }

    const sorted = [...sessions].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    const lastSorted = sorted[sorted.length - 1];
    const lastActivityMs =
      lastSorted === undefined ? nowMs : new Date(lastSorted.endedAt).getTime();
    const daysSinceLastActivity = Math.floor((nowMs - lastActivityMs) / MS_PER_DAY);

    const pauseDetected7d = daysSinceLastActivity >= 7;
    const pauseDetected30d = daysSinceLastActivity >= 30;

    let riskLevel: ChurnRiskAssessment['riskLevel'] = 'none';
    if (daysSinceLastActivity >= 60) {riskLevel = 'critical';}
    else if (daysSinceLastActivity >= 30) {riskLevel = 'high';}
    else if (daysSinceLastActivity >= 14) {riskLevel = 'medium';}
    else if (daysSinceLastActivity >= 7) {riskLevel = 'low';}

    const metrics = this.computeUsageMetrics(workspaceId, sessions, nowMs);
    const weeklyBeforePause = metrics.weeklyAverage;

    let recoveryProbability = 0;
    if (pauseDetected30d) {
      recoveryProbability = Math.min(weeklyBeforePause / 14, 0.3);
    } else if (pauseDetected7d) {
      recoveryProbability = Math.min(weeklyBeforePause / 10, 0.7);
    } else {
      recoveryProbability = 0.9;
    }

    return {
      workspaceId,
      riskLevel,
      daysSinceLastActivity,
      pauseDetected7d,
      pauseDetected30d,
      weeklyFrequencyBeforePause: Math.round(weeklyBeforePause * 100) / 100,
      estimatedRecoveryProbability: Math.round(recoveryProbability * 100) / 100,
    };
  }

  public assessPerceptibleLoss(
    workspaceId: string,
    unavailabilityEvents: readonly FeatureUnavailabilityRecord[],
    sessions: readonly SessionRecord[],
    nowMs: number,
  ): PerceptibleLossAssessment {
    void nowMs;
    if (unavailabilityEvents.length === 0) {
      return {
        workspaceId,
        lossDetected: false,
        featureName: '',
        offlineDurationHours: 0,
        userBlockingReported: false,
        usageDropAfterOffline: 0,
        dependencyScore: 0,
      };
    }

    const lastUnavailability = unavailabilityEvents[unavailabilityEvents.length - 1];
    if (lastUnavailability === undefined) {
      return {
        workspaceId,
        lossDetected: false,
        featureName: '',
        offlineDurationHours: 0,
        userBlockingReported: false,
        usageDropAfterOffline: 0,
        dependencyScore: 0,
      };
    }

    const blockingEvents = unavailabilityEvents.filter((e) => e.wasUserAffected);
    const reportedBlocking = unavailabilityEvents.filter((e) => e.userReportedBlocking);

    const totalOfflineHours = unavailabilityEvents.reduce((sum, e) => {
      const start = new Date(e.offlineStartedAt).getTime();
      const end = new Date(e.offlineEndedAt).getTime();
      return sum + Math.max(end - start, 0) / MS_PER_HOUR;
    }, 0);

    let usageDropAfterOffline = 0;
    if (unavailabilityEvents.length > 0 && sessions.length >= 2) {
      const lastOfflineStart = new Date(lastUnavailability.offlineStartedAt).getTime();
      const before = sessions.filter(
        (s) => new Date(s.startedAt).getTime() < lastOfflineStart,
      );
      const after = sessions.filter(
        (s) => new Date(s.startedAt).getTime() >= lastOfflineStart,
      );

      if (before.length > 0) {
        const beforeRate = before.length / Math.max(before.length, 1);
        const afterRate = after.length / Math.max(before.length, 1);
        usageDropAfterOffline = Math.max(0, beforeRate - afterRate);
      }
    }

    const dependencyScore = this.computeDependencyScore(
      blockingEvents.length,
      reportedBlocking.length,
      totalOfflineHours,
      usageDropAfterOffline,
    );

    const lossDetected = blockingEvents.length > 0 || reportedBlocking.length > 0;

    return {
      workspaceId,
      lossDetected,
      featureName: lastUnavailability.featureName,
      offlineDurationHours: Math.round(totalOfflineHours * 100) / 100,
      userBlockingReported: reportedBlocking.length > 0,
      usageDropAfterOffline: Math.round(usageDropAfterOffline * 100) / 100,
      dependencyScore: Math.round(dependencyScore * 100) / 100,
    };
  }

  public assess(input: IndispensabilityInput): IndispensabilitySignal {
    const { workspaceId, sessions, unavailabilityEvents, nowMs } = input;

    const metrics = this.computeUsageMetrics(workspaceId, sessions, nowMs);
    const churnRisk = this.assessChurnRisk(workspaceId, sessions, nowMs);
    const lossAssessment = this.assessPerceptibleLoss(
      workspaceId,
      unavailabilityEvents,
      sessions,
      nowMs,
    );

    const signals: HabitSignal[] = [];
    let score = 0;

    if (sessions.length === 0) {
      signals.push('inactive');
      signals.push('insufficient_data');
      return {
        workspaceId,
        score: 0,
        signals: ['inactive', 'insufficient_data'],
        assessedAt: new Date().toISOString(),
      };
    }

    if (sessions.length < 2) {
      signals.push('insufficient_data');
    }

    if (metrics.weeklyAverage >= 5) {
      signals.push('high_weekly_frequency');
      score += 0.3;
    } else if (metrics.weeklyAverage >= 3) {
      score += 0.2;
    } else if (metrics.weeklyAverage >= 1) {
      score += 0.1;
    }

    if (metrics.dailyFrequency >= 1) {
      signals.push('consistent_daily_use');
      score += 0.2;
    } else if (metrics.dailyFrequency >= 0.3) {
      score += 0.1;
    }

    if (metrics.avgGapHours > 0 && metrics.avgGapHours <= 12) {
      signals.push('short_inter_session_gap');
      score += 0.2;
    } else if (metrics.avgGapHours > 0 && metrics.avgGapHours <= 24) {
      score += 0.1;
    }

    const activeDayRatio =
      metrics.observationWindowDays > 0
        ? metrics.activeDaysCount / metrics.observationWindowDays
        : 0;
    if (activeDayRatio >= 0.7) {
      signals.push('regular_pattern_detected');
      score += 0.2;
    } else if (activeDayRatio >= 0.4) {
      score += 0.1;
    }

    if (lossAssessment.lossDetected) {
      signals.push('loss_perceptible');
      score += lossAssessment.dependencyScore * 0.3;
      if (lossAssessment.dependencyScore >= 0.6) {
        signals.push('high_dependency');
      }
    }

    if (churnRisk.pauseDetected30d) {
      signals.push('churn_risk_30d');
      score -= 0.4;
    } else if (churnRisk.pauseDetected7d) {
      signals.push('churn_risk_7d');
      score -= 0.2;
    }

    if (churnRisk.riskLevel === 'critical') {
      signals.push('churn_risk_critical');
    }

    if (churnRisk.pauseDetected7d && churnRisk.estimatedRecoveryProbability >= 0.3) {
      signals.push('recovery_likely');
    }

    const clampedScore = Math.max(0, Math.min(1, Math.round(score * 100) / 100));

    if (clampedScore >= 0.8) {
      signals.push('habit_formed');
    } else if (clampedScore >= 0.5) {
      signals.push('habit_forming');
    } else if (sessions.length < 2) {
      /* insufficient_data already pushed, skip no_habit_detected */
    } else if (clampedScore < 0.3) {
      signals.push('no_habit_detected');
    }

    return {
      workspaceId,
      score: clampedScore,
      signals,
      assessedAt: new Date().toISOString(),
    };
  }

  public assessBatch(
    inputs: readonly IndispensabilityInput[],
  ): readonly IndispensabilitySignal[] {
    return inputs.map((inp) => this.assess(inp));
  }

  private computeDependencyScore(
    blockingCount: number,
    reportedCount: number,
    totalOfflineHours: number,
    usageDrop: number,
  ): number {
    const blockingWeight = Math.min(blockingCount * 0.2, 0.5);
    const reportedWeight = reportedCount > 0 ? 0.3 : 0;
    const durationWeight = Math.min(totalOfflineHours / 48, 0.2);
    const usageDropWeight = Math.min(usageDrop * 0.5, 0.3);
    return Math.min(blockingWeight + reportedWeight + durationWeight + usageDropWeight, 1);
  }
}
