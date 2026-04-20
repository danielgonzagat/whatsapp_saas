import { PaymentWebhookController } from './payment-webhook.controller';

describe('PaymentWebhookController.handleStripe — checkout payment intents', () => {
  function buildController() {
    const stripeWebhookProcessor = {
      processSaleSucceeded: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_sale_1',
        transfersDispatched: 4,
        ledgerEntriesCreated: 5,
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
            {
              role: 'affiliate',
              accountId: 'acct_affiliate',
              amountCents: 3_604n,
              stripeTransferId: 'tr_affiliate_1',
            },
          ],
        },
      }),
    };
    const autopilot = {
      markConversion: jest.fn().mockResolvedValue(undefined),
      triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
    };
    const whatsapp = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      },
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          order: { workspaceId: 'ws-1' },
          webhookData: {
            splitInput: {
              platformFeeCents: '990',
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
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      kloelSale: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
    };
    const webhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_1' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    };
    const connectReversalService = {
      processRefund: jest.fn(),
      processDispute: jest.fn(),
    };
    const connectPayoutService = {
      handleFailedPayout: jest.fn(),
    };
    const platformWallet = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const platformPayoutService = {
      handleFailedPayout: jest.fn(),
    };
    const adminAudit = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const financialAlert = {
      webhookProcessingFailed: jest.fn(),
    };

    const controller = new PaymentWebhookController(
      autopilot as never,
      whatsapp as never,
      prisma as never,
      redis as never,
      webhooksService as never,
      stripeWebhookProcessor as never,
      connectReversalService as never,
      connectPayoutService as never,
      platformWallet as never,
      platformPayoutService as never,
      adminAudit as never,
      financialAlert as never,
    );

    return {
      controller,
      prisma,
      redis,
      webhooksService,
      autopilot,
      whatsapp,
      stripeWebhookProcessor,
      platformWallet,
      financialAlert,
    };
  }

  it('marks checkout payment/order as paid when payment_intent.succeeded arrives for a Kloel order', async () => {
    const { controller, prisma, webhooksService } = buildController();

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
});
