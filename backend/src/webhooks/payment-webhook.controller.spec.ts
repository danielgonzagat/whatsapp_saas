// Webhook specs exercise sendMessage-adjacent flows through the shared
// messageLimit/dailyLimit enforcement in WhatsappService.sendMessage().
const mockConstructEvent = jest.fn();
const mockRetrieveEvent = jest.fn();

jest.mock('../billing/stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    events: {
      retrieve: mockRetrieveEvent,
    },
  })),
}));

import { buildPaymentWebhookController as buildController } from '../../test/payment-webhook-controller-harness';

describe('PaymentWebhookController.handleStripe — checkout payment intents', () => {
  beforeEach(() => {
    mockConstructEvent.mockReset();
    mockRetrieveEvent.mockReset();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRETS;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('marks checkout payment/order as paid when payment_intent.succeeded arrives for a Kloel order', async () => {
    const { controller, prisma, webhooksService } = buildController();
    prisma.checkoutOrder.findUnique.mockResolvedValueOnce({ status: 'PROCESSING' });

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_pi_succeeded',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
              status: 'succeeded',
              metadata: {
                workspace_id: 'ws-1',
                kloel_order_id: 'order-1',
              },
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_pi_succeeded',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            status: 'succeeded',
            metadata: {
              workspace_id: 'ws-1',
              kloel_order_id: 'order-1',
            },
          },
        },
      } as never,
    );

    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'pi_test_123' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', workspaceId: 'ws-1' },
        data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }),
      }),
    );
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('alerts and rethrows when post-sale Stripe processing fails after payment_intent.succeeded', async () => {
    const { controller, prisma, stripeWebhookProcessor, financialAlert, webhooksService } =
      buildController();
    const processorError = new Error('post-sale fanout failed');
    stripeWebhookProcessor.processSaleSucceeded.mockRejectedValueOnce(processorError);

    await expect(
      controller.handleStripe(
        {
          body: {
            id: 'evt_pi_succeeded_fail',
            type: 'payment_intent.succeeded',
            data: {
              object: {
                id: 'pi_test_123',
                status: 'succeeded',
                metadata: {
                  workspace_id: 'ws-1',
                  kloel_order_id: 'order-1',
                  type: 'sale',
                },
              },
            },
          } as never,
          rawBody: '',
          url: '/webhook/payment/stripe',
        },
        undefined,
        undefined,
        {
          id: 'evt_pi_succeeded_fail',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
              status: 'succeeded',
              metadata: {
                workspace_id: 'ws-1',
                kloel_order_id: 'order-1',
                type: 'sale',
              },
            },
          },
        } as never,
      ),
    ).rejects.toThrow('post-sale fanout failed');

    expect(financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(processorError, {
      provider: 'stripe',
      externalId: 'pi_test_123',
      eventType: 'payment_intent.succeeded',
    });
    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'pi_test_123' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(prisma.kloelSale.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1', externalPaymentId: 'pi_test_123' },
        data: expect.objectContaining({ status: 'paid' }),
      }),
    );
    expect(webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('alerts and rethrows when post-sale Stripe processing is skipped for a sale intent', async () => {
    const { controller, prisma, stripeWebhookProcessor, financialAlert, webhooksService } =
      buildController();
    stripeWebhookProcessor.processSaleSucceeded.mockResolvedValueOnce({
      paymentIntentId: 'pi_test_123',
      transfersDispatched: 0,
      ledgerEntriesCreated: 0,
      skippedReason: 'no_metadata',
    });

    await expect(
      controller.handleStripe(
        {
          body: {
            id: 'evt_pi_succeeded_skipped',
            type: 'payment_intent.succeeded',
            data: {
              object: {
                id: 'pi_test_123',
                status: 'succeeded',
                metadata: {
                  workspace_id: 'ws-1',
                  kloel_order_id: 'order-1',
                  type: 'sale',
                },
              },
            },
          } as never,
          rawBody: '',
          url: '/webhook/payment/stripe',
        },
        undefined,
        undefined,
        {
          id: 'evt_pi_succeeded_skipped',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
              status: 'succeeded',
              metadata: {
                workspace_id: 'ws-1',
                kloel_order_id: 'order-1',
                type: 'sale',
              },
            },
          },
        } as never,
      ),
    ).rejects.toThrow(
      'Stripe post-sale processing skipped for paymentIntent=pi_test_123: no_metadata',
    );

    expect(financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(expect.any(Error), {
      provider: 'stripe',
      externalId: 'pi_test_123',
      eventType: 'payment_intent.succeeded',
    });
    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'pi_test_123' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(prisma.kloelSale.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1', externalPaymentId: 'pi_test_123' },
        data: expect.objectContaining({ status: 'paid' }),
      }),
    );
    expect(webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('marks the checkout payment as declined when payment_intent.payment_failed arrives', async () => {
    const { controller, prisma } = buildController();

    await controller.handleStripe(
      {
        body: {
          id: 'evt_pi_failed',
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: 'pi_test_456',
              status: 'requires_payment_method',
              metadata: {
                workspace_id: 'ws-1',
                kloel_order_id: 'order-2',
              },
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_pi_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_456',
            status: 'requires_payment_method',
            metadata: {
              workspace_id: 'ws-1',
              kloel_order_id: 'order-2',
            },
          },
        },
      } as never,
    );

    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'pi_test_456' },
        data: expect.objectContaining({ status: 'DECLINED' }),
      }),
    );
    expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
  });

  it('accepts any configured Stripe webhook secret for the shared endpoint', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_primary';
    process.env.STRIPE_WEBHOOK_SECRETS = 'whsec_primary,whsec_secondary';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local';

    mockConstructEvent.mockImplementation(
      (_rawBody: unknown, _signature: string, secret: string) => {
        if (secret === 'whsec_primary') {
          throw new Error('no signatures found matching the expected signature for payload');
        }
        return {
          id: 'evt_signed_secondary_secret',
          type: 'payment_intent.processing',
          data: {
            object: {
              id: 'pi_test_123',
              status: 'processing',
              metadata: {
                workspace_id: 'ws-1',
                kloel_order_id: 'order-1',
              },
            },
          },
        };
      },
    );

    const { controller, prisma, webhooksService } = buildController();

    const result = await controller.handleStripe(
      {
        body: {} as never,
        rawBody: Buffer.from('{"id":"evt_signed_secondary_secret"}'),
        url: '/webhook/payment/stripe',
      },
      't=1,v1=fake',
      undefined,
      {} as never,
    );

    expect(mockConstructEvent).toHaveBeenCalledTimes(2);
    expect(mockConstructEvent.mock.calls[0]?.[2]).toBe('whsec_primary');
    expect(mockConstructEvent.mock.calls[1]?.[2]).toBe('whsec_secondary');
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'pi_test_123' },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      }),
    );
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('hydrates signed thin account.updated events and records the account audit entry', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_primary';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local';

    mockConstructEvent.mockReturnValue({
      id: 'evt_thin_account_updated',
      object: 'v2.core.event',
      type: 'account.updated',
      related_object: {
        id: 'acct_seller_1',
        type: 'account',
      },
    });
    mockRetrieveEvent.mockResolvedValue({
      id: 'evt_thin_account_updated',
      object: 'event',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_seller_1',
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
          requirements: {
            currently_due: ['individual.verification.document'],
            past_due: [],
            disabled_reason: 'requirements.pending_verification',
          },
        },
      },
    });

    const { controller, adminAudit, webhooksService } = buildController();

    const result = await controller.handleStripe(
      {
        body: {} as never,
        rawBody: Buffer.from('{"id":"evt_thin_account_updated"}'),
        url: '/webhook/payment/stripe',
      },
      't=1,v1=fake',
      undefined,
      {} as never,
    );

    expect(mockRetrieveEvent).toHaveBeenCalledWith('evt_thin_account_updated', {}, undefined);
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.connect.account_updated',
      entityType: 'connect_account_balance',
      entityId: 'cab_seller_1',
      details: {
        accountBalanceId: 'cab_seller_1',
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller_1',
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsCurrentlyDue: ['individual.verification.document'],
        requirementsPastDue: [],
        requirementsDisabledReason: 'requirements.pending_verification',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });
});
