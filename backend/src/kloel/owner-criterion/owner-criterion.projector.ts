/**
 * UTP-OWNER-CRIT-007 — Owner Criterion Projector.
 *
 * Aggregates all six observer outputs into a single OwnerCriterionProjection
 * suitable for inclusion in the ABI (via workspaceLocalProfile or as a
 * standalone extension). The projector normalizes multi-observation data
 * into coherent profiles with confidence-weighted aggregation.
 *
 * Injectable service — stateful (accumulates observations across windows).
 */
import { Injectable } from '@nestjs/common';
import type { ApprovalThresholdObservation, CorrectionObservation, DecisionObservation, EthicalLineObservation, OwnerApprovalProfile, OwnerCorrectionPattern, OwnerCriterionProjection, OwnerDecisionPattern, OwnerEthicalProfile, OwnerRiskProfile, OwnerToneProfile, RiskToleranceObservation, ToneObservation } from './owner-criterion.types';
interface WorkspaceAccumulator {
  readonly workspaceId: string;
  decisions: DecisionObservation[];
  corrections: CorrectionObservation[];
  tones: ToneObservation[];
  riskTolerances: RiskToleranceObservation[];
  ethicalLines: EthicalLineObservation[];
  approvalThresholds: ApprovalThresholdObservation[];
  windows: number;
}
@Injectable()
export class OwnerCriterionProjector {
  // Logger intentionally omitted — projector is pure; consumers log surface.
  private readonly accumulators = new Map<string, WorkspaceAccumulator>();
  public accumulateDecisions(observations: readonly DecisionObservation[]): void {
    for (const obs of observations) {
      this.ensureAccumulator(obs.workspaceId).decisions.push(obs);
    }
  }
  public accumulateCorrections(observations: readonly CorrectionObservation[]): void {
    for (const obs of observations) {
      this.ensureAccumulator(obs.workspaceId).corrections.push(obs);
    }
  }
  public accumulateTones(observations: readonly ToneObservation[]): void {
    for (const obs of observations) {
      this.ensureAccumulator(obs.workspaceId).tones.push(obs);
    }
  }
  public accumulateRiskTolerances(observations: readonly RiskToleranceObservation[]): void {
    for (const obs of observations) {
      this.ensureAccumulator(obs.workspaceId).riskTolerances.push(obs);
    }
  }
  public accumulateEthicalLines(observations: readonly EthicalLineObservation[]): void {
    for (const obs of observations) {
      this.ensureAccumulator(obs.workspaceId).ethicalLines.push(obs);
    }
  }
  public accumulateApprovalThresholds(
    observations: readonly ApprovalThresholdObservation[],
  ): void {
    for (const obs of observations) {
      this.ensureAccumulator(obs.workspaceId).approvalThresholds.push(obs);
    }
  }
  public incrementWindow(): void {
    for (const acc of this.accumulators.values()) {
      acc.windows++;
    }
  }
  public project(workspaceId: string, nowMs: number): OwnerCriterionProjection {
    const acc = this.accumulators.get(workspaceId);
    if (!acc) {
      return this.emptyProjection(workspaceId, nowMs);
    }
    const decisionPattern = this.projectDecisionPattern(acc);
    const correctionPattern = this.projectCorrectionPattern(acc);
    const toneProfile = this.projectToneProfile(acc);
    const riskProfile = this.projectRiskProfile(acc);
    const ethicalProfile = this.projectEthicalProfile(acc);
    const approvalProfile = this.projectApprovalProfile(acc);
    const totalObservations =
      acc.decisions.length +
      acc.corrections.length +
      acc.tones.length +
      acc.riskTolerances.length +
      acc.ethicalLines.length +
      acc.approvalThresholds.length;
    return {
      workspaceId,
      decisionPattern,
      correctionPattern,
      toneProfile,
      riskProfile,
      ethicalProfile,
      approvalProfile,
      lastUpdated: new Date(nowMs).toISOString(),
      totalObservations,
      observationWindows: acc.windows,
    };
  }
  public workspaceIds(): readonly string[] {
    return [...this.accumulators.keys()];
  }
  public clear(): void {
    this.accumulators.clear();
  }
  private ensureAccumulator(workspaceId: string): WorkspaceAccumulator {
    let acc = this.accumulators.get(workspaceId);
    if (!acc) {
      acc = {
        workspaceId,
        decisions: [],
        corrections: [],
        tones: [],
        riskTolerances: [],
        ethicalLines: [],
        approvalThresholds: [],
        windows: 1,
      };
      this.accumulators.set(workspaceId, acc);
    }
    return acc;
  }
  private projectDecisionPattern(
    acc: WorkspaceAccumulator,
  ): OwnerDecisionPattern {
    const all = acc.decisions;
    if (all.length === 0) {
      return {
        mostFrequentDecisionKind: 'override',
        overrideRate: 0,
        escalationRate: 0,
        autonomyGrantRate: 0,
        topTargetDomains: [],
        confidence: 0,
      };
    }
    const overrideCount = all.filter((d) => d.decisionKind === 'override').length;
    const escalationCount = all.filter((d) => d.decisionKind === 'escalation').length;
    const autonomyCount = all.filter((d) => d.decisionKind === 'autonomy_grant').length;
    const kindCounts = new Map<string, number>();
    const domainCounts = new Map<string, number>();
    for (const d of all) {
      kindCounts.set(d.decisionKind, (kindCounts.get(d.decisionKind) ?? 0) + 1);
      domainCounts.set(d.targetDomain, (domainCounts.get(d.targetDomain) ?? 0) + 1);
    }
    const mostFrequent = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as
      | 'override'
      | 'escalation'
      | 'rejection'
      | 'autonomy_grant'
      | 'autonomy_revoke'
      | undefined;
    const topDomains = [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([domain]) => domain);
    const total = all.length;
    const avgConfidence =
      all.reduce((sum, d) => sum + d.confidence, 0) / total;
    return {
      mostFrequentDecisionKind: mostFrequent ?? 'override',
      overrideRate: Math.round((overrideCount / total) * 100) / 100,
      escalationRate: Math.round((escalationCount / total) * 100) / 100,
      autonomyGrantRate: Math.round((autonomyCount / total) * 100) / 100,
      topTargetDomains: topDomains,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }
  private projectCorrectionPattern(
    acc: WorkspaceAccumulator,
  ): OwnerCorrectionPattern {
    const all = acc.corrections;
    if (all.length === 0) {
      return {
        mostFrequentCorrectionKind: 'message_rewrite',
        correctionRate: 0,
        messageRewriteRate: 0,
        classificationFixRate: 0,
        actionReversalRate: 0,
        topCorrectedTargets: [],
        confidence: 0,
      };
    }
    const rewriteCount = all.filter(
      (c) => c.correctionKind === 'message_rewrite',
    ).length;
    const classificationCount = all.filter(
      (c) => c.correctionKind === 'classification_fix',
    ).length;
    const reversalCount = all.filter(
      (c) => c.correctionKind === 'action_reversal',
    ).length;
    const kindCounts = new Map<string, number>();
    const targetCounts = new Map<string, number>();
    for (const c of all) {
      kindCounts.set(c.correctionKind, (kindCounts.get(c.correctionKind) ?? 0) + 1);
      targetCounts.set(
        c.correctedTarget,
        (targetCounts.get(c.correctedTarget) ?? 0) + 1,
      );
    }
    const mostFrequent = [...kindCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as 'message_rewrite' | 'classification_fix' | 'action_reversal' | 'policy_adjustment' | undefined;
    const topTargets = [...targetCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([target]) => target);
    const total = all.length;
    const avgConfidence =
      all.reduce((sum, c) => sum + c.confidence, 0) / total;
    return {
      mostFrequentCorrectionKind: mostFrequent ?? 'message_rewrite',
      correctionRate: Math.round((total / Math.max(1, acc.windows)) * 100) / 100,
      messageRewriteRate: Math.round((rewriteCount / total) * 100) / 100,
      classificationFixRate: Math.round((classificationCount / total) * 100) / 100,
      actionReversalRate: Math.round((reversalCount / total) * 100) / 100,
      topCorrectedTargets: topTargets,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }
  private projectToneProfile(acc: WorkspaceAccumulator): OwnerToneProfile {
    const all = acc.tones;
    if (all.length === 0) {
      return {
        directness: 0.5,
        formality: 0.5,
        vocabularyComplexity: 0.5,
        stabilityScore: 0,
        confidence: 0,
      };
    }
    const directness =
      all.reduce((sum, t) => sum + t.directness, 0) / all.length;
    const formality =
      all.reduce((sum, t) => sum + t.formality, 0) / all.length;
    const vocabComplexity =
      all.reduce((sum, t) => sum + t.vocabularyComplexity, 0) / all.length;
    const directnessVariance =
      all.reduce((sum, t) => sum + (t.directness - directness) ** 2, 0) /
      all.length;
    const stabilityScore = Math.max(0, 1 - directnessVariance * 2);
    const avgConfidence =
      all.reduce((sum, t) => sum + t.confidence, 0) / all.length;
    return {
      directness: Math.round(directness * 100) / 100,
      formality: Math.round(formality * 100) / 100,
      vocabularyComplexity: Math.round(vocabComplexity * 100) / 100,
      stabilityScore: Math.round(stabilityScore * 100) / 100,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }
  private projectRiskProfile(acc: WorkspaceAccumulator): OwnerRiskProfile {
    const all = acc.riskTolerances;
    if (all.length === 0) {
      return {
        riskAppetite: 'moderate',
        stabilityScore: 0,
        confidence: 0,
      };
    }
    const appetiteCounts = new Map<string, number>();
    for (const r of all) {
      appetiteCounts.set(r.riskAppetite, (appetiteCounts.get(r.riskAppetite) ?? 0) + 1);
    }
    const mostFrequent = [...appetiteCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as 'conservative' | 'moderate' | 'aggressive' | undefined;
    const topCount = appetiteCounts.get(mostFrequent ?? 'moderate') ?? 0;
    const stabilityScore = topCount / all.length;
    const avgConfidence =
      all.reduce((sum, r) => sum + r.confidence, 0) / all.length;
    return {
      riskAppetite: mostFrequent ?? 'moderate',
      stabilityScore: Math.round(stabilityScore * 100) / 100,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }
  private projectEthicalProfile(
    acc: WorkspaceAccumulator,
  ): OwnerEthicalProfile {
    const all = acc.ethicalLines;
    if (all.length === 0) {
      return { boundaries: [], confidence: 0 };
    }
    const boundaryMap = new Map<
      string,
      { readonly boundaryType: string; readonly description: string; confidence: number; count: number }
    >();
    for (const e of all) {
      const existing = boundaryMap.get(e.boundaryType);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, e.confidence);
        existing.count++;
      } else {
        boundaryMap.set(e.boundaryType, {
          boundaryType: e.boundaryType,
          description: e.boundaryDescription,
          confidence: e.confidence,
          count: 1,
        });
      }
    }
    const boundaries = [...boundaryMap.values()].map((b) => ({
      boundaryType: b.boundaryType as 'compliance_hard' | 'compliance_soft' | 'reputation' | 'customer_protection' | 'data_privacy',
      description: b.description,
      confidence: Math.round(b.confidence * 100) / 100,
    }));
    const avgConfidence =
      boundaries.reduce((sum, b) => sum + b.confidence, 0) /
      Math.max(1, boundaries.length);
    return {
      boundaries,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }
  private projectApprovalProfile(
    acc: WorkspaceAccumulator,
  ): OwnerApprovalProfile {
    const all = acc.approvalThresholds;
    if (all.length === 0) {
      return { thresholds: [], overallAutoApprovalRate: 0, confidence: 0 };
    }
    const domainMap = new Map<string, { domain: string; level: string; confidence: number }>();
    for (const a of all) {
      domainMap.set(a.thresholdDomain, {
        domain: a.thresholdDomain,
        level: a.thresholdLevel,
        confidence: a.confidence,
      });
    }
    const thresholds = [...domainMap.values()].map((d) => ({
      domain: d.domain as 'autopilot_auto_reply' | 'lead_qualification' | 'deal_advancement' | 'payment_processing' | 'campaign_launch',
      level: d.level as 'low' | 'medium' | 'high' | 'manual_only',
      confidence: Math.round(d.confidence * 100) / 100,
    }));
    const overallAutoRate =
      all.reduce((sum, a) => sum + a.autoApprovalRate, 0) /
      Math.max(1, all.length);
    const avgConfidence =
      thresholds.reduce((sum, t) => sum + t.confidence, 0) /
      Math.max(1, thresholds.length);
    return {
      thresholds,
      overallAutoApprovalRate: Math.round(overallAutoRate * 100) / 100,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }
  private emptyProjection(
    workspaceId: string,
    nowMs: number,
  ): OwnerCriterionProjection {
    return {
      workspaceId,
      decisionPattern: {
        mostFrequentDecisionKind: 'override',
        overrideRate: 0,
        escalationRate: 0,
        autonomyGrantRate: 0,
        topTargetDomains: [],
        confidence: 0,
      },
      correctionPattern: {
        mostFrequentCorrectionKind: 'message_rewrite',
        correctionRate: 0,
        messageRewriteRate: 0,
        classificationFixRate: 0,
        actionReversalRate: 0,
        topCorrectedTargets: [],
        confidence: 0,
      },
      toneProfile: {
        directness: 0.5,
        formality: 0.5,
        vocabularyComplexity: 0.5,
        stabilityScore: 0,
        confidence: 0,
      },
      riskProfile: {
        riskAppetite: 'moderate',
        stabilityScore: 0,
        confidence: 0,
      },
      ethicalProfile: { boundaries: [], confidence: 0 },
      approvalProfile: {
        thresholds: [],
        overallAutoApprovalRate: 0,
        confidence: 0,
      },
      lastUpdated: new Date(nowMs).toISOString(),
      totalObservations: 0,
      observationWindows: 0,
    };
  }
}
