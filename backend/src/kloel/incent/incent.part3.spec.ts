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
        sources: [makeSource('business_rule', 1.0)],
      }),
      makeAttrInput({
        sources: [makeSource('user_history', 0.4), makeSource('market_trend', 0.6)],
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
        sources: [makeSource('user_history', 0.5), makeSource('peer_behavior', 0.5)],
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
