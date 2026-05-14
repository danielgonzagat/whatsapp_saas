import { CheckoutEventEmitterService } from './checkout-event-emitter.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';

function buildEmitter() {
  const spine = new SpineEmitterService();
  const emitter = new CheckoutEventEmitterService(spine);
  return { spine, emitter };
}

describe('CheckoutEventEmitterService — contract spec', () => {
  describe('commerce.cart.created', () => {
    it('emits event on spine with correct fields', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.cartCreated({
        workspaceId: 'wks_test',
        orderId: 'ord_1',
        planId: 'plan_a',
        correlationId: 'corr_1',
        totalInCents: 9900,
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.cart.created');
      expect(ev.workspaceId).toBe('wks_test');
      expect(ev.entityRef).toEqual({ entityType: 'order', entityId: 'ord_1' });
      expect(ev.truthMode).toBe('observed');
      expect(ev.provenance.source).toBe('production');
      expect(ev.provenance.processor).toBe('checkout-event-emitter');
    });
  });

  describe('commerce.cart.abandoned', () => {
    it('emits with truthMode inferred', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.cartAbandoned({
        workspaceId: 'wks_test',
        orderId: 'ord_2',
        planId: 'plan_b',
        correlationId: 'corr_2',
        minutesSinceCreation: 35,
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.cart.abandoned');
      expect(ev.truthMode).toBe('inferred');
      expect(ev.payload).toEqual({
        orderId: 'ord_2',
        planId: 'plan_b',
        minutesSinceCreation: 35,
      });
    });
  });

  describe('commerce.cart.checkout_initiated', () => {
    it('emits event with observed truthMode and payment fields', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.checkoutInitiated({
        workspaceId: 'wks_test',
        orderId: 'ord_3',
        planId: 'plan_c',
        correlationId: 'corr_3',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 15000,
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.cart.checkout_initiated');
      expect(ev.truthMode).toBe('observed');
      expect(ev.payload?.paymentMethod).toBe('CREDIT_CARD');
      expect(ev.payload?.totalInCents).toBe(15000);
    });
  });

  describe('commerce.payment.initiated', () => {
    it('emits with payment intent id', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.paymentInitiated({
        workspaceId: 'wks_test',
        orderId: 'ord_4',
        paymentIntentId: 'pi_123',
        paymentMethod: 'PIX',
        amountInCents: 9900,
        correlationId: 'corr_4',
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.payment.initiated');
      expect(ev.truthMode).toBe('observed');
      expect(ev.payload?.paymentIntentId).toBe('pi_123');
    });
  });

  describe('commerce.payment.approved', () => {
    it('emits with positive valence', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.paymentApproved({
        workspaceId: 'wks_test',
        orderId: 'ord_5',
        paymentIntentId: 'pi_456',
        amountInCents: 9900,
        correlationId: 'corr_5',
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.payment.approved');
      expect(ev.truthMode).toBe('observed');
      expect(ev.valence).toBe('positive');
    });

    it('ValenceTaggerService tags terminal events on spine', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.paymentApproved({
        workspaceId: 'wks_test',
        orderId: 'ord_vt',
        paymentIntentId: 'pi_vt',
        amountInCents: 500,
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.valence).toBe('positive');
    });
  });

  describe('commerce.payment.declined', () => {
    it('emits with negative valence', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.paymentDeclined({
        workspaceId: 'wks_test',
        orderId: 'ord_6',
        paymentIntentId: 'pi_789',
        correlationId: 'corr_6',
        reason: 'insufficient_funds',
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.payment.declined');
      expect(ev.valence).toBe('negative');
      expect(ev.payload?.reason).toBe('insufficient_funds');
    });
  });

  describe('commerce.payment.refunded', () => {
    it('emits with negative valence', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.paymentRefunded({
        workspaceId: 'wks_test',
        orderId: 'ord_7',
        paymentIntentId: 'pi_101',
        refundId: 're_202',
        amountInCents: 9900n,
        correlationId: 'corr_7',
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.payment.refunded');
      expect(ev.valence).toBe('negative');
      expect(ev.payload?.refundId).toBe('re_202');
    });
  });

  describe('commerce.payment.charged_back', () => {
    it('emits with negative valence', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.paymentChargedBack({
        workspaceId: 'wks_test',
        orderId: 'ord_8',
        paymentIntentId: 'pi_111',
        disputeId: 'dp_222',
        amountInCents: 15000n,
        correlationId: 'corr_8',
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.eventName).toBe('commerce.payment.charged_back');
      expect(ev.valence).toBe('negative');
      expect(ev.payload?.disputeId).toBe('dp_222');
    });
  });

  describe('ring buffer overflow', () => {
    it('does NOT throw when ring buffer is full', async () => {
      const { spine, emitter } = buildEmitter();
      for (let i = 0; i < 6000; i++) {
        await emitter.cartCreated({
          workspaceId: 'wks_test',
          orderId: `ord_${i}`,
          planId: 'plan_a',
          correlationId: `corr_${i}`,
          totalInCents: 100,
        });
      }
      const events = spine.recentEvents(5000);
      expect(events.length).toBeLessThanOrEqual(5000);
      expect(spine.ringSize()).toBeLessThanOrEqual(5000);
    });
  });

  describe('malformed payload resilience', () => {
    it('does NOT throw on malformed payload, still emits', async () => {
      const spine = new SpineEmitterService();
      const emitter = new CheckoutEventEmitterService(spine);
      await emitter.cartCreated({
        workspaceId: 'wks_test',
        orderId: 'ord_mal',
        planId: 'plan_a',
        totalInCents: 100,
      });
      const events = spine.recentEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('distinct correlationIds', () => {
    it('emits two distinct events with different correlationIds', async () => {
      const { spine, emitter } = buildEmitter();
      await emitter.cartCreated({
        workspaceId: 'wks_test',
        orderId: 'ord_a',
        planId: 'plan_a',
        correlationId: 'corr_a',
        totalInCents: 100,
      });
      await emitter.cartCreated({
        workspaceId: 'wks_test',
        orderId: 'ord_b',
        planId: 'plan_b',
        correlationId: 'corr_b',
        totalInCents: 200,
      });
      const events = spine.recentEvents();
      expect(events).toHaveLength(2);
      expect(events[0].eventId).not.toBe(events[1].eventId);
      expect(events[0].correlationId).toBe('corr_a');
      expect(events[1].correlationId).toBe('corr_b');
    });
  });
});
