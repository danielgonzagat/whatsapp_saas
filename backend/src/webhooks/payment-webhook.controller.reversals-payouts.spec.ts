// Webhook specs exercise sendMessage-adjacent flows through the shared
// messageLimit/dailyLimit enforcement in WhatsappService.sendMessage().
import { buildPaymentWebhookController as buildController } from '../../test/payment-webhook-controller-harness';

describe('PaymentWebhookController.handleStripe — sale reversals and payouts', () => {
  it('processes refund.created by reversing stakeholder transfers, debiting marketplace residue, and updating local sale state', async () => {
    const {
      controller,
      prisma,
      connectReversalService,
      marketplaceTreasury,
      adminAudit,
      webhooksService,
    } = buildController();
    connectReversalService.processRefund.mockResolvedValueOnce({
      paymentIntentId: 'pi_refund_1',
      triggerId: 're_1',
      reversedTransfers: 2,
      ledgerDebits: 2,
      reversedAmountCents: 3_000n,
    });

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_refund_created',
          type: 'refund.created',
          data: {
            object: {
              id: 're_1',
              payment_intent: 'pi_refund_1',
              amount: 5_000,
            },
          },
        },
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
            payment_intent: 'pi_refund_1',
            amount: 5_000,
          },
        },
      } as never,
    );

    expect(connectReversalService.processRefund).toHaveBeenCalledWith({
      paymentIntentId: 'pi_refund_1',
      refundId: 're_1',
      amountCents: 5_000n,
    });
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_refund_1' },
      data: { status: 'REFUNDED' },
    });
    const refundOrderUpdate = prisma.checkoutOrder.updateMany.mock.calls[0]?.[0];
    expect(refundOrderUpdate).toEqual(
      expect.objectContaining({
        where: { id: 'order-1', workspaceId: 'ws-1' },
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }),
    );
    expect(refundOrderUpdate.data.refundedAt).toBeInstanceOf(Date);
    expect(prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_refund_1' },
      data: { status: 'refunded' },
    });
    expect(marketplaceTreasury.append).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'debit',
        kind: 'REFUND_DEBIT',
        amountInCents: 2_000n,
      }),
    );
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.sale.refund_processed',
      entityType: 'checkout_order',
      entityId: 'order-1',
      details: {
        paymentIntentId: 'pi_refund_1',
        orderId: 'order-1',
        workspaceId: 'ws-1',
        triggerId: 're_1',
        requestedAmountCents: '5000',
        stakeholderReversedAmountCents: '3000',
        marketplaceDebitCents: '2000',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('processes charge.dispute.created by posting a chargeback reversal and updating local statuses', async () => {
    const {
      controller,
      prisma,
      connectReversalService,
      marketplaceTreasury,
      adminAudit,
      webhooksService,
    } = buildController();
    connectReversalService.processDispute.mockResolvedValueOnce({
      paymentIntentId: 'pi_dispute_1',
      triggerId: 'dp_1',
      reversedTransfers: 2,
      ledgerDebits: 2,
      reversedAmountCents: 4_000n,
    });

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_dispute_created',
          type: 'charge.dispute.created',
          data: {
            object: {
              id: 'dp_1',
              payment_intent: 'pi_dispute_1',
              amount: 5_500,
            },
          },
        },
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
            payment_intent: 'pi_dispute_1',
            amount: 5_500,
          },
        },
      } as never,
    );

    expect(connectReversalService.processDispute).toHaveBeenCalledWith({
      paymentIntentId: 'pi_dispute_1',
      disputeId: 'dp_1',
      amountCents: 5_500n,
    });
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_dispute_1' },
      data: { status: 'CHARGEBACK' },
    });
    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'CHARGEBACK' },
    });
    expect(prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_dispute_1' },
      data: { status: 'chargeback' },
    });
    expect(marketplaceTreasury.append).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'debit',
        kind: 'CHARGEBACK_DEBIT',
        amountInCents: 1_500n,
      }),
    );
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.sale.chargeback_posted',
      entityType: 'checkout_order',
      entityId: 'order-1',
      details: {
        paymentIntentId: 'pi_dispute_1',
        orderId: 'order-1',
        workspaceId: 'ws-1',
        triggerId: 'dp_1',
        requestedAmountCents: '5500',
        stakeholderReversedAmountCents: '4000',
        marketplaceDebitCents: '1500',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('reverts a failed connect payout and records the payout audit entry', async () => {
    const { controller, connectPayoutService, adminAudit, webhooksService } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_payout_failed_connect',
          type: 'payout.failed',
          data: {
            object: {
              id: 'po_connect_1',
              amount: 4_200,
              metadata: {
                accountBalanceId: 'cab_seller_1',
                requestId: 'req_connect_1',
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
        id: 'evt_payout_failed_connect',
        type: 'payout.failed',
        data: {
          object: {
            id: 'po_connect_1',
            amount: 4_200,
            metadata: {
              accountBalanceId: 'cab_seller_1',
              requestId: 'req_connect_1',
            },
          },
        },
      } as never,
    );

    expect(connectPayoutService.handleFailedPayout).toHaveBeenCalledWith({
      payoutId: 'po_connect_1',
      accountBalanceId: 'cab_seller_1',
      requestId: 'req_connect_1',
      amountCents: 4_200n,
    });
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.connect.payout_failed',
      entityType: 'connect_account_balance',
      entityId: 'cab_seller_1',
      details: {
        requestId: 'req_connect_1',
        payoutId: 'po_connect_1',
        status: 'failed',
        amountCents: '4200',
        accountBalanceId: 'cab_seller_1',
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller_1',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('records paid marketplace-treasury payouts without routing them through connect payout recovery', async () => {
    const {
      controller,
      connectPayoutService,
      marketplaceTreasuryPayoutService,
      adminAudit,
      webhooksService,
    } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_payout_paid_marketplace_treasury',
          type: 'payout.paid',
          data: {
            object: {
              id: 'po_marketplace_treasury_1',
              amount: 8_800,
              currency: 'brl',
              metadata: {
                marketplaceTreasury: 'true',
                marketplaceTreasuryCurrency: 'BRL',
                requestId: 'req_marketplace_treasury_1',
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
        id: 'evt_payout_paid_marketplace_treasury',
        type: 'payout.paid',
        data: {
          object: {
            id: 'po_marketplace_treasury_1',
            amount: 8_800,
            currency: 'brl',
            metadata: {
              marketplaceTreasury: 'true',
              marketplaceTreasuryCurrency: 'BRL',
              requestId: 'req_marketplace_treasury_1',
            },
          },
        },
      } as never,
    );

    expect(connectPayoutService.handleFailedPayout).not.toHaveBeenCalled();
    expect(marketplaceTreasuryPayoutService.handleFailedPayout).not.toHaveBeenCalled();
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.carteira.payout_paid',
      entityType: 'marketplace_treasury',
      entityId: 'BRL',
      details: {
        requestId: 'req_marketplace_treasury_1',
        payoutId: 'po_marketplace_treasury_1',
        status: 'paid',
        amountCents: '8800',
        currency: 'BRL',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });
});
