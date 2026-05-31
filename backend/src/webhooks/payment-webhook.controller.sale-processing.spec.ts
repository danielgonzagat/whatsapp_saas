// Webhook specs exercise sendMessage-adjacent flows through the shared
// messageLimit/dailyLimit enforcement in WhatsappService.sendMessage().
import { buildPaymentWebhookController as buildController } from '../../test/payment-webhook-controller-harness';

type KloelSaleUpdateArgs = {
  where: {
    workspaceId?: string;
    externalPaymentId?: string;
    OR?: Array<{ externalPaymentId?: string; id?: string }>;
  };
  data: {
    status?: string;
    paidAt?: unknown;
    externalPaymentId?: string;
  };
};

type ProcessSaleSucceededCall = [
  paymentIntentArg: { id?: string; transfer_group?: string },
  matureAtForRole: (role: string) => Date,
];

type MockWithCalls = { mock: { calls: unknown[][] } };

function firstMockCall<TArgs extends unknown[]>(mock: MockWithCalls, label: string): TArgs {
  const [call] = mock.mock.calls;
  if (!call) {
    throw new Error(`${label} was not called`);
  }
  return call as TArgs;
}

function firstKloelSaleUpdate(
  prisma: ReturnType<typeof buildController>['prisma'],
): KloelSaleUpdateArgs {
  const [args] = firstMockCall<[KloelSaleUpdateArgs]>(
    prisma.kloelSale.updateMany,
    'kloelSale.updateMany',
  );
  return args;
}

function firstProcessSaleSucceededCall(
  stripeWebhookProcessor: ReturnType<typeof buildController>['stripeWebhookProcessor'],
): ProcessSaleSucceededCall {
  return firstMockCall<ProcessSaleSucceededCall>(
    stripeWebhookProcessor.processSaleSucceeded,
    'processSaleSucceeded',
  );
}

describe('PaymentWebhookController.handleStripe — sale payment intents', () => {
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
        },
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
      },
    );

    expect(prisma.kloelSale.updateMany).toHaveBeenCalledTimes(1);
    const saleUpdate = firstKloelSaleUpdate(prisma);
    expect(saleUpdate.where).toEqual({
      workspaceId: 'ws-1',
      externalPaymentId: 'pi_generic_123',
    });
    expect(saleUpdate.data.status).toBe('paid');
    expect(saleUpdate.data.paidAt).toBeInstanceOf(Date);
  });

  it('reconciles Stripe card payment intents by Kloel sale id metadata', async () => {
    const { controller, prisma } = buildController();

    await controller.handleStripe(
      {
        body: {
          id: 'evt_card_pi_paid',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_card_1',
              status: 'succeeded',
              metadata: {
                type: 'sale',
                workspace_id: 'ws-1',
                workspaceId: 'ws-1',
                kloel_order_id: 'sale-card-1',
                orderId: 'sale-card-1',
                saleId: 'sale-card-1',
                sourceCapability: 'sales.create_card_link',
                payment_method: 'CREDIT_CARD',
              },
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_card_pi_paid',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_card_1',
            status: 'succeeded',
            metadata: {
              type: 'sale',
              workspace_id: 'ws-1',
              workspaceId: 'ws-1',
              kloel_order_id: 'sale-card-1',
              orderId: 'sale-card-1',
              saleId: 'sale-card-1',
              sourceCapability: 'sales.create_card_link',
              payment_method: 'CREDIT_CARD',
            },
          },
        },
      },
    );

    expect(prisma.kloelSale.updateMany).toHaveBeenCalledTimes(1);
    const saleUpdate = firstKloelSaleUpdate(prisma);
    expect(saleUpdate.where).toEqual({
      workspaceId: 'ws-1',
      OR: [{ externalPaymentId: 'pi_card_1' }, { id: 'sale-card-1' }],
    });
    expect(saleUpdate.data.status).toBe('paid');
    expect(saleUpdate.data.externalPaymentId).toBe('pi_card_1');
    expect(saleUpdate.data.paidAt).toBeInstanceOf(Date);
  });

  it('reconciles Stripe checkout sessions by Kloel sale id metadata', async () => {
    const { controller, prisma, autopilot } = buildController();

    await controller.handleStripe(
      {
        body: {
          id: 'evt_card_checkout_paid',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_card_1',
              payment_intent: 'pi_card_1',
              payment_status: 'paid',
              amount_total: 19700,
              currency: 'brl',
              customer_details: { email: 'buyer@example.com' },
              metadata: {
                workspace_id: 'ws-1',
                workspaceId: 'ws-1',
                kloel_order_id: 'sale-card-1',
                orderId: 'sale-card-1',
                saleId: 'sale-card-1',
                productName: 'PDRN',
                sourceCapability: 'sales.create_card_link',
                payment_method: 'CREDIT_CARD',
              },
            },
          },
        },
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_card_checkout_paid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_card_1',
            payment_intent: 'pi_card_1',
            payment_status: 'paid',
            amount_total: 19700,
            currency: 'brl',
            customer_details: { email: 'buyer@example.com' },
            metadata: {
              workspace_id: 'ws-1',
              workspaceId: 'ws-1',
              kloel_order_id: 'sale-card-1',
              orderId: 'sale-card-1',
              saleId: 'sale-card-1',
              productName: 'PDRN',
              sourceCapability: 'sales.create_card_link',
              payment_method: 'CREDIT_CARD',
            },
          },
        },
      },
    );

    expect(prisma.kloelSale.updateMany).toHaveBeenCalledTimes(1);
    const saleUpdate = firstKloelSaleUpdate(prisma);
    expect(saleUpdate.where).toEqual({
      workspaceId: 'ws-1',
      OR: [{ externalPaymentId: 'pi_card_1' }, { id: 'sale-card-1' }],
    });
    expect(saleUpdate.data.status).toBe('paid');
    expect(saleUpdate.data.externalPaymentId).toBe('pi_card_1');
    expect(saleUpdate.data.paidAt).toBeInstanceOf(Date);
    expect(autopilot.markConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        reason: 'stripe_paid',
      }),
    );
  });

  it('dispatches the Connect post-sale processor for sale payment intents using product-specific maturation rules', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T00:00:00Z'));
    try {
      const { controller, prisma, stripeWebhookProcessor, marketplaceTreasury } = buildController();
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
                transfer_group: 'sale:order-1',
                metadata: {
                  type: 'sale',
                  workspace_id: 'ws-1',
                  kloel_order_id: 'order-1',
                  split_lines: JSON.stringify([]),
                },
              },
            },
          },
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
              transfer_group: 'sale:order-1',
              metadata: {
                type: 'sale',
                workspace_id: 'ws-1',
                kloel_order_id: 'order-1',
                split_lines: JSON.stringify([]),
              },
            },
          },
        },
      );

      expect(stripeWebhookProcessor.processSaleSucceeded).toHaveBeenCalledTimes(1);
      const [paymentIntentArg, matureAtForRole] =
        firstProcessSaleSucceededCall(stripeWebhookProcessor);
      expect(paymentIntentArg).toEqual(
        expect.objectContaining({
          id: 'pi_sale_1',
          transfer_group: 'sale:order-1',
        }),
      );
      expect(matureAtForRole('supplier')).toEqual(new Date('2026-05-15T00:00:00Z'));
      expect(matureAtForRole('affiliate')).toEqual(new Date('2026-05-08T00:00:00Z'));
      expect(matureAtForRole('seller')).toEqual(new Date('2026-05-31T00:00:00Z'));
      expect(matureAtForRole('manager')).toEqual(new Date('2026-05-01T00:00:00Z'));
      expect(marketplaceTreasury.append).toHaveBeenCalledWith({
        direction: 'credit',
        bucket: 'PENDING',
        amountInCents: 4_980n,
        kind: 'MARKETPLACE_FEE_CREDIT',
        orderId: 'sale:pi_sale_1',
        reason: 'stripe_sale_marketplace_fee_credit',
        metadata: {
          paymentIntentId: 'pi_sale_1',
          marketplaceFeeCents: '990',
          interestCents: '3990',
        },
      });
      expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
        where: { externalId: 'pi_sale_1' },
        data: {
          webhookData: {
            splitInput: {
              marketplaceFeeCents: '990',
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
    } finally {
      jest.useRealTimers();
    }
  });
});
