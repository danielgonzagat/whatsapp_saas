import { Injectable } from '@nestjs/common';
import type {
  ConflictDetection,
  Disclosure,
  PlatformBias,
  RecommendationAttribution,
  RecommendationExplanation,
  SilenceUnderConflict,
  ThirdPartyAuditExport,
  UserFeedbackCorrection,
} from './types';

/**
 * INCENT-006 — ThirdPartyAuditExport.
 *
 * Constrói bundle de auditoria exportável para terceiros.
 * Agrega todas as evidências de integridade de recomendação:
 * explicações, conflitos, silêncios, vieses, disclosures,
 * feedbacks e atribuições em um único pacote auditável.
 */
@Injectable()
export class ThirdPartyAuditExportService {
  public export(input: AuditExportInput): ThirdPartyAuditExport {
    const allConflicts = input.conflicts ?? [];
    const allSilence = input.silenceEvents ?? [];
    const allBias = input.biasReports ?? [];
    const allDisclosures = input.disclosures ?? [];
    const allFeedback = input.feedbackCorrections ?? [];

    const totalRecommendations = input.recommendations.length;
    const conflictsDetected = allConflicts.filter((c) => c.conflictDetected).length;
    const silenceEvents = allSilence.filter((s) => s.silenced).length;
    const biasAlerts = allBias.filter((b) => b.biasDetected).length;
    const disclosuresIssued = allDisclosures.length;
    const feedbackCorrectionsApplied = allFeedback.filter((f) => f.appliedToModel).length;

    const healthyCount = totalRecommendations - conflictsDetected - silenceEvents - biasAlerts;

    return {
      workspaceId: input.workspaceId,
      auditId: this.generateAuditId(input),
      generatedAt: new Date().toISOString(),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      recommendations: input.recommendations,
      explanations: input.explanations ?? [],
      conflicts: allConflicts,
      silenceEvents: allSilence,
      biasReports: allBias,
      disclosures: allDisclosures,
      feedbackCorrections: allFeedback,
      attributions: input.attributions ?? [],
      summary: {
        totalRecommendations,
        conflictsDetected,
        silenceEvents,
        biasAlerts,
        disclosuresIssued,
        feedbackCorrectionsApplied,
        healthyRecommendationRate:
          totalRecommendations > 0 ? Number((healthyCount / totalRecommendations).toFixed(4)) : 1,
      },
    };
  }

  public compareAudits(a: ThirdPartyAuditExport, b: ThirdPartyAuditExport): AuditComparison {
    return {
      trend: this.computeTrend(a, b),
      deltaConflicts: b.summary.conflictsDetected - a.summary.conflictsDetected,
      deltaBias: b.summary.biasAlerts - a.summary.biasAlerts,
      deltaSilence: b.summary.silenceEvents - a.summary.silenceEvents,
      deltaHealthy: Number(
        (b.summary.healthyRecommendationRate - a.summary.healthyRecommendationRate).toFixed(4),
      ),
    };
  }

  public integrityScore(audit: ThirdPartyAuditExport): number {
    const { summary: s } = audit;
    if (s.totalRecommendations === 0) {
      return 1;
    }
    const issues =
      (s.conflictsDetected + s.biasAlerts + Math.floor(s.silenceEvents * 0.5)) /
      s.totalRecommendations;
    return Number((1 - Math.min(issues, 1)).toFixed(4));
  }

  private computeTrend(
    a: ThirdPartyAuditExport,
    b: ThirdPartyAuditExport,
  ): 'improving' | 'stable' | 'declining' {
    const delta = b.summary.healthyRecommendationRate - a.summary.healthyRecommendationRate;
    if (delta > 0.02) {
      return 'improving';
    }
    if (delta < -0.02) {
      return 'declining';
    }
    return 'stable';
  }

  private generateAuditId(input: AuditExportInput): string {
    const ts = Date.now().toString(36);
    const ws = input.workspaceId.slice(-4);
    return `audit_${ws}_${ts}`;
  }
}

interface AuditComparison {
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly deltaConflicts: number;
  readonly deltaBias: number;
  readonly deltaSilence: number;
  readonly deltaHealthy: number;
}

export interface AuditExportInput {
  readonly workspaceId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly recommendations: readonly AuditRecommendationEntry[];
  readonly explanations?: readonly RecommendationExplanation[];
  readonly conflicts?: readonly ConflictDetection[];
  readonly silenceEvents?: readonly SilenceUnderConflict[];
  readonly biasReports?: readonly PlatformBias[];
  readonly disclosures?: readonly Disclosure[];
  readonly feedbackCorrections?: readonly UserFeedbackCorrection[];
  readonly attributions?: readonly RecommendationAttribution[];
}

export interface AuditRecommendationEntry {
  readonly recommendationId: string;
  readonly summary: string;
  readonly outcome: string;
  readonly issuedAt: string;
}
