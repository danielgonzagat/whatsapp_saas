import { RuntimeMetricsBootstrapService } from './runtime-metrics-bootstrap.service';
import { RuntimeMetricsService } from './runtime-metrics.service';
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
  } as SpineEmitterService;
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

describe('RuntimeMetricsBootstrapService', () => {
  describe('onModuleInit with spine present', () => {
    it('calls wireToSpine subscribing to the spine emitter', () => {
      const metrics = new RuntimeMetricsService();
      const { spine } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();

      expect(spine.subscribe).toHaveBeenCalledTimes(1);
    });

    it('increments spineEventsTotal when spine emits events after bootstrap', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      emitAll([makeEnvelope(), makeEnvelope(), makeEnvelope()]);

      expect(metrics.getMetrics().spineEventsTotal).toBe(3);
    });

    it('increments valenceTaggedEventsTotal when spine emits events with valence', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      emitAll([
        makeEnvelope({ valence: 'positive' }),
        makeEnvelope({ valence: 'negative' }),
        makeEnvelope(),
        makeEnvelope({ valence: 'neutral' }),
      ]);

      expect(metrics.getMetrics().valenceTaggedEventsTotal).toBe(3);
    });

    it('does not increment valenceTaggedEventsTotal for events without valence', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      emitAll([makeEnvelope(), makeEnvelope()]);

      expect(metrics.getMetrics().valenceTaggedEventsTotal).toBe(0);
    });

    it('computes valenceCoveragePct correctly after mixed-valence events', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      emitAll([
        makeEnvelope({ valence: 'positive' }),
        makeEnvelope({ valence: 'negative' }),
        makeEnvelope({ valence: 'neutral' }),
        makeEnvelope(),
      ]);

      expect(metrics.getMetrics().valenceCoveragePct).toBe(75);
    });

    it('returns valenceCoveragePct = 100 when every event carries valence', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      emitAll([
        makeEnvelope({ valence: 'positive' }),
        makeEnvelope({ valence: 'neutral' }),
        makeEnvelope({ valence: 'ambiguous' }),
      ]);

      expect(metrics.getMetrics().valenceCoveragePct).toBe(100);
    });

    it('wireToSpine is idempotent — duplicate onModuleInit does not double-count', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      bootstrap.onModuleInit();
      bootstrap.onModuleInit();

      emitAll([makeEnvelope()]);

      expect(metrics.getMetrics().spineEventsTotal).toBe(1);
    });

    it('accumulates spineEventsTotal correctly across multiple emits', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      emitAll([makeEnvelope(), makeEnvelope()]);
      emitAll([makeEnvelope()]);
      emitAll([makeEnvelope(), makeEnvelope(), makeEnvelope()]);

      expect(metrics.getMetrics().spineEventsTotal).toBe(6);
    });
  });

  describe('onModuleInit without spine', () => {
    it('does not crash when spineEmitter is absent', () => {
      const metrics = new RuntimeMetricsService();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics);

      expect(() => bootstrap.onModuleInit()).not.toThrow();
    });

    it('returns zero for spine-related counters when no spine is wired', () => {
      const metrics = new RuntimeMetricsService();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics);

      bootstrap.onModuleInit();

      const snapshot = metrics.getMetrics();
      expect(snapshot.spineEventsTotal).toBe(0);
      expect(snapshot.valenceTaggedEventsTotal).toBe(0);
      expect(snapshot.valenceCoveragePct).toBe(0);
    });

    it('leaves the metrics service fully operational for non-spine counters', () => {
      const metrics = new RuntimeMetricsService();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics);

      bootstrap.onModuleInit();

      metrics.incrementOperations(5);
      metrics.incrementGateCheck(true);
      metrics.incrementGateCheck(false);

      const snapshot = metrics.getMetrics();
      expect(snapshot.operationsTotal).toBe(5);
      expect(snapshot.gateChecksTotal).toBe(2);
      expect(snapshot.gateFailsTotal).toBe(1);
    });
  });

  describe('full bootstrap lifecycle', () => {
    it('correctly tracks all metrics across operations, spine events, and gates', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      metrics.incrementOperations(20);
      bootstrap.onModuleInit();
      emitAll(
        Array.from({ length: 12 }, (_, i) =>
          makeEnvelope(i % 2 === 0 ? { valence: 'positive' } : {}),
        ),
      );
      metrics.incrementGateCheck(true);
      metrics.incrementGateCheck(false);

      const snapshot = metrics.getMetrics();
      expect(snapshot.operationsTotal).toBe(20);
      expect(snapshot.spineEventsTotal).toBe(12);
      expect(snapshot.valenceTaggedEventsTotal).toBe(6);
      expect(snapshot.gateChecksTotal).toBe(2);
      expect(snapshot.gateFailsTotal).toBe(1);
      expect(snapshot.eventsToOperationsRatio).toBe(0.6);
      expect(snapshot.valenceCoveragePct).toBe(50);
    });

    it('gate counters are unaffected by spine wiring', () => {
      const metrics = new RuntimeMetricsService();
      const { spine, emitAll } = makeSpine();
      const bootstrap = new RuntimeMetricsBootstrapService(metrics, spine);

      bootstrap.onModuleInit();
      emitAll([makeEnvelope(), makeEnvelope()]);

      const snapshot = metrics.getMetrics();
      expect(snapshot.gateChecksTotal).toBe(0);
      expect(snapshot.gateFailsTotal).toBe(0);
    });
  });
});
