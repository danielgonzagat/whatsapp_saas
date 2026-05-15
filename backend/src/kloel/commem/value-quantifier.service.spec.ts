import { CommemLedgerService } from './ledger.service';
import { MemoryProjector } from './memory.projector';
import { ExporterService } from './exporter.service';
import { AttributionGuard } from './attribution.guard';
import { CommemExporterService } from './commem-exporter.service';
import { ValueQuantifierService } from './value-quantifier.service';
import type { SpineEventRef } from '../mind/mind.types';

let seq = 0;
function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAtMs: number,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  seq++;
  return {
    eventId: `evt_${String(seq).padStart(5, '0')}`,
    eventName,
    workspaceId,
    occurredAt: new Date(occurredAtMs).toISOString(),
    truthMode: 'observed',
    ...overrides,
  };
}

function nowMs(): number {
  return Date.now();
}

function buildExporter(): CommemExporterService {
  return new CommemExporterService(
    new CommemLedgerService(),
    new MemoryProjector(),
    new ExporterService(),
    new AttributionGuard(),
  );
}

describe('ValueQuantifierService', () => {
  let svc: ValueQuantifierService;
  let expSvc: CommemExporterService;

  beforeEach(() => {
    svc = new ValueQuantifierService();
    expSvc = buildExporter();
    seq = 0;
  });

  test('quantifies value from exported memory with payment events', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];

    const exported = expSvc.exportAggregated('ws_alpha', events);
    const estimate = svc.quantifyFromMemory('ws_alpha', exported);

    expect(estimate.workspaceId).toBe('ws_alpha');
    expect(estimate.sourceEventCount).toBe(2);
    expect(estimate.totalEstimatedCents).toBeGreaterThan(0);
  });

  test('LTV inference from payment approved events adds capital', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];

    const exported = expSvc.exportAggregated('ws_alpha', events);
    const estimate = svc.quantifyFromMemory('ws_alpha', exported);

    expect(estimate.breakdown.inferredLtvCents).toBe(15000);
    expect(estimate.totalEstimatedCents).toBeGreaterThan(15000);
  });

  test('LTV inference from CRM deal_won events', () => {
    const events = [
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs()),
    ];

    const exported = expSvc.exportAggregated('ws_alpha', events);
    const estimate = svc.quantifyFromMemory('ws_alpha', exported);

    expect(estimate.breakdown.inferredLtvCents).toBe(10000);
    expect(estimate.totalEstimatedCents).toBeGreaterThan(10000);
  });

  test('confirmed insights from belief_updated events', () => {
    const events = [
      makeEvent('cognition.belief_updated', 'ws_alpha', nowMs()),
      makeEvent('cognition.belief_updated', 'ws_alpha', nowMs()),
    ];

    const exported = expSvc.exportAggregated('ws_alpha', events);
    const estimate = svc.quantifyFromMemory('ws_alpha', exported);

    expect(estimate.breakdown.confirmedInsightsCents).toBe(2000);
  });

  test('discovery detection from surprise_observed events', () => {
    const events = [
      makeEvent('cognition.surprise_observed', 'ws_alpha', nowMs()),
      makeEvent('cognition.surprise_observed', 'ws_alpha', nowMs()),
    ];

    const exported = expSvc.exportAggregated('ws_alpha', events);
    const estimate = svc.quantifyFromMemory('ws_alpha', exported);

    expect(estimate.breakdown.discoveriesCents).toBe(4000);
  });

  test('returns zero total for empty exported memory', () => {
    const exported = expSvc.exportAggregated('ws_empty', []);
    const estimate = svc.quantifyFromMemory('ws_empty', exported);

    expect(estimate.sourceEventCount).toBe(0);
    expect(estimate.totalEstimatedCents).toBe(0);
    expect(estimate.breakdown.inferredLtvCents).toBe(0);
    expect(estimate.breakdown.confirmedInsightsCents).toBe(0);
    expect(estimate.breakdown.discoveriesCents).toBe(0);
    expect(estimate.breakdown.baseCapitalCents).toBe(0);
  });

  test('handles workspace isolation — only own workspace events counted', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_a', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_b', nowMs()),
    ];

    const exported = expSvc.exportAggregated('ws_a', events);
    const estimate = svc.quantifyFromMemory('ws_a', exported);

    expect(estimate.sourceEventCount).toBe(1);
    expect(estimate.breakdown.inferredLtvCents).toBe(5000);
  });

  test('composite value includes LTV, insights, discoveries and base capital', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs()),
      makeEvent('cognition.belief_updated', 'ws_alpha', nowMs()),
      makeEvent('cognition.surprise_observed', 'ws_alpha', nowMs()),
    ];

    const exported = expSvc.exportAggregated('ws_alpha', events);
    const estimate = svc.quantifyFromMemory('ws_alpha', exported);

    expect(estimate.breakdown.inferredLtvCents).toBeGreaterThan(0);
    expect(estimate.breakdown.confirmedInsightsCents).toBeGreaterThan(0);
    expect(estimate.breakdown.discoveriesCents).toBeGreaterThan(0);
    expect(estimate.breakdown.baseCapitalCents).toBeGreaterThan(0);
    expect(estimate.totalEstimatedCents).toBeGreaterThan(
      estimate.breakdown.inferredLtvCents,
    );
  });

  test('value scales with more payment events (monotonic)', () => {
    const events1 = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];
    const events2 = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];

    const exported1 = expSvc.exportAggregated('ws_alpha', events1);
    const exported2 = expSvc.exportAggregated('ws_alpha', events2);

    const e1 = svc.quantifyFromMemory('ws_alpha', exported1);
    const e2 = svc.quantifyFromMemory('ws_alpha', exported2);

    expect(e2.totalEstimatedCents).toBeGreaterThan(e1.totalEstimatedCents);
  });

  test('positive-valence events contribute more value', () => {
    const neutralEvents = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs(), {
        valence: undefined,
      }),
    ];
    const positiveEvents = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs(), {
        valence: 'positive',
      }),
    ];

    const exportedNeutral = expSvc.exportAggregated('ws_alpha', neutralEvents);
    const exportedPositive = expSvc.exportAggregated(
      'ws_alpha',
      positiveEvents,
    );

    const neutral = svc.quantifyFromMemory('ws_alpha', exportedNeutral);
    const positive = svc.quantifyFromMemory('ws_alpha', exportedPositive);

    expect(positive.breakdown.inferredLtvCents).toBeGreaterThan(
      neutral.breakdown.inferredLtvCents,
    );
  });

  test('negative-valence events reduce value', () => {
    const neutralEvents = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs(), {
        valence: undefined,
      }),
    ];
    const negativeEvents = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs(), {
        valence: 'negative',
      }),
    ];

    const exportedNeutral = expSvc.exportAggregated('ws_alpha', neutralEvents);
    const exportedNegative = expSvc.exportAggregated(
      'ws_alpha',
      negativeEvents,
    );

    const neutral = svc.quantifyFromMemory('ws_alpha', exportedNeutral);
    const negative = svc.quantifyFromMemory('ws_alpha', exportedNegative);

    expect(negative.breakdown.inferredLtvCents).toBeLessThan(
      neutral.breakdown.inferredLtvCents,
    );
  });

  test('knowledge maturity multiplier affects total positively', () => {
    const observedEvents = Array.from({ length: 20 }, (_, i) =>
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs() - i * 1000, {
        truthMode: 'observed',
      }),
    );

    const exported = expSvc.exportAggregated('ws_alpha', observedEvents);
    const estimate = svc.quantifyFromMemory('ws_alpha', exported);

    expect(estimate.knowledgeMaturityMultiplier).toBeGreaterThan(0.4);
    expect(estimate.totalEstimatedCents).toBeGreaterThan(0);
  });

  test('multiple workspaces produce independent values', () => {
    const eventsA = [
      makeEvent('commerce.payment.approved', 'ws_a', nowMs()),
    ];
    const eventsB = [
      makeEvent('commerce.payment.approved', 'ws_b', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_b', nowMs()),
    ];

    const exportedA = expSvc.exportAggregated('ws_a', eventsA);
    const exportedB = expSvc.exportAggregated('ws_b', eventsB);

    const estA = svc.quantifyFromMemory('ws_a', exportedA);
    const estB = svc.quantifyFromMemory('ws_b', exportedB);

    expect(estA.workspaceId).toBe('ws_a');
    expect(estB.workspaceId).toBe('ws_b');
    expect(estB.totalEstimatedCents).toBeGreaterThan(estA.totalEstimatedCents);
  });

  test('valueDelta computes correct delta between snapshots', () => {
    const beforeEvents = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];
    const afterEvents = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs()),
      makeEvent('cognition.belief_updated', 'ws_alpha', nowMs()),
    ];

    const exportedBefore = expSvc.exportAggregated('ws_alpha', beforeEvents);
    const exportedAfter = expSvc.exportAggregated('ws_alpha', afterEvents);

    const before = svc.quantifyFromMemory('ws_alpha', exportedBefore);
    const after = svc.quantifyFromMemory('ws_alpha', exportedAfter);

    const delta = svc.valueDelta(before, after);

    expect(delta.workspaceId).toBe('ws_alpha');
    expect(delta.eventCountDelta).toBe(2);
    expect(delta.ltvDelta).toBeGreaterThan(0);
    expect(delta.totalDelta).toBeGreaterThan(0);
  });

  test('quantifyFromEvents works directly with event arrays', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs()),
      makeEvent('cognition.belief_updated', 'ws_alpha', nowMs()),
      makeEvent('cognition.surprise_observed', 'ws_alpha', nowMs()),
    ];

    const estimate = svc.quantifyFromEvents('ws_alpha', events);

    expect(estimate.workspaceId).toBe('ws_alpha');
    expect(estimate.sourceEventCount).toBe(4);
    expect(estimate.breakdown.inferredLtvCents).toBeGreaterThan(0);
    expect(estimate.breakdown.confirmedInsightsCents).toBeGreaterThan(0);
    expect(estimate.breakdown.discoveriesCents).toBeGreaterThan(0);
    expect(estimate.totalEstimatedCents).toBeGreaterThan(0);
  });

  test('commercial capital grows as domain diversity increases', () => {
    const fewDomains = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];
    const manyDomains = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs()),
      makeEvent('commerce.lead.converted', 'ws_alpha', nowMs()),
      makeEvent('commerce.post_sale.first_value_obtained', 'ws_alpha', nowMs()),
      makeEvent('cognition.belief_updated', 'ws_alpha', nowMs()),
      makeEvent('cognition.surprise_observed', 'ws_alpha', nowMs()),
    ];

    const exportedFew = expSvc.exportAggregated('ws_alpha', fewDomains);
    const exportedMany = expSvc.exportAggregated('ws_alpha', manyDomains);

    const few = svc.quantifyFromMemory('ws_alpha', exportedFew);
    const many = svc.quantifyFromMemory('ws_alpha', exportedMany);

    expect(many.distinctDomains).toBeGreaterThan(few.distinctDomains);
    expect(many.totalEstimatedCents).toBeGreaterThan(few.totalEstimatedCents);
  });
});
