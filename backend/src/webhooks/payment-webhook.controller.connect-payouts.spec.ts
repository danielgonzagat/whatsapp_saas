// Webhook specs exercise sendMessage-adjacent flows through the shared
// messageLimit/dailyLimit enforcement in WhatsappService.sendMessage().
import { buildConnectEventsWebhookController as buildController } from '../../test/payment-webhook-connect-events-harness';

function makeReq(evt: unknown) {
  return { body: evt as never, rawBody: '', url: '/webhook/payment/stripe' };
}

describe('PaymentWebhookController.handleStripe — connect and treasury payout acknowledgements', () => {
  it('acks payout.paid without recrediting balances', async () => {
    const { controller, webhooksService, connectPayoutService, adminAudit } = buildController();
    const evt = {
      id: 'evt_payout_paid',
      type: 'payout.paid',
      data: { object: { id: 'po_2', amount: 9_010, status: 'paid' } },
    };

    const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

    expect(connectPayoutService.handleFailedPayout).not.toHaveBeenCalled();
    expect(adminAudit.append).not.toHaveBeenCalled();
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('writes a system audit row when payout.paid arrives for a connected account', async () => {
    const { controller, webhooksService, connectPayoutService, adminAudit } = buildController();
    const evt = {
      id: 'evt_connect_payout_paid',
      type: 'payout.paid',
      data: {
        object: {
          id: 'po_connect_2',
          amount: 9_010,
          status: 'paid',
          metadata: { accountBalanceId: 'cab_1', requestId: 'req_2' },
        },
      },
    };

    const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

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

  it('recredits the marketplace treasury when payout.failed arrives for the marketplace treasury account', async () => {
    const { controller, webhooksService, marketplaceTreasuryPayoutService, adminAudit } =
      buildController();
    const evt = {
      id: 'evt_marketplace_treasury_payout_failed',
      type: 'payout.failed',
      data: {
        object: {
          id: 'po_marketplace_treasury_123',
          amount: 5_000,
          status: 'failed',
          currency: 'brl',
          metadata: {
            marketplaceTreasury: 'true',
            marketplaceTreasuryCurrency: 'BRL',
            requestId: 'marketplace_treasury_po_req_1',
          },
        },
      },
    };

    const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

    expect(marketplaceTreasuryPayoutService.handleFailedPayout).toHaveBeenCalledWith({
      payoutId: 'po_marketplace_treasury_123',
      amountCents: 5_000n,
      requestId: 'marketplace_treasury_po_req_1',
      currency: 'BRL',
    });
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.carteira.payout_failed',
      entityType: 'marketplace_treasury',
      entityId: 'BRL',
      details: {
        requestId: 'marketplace_treasury_po_req_1',
        payoutId: 'po_marketplace_treasury_123',
        status: 'failed',
        amountCents: '5000',
        currency: 'BRL',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('writes a system audit row when payout.paid arrives for the marketplace treasury account', async () => {
    const { controller, webhooksService, marketplaceTreasuryPayoutService, adminAudit } =
      buildController();
    const evt = {
      id: 'evt_marketplace_treasury_payout_paid',
      type: 'payout.paid',
      data: {
        object: {
          id: 'po_marketplace_treasury_456',
          amount: 5_000,
          status: 'paid',
          currency: 'brl',
          metadata: {
            marketplaceTreasury: 'true',
            marketplaceTreasuryCurrency: 'BRL',
            requestId: 'marketplace_treasury_po_req_2',
          },
        },
      },
    };

    const result = await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

    expect(marketplaceTreasuryPayoutService.handleFailedPayout).not.toHaveBeenCalled();
    expect(adminAudit.append).toHaveBeenCalledWith({
      action: 'system.carteira.payout_paid',
      entityType: 'marketplace_treasury',
      entityId: 'BRL',
      details: {
        requestId: 'marketplace_treasury_po_req_2',
        payoutId: 'po_marketplace_treasury_456',
        status: 'paid',
        amountCents: '5000',
        currency: 'BRL',
      },
    });
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('debits available marketplace treasury balance when the fee has already matured out of pending', async () => {
    const { controller, marketplaceTreasury } = buildController();
    marketplaceTreasury.readBalance.mockResolvedValueOnce({
      currency: 'BRL',
      availableInCents: 4_980,
      pendingInCents: 0,
      reservedInCents: 0,
      updatedAt: new Date('2026-04-19T00:00:00Z').toISOString(),
    });
    const evt = {
      id: 'evt_refund_available',
      type: 'refund.created',
      data: {
        object: { id: 're_available', payment_intent: 'pi_test_123', amount: 13_990 },
      },
    };

    await controller.handleStripe(makeReq(evt), undefined, undefined, evt);

    expect(marketplaceTreasury.append).toHaveBeenCalledWith({
      direction: 'debit',
      bucket: 'AVAILABLE',
      amountInCents: 4_980n,
      kind: 'REFUND_DEBIT',
      orderId: 'refund:re_available',
      reason: 'stripe_refund_marketplace_debit',
      metadata: {
        paymentIntentId: 'pi_test_123',
        refundId: 're_available',
        buyerRequestedAmountCents: '13990',
        stakeholderReversedAmountCents: '9010',
      },
    });
  });
});
