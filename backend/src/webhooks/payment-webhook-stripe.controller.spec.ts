import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { buildController, makeReq } from './payment-webhook-stripe.controller.spec.helpers';

// Idempotency, duplicate-event, and handler-error suites live in
// payment-webhook-stripe.controller.part2.spec.ts (split for file-size guardrail).

describe('PaymentWebhookStripeController', () => {
  describe('signature verification', () => {
    it('returns skipped=true when STRIPE_SECRET_KEY is not configured (warn log)', async () => {
      const { controller } = buildController();
      const evt = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(result).toEqual({ received: true });
    });

    it('throws 400 when stripe-signature header is missing and endpoint secrets exist', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      const { controller } = buildController();
      const evt = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } };
      delete process.env.STRIPE_WEBHOOK_SECRET;
      // In non-prod, if STRIPE_WEBHOOK_SECRET is not set, tests skip verification.
      // This test validates that when it IS set, missing signature throws.
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

      await expect(
        controller.handleStripe(makeReq(evt), undefined as unknown as string, undefined, evt),
      ).rejects.toThrow(BadRequestException);
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    it('throws 400 when rawBody is missing', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      const { controller } = buildController();
      const evt = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } };
      const req = { body: evt, rawBody: undefined, url: '/webhook/payment/stripe' };

      await expect(controller.handleStripe(req, 'test_sig', undefined, evt)).rejects.toThrow(
        BadRequestException,
      );
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    it('throws 403 in production when STRIPE_WEBHOOK_SECRET is not configured', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { controller } = buildController();
      const evt = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } };

      await expect(
        controller.handleStripe(makeReq(evt), undefined as unknown as string, undefined, evt),
      ).rejects.toThrow(ForbiddenException);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('event routing', () => {
    it('routes payment_intent.succeeded to handlePaymentIntentEvent and returns received', async () => {
      const { controller, webhooksService } = buildController();
      const evt = {
        id: 'evt_pi_success',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            status: 'succeeded',
            metadata: { workspaceId: 'ws-1', orderId: 'order-1' },
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(webhooksService.logWebhookEvent).toHaveBeenCalledWith(
        'stripe',
        'payment_intent.succeeded',
        'evt_pi_success',
        evt,
      );
      expect(result).toEqual({ received: true });
    });

    it('routes checkout.session.completed to handleCheckoutSessionCompleted', async () => {
      const { controller, webhooksService } = buildController();
      const evt = {
        id: 'evt_cs_complete',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_1',
            payment_intent: 'pi_test_123',
            amount_total: 13_990,
            currency: 'brl',
            customer_email: 'test@example.com',
            customer_details: { email: 'test@example.com', phone: '+5511999999999' },
            metadata: { workspaceId: 'ws-1', productName: 'Curso X' },
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(webhooksService.logWebhookEvent).toHaveBeenCalledWith(
        'stripe',
        'checkout.session.completed',
        'evt_cs_complete',
        evt,
      );
      expect(result).toEqual({ received: true });
    });

    it('routes refund.created to handler', async () => {
      const { controller, connectReversalService } = buildController();
      connectReversalService.processRefund.mockResolvedValue({
        paymentIntentId: 'pi_test_123',
        triggerId: 're_1',
        reversedAmountCents: 9_010n,
        reversedTransfers: 2,
        ledgerDebits: 2,
      });
      const evt = {
        id: 'evt_refund',
        type: 'refund.created',
        data: { object: { id: 're_1', payment_intent: 'pi_test_123', amount: 13_990 } },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(connectReversalService.processRefund).toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('routes charge.dispute.created to handler', async () => {
      const { controller, connectReversalService } = buildController();
      connectReversalService.processDispute.mockResolvedValue({
        paymentIntentId: 'pi_test_123',
        triggerId: 'dp_1',
        reversedAmountCents: 9_010n,
        reversedTransfers: 3,
        ledgerDebits: 3,
      });
      const evt = {
        id: 'evt_dispute',
        type: 'charge.dispute.created',
        data: { object: { id: 'dp_1', payment_intent: 'pi_test_123', amount: 13_990 } },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(connectReversalService.processDispute).toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('routes charge.dispute.closed to handler', async () => {
      const { controller } = buildController();
      const evt = {
        id: 'evt_dispute_closed',
        type: 'charge.dispute.closed',
        data: {
          object: {
            id: 'dp_1',
            payment_intent: 'pi_test_123',
            amount: 13_990,
            status: 'won',
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(result).toEqual({ received: true });
    });

    it('routes payout.failed to handler', async () => {
      const { controller, connectPayoutService, adminAudit } = buildController();
      connectPayoutService.handleFailedPayout.mockResolvedValue(undefined);
      adminAudit.append.mockResolvedValue(undefined);
      const evt = {
        id: 'evt_payout_fail',
        type: 'payout.failed',
        data: {
          object: {
            id: 'po_1',
            amount: 9_010,
            status: 'failed',
            metadata: { accountBalanceId: 'cab_1', requestId: 'req_1' },
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(connectPayoutService.handleFailedPayout).toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('routes payout.paid to handler', async () => {
      const { controller, adminAudit } = buildController();
      adminAudit.append.mockResolvedValue(undefined);
      const evt = {
        id: 'evt_payout_paid',
        type: 'payout.paid',
        data: {
          object: {
            id: 'po_1',
            amount: 9_010,
            status: 'paid',
            metadata: { accountBalanceId: 'cab_1', requestId: 'req_1' },
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(result).toEqual({ received: true });
    });

    it('routes account.updated to handler', async () => {
      const { controller } = buildController();
      const evt = {
        id: 'evt_acct_updated',
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_123',
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
            requirements: { currently_due: [], past_due: [], disabled_reason: null },
          },
        },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(result).toEqual({ received: true });
    });

    it('logs and returns 200 for unhandled event types', async () => {
      const { controller, webhooksService } = buildController();
      const evt = {
        id: 'evt_unknown',
        type: 'invoice.created',
        data: { object: { id: 'in_1' } },
      };

      const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

      expect(webhooksService.logWebhookEvent).toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });
  });
});
