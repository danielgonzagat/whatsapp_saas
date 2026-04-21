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

import { buildController } from './payment-webhook.controller.spec-helpers';

describe('PaymentWebhookController.handleStripe — KloelSale + Connect', () => {
  beforeEach(() => {
    mockConstructEvent.mockReset();
    mockRetrieveEvent.mockReset();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRETS;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('marks generic KloelSale records as paid when a Stripe payment intent succeeds outside checkout orders', async () => {
    const { controller, prisma } = buildController();

    await controller.handleStripe(
      {
        body: {
          id: 'evt_pi_generic_paid',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_generic_123',
              status: 'succeeded',
              metadata: {
                workspaceId: 'ws-1',
                type: 'kloel_payment',
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
        id: 'evt_pi_generic_paid',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_generic_123',
            status: 'succeeded',
            metadata: {
              workspaceId: 'ws-1',
              type: 'kloel_payment',
            },
          },
        },
      } as never,
    );

    expect(prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_generic_123' },
      data: { status: 'paid', paidAt: expect.any(Date) },
    });
  });

  it('dispatches the Connect post-sale processor for sale payment intents using product-specific maturation rules', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T00:00:00Z'));
    const { controller, prisma, stripeWebhookProcessor, platformWallet } = buildController();
    prisma.checkoutOrder.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      plan: { productId: 'prod-1' },
    });
    prisma.connectMaturationRule.findMany.mockResolvedValueOnce([
      {
        productId: null,
        accountType: 'SELLER',
        delayDays: 30,
        active: true,
      },
      {
        productId: 'prod-1',
        accountType: 'AFFILIATE',
        delayDays: 7,
        active: true,
      },
      {
        productId: 'prod-1',
        accountType: 'SUPPLIER',
        delayDays: 14,
        active: true,
      },
    ]);

    await controller.handleStripe(
      {
        body: {
          id: 'evt_sale_pi_succeeded',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_sale_1',
              status: 'succeeded',
              currency: 'brl',
              on_behalf_of: 'acct_seller',
              transfer_group: 'sale:order-1',
              metadata: {
                type: 'sale',
                workspace_id: 'ws-1',
                kloel_order_id: 'order-1',
                split_lines: JSON.stringify([]),
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
        id: 'evt_sale_pi_succeeded',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_sale_1',
            status: 'succeeded',
            currency: 'brl',
            on_behalf_of: 'acct_seller',
            transfer_group: 'sale:order-1',
            metadata: {
              type: 'sale',
              workspace_id: 'ws-1',
              kloel_order_id: 'order-1',
              split_lines: JSON.stringify([]),
            },
          },
        },
      } as never,
    );

    expect(stripeWebhookProcessor.processSaleSucceeded).toHaveBeenCalledTimes(1);
    const [paymentIntentArg, matureAtForRole] =
      stripeWebhookProcessor.processSaleSucceeded.mock.calls[0];
    expect(paymentIntentArg).toEqual(
      expect.objectContaining({
        id: 'pi_sale_1',
        on_behalf_of: 'acct_seller',
        transfer_group: 'sale:order-1',
      }),
    );
    expect(matureAtForRole('supplier')).toEqual(new Date('2026-05-15T00:00:00Z'));
    expect(matureAtForRole('affiliate')).toEqual(new Date('2026-05-08T00:00:00Z'));
    expect(matureAtForRole('seller')).toEqual(new Date('2026-05-31T00:00:00Z'));
    expect(matureAtForRole('manager')).toEqual(new Date('2026-05-01T00:00:00Z'));
    expect(platformWallet.append).toHaveBeenCalledWith({
      direction: 'credit',
      bucket: 'PENDING',
      amountInCents: 4_980n,
      kind: 'PLATFORM_FEE_CREDIT',
      orderId: 'sale:pi_sale_1',
      reason: 'stripe_sale_platform_fee_credit',
      metadata: {
        paymentIntentId: 'pi_sale_1',
        platformFeeCents: '990',
        interestCents: '3990',
      },
    });
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_sale_1' },
      data: {
        webhookData: {
          splitInput: {
            platformFeeCents: '990',
            interestCents: '3990',
          },
          connectPostSale: {
            transferGroup: 'sale:order-1',
            sellerStripeAccountId: 'acct_seller',
            sellerDestinationAmountCents: '656',
            transfers: [
              {
                role: 'supplier',
                accountId: 'acct_supplier',
                amountCents: '4210',
                stripeTransferId: 'tr_supplier_1',
              },
              {
                role: 'affiliate',
                accountId: 'acct_affiliate',
                amountCents: '3604',
                stripeTransferId: 'tr_affiliate_1',
              },
            ],
          },
        },
      },
    });
    jest.useRealTimers();
  });

  it('preserves latest_charge from signed Stripe payment_intent events for Connect fan-out', async () => {
    const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local';
    mockConstructEvent.mockReset();
    mockConstructEvent.mockReturnValue({
      id: 'evt_signed_sale_pi',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_sale_signed_1',
          status: 'succeeded',
          currency: 'brl',
          latest_charge: 'ch_signed_1',
          on_behalf_of: 'acct_seller',
          transfer_group: 'sale:order-1',
          metadata: {
            type: 'sale',
            workspace_id: 'ws-1',
            kloel_order_id: 'order-1',
            split_lines: JSON.stringify([]),
          },
        },
      },
    });

    try {
      const { controller, stripeWebhookProcessor } = buildController();

      await controller.handleStripe(
        {
          body: {} as never,
          rawBody: Buffer.from('{"id":"evt_signed_sale_pi"}'),
          url: '/webhook/payment/stripe',
        },
        't=1,v1=fake',
        undefined,
        {} as never,
      );

      expect(mockConstructEvent).toHaveBeenCalled();
      expect(stripeWebhookProcessor.processSaleSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pi_sale_signed_1',
          latest_charge: 'ch_signed_1',
          on_behalf_of: 'acct_seller',
          transfer_group: 'sale:order-1',
        }),
        expect.any(Function),
      );
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
      process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
    }
  });
});
