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
    const result = svc.detect(makeConflictInput({ kloelHasOwnership: true }));
    expect(result.conflictDetected).toBe(true);
    expect(result.severity).toBe('structural');
  });

  it('detects self-dealing', () => {
    const result = svc.detect(
      makeConflictInput({
        recommendationId: 'kloel_internal_service',
        involvedParties: ['kloel'],
      }),
    );
    expect(result.conflictDetected).toBe(true);
    expect(result.kind).toBe('self_dealing');
    expect(result.severity).toBe('structural');
  });

  it('returns no conflict for clean input', () => {
    const result = svc.detect(makeConflictInput({ involvedParties: ['partner_a'] }));
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
    const result = svc.enforce(makeSilenceInput({ conflict }));
    expect(result.silenced).toBe(true);
    expect(result.reason).toBe('structural_conflict');
    expect(result.enforcement).toBe('automatic');
  });

  it('silences when bias detected and not mitigated', () => {
    const result = svc.enforce(makeSilenceInput({ biasDetected: true, biasMitigated: false }));
    expect(result.silenced).toBe(true);
    expect(result.reason).toBe('platform_bias_alert');
  });

  it('does not silence when bias is mitigated', () => {
    const result = svc.enforce(makeSilenceInput({ biasDetected: true, biasMitigated: true }));
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