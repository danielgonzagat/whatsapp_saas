import { buildController, makeReq } from './payment-webhook-stripe.controller.spec.helpers';

// Part 2 of payment-webhook-stripe.controller.spec.ts (split for file-size guardrail).
// Signature verification and event routing suites live in the sibling file.

describe('PaymentWebhookStripeController', () => {
  describe('idempotency', () => {
    it('returns duplicate response when Redis set returns null (key exists)', async () => {
      const { controller, redis, webhooksService } = buildController();
      redis.set.mockResolvedValue(null);
      const evt = {
        id: 'evt_dup_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_dup',
            status: 'succeeded',
            metadata: { workspaceId: 'ws-1', orderId: 'order-1' },
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, 'evt_dup_1', evt);

      expect(result).toEqual({
        ok: true,
        received: true,
        duplicate: true,
        reason: 'duplicate_event',
      });
      expect(webhooksService.logWebhookEvent).not.toHaveBeenCalled();
    });

    it('uses eventId header and falls back to event body id for cache key', async () => {
      const { controller, redis } = buildController();
      redis.set.mockResolvedValue(null);
      const evt = {
        id: 'evt_body_id',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', status: 'succeeded', metadata: {} } },
      };

      await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('webhook:payment:'),
        '1',
        'EX',
        300,
        'NX',
      );
    });
  });

  describe('duplicate webhook event handling', () => {
    it('returns skipped when logWebhookEvent throws P2002 unique constraint', async () => {
      const { controller, webhooksService } = buildController();
      const p2002 = new Error('Unique constraint failed');
      (p2002 as { code?: string }).code = 'P2002';
      webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002);
      const evt = {
        id: 'evt_dup_p2002',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_dup_p2002',
            status: 'succeeded',
            metadata: { workspaceId: 'ws-1', orderId: 'order-1' },
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(result).toEqual({
        received: true,
        skipped: true,
        reason: 'duplicate_webhook_event',
      });
    });
  });

  describe('handler throws → 500', () => {
    it('re-throws when a handler throws, letting NestJS return 500 for Stripe retry', async () => {
      const { controller, stripeWebhookProcessor } = buildController();
      stripeWebhookProcessor.processSaleSucceeded.mockRejectedValueOnce(
        new Error('handler exploded'),
      );
      const evt = {
        id: 'evt_pi_fail',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_fail',
            status: 'succeeded',
            metadata: { workspaceId: 'ws-1', orderId: 'order-1', type: 'sale' },
          },
        },
      };

      await expect(
        controller.handleStripe(makeReq(evt), undefined as unknown as string, undefined, evt),
      ).rejects.toThrow('handler exploded');
    });
  });
});
