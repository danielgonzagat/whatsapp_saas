import { ColdStartIngestionService } from './cold-start-ingestion.service';
import { PatternDetectorService } from './pattern-detector.service';
import { rankWOWInsights } from './insight-ranker';
import { buildEvidence, buildEvidenceBundles } from './evidence-builder';
import { wowConfidenceFloor, filterAboveWOWFloor } from './confidence-floor';
import { FirstHourOrchestratorService } from './first-hour.orchestrator.service';
import type { SpineEventRef } from '../mind/mind.types';
import type { Insight } from '../insight/insight.types';
import type { RankedWOWInsight } from './wow.types';

const WKS = 'wks_wow_test';
const NOW = Date.parse('2026-05-13T22:00:00.000Z');

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  const defaults: Record<string, unknown> = {
    eventId: over?.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over?.eventName ?? 'commerce.lead.replied',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over?.truthMode ?? ('observed' as const),
  };
  if (over?.entityRef !== undefined) {
    defaults['entityRef'] = over.entityRef;
  }
  if (over?.valence !== undefined) {
    defaults['valence'] = over.valence;
  }
  if (over?.payload !== undefined) {
    defaults['payload'] = over.payload;
  }
  return defaults as SpineEventRef;
}

function makeInsight(over?: Partial<Insight>): Insight {
  return {
    insightId: over?.insightId ?? 'i_test',
    kind: over?.kind ?? 'funnel_bottleneck',
    description: over?.description ?? 'test description',
    evidence: over?.evidence ?? ['e1', 'e2'],
    estimatedFinancialImpactCents: over?.estimatedFinancialImpactCents ?? 100_00,
    confidence: over?.confidence ?? 0.7,
    recommendedChannel: over?.recommendedChannel ?? 'dashboard',
    recommendedTiming: over?.recommendedTiming ?? 'weekly',
    workspaceId: over?.workspaceId ?? WKS,
    truthMode: over?.truthMode ?? 'inferred',
    generatedAt: over?.generatedAt ?? new Date(NOW).toISOString(),
  };
}

function makeRanked(over?: Partial<Insight>): RankedWOWInsight {
  const i = makeInsight(over);
  const product = i.estimatedFinancialImpactCents * i.confidence;
  return {
    ...i,
    impactConfidenceProduct: product,
    wowUrgency: 'first_session',
    wowDeliveryPriority: 2000 + product,
  };
}

// =========================================================================
// UTP-WOW-001 — Cold-Start Ingestion
// =========================================================================
describe('UTP-WOW-001 — ColdStartIngestionService', () => {
  const service = new ColdStartIngestionService();

  it('ingests events filtered by workspaceId', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created', workspaceId: WKS }),
      ev({ eventName: 'commerce.lead.replied', workspaceId: 'wks_other' }),
      ev({ eventName: 'commerce.lead.converted', workspaceId: WKS }),
    ];

    const result = service.ingest({ events, workspaceId: WKS, nowMs: NOW });
    expect(result.totalEventCount).toBe(2);
    expect(result.workspaceId).toBe(WKS);
    expect(result.eventKinds).toContain('commerce.lead.created');
    expect(result.eventKinds).toContain('commerce.lead.converted');
  });

  it('ingests events with no workspaceId filter on events (allow un-scoped)', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created', workspaceId: undefined }),
      ev({ eventName: 'commerce.lead.replied', workspaceId: undefined }),
    ];

    const result = service.ingest({ events, workspaceId: WKS, nowMs: NOW });
    expect(result.totalEventCount).toBe(2);
  });

  it('excludes events outside the observation window', () => {
    const oldDate = new Date(NOW - 200 * 86_400_000).toISOString();
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created', occurredAt: oldDate }),
      ev({ eventName: 'commerce.lead.replied' }),
    ];

    const result = service.ingest({
      events,
      workspaceId: WKS,
      nowMs: NOW,
      windowDays: 90,
    });
    expect(result.totalEventCount).toBe(1);
  });

  it('returns empty ingestion when no events match (no-history mode)', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created', workspaceId: 'wks_other' }),
    ];

    const result = service.ingest({ events, workspaceId: WKS, nowMs: NOW });
    expect(result.totalEventCount).toBe(0);
    expect(result.eventKinds).toEqual([]);
  });

  it('deduplicates event kinds in the listing', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.replied' }),
    ];

    const result = service.ingest({ events, workspaceId: WKS, nowMs: NOW });
    expect(result.eventKinds.length).toBe(2);
  });
});

// =========================================================================
// UTP-WOW-002 — Pattern Detector
// =========================================================================
describe('UTP-WOW-002 — PatternDetectorService', () => {
  const service = new PatternDetectorService();

  it('detects patterns from an ingestion with lead events', () => {
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 20; i++) {
      events.push(ev({ eventName: 'commerce.lead.created' }));
    }
    for (let i = 0; i < 15; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.contacted',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }
    for (let i = 0; i < 10; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.replied',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.qualified',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.converted',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
          valence: 'positive',
        }),
      );
    }

    const ingestion = {
      workspaceId: WKS,
      events,
      ingestedAt: new Date(NOW).toISOString(),
      totalEventCount: events.length,
      eventKinds: [...new Set(events.map((e) => e.eventName))],
    };

    const pattern = service.detect(ingestion);
    expect(pattern.workspaceId).toBe(WKS);
    expect(pattern.maturityVerdict).toBeDefined();
    expect(pattern.maturityVerdict.stage).toBeDefined();
    expect(pattern.insights.length).toBeGreaterThanOrEqual(0);
    expect(pattern.detectedAt).toBeDefined();
  });

  it('detects patterns from empty ingestion (no-history mode)', () => {
    const ingestion = {
      workspaceId: WKS,
      events: [] as readonly SpineEventRef[],
      ingestedAt: new Date(NOW).toISOString(),
      totalEventCount: 0,
      eventKinds: [] as readonly string[],
    };

    const pattern = service.detect(ingestion);
    expect(pattern.workspaceId).toBe(WKS);
    expect(pattern.maturityVerdict.stage).toBe('validacao');
    expect(pattern.insights).toEqual([]);
  });
});

// =========================================================================
// UTP-WOW-003 — Insight Ranker
// =========================================================================
describe('UTP-WOW-003 — rankWOWInsights', () => {
  it('ranks insights by impact-confidence product', () => {
    const insights: Insight[] = [
      makeInsight({
        insightId: 'low',
        estimatedFinancialImpactCents: 100_00,
        confidence: 0.3,
      }),
      makeInsight({
        insightId: 'high',
        estimatedFinancialImpactCents: 1000_00,
        confidence: 0.9,
      }),
    ];

    const ranked = rankWOWInsights(insights, 'crescimento');
    expect(ranked[0]?.insightId).toBe('high');
    expect(ranked[1]?.insightId).toBe('low');
  });

  it('assigns wowUrgency based on impact and maturity stage', () => {
    const insights: Insight[] = [
      makeInsight({
        insightId: 'big',
        estimatedFinancialImpactCents: 200_00,
        confidence: 0.9,
      }),
    ];

    const ranked = rankWOWInsights(insights, 'validacao');
    expect(ranked[0]?.wowUrgency).toBeDefined();
    expect(['immediate', 'first_session', 'first_week']).toContain(ranked[0]?.wowUrgency);
  });

  it('returns empty array for empty input', () => {
    const ranked = rankWOWInsights([], 'validacao');
    expect(ranked).toEqual([]);
  });
});

// =========================================================================
// UTP-WOW-004 — Evidence Builder
// =========================================================================
describe('UTP-WOW-004 — Evidence Builder', () => {
  it('builds evidence bundle from ranked insight', () => {
    const insight = makeRanked({
      insightId: 'ev_test',
      evidence: ['fact a', 'fact b', 'fact c'],
    });

    const bundle = buildEvidence(insight);
    expect(bundle.insight.insightId).toBe('ev_test');
    expect(bundle.evidenceItems.length).toBe(3);
    expect(bundle.totalEvidenceWeight).toBeGreaterThan(0);
    expect(bundle.evidenceItems[0]?.provenance.processor).toBe('wow-evidence-builder');
    expect(bundle.evidenceItems[0]?.truthMode).toBe('inferred');
  });

  it('assigns decreasing weight to later evidence items', () => {
    const insight = makeRanked({ evidence: ['a', 'b', 'c'] });
    const bundle = buildEvidence(insight);
    const weights = bundle.evidenceItems.map((e) => e.weight);
    expect(weights[0]).toBeGreaterThan(weights[1]!);
    expect(weights[1]).toBeGreaterThan(weights[2]!);
  });

  it('buildEvidenceBundles returns same number of bundles as insights', () => {
    const insights = [makeRanked({ insightId: 'a' }), makeRanked({ insightId: 'b' })];
    const bundles = buildEvidenceBundles(insights);
    expect(bundles.length).toBe(2);
    expect(bundles[0]?.insight.insightId).toBe('a');
    expect(bundles[1]?.insight.insightId).toBe('b');
  });
});

// =========================================================================
// UTP-WOW-005 — Confidence Floor
// =========================================================================
describe('UTP-WOW-005 — Confidence Floor', () => {
  it('passes insights above the default floor', () => {
    const insight = makeRanked({
      kind: 'offer_fit',
      confidence: 0.5,
    });
    const verdict = wowConfidenceFloor(insight);
    expect(verdict.pass).toBe(true);
  });

  it('blocks insights below the per-kind floor', () => {
    const insight = makeRanked({
      kind: 'pricing_elasticity',
      confidence: 0.2,
    });
    const verdict = wowConfidenceFloor(insight);
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain('below floor');
    expect(verdict.effectiveFloor).toBe(0.45);
  });

  it('blocks insights below default floor for unknown kinds', () => {
    const insight = makeRanked({
      kind: 'funnel_bottleneck',
      confidence: 0.1,
    });
    const verdict = wowConfidenceFloor(insight);
    expect(verdict.pass).toBe(false);
  });

  it('filterAboveWOWFloor separates passed and blocked', () => {
    const insights: RankedWOWInsight[] = [
      makeRanked({ insightId: 'good', confidence: 0.9 }),
      makeRanked({ insightId: 'bad', confidence: 0.1 }),
    ];

    const { passed, blocked, blockedReasons } = filterAboveWOWFloor(insights);
    expect(passed.length).toBe(1);
    expect(passed[0]?.insightId).toBe('good');
    expect(blocked.length).toBe(1);
    expect(blocked[0]?.insightId).toBe('bad');
    expect(blockedReasons.length).toBe(1);
  });
});

// =========================================================================
// UTP-WOW-006 — First-Hour Orchestrator
// =========================================================================
describe('UTP-WOW-006 — FirstHourOrchestratorService', () => {
  const service = new FirstHourOrchestratorService(
    new ColdStartIngestionService(),
    new PatternDetectorService(),
  );

  it('orchestrates the full first-hour pipeline end-to-end', () => {
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 30; i++) {
      events.push(ev({ eventName: 'commerce.lead.created' }));
    }
    for (let i = 0; i < 20; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.contacted',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }
    for (let i = 0; i < 15; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.replied',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.qualified',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      events.push(
        ev({
          eventName: 'commerce.payment.approved',
          valence: 'positive',
          payload: { productId: 'prod_01', customerId: `c_${i}` },
        }),
      );
    }

    const outcome = service.orchestrate({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(outcome.workspaceId).toBe(WKS);
    expect(outcome.ingestion.totalEventCount).toBe(events.length);
    expect(outcome.pattern.maturityVerdict.stage).toBeDefined();
    expect(outcome.orchestrationDurationMs).toBeGreaterThanOrEqual(0);
    expect(outcome.acknowledged).toBe(false);
    expect(outcome.ingestion).toBeDefined();
    expect(outcome.pattern).toBeDefined();
  });

  it('acknowledge flips the acknowledged flag', () => {
    const outcome = service.orchestrate({
      events: [ev({ eventName: 'commerce.lead.created' })],
      workspaceId: WKS,
      nowMs: NOW,
    });

    const acked = service.acknowledge(outcome);
    expect(acked.acknowledged).toBe(true);
    expect(acked.workspaceId).toBe(outcome.workspaceId);
  });

  it('caps delivered insights to MAX_FIRST_HOUR_INSIGHTS', () => {
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 60; i++) {
      events.push(ev({ eventName: 'commerce.lead.created' }));
    }
    for (let i = 0; i < 50; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.contacted',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }
    for (let i = 0; i < 40; i++) {
      events.push(
        ev({
          eventName: 'commerce.lead.replied',
          entityRef: { entityType: 'lead', entityId: `l_${i}` },
        }),
      );
    }

    const outcome = service.orchestrate({
      events,
      workspaceId: WKS,
      nowMs: NOW,
      maxInsights: 3,
    });

    expect(outcome.deliveredEvidence.length).toBeLessThanOrEqual(3);
  });

  it('handles empty events (no-history mode)', () => {
    const outcome = service.orchestrate({
      events: [],
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(outcome.workspaceId).toBe(WKS);
    expect(outcome.ingestion.totalEventCount).toBe(0);
    expect(outcome.pattern.maturityVerdict.stage).toBe('validacao');
    expect(outcome.deliveredEvidence).toEqual([]);
  });
});
