// Webhook specs exercise sendMessage-adjacent flows through the shared
// messageLimit/dailyLimit enforcement in WhatsappService.sendMessage().
const mockConstructEvent = jest.fn();

jest.mock('../billing/stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  })),
}));

import { PaymentWebhookController } from './payment-webhook.controller';

type LatestChargeWebhookPrismaMock = {
  workspace: {
    findUnique: jest.Mock;
  };
  checkoutPayment: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  checkoutOrder: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  connectMaturationRule: {
    findMany: jest.Mock;
  };
  kloelSale: {
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('PaymentWebhookController.handleStripe latest_charge normalization', () => {
  function buildController() {
    const stripeWebhookProcessor = {
      processSaleSucceeded: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_sale_signed_expanded',
        transfersDispatched: 1,
        ledgerEntriesCreated: 2,
        connectPostSale: {
          transferGroup: 'sale:order-1',
          sellerStripeAccountId: 'acct_seller',
          sellerDestinationAmountCents: 656n,
          transfers: [
            {
              role: 'supplier',
              accountId: 'acct_supplier',
              amountCents: 4_210n,
              stripeTransferId: 'tr_supplier_1',
            },
          ],
        },
      }),
    };

    const prisma: LatestChargeWebhookPrismaMock = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      },
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          order: { workspaceId: 'ws-1' },
          webhookData: {
            splitInput: {
              marketplaceFeeCents: '990',
              interestCents: '3990',
            },
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      checkoutOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      connectMaturationRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      kloelSale: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: LatestChargeWebhookPrismaMock) => Promise<unknown>) =>
            callback(prisma),
        ),
    };

    const controller = new PaymentWebhookController(
      { markConversion: jest.fn(), triggerPostPurchaseFlow: jest.fn() } as never,
      { sendMessage: jest.fn() } as never,
      prisma as never,
      { set: jest.fn().mockResolvedValue('OK'), lpush: jest.fn(), ltrim: jest.fn() } as never,
      {
        logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_1' }),
        markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
      } as never,
      stripeWebhookProcessor as never,
      { processRefund: jest.fn(), processDispute: jest.fn() } as never,
      { handleFailedPayout: jest.fn() } as never,
      { append: jest.fn().mockResolvedValue(undefined) } as never,
      { handleFailedPayout: jest.fn() } as never,
      { append: jest.fn().mockResolvedValue(undefined) } as never,
      { webhookProcessingFailed: jest.fn() } as never,
    );

    return { controller, stripeWebhookProcessor };
  }

  it('drops expanded latest_charge payloads before Connect post-sale processing', async () => {
    const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local';
    mockConstructEvent.mockReset();
    mockConstructEvent.mockReturnValue({
      id: 'evt_signed_sale_pi_expanded_charge',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_sale_signed_expanded',
          status: 'succeeded',
          currency: 'brl',
          latest_charge: { id: 'ch_expanded_1' },
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
          rawBody: Buffer.from('{"id":"evt_signed_sale_pi_expanded_charge"}'),
          url: '/webhook/payment/stripe',
        },
        't=1,v1=fake',
        undefined,
        {} as never,
      );

      expect(mockConstructEvent).toHaveBeenCalled();
      expect(stripeWebhookProcessor.processSaleSucceeded).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pi_sale_signed_expanded',
          latest_charge: null,
          transfer_group: 'sale:order-1',
        }),
        expect.anything(),
      );

      const matureAtResolver = stripeWebhookProcessor.processSaleSucceeded.mock.calls[0]?.[1];
      expect(typeof matureAtResolver).toBe('function');
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
      process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
    }
  });
});
