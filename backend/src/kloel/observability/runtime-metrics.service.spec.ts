import { RuntimeMetricsService, type RuntimeMetricsSnapshot } from './runtime-metrics.service';
import type { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventEnvelope } from '../spine/spine-event.types';

function makeEnvelope(overrides: Partial<SpineEventEnvelope> = {}): SpineEventEnvelope {
  return {
    eventId: 'evt_test',
    eventName: 'commerce.lead.replied',
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    truthMode: 'observed',
    provenance: {
      source: 'production',
      processor: 'test',
      processorVersion: '1.0.0',
      schemaVersion: '1.0.0',
      environment: 'dev',
    },
    ...overrides,
  };
}

function makeSpine(): { spine: SpineEmitterService; emitAll: (events: SpineEventEnvelope[]) => void } {
  const subscribers: Array<(e: SpineEventEnvelope) => void> = [];
  const spine = {
    subscribe: jest.fn((handler: (e: SpineEventEnvelope) => void) => {
      subscribers.push(handler);
      const unsub = () => {
        const idx = subscribers.indexOf(handler);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
      return unsub;
    }),
  } as unknown as SpineEmitterService;
  return {
    spine,
    emitAll: (events: SpineEventEnvelope[]) => {
      for (const handler of subscribers) {
        for (const event of events) {
          handler(event);
        }
      }
    },
  };
}

describe('RuntimeMetricsService', () => {
  let service: RuntimeMetricsService;

  beforeEach(() => {
    service = new RuntimeMetricsService();
  });

  describe('getMetrics fresh service', () => {
    it('returns all counters at zero with zero ratios', () => {
      const metrics = service.getMetrics();
      expect(metrics).toEqual({
        operationsTotal: 0,
        spineEventsTotal: 0,
        valenceTaggedEventsTotal: 0,
        gateChecksTotal: 0,
        gateFailsTotal: 0,
        eventsToOperationsRatio: 0,
        valenceCoveragePct: 0,
      } satisfies RuntimeMetricsSnapshot);
    });
  });

  describe('incrementOperations', () => {
    it('increments operationsTotal by 1 with default delta', () => {
      service.incrementOperations();
      expect(service.getMetrics().operationsTotal).toBe(1);
    });

    it('increments operationsTotal by custom positive delta', () => {
      service.incrementOperations(5);
      expect(service.getMetrics().operationsTotal).toBe(5);
    });

    it('accumulates across multiple calls', () => {
      service.incrementOperations(3);
      service.incrementOperations(2);
      service.incrementOperations();
      expect(service.getMetrics().operationsTotal).toBe(6);
    });

    it('ignores zero delta', () => {
      service.incrementOperations(0);
      expect(service.getMetrics().operationsTotal).toBe(0);
    });

    it('ignores negative delta', () => {
      service.incrementOperations(-1);
      expect(service.getMetrics().operationsTotal).toBe(0);
    });
  });

  describe('incrementGateCheck', () => {
    it('increments gateChecksTotal but not gateFailsTotal when passed is true', () => {
      service.incrementGateCheck(true);
      const metrics = service.getMetrics();
      expect(metrics.gateChecksTotal).toBe(1);
      expect(metrics.gateFailsTotal).toBe(0);
    });

    it('increments both gateChecksTotal and gateFailsTotal when passed is false', () => {
      service.incrementGateCheck(false);
      const metrics = service.getMetrics();
      expect(metrics.gateChecksTotal).toBe(1);
      expect(metrics.gateFailsTotal).toBe(1);
    });

    it('accumulates mixed pass and fail gate checks', () => {
      service.incrementGateCheck(true);
      service.incrementGateCheck(false);
      service.incrementGateCheck(true);
      service.incrementGateCheck(false);
      service.incrementGateCheck(false);
      const metrics = service.getMetrics();
      expect(metrics.gateChecksTotal).toBe(5);
      expect(metrics.gateFailsTotal).toBe(3);
    });

    it('gateFailsTotal never exceeds gateChecksTotal', () => {
      for (let i = 0; i < 50; i++) {
        service.incrementGateCheck(i % 3 === 0);
      }
      const metrics = service.getMetrics();
      expect(metrics.gateFailsTotal).toBeLessThanOrEqual(metrics.gateChecksTotal);
    });
  });

  describe('subscribeToSpine', () => {
    it('auto-increments spineEventsTotal when spine emits events', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll([makeEnvelope(), makeEnvelope(), makeEnvelope()]);
      expect(service.getMetrics().spineEventsTotal).toBe(3);
    });

    it('auto-increments valenceTaggedEventsTotal when envelope carries valence', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll([
        makeEnvelope({ valence: 'positive' }),
        makeEnvelope({ valence: 'negative' }),
        makeEnvelope(),
        makeEnvelope({ valence: 'neutral' }),
      ]);
      expect(service.getMetrics().valenceTaggedEventsTotal).toBe(3);
    });

    it('does not increment valenceTaggedEventsTotal for events without valence', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll([makeEnvelope(), makeEnvelope()]);
      expect(service.getMetrics().valenceTaggedEventsTotal).toBe(0);
    });

    it('is idempotent — duplicate subscribe does not double-count', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      service.subscribeToSpine(spine);
      service.subscribeToSpine(spine);
      emitAll([makeEnvelope()]);
      expect(service.getMetrics().spineEventsTotal).toBe(1);
    });

    it('handles mixed events with and without valence', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll([
        makeEnvelope({ valence: 'positive' }),
        makeEnvelope(),
        makeEnvelope({ valence: 'negative' }),
        makeEnvelope(),
        makeEnvelope({ valence: 'ambiguous' }),
      ]);
      const metrics = service.getMetrics();
      expect(metrics.spineEventsTotal).toBe(5);
      expect(metrics.valenceTaggedEventsTotal).toBe(3);
    });
  });

  describe('getMetrics ratios', () => {
    it('computes eventsToOperationsRatio correctly when both counters > 0', () => {
      service.incrementOperations(10);
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll(Array.from({ length: 7 }, () => makeEnvelope()));
      const metrics = service.getMetrics();
      expect(metrics.eventsToOperationsRatio).toBe(0.7);
    });

    it('returns eventsToOperationsRatio = 0 when operationsTotal is 0', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll(Array.from({ length: 5 }, () => makeEnvelope()));
      const metrics = service.getMetrics();
      expect(metrics.operationsTotal).toBe(0);
      expect(metrics.eventsToOperationsRatio).toBe(0);
    });

    it('computes valenceCoveragePct correctly when both counters > 0', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll([
        makeEnvelope({ valence: 'positive' }),
        makeEnvelope({ valence: 'negative' }),
        makeEnvelope({ valence: 'neutral' }),
        makeEnvelope(),
      ]);
      const metrics = service.getMetrics();
      expect(metrics.valenceCoveragePct).toBe(75);
    });

    it('returns valenceCoveragePct = 0 when spineEventsTotal is 0', () => {
      expect(service.getMetrics().valenceCoveragePct).toBe(0);
    });

    it('returns valenceCoveragePct = 100 when all events have valence', () => {
      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll([
        makeEnvelope({ valence: 'positive' }),
        makeEnvelope({ valence: 'neutral' }),
        makeEnvelope({ valence: 'ambiguous' }),
      ]);
      expect(service.getMetrics().valenceCoveragePct).toBe(100);
    });
  });

  describe('full lifecycle integration', () => {
    it('correctly tracks all metrics across mixed operations, events, and gates', () => {
      service.incrementOperations(20);
      service.incrementOperations(10);

      const { spine, emitAll } = makeSpine();
      service.subscribeToSpine(spine);
      emitAll(
        Array.from({ length: 12 }, (_, i) =>
          makeEnvelope(i % 2 === 0 ? { valence: 'positive' } : {}),
        ),
      );

      service.incrementGateCheck(true);
      service.incrementGateCheck(true);
      service.incrementGateCheck(false);
      service.incrementGateCheck(true);

      const metrics = service.getMetrics();
      expect(metrics.operationsTotal).toBe(30);
      expect(metrics.spineEventsTotal).toBe(12);
      expect(metrics.valenceTaggedEventsTotal).toBe(6);
      expect(metrics.gateChecksTotal).toBe(4);
      expect(metrics.gateFailsTotal).toBe(1);
      expect(metrics.eventsToOperationsRatio).toBe(0.4);
      expect(metrics.valenceCoveragePct).toBe(50);
    });
  });
});
