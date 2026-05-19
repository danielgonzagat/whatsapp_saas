import { ValenceAggregatorService } from './valence-aggregator.service';
import { SpineEventRef } from './mind.types';

function makeEvent(overrides: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: 'evt_001',
    eventName: 'commerce.payment.approved',
    occurredAt: new Date().toISOString(),
    truthMode: 'observed',
    ...overrides,
  };
}

describe('ValenceAggregatorService', () => {
  let service: ValenceAggregatorService;

  beforeEach(() => {
    service = new ValenceAggregatorService();
  });

  describe('aggregate', () => {
    it('returns neutral-only mood for empty events', () => {
      const result = service.aggregate([], 24);
      expect(result).toEqual({
        positive: 0,
        negative: 0,
        neutral: 1,
        ambiguous: 0,
        windowHours: 24,
      });
    });

    it('returns neutral-only mood when no events have valence', () => {
      const events = [
        makeEvent({ eventName: 'commerce.cart.created', valence: undefined }),
        makeEvent({ eventName: 'commerce.lead.contacted', valence: undefined }),
      ];
      const result = service.aggregate(events, 24);
      expect(result.neutral).toBe(1);
      expect(result.positive).toBe(0);
      expect(result.negative).toBe(0);
    });

    it('computes proportions for mixed valence events', () => {
      const now = Date.now();
      const events = [
        makeEvent({ eventId: 'evt_1', valence: 'positive', occurredAt: new Date(now - 1000).toISOString() }),
        makeEvent({ eventId: 'evt_2', valence: 'positive', occurredAt: new Date(now - 2000).toISOString() }),
        makeEvent({ eventId: 'evt_3', valence: 'negative', occurredAt: new Date(now - 3000).toISOString() }),
        makeEvent({ eventId: 'evt_4', valence: 'neutral', occurredAt: new Date(now - 4000).toISOString() }),
      ];
      const result = service.aggregate(events, 24, now);
      expect(result.positive).toBe(0.5);  // 2/4
      expect(result.negative).toBe(0.25); // 1/4
      expect(result.neutral).toBe(0.25);  // 1/4
      expect(result.ambiguous).toBe(0);
      expect(result.windowHours).toBe(24);
    });

    it('handles ambiguous valence', () => {
      const now = Date.now();
      const events = [
        makeEvent({ eventId: 'evt_1', valence: 'ambiguous', occurredAt: new Date(now - 1000).toISOString() }),
      ];
      const result = service.aggregate(events, 24, now);
      expect(result.ambiguous).toBe(1);
      expect(result.positive).toBe(0);
    });

    it('filters out events outside the time window', () => {
      const now = Date.now();
      const oneHourMs = 60 * 60 * 1000;
      const events = [
        makeEvent({ eventId: 'evt_1', valence: 'positive', occurredAt: new Date(now - oneHourMs).toISOString() }),
        makeEvent({ eventId: 'evt_2', valence: 'negative', occurredAt: new Date(now - 3 * oneHourMs).toISOString() }),
      ];
      // window of 2 hours — only evt_1 is inside
      const result = service.aggregate(events, 2, now);
      expect(result.positive).toBe(1);
      expect(result.negative).toBe(0);
      expect(result.neutral).toBe(0);
    });

    it('defaults nowMs to Date.now()', () => {
      const events = [
        makeEvent({
          eventId: 'evt_1',
          valence: 'positive',
          occurredAt: new Date().toISOString(),
        }),
      ];
      const result = service.aggregate(events, 24);
      expect(result.windowHours).toBe(24);
      expect(result.positive).toBe(1);
    });

    it('handles events with unparseable dates gracefully', () => {
      const events = [
        makeEvent({ eventId: 'evt_1', valence: 'positive', occurredAt: 'not-a-date' }),
      ];
      const result = service.aggregate(events, 24);
      // Event with bad date is filtered out
      expect(result.neutral).toBe(1);
      expect(result.positive).toBe(0);
    });
  });

  describe('toRecentTrace', () => {
    it('returns empty array for empty input', () => {
      expect(service.toRecentTrace([])).toEqual([]);
    });

    it('returns only events with valence, sorted by occurredAt desc', () => {
      const now = Date.now();
      const events = [
        makeEvent({ eventId: 'evt_1', valence: 'positive', occurredAt: new Date(now - 3000).toISOString() }),
        makeEvent({ eventId: 'evt_2', valence: undefined, occurredAt: new Date(now - 1000).toISOString() }),
        makeEvent({ eventId: 'evt_3', valence: 'negative', occurredAt: new Date(now - 2000).toISOString() }),
      ];
      const result = service.toRecentTrace(events);
      expect(result).toHaveLength(2);
      // Most recent first
      expect(result[0]!.eventId).toBe('evt_3');
      expect(result[0]!.valence).toBe('negative');
      expect(result[0]!.weight).toBe(1);
      expect(result[1]!.eventId).toBe('evt_1');
      expect(result[1]!.valence).toBe('positive');
    });

    it('caps results at the specified limit', () => {
      const now = Date.now();
      const events = Array.from({ length: 25 }, (_, i) =>
        makeEvent({
          eventId: `evt_${i}`,
          valence: 'positive',
          occurredAt: new Date(now - i * 1000).toISOString(),
        }),
      );
      const result = service.toRecentTrace(events, 10);
      expect(result).toHaveLength(10);
    });

    it('defaults cap to 20', () => {
      const now = Date.now();
      const events = Array.from({ length: 25 }, (_, i) =>
        makeEvent({
          eventId: `evt_${i}`,
          valence: 'positive',
          occurredAt: new Date(now - i * 1000).toISOString(),
        }),
      );
      const result = service.toRecentTrace(events);
      expect(result).toHaveLength(20);
    });
  });
});
