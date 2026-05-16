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
