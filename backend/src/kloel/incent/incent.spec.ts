import type {
  ConflictDetection,
  Disclosure,
  PlatformBias,
  RecommendationAttribution,
  RecommendationExplanation,
  SilenceUnderConflict,
  UserFeedbackCorrection,
} from './types';

import { clamp, biasLevelFromDelta, weightedAverage, makeIncidentId } from './types';

import { RecommendationExplainerService } from './recommendation-explainer.service';
import type { ExplainInput } from './recommendation-explainer.service';

import { ConflictDetectorService } from './conflict-detector.service';
import type { ConflictInput } from './conflict-detector.service';

import { ConflictSilenceEnforcerService } from './conflict-silence-enforcer.service';
import type { SilenceInput } from './conflict-silence-enforcer.service';

import { PlatformBiasMonitorService } from './platform-bias-monitor.service';
import type { BiasAuditInput } from './platform-bias-monitor.service';

import { DisclosureEngineService } from './disclosure-engine.service';
import type { DisclosureInput } from './disclosure-engine.service';

import { ThirdPartyAuditExportService } from './third-party-audit-export.service';
import type { AuditExportInput, AuditRecommendationEntry } from './third-party-audit-export.service';

import { UserFeedbackCorrectionService } from './user-feedback-correction.service';
import type { FeedbackInput } from './user-feedback-correction.service';

import { RecommendationAttributionBuilderService } from './recommendation-attribution-builder.service';
import type { AttributionInput, AttributionSourceEntry } from './recommendation-attribution-builder.service';

const WKS = 'wks_incent_test';

function makeExplainInput(over?: Partial<ExplainInput>): ExplainInput {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    summary: over?.summary ?? 'Recomendação de teste',
    reason: over?.reason ?? 'Esta recomendação é baseada no seu perfil de uso.',
    evidence: over?.evidence ?? ['signal_a', 'signal_b'],
    ...over,
  };
}

function makeConflictInput(over?: Partial<ConflictInput>): ConflictInput {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    involvedParties: over?.involvedParties ?? ['kloel', 'partner_x'],
    ...over,
  };
}

function makeConflict(over?: Partial<ConflictDetection>): ConflictDetection {
  return {
    id: over?.id ?? 'cfl_test_001',
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    conflictDetected: over?.conflictDetected ?? true,
    kind: over?.kind ?? 'commission_bias',
    severity: over?.severity ?? 'actual',
    affectedParties: over?.affectedParties ?? ['partner_x'],
    evidence: over?.evidence ?? ['commission_on_recommendation_0.15'],
    detectedAt: over?.detectedAt ?? new Date().toISOString(),
  };
}

function makeSilenceInput(over?: Partial<SilenceInput>): SilenceInput {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    ...over,
  };
}

function makeBiasInput(over?: Partial<BiasAuditInput>): BiasAuditInput {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    ...over,
  };
}

function makeDisclosureInput(over?: Partial<DisclosureInput>): DisclosureInput {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    relationshipType: over?.relationshipType ?? 'commission',
    ...over,
  };
}

function makeRecEntry(over?: Partial<AuditRecommendationEntry>): AuditRecommendationEntry {
  return {
    recommendationId: over?.recommendationId ?? 'rec_001',
    summary: over?.summary ?? 'Test recommendation',
    outcome: over?.outcome ?? 'accepted',
    issuedAt: over?.issuedAt ?? new Date().toISOString(),
  };
}

function makeFeedbackInput(over?: Partial<FeedbackInput>): FeedbackInput {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    kind: over?.kind ?? 'corrected',
    originalRecommendation: over?.originalRecommendation ?? 'Buy product A',
    ...over,
  };
}

function makeAttrInput(over?: Partial<AttributionInput>): AttributionInput {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    recommendationId: over?.recommendationId ?? 'rec_001',
    ...over,
  };
}

function makeSource(kind: string, weight: number): AttributionSourceEntry {
  return {
    kind: kind as AttributionSourceEntry['kind'],
    evidenceRef: `ev_${kind}`,
    weight,
  };
}

// =========================================================================
// INCENT-001 — RecommendationExplainer
// =========================================================================
describe('INCENT-001 — RecommendationExplainer', () => {
  const svc = new RecommendationExplainerService();

  it('generates explanation with reason and evidence', () => {
    const input = makeExplainInput({
      reason: 'Seu perfil de uso se alinha a este produto.',
      evidence: ['usage_signal_1', 'usage_signal_2'],
    });
    const result = svc.explain(input);
    expect(result.reasonForUser).toContain('Seu perfil');
    expect(result.evidenceReferences).toEqual(['usage_signal_1', 'usage_signal_2']);
    expect(result.id.startsWith('expl_')).toBe(true);
    expect(result.workspaceId).toBe(WKS);
    expect(result.explainedAt).toBeDefined();
  });

  it('adapts tone based on preference', () => {
    const input = makeExplainInput({ preferredTone: 'educational' });
    const result = svc.explain(input);
    expect(result.tone).toBe('educational');
    expect(result.reasonForUser).toContain('Veja por que');
  });

  it('defaults to transparent tone', () => {
    const result = svc.explain(makeExplainInput());
    expect(result.tone).toBe('transparent');
  });

  it('chooses format based on evidence count', () => {
    const short = svc.explain(makeExplainInput({ evidence: [] }));
    expect(short.format).toBe('short');

    const medium = svc.explain(makeExplainInput({ evidence: ['a', 'b'] }));
    expect(medium.format).toBe('medium');

    const long = svc.explain(makeExplainInput({ evidence: ['a', 'b', 'c', 'd'] }));
    expect(long.format).toBe('long');
  });

  it('clamps confidence between 0 and 1', () => {
    const high = svc.explain(makeExplainInput({ confidence: 2.0 }));
    expect(high.confidenceScore).toBe(1);

    const low = svc.explain(makeExplainInput({ confidence: -0.5 }));
    expect(low.confidenceScore).toBe(0);
  });

  it('explains batch correctly', () => {
    const results = svc.explainBatch([
      makeExplainInput({ recommendationId: 'rec_a' }),
      makeExplainInput({ recommendationId: 'rec_b' }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]!.recommendationId).toBe('rec_a');
    expect(results[1]!.recommendationId).toBe('rec_b');
  });
});

// =========================================================================
// INCENT-002 — ConflictDetector
// =========================================================================
describe('INCENT-002 — ConflictDetector', () => {
  const svc = new ConflictDetectorService();

  it('detects commission bias as conflict', () => {
    const result = svc.detect(
      makeConflictInput({ kloelReceivesCommission: true, commissionRate: 0.15 }),
    );
    expect(result.conflictDetected).toBe(true);
    expect(result.kind).toBe('commission_bias');
    expect(result.severity).toBe('actual');
  });

  it('detects structural conflict for ownership', () => {
    const result = svc.detect(
      makeConflictInput({ kloelHasOwnership: true }),
    );
    expect(result.conflictDetected).toBe(true);
    expect(result.severity).toBe('structural');
  });

  it('detects self-dealing', () => {
    const result = svc.detect(
      makeConflictInput({
        recommendationId: 'kloel_pro_feature',
        involvedParties: ['kloel'],
      }),
    );
    expect(result.conflictDetected).toBe(true);
    expect(result.kind).toBe('self_dealing');
    expect(result.severity).toBe('structural');
  });

  it('returns no conflict for clean input', () => {
    const result = svc.detect(
      makeConflictInput({ involvedParties: ['partner_a'] }),
    );
    expect(result.conflictDetected).toBe(false);
    expect(result.severity).toBe('none');
  });

  it('isolates workspaces in batch', () => {
    const results = svc.detectBatch([
      makeConflictInput({
        workspaceId: 'w1',
        recommendationId: 'rec_a',
        kloelReceivesCommission: true,
      }),
      makeConflictInput({
        workspaceId: 'w2',
        recommendationId: 'rec_b',
      }),
    ]);
    expect(results[0]!.workspaceId).toBe('w1');
    expect(results[1]!.workspaceId).toBe('w2');
    expect(results[0]!.conflictDetected).toBe(true);
    expect(results[1]!.conflictDetected).toBe(false);
  });

  it('filters structural conflicts', () => {
    const detections = svc.detectBatch([
      makeConflictInput({ kloelHasOwnership: true }),
      makeConflictInput({ platformPreference: true }),
      makeConflictInput({ kloelReceivesCommission: true }),
    ]);
    const structural = svc.structuralConflicts(detections);
    expect(structural).toHaveLength(1);
  });
});

// =========================================================================
// INCENT-003 — ConflictSilenceEnforcer
// =========================================================================
describe('INCENT-003 — ConflictSilenceEnforcer', () => {
  const svc = new ConflictSilenceEnforcerService();

  it('silences under structural conflict', () => {
    const conflict = makeConflict({ severity: 'structural' });
    const result = svc.enforce(
      makeSilenceInput({ conflict }),
    );
    expect(result.silenced).toBe(true);
    expect(result.reason).toBe('structural_conflict');
    expect(result.enforcement).toBe('automatic');
  });

  it('silences when bias detected and not mitigated', () => {
    const result = svc.enforce(
      makeSilenceInput({ biasDetected: true, biasMitigated: false }),
    );
    expect(result.silenced).toBe(true);
    expect(result.reason).toBe('platform_bias_alert');
  });

  it('does not silence when bias is mitigated', () => {
    const result = svc.enforce(
      makeSilenceInput({ biasDetected: true, biasMitigated: true }),
    );
    expect(result.silenced).toBe(false);
  });

  it('does not silence clean recommendation', () => {
    const result = svc.enforce(makeSilenceInput());
    expect(result.silenced).toBe(false);
  });

  it('sets expiration for silenced recommendations', () => {
    const conflict = makeConflict({ severity: 'structural' });
    const result = svc.enforce(makeSilenceInput({ conflict }));
    expect(result.silenced).toBe(true);
    expect(result.expirationAt).toBeDefined();
  });

  it('activeSilences filters expired entries', () => {
    const past = new Date(Date.now() - 100_000_000).toISOString();
    const active = makeSilenceInput({ conflict: makeConflict({ severity: 'structural' }) });
    const results = svc.enforceBatch([active]);
    const now = Date.now();
    const current = svc.activeSilences(results, now);
    expect(current).toHaveLength(1);
  });
});

// =========================================================================
// INCENT-004 — PlatformBiasMonitor
// =========================================================================
describe('INCENT-004 — PlatformBiasMonitor', () => {
  const svc = new PlatformBiasMonitorService();

  it('detects bias when internal weight exceeds fair weight', () => {
    const result = svc.audit(
      makeBiasInput({
        internalRevenueWeight: 0.6,
        userRelevance: 0.2,
        objectiveQuality: 0.1,
      }),
    );
    expect(result.biasDetected).toBe(true);
    expect(Math.abs(result.weightDelta)).toBeGreaterThan(0.05);
  });

  it('applies mitigation for strong bias', () => {
    const result = svc.audit(
      makeBiasInput({
        internalRevenueWeight: 0.9,
        userRelevance: 0.05,
        objectiveQuality: 0.05,
      }),
    );
    expect(result.biasDetected).toBe(true);
    expect(result.mitigationApplied).toBe(true);
  });

  it('does not detect bias when weights are balanced', () => {
    const result = svc.audit(
      makeBiasInput({
        internalRevenueWeight: 0.2,
        userRelevance: 0.3,
        objectiveQuality: 0.25,
        competitiveLandscape: 0.2,
        userHistory: 0.15,
        thirdPartyRating: 0.1,
      }),
    );
    expect(result.biasDetected).toBe(false);
  });

  it('computes overall bias score across audits', () => {
    const audits = svc.auditBatch([
      makeBiasInput({ internalRevenueWeight: 0.8, userRelevance: 0.1, objectiveQuality: 0.05 }),
      makeBiasInput({ internalRevenueWeight: 0.2, userRelevance: 0.3, objectiveQuality: 0.3 }),
    ]);
    const score = svc.overallBiasScore(audits);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('filters bias alerts only', () => {
    const audits = svc.auditBatch([
      makeBiasInput({ internalRevenueWeight: 0.8, userRelevance: 0.1, objectiveQuality: 0.1 }),
      makeBiasInput({ internalRevenueWeight: 0.2, userRelevance: 0.3, objectiveQuality: 0.3 }),
    ]);
    const alerts = svc.biasAlerts(audits);
    expect(alerts).toHaveLength(1);
  });
});

// =========================================================================
// INCENT-005 — DisclosureEngine
// =========================================================================
describe('INCENT-005 — DisclosureEngine', () => {
  const svc = new DisclosureEngineService();

  it('generates disclosure for commission relationship', () => {
    const result = svc.disclose(
      makeDisclosureInput({ relationshipType: 'commission', compensationModel: '10% fixo' }),
    );
    expect(result.financialNature).toBe(true);
    expect(result.disclosureText).toContain('Transparência Kloel');
    expect(result.id.startsWith('dscl_')).toBe(true);
  });

  it('marks financial nature for financial relationships', () => {
    const result = svc.disclose(
      makeDisclosureInput({ relationshipType: 'ownership' }),
    );
    expect(result.financialNature).toBe(true);
  });

  it('does not mark financial nature for referral', () => {
    const result = svc.disclose(
      makeDisclosureInput({ relationshipType: 'referral' }),
    );
    expect(result.financialNature).toBe(false);
  });

  it('detects undisclosed recommendations', () => {
    const disclosures = svc.discloseBatch([
      makeDisclosureInput({ recommendationId: 'rec_a', relationshipType: 'commission' }),
    ]);
    const undisclosed = svc.undisclosedRelationships(disclosures, [
      'rec_a',
      'rec_b',
      'rec_c',
    ]);
    expect(undisclosed).toEqual(['rec_b', 'rec_c']);
  });

  it('computes disclosure rate', () => {
    const disclosures = svc.discloseBatch([
      makeDisclosureInput({ recommendationId: 'rec_a', relationshipType: 'commission' }),
      makeDisclosureInput({ recommendationId: 'rec_b', relationshipType: 'affiliate' }),
    ]);
    const rate = svc.disclosureRate(['rec_a', 'rec_b', 'rec_c', 'rec_d'], disclosures);
    expect(rate).toBe(0.5);
  });
});

// =========================================================================
// INCENT-006 — ThirdPartyAuditExport
// =========================================================================
describe('INCENT-006 — ThirdPartyAuditExport', () => {
  const svc = new ThirdPartyAuditExportService();

  it('builds complete audit bundle', () => {
    const result = svc.export({
      workspaceId: WKS,
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-06-01T00:00:00.000Z',
      recommendations: [makeRecEntry(), makeRecEntry()],
    });
    expect(result.summary.totalRecommendations).toBe(2);
    expect(result.summary.healthyRecommendationRate).toBe(1);
    expect(result.auditId.startsWith('audit_')).toBe(true);
  });

  it('computes integrity score', () => {
    const result = svc.export({
      workspaceId: WKS,
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-06-01T00:00:00.000Z',
      recommendations: [makeRecEntry()],
    });
    const score = svc.integrityScore(result);
    expect(score).toBe(1);
  });

  it('compares two audits', () => {
    const a = svc.export({
      workspaceId: WKS,
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-03-01T00:00:00.000Z',
      recommendations: [makeRecEntry()],
    });
    const b = svc.export({
      workspaceId: WKS,
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-06-01T00:00:00.000Z',
      recommendations: [makeRecEntry(), makeRecEntry()],
    });
    const comparison = svc.compareAudits(a, b);
    expect(comparison.trend).toBeDefined();
    expect(typeof comparison.deltaConflicts).toBe('number');
  });
});

// =========================================================================
// INCENT-007 — UserFeedbackCorrection
// =========================================================================
describe('INCENT-007 — UserFeedbackCorrection', () => {
  const svc = new UserFeedbackCorrectionService();

  it('records a correction with learned signal', () => {
    const result = svc.record(
      makeFeedbackInput({
        kind: 'corrected',
        userNote: 'Produto B seria melhor.',
      }),
    );
    expect(result.feedbackKind).toBe('corrected');
    expect(result.appliedToModel).toBe(true);
    expect(result.learnedSignal).toContain('Produto B');
  });

  it('does not apply inaccurate feedback without note to model', () => {
    const result = svc.record(
      makeFeedbackInput({ kind: 'inaccurate', userNote: '' }),
    );
    expect(result.appliedToModel).toBe(false);
  });

  it('applies inaccurate feedback with note to model', () => {
    const result = svc.record(
      makeFeedbackInput({
        kind: 'inaccurate',
        userNote: 'Preço desatualizado. O correto é R$ 99.',
      }),
    );
    expect(result.appliedToModel).toBe(true);
  });

  it('classifies corrections by kind', () => {
    const corrections = svc.recordBatch([
      makeFeedbackInput({ recommendationId: 'rec_a', kind: 'declined' }),
      makeFeedbackInput({ recommendationId: 'rec_b', kind: 'modified' }),
      makeFeedbackInput({ recommendationId: 'rec_c', kind: 'declined' }),
    ]);
    const declined = svc.correctionsByKind(corrections, 'declined');
    expect(declined).toHaveLength(2);
  });

  it('identifies most corrected recommendations', () => {
    const corrections = svc.recordBatch([
      makeFeedbackInput({ recommendationId: 'rec_a', kind: 'modified' }),
      makeFeedbackInput({ recommendationId: 'rec_a', kind: 'corrected' }),
      makeFeedbackInput({ recommendationId: 'rec_a', kind: 'declined' }),
      makeFeedbackInput({ recommendationId: 'rec_b', kind: 'corrected' }),
    ]);
    const top = svc.mostCorrected(corrections, 2);
    expect(top[0]).toBe('rec_a');
    expect(top[1]).toBe('rec_b');
  });
});

// =========================================================================
// INCENT-008 — RecommendationAttributionBuilder
// =========================================================================
describe('INCENT-008 — RecommendationAttributionBuilder', () => {
  const svc = new RecommendationAttributionBuilderService();

  it('builds attribution with sources', () => {
    const result = svc.build(
      makeAttrInput({
        sources: [
          makeSource('user_history', 0.5),
          makeSource('market_trend', 0.3),
          makeSource('peer_behavior', 0.2),
        ],
      }),
    );
    expect(result.isCrossRecommendation).toBe(true);
    expect(result.crossSourceCount).toBe(3);
    expect(result.primarySource).toBe('user_history');
    expect(result.attributions).toHaveLength(3);
  });

  it('marks single-source as non-cross', () => {
    const result = svc.build(
      makeAttrInput({
        sources: [makeSource('business_rule', 1.0)],
      }),
    );
    expect(result.isCrossRecommendation).toBe(false);
    expect(result.crossSourceCount).toBe(1);
  });

  it('transparency score penalizes opaque sources', () => {
    const opaque = svc.build(
      makeAttrInput({
        sources: [makeSource('business_rule', 1.0)],
      }),
    );
    const transparent = svc.build(
      makeAttrInput({
        sources: [
          makeSource('user_history', 0.4),
          makeSource('peer_behavior', 0.3),
          makeSource('market_trend', 0.3),
        ],
      }),
    );
    expect(transparent.transparencyScore).toBeGreaterThan(opaque.transparencyScore);
  });

  it('generates transparency report', () => {
    const attributions = svc.buildBatch([
      makeAttrInput({
        sources: [
          makeSource('business_rule', 1.0),
        ],
      }),
      makeAttrInput({
        sources: [
          makeSource('user_history', 0.4),
          makeSource('market_trend', 0.6),
        ],
      }),
    ]);
    const report = svc.transparencyReport(attributions);
    expect(report.averageTransparency).toBeGreaterThan(0);
    expect(report.crossSourceRate).toBe(0.5);
    expect(report.dominantSources).toHaveLength(2);
  });

  it('filters cross recommendations only', () => {
    const attributions = svc.buildBatch([
      makeAttrInput({
        sources: [makeSource('business_rule', 1.0)],
      }),
      makeAttrInput({
        sources: [
          makeSource('user_history', 0.5),
          makeSource('peer_behavior', 0.5),
        ],
      }),
    ]);
    const cross = svc.crossRecommendations(attributions);
    expect(cross).toHaveLength(1);
    expect(cross[0]!.isCrossRecommendation).toBe(true);
  });
});

// =========================================================================
// Utility functions
// =========================================================================
describe('INCENT utility functions', () => {
  it('clamp bounds values', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-0.5, 0, 1)).toBe(0);
  });

  it('biasLevelFromDelta classifies correctly', () => {
    expect(biasLevelFromDelta(0.01)).toBe('none');
    expect(biasLevelFromDelta(0.05)).toBe('low');
    expect(biasLevelFromDelta(0.15)).toBe('moderate');
    expect(biasLevelFromDelta(0.3)).toBe('high');
    expect(biasLevelFromDelta(0.5)).toBe('extreme');
  });

  it('weightedAverage computes correctly', () => {
    expect(weightedAverage([1, 2, 3], [1, 1, 1])).toBeCloseTo(2);
    expect(weightedAverage([1, 2], [0, 1])).toBeCloseTo(2);
    expect(weightedAverage([], [])).toBe(0);
  });

  it('makeIncidentId produces unique ids', () => {
    const a = makeIncidentId('test', 1);
    const b = makeIncidentId('test', 2);
    expect(a).not.toBe(b);
    expect(a.startsWith('test_')).toBe(true);
  });
});
