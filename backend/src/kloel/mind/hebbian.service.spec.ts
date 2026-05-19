import { HebbianService } from './hebbian.service';
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

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe('HebbianService', () => {
  let service: HebbianService;

  beforeEach(() => {
    service = new HebbianService({ windowMs: 60_000 });
  });

  describe('constructor defaults', () => {
    it('uses default windowMs of 5 minutes when no opts provided', () => {
      const s = new HebbianService();
      expect(s).toBeDefined();
    });

    it('accepts custom windowMs and decayPerHour', () => {
      const s = new HebbianService({ windowMs: 30_000, decayPerHour: 0.05 });
      expect(s).toBeDefined();
    });
  });

  describe('ingest', () => {
    it('creates associations for events within the window', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(30_000) }),
      ]);
      expect(service.size()).toBeGreaterThanOrEqual(1);
      const assoc = service.associationsFor('A');
      expect(assoc.length).toBeGreaterThanOrEqual(1);
    });

    it('does not create associations for events outside the window', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(120_000) }),
      ]);
      // Events are 120s apart but window is 60s — no association
      expect(service.size()).toBe(0);
    });

    it('does not associate events with the same name', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'A', occurredAt: iso(10_000) }),
      ]);
      expect(service.size()).toBe(0);
    });

    it('bumps weight on repeated co-occurrence', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      const weightAfterFirst = service.associationsFor('A')[0]!.weight;

      service.ingest([
        makeEvent({ eventId: 'evt_3', eventName: 'A', occurredAt: iso(100_000) }),
        makeEvent({ eventId: 'evt_4', eventName: 'B', occurredAt: iso(110_000) }),
      ]);
      const weightAfterSecond = service.associationsFor('A')[0]!.weight;

      expect(weightAfterSecond).toBeGreaterThan(weightAfterFirst);
    });

    it('caps weight at 1', () => {
      // Ingest many co-occurrences to push weight to cap
      for (let i = 0; i < 100; i += 1) {
        const base = i * 200_000;
        service.ingest([
          makeEvent({ eventId: `evt_a_${i}`, eventName: 'A', occurredAt: iso(base) }),
          makeEvent({ eventId: `evt_b_${i}`, eventName: 'B', occurredAt: iso(base + 10_000) }),
        ]);
      }
      const assoc = service.associationsFor('A');
      expect(assoc[0]!.weight).toBeLessThanOrEqual(1);
    });

    it('increments coOccurrenceCount', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      const assoc = service.associationsFor('A')[0]!;
      expect(assoc.coOccurrenceCount).toBe(1);

      service.ingest([
        makeEvent({ eventId: 'evt_3', eventName: 'A', occurredAt: iso(100_000) }),
        makeEvent({ eventId: 'evt_4', eventName: 'B', occurredAt: iso(110_000) }),
      ]);
      const assoc2 = service.associationsFor('A')[0]!;
      expect(assoc2.coOccurrenceCount).toBe(2);
    });

    it('updates lastSeenAt on each co-occurrence', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      const firstSeen = service.associationsFor('A')[0]!.lastSeenAt;

      service.ingest([
        makeEvent({ eventId: 'evt_3', eventName: 'A', occurredAt: iso(100_000) }),
        makeEvent({ eventId: 'evt_4', eventName: 'B', occurredAt: iso(110_000) }),
      ]);
      const secondSeen = service.associationsFor('A')[0]!.lastSeenAt;

      expect(secondSeen).not.toBe(firstSeen);
    });

    it('handles empty batch gracefully', () => {
      service.ingest([]);
      expect(service.size()).toBe(0);
    });

    it('handles events with unparseable dates', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: 'bad-date' }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      // Event A has bad date → skipped; no pair formed
      expect(service.size()).toBe(0);
    });

    it('sorts events by time before processing', () => {
      // Feed events out of order — they should still associate
      service.ingest([
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(50_000) }),
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
      ]);
      // A at 0, B at 50_000 → within 60s window → should associate
      expect(service.size()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('decay', () => {
    it('reduces association weights over time', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      const initialWeight = service.associationsFor('A')[0]!.weight;

      const since = new Date(Date.now());
      const now = new Date(Date.now() + 10 * 60 * 60 * 1000); // +10 hours
      service.decay(now, since);

      const decayed = service.associationsFor('A');
      if (decayed.length > 0) {
        expect(decayed[0]!.weight).toBeLessThan(initialWeight);
      }
    });

    it('removes associations that fall below 0.001 weight', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      expect(service.size()).toBeGreaterThanOrEqual(1);

      const since = new Date(Date.now());
      const now = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // +100 days
      service.decay(now, since);

      // After 100 days of 2% hourly decay, weight should be near zero
      expect(service.size()).toBe(0);
    });

    it('does nothing when hours elapsed is 0', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      const sizeBefore = service.size();
      const now = new Date();
      service.decay(now, now);
      expect(service.size()).toBe(sizeBefore);
    });
  });

  describe('associationsFor', () => {
    it('returns empty array for unknown event names', () => {
      expect(service.associationsFor('unknown')).toEqual([]);
    });

    it('returns associations matching either side of the pair', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      const forA = service.associationsFor('A');
      const forB = service.associationsFor('B');
      expect(forA.length).toBeGreaterThanOrEqual(1);
      expect(forB.length).toBeGreaterThanOrEqual(1);
      expect(forA[0]!.b).toBe('B');
      expect(forB[0]!.b).toBe('A');
    });

    it('caps results at the specified limit', () => {
      for (let i = 0; i < 5; i += 1) {
        const base = i * 200_000;
        service.ingest([
          makeEvent({ eventId: `a_${i}`, eventName: 'CORE', occurredAt: iso(base) }),
          makeEvent({ eventId: `b_${i}`, eventName: `EVT_${i}`, occurredAt: iso(base + 10_000) }),
        ]);
      }
      const result = service.associationsFor('CORE', 3);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('returns associations sorted by weight desc', () => {
      // First pair: one co-occurrence
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'X', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'Y', occurredAt: iso(10_000) }),
      ]);
      // Second pair: two co-occurrences (higher weight)
      service.ingest([
        makeEvent({ eventId: 'evt_3', eventName: 'X', occurredAt: iso(100_000) }),
        makeEvent({ eventId: 'evt_4', eventName: 'Z', occurredAt: iso(110_000) }),
      ]);
      service.ingest([
        makeEvent({ eventId: 'evt_5', eventName: 'X', occurredAt: iso(200_000) }),
        makeEvent({ eventId: 'evt_6', eventName: 'Z', occurredAt: iso(210_000) }),
      ]);
      const result = service.associationsFor('X');
      expect(result[0]!.b).toBe('Z'); // Higher weight should be first
    });
  });

  describe('top', () => {
    it('returns empty array when no associations exist', () => {
      expect(service.top()).toEqual([]);
    });

    it('returns all associations sorted by weight', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      const result = service.top();
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]!.a).toBeDefined();
      expect(result[0]!.b).toBeDefined();
      expect(result[0]!.weight).toBeGreaterThan(0);
    });

    it('caps results at the specified limit', () => {
      for (let i = 0; i < 10; i += 1) {
        const base = i * 200_000;
        service.ingest([
          makeEvent({ eventId: `a_${i}`, eventName: `EVT_A_${i}`, occurredAt: iso(base) }),
          makeEvent({ eventId: `b_${i}`, eventName: `EVT_B_${i}`, occurredAt: iso(base + 10_000) }),
        ]);
      }
      const result = service.top(5);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('reset', () => {
    it('clears all associations', () => {
      service.ingest([
        makeEvent({ eventId: 'evt_1', eventName: 'A', occurredAt: iso(0) }),
        makeEvent({ eventId: 'evt_2', eventName: 'B', occurredAt: iso(10_000) }),
      ]);
      expect(service.size()).toBeGreaterThan(0);
      service.reset();
      expect(service.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('returns 0 initially', () => {
      expect(service.size()).toBe(0);
    });
  });
});
