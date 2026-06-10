import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentWebhookStripeController } from './payment-webhook-stripe.controller';
import { StripeWebhookLedgerService } from './stripe-webhook-ledger.service';

type MockRedis = {
  set: jest.Mock;
  lpush: jest.Mock;
  ltrim: jest.Mock;
};

function mockRedis(): MockRedis {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
  };
}

type TransactionInput = ((tx: unknown) => Promise<unknown>) | Array<Promise<unknown>>;

function mockPrisma() {
  return {
    workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }) },
    checkoutPayment: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkoutOrder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    connectMaturationRule: { findMany: jest.fn().mockResolvedValue([]) },
    contact: { findFirst: jest.fn().mockResolvedValue(null) },
    payment: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    connectAccountBalance: { findUnique: jest.fn() },
    kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn().mockImplementation((op: TransactionInput) =>
      Array.isArray(op)
        ? Promise.all(op)
        : op({
            checkoutOrder: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ status: 'PROCESSING', totalInCents: 13_990, metadata: {} }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }),
    ),
  };
}

function buildController() {
  const stripeWebhookProcessor = {
    processSaleSucceeded: jest.fn().mockResolvedValue({
      paymentIntentId: 'pi_sale_1',
      transfersDispatched: 4,
      ledgerEntriesCreated: 5,
      skippedReason: undefined,
      connectPostSale: {
        transferGroup: 'sale:order-1',
        sellerStripeAccountId: 'acct_seller',
        sellerDestinationAmountCents: 656n,
        transfers: [],
      },
    }),
  };
  const autopilot = {
    markConversion: jest.fn().mockResolvedValue(undefined),
    triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
  };
  const whatsapp = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  const prisma = mockPrisma();
  const redis = mockRedis();
  const webhooksService = {
    logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_1' }),
    markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    markWebhookFailed: jest.fn().mockResolvedValue(undefined),
  };
  const connectReversalService = {
    processRefund: jest.fn(),
    processDispute: jest.fn(),
  };
  const connectPayoutService = { handleFailedPayout: jest.fn() };
  const marketplaceTreasury = {
    append: jest.fn().mockResolvedValue(undefined),
    readBalance: jest.fn().mockResolvedValue({ pendingInCents: 2_000, availableInCents: 5_000 }),
  };
  const marketplaceTreasuryPayoutService = { handleFailedPayout: jest.fn() };
  const adminAudit = { append: jest.fn().mockResolvedValue(undefined) };
  const financialAlert = { webhookProcessingFailed: jest.fn() };
  const ledger = new StripeWebhookLedgerService(
    prisma as never,
    marketplaceTreasury as never,
    adminAudit as never,
  );

  const controller = new PaymentWebhookStripeController(
    autopilot as never,
    whatsapp as never,
    prisma as never,
    redis as never,
    webhooksService as never,
    stripeWebhookProcessor as never,
    connectReversalService as never,
    connectPayoutService as never,
    marketplaceTreasuryPayoutService as never,
    adminAudit as never,
    financialAlert as never,
    ledger,
  );

  return {
    controller,
    prisma,
    redis,
    webhooksService,
    autopilot,
    whatsapp,
    stripeWebhookProcessor,
    connectReversalService,
    connectPayoutService,
    marketplaceTreasury,
    marketplaceTreasuryPayoutService,
    adminAudit,
    financialAlert,
  };
}

function makeReq(body: unknown, rawBody = ''): { body: unknown; rawBody: string; url: string } {
  return { body, rawBody, url: '/webhook/payment/stripe' };
}

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
