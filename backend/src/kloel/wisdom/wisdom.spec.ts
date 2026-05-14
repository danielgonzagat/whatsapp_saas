import { WisdomPatternExtractorService } from './wisdom-pattern-extractor.service';
import { applyKAnonymity, applyDiffPrivacyNoise, anonymizePatterns, toWisdomPattern } from './wisdom-anonymizer';
import { validateByNWorkspaces, classifyByNWorkspaces } from './wisdom-validator';
import { deriveTaxonomy, taxonomyForSignalKind, ALL_VERTICAL_HINTS, ALL_TICKET_HINTS, ALL_STAGE_HINTS, ALL_CHANNEL_HINTS } from './wisdom-taxonomy';
import { WisdomProjectorService } from './wisdom-projector.service';
import { relevanceScore, filterByRelevance, filterIrrelevant } from './wisdom-relevance-filter';
import { WisdomOptService } from './wisdom-opt';
import { validateAttribution, assertNoAttributionLeak, patternDescriptionIsClean } from './wisdom-attribution.guard';
import type { SpineEventRef } from '../mind/mind.types';
import type { CandidatePattern, WorkspaceEventSet, TargetWorkspaceContext, WisdomPattern } from './wisdom.types';

function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAt: string,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  let seq = (makeEvent as unknown as { _seq: number })._seq ?? 0;
  seq++;
  (makeEvent as unknown as { _seq: number })._seq = seq;
  return {
    eventId: `evt_${String(seq).padStart(5, '0')}`,
    eventName,
    workspaceId,
    occurredAt,
    truthMode: 'observed',
    ...overrides,
  };
}

function buildEventSet(
  workspaceId: string,
  count: number,
  baseDate: Date,
  overrides: Partial<SpineEventRef> = {},
): WorkspaceEventSet {
  const events: SpineEventRef[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(baseDate.getTime() + i * 3600_000);
    events.push(makeEvent(
      overrides.eventName ?? 'commerce.lead.created',
      workspaceId,
      t.toISOString(),
      { ...overrides, eventName: overrides.eventName ?? 'commerce.lead.created' },
    ));
  }
  return { workspaceId, events };
}

function multiWorkspaceSets(): WorkspaceEventSet[] {
  const base = new Date('2026-05-01T00:00:00.000Z');
  const sets: WorkspaceEventSet[] = [];

  for (let w = 0; w < 5; w++) {
    const wsId = `wks_${String(w + 1).padStart(3, '0')}`;
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 30; i++) {
      const t = new Date(base.getTime() + i * 7200_000 + w * 86_400_000);
      events.push(makeEvent('commerce.lead.created', wsId, t.toISOString()));
    }
    for (let i = 0; i < 8; i++) {
      const t = new Date(base.getTime() + 50_000_000 + i * 86_400_000 + w * 86_400_000);
      events.push(makeEvent('commerce.lead.converted', wsId, t.toISOString(), { valence: 'positive' }));
    }
    for (let i = 0; i < 12; i++) {
      const t = new Date(base.getTime() + 30_000_000 + i * 36_000_000 + w * 86_400_000);
      events.push(makeEvent('commerce.payment.approved', wsId, t.toISOString(), { valence: 'positive' }));
    }
    for (let i = 0; i < 5; i++) {
      const t = new Date(base.getTime() + 40_000_000 + i * 72_000_000 + w * 86_400_000);
      events.push(makeEvent('commerce.whatsapp.message_replied', wsId, t.toISOString(), { valence: 'positive' }));
    }
    for (let i = 0; i < 2; i++) {
      const t = new Date(base.getTime() + 45_000_000 + i * 100_000_000 + w * 86_400_000);
      events.push(makeEvent('commerce.crm.deal_won', wsId, t.toISOString(), { valence: 'positive' }));
    }
    sets.push({ workspaceId: wsId, events });
  }
  return sets;
}

describe('WISDOM-001 — Pattern Extractor', () => {
  let extractor: WisdomPatternExtractorService;

  beforeEach(() => {
    extractor = new WisdomPatternExtractorService();
  });

  test('returns empty array when fewer than 2 workspace sets', () => {
    const single = [buildEventSet('wks_001', 20, new Date())];
    expect(extractor.extract(single)).toEqual([]);
  });

  test('returns patterns from multi-workspace event sets', () => {
    const sets = multiWorkspaceSets();
    const patterns = extractor.extract(sets);
    expect(patterns.length).toBeGreaterThan(0);
  });

  test('patterns have evidenceWorkspaceIds without single-workspace leaks', () => {
    const sets = multiWorkspaceSets();
    const patterns = extractor.extract(sets);
    for (const p of patterns) {
      expect(p.evidenceWorkspaceIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('pattern descriptions do not contain workspaceIds', () => {
    const sets = multiWorkspaceSets();
    const patterns = extractor.extract(sets);
    for (const p of patterns) {
      expect(p.description).not.toMatch(/\bwks_\w+/);
      expect(p.description).not.toMatch(/\blead_\w+/);
    }
  });

  test('patterns have confidence between 0 and 1', () => {
    const sets = multiWorkspaceSets();
    const patterns = extractor.extract(sets);
    for (const p of patterns) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('WISDOM-002 — k-Anonymity + Diff-Privacy', () => {
  test('k-anonymity drops patterns below k threshold', () => {
    const candidates: CandidatePattern[] = [
      { patternId: 'pat_1', description: 'test', applicableConditions: [], evidenceWorkspaceIds: ['a'], evidenceWorkspacesCount: 1, confidence: 0.5, signalKind: 'conversion_rate', aggregatedValue: 0.3 },
      { patternId: 'pat_2', description: 'test', applicableConditions: [], evidenceWorkspaceIds: ['a', 'b', 'c'], evidenceWorkspacesCount: 3, confidence: 0.7, signalKind: 'conversion_rate', aggregatedValue: 0.6 },
      { patternId: 'pat_3', description: 'test', applicableConditions: [], evidenceWorkspaceIds: ['a', 'b', 'c', 'd'], evidenceWorkspacesCount: 4, confidence: 0.8, signalKind: 'conversion_rate', aggregatedValue: 0.8 },
    ];
    const result = applyKAnonymity(candidates, { k: 3 });
    expect(result).toHaveLength(2);
    expect(result.map(c => c.patternId)).toEqual(['pat_2', 'pat_3']);
  });

  test('diff-privacy noise modifies aggregated values', () => {
    const candidates: CandidatePattern[] = [
      { patternId: 'pat_1', description: 'test', applicableConditions: [], evidenceWorkspaceIds: ['a', 'b', 'c'], evidenceWorkspacesCount: 3, confidence: 0.8, signalKind: 'conversion_rate', aggregatedValue: 0.5 },
    ];
    const result = applyDiffPrivacyNoise(candidates, { epsilon: 1.0 });
    expect(result).toHaveLength(1);
    expect(result[0]?.aggregatedValue).toBeGreaterThanOrEqual(0);
    expect(result[0]?.confidence).toBeGreaterThanOrEqual(0);
    expect(result[0]?.confidence).toBeLessThanOrEqual(0.95);
  });

  test('anonymizePatterns pipeline: k-anonymity first, then noise', () => {
    const candidates: CandidatePattern[] = [
      { patternId: 'pat_low', description: 'low', applicableConditions: [], evidenceWorkspaceIds: ['a'], evidenceWorkspacesCount: 1, confidence: 0.4, signalKind: 'conversion_rate', aggregatedValue: 0.1 },
      { patternId: 'pat_high', description: 'high', applicableConditions: [], evidenceWorkspaceIds: ['a', 'b', 'c', 'd'], evidenceWorkspacesCount: 4, confidence: 0.8, signalKind: 'conversion_rate', aggregatedValue: 0.7 },
    ];
    const result = anonymizePatterns(candidates, { kAnonymity: { k: 3 } });
    expect(result).toHaveLength(1);
    expect(result[0]?.patternId).toBe('pat_high');
  });

  test('toWisdomPattern strips evidenceWorkspaceIds', () => {
    const candidate: CandidatePattern = {
      patternId: 'pat_1',
      description: 'test pattern',
      applicableConditions: ['cond_a'],
      evidenceWorkspaceIds: ['wks_a', 'wks_b'],
      evidenceWorkspacesCount: 2,
      confidence: 0.7,
      signalKind: 'conversion_rate',
      aggregatedValue: 0.42,
    };
    const wp = toWisdomPattern(candidate);
    expect(wp.patternId).toBe('pat_1');
    expect((wp as unknown as Record<string, unknown>)['evidenceWorkspaceIds']).toBeUndefined();
  });
});

describe('WISDOM-003 — Validation by N Workspaces', () => {
  const candidates: CandidatePattern[] = [
    { patternId: 'pat_1', description: 't1', applicableConditions: [], evidenceWorkspaceIds: ['a'], evidenceWorkspacesCount: 1, confidence: 0.4, signalKind: 'conversion_rate', aggregatedValue: 0.1 },
    { patternId: 'pat_2', description: 't2', applicableConditions: [], evidenceWorkspaceIds: ['a', 'b'], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', aggregatedValue: 0.2 },
    { patternId: 'pat_3', description: 't3', applicableConditions: [], evidenceWorkspaceIds: ['a', 'b', 'c'], evidenceWorkspacesCount: 3, confidence: 0.6, signalKind: 'conversion_rate', aggregatedValue: 0.3 },
    { patternId: 'pat_4', description: 't4', applicableConditions: [], evidenceWorkspaceIds: ['a', 'b', 'c', 'd', 'e'], evidenceWorkspacesCount: 5, confidence: 0.9, signalKind: 'conversion_rate', aggregatedValue: 0.5 },
  ];

  test('validateByNWorkspaces keeps only patterns with >= N evidence', () => {
    const result = validateByNWorkspaces(candidates, { n: 3 });
    expect(result).toHaveLength(2);
  });

  test('default N validation filters correctly', () => {
    const result = validateByNWorkspaces(candidates);
    expect(result).toHaveLength(2);
  });

  test('classifyByNWorkspaces buckets correctly', () => {
    const { confirmed, candidate, rejected } = classifyByNWorkspaces(candidates, 3);
    expect(confirmed).toHaveLength(2);
    expect(candidate).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe('WISDOM-004 — Pattern Taxonomy', () => {
  test('deriveTaxonomy returns structured tags', () => {
    const pattern: CandidatePattern = {
      patternId: 'pat_test',
      description: 'test',
      applicableConditions: [],
      evidenceWorkspaceIds: ['a', 'b'],
      evidenceWorkspacesCount: 2,
      confidence: 0.5,
      signalKind: 'conversion_rate',
      aggregatedValue: 0.3,
    };
    const taxonomy = deriveTaxonomy(pattern);
    expect(taxonomy.verticalHint).toBe('sales');
    expect(taxonomy.tickethint).toBe('all');
    expect(taxonomy.stageHint).toBe('tracao');
    expect(taxonomy.channelHint).toBe('whatsapp');
  });

  test('taxonomyForSignalKind works for all kinds', () => {
    const kinds: Parameters<typeof taxonomyForSignalKind>[0][] = [
      'conversion_rate', 'reply_rate', 'refund_rate', 'handoff_rate',
      'deal_close_rate', 'lead_volume', 'campaign_efficiency',
      'peak_activity', 'stage_distribution', 'product_concentration',
    ];
    for (const kind of kinds) {
      const t = taxonomyForSignalKind(kind);
      expect(t).toBeDefined();
    }
  });

  test('all taxonomy constants are non-empty', () => {
    expect(ALL_VERTICAL_HINTS.length).toBeGreaterThan(0);
    expect(ALL_TICKET_HINTS.length).toBeGreaterThan(0);
    expect(ALL_STAGE_HINTS.length).toBeGreaterThan(0);
    expect(ALL_CHANNEL_HINTS.length).toBeGreaterThan(0);
  });
});

describe('WISDOM-005 — Projector', () => {
  let projector: WisdomProjectorService;

  beforeEach(() => {
    projector = new WisdomProjectorService();
  });

  test('project converts WisdomPattern to AbiWisdomPattern', () => {
    const wp: WisdomPattern = {
      patternId: 'pat_1',
      description: 'Conversion rate averages 25% across 3 workspaces',
      applicableConditions: ['conversion_rate > 0'],
      evidenceWorkspacesCount: 3,
      confidence: 0.75,
      signalKind: 'conversion_rate',
      taxonomy: { verticalHint: 'sales', tickethint: 'all', stageHint: 'tracao', channelHint: 'whatsapp' },
    };
    const result = projector.project([wp]);
    expect(result).toHaveLength(1);
    expect(result[0]?.patternId).toBe('pat_1');
    expect(result[0]?.evidenceWorkspacesCount).toBe(3);
    expect((result[0] as Record<string, unknown>)['taxonomy']).toBeUndefined();
    expect((result[0] as Record<string, unknown>)['signalKind']).toBeUndefined();
  });

  test('project drops patterns with empty descriptions', () => {
    const wp: WisdomPattern = {
      patternId: 'pat_empty',
      description: '',
      applicableConditions: [],
      evidenceWorkspacesCount: 2,
      confidence: 0.5,
      signalKind: 'conversion_rate',
      taxonomy: {},
    };
    expect(projector.project([wp])).toHaveLength(0);
  });

  test('capByBudget limits to N highest confidence patterns', () => {
    const abi = [
      { patternId: 'a', description: 'd', applicableConditions: [], evidenceWorkspacesCount: 3, confidence: 0.3 },
      { patternId: 'b', description: 'd', applicableConditions: [], evidenceWorkspacesCount: 3, confidence: 0.9 },
      { patternId: 'c', description: 'd', applicableConditions: [], evidenceWorkspacesCount: 3, confidence: 0.6 },
    ];
    const capped = projector.capByBudget(abi, 2);
    expect(capped).toHaveLength(2);
    expect(capped[0]?.patternId).toBe('b');
  });
});

describe('WISDOM-006 — Relevance Filter', () => {
  test('relevanceScore returns 1 for exact match', () => {
    const target: TargetWorkspaceContext = {
      workspaceId: 'wks_target',
      vertical: 'sales',
      ticketRange: 'high',
      maturityStage: 'crescimento',
      activeChannels: ['whatsapp', 'crm'],
    };
    const taxonomy = {
      verticalHint: 'sales',
      tickethint: 'high',
      stageHint: 'crescimento',
      channelHint: 'whatsapp',
    };
    expect(relevanceScore(taxonomy, target)).toBe(1);
  });

  test('relevanceScore returns partial score for partial match', () => {
    const target: TargetWorkspaceContext = {
      workspaceId: 'wks_target',
      vertical: 'sales',
    };
    const taxonomy = {
      verticalHint: 'sales',
      tickethint: 'all',
      stageHint: 'validacao',
      channelHint: 'whatsapp',
    };
    const score = relevanceScore(taxonomy, target);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test('filterByRelevance returns only patterns above threshold', () => {
    const target: TargetWorkspaceContext = {
      workspaceId: 'wks_t',
      vertical: 'sales',
      ticketRange: 'high',
      maturityStage: 'crescimento',
      activeChannels: ['whatsapp'],
    };
    const patterns: WisdomPattern[] = [
      { patternId: 'p1', description: 'd1', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: { verticalHint: 'sales', tickethint: 'high', stageHint: 'crescimento', channelHint: 'whatsapp' } },
      { patternId: 'p2', description: 'd2', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'refund_rate', taxonomy: { verticalHint: 'financial', tickethint: 'all', stageHint: 'maturidade', channelHint: 'checkout' } },
    ];
    const filtered = filterByRelevance(patterns, target, 0.5);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.patternId).toBe('p1');
  });

  test('filterIrrelevant drops zero-score patterns', () => {
    const target: TargetWorkspaceContext = {
      workspaceId: 'wks_t',
      vertical: 'marketing',
      ticketRange: 'all',
    };
    const patterns: WisdomPattern[] = [
      { patternId: 'p1', description: 'd1', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: { verticalHint: 'sales', tickethint: 'all', stageHint: 'tracao', channelHint: 'whatsapp' } },
      { patternId: 'p2', description: 'd2', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'reply_rate', taxonomy: { verticalHint: 'engagement', tickethint: 'all', stageHint: 'validacao', channelHint: 'whatsapp' } },
    ];
    const filtered = filterIrrelevant(patterns, target);
    expect(filtered).toHaveLength(2);
  });
});

describe('WISDOM-007 — Opt-In/Out Registry', () => {
  let opt: WisdomOptService;

  beforeEach(() => {
    opt = new WisdomOptService();
  });

  test('default is not opted in', () => {
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
  });

  test('optIn enables a workspace-role pair', () => {
    opt.optIn('wks_001', 'produtor');
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(true);
  });

  test('optOut disables a workspace-role pair', () => {
    opt.optIn('wks_001', 'produtor');
    opt.optOut('wks_001', 'produtor');
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
  });

  test('isWorkspaceOptedIn returns true when any role opted in', () => {
    opt.optIn('wks_001', 'produtor');
    expect(opt.isWorkspaceOptedIn('wks_001')).toBe(true);
  });

  test('optedInEntries returns only opted-in entries', () => {
    opt.optIn('wks_001', 'produtor');
    opt.optOut('wks_001', 'afiliado');
    opt.optIn('wks_002', 'gestor');
    const entries = opt.optedInEntries();
    expect(entries).toHaveLength(2);
  });

  test('remove deletes a workspace-role entry', () => {
    opt.optIn('wks_001', 'produtor');
    opt.remove('wks_001', 'produtor');
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
  });

  test('removeWorkspace deletes all entries for a workspace', () => {
    opt.optIn('wks_001', 'produtor');
    opt.optIn('wks_001', 'gestor');
    opt.optIn('wks_002', 'produtor');
    const removed = opt.removeWorkspace('wks_001');
    expect(removed).toBe(2);
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
    expect(opt.isOptedIn('wks_002', 'produtor')).toBe(true);
  });
});

describe('WISDOM-008 — Attribution Guard', () => {
  test('patternDescriptionIsClean passes for templated descriptions', () => {
    expect(patternDescriptionIsClean('Conversion rate averages 25% across 3 workspaces')).toBe(true);
    expect(patternDescriptionIsClean('Reply rate averages 70% across 5 workspaces')).toBe(true);
    expect(patternDescriptionIsClean('Lead volume pattern detected across 4 workspaces')).toBe(true);
  });

  test('patternDescriptionIsClean fails for descriptions with workspaceId-like tokens', () => {
    expect(patternDescriptionIsClean('Pattern for wks_001 shows high conversion')).toBe(false);
    expect(patternDescriptionIsClean('Pattern for lead_abc123 shows high conversion')).toBe(false);
    expect(patternDescriptionIsClean('email: test@test.com pattern')).toBe(false);
  });

  test('validateAttribution returns ok=true for clean patterns', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p1', description: 'Conversion rate averages 25%', applicableConditions: ['conversion_rate > 0'], evidenceWorkspacesCount: 3, confidence: 0.7, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    const result = validateAttribution(patterns);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('validateAttribution returns ok=false for patterns with PII', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p_leak', description: 'Pattern for wks_001 shows high conversion', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    const result = validateAttribution(patterns);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test('assertNoAttributionLeak throws on violation', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p_bad', description: 'Pattern contains lead_xyz in description', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    expect(() => assertNoAttributionLeak(patterns)).toThrow('Attribution guard failed');
  });

  test('assertNoAttributionLeak does not throw for clean patterns', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p_good', description: 'Conversion rate averages 25% across 3 workspaces', applicableConditions: ['conversion_rate > 0'], evidenceWorkspacesCount: 3, confidence: 0.7, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    expect(() => assertNoAttributionLeak(patterns)).not.toThrow();
  });

  test('validateAttribution checks applicableConditions too', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p1', description: 'Clean description', applicableConditions: ['wks_evil'], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    const result = validateAttribution(patterns);
    expect(result.ok).toBe(false);
  });
});
