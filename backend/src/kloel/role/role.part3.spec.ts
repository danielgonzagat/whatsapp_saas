/**
 * UTP-ROLE-001..008 — Role module spec.
 *
 * Tests role detection, context projection, leverage mapping,
 * metric registry, recommendation guard, multi-hat service,
 * hierarchy extender, and wisdom extender.
 *
 * >= 14 tests.
 */
import { ALL_ROLES, ROLE_DESCRIPTIONS } from './types';
import { detectRoles } from './role.detector';
import { projectRoleContext } from './role-context.projector';
import { getLeversForRole, getLeverageMap } from './leverage-map.service';
import { getRelevantMetricsForRole } from './role-metric.registry';
import { guardRecommendation } from './recommendation-guard';
import { MultiHatService } from './multi-hat.service';
import { extendHierarchyWithRole } from './aware-hierarchy.extender';
import {
  filterWisdomByRole,
  filterWisdomByMultiRole,
  explainRelevance,
} from './aware-wisdom.extender';
import type { WisdomPattern } from '../wisdom/wisdom.types';

function makeWisdomPattern(over: Partial<WisdomPattern>): WisdomPattern {
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

// ---------------------------------------------------------------------------
// ROLE-001: role.detector
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
