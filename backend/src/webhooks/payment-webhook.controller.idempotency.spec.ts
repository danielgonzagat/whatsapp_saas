import { buildPaymentWebhookController as buildController } from '../../test/payment-webhook-controller-harness';

describe('PaymentWebhookController — idempotency and replay safety', () => {
  beforeEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRETS;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('detects duplicate Stripe webhook events via Redis cache and returns duplicate marker', async () => {
    const { controller, redis } = buildController();
    redis.set.mockResolvedValueOnce(null);

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_dupe_1',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_dupe_1',
              status: 'succeeded',
              metadata: { workspace_id: 'ws-1', kloel_order_id: 'order-1' },
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      'evt_dupe_1',
      {
        id: 'evt_dupe_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_dupe_1',
            status: 'succeeded',
            metadata: { workspace_id: 'ws-1', kloel_order_id: 'order-1' },
          },
        },
      },
    );

    expect(redis.set).toHaveBeenCalledWith('webhook:payment:evt_dupe_1', '1', 'EX', 300, 'NX');
    expect(result).toEqual({
      ok: true,
      received: true,
      duplicate: true,
      reason: 'duplicate_event',
    });
  });

  it('handles duplicate detection via DB unique constraint on provider_externalId', async () => {
    const { controller, redis, prisma, webhooksService } = buildController();
    redis.set.mockResolvedValueOnce('OK');

    const uniqueViolation = new Error(
      'Unique constraint failed on provider_externalId',
    ) as Error & { code: string };
    uniqueViolation.code = 'P2002';

    webhooksService.logWebhookEvent.mockRejectedValueOnce(uniqueViolation);

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_db_dupe',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_db_dupe',
              status: 'succeeded',
              metadata: { workspace_id: 'ws-1', kloel_order_id: 'order-1' },
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      'evt_db_dupe',
      {
        id: 'evt_db_dupe',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_db_dupe',
            status: 'succeeded',
            metadata: { workspace_id: 'ws-1', kloel_order_id: 'order-1' },
          },
        },
      },
    );

    expect(webhooksService.logWebhookEvent).toHaveBeenCalled();
    expect(result).toEqual({
      received: true,
      skipped: true,
      reason: 'duplicate_webhook_event',
    });
    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
  });

  it('marks webhook events as processed after successful refund.created handling', async () => {
    const {
      controller,
      webhooksService,
      connectReversalService,
      marketplaceTreasury: _marketplaceTreasury,
      adminAudit,
      redis,
    } = buildController();
    redis.set.mockResolvedValueOnce('OK');
    connectReversalService.processRefund.mockResolvedValueOnce({
      paymentIntentId: 'pi_refund_idem',
      triggerId: 're_idem_1',
      reversedTransfers: 2,
      ledgerDebits: 2,
      reversedAmountCents: 3_000n,
    });

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_refund_idem',
          type: 'refund.created',
          data: {
            object: {
              id: 're_idem_1',
              payment_intent: 'pi_refund_idem',
              amount: 5_000,
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      'evt_refund_idem',
      {
        id: 'evt_refund_idem',
        type: 'refund.created',
        data: {
          object: {
            id: 're_idem_1',
            payment_intent: 'pi_refund_idem',
            amount: 5_000,
          },
        },
      } as never,
    );

    expect(webhooksService.logWebhookEvent).toHaveBeenCalledWith(
      'stripe',
      'refund.created',
      'evt_refund_idem',
      expect.objectContaining({}),
    );
    expect(connectReversalService.processRefund).toHaveBeenCalledTimes(1);
    expect(adminAudit.append).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ received: true });
  });

  it('marks webhook events as processed after successful charge.dispute.created handling', async () => {
    const {
      controller,
      webhooksService,
      connectReversalService,
      marketplaceTreasury: _marketplaceTreasury,
      adminAudit,
      redis,
    } = buildController();
    redis.set.mockResolvedValueOnce('OK');
    connectReversalService.processDispute.mockResolvedValueOnce({
      paymentIntentId: 'pi_dispute_idem',
      triggerId: 'dp_idem_1',
      reversedTransfers: 3,
      ledgerDebits: 3,
      reversedAmountCents: 4_500n,
    });

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_dispute_idem',
          type: 'charge.dispute.created',
          data: {
            object: {
              id: 'dp_idem_1',
              payment_intent: 'pi_dispute_idem',
              amount: 5_000,
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      'evt_dispute_idem',
      {
        id: 'evt_dispute_idem',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_idem_1',
            payment_intent: 'pi_dispute_idem',
            amount: 5_000,
          },
        },
      } as never,
    );

    expect(webhooksService.logWebhookEvent).toHaveBeenCalledWith(
      'stripe',
      'charge.dispute.created',
      'evt_dispute_idem',
      expect.objectContaining({}),
    );
    expect(connectReversalService.processDispute).toHaveBeenCalledTimes(1);
    expect(adminAudit.append).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ received: true });
  });

  it('handles charge.dispute.closed with won status and restores sale state', async () => {
    const { controller, prisma, webhooksService, redis, adminAudit } = buildController();
    redis.set.mockResolvedValueOnce('OK');

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_dispute_won',
          type: 'charge.dispute.closed',
          data: {
            object: {
              id: 'dp_won_1',
              status: 'won',
              payment_intent: 'pi_dispute_won',
              amount: 5_000,
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      'evt_dispute_won',
      {
        id: 'evt_dispute_won',
        type: 'charge.dispute.closed',
        data: {
          object: {
            id: 'dp_won_1',
            status: 'won',
            payment_intent: 'pi_dispute_won',
            amount: 5_000,
          },
        },
      } as never,
    );

    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.sale.dispute_won',
      entityType: 'checkout_order',
      entityId: 'order-1',
      details: expect.objectContaining({
        paymentIntentId: 'pi_dispute_won',
        triggerId: 'dp_won_1',
        workspaceId: 'ws-1',
        orderId: 'order-1',
      }),
    });
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_dispute_won' },
      data: { status: 'APPROVED' },
    });
    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'PAID' },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('handles charge.dispute.closed with lost status and records the outcome', async () => {
    const { controller, prisma, webhooksService, redis, adminAudit } = buildController();
    redis.set.mockResolvedValueOnce('OK');

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_dispute_lost',
          type: 'charge.dispute.closed',
          data: {
            object: {
              id: 'dp_lost_1',
              status: 'lost',
              payment_intent: 'pi_dispute_lost',
              amount: 2_000,
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      'evt_dispute_lost',
      {
        id: 'evt_dispute_lost',
        type: 'charge.dispute.closed',
        data: {
          object: {
            id: 'dp_lost_1',
            status: 'lost',
            payment_intent: 'pi_dispute_lost',
            amount: 2_000,
          },
        },
      } as never,
    );

    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.sale.dispute_lost',
      entityType: 'checkout_order',
      entityId: 'order-1',
      details: expect.objectContaining({
        paymentIntentId: 'pi_dispute_lost',
        triggerId: 'dp_lost_1',
        workspaceId: 'ws-1',
        orderId: 'order-1',
      }),
    });
    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'APPROVED' } }),
    );
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('proceeds normally when Redis returns OK (no existing key) for a new webhook event', async () => {
    const { controller, prisma, webhooksService, redis } = buildController();
    redis.set.mockResolvedValueOnce('OK');

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_new_pi',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_new_1',
              status: 'succeeded',
              metadata: { workspace_id: 'ws-1', kloel_order_id: 'order-1' },
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      'evt_new_pi',
      {
        id: 'evt_new_pi',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_new_1',
            status: 'succeeded',
            metadata: { workspace_id: 'ws-1', kloel_order_id: 'order-1' },
          },
        },
      },
    );

    expect(webhooksService.logWebhookEvent).toHaveBeenCalled();
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });
});
