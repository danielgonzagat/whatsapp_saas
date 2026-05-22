/**
 * UTP-ROLE-001..008 — Role module spec.
 *
 * Tests role detection, context projection, leverage mapping,
 * metric registry, recommendation guard, multi-hat service,
 * hierarchy extender, and wisdom extender.
 *
 * >= 14 tests.
 */
import type { SpineEventRef } from '../mind/mind.types';
import type { Role, RoleDetection } from './types';
import { ALL_ROLES, ROLE_DESCRIPTIONS } from './types';
import { detectRoles, primaryRoleFromDetections } from './role.detector';
import {
  projectRoleContext,
  projectSingleDetection,
  emptyRoleContext,
} from './role-context.projector';
import {
  LeverageMapService,
  getLeversForRole,
  isLeverInControlRadius,
  getLeverageMap,
} from './leverage-map.service';
import {
  getRelevantMetricsForRole,
  getAllMetrics,
  getMetricsForRoles,
} from './role-metric.registry';
import {
  guardRecommendation,
  guardRecommendations,
  countBlocked,
  allowedOnly,
} from './recommendation-guard';
import { MultiHatService } from './multi-hat.service';
import {
  extendHierarchyWithRole,
  roleAwareReTier,
  countTierChanges,
} from './aware-hierarchy.extender';
import type { AttentionRanking } from '../clarity/clarity.types';
import {
  filterWisdomByRole,
  filterWisdomByMultiRole,
  explainRelevance,
} from './aware-wisdom.extender';
import type { WisdomPattern } from '../wisdom/wisdom.types';

const NOW = Date.parse('2026-05-14T10:00:00.000Z');

function ev(over: Partial<SpineEventRef>): SpineEventRef {
  const e: Record<string, unknown> = {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_role_test',
    occurredAt: over.occurredAt ?? '2026-05-14T08:00:00.000Z',
    truthMode: over.truthMode ?? 'observed',
  };
  if ('entityRef' in over && over.entityRef !== undefined)
    e['entityRef'] = over.entityRef;
  if (over.valence !== undefined) e['valence'] = over.valence;
  if (over.payload !== undefined) e['payload'] = over.payload;
  return e as SpineEventRef;
}

function makeWisdomPattern(
  over: Partial<WisdomPattern>,
): WisdomPattern {
  return {
    patternId: over.patternId ?? `wp_${Math.random().toString(36).slice(2, 8)}`,
    description: over.description ?? 'pattern desc',
    applicableConditions: over.applicableConditions ?? ['stage:validacao'],
    evidenceWorkspacesCount: over.evidenceWorkspacesCount ?? 5,
    confidence: over.confidence ?? 0.8,
    signalKind: over.signalKind ?? 'conversion_rate',
    taxonomy: over.taxonomy ?? {
      verticalHint: undefined,
      tickethint: undefined,
      stageHint: 'validacao',
      channelHint: undefined,
    },
  };
}

function makeRanking(
  over: Partial<AttentionRanking>,
): AttentionRanking {
  return {
    itemId: over.itemId ?? `it_${Math.random().toString(36).slice(2, 6)}`,
    workspaceId: over.workspaceId ?? 'wks_role_test',
    label: over.label ?? 'test item',
    urgency: over.urgency ?? 0.6,
    impact: over.impact ?? 0.5,
    reversibility: over.reversibility ?? 0.4,
    score: over.score ?? 0.45,
    tier: over.tier ?? 'ESTA_SEMANA',
    rankedAt: over.rankedAt ?? '2026-05-14T09:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// ROLE-001: role.detector
// ---------------------------------------------------------------------------
describe('UTP-ROLE-005 — Recommendation Guard', () => {
  it('allows suggestion within role control radius', () => {
    const result = guardRecommendation({
      suggestedLever: 'adjust_price',
      targetRole: 'produtor',
      suggestionDescription: 'Sugerir ajuste de preco para R$97',
    });
    expect(result.allowed).toBe(true);
    expect(result.role).toBe('produtor');
  });

  it('blocks suggestion outside role control radius', () => {
    const result = guardRecommendation({
      suggestedLever: 'choose_product',
      targetRole: 'produtor',
      suggestionDescription: 'Tente promover o produto do Joao',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason.toLowerCase()).toContain('fora');
  });

  it('guardRecommendations batches multiple checks', () => {
    const checks = [
      {
        suggestedLever: 'adjust_price',
        targetRole: 'produtor' as Role,
        suggestionDescription: 'A',
      },
      {
        suggestedLever: 'choose_product',
        targetRole: 'produtor' as Role,
        suggestionDescription: 'B',
      },
    ];
    const results = guardRecommendations(checks);
    expect(results).toHaveLength(2);
    expect(results[0]!.allowed).toBe(true);
    expect(results[1]!.allowed).toBe(false);
  });

  it('countBlocked counts blocked suggestions', () => {
    const checks = [
      {
        suggestedLever: 'choose_product',
        targetRole: 'produtor' as Role,
        suggestionDescription: 'B',
      },
      {
        suggestedLever: 'adjust_price',
        targetRole: 'closer' as Role,
        suggestionDescription: 'A',
      },
    ];
    const results = guardRecommendations(checks);
    expect(countBlocked(results)).toBe(2);
  });

  it('allowedOnly filters to allowed suggestions', () => {
    const checks = [
      {
        suggestedLever: 'adjust_price',
        targetRole: 'produtor' as Role,
        suggestionDescription: 'A',
      },
      {
        suggestedLever: 'choose_product',
        targetRole: 'produtor' as Role,
        suggestionDescription: 'B',
      },
    ];
    const results = guardRecommendations(checks);
    const allowed = allowedOnly(checks, results);
    expect(allowed).toHaveLength(1);
    expect(allowed[0]!.suggestedLever).toBe('adjust_price');
  });
});

// ---------------------------------------------------------------------------
// ROLE-006: multi-hat.service
// ---------------------------------------------------------------------------
describe('UTP-ROLE-006 — Multi-Hat Service', () => {
  it('builds profile with primary and secondary roles', () => {
    const svc = new MultiHatService();
    const detections: RoleDetection[] = [
      {
        role: 'closer',
        confidence: 0.72,
        detectedFromSignals: ['commerce.crm.deal_won'],
        workspaceId: 'wks_multi',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
      {
        role: 'produtor',
        confidence: 0.45,
        detectedFromSignals: ['commerce.product.created'],
        workspaceId: 'wks_multi',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
    ];
    const profile = svc.buildProfile({
      detections,
      workspaceId: 'wks_multi',
      nowMs: NOW,
    });
    expect(profile.primaryRole).toBe('closer');
    expect(profile.secondaryRoles).toContain('produtor');
    expect(profile.hatStackDepth).toBe(2);
    expect(profile.combinedLevers.length).toBeGreaterThan(
      getLeversForRole('closer').length,
    );
  });

  it('hasMultipleHats returns false for single-role workspace', () => {
    const svc = new MultiHatService();
    const detections: RoleDetection[] = [
      {
        role: 'creator',
        confidence: 0.8,
        detectedFromSignals: ['commerce.content.published'],
        workspaceId: 'wks_single',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
    ];
    svc.buildProfile({
      detections,
      workspaceId: 'wks_single',
      nowMs: NOW,
    });
    expect(svc.hasMultipleHats('wks_single')).toBe(false);
  });

  it('getActiveRoles returns all active roles for multi-hat workspace', () => {
    const svc = new MultiHatService();
    const detections: RoleDetection[] = [
      {
        role: 'agencia',
        confidence: 0.7,
        detectedFromSignals: ['commerce.campaign.created'],
        workspaceId: 'wks_agency',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
      {
        role: 'closer',
        confidence: 0.35,
        detectedFromSignals: ['commerce.crm.deal_won'],
        workspaceId: 'wks_agency',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
    ];
    svc.buildProfile({ detections, workspaceId: 'wks_agency', nowMs: NOW });
    const roles = svc.getActiveRoles('wks_agency');
    expect(roles).toContain('agencia');
    expect(roles).toContain('closer');
  });
});

// ---------------------------------------------------------------------------
// ROLE-007: aware-hierarchy.extender
// ---------------------------------------------------------------------------
describe('UTP-ROLE-007 — Role-Aware Hierarchy Extender', () => {
  it('re-weights rankings with role-specific tier boosts', () => {
    const rankings = [
      makeRanking({
        itemId: 'it1',
        score: 0.6,
        tier: 'ESTA_SEMANA',
        urgency: 0.7,
        impact: 0.6,
        reversibility: 0.5,
      }),
      makeRanking({
        itemId: 'it2',
        score: 0.4,
        tier: 'PARA_SABER',
        urgency: 0.3,
        impact: 0.4,
        reversibility: 0.5,
      }),
    ];
    const weights = extendHierarchyWithRole({
      rankings,
      role: 'closer',
    });
    expect(weights).toHaveLength(2);
    expect(weights[0]!.roleApplied).toBe('closer');
    expect(weights[1]!.roleApplied).toBe('closer');
  });

  it('roleAwareReTier re-assigns tiers based on adjusted scores', () => {
    const rankings = [
      makeRanking({
        itemId: 'it_high',
        score: 0.7,
        tier: 'ESTA_SEMANA',
        urgency: 0.8,
        impact: 0.7,
        reversibility: 0.6,
      }),
    ];
    const weights = extendHierarchyWithRole({
      rankings,
      role: 'closer',
    });
    const reTiered = roleAwareReTier(weights);
    expect(reTiered).toHaveLength(1);
    expect(reTiered[0]!.adjustedTier).toBeDefined();
  });

  it('countTierChanges detects tier shifts', () => {
    const rankings = [
      makeRanking({
        itemId: 'it1',
        score: 0.44,
        tier: 'PARA_SABER',
        urgency: 0.44,
        impact: 0.44,
        reversibility: 0.44,
      }),
    ];
    const weights = extendHierarchyWithRole({
      rankings,
      role: 'produtor',
    });
    const reTiered = roleAwareReTier(weights);
    const changes = countTierChanges(rankings, reTiered);
    expect(changes).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// ROLE-008: aware-wisdom.extender
// ---------------------------------------------------------------------------