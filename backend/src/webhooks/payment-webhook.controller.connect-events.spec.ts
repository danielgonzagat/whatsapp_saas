// Webhook specs exercise sendMessage-adjacent flows through the shared
// messageLimit/dailyLimit enforcement in WhatsappService.sendMessage().
import { buildConnectEventsWebhookController as buildController } from '../../test/payment-webhook-connect-events-harness';

describe('PaymentWebhookController.handleStripe — connect reversals and payouts', () => {
  it('reverses allocations and marks checkout state as refunded on refund.created', async () => {
    const {
      controller,
      prisma,
      webhooksService,
      connectReversalService,
      marketplaceTreasury,
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
    expect(marketplaceTreasury.append).toHaveBeenCalledWith({
      direction: 'debit',
      bucket: 'PENDING',
      amountInCents: 4_980n,
      kind: 'REFUND_DEBIT',
      orderId: 'refund:re_1',
      reason: 'stripe_refund_marketplace_debit',
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
        marketplaceDebitCents: '4980',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('alerts and rethrows when refund reversal fails before the refund state is persisted', async () => {
    const { controller, prisma, connectReversalService, financialAlert } = buildController();
    const reversalError = new Error('reversal exploded');
    connectReversalService.processRefund.mockRejectedValueOnce(reversalError);

    await expect(
      controller.handleStripe(
        {
          body: {
            id: 'evt_refund_created_fail',
            type: 'refund.created',
            data: {
              object: {
                id: 're_fail_1',
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
          id: 'evt_refund_created_fail',
          type: 'refund.created',
          data: {
            object: {
              id: 're_fail_1',
              payment_intent: 'pi_test_123',
              amount: 13_990,
            },
          },
        } as never,
      ),
    ).rejects.toThrow('reversal exploded');

    expect(financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(reversalError, {
      provider: 'stripe',
      externalId: 'pi_test_123',
      eventType: 'refund.created',
    });
    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: { status: 'REFUNDED' },
    });
  });

  it('reverses allocations and marks checkout state as chargeback on charge.dispute.created', async () => {
    const {
      controller,
      prisma,
      webhooksService,
      connectReversalService,
      marketplaceTreasury,
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
    expect(marketplaceTreasury.append).toHaveBeenCalledWith({
      direction: 'debit',
      bucket: 'PENDING',
      amountInCents: 4_980n,
      kind: 'CHARGEBACK_DEBIT',
      orderId: 'dispute:dp_1',
      reason: 'stripe_chargeback_marketplace_debit',
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
        marketplaceDebitCents: '4980',
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

  it('alerts and rethrows when connected payout recovery fails on payout.failed', async () => {
    const { controller, connectPayoutService, financialAlert, adminAudit, webhooksService } =
      buildController();
    const payoutError = new Error('payout recovery exploded');
    connectPayoutService.handleFailedPayout.mockRejectedValueOnce(payoutError);

    await expect(
      controller.handleStripe(
        {
          body: {
            id: 'evt_payout_failed_error',
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
          id: 'evt_payout_failed_error',
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
      ),
    ).rejects.toThrow('payout recovery exploded');

    expect(financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(payoutError, {
      provider: 'stripe',
      externalId: 'po_1',
      eventType: 'payout.failed',
    });
    expect(adminAudit.append).not.toHaveBeenCalled();
    expect(webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
  });
});
