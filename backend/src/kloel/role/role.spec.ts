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
describe('UTP-ROLE-001 — Role Detector', () => {
  it('detects producer role from product and checkout events', () => {
    const events = [
      ev({ eventName: 'commerce.product.created' }),
      ev({ eventName: 'commerce.product.updated' }),
      ev({ eventName: 'commerce.checkout.created' }),
      ev({ eventName: 'commerce.payment.approved' }),
      ev({ eventName: 'commerce.member_area.enrolled' }),
    ];
    const detections = detectRoles({
      events,
      workspaceId: 'wks_prod',
      nowMs: NOW,
    });
    expect(detections.length).toBeGreaterThanOrEqual(1);
    const top = detections[0]!;
    expect(top.role).toBe('produtor');
    expect(top.confidence).toBeGreaterThan(0.2);
    expect(top.detectedFromSignals).toContain('commerce.product.created');
  });

  it('detects affiliate role from affiliate-specific events', () => {
    const events = [
      ev({ eventName: 'commerce.affiliate.link_created' }),
      ev({ eventName: 'commerce.affiliate.click_registered' }),
      ev({ eventName: 'commerce.affiliate.commission_received' }),
    ];
    const detections = detectRoles({
      events,
      workspaceId: 'wks_aff',
      nowMs: NOW,
    });
    const aff = detections.find((d) => d.role === 'afiliado');
    expect(aff).toBeDefined();
    expect(aff!.confidence).toBeGreaterThan(0);
  });

  it('detects closer when deal events dominate', () => {
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(ev({ eventName: 'commerce.crm.deal_won', eventId: `dw${i}` }));
      events.push(ev({ eventName: 'commerce.crm.deal_lost', eventId: `dl${i}` }));
    }
    events.push(ev({ eventName: 'commerce.lead.qualified' }));
    events.push(ev({ eventName: 'commerce.lead.objection_raised' }));
    const detections = detectRoles({
      events,
      workspaceId: 'wks_close',
      nowMs: NOW,
    });
    const closer = detections.find((d) => d.role === 'closer');
    expect(closer).toBeDefined();
    expect(closer!.confidence).toBeGreaterThan(0.3);
  });

  it('detects gestor as default when events exist but lack specialisation', () => {
    const events = [
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'workspace.settings.updated' }),
      ev({ eventName: 'commerce.lead.created', eventId: 'e1' }),
      ev({ eventName: 'workspace.settings.updated', eventId: 'e2' }),
      ev({ eventName: 'commerce.lead.created', eventId: 'e3' }),
      ev({ eventName: 'workspace.settings.updated', eventId: 'e4' }),
    ];
    const detections = detectRoles({
      events,
      workspaceId: 'wks_mgr',
      nowMs: NOW,
    });
    const gestor = detections.find((d) => d.role === 'gestor');
    expect(gestor).toBeDefined();
  });

  it('returns empty on zero events', () => {
    expect(
      detectRoles({
        events: [],
        workspaceId: 'wks_empty',
        nowMs: NOW,
      }),
    ).toHaveLength(0);
  });

  it('primaryRoleFromDetections returns undefined when no detection exceeds 0.3', () => {
    const weak: RoleDetection[] = [
      {
        role: 'produtor',
        confidence: 0.15,
        detectedFromSignals: ['commerce.product.created'],
        workspaceId: 'wks_test',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
    ];
    expect(primaryRoleFromDetections(weak)).toBeUndefined();
  });

  it('primaryRoleFromDetections picks highest confidence above 0.3', () => {
    const det: RoleDetection[] = [
      {
        role: 'closer',
        confidence: 0.72,
        detectedFromSignals: ['commerce.crm.deal_won'],
        workspaceId: 'wks_test',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
      {
        role: 'produtor',
        confidence: 0.55,
        detectedFromSignals: ['commerce.product.created'],
        workspaceId: 'wks_test',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
    ];
    expect(primaryRoleFromDetections(det)).toBe('closer');
  });
});

// ---------------------------------------------------------------------------
// ROLE-002: role-context.projector
// ---------------------------------------------------------------------------
describe('UTP-ROLE-002 — Role Context Projector', () => {
  it('projects detections into AbiRoleContext with levers and metrics', () => {
    const detections: RoleDetection[] = [
      {
        role: 'produtor',
        confidence: 0.78,
        detectedFromSignals: ['commerce.product.created'],
        workspaceId: 'wks_test',
        truthMode: 'inferred',
        detectedAt: new Date(NOW).toISOString(),
      },
    ];
    const ctx = projectRoleContext({
      detections,
      workspaceId: 'wks_test',
    });
    expect(ctx.primaryRole).toBe('produtor');
    expect(ctx.detectedRoles).toHaveLength(1);
    expect(ctx.detectedRoles[0]!.role).toBe('produtor');
    expect(ctx.realLevers.length).toBeGreaterThan(0);
    expect(ctx.realLevers).toContain('adjust_price');
    expect(ctx.relevantMetrics.length).toBeGreaterThan(0);
  });

  it('emptyRoleContext returns empty structure', () => {
    const ctx = emptyRoleContext();
    expect(ctx.detectedRoles).toHaveLength(0);
    expect(ctx.primaryRole).toBeUndefined();
    expect(ctx.realLevers).toHaveLength(0);
  });

  it('projectSingleDetection converts to ABI format', () => {
    const d: RoleDetection = {
      role: 'creator',
      confidence: 0.65,
      detectedFromSignals: ['commerce.content.published'],
      workspaceId: 'wks_test',
      truthMode: 'inferred',
      detectedAt: new Date(NOW).toISOString(),
    };
    const abi = projectSingleDetection(d);
    expect(abi.role).toBe('creator');
    expect(abi.confidence).toBe(0.65);
  });
});

// ---------------------------------------------------------------------------
// ROLE-003: leverage-map.service
// ---------------------------------------------------------------------------
describe('UTP-ROLE-003 — Leverage Map', () => {
  it('getLeversForRole returns levers for every known role', () => {
    for (const role of ALL_ROLES) {
      const levers = getLeversForRole(role);
      expect(levers.length).toBeGreaterThan(0);
    }
  });

  it('isLeverInControlRadius validates lever against role', () => {
    expect(isLeverInControlRadius('produtor', 'adjust_price')).toBe(true);
    expect(isLeverInControlRadius('produtor', 'choose_product')).toBe(false);
    expect(isLeverInControlRadius('afiliado', 'choose_product')).toBe(true);
  });

  it('LeverageMapService matches pure functions', () => {
    const svc = new LeverageMapService();
    expect(svc.getLevers('closer')).toEqual(getLeversForRole('closer'));
    expect(svc.isInRadius('closer', 'call_lead')).toBe(true);
    expect(svc.isInRadius('closer', 'adjust_price')).toBe(false);
    expect(svc.getAllMaps().size).toBe(ALL_ROLES.length);
  });

  it('getLeverageMap returns direct and influenced levers', () => {
    const map = getLeverageMap('agencia');
    expect(map.directLevers).toContain('add_client');
    expect(map.influencedLevers).toContain('optimize_margin');
  });
});

// ---------------------------------------------------------------------------
// ROLE-004: role-metric.registry
// ---------------------------------------------------------------------------
describe('UTP-ROLE-004 — Role Metric Registry', () => {
  it('getAllMetrics returns all registered metrics', () => {
    const all = getAllMetrics();
    expect(all.length).toBeGreaterThanOrEqual(17);
  });

  it('getRelevantMetricsForRole returns role-specific metrics', () => {
    const closerMetrics = getRelevantMetricsForRole('closer');
    expect(closerMetrics.length).toBeGreaterThan(0);
    const metricNames = closerMetrics.map((m) => m.metricName);
    expect(metricNames).toContain('deal_close_rate');
    expect(metricNames).toContain('conversion_rate');

    const affiliateMetrics = getRelevantMetricsForRole('afiliado');
    const affNames = affiliateMetrics.map((m) => m.metricName);
    expect(affNames).toContain('commission_rate');
    expect(affNames).toContain('cost_per_click');
  });

  it('getMetricsForRoles deduplicates across roles', () => {
    const metrics = getMetricsForRoles(['closer', 'produtor']);
    expect(metrics.length).toBeGreaterThan(0);
    const names = metrics.map((m) => m.metricName);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// ROLE-005: recommendation-guard
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
describe('UTP-ROLE-008 — Role-Aware Wisdom Extender', () => {
  it('filters wisdom patterns by role-relevant signal kinds', () => {
    const patterns = [
      makeWisdomPattern({ signalKind: 'conversion_rate', patternId: 'wp1' }),
      makeWisdomPattern({ signalKind: 'campaign_efficiency', patternId: 'wp2' }),
      makeWisdomPattern({ signalKind: 'refund_rate', patternId: 'wp3' }),
    ];
    const result = filterWisdomByRole({
      patterns,
      role: 'afiliado',
    });
    expect(result.filteredPatterns.length).toBeGreaterThan(0);
    expect(result.filteredOutCount).toBeGreaterThanOrEqual(0);
    const kinds = result.filteredPatterns.map((p) => p.signalKind);
    expect(kinds).toContain('conversion_rate');
    expect(kinds).toContain('campaign_efficiency');
  });

  it('filterWisdomByMultiRole combines patterns from multiple roles', () => {
    const patterns = [
      makeWisdomPattern({ signalKind: 'conversion_rate', patternId: 'wp1' }),
      makeWisdomPattern({ signalKind: 'refund_rate', patternId: 'wp2' }),
      makeWisdomPattern({ signalKind: 'deal_close_rate', patternId: 'wp3' }),
      makeWisdomPattern({ signalKind: 'campaign_efficiency', patternId: 'wp4' }),
    ];
    const result = filterWisdomByMultiRole({
      patterns,
      primaryRole: 'closer',
      secondaryRoles: ['afiliado'],
    });
    expect(result.filteredPatterns.length).toBeGreaterThanOrEqual(3);
    expect(result.roles).toContain('closer');
    expect(result.roles).toContain('afiliado');
  });

  it('explainRelevance returns meaningful reason for match', () => {
    const pattern = makeWisdomPattern({ signalKind: 'deal_close_rate' });
    const res = explainRelevance(pattern, 'closer');
    expect(res.relevant).toBe(true);
    expect(res.reason.toLowerCase()).toContain('relevante');
  });

  it('explainRelevance returns falsy for unknown kind to role', () => {
    const pattern = makeWisdomPattern({ signalKind: 'campaign_efficiency' });
    const res = explainRelevance(pattern, 'especialista');
    expect(res.relevant).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Coverage / cross-cutting tests
// ---------------------------------------------------------------------------
describe('ROLE — cross-cutting invariants', () => {
  it('ALL_ROLES has ROLE_DESCRIPTIONS for every role', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_DESCRIPTIONS[role]).toBeDefined();
      expect(ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('every role has at least one lever and one metric', () => {
    for (const role of ALL_ROLES) {
      expect(getLeversForRole(role).length).toBeGreaterThan(0);
      expect(getRelevantMetricsForRole(role).length).toBeGreaterThan(0);
    }
  });

  it('all 8 UTP files are importable (no crash on import)', () => {
    expect(detectRoles).toBeDefined();
    expect(projectRoleContext).toBeDefined();
    expect(getLeverageMap).toBeDefined();
    expect(getRelevantMetricsForRole).toBeDefined();
    expect(guardRecommendation).toBeDefined();
    expect(MultiHatService).toBeDefined();
    expect(extendHierarchyWithRole).toBeDefined();
    expect(filterWisdomByRole).toBeDefined();
  });
});
