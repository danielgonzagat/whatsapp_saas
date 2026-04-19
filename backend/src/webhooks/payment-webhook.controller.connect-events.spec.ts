import { PaymentWebhookController } from './payment-webhook.controller';

describe('PaymentWebhookController.handleStripe — connect reversals and payouts', () => {
  function buildController() {
    const stripeWebhookProcessor = {
      processSaleSucceeded: jest.fn(),
    };
    const connectReversalService = {
      processRefund: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_test_123',
        triggerId: 're_1',
        reversedTransfers: 2,
        ledgerDebits: 2,
        reversedAmountCents: 9_010n,
      }),
      processDispute: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_test_123',
        triggerId: 'dp_1',
        reversedTransfers: 3,
        ledgerDebits: 3,
        reversedAmountCents: 9_010n,
      }),
    };
    const connectPayoutService = {
      handleFailedPayout: jest.fn().mockResolvedValue(undefined),
    };
    const platformPayoutService = {
      handleFailedPayout: jest.fn().mockResolvedValue(undefined),
    };
    const adminAudit = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const platformWallet = {
      readBalance: jest.fn().mockResolvedValue({
        currency: 'BRL',
        availableInCents: 0,
        pendingInCents: 100_000,
        reservedInCents: 0,
        updatedAt: new Date('2026-04-19T00:00:00Z').toISOString(),
      }),
      append: jest.fn().mockResolvedValue(undefined),
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
      connectAccountBalance: {
        findUnique: jest.fn().mockResolvedValue({
          workspaceId: 'ws-1',
          accountType: 'SELLER',
          stripeAccountId: 'acct_seller_1',
        }),
      },
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          order: { workspaceId: 'ws-1' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      checkoutOrder: {
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    );

    return {
      controller,
      prisma,
      webhooksService,
      connectReversalService,
      connectPayoutService,
      platformWallet,
      platformPayoutService,
      adminAudit,
    };
  }

  it('reverses allocations and marks checkout state as refunded on refund.created', async () => {
    const {
      controller,
      prisma,
      webhooksService,
      connectReversalService,
      platformWallet,
      adminAudit,
    } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_refund_created',
          type: 'refund.created',
          data: {
            object: {
              id: 're_1',
              payment_intent: 'pi_test_123',
              amount: 13_990,
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_refund_created',
        type: 'refund.created',
        data: {
          object: {
            id: 're_1',
            payment_intent: 'pi_test_123',
            amount: 13_990,
          },
        },
      } as never,
    );

    expect(connectReversalService.processRefund).toHaveBeenCalledWith({
      paymentIntentId: 'pi_test_123',
      refundId: 're_1',
      amountCents: 13_990n,
    });
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: { status: 'REFUNDED' },
    });
    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'REFUNDED', refundedAt: expect.any(Date) },
    });
    expect(prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_test_123' },
      data: { status: 'refunded' },
    });
    expect(platformWallet.append).toHaveBeenCalledWith({
      direction: 'debit',
      bucket: 'PENDING',
      amountInCents: 4_980n,
      kind: 'REFUND_DEBIT',
      orderId: 'refund:re_1',
      reason: 'stripe_refund_platform_debit',
      metadata: {
        paymentIntentId: 'pi_test_123',
        refundId: 're_1',
        buyerRequestedAmountCents: '13990',
        stakeholderReversedAmountCents: '9010',
      },
    });
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.sale.refund_processed',
      entityType: 'checkout_order',
      entityId: 'order-1',
      details: {
        paymentIntentId: 'pi_test_123',
        orderId: 'order-1',
        workspaceId: 'ws-1',
        triggerId: 're_1',
        requestedAmountCents: '13990',
        stakeholderReversedAmountCents: '9010',
        platformDebitCents: '4980',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('reverses allocations and marks checkout state as chargeback on charge.dispute.created', async () => {
    const {
      controller,
      prisma,
      webhooksService,
      connectReversalService,
      platformWallet,
      adminAudit,
    } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_dispute_created',
          type: 'charge.dispute.created',
          data: {
            object: {
              id: 'dp_1',
              payment_intent: 'pi_test_123',
              amount: 13_990,
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_dispute_created',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_1',
            payment_intent: 'pi_test_123',
            amount: 13_990,
          },
        },
      } as never,
    );

    expect(connectReversalService.processDispute).toHaveBeenCalledWith({
      paymentIntentId: 'pi_test_123',
      disputeId: 'dp_1',
      amountCents: 13_990n,
    });
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: { status: 'CHARGEBACK' },
    });
    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'CHARGEBACK' },
    });
    expect(prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_test_123' },
      data: { status: 'chargeback' },
    });
    expect(platformWallet.append).toHaveBeenCalledWith({
      direction: 'debit',
      bucket: 'PENDING',
      amountInCents: 4_980n,
      kind: 'CHARGEBACK_DEBIT',
      orderId: 'dispute:dp_1',
      reason: 'stripe_chargeback_platform_debit',
      metadata: {
        paymentIntentId: 'pi_test_123',
        disputeId: 'dp_1',
        buyerRequestedAmountCents: '13990',
        stakeholderReversedAmountCents: '9010',
      },
    });
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.sale.chargeback_posted',
      entityType: 'checkout_order',
      entityId: 'order-1',
      details: {
        paymentIntentId: 'pi_test_123',
        orderId: 'order-1',
        workspaceId: 'ws-1',
        triggerId: 'dp_1',
        requestedAmountCents: '13990',
        stakeholderReversedAmountCents: '9010',
        platformDebitCents: '4980',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('recredits the local balance when payout.failed arrives with payout metadata', async () => {
    const { controller, webhooksService, connectPayoutService, adminAudit } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_payout_failed',
          type: 'payout.failed',
          data: {
            object: {
              id: 'po_1',
              amount: 9_010,
              status: 'failed',
              metadata: {
                accountBalanceId: 'cab_1',
                requestId: 'req_1',
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
        id: 'evt_payout_failed',
        type: 'payout.failed',
        data: {
          object: {
            id: 'po_1',
            amount: 9_010,
            status: 'failed',
            metadata: {
              accountBalanceId: 'cab_1',
              requestId: 'req_1',
            },
          },
        },
      } as never,
    );

    expect(connectPayoutService.handleFailedPayout).toHaveBeenCalledWith({
      payoutId: 'po_1',
      accountBalanceId: 'cab_1',
      requestId: 'req_1',
      amountCents: 9_010n,
    });
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.connect.payout_failed',
      entityType: 'connect_account_balance',
      entityId: 'cab_1',
      details: {
        requestId: 'req_1',
        payoutId: 'po_1',
        status: 'failed',
        amountCents: '9010',
        accountBalanceId: 'cab_1',
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller_1',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('acks payout.paid without recrediting balances', async () => {
    const { controller, webhooksService, connectPayoutService, adminAudit } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_payout_paid',
          type: 'payout.paid',
          data: {
            object: {
              id: 'po_2',
              amount: 9_010,
              status: 'paid',
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_payout_paid',
        type: 'payout.paid',
        data: {
          object: {
            id: 'po_2',
            amount: 9_010,
            status: 'paid',
          },
        },
      } as never,
    );

    expect(connectPayoutService.handleFailedPayout).not.toHaveBeenCalled();
    expect(adminAudit.append).not.toHaveBeenCalled();
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('writes a system audit row when payout.paid arrives for a connected account', async () => {
    const { controller, webhooksService, connectPayoutService, adminAudit } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_connect_payout_paid',
          type: 'payout.paid',
          data: {
            object: {
              id: 'po_connect_2',
              amount: 9_010,
              status: 'paid',
              metadata: {
                accountBalanceId: 'cab_1',
                requestId: 'req_2',
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
        id: 'evt_connect_payout_paid',
        type: 'payout.paid',
        data: {
          object: {
            id: 'po_connect_2',
            amount: 9_010,
            status: 'paid',
            metadata: {
              accountBalanceId: 'cab_1',
              requestId: 'req_2',
            },
          },
        },
      } as never,
    );

    expect(connectPayoutService.handleFailedPayout).not.toHaveBeenCalled();
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.connect.payout_paid',
      entityType: 'connect_account_balance',
      entityId: 'cab_1',
      details: {
        requestId: 'req_2',
        payoutId: 'po_connect_2',
        status: 'paid',
        amountCents: '9010',
        accountBalanceId: 'cab_1',
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller_1',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('recredits the platform wallet when payout.failed arrives for the platform account', async () => {
    const { controller, webhooksService, platformPayoutService, adminAudit } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_platform_payout_failed',
          type: 'payout.failed',
          data: {
            object: {
              id: 'po_platform_123',
              amount: 5_000,
              status: 'failed',
              currency: 'brl',
              metadata: {
                platformWallet: 'true',
                platformWalletCurrency: 'BRL',
                requestId: 'platform_po_req_1',
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
        id: 'evt_platform_payout_failed',
        type: 'payout.failed',
        data: {
          object: {
            id: 'po_platform_123',
            amount: 5_000,
            status: 'failed',
            currency: 'brl',
            metadata: {
              platformWallet: 'true',
              platformWalletCurrency: 'BRL',
              requestId: 'platform_po_req_1',
            },
          },
        },
      } as never,
    );

    expect(platformPayoutService.handleFailedPayout).toHaveBeenCalledWith({
      payoutId: 'po_platform_123',
      amountCents: 5_000n,
      requestId: 'platform_po_req_1',
      currency: 'BRL',
    });
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.carteira.payout_failed',
      entityType: 'platform_wallet',
      entityId: 'BRL',
      details: {
        requestId: 'platform_po_req_1',
        payoutId: 'po_platform_123',
        status: 'failed',
        amountCents: '5000',
        currency: 'BRL',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('writes a system audit row when payout.paid arrives for the platform account', async () => {
    const { controller, webhooksService, platformPayoutService, adminAudit } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_platform_payout_paid',
          type: 'payout.paid',
          data: {
            object: {
              id: 'po_platform_456',
              amount: 5_000,
              status: 'paid',
              currency: 'brl',
              metadata: {
                platformWallet: 'true',
                platformWalletCurrency: 'BRL',
                requestId: 'platform_po_req_2',
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
        id: 'evt_platform_payout_paid',
        type: 'payout.paid',
        data: {
          object: {
            id: 'po_platform_456',
            amount: 5_000,
            status: 'paid',
            currency: 'brl',
            metadata: {
              platformWallet: 'true',
              platformWalletCurrency: 'BRL',
              requestId: 'platform_po_req_2',
            },
          },
        },
      } as never,
    );

    expect(platformPayoutService.handleFailedPayout).not.toHaveBeenCalled();
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.carteira.payout_paid',
      entityType: 'platform_wallet',
      entityId: 'BRL',
      details: {
        requestId: 'platform_po_req_2',
        payoutId: 'po_platform_456',
        status: 'paid',
        amountCents: '5000',
        currency: 'BRL',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('debits available platform balance when the fee has already matured out of pending', async () => {
    const { controller, platformWallet } = buildController();
    platformWallet.readBalance.mockResolvedValueOnce({
      currency: 'BRL',
      availableInCents: 4_980,
      pendingInCents: 0,
      reservedInCents: 0,
      updatedAt: new Date('2026-04-19T00:00:00Z').toISOString(),
    });

    await controller.handleStripe(
      {
        body: {
          id: 'evt_refund_available',
          type: 'refund.created',
          data: {
            object: {
              id: 're_available',
              payment_intent: 'pi_test_123',
              amount: 13_990,
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_refund_available',
        type: 'refund.created',
        data: {
          object: {
            id: 're_available',
            payment_intent: 'pi_test_123',
            amount: 13_990,
          },
        },
      } as never,
    );

    expect(platformWallet.append).toHaveBeenCalledWith({
      direction: 'debit',
      bucket: 'AVAILABLE',
      amountInCents: 4_980n,
      kind: 'REFUND_DEBIT',
      orderId: 'refund:re_available',
      reason: 'stripe_refund_platform_debit',
      metadata: {
        paymentIntentId: 'pi_test_123',
        refundId: 're_available',
        buyerRequestedAmountCents: '13990',
        stakeholderReversedAmountCents: '9010',
      },
    });
  });
});
