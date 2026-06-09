/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Flag-gated atomicity for the Stripe sale/payment co-writes
 * (KLOEL_PAYMENT_LEDGER_TX). Covers BOTH flag states:
 *
 *   - default OFF  → byte-identical legacy behaviour: a failing sale-ledger
 *     write is swallowed (`.catch(() => undefined)`) and the handler still
 *     resolves 200-OK (no Stripe retry); the two co-located writes are NOT
 *     required to share one transaction.
 *   - ON           → the co-located writes run inside ONE `$transaction`, and a
 *     partial failure SURFACES (re-thrown) so Stripe retries.
 *
 * Plus a partial-failure-rolls-back assertion: with the flag ON, when the
 * `KloelSale` write inside the transaction throws, the whole `$transaction`
 * rejects (so a real Prisma backend rolls BOTH writes back) and the handler
 * throws. The `markWebhookProcessed` marker write stays OUTSIDE the financial
 * transaction in both states (idempotency marker, non-financial).
 *
 * @see backend/src/webhooks/payment-ledger-tx.flag.ts
 * @see docs/architecture/MIGRATION_PLAYBOOK.md (sale-payment STEP 1 + STEP 3)
 */
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { buildPaymentWebhookController as buildController } from '../../test/payment-webhook-controller-harness';

const FLAG = 'KLOEL_PAYMENT_LEDGER_TX';

function checkoutSessionReq() {
  const object = {
    id: 'cs_tx_1',
    payment_intent: 'pi_tx_1',
    payment_status: 'paid',
    amount_total: 19700,
    currency: 'brl',
    customer_details: { email: 'buyer@example.com' },
    metadata: {
      workspaceId: 'ws-1',
      kloel_order_id: 'sale-tx-1',
      saleId: 'sale-tx-1',
      productName: 'PDRN',
    },
  };
  const event = {
    id: 'evt_cs_tx_1',
    type: 'checkout.session.completed',
    data: { object },
  };
  return { event };
}

function paymentIntentSucceededReq() {
  const object = {
    id: 'pi_generic_tx_1',
    status: 'succeeded',
    metadata: { workspaceId: 'ws-1', type: 'kloel_payment' },
  };
  const event = {
    id: 'evt_pi_tx_1',
    type: 'payment_intent.succeeded',
    data: { object },
  };
  return { event };
}

describe('PaymentWebhookController — KLOEL_PAYMENT_LEDGER_TX flag gating', () => {
  const original = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });
  afterEach(() => {
    if (original === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = original;
    }
  });

  describe('checkout.session.completed (STEP 1)', () => {
    it('flag OFF: issues the two writes as SEPARATE statements (no $transaction) — byte-identical legacy', async () => {
      delete process.env[FLAG];
      const { controller, prisma, webhooksService } = buildController();

      const { event } = checkoutSessionReq();
      await expect(
        controller.handleStripe(
          { body: event, rawBody: '', url: '/webhook/payment/stripe' },
          undefined,
          undefined,
          event,
        ),
      ).resolves.toEqual({ received: true });

      // Legacy path issues the two writes WITHOUT wrapping them in $transaction.
      expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.kloelSale.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      // markWebhookProcessed still runs (marker write, idempotency).
      expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    });

    it('flag OFF: a failing KloelSale write still surfaces (legacy already throws here, non-atomically)', async () => {
      delete process.env[FLAG];
      const { controller, prisma, webhooksService } = buildController();
      prisma.kloelSale.updateMany.mockRejectedValueOnce(new Error('sale write boom'));

      const { event } = checkoutSessionReq();
      await expect(
        controller.handleStripe(
          { body: event, rawBody: '', url: '/webhook/payment/stripe' },
          undefined,
          undefined,
          event,
        ),
      ).rejects.toBeDefined();

      // The legacy checkout.session path is NON-atomic: it already ran the
      // separate payment write before the sale write threw, and it never
      // entered a $transaction.
      expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      // A surfaced failure marks the webhook failed (not processed).
      expect(webhooksService.markWebhookFailed).toHaveBeenCalled();
      expect(webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
    });

    it('flag ON: the payment + sale writes run inside ONE $transaction', async () => {
      process.env[FLAG] = 'true';
      const { controller, prisma } = buildController();

      const { event } = checkoutSessionReq();
      await controller.handleStripe(
        { body: event, rawBody: '', url: '/webhook/payment/stripe' },
        undefined,
        undefined,
        event,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.kloelSale.updateMany).toHaveBeenCalledTimes(1);
      const saleUpdate = prisma.kloelSale.updateMany.mock.calls[0]?.[0] as {
        data: { status?: string };
      };
      expect(saleUpdate.data.status).toBe('paid');
    });

    it('flag ON: a partial failure inside the tx surfaces (Stripe retry) and rolls back', async () => {
      process.env[FLAG] = 'true';
      const { controller, prisma, webhooksService, financialAlert } = buildController();
      prisma.kloelSale.updateMany.mockRejectedValueOnce(new Error('sale write boom'));

      const { event } = checkoutSessionReq();
      await expect(
        controller.handleStripe(
          { body: event, rawBody: '', url: '/webhook/payment/stripe' },
          undefined,
          undefined,
          event,
        ),
      ).rejects.toBeDefined();

      // The financial transaction was entered (rollback contract is the
      // $transaction itself rejecting).
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(financialAlert.webhookProcessingFailed).toHaveBeenCalled();
      // The idempotency marker is NOT flipped to processed on a surfaced failure.
      expect(webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
    });
  });

  describe('payment_intent.succeeded — generic KloelSale (STEP 3)', () => {
    it('flag OFF: a failing sale $transaction is swallowed and the handler resolves (legacy)', async () => {
      delete process.env[FLAG];
      const { controller, prisma, webhooksService } = buildController();
      prisma.kloelSale.updateMany.mockRejectedValueOnce(new Error('sale write boom'));

      const { event } = paymentIntentSucceededReq();
      await expect(
        controller.handleStripe(
          { body: event, rawBody: '', url: '/webhook/payment/stripe' },
          undefined,
          undefined,
          event,
        ),
      ).resolves.toEqual({ received: true });

      // Legacy path still marks the webhook processed despite the swallowed
      // sale-write failure.
      expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    });

    it('flag ON: a failing sale $transaction surfaces so Stripe retries', async () => {
      process.env[FLAG] = 'true';
      const { controller, prisma, webhooksService } = buildController();
      prisma.kloelSale.updateMany.mockRejectedValueOnce(new Error('sale write boom'));

      const { event } = paymentIntentSucceededReq();
      await expect(
        controller.handleStripe(
          { body: event, rawBody: '', url: '/webhook/payment/stripe' },
          undefined,
          undefined,
          event,
        ),
      ).rejects.toBeDefined();

      expect(prisma.$transaction).toHaveBeenCalled();
      // A surfaced financial failure must NOT mark the webhook processed.
      expect(webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
    });

    it('flag ON: the happy path still flips KloelSale to paid inside a $transaction', async () => {
      process.env[FLAG] = 'true';
      const { controller, prisma } = buildController();

      const { event } = paymentIntentSucceededReq();
      await controller.handleStripe(
        { body: event, rawBody: '', url: '/webhook/payment/stripe' },
        undefined,
        undefined,
        event,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.kloelSale.updateMany).toHaveBeenCalledTimes(1);
      const saleUpdate = prisma.kloelSale.updateMany.mock.calls[0]?.[0] as {
        data: { status?: string };
      };
      expect(saleUpdate.data.status).toBe('paid');
    });
  });
});
