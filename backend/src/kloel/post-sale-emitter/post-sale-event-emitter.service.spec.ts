import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventEnvelope } from '../spine/spine-event.types';
import { PostSaleEventEmitterService } from './post-sale-event-emitter.service';
import type { PostSaleEmitParams } from './post-sale-event-emitter.service';

class ThrowingSpineEmitterService extends SpineEmitterService {
  public constructor() {
    super(new ValenceTaggerService());
  }

  public override async emit(): Promise<SpineEventEnvelope> {
    throw new Error('simulated spine crash');
  }
}

const baseParams: PostSaleEmitParams = {
  workspaceId: 'wks_demo',
  entityRef: { entityType: 'order', entityId: 'ord_1' },
};

interface CanonicalEntry {
  readonly name: string;
  readonly truthMode: 'observed' | 'inferred';
  readonly call: (svc: PostSaleEventEmitterService) => Promise<SpineEventEnvelope | undefined>;
}

const canonicalEvents: readonly CanonicalEntry[] = [
  {
    name: 'commerce.post_sale.delivery_completed',
    truthMode: 'observed',
    call: (s) => s.emitDeliveryCompleted(baseParams),
  },
  {
    name: 'commerce.post_sale.activation_started',
    truthMode: 'observed',
    call: (s) => s.emitActivationStarted(baseParams),
  },
  {
    name: 'commerce.post_sale.first_value_obtained',
    truthMode: 'observed',
    call: (s) => s.emitFirstValueObtained(baseParams),
  },
  {
    name: 'commerce.post_sale.no_regret_confirmed',
    truthMode: 'inferred',
    call: (s) => s.emitNoRegretConfirmed(baseParams),
  },
  {
    name: 'commerce.post_sale.satisfaction_signal_observed',
    truthMode: 'observed',
    call: (s) => s.emitSatisfactionSignalObserved(baseParams),
  },
  {
    name: 'commerce.post_sale.testimonial_requested',
    truthMode: 'observed',
    call: (s) => s.emitTestimonialRequested(baseParams),
  },
  {
    name: 'commerce.post_sale.repurchase_window_opened',
    truthMode: 'inferred',
    call: (s) => s.emitRepurchaseWindowOpened(baseParams),
  },
  {
    name: 'commerce.post_sale.churn_risk_detected',
    truthMode: 'inferred',
    call: (s) => s.emitChurnRiskDetected(baseParams),
  },
  {
    name: 'commerce.post_sale.win_back_window_opened',
    truthMode: 'inferred',
    call: (s) => s.emitWinBackWindowOpened(baseParams),
  },
];

function build() {
  const spine = new SpineEmitterService(new ValenceTaggerService());
  const svc = new PostSaleEventEmitterService(spine);
  return { spine, svc };
}

describe('PostSaleEventEmitterService (UTP-EVENT-EMIT-POSTSALE contract)', () => {
  it.each(canonicalEvents)(
    'emits $name with correct eventName, workspaceId, entityRef, truthMode, and provenance.source',
    async ({ name, truthMode, call }) => {
      const { spine, svc } = build();
      const emitted = await call(svc);
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(emitted).toBe(ev);
      expect(ev?.eventName).toBe(name);
      expect(ev?.workspaceId).toBe('wks_demo');
      expect(ev?.entityRef).toEqual({ entityType: 'order', entityId: 'ord_1' });
      expect(ev?.truthMode).toBe(truthMode);
      expect(ev?.provenance.source).toBe('production');
      expect(ev?.provenance.processor).toBe('post-sale-event-emitter');
      expect(ev?.provenance.processorVersion).toBe('1.0.0');
      expect(ev?.provenance.schemaVersion).toBe('1.0.0');
      expect(['dev', 'staging', 'prod']).toContain(ev?.provenance.environment);
    },
  );

  it('does NOT throw when the spine ring buffer overflows', async () => {
    const { spine, svc } = build();
    for (let i = 0; i < 10000; i += 1) {
      await svc.emitDeliveryCompleted({ ...baseParams, payload: { iteration: i } });
    }
    const events = spine.recentEvents();
    expect(events).toHaveLength(5000);
    expect(events[0]?.payload).toEqual({ iteration: 5000 });
    expect(events[4999]?.payload).toEqual({ iteration: 9999 });
  });

  it('does NOT throw when spine throws', async () => {
    const svc = new PostSaleEventEmitterService(new ThrowingSpineEmitterService());
    await expect(svc.emitDeliveryCompleted(baseParams)).resolves.toBeUndefined();
  });

  it('does NOT throw when payload has unexpected shape', async () => {
    const { svc } = build();
    const result = await svc.emitDeliveryCompleted({
      ...baseParams,
      payload: { deeply: { nested: [{ array: [1, 2, 3] }] } },
    });
    expect(result?.eventName).toBe('commerce.post_sale.delivery_completed');
    expect(result?.truthMode).toBe('observed');
    expect(result?.payload).toEqual({ deeply: { nested: [{ array: [1, 2, 3] }] } });
  });

  it('auto-tags terminal valence via ValenceTaggerService', async () => {
    const { spine, svc } = build();
    await svc.emitFirstValueObtained(baseParams);
    await svc.emitChurnRiskDetected(baseParams);
    await svc.emitDeliveryCompleted(baseParams);
    const events = spine.recentEvents();
    expect(events).toHaveLength(3);
    expect(events[0]?.valence).toBe('positive');
    expect(events[1]?.valence).toBe('negative');
    expect(events[2]?.valence).toBeUndefined();
  });

  it('preserves explicit payload fields and causedBy chain', async () => {
    const { spine, svc } = build();
    const causedBy = ['evt_prior_1', 'evt_prior_2'];
    const payload = { signalType: 'nps', score: 9 };
    await svc.emitSatisfactionSignalObserved({
      ...baseParams,
      payload,
      correlationId: 'corr_sat',
      causedBy,
      occurredAt: '2026-05-13T12:00:00.000Z',
    });
    const ev = spine.recentEvents()[0];
    expect(ev?.payload).toEqual(payload);
    expect(ev?.correlationId).toBe('corr_sat');
    expect(ev?.causedBy).toEqual(causedBy);
    expect(ev?.occurredAt).toBe('2026-05-13T12:00:00.000Z');
  });

  it('two consecutive emissions with different correlationIds produce two distinct events', async () => {
    const { spine, svc } = build();
    await svc.emitActivationStarted({ ...baseParams, correlationId: 'corr_a' });
    await svc.emitActivationStarted({ ...baseParams, correlationId: 'corr_b' });
    const events = spine.recentEvents();
    expect(events).toHaveLength(2);
    expect(events[0]?.correlationId).toBe('corr_a');
    expect(events[1]?.correlationId).toBe('corr_b');
    expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
  });

  it('accepts synthetic source for testing', async () => {
    const { spine, svc } = build();
    await svc.emitDeliveryCompleted({ ...baseParams, source: 'synthetic' });
    const ev = spine.recentEvents()[0];
    expect(ev?.provenance.source).toBe('synthetic');
  });

  it('each canonical method returns an envelope with a unique eventId', async () => {
    const { spine, svc } = build();
    await svc.emitDeliveryCompleted(baseParams);
    await svc.emitActivationStarted(baseParams);
    await svc.emitFirstValueObtained(baseParams);
    await svc.emitNoRegretConfirmed(baseParams);
    await svc.emitSatisfactionSignalObserved(baseParams);
    await svc.emitTestimonialRequested(baseParams);
    await svc.emitRepurchaseWindowOpened(baseParams);
    await svc.emitChurnRiskDetected(baseParams);
    await svc.emitWinBackWindowOpened(baseParams);
    const events = spine.recentEvents();
    expect(events).toHaveLength(9);
    const ids = events.map((e) => e.eventId);
    const unique = new Set(ids);
    expect(unique.size).toBe(9);
  });
});
