import { ValenceTaggerService } from './valence-tagger.service';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { AttentionService } from './attention.service';
import { HebbianService } from './hebbian.service';
import {
  ConsolidationService,
  WorkingMemoryItem,
} from './consolidation.service';
import {
  MultiTimescaleCoordinator,
} from './multi-timescale.coordinator';
import { MindBackgroundProcessor } from './mind-bg.processor';
import type { SpineEventRef } from './mind.types';

const baseEvent = (over: Partial<SpineEventRef>): SpineEventRef => {
  const event: Record<string, unknown> = {
    eventId: over.eventId ?? `evt_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_demo',
    occurredAt: over.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over.truthMode ?? 'observed',
  };
  // Honor explicit `entityRef: undefined` (test wants no entityRef).
  if ('entityRef' in over) {
    if (over.entityRef !== undefined) {event['entityRef'] = over.entityRef;}
  } else {
    event['entityRef'] = { entityType: 'lead', entityId: 'lead_1' };
  }
  if (over.valence !== undefined) {event['valence'] = over.valence;}
  if (over.payload !== undefined) {event['payload'] = over.payload;}
  if (over.correlationId !== undefined) {event['correlationId'] = over.correlationId;}
  return event as SpineEventRef;
};

describe('ValenceTaggerService (UTP-MIND-VALENCE-001)', () => {
  const tagger = new ValenceTaggerService();

  it('tags a terminal event without valence with default valence', () => {
    const e = baseEvent({ eventName: 'commerce.payment.approved' });
    const tagged = tagger.tag(e);
    expect(tagged.valence).toBe('positive');
  });

  it('tags negative terminal correctly', () => {
    const e = baseEvent({ eventName: 'commerce.payment.refunded' });
    expect(tagger.tag(e).valence).toBe('negative');
  });

  it('tags post-sale satisfaction and repurchase terminals with honest defaults', () => {
    const satisfaction = baseEvent({ eventName: 'commerce.post_sale.satisfaction_signal_observed' });
    const repurchase = baseEvent({ eventName: 'commerce.post_sale.repurchase_window_opened' });
    expect(tagger.tag(satisfaction).valence).toBe('neutral');
    expect(tagger.tag(repurchase).valence).toBe('positive');
  });

  it('does not tag non-terminal events', () => {
    const e = baseEvent({ eventName: 'commerce.lead.contacted' });
    expect(tagger.tag(e).valence).toBeUndefined();
  });

  it('preserves existing valence', () => {
    const e = baseEvent({
      eventName: 'commerce.payment.approved',
      valence: 'ambiguous',
    });
    expect(tagger.tag(e).valence).toBe('ambiguous');
  });

  it('coverage = 100% when all terminals are tagged', () => {
    const events = [
      baseEvent({ eventName: 'commerce.payment.approved', valence: 'positive' }),
      baseEvent({ eventName: 'commerce.lead.contacted' }),
    ];
    expect(tagger.coverage(events).coveragePct).toBe(100);
  });

  it('coverage detects missing tags on terminals', () => {
    const events = [
      baseEvent({ eventName: 'commerce.payment.approved' }), // missing
      baseEvent({ eventName: 'commerce.payment.refunded', valence: 'negative' }),
    ];
    expect(tagger.coverage(events).coveragePct).toBe(50);
  });
});

describe('ValenceAggregatorService (UTP-MIND-VALENCE-002)', () => {
  const agg = new ValenceAggregatorService();
  const now = Date.parse('2026-05-13T22:00:00.000Z');

  it('returns neutral=1 mood when no events in window', () => {
    const m = agg.aggregate([], 24, now);
    expect(m.neutral).toBe(1);
    expect(m.positive).toBe(0);
  });

  it('aggregates positive vs negative correctly', () => {
    const events: SpineEventRef[] = [
      baseEvent({ valence: 'positive', occurredAt: '2026-05-13T20:00:00.000Z' }),
      baseEvent({ valence: 'positive', occurredAt: '2026-05-13T21:00:00.000Z' }),
      baseEvent({ valence: 'negative', occurredAt: '2026-05-13T21:30:00.000Z' }),
    ];
    const m = agg.aggregate(events, 24, now);
    expect(m.positive).toBeCloseTo(2 / 3, 2);
    expect(m.negative).toBeCloseTo(1 / 3, 2);
  });

  it('respects window cutoff', () => {
    const events: SpineEventRef[] = [
      baseEvent({ valence: 'positive', occurredAt: '2026-05-12T00:00:00.000Z' }),
    ];
    const m = agg.aggregate(events, 1, now);
    expect(m.neutral).toBe(1);
  });

  it('toRecentTrace caps and orders by recency', () => {
    const events: SpineEventRef[] = [
      baseEvent({ valence: 'positive', occurredAt: '2026-05-13T20:00:00.000Z', eventId: 'a' }),
      baseEvent({ valence: 'negative', occurredAt: '2026-05-13T21:00:00.000Z', eventId: 'b' }),
    ];
    const trace = agg.toRecentTrace(events, 5);
    expect(trace).toHaveLength(2);
    expect(trace[0]?.eventId).toBe('b');
  });
});

describe('AttentionService (UTP-MIND-ATT-001/002)', () => {
  const att = new AttentionService();
  const now = Date.parse('2026-05-13T22:00:00.000Z');

  it('returns empty when no entityRef', () => {
    const events = [baseEvent({ entityRef: undefined })];
    expect(att.computeCandidates(events, now)).toHaveLength(0);
  });

  it('ranks high-priority recent event above low-priority older', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.payment.declined',
        entityRef: { entityType: 'lead', entityId: 'hot' },
        occurredAt: '2026-05-13T21:55:00.000Z',
      }),
      baseEvent({
        eventName: 'commerce.whatsapp.message_received',
        entityRef: { entityType: 'lead', entityId: 'cold' },
        occurredAt: '2026-05-13T20:00:00.000Z',
      }),
    ];
    const cands = att.computeCandidates(events, now);
    expect(cands[0]?.targetId).toBe('hot');
  });

  it('focal is set when top weight crosses threshold', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.payment.charged_back',
        entityRef: { entityType: 'lead', entityId: 'urgent' },
        occurredAt: '2026-05-13T21:59:00.000Z',
      }),
    ];
    const a = att.allocate(events, { nowMs: now, focalThreshold: 0.5 });
    expect(a.focal?.targetId).toBe('urgent');
  });
});

describe('HebbianService (UTP-MIND-HEB-001/002)', () => {
  it('builds association between co-occurring events', () => {
    const heb = new HebbianService({ windowMs: 60_000 });
    heb.ingest([
      baseEvent({ eventName: 'commerce.lead.replied', occurredAt: '2026-05-13T20:00:00.000Z' }),
      baseEvent({
        eventName: 'commerce.crm.next_step_defined',
        occurredAt: '2026-05-13T20:00:30.000Z',
      }),
    ]);
    const assoc = heb.associationsFor('commerce.lead.replied');
    expect(assoc).toHaveLength(1);
    expect(assoc[0]?.b).toBe('commerce.crm.next_step_defined');
    expect(assoc[0]?.weight).toBeGreaterThan(0);
  });

  it('does not pair events outside the window', () => {
    const heb = new HebbianService({ windowMs: 5_000 });
    heb.ingest([
      baseEvent({ eventName: 'a.b.c', occurredAt: '2026-05-13T20:00:00.000Z' }),
      baseEvent({ eventName: 'd.e.f', occurredAt: '2026-05-13T20:01:00.000Z' }),
    ]);
    expect(heb.size()).toBe(0);
  });

  it('weights compound when same pair co-occurs multiple times', () => {
    const heb = new HebbianService({ windowMs: 60_000 });
    for (let i = 0; i < 5; i += 1) {
      const t = `2026-05-13T20:0${i}:00.000Z`;
      const t2 = `2026-05-13T20:0${i}:30.000Z`;
      heb.ingest([
        baseEvent({ eventName: 'a.b.c', occurredAt: t, eventId: `a${i}` }),
        baseEvent({ eventName: 'd.e.f', occurredAt: t2, eventId: `d${i}` }),
      ]);
    }
    const top = heb.top();
    expect(top).toHaveLength(1);
    expect(top[0]?.coOccurrenceCount).toBeGreaterThan(1);
  });

  it('decay reduces weight over time', () => {
    const heb = new HebbianService({ windowMs: 60_000, decayPerHour: 0.5 });
    heb.ingest([
      baseEvent({ eventName: 'x.y.z', occurredAt: '2026-05-13T20:00:00.000Z' }),
      baseEvent({ eventName: 'p.q.r', occurredAt: '2026-05-13T20:00:30.000Z' }),
    ]);
    const wBefore = heb.top()[0]?.weight ?? 0;
    heb.decay(new Date('2026-05-13T22:00:00.000Z'), new Date('2026-05-13T20:00:00.000Z'));
    const wAfter = heb.top()[0]?.weight ?? 0;
    expect(wAfter).toBeLessThan(wBefore);
  });
});

describe('ConsolidationService (UTP-MIND-CONS-001/002)', () => {
  const cons = new ConsolidationService();

  function buildEvents(): readonly SpineEventRef[] {
    return [
      baseEvent({ eventId: 'e1', eventName: 'commerce.lead.replied', valence: 'positive' }),
      baseEvent({ eventId: 'e2', eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
    ];
  }

  it('proposes nothing when working memory is empty', () => {
    const cycle = cons.runCycle({ workingMemory: [], recentEvents: buildEvents() });
    expect(cycle.episodicProposals).toHaveLength(0);
  });

  it('proposes episode when working item references >=2 events', () => {
    const wm: WorkingMemoryItem[] = [
      {
        itemId: 'item1',
        kind: 'fact',
        content: 'lead reagiu mas levantou objeção de preço',
        addedAt: '2026-05-13T20:00:00.000Z',
        relatedEventIds: ['e1', 'e2'],
      },
    ];
    const cycle = cons.runCycle({ workingMemory: wm, recentEvents: buildEvents() });
    expect(cycle.episodicProposals).toHaveLength(1);
    expect(cycle.episodicProposals[0]?.valenceMix.positive).toBe(1);
    expect(cycle.episodicProposals[0]?.valenceMix.negative).toBe(1);
  });

  it('proposes consolidated skill when >=3 episodes share a pattern', () => {
    const wm: WorkingMemoryItem[] = Array.from({ length: 3 }).map((_, i) => ({
      itemId: `item${i}`,
      kind: 'fact' as const,
      content: 'lead com objeção de preço',
      addedAt: '2026-05-13T20:00:00.000Z',
      relatedEventIds: ['e1', 'e2'],
    }));
    const cycle = cons.runCycle({ workingMemory: wm, recentEvents: buildEvents() });
    expect(cycle.consolidatedProposals.length).toBeGreaterThanOrEqual(1);
  });

  it('default mode is dry_run', () => {
    const cycle = cons.runCycle({ workingMemory: [], recentEvents: [] });
    expect(cycle.mode).toBe('dry_run');
  });
});

describe('MultiTimescaleCoordinator (UTP-MIND-MULTI-001)', () => {
  it('reports all due on first call after epoch (short/medium/long)', () => {
    const c = new MultiTimescaleCoordinator();
    const due = c.dueScales(60 * 60 * 24 * 1000);
    expect(due).toContain('short');
    expect(due).toContain('medium');
    expect(due).toContain('long');
  });

  it('after marking fired, scale is not due until interval elapses', () => {
    const c = new MultiTimescaleCoordinator();
    const t0 = 1_000_000_000;
    c.markFired('short', t0);
    expect(c.dueScales(t0 + 1_000).includes('short')).toBe(false);
    expect(c.dueScales(t0 + 6_000).includes('short')).toBe(true);
  });
});

describe('MindBackgroundProcessor (UTP-MIND-BG-001)', () => {
  it('fires due scales and updates hebbian size', () => {
    const coordinator = new MultiTimescaleCoordinator();
    const tagger = new ValenceTaggerService();
    void tagger;
    const aggregator = new ValenceAggregatorService();
    const hebbian = new HebbianService({ windowMs: 60_000 });
    const consolidation = new ConsolidationService();
    const proc = new MindBackgroundProcessor(
      coordinator,
      aggregator,
      hebbian,
      consolidation,
    );
    const events: SpineEventRef[] = [
      baseEvent({ eventName: 'commerce.lead.replied', occurredAt: '2026-05-13T20:00:00.000Z' }),
      baseEvent({
        eventName: 'commerce.crm.next_step_defined',
        occurredAt: '2026-05-13T20:00:30.000Z',
      }),
    ];
    const result = proc.tick({
      nowMs: Date.parse('2026-05-13T22:00:00.000Z'),
      recentEvents: events,
      workingMemory: [],
    });
    expect(result.firedScales).toContain('short');
    expect(result.hebbianAfterDecay).toBeGreaterThan(0);
  });
});
