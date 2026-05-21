import type { ConflictDetection } from './types';

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
import type { AuditRecommendationEntry } from './third-party-audit-export.service';

import { UserFeedbackCorrectionService } from './user-feedback-correction.service';
import type { FeedbackInput } from './user-feedback-correction.service';

import { RecommendationAttributionBuilderService } from './recommendation-attribution-builder.service';
import type {
  AttributionInput,
  AttributionSourceEntry,
} from './recommendation-attribution-builder.service';

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
        internalRevenueWeight: 0.1,
        userRelevance: 0.05,
        objectiveQuality: 0.05,
        competitiveLandscape: 0,
        userHistory: 0,
        thirdPartyRating: 0.05,
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
      makeBiasInput({
        internalRevenueWeight: 0.1,
        userRelevance: 0.05,
        objectiveQuality: 0.05,
        competitiveLandscape: 0,
        userHistory: 0,
        thirdPartyRating: 0.05,
      }),
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
    const result = svc.disclose(makeDisclosureInput({ relationshipType: 'ownership' }));
    expect(result.financialNature).toBe(true);
  });

  it('does not mark financial nature for referral', () => {
    const result = svc.disclose(makeDisclosureInput({ relationshipType: 'referral' }));
    expect(result.financialNature).toBe(false);
  });

  it('detects undisclosed recommendations', () => {
    const disclosures = svc.discloseBatch([
      makeDisclosureInput({ recommendationId: 'rec_a', relationshipType: 'commission' }),
    ]);
    const undisclosed = svc.undisclosedRelationships(disclosures, ['rec_a', 'rec_b', 'rec_c']);
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
    const result = svc.record(makeFeedbackInput({ kind: 'inaccurate', userNote: '' }));
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