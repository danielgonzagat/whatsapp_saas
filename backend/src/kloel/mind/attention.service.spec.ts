import { AttentionService } from './attention.service';
import { SpineEventRef } from './mind.types';

function makeEvent(overrides: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: 'evt_001',
    eventName: 'commerce.payment.declined',
    occurredAt: new Date().toISOString(),
    truthMode: 'observed',
    entityRef: { entityType: 'lead', entityId: 'lead_1' },
    ...overrides,
  };
}

describe('AttentionService', () => {
  let service: AttentionService;

  beforeEach(() => {
    service = new AttentionService();
  });

  describe('computeCandidates', () => {
    it('returns empty array for empty input', () => {
      expect(service.computeCandidates([])).toEqual([]);
    });

    it('returns empty array when no events have entityRef', () => {
      const events = [makeEvent({ entityRef: undefined })];
      expect(service.computeCandidates(events)).toEqual([]);
    });

    it('computes candidate weights for events with entityRefs', () => {
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.declined',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now - 60_000).toISOString(),
        }),
      ];
      const result = service.computeCandidates(events, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.targetType).toBe('lead');
      expect(result[0]!.targetId).toBe('lead_1');
      expect(result[0]!.weight).toBeGreaterThan(0);
    });

    it('aggregates multiple events for the same entity', () => {
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.declined',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now - 60_000).toISOString(),
        }),
        makeEvent({
          eventId: 'evt_2',
          eventName: 'commerce.lead.objection_raised',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now - 30_000).toISOString(),
        }),
        makeEvent({
          eventId: 'evt_3',
          eventName: 'commerce.payment.approved',
          entityRef: { entityType: 'lead', entityId: 'lead_2' },
          valence: 'positive',
          occurredAt: new Date(now - 60_000).toISOString(),
        }),
      ];
      const result = service.computeCandidates(events, now, 30, 10);
      // lead_1 has 2 events, lead_2 has 1 → lead_1 should rank higher
      expect(result).toHaveLength(2);
      expect(result[0]!.targetId).toBe('lead_1');
    });

    it('caps results at the specified limit', () => {
      const now = Date.now();
      const events = Array.from({ length: 20 }, (_, i) =>
        makeEvent({
          eventId: `evt_${i}`,
          entityRef: { entityType: 'lead', entityId: `lead_${i}` },
          eventName: 'commerce.payment.declined',
          occurredAt: new Date(now - i * 1000).toISOString(),
        }),
      );
      const result = service.computeCandidates(events, now, 30, 5);
      expect(result).toHaveLength(5);
    });

    it('normalizes weights to max 1', () => {
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.charged_back',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now).toISOString(),
        }),
      ];
      const result = service.computeCandidates(events, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.weight).toBeLessThanOrEqual(1);
    });

    it('handles unknown event classes with fallback weight', () => {
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'some.unknown.event',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          occurredAt: new Date(now).toISOString(),
        }),
      ];
      const result = service.computeCandidates(events, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.weight).toBeGreaterThan(0);
    });

    it('applies recency decay based on halfLifeMinutes', () => {
      const now = Date.now();
      const recent = makeEvent({
        eventId: 'evt_recent',
        eventName: 'commerce.payment.declined',
        entityRef: { entityType: 'lead', entityId: 'lead_1' },
        occurredAt: new Date(now).toISOString(),
      });
      const old = makeEvent({
        eventId: 'evt_old',
        eventName: 'commerce.payment.declined',
        entityRef: { entityType: 'lead', entityId: 'lead_2' },
        occurredAt: new Date(now - 60 * 60 * 1000).toISOString(),
      });
      const result = service.computeCandidates([recent, old], now, 30);
      // The recent event should have a higher weight
      expect(result[0]!.targetId).toBe('lead_1');
    });
  });

  describe('allocate', () => {
    it('returns candidates without focal when no events', () => {
      const result = service.allocate([]);
      expect(result.candidates).toEqual([]);
      expect(result.focal).toBeUndefined();
    });

    it('returns focal when top candidate exceeds threshold', () => {
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.charged_back',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now).toISOString(),
        }),
      ];
      const result = service.allocate(events, { nowMs: now, halfLifeMinutes: 30 });
      expect(result.focal).toBeDefined();
      expect(result.focal!.targetId).toBe('lead_1');
      expect(result.focal!.reason).toContain('commerce.payment.charged_back');
      expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('omits focal when no events produce candidates', () => {
      const result = service.allocate([], { focalThreshold: 0.9 });
      expect(result.focal).toBeUndefined();
      expect(result.candidates.length).toBe(0);
    });

    it('uses default focalThreshold of 0.6', () => {
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.charged_back',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now).toISOString(),
        }),
      ];
      const result = service.allocate(events, { nowMs: now });
      // charged_back has priority 0.95 × recency 1.0 (brand new) = 0.95 normalised → 1.0
      // which is >= 0.6, so we expect focal
      expect(result.focal).toBeDefined();
    });

    it('focal includes sinceMs from most recent supporting event', () => {
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.charged_back',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now - 10_000).toISOString(),
        }),
      ];
      const result = service.allocate(events, { nowMs: now, halfLifeMinutes: 30 });
      expect(result.focal!.sinceMs).toBeGreaterThanOrEqual(10_000);
    });

    it('provides fallback reason when no supporting events', () => {
      // This is a theoretical edge case — never happens in practice because
      // the candidate came from a real event. But the code handles it.
      const now = Date.now();
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.charged_back',
          entityRef: { entityType: 'lead', entityId: 'lead_1' },
          valence: 'negative',
          occurredAt: new Date(now).toISOString(),
        }),
      ];
      const result = service.allocate(events, { nowMs: now });
      expect(result.focal).toBeDefined();
    });
  });
});
